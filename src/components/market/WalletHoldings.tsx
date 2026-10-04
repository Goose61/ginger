"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/components/WalletProvider";
import { useEvmWallet } from "@/components/EvmWalletProvider";
import { formatUsd } from "@/lib/collection-ui";
import { buildAuthHeaders } from "@/lib/wallet-auth-client";

type Holding = {
  collectionId: string;
  slug: string;
  collectionName: string;
  tokenId: number;
  name: string;
  imageSrc: string;
  listingPriceUsd: number | null;
  owner?: string;
};

export function WalletHoldings() {
  const { publicKey } = useWallet();
  const { address: evmAddress } = useEvmWallet();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const wallets = [publicKey, evmAddress].filter((wallet): wallet is string => Boolean(wallet));

  const load = useCallback(async () => {
    const connected = [publicKey, evmAddress].filter((wallet): wallet is string => Boolean(wallet));
    if (connected.length === 0) {
      setHoldings([]);
      return;
    }
    const batches = await Promise.all(
      connected.map(async (wallet) => {
        const res = await fetch(`/api/holdings?wallet=${encodeURIComponent(wallet)}`);
        const data = await res.json();
        return res.ok ? ((data.holdings ?? []) as Holding[]) : [];
      }),
    );
    const seen = new Set<string>();
    const next: Holding[] = [];
    for (const batch of batches) {
      for (const holding of batch) {
        const key = `${holding.collectionId}:${holding.tokenId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        next.push(holding);
      }
    }
    next.sort((a, b) => a.collectionName.localeCompare(b.collectionName) || a.tokenId - b.tokenId);
    setHoldings(next);
    setPrices((prev) => {
      const pricesNext = { ...prev };
      for (const holding of next) {
        const key = `${holding.collectionId}:${holding.tokenId}`;
        if (pricesNext[key] == null && holding.listingPriceUsd != null) {
          pricesNext[key] = String(holding.listingPriceUsd);
        }
      }
      return pricesNext;
    });
  }, [publicKey, evmAddress]);

  useEffect(() => {
    void load();
  }, [load]);

  if (wallets.length === 0) return null;

  async function listHolding(holding: Holding) {
    const key = `${holding.collectionId}:${holding.tokenId}`;
    const wallet = holding.owner?.startsWith("0x") ? evmAddress : publicKey;
    if (!wallet) return;
    const priceUsd = Number(prices[key]);
    if (!priceUsd || priceUsd <= 0) {
      setMessage("Enter a list price in USD.");
      return;
    }
    setBusyKey(key);
    setMessage(null);
    try {
      const res = await fetch(`/api/collections/${holding.collectionId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await buildAuthHeaders(wallet)),
        },
        body: JSON.stringify({ action: "list_secondary", tokenId: holding.tokenId, priceUsd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Listing failed");
      setMessage(
        holding.listingPriceUsd
          ? `${holding.name} relisted at ${formatUsd(priceUsd)}`
          : `${holding.name} listed at ${formatUsd(priceUsd)}`,
      );
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Listing failed");
    } finally {
      setBusyKey(null);
    }
  }

  async function unlistHolding(holding: Holding) {
    const key = `${holding.collectionId}:${holding.tokenId}`;
    const wallet = holding.owner?.startsWith("0x") ? evmAddress : publicKey;
    if (!wallet) return;
    setBusyKey(key);
    setMessage(null);
    try {
      const res = await fetch(`/api/collections/${holding.collectionId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await buildAuthHeaders(wallet)),
        },
        body: JSON.stringify({ action: "unlist_secondary", tokenId: holding.tokenId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not remove listing");
      setMessage(`${holding.name} is no longer listed`);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not remove listing");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <p className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.18em] text-white/40">YOUR WALLET</p>
        <h2 className="mt-1 text-2xl text-white">Your NFTs</h2>
        <p className="mt-1 text-sm text-white/50">
          Pieces this wallet holds on Ginger. List one for sale, or change the price to relist it.
        </p>
      </div>
      {holdings.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-white/50">
          This wallet does not hold any Ginger NFTs yet.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {holdings.map((holding) => {
            const key = `${holding.collectionId}:${holding.tokenId}`;
            const busy = busyKey === key;
            return (
              <article key={key} className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                <Link href={`/collection/${holding.slug}?token=${holding.tokenId}`} className="block">
                  <div className="nft-tile-media">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={holding.imageSrc} alt={holding.name} loading="lazy" decoding="async" />
                  </div>
                </Link>
                <div className="space-y-3 p-3">
                  <div>
                    <p className="truncate text-sm font-medium text-white">{holding.name}</p>
                    <p className="text-xs text-white/40">{holding.collectionName}</p>
                    <p className="mt-1 text-xs text-white/60">
                      {holding.listingPriceUsd != null
                        ? `Listed at ${formatUsd(holding.listingPriceUsd)}`
                        : "Not listed"}
                    </p>
                  </div>
                  <label className="block text-xs text-white/50">
                    Price (USD)
                    <input
                      className="input mt-1"
                      type="number"
                      min={0}
                      step={0.01}
                      value={prices[key] ?? ""}
                      onChange={(e) => setPrices((prev) => ({ ...prev, [key]: e.target.value }))}
                    />
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void listHolding(holding)}
                      className="min-h-11 flex-1 rounded-full bg-primary px-3 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {busy ? "Saving…" : holding.listingPriceUsd != null ? "Relist" : "List for sale"}
                    </button>
                    {holding.listingPriceUsd != null && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void unlistHolding(holding)}
                        className="min-h-11 rounded-full border border-white/15 px-3 text-sm text-white/70 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {message && <p className="text-sm text-white/60">{message}</p>}
    </section>
  );
}
