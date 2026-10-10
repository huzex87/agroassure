"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

/** What the page is showing now: the saved choice, else the device's. */
function current(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Light or dark, remembered on this browser. Until someone chooses, the page
 * follows the device (see THEME_SCRIPT in the layout, which applies a saved
 * choice before first paint so the page never flashes the wrong theme).
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => setTheme(current()), []);

  function flip() {
    const next: Theme = current() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Private window or blocked storage: the choice just lasts this visit.
    }
    setTheme(next);
  }

  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={flip}
      aria-pressed={dark}
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
        {dark ? (
          <>
            <circle cx="8" cy="8" r="2.75" />
            <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M12.6 3.4l-1 1M4.4 11.6l-1 1" />
          </>
        ) : (
          <path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7Z" />
        )}
      </svg>
      {dark ? "Light mode" : "Dark mode"}
    </button>
  );
}
