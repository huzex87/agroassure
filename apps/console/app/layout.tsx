import type { Metadata } from "next";
import Link from "next/link";
import { Plus_Jakarta_Sans, IBM_Plex_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { signOut } from "../lib/session-actions";
import { SideNav, TopNav } from "../components/nav";
import { tryGet, type Me } from "../lib/api";
import { accountLine } from "../lib/roles";
import { ToastProvider } from "../components/toast";
import { QuickFind } from "../components/quick-find";
import "./globals.css";

// Two faces, each doing one job.
//
// Plus Jakarta Sans for everything a person reads: it holds its shape at the
// small sizes a dense table needs and has enough character at display weight
// that headings do not need a second family. IBM Plex Mono for the things a
// person reads aloud or types back — licence numbers, references, hashes —
// where a fixed advance stops 0 and O being an argument.
const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jakarta",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AgroAssure · Regulator console",
  description: "Compliance and inspection oversight for the fertilizer and agro-input value chain.",
};

/**
 * The mark: a solid leaf with a check cut out of it, and a gold stem. Growth and
 * assurance in one glyph. It is a filled shape, not outlines, so it still reads
 * at the 16 pixels of a browser tab. On a light surface it sits on a pine tile;
 * on the pine rail it stands alone, because the tile would vanish into it.
 */
