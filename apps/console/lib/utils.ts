import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class lists, letting a caller's utility win over a component's default.
 *
 * Plain concatenation cannot do that: "px-5" and "px-3" both survive and the
 * later one in the stylesheet wins rather than the later one in the argument
 * list, so a variant could not be overridden at the call site. twMerge resolves
 * conflicts by Tailwind's own grouping; clsx handles the conditionals.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
