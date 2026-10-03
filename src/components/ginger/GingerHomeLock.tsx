"use client";

import { useEffect } from "react";

/** Homepage is a fixed full-viewport frame, matching the Ginger hero. */
export function GingerHomeLock() {
  useEffect(() => {
    document.documentElement.classList.add("ginger-home");
    return () => document.documentElement.classList.remove("ginger-home");
  }, []);
  return null;
}
