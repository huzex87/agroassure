"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Asks the server for the page again every few seconds. Used where the page is
// waiting on something outside the browser's control, such as a gateway that
// is still starting, so the person never has to remember to reload.

export function AutoRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