function Mark({ className, tile = false }: { className: string; tile?: boolean }) {
  return (
    <svg aria-hidden viewBox={tile ? "0 0 32 32" : "3 4 26 26"} fill="none" className={`${className} shrink-0`}>
      {tile ? <rect width="32" height="32" rx="8" className="fill-pine" /> : null}
      <path d="M7.5 24.5C7.5 13.5 13.5 7 24.5 7c0 11-6.2 17.5-17 17.5Z" className="fill-brand" />
      <path d="M7.5 24.5 4.8 27.2" className="stroke-millet" strokeWidth="2.2" strokeLinecap="round" />
      <path
        d="m12.4 17.6 2.9 2.9 5.4-6.2"
        className="stroke-pine"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Wordmark({ size = "sm", onDark = false }: { size?: "sm" | "md"; onDark?: boolean }) {
  return (
    <>
      <Mark className={size === "md" ? "size-10" : "size-8"} tile={!onDark} />
      <span
        className={`${size === "md" ? "text-lg" : "text-[0.9375rem]"} font-bold tracking-tight ${
          onDark ? "text-white" : "text-ink"
        }`}
      >
        AgroAssure
      </span>
    </>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const signedIn = Boolean((await cookies()).get("agroassure_session"));
  const fonts = `${sans.variable} ${mono.variable}`;

  // Signed out, there is nothing to navigate to. The rail was rendering anyway
  // — seven links that bounce straight back here, and a "sign out" for a
  // session that does not exist. A sign-in page is one card and nothing else.
  if (!signedIn) {
    return (
      <html lang="en" className={fonts}>
        <body className="min-h-screen bg-background lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          {/* The brand panel. It says what this is in one line and why it can be
              trusted in three, and it is the first colour a client meets. */}
          <aside className="furrows relative hidden flex-col justify-between overflow-hidden bg-pine p-12 text-white lg:flex xl:p-16">
            <div className="flex items-center gap-2.5">
              <Wordmark onDark />
            </div>
            <div>
              <span aria-hidden className="mb-6 block h-1 w-12 rounded-full bg-millet" />
              <h2 className="text-balance text-4xl leading-[1.1] font-extrabold tracking-tight xl:text-5xl">
                The field,
                <br />
                assured.
              </h2>
              <p className="mt-5 max-w-md text-lg leading-relaxed text-white/75">
                Inspections, findings and certificates for fertilizer and agro-input businesses.
              </p>
              <ul className="mt-10 grid max-w-md gap-4 text-[0.9375rem] leading-relaxed text-white/85">
                {[
                  "Every inspection is signed by the phone that made it.",
                  "Photos and signatures are kept where they cannot be changed.",
                  "Anyone can check a certificate by scanning its code.",
                ].map((line) => (
                  <li key={line} className="flex gap-3">
                    <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-millet" />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
            <p className="max-w-md text-xs leading-relaxed text-white/55">
              Records and renders compliance certificates on behalf of the mandated regulator. It does not issue them.
            </p>
          </aside>

          <main className="grid min-h-screen place-items-center px-5 py-10">
            <div className="page-enter w-full max-w-[26rem]">
              <div className="mb-8 flex items-center gap-2.5 lg:hidden">
                <Wordmark />
              </div>
              {children}
              <p className="mt-8 text-center text-xs leading-relaxed text-ink-faint lg:hidden">
                Records and renders compliance certificates on behalf of the mandated regulator. It does not issue them.
              </p>
            </div>
          </main>
        </body>
      </html>
    );
  }

  // Who is signed in, for the menu and the name at its foot. Asked of the
  // gateway rather than read out of the token, because a provider's token
  // names roles in its own claim format and the gateway already knows how to
  // read it.
  const me = await tryGet<Me>("/v1/me");
  const roles = me?.roles ?? null;

  return (
    <html lang="en" className={fonts}>
      <body className="min-h-screen">
        <ToastProvider>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-surface focus:px-4 focus:py-2 focus:shadow-overlay"
          >
            Skip to content
          </a>

          <div className="mx-auto flex min-h-screen w-full max-w-[100rem]">
            {/* The rail scrolls itself: it is taller than a laptop viewport once the
              sign-out and the disclaimer sit at its foot, and it was clipping them. */}
            <nav
              aria-label="Sections"
              className="sticky top-0 hidden h-screen w-[15.5rem] shrink-0 flex-col overflow-y-auto bg-pine px-3 py-5 text-white md:flex"
            >
              <Link
                href="/"
                className="mb-7 flex items-center gap-2.5 rounded-control px-2 py-1 transition-colors hover:bg-white/5"
              >
                <Wordmark onDark />
              </Link>

              {/* Whose programme this is. A regulator's staff expect their own name on
                their own tool; AgroAssure stays small beside it. */}
              {me?.authority ? (
                <div className="mb-5 flex items-center gap-2.5 rounded-control border border-pine-line bg-white/5 px-3 py-2">
                  {me.authority.markUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={me.authority.markUrl} alt="" className="size-7 shrink-0 object-contain" />
                  ) : null}
                  <span className="min-w-0">
                    <span className="block text-[0.6875rem] font-semibold tracking-[0.08em] text-white/55 uppercase">
                      Programme of
                    </span>
                    <span className="block truncate text-sm font-medium text-white">{me.authority.name}</span>
                  </span>
                </div>
              ) : null}

              <QuickFind roles={roles} />

              <SideNav roles={roles} />

              {/* Pushed to the bottom: the account is not a destination, it is
                where you leave from. */}
              <div className="mt-auto pt-8">
                {me ? (
                  <div className="mb-2 flex items-center gap-2.5 rounded-control px-3 py-2">
                    <span
                      aria-hidden
                      className="grid size-8 shrink-0 place-items-center rounded-full bg-millet text-xs font-bold text-pine"
                    >
                      {me.fullName
                        .split(/\s+/)
                        .filter(Boolean)
                        .map((p) => p[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase() || "?"}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-white">{me.fullName}</span>
                      <span className="block truncate text-xs text-white/60">
                        {accountLine(me.roles, me.jurisdictionName)}
                      </span>
                    </span>
                  </div>
                ) : null}
                <form action={signOut}>
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-white"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                      className="shrink-0 text-white/50"
                    >
                      <path d="M6 14H3.5A1.5 1.5 0 0 1 2 12.5v-9A1.5 1.5 0 0 1 3.5 2H6" />
                      <path d="M10.5 11 14 8l-3.5-3M14 8H6" />
                    </svg>
                    Sign out
                  </button>
                </form>
              </div>
            </nav>

            <div className="flex min-w-0 flex-1 flex-col">
              <div className="sticky top-0 z-30 md:hidden">
                <TopNav roles={roles} />
              </div>
              <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 md:px-8 md:py-8">
                <div className="page-enter mx-auto flex w-full max-w-[80rem] flex-col gap-7">{children}</div>
                {/* Said once, at the foot of the page, instead of taking room in
                  the rail on every screen. */}
                <p className="mx-auto mt-10 w-full max-w-[80rem] border-t border-line pt-4 text-xs leading-relaxed text-ink-faint">
                  AgroAssure records and renders compliance certificates on behalf of the mandated regulator. It does
                  not issue them.
                </p>
              </main>
            </div>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
