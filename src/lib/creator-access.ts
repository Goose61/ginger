export function isLaunchedCreatorCollection(
  collection: { status?: string; payments?: { creatorWallet?: string } },
  wallet: string | null | undefined,
): boolean {
  if (!wallet) return false;
  const a = collection.payments?.creatorWallet ?? "";
  const b = wallet;
  if (a.startsWith("0x") && b.startsWith("0x")) {
    if (a.toLowerCase() !== b.toLowerCase()) return false;
  } else if (a !== b) {
    return false;
  }
  return collection.status === "live" || collection.status === "sold_out";
}
