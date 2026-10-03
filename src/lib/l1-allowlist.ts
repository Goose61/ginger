import { getAvalancheL1RemoteAddress } from "./avalanche-config";
import type { Collection } from "./types";

/** Allowlisted ICNFTT remotes. v1 is a single Fuji L1 stub from env. */
export function allowedL1Remotes(): string[] {
  const env = getAvalancheL1RemoteAddress().toLowerCase();
  return env ? [env] : [];
}

export function isAllowedL1Remote(_collection: Collection, address: string): boolean {
  const allowed = new Set(allowedL1Remotes());
  return allowed.has(address.trim().toLowerCase());
}

export function registeredL1Remote(collection: Collection): string | null {
  const fromCollection = collection.l1RemoteAddress?.trim();
  if (fromCollection && isAllowedL1Remote(collection, fromCollection)) return fromCollection;
  return getAvalancheL1RemoteAddress() || null;
}
