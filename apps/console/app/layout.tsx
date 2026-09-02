import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgroAssure · Regulator console",
  description:
    "Compliance and inspection oversight for the fertilizer and agro-input value chain.",
};

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/facilities", label: "Facilities" },
  { href: "/inspections", label: "Inspections" },
  { href: "/findings", label: "Corrective actions" },
  { href: "/instruments", label: "Instruments" },
  { href: "/admin", label: "Users and devices" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
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

            <ul className="space-y-1">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="block rounded-[12px] px-3 py-2 text-sm text-ink-muted hover:bg-primary-50 hover:text-ink"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>

            <p className="mt-10 px-3 text-xs leading-relaxed text-ink-muted">
              Records and renders compliance certificates on behalf of the mandated
              regulator. It does not issue them.
            </p>
          </nav>

          <main id="main" className="min-w-0 flex-1 px-5 py-6 md:px-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
