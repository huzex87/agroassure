import { describe, expect, it } from "vitest";
import { staffSignInUrl, staffWelcomeEmail } from "../src/console/staff-welcome";

// What a newly added colleague is told. The link must land on the sign-in page
// with their address filled in, and must not be a one-time sign-in link: this
// message can be opened days later.

describe("the staff welcome email", () => {
  it("points at the sign-in page with the address filled in", () => {
    expect(staffSignInUrl("https://console.example.ng", "a.bello@agency.gov.ng")).toBe(
      "https://console.example.ng/signin?email=a.bello%40agency.gov.ng",
    );
    expect(staffSignInUrl("https://console.example.ng/", "a@b.ng")).toBe(
      "https://console.example.ng/signin?email=a%40b.ng",
    );
  });

  it("greets them by first name and names their role", () => {
    const mail = staffWelcomeEmail("Aisha Bello", "a reviewer", "https://c.ng/signin?email=a%40b.ng");
    expect(mail.subject).toBe("You've been added to AgroAssure");
    expect(mail.text).toContain("Hello Aisha");
    expect(mail.text).toContain("as a reviewer");
    expect(mail.text).toContain("https://c.ng/signin?email=a%40b.ng");
    expect(mail.html).toContain("Welcome, Aisha");
  });

  it("escapes a name that tries to be markup", () => {
    const mail = staffWelcomeEmail('<script>alert(1)</script> Bello', "an auditor", "https://c.ng/signin");
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });
});
