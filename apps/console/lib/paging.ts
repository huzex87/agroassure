// One page of a long list. The gateway returns the whole filtered list and the
// console slices it, which is comfortable into the low thousands of rows; past
// that, move the limit and offset into the gateway query.
// ponytail: client-side slice, server paging when a registry outgrows a few thousand.

export const PAGE_SIZE = 50;

/** A page number from the address bar: anything that is not a positive whole number is page 1. */
export function pageParam(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export interface Paged<T> {
  items: T[];
  page: number;
  pages: number;
  total: number;
  /** 1-based position of the first and last row shown, for "Showing 51–100 of 214". */
  from: number;
  to: number;
}

/** Slices one page, clamping a page number that is past the end to the last page. */
export function paginate<T>(all: T[], requested: number, size = PAGE_SIZE): Paged<T> {
  const pages = Math.max(1, Math.ceil(all.length / size));
  const page = Math.min(Math.max(1, requested), pages);
  const start = (page - 1) * size;
  const items = all.slice(start, start + size);
  return {
    items,
    page,
    pages,
    total: all.length,
    from: items.length ? start + 1 : 0,
    to: start + items.length,
  };
}
