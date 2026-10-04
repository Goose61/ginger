"use client";

import { useCallback, useEffect, useState } from "react";
import type { FeeLedger } from "@/lib/types";
import type { TreasurySummary, WalletRewardSummary } from "@/lib/fee-distribution";
import { useWallet } from "./WalletProvider";
import { formatUsd } from "@/lib/collection-ui";

type FeeStatus = {
  summary: TreasurySummary;
  walletRewards: WalletRewardSummary | null;
  feeLedger: FeeLedger | null;
  feeClaimsOpen: boolean;
  treasuryBuybackActive: boolean;
  buybackTokenCa: string | null;
  buybackTreasuryWallet: string | null;
};

export function HolderFeePanel({ collectionId }: { collectionId: string }) {
  const { publicKey, connect } = useWallet();
  const [status, setStatus] = useState<FeeStatus | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/collections/${collectionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "fee_status", wallet: publicKey ?? "" }),
    });
    const data = await res.json();
    if (res.ok) setStatus(data);
  }, [collectionId, publicKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const ledger = status?.feeLedger;
  const summary = status?.summary;
  const rewards = status?.walletRewards;

  return (
    <section className="mt-10 space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">Treasury & rewards</h2>
        <p className="mt-1 text-xs text-white/40">
          Totals come from recorded sales. Holder rewards waiting are rounds that have not been sent
          yet. Paid rewards and buybacks already left the platform wallet. The creator share is the
          creator&apos;s portion of those sales.
        </p>
      </div>

      {summary && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <TreasuryStat label="Holder rewards waiting" value={formatUsd(summary.holderWaitingUsd)} />
          <TreasuryStat label="Holder rewards paid" value={formatUsd(summary.holderPaidUsd)} />
          <TreasuryStat label="Buyback waiting" value={formatUsd(summary.buybackWaitingUsd)} />
          <TreasuryStat label="Buyback spent" value={formatUsd(summary.buybackSpentUsd)} />
          <TreasuryStat label="Platform fees" value={formatUsd(summary.platformUsd)} />
          <TreasuryStat label="Creator share" value={formatUsd(summary.creatorShareUsd)} />
        </dl>
      )}

      {(status?.buybackTokenCa || status?.buybackTreasuryWallet) && (
        <div className="rounded border border-[#f5c542]/30 bg-[#f5c542]/5 px-3 py-2 text-xs space-y-2">
          {status.buybackTokenCa && (
            <div>
              <p className="text-[#f5c542] font-medium">Buyback token</p>
              <p className="mt-1 font-mono text-white/80 break-all">{status.buybackTokenCa}</p>
            </div>
          )}
          {status.buybackTreasuryWallet && (
            <div>
              <p className="text-[#f5c542] font-medium">Treasury wallet</p>
              <p className="mt-1 font-mono text-white/80 break-all">{status.buybackTreasuryWallet}</p>
            </div>
          )}
        </div>
      )}

      <div className="rounded border border-white/10 p-4">
        <h3 className="text-sm font-medium text-white">Your rewards</h3>
        {!publicKey ? (
          <>
            <p className="mt-2 text-sm text-white/50">
              Connect the wallet that held NFTs when a sale was split. Rewards follow that snapshot,
              even if the NFT has since moved.
            </p>
            <button
              type="button"
              onClick={() => void connect()}
              className="mt-3 rounded-full bg-primary px-5 py-2 text-sm font-medium text-white"
            >
              Connect wallet
            </button>
          </>
        ) : rewards ? (
          <>
            <p className="mt-2 text-sm text-white/60">
              This wallet holds {rewards.heldCount} NFT{rewards.heldCount === 1 ? "" : "s"} right now.
            </p>
            <p className="mt-1 text-lg font-semibold text-white">
              Paid {formatUsd(rewards.paidUsd)}
              {rewards.waitingUsd > 0 ? ` · Waiting ${formatUsd(rewards.waitingUsd)}` : ""}
            </p>
            {rewards.waitingUsd > 0 && (
              <p className="mt-1 text-xs text-white/40">
                The waiting amount is still in an unpaid round. It is sent in SOL from the platform wallet, not by marking a claim here.
              </p>
            )}
            {rewards.paidUsd <= 0 && rewards.waitingUsd <= 0 && (
              <p className="mt-1 text-xs text-white/40">
                No holder reward from a recorded sale is assigned to this wallet.
              </p>
            )}
            {rewards.payouts.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-white/60">
                {rewards.payouts.map((payout) => (
                  <li key={`${payout.roundId}-${payout.paidAt}`}>
                    {formatUsd(payout.amountUsd)}
                    {payout.txUrl ? (
                      <>
                        {" "}
                        ·{" "}
                        <a className="text-primary underline" href={payout.txUrl} target="_blank" rel="noreferrer">
                          tx
                        </a>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm text-white/50">Loading this wallet&apos;s rewards…</p>
        )}
      </div>

      {status?.treasuryBuybackActive && ledger && ledger.buybacks.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-white">Buyback history</h3>
          <ul className="mt-2 space-y-2 text-xs">
            {ledger.buybacks.map((b, i) => (
              <li key={`${b.at}-${i}`} className="rounded border border-white/10 px-3 py-2 font-mono text-white/70">
                {formatUsd(b.usdSpent ?? b.priceUsd ?? 0)}
                {b.tokenAmount != null ? ` → ${b.tokenAmount} tokens` : ""}
                {b.txUrl ? (
                  <>
                    {" "}
                    ·{" "}
                    <a className="text-primary underline" href={b.txUrl} target="_blank" rel="noreferrer">
                      tx
                    </a>
                  </>
                ) : null}
                <span className="text-white/40"> · {new Date(b.at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

    </section>
  );
}

function TreasuryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-white/10 p-3">
      <dt className="text-[10px] uppercase tracking-wider text-white/40">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-white">{value}</dd>
    </div>
  );
}
