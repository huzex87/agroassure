import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Paged } from "../lib/paging";

/**
 * Previous and next under a long list, with where you are. Plain links, so a
 * page is a URL that can be shared and the back button works. Renders nothing
 * when everything fits on one page.
 */
export function Pagination({ paged, hrefFor }: { paged: Paged<unknown>; hrefFor: (page: number) => string }) {
  if (paged.pages <= 1) return null;
  const link =
    "inline-flex h-8 items-center gap-1 rounded-control border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:border-primary-200";
  const off = "inline-flex h-8 items-center gap-1 rounded-control border border-border px-3 text-sm text-ink-faint";
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
      <p className="tabular text-sm text-ink-muted">
        Showing {paged.from}–{paged.to} of {paged.total}
      </p>
      <div className="flex items-center gap-2">
        {paged.page > 1 ? (
          <Link href={hrefFor(paged.page - 1)} className={link} rel="prev">
            <ChevronLeft className="size-4" aria-hidden /> Previous
          </Link>
        ) : (
          <span className={off} aria-disabled="true">
            <ChevronLeft className="size-4" aria-hidden /> Previous
          </span>
        )}
        <span className="tabular text-sm text-ink-muted">
          Page {paged.page} of {paged.pages}
        </span>
        {paged.page < paged.pages ? (
          <Link href={hrefFor(paged.page + 1)} className={link} rel="next">
            Next <ChevronRight className="size-4" aria-hidden />
          </Link>
        ) : (
          <span className={off} aria-disabled="true">
            Next <ChevronRight className="size-4" aria-hidden />
          </span>
        )}
      </div>
    </nav>
  );
}
