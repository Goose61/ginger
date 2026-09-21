/** Test launches that must never appear on Market or public collection pages. */
const HIDDEN_SLUGS = new Set(["smoke-e2e", "holder-test"]);
const HIDDEN_NAMES = new Set(["smoke e2e", "holder test"]);

export function isHiddenFromMarket(collection: {
  slug?: string;
  name?: string;
}): boolean {
  if (collection.slug && HIDDEN_SLUGS.has(collection.slug)) return true;
  const name = collection.name?.trim().toLowerCase();
  return Boolean(name && HIDDEN_NAMES.has(name));
}
