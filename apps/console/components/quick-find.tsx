"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { ArrowRight, Building2, CornerDownLeft, Search } from "lucide-react";
import { destinationsFor, matchDestinations } from "../lib/quick-find";

// Jump to a page or a facility without taking your hands off the keyboard.
// Opens on Ctrl or Cmd + K, or "/" when you are not typing somewhere. Pages are
// matched as you type; facilities are looked up by the gateway, so what appears
// is what that person is allowed to see.

type FacilityHit = { id: string; name: string; licence: string; lga: string | null };
type Item = { key: string; href: string; label: string; detail?: string; kind: "page" | "facility" };

export function QuickFind({ roles }: { roles: string[] | null }) {
  const router = useRouter();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [facilities, setFacilities] = useState<FacilityHit[]>([]);
  const [active, setActive] = useState(0);

  const pages = useMemo(() => destinationsFor(roles), [roles]);

  const items: Item[] = useMemo(
    () => [
      ...matchDestinations(pages, query).map((d) => ({
        key: `p:${d.href}`,
        href: d.href,
        label: d.label,
        detail: d.hint,
        kind: "page" as const,
      })),
      ...facilities.map((f) => ({
        key: `f:${f.id}`,
        href: `/facilities/${f.id}`,
        label: f.name,
        detail: [f.licence, f.lga].filter(Boolean).join(" · "),
        kind: "facility" as const,
      })),
    ],
    [pages, query, facilities],
  );

  const close = () => {
    setOpen(false);
    setQuery("");
    setFacilities([]);
    setActive(0);
  };

  // The shortcut. "/" is ignored while typing so it can still be typed.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  // Facilities: wait for a pause in typing, and drop an answer that arrives late.
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) {
      setFacilities([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        setFacilities(res.ok ? ((await res.json()) as FacilityHit[]) : []);
      } catch {
        /* aborted by the next keystroke, or offline: keep what is shown */
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  useEffect(() => setActive(0), [query, facilities]);

  const go = (item: Item | undefined) => {
    if (!item) return;
    close();
    router.push(item.href);
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (items.length ? (i + 1) % items.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(items[active]);
    } else if (e.key === "Escape") {
      close();
    }
  };

  const optionId = (i: number) => `${listId}-${i}`;
  const firstFacility = items.findIndex((i) => i.kind === "facility");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-5 flex w-full items-center gap-2.5 rounded-control border border-pine-line bg-white/5 px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
      >
        <Search className="size-4 text-white/50" aria-hidden />
        <span className="flex-1 text-left">Search</span>
        <kbd className="rounded border border-pine-line bg-white/10 px-1.5 py-0.5 font-sans text-[0.6875rem] text-white/60">
          Ctrl K
        </kbd>
      </button>

      {/* In the body, not the rail: the rail is sticky, which makes it a stacking
          context, and the page's own content would paint over a dialog inside it. */}
      {open
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-start justify-center p-3 pt-[12vh] sm:p-6 sm:pt-[14vh]">
              <div
                className="absolute inset-0 bg-[rgb(11_42_32/0.55)] backdrop-blur-[2px] animate-in fade-in"
                onClick={close}
                aria-hidden
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Search"
                className="relative w-full max-w-xl overflow-hidden rounded-card border border-line bg-card shadow-overlay animate-in fade-in zoom-in-95"
              >
                <div className="flex items-center gap-3 border-b border-line px-4">
                  <Search className="size-4 shrink-0 text-ink-faint" aria-hidden />
                  <input
                    ref={input}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={onInputKey}
                    role="combobox"
                    aria-expanded="true"
                    aria-controls={listId}
                    aria-activedescendant={items.length ? optionId(active) : undefined}
                    aria-autocomplete="list"
                    autoComplete="off"
                    spellCheck={false}
                    // The dialog is the focus indicator here; the global ring is unlayered, so only an inline style beats it.
                    style={{ outline: "none" }}
                    placeholder="Go to a page, or find a facility by name or licence"
                    className="h-12 min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
                  />
                  <kbd className="rounded border border-line bg-surface-sunk px-1.5 py-0.5 font-sans text-[0.6875rem] text-ink-faint">
                    Esc
                  </kbd>
                </div>

                <ul id={listId} role="listbox" aria-label="Results" className="max-h-[50vh] overflow-y-auto p-2">
                  {items.map((item, i) => (
                    <li key={item.key} role="presentation">
                      {i === 0 || (i === firstFacility && firstFacility > 0) ? (
                        <p className="px-3 pt-2 pb-1 text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-faint uppercase">
                          {item.kind === "page" ? "Go to" : "Facilities"}
                        </p>
                      ) : null}
                      <div
                        id={optionId(i)}
                        role="option"
                        aria-selected={i === active}
                        onMouseMove={() => setActive(i)}
                        onClick={() => go(item)}
                        className={`flex cursor-pointer items-center gap-3 rounded-control px-3 py-2 text-sm ${
                          i === active ? "bg-primary-50 text-primary-700" : "text-ink"
                        }`}
                      >
                        {item.kind === "facility" ? (
                          <Building2 className="size-4 shrink-0 text-ink-faint" aria-hidden />
                        ) : (
                          <ArrowRight className="size-4 shrink-0 text-ink-faint" aria-hidden />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{item.label}</span>
                          {item.detail ? (
                            <span className="block truncate text-xs text-ink-muted">{item.detail}</span>
                          ) : null}
                        </span>
                        {i === active ? (
                          <CornerDownLeft className="size-3.5 shrink-0 text-ink-faint" aria-hidden />
                        ) : null}
                      </div>
                    </li>
                  ))}
                  {items.length === 0 ? (
                    <li role="presentation" className="px-3 py-6 text-center text-sm text-ink-muted">
                      Nothing matches &ldquo;{query.trim()}&rdquo;.
                    </li>
                  ) : null}
                </ul>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
