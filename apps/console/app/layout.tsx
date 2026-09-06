import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { signOut } from "../lib/session-actions";
import { SideNav, TopNav } from "../components/nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgroAssure · Regulator console",
  description:
    "Compliance and inspection oversight for the fertilizer and agro-input value chain.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const signedIn = Boolean((await cookies()).get("agroassure_session"));

  // Signed out, there is nothing to navigate to. The rail was rendering anyway
  // — seven links that bounce straight back here, and a "sign out" for a
  // session that does not exist. A sign-in page is one card and nothing else.
  if (!signedIn) {
    return (
      <html lang="en">
        <body className="grid min-h-screen place-items-center px-5 py-10">
          <div className="w-full max-w-md">
            <div className="mb-6 flex items-center justify-center gap-2">
              <span
                aria-hidden
                className="grid h-9 w-9 place-items-center rounded-[10px] bg-primary text-base font-bold text-white"
              >
                A
              </span>
              <span className="text-base font-semibold text-ink">AgroAssure</span>
            </div>
            {children}
            <p className="mt-6 text-center text-xs leading-relaxed text-ink-muted">
              Records and renders compliance certificates on behalf of the mandated
              regulator. It does not issue them.
            </p>
          </div>
        </body>
      </html>
    );
  }

  return (
    <html lang="en">
      <body className="min-h-screen">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-[12px] focus:bg-white focus:px-4 focus:py-2 focus:shadow"
        >
          Skip to content
        </a>

        <div className="mx-auto flex min-h-screen w-full max-w-[100rem]">
          <nav
            aria-label="Sections"
            className="hidden w-60 shrink-0 border-r border-line bg-white px-4 py-6 md:block"
          >
            <Link href="/" className="mb-8 flex items-center gap-2 px-2">
              <span
                aria-hidden
                className="grid h-8 w-8 place-items-center rounded-[10px] bg-primary text-sm font-bold text-white"
              >
                A
              </span>
              <span className="text-sm font-semibold text-ink">AgroAssure</span>
            </Link>

            <SideNav />

            <form action={signOut} className="mt-8 px-3">
              <button
                type="submit"
                className="rounded-[12px] px-3 py-2 text-sm text-ink-muted hover:bg-primary-50 hover:text-ink"
              >
                Sign out
              </button>
            </form>

            <p className="mt-10 px-3 text-xs leading-relaxed text-ink-muted">
              Records and renders compliance certificates on behalf of the mandated
              regulator. It does not issue them.
            </p>
          </nav>

          <div className="flex min-w-0 flex-1 flex-col">
            <TopNav />
            <main id="main" className="min-w-0 flex-1 px-5 py-6 md:px-8">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
