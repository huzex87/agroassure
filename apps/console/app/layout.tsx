import type { Metadata } from "next";
import Link from "next/link";
import { Plus_Jakarta_Sans, IBM_Plex_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { signOut } from "../lib/session-actions";
import { SideNav, TopNav } from "../components/nav";
import { tryGet, type Me } from "../lib/api";
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
  description:
    "Compliance and inspection oversight for the fertilizer and agro-input value chain.",
};

/**
 * The mark: a leaf with a check through it. Agriculture and assurance in one
 * glyph, drawn in the product blue on a rounded tile so it reads at 32px and
 * still reads in a browser tab.
 */
function Mark({ className }: { className: string }) {
  return (
    <span
      aria-hidden
      className={`grid ${className} shrink-0 place-items-center rounded-[10px] bg-primary text-white shadow-raised ring-1 ring-inset ring-white/20`}
    >
      <svg viewBox="0 0 20 20" width="62%" height="62%" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16.5 3.5c-6.5 0-11 3-11 8 0 1.6.5 3 1.5 4 5 0 9.5-3.5 9.5-12Z" />
        <path d="M3.5 17c1.5-3 3.5-5.5 6-7.5" />
        <path d="m9.2 11.4 1.6 1.6 3-3.4" />
      </svg>
    </span>
  );
}

function Wordmark({ size = "sm" }: { size?: "sm" | "md" }) {
  return (
    <>
      <Mark className={size === "md" ? "size-10" : "size-8"} />
      <span className={`${size === "md" ? "text-lg" : "text-[0.9375rem]"} font-semibold tracking-tight text-ink`}>
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
        <body className="survey-grid grid min-h-screen place-items-center px-5 py-10">
          <div className="page-enter w-full max-w-[26rem]">
            <div className="mb-8 flex flex-col items-center gap-3 text-center">
              <div className="flex items-center gap-2.5">
                <Wordmark size="md" />
              </div>
              <p className="max-w-xs text-sm leading-relaxed text-ink-muted">
                Inspections, findings and certificates for fertilizer and agro-input businesses.
              </p>
            </div>
            {children}
            <p className="mx-auto mt-8 max-w-sm text-center text-xs leading-relaxed text-ink-faint">
              Records and renders compliance certificates on behalf of the mandated
              regulator. It does not issue them.
            </p>
          </div>
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
            className="sticky top-0 hidden h-screen w-[15.5rem] shrink-0 flex-col overflow-y-auto border-r border-line bg-surface px-3 py-5 md:flex"
          >
            <Link
              href="/"
              className="mb-7 flex items-center gap-2.5 rounded-control px-2 py-1 transition-colors hover:bg-surface-sunk"
            >
              <Wordmark />
            </Link>

            <SideNav roles={roles} />

            {/* Pushed to the bottom: the account is not a destination, it is
                where you leave from. */}
            <div className="mt-auto pt-8">
              {me ? (
                <div className="mb-2 flex items-center gap-2.5 rounded-control px-3 py-2">
                  <span
                    aria-hidden
                    className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700 ring-1 ring-inset ring-primary-100"
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
                    <span className="block truncate text-sm font-medium text-ink">{me.fullName}</span>
                    <span className="block truncate text-xs text-ink-muted">
                      {me.jurisdictionName ?? "All states"}
                    </span>
                  </span>
                </div>
              ) : null}
              <form action={signOut}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-surface-sunk hover:text-ink"
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
                    className="shrink-0 text-ink-faint"
                  >
                    <path d="M6 14H3.5A1.5 1.5 0 0 1 2 12.5v-9A1.5 1.5 0 0 1 3.5 2H6" />
                    <path d="M10.5 11 14 8l-3.5-3M14 8H6" />
                  </svg>
                  Sign out
                </button>
              </form>

              <p className="mt-4 border-t border-line px-3 pt-4 text-[0.6875rem] leading-relaxed text-ink-faint">
                Records and renders compliance certificates on behalf of the mandated
                regulator. It does not issue them.
              </p>
            </div>
          </nav>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="sticky top-0 z-30 md:hidden">
              <TopNav roles={roles} />
            </div>
            <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 md:px-8 md:py-8">
              <div className="page-enter mx-auto flex w-full max-w-[80rem] flex-col gap-7">{children}</div>
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
