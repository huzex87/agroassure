// Browser smoke test: build the console, start it against the stub gateway, and
// click through the paths a regulator uses on day one. It catches what unit
// tests cannot — a page that compiles and then throws on first render, a
// layout that renders blank, a theme that flashes the wrong colours.
//
//   pnpm --filter @agroassure/console run build && pnpm --filter @agroassure/console run smoke
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const CONSOLE = 3100;
const STUB = 3101;
const base = `http://localhost:${CONSOLE}`;
const children = [];

function start(cmd, args, env) {
  // Own process group, so stopping `npx` also stops the server it started.
  const child = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: "ignore", detached: true });
  children.push(child);
  return child;
}

async function waitFor(url) {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${url} never came up`);
}

let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`ok    ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}\n      ${String(e.message ?? e).split("\n")[0]}`);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

try {
  start("node", ["e2e/stub-gateway.mjs"], { STUB_PORT: String(STUB) });
  start("npx", ["next", "start", "-p", String(CONSOLE)], { AGROASSURE_API_URL: `http://localhost:${STUB}` });
  await waitFor(`http://localhost:${STUB}/v1/me`);
  await waitFor(`${base}/signin`);

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--no-sandbox"],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
  const page = await ctx.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));

  await check("sign-in page offers an email link and shows the brand", async () => {
    await page.goto(`${base}/signin`);
    await page.getByRole("button", { name: "Email me a sign-in link" }).waitFor({ timeout: 10000 });
    assert(await page.getByText(/The field,\s*assured\./).isVisible(), "brand panel missing");
  });

  // The console only checks that a session cookie exists; the gateway decides
  // whether it is valid, and the stub accepts anything.
  await ctx.addCookies([{ name: "agroassure_session", value: "aaa.bbb.ccc", url: base }]);

  await check("home greets the signed-in person and lists the sections", async () => {
    await page.goto(base);
    await page.getByRole("heading", { level: 1, name: /Good (morning|afternoon|evening)/ }).waitFor({ timeout: 10000 });
    for (const name of ["Home", "Visits", "Inspections", "Findings", "Facilities", "Settings", "Help"]) {
      assert(await page.getByRole("link", { name, exact: true }).first().isVisible(), `nav link ${name} missing`);
    }
  });

  for (const path of ["/facilities", "/facilities/f-0", "/inspections", "/inspections/i-0", "/findings", "/plan", "/team", "/settings", "/executive", "/help"]) {
    await check(`${path} renders`, async () => {
      const res = await page.goto(base + path);
      assert(res && res.status() === 200, `status ${res?.status()}`);
      await page.locator("h1").first().waitFor({ timeout: 10000 });
    });
  }

  await check("the facility registry downloads as a spreadsheet", async () => {
    const res = await ctx.request.get(`${base}/api/facilities/export`);
    assert(res.status() === 200, `status ${res.status()}`);
    assert((res.headers()["content-type"] ?? "").startsWith("text/csv"), "not a CSV");
    const body = await res.text();
    assert(body.includes("Licence number,Business") && body.split("\r\n").length > 2, "no rows");
  });

  await check("Ctrl+K opens quick find", async () => {
    await page.goto(base, { waitUntil: "networkidle" }); // the shortcut binds once the page hydrates
    await page.keyboard.press("Control+k");
    await page.getByRole("dialog", { name: "Search" }).waitFor({ timeout: 5000 });
    await page.keyboard.press("Escape");
  });

  await check("dark mode toggles, sticks across a reload, and changes the page colour", async () => {
    await page.goto(base);
    const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const light = await bg();
    await page.getByRole("button", { name: "Dark mode" }).click();
    assert((await page.locator("html").getAttribute("data-theme")) === "dark", "data-theme not set");
    assert((await bg()) !== light, "background did not change");
    await page.reload();
    assert((await page.locator("html").getAttribute("data-theme")) === "dark", "choice lost on reload");
    await page.getByRole("button", { name: "Light mode" }).click();
    assert((await page.locator("html").getAttribute("data-theme")) === "light", "could not switch back");
  });

  await check("no script errors on any page", async () => {
    assert(problems.length === 0, problems[0]);
  });

  await browser.close();
} finally {
  for (const c of children) {
    try {
      process.kill(-c.pid);
    } catch {
      // already gone
    }
  }
}

if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nsmoke test passed");
process.exit(0);
