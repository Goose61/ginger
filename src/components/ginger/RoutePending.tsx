"use client";

import { useLinkStatus } from "next/link";

/** Shows a top bar as soon as this link's navigation starts. */
export function RoutePending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <span className="ginger-route-pending" aria-hidden />;
}
