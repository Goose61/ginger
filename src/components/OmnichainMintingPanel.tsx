"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChainKey, Collection, MintDestination } from "@/lib/types";
import type { EvmNftChainId } from "@/lib/evm-nft-chain-catalog";
import {
  CHAIN_DESCRIPTORS,
  homeChainToDestination,
  LAUNCH_HOME_OPTIONS,
} from "@/lib/chain-registry";
import type { HomeLedger } from "@/lib/home-ledger";
import { homeLedgerToChainKey, universalHomeEnabled } from "@/lib/home-ledger";
import { collectionSolanaSpokeAddress } from "@/lib/collection-spoke";
import {
  EVM_SPOKE_CHAIN_IDS,
  evmSpokeChainMeta,
  listEvmSpokeChains,
  mintDestinationToSpokeChain,
  type EvmSpokeChainId,
} from "@/lib/evm-spoke-chains";
import { collectionSpokeAddress } from "@/lib/collection-spoke";
import { deployEvmSpoke } from "@/lib/deploy-evm-spoke-client";
import { buildAuthHeaders } from "@/lib/wallet-auth-client";
import { readJsonResponse } from "@/lib/fetch-json";
import { OMNICHAIN_PLATFORM_SURCHARGE_PERCENT, OMNICHAIN_RELAYER_BUFFER_USD } from "@/lib/platform-fees";
import { shortenAddress } from "@/lib/chain-registry";
import type { SpokeDeployEstimateRow } from "@/lib/spoke-deploy-estimate";

const CORE_DESTINATIONS: MintDestination[] = ["solana", "avalanche", "avalanche_l1"];

type Props = {
  variant: "launch" | "dashboard";
  collection?: Collection;
  homeChain: ChainKey;
  homeLedger?: HomeLedger;
  mintDestinations: MintDestination[];
  spokeDeployAtLaunch?: EvmNftChainId[];
  onHomeChainChange?: (chain: ChainKey) => void;
  onHomeLedgerChange?: (ledger: HomeLedger) => void;
  onMintDestinationsChange?: (destinations: MintDestination[]) => void;
  onSpokeDeployAtLaunchChange?: (ids: EvmNftChainId[]) => void;
  onSpokeDeployTotalUsdChange?: (usd: number) => void;
  onCollectionUpdated?: (collection: Collection) => void;
  avalancheFactory?: string | null;
  avalancheReady?: boolean;
  avalancheL1Enabled?: boolean;
  evmAddress?: string | null;
  publicKey?: string | null;
  connectEvm?: () => Promise<void>;
  ensureAvalancheChain?: () => Promise<void>;
  ensureEvmChain?: (chainId: number) => Promise<void>;
  sendContractTx?: (to: `0x${string}`, data: `0x${string}`) => Promise<`0x${string}`>;
  /** Launch landing: collapse omnichain block by default. */
  collapsible?: boolean;
};

export function OmnichainMintingPanel({
  variant,
  collection,
  homeChain,
  homeLedger: homeLedgerProp,
  mintDestinations,
  spokeDeployAtLaunch = [],
  onHomeChainChange,
  onHomeLedgerChange,
  onMintDestinationsChange,
  onSpokeDeployAtLaunchChange,
  onSpokeDeployTotalUsdChange,
  onCollectionUpdated,
  avalancheFactory,
  avalancheReady,
  avalancheL1Enabled,
  evmAddress,
  publicKey,
  connectEvm,
  ensureAvalancheChain,
  ensureEvmChain,
  sendContractTx,
  collapsible,
}: Props) {
  const [evmChains, setEvmChains] = useState(listEvmSpokeChains());
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [localDests, setLocalDests] = useState(mintDestinations);
  const [deploySelection, setDeploySelection] = useState<EvmNftChainId[]>(spokeDeployAtLaunch);
  const [deployEstimates, setDeployEstimates] = useState<SpokeDeployEstimateRow[]>([]);
  const [estimatesLoading, setEstimatesLoading] = useState(false);
  const [expanded, setExpanded] = useState(!collapsible);

  useEffect(() => {
    setLocalDests(mintDestinations);
  }, [mintDestinations]);

  useEffect(() => {
    setDeploySelection(spokeDeployAtLaunch);
  }, [spokeDeployAtLaunch]);

  useEffect(() => {
    void fetch("/api/network")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.evmSpokeChains)) {
          setEvmChains(d.evmSpokeChains);
        }
      })
      .catch(() => {});
  }, []);

  const homeLedger = homeLedgerProp ?? (homeChain === "avalanche" ? "avalanche" : homeChain === "solana" ? "solana" : homeChain);
  const homeDest = homeChainToDestination(homeLedger);
  const extendedEvmDests = useMemo(
    () =>
      EVM_SPOKE_CHAIN_IDS.filter((id) => id !== "avalanche").map(
        (id) => evmSpokeChainMeta(id).mintDestination,
      ),
    [],
  );

  const deployCandidateSpokes = useMemo((): EvmSpokeChainId[] => {
    const out: EvmSpokeChainId[] = [];
    for (const dest of localDests) {
      const spoke = mintDestinationToSpokeChain(dest);
      if (!spoke || spoke === "avalanche") continue;
      if (dest === homeDest) continue;
      if (collection && collectionSpokeAddress(collection, spoke)) continue;
      out.push(spoke);
    }
    if (
      localDests.includes("avalanche") &&
      homeDest !== "avalanche" &&
      !(collection && collectionSpokeAddress(collection, "avalanche"))
    ) {
      out.push("avalanche");
    }
    return Array.from(new Set(out));
  }, [collection, homeDest, localDests]);

  useEffect(() => {
    if (variant !== "launch" || deployCandidateSpokes.length === 0) {
      setDeployEstimates([]);
      onSpokeDeployTotalUsdChange?.(0);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      setEstimatesLoading(true);
      void fetch("/api/omnichain/spoke-deploy-estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spokeChainIds: deployCandidateSpokes,
          collectionId: collection?.id,
          name: collection?.name,
          symbol: collection?.symbol,
          supply: collection?.supply,
          creatorWallet: evmAddress ?? collection?.payments.creatorWallet,
          owner: evmAddress ?? undefined,
        }),
      })
        .then((r) => r.json())
        .then((data: { estimates?: SpokeDeployEstimateRow[]; totalUsd?: number }) => {
          if (cancelled) return;
          setDeployEstimates(data.estimates ?? []);
          onSpokeDeployTotalUsdChange?.(data.totalUsd ?? 0);
        })
        .catch(() => {
          if (!cancelled) setDeployEstimates([]);
        })
        .finally(() => {
          if (!cancelled) setEstimatesLoading(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [
    collection?.id,
    collection?.name,
    collection?.symbol,
    collection?.supply,
    collection?.payments.creatorWallet,
    deployCandidateSpokes,
    evmAddress,
    onSpokeDeployTotalUsdChange,
    variant,
  ]);

  const pushDeploySelection = useCallback(
    (next: EvmNftChainId[]) => {
      setDeploySelection(next);
      onSpokeDeployAtLaunchChange?.(next);
    },
    [onSpokeDeployAtLaunchChange],
  );

  const toggleDest = (dest: MintDestination, checked: boolean) => {
    const home = homeChainToDestination(homeChain);
    setLocalDests((prev) => {
      const next = checked
        ? Array.from(new Set([...prev, dest, home]))
        : prev.filter((d) => d !== dest || d === home);
      const out = next.length ? next : [home];
      onMintDestinationsChange?.(out);
      return out;
    });
  };

  const toggleDeploySpoke = (spoke: EvmNftChainId, checked: boolean) => {
    pushDeploySelection(
      checked
        ? Array.from(new Set([...deploySelection, spoke]))
        : deploySelection.filter((id) => id !== spoke),
    );
  };

  const selectAllDeployable = () => {
    const ready = deployEstimates.filter((e) => e.deployReady).map((e) => e.spokeChain);
    pushDeploySelection(ready);
  };

  const deselectAllDeploy = () => pushDeploySelection([]);

  const missingSpokes = useMemo(() => {
    if (!collection) return [];
    return EVM_SPOKE_CHAIN_IDS.filter((id) => {
      const meta = evmSpokeChainMeta(id);
      if (!localDests.includes(meta.mintDestination)) return false;
      if (meta.mintDestination === homeDest) return false;
      return !collectionSpokeAddress(collection, id);
    });
  }, [collection, localDests, homeDest]);

  const saveOmnichain = useCallback(async () => {
    if (!collection || !publicKey) return;
    setBusy("save");
    setMessage(null);
    try {
      const res = await fetch(`/api/collections/${collection.id}/omnichain`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await buildAuthHeaders(publicKey)),
        },
        body: JSON.stringify({
          mintDestinations: localDests,
          omnichainMintEnabled: localDests.length > 1,
          spokeDeployAtLaunch: deploySelection,
        }),
      });
      const data = await readJsonResponse<{ collection?: Collection; error?: string }>(res);
      if (!res.ok || !data.collection) throw new Error(data.error || "Save failed");
      onCollectionUpdated?.(data.collection);
      setMessage("Omnichain settings saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }, [collection, deploySelection, localDests, onCollectionUpdated, publicKey]);

  const deploySpoke = useCallback(
    async (spokeChain: EvmSpokeChainId) => {
      if (!collection || !sendContractTx) return;
      setBusy(spokeChain);
      setMessage(null);
      try {
        if (!evmAddress && connectEvm) await connectEvm();
        if (!evmAddress) throw new Error("Connect MetaMask or Core to deploy the spoke.");
        if (spokeChain === "avalanche" && ensureAvalancheChain) await ensureAvalancheChain();
        const confirmWallet = publicKey ?? evmAddress;
        if (!confirmWallet) throw new Error("Connect creator wallet to confirm.");
        const result = await deployEvmSpoke({
          collectionId: collection.id,
          spokeChain,
          evmWallet: evmAddress!,
          sendContractTx,
          confirmWallet,
          ensureEvmChain,
        });
        if (result.collection.id) onCollectionUpdated?.(result.collection);
        setMessage(`${evmSpokeChainMeta(spokeChain).label} spoke deployed at ${shortenAddress(result.address)}`);
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Deploy failed");
      } finally {
        setBusy(null);
      }
    },
    [
      collection,
      connectEvm,
      ensureAvalancheChain,
      ensureEvmChain,
      evmAddress,
      onCollectionUpdated,
      publicKey,
      sendContractTx,
    ],
  );

  const inner = (
    <>
      <p className={`text-sm text-white/60 ${variant === "dashboard" ? "mt-1" : "mt-1"}`}>
        Home is the supply ledger ({CHAIN_DESCRIPTORS[homeDest].label}). Enable extra chains so collectors can mint
        there, via omnichain checkout (SlicePay + Ginger pays gas) or self-serve.
      </p>

      {variant === "launch" && (onHomeChainChange || onHomeLedgerChange) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {LAUNCH_HOME_OPTIONS.map((ledger) => {
            const meta =
              ledger === "solana"
                ? { label: "Solana", deployReady: true }
                : evmChains.find((c) => c.id === ledger) ?? evmSpokeChainMeta(ledger);
            const disabled = ledger !== "solana" && meta && "deployReady" in meta && !meta.deployReady;
            const selected = homeLedger === ledger;
            return (
              <button
                key={ledger}
                type="button"
                disabled={Boolean(disabled)}
                title={disabled ? "Factory not configured on this server yet" : undefined}
                onClick={() => {
                  onHomeLedgerChange?.(ledger);
                  onHomeChainChange?.(homeLedgerToChainKey(ledger));
                  const home = homeChainToDestination(ledger);
                  onMintDestinationsChange?.(
                    Array.from(
                      new Set([
                        home,
                        ...localDests.filter((d) => d !== home),
                      ]),
                    ),
                  );
                }}
                className={`rounded-full px-4 py-2 text-sm font-medium ${
                  selected ? "bg-primary text-white" : "border border-white/15 text-white/70"
                } ${disabled ? "opacity-40" : ""}`}
              >
                {ledger === "solana" ? "Solana" : CHAIN_DESCRIPTORS[ledger]?.label ?? ledger}
              </button>
            );
          })}
        </div>
      )}
      {variant === "launch" && universalHomeEnabled() && (
        <p className="mt-2 text-xs text-white/40">
          EVM home chains need a deployed Ginger factory on that network (see ops checklist).
        </p>
      )}

      <p className="mt-4 text-xs text-white/50">Mint destinations</p>
      <div className="mt-2 flex flex-col gap-2 text-sm text-white/80">
        {CORE_DESTINATIONS.filter((d) => d !== "avalanche_l1" || avalancheL1Enabled)
          .map((dest) => (
            <label key={dest} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={localDests.includes(dest) || dest === homeDest}
                disabled={dest === homeDest}
                onChange={(e) => toggleDest(dest, e.target.checked)}
              />
              {CHAIN_DESCRIPTORS[dest].label}
              {collection && dest !== homeDest && mintDestinationToSpokeChain(dest) && (
                <SpokeStatus collection={collection} spokeChain={mintDestinationToSpokeChain(dest)!} />
              )}
            </label>
          ))}
        <p className="mt-2 text-xs text-white/40">Additional EVM chains</p>
        {extendedEvmDests.map((dest) => {
          const spoke = mintDestinationToSpokeChain(dest);
          const meta = spoke ? evmChains.find((c) => c.id === spoke) ?? evmSpokeChainMeta(spoke) : null;
          const disabled = meta && !meta.deployReady;
          return (
            <label key={dest} className={`flex flex-wrap items-center gap-2 ${disabled ? "opacity-50" : ""}`}>
              <input
                type="checkbox"
                checked={localDests.includes(dest)}
                disabled={Boolean(disabled) || dest === homeDest}
                onChange={(e) => toggleDest(dest, e.target.checked)}
              />
              {CHAIN_DESCRIPTORS[dest].label}
              {meta?.comingSoon && !meta.deployReady && (
                <span className="text-[10px] uppercase tracking-wide text-amber-200/80">Coming soon</span>
              )}
              {meta?.deployReady && (
                <span className="text-[10px] uppercase tracking-wide text-emerald-300/80">Factory ready</span>
              )}
              {collection && spoke && dest !== homeDest && (
                <SpokeStatus collection={collection} spokeChain={spoke} />
              )}
            </label>
          );
        })}
      </div>

      {variant === "launch" && deployCandidateSpokes.length > 0 && (
        <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-white/70">Deploy spoke contracts at go-live (you pay gas)</p>
            <div className="flex gap-2">
              <button
                type="button"
                className="text-[10px] uppercase tracking-wide text-primary"
                onClick={selectAllDeployable}
              >
                Select all
              </button>
              <button
                type="button"
                className="text-[10px] uppercase tracking-wide text-white/50"
                onClick={deselectAllDeploy}
              >
                Deselect all
              </button>
            </div>
          </div>
          {estimatesLoading && <p className="mt-2 text-xs text-white/40">Estimating deploy gas…</p>}
          <ul className="mt-2 space-y-2 text-xs text-white/75">
            {deployCandidateSpokes.map((spoke) => {
              const est = deployEstimates.find((e) => e.spokeChain === spoke);
              const meta = evmSpokeChainMeta(spoke);
              const canDeploy = est?.deployReady ?? meta.deployReady;
              return (
                <li key={spoke} className="flex flex-wrap items-center gap-2">
                  <input
                    type="checkbox"
                    checked={deploySelection.includes(spoke)}
                    disabled={!canDeploy}
                    onChange={(e) => toggleDeploySpoke(spoke, e.target.checked)}
                  />
                  <span>{meta.label}</span>
                  {est?.deployReady && est.gasNative != null ? (
                    <span className="text-white/45">
                      ~{est.gasNative.toFixed(4)} {est.nativeSymbol}
                      {est.gasUsd != null ? ` ($${est.gasUsd.toFixed(2)})` : ""}
                    </span>
                  ) : (
                    <span className="text-amber-200/80">{est?.note ?? meta.note ?? "Not available"}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="mt-3 text-[11px] text-white/45">
        Omnichain checkout fee: {OMNICHAIN_PLATFORM_SURCHARGE_PERCENT}% of mint + estimated destination gas (incl. $
        {OMNICHAIN_RELAYER_BUFFER_USD.toFixed(2)} buffer). Self-serve avoids that fee; collectors pay gas in-wallet.
      </p>

      {variant === "launch" &&
        (homeChain === "avalanche" || localDests.includes("avalanche") || localDests.includes("avalanche_l1")) &&
        (!avalancheFactory || !avalancheReady) && (
          <p className="mt-3 text-xs text-amber-200/80">
            Avalanche factory is not configured on this server. Run{" "}
            <code className="text-white/80">npm run deploy:avalanche-factory</code> before go-live.
          </p>
        )}

      {variant === "launch" && !evmAddress && connectEvm &&
        (localDests.includes("avalanche") || localDests.some((d) => extendedEvmDests.includes(d))) && (
          <button
            type="button"
            onClick={() => void connectEvm()}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white"
          >
            Connect MetaMask or Core
          </button>
        )}

      {variant === "dashboard" && collection && (
        <div className="mt-4 flex flex-wrap gap-2">
          {!evmAddress && connectEvm && (
            <button
              type="button"
              onClick={() => void connectEvm()}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white"
            >
              Connect EVM wallet
            </button>
          )}
          {missingSpokes.map((id) => (
            <button
              key={id}
              type="button"
              disabled={Boolean(busy) || !sendContractTx}
              onClick={() => void deploySpoke(id)}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs text-white disabled:opacity-50"
            >
              {busy === id ? "Deploying…" : `Deploy ${evmSpokeChainMeta(id).label} spoke`}
            </button>
          ))}
          <button
            type="button"
            disabled={Boolean(busy) || !publicKey}
            onClick={() => void saveOmnichain()}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/15 disabled:opacity-50"
          >
            {busy === "save" ? "Saving…" : "Save destinations"}
          </button>
        </div>
      )}

      {message && <p className="mt-3 text-xs text-white/70">{message}</p>}
    </>
  );

  return (
    <div className={variant === "launch" ? "" : "mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4"}>
      {variant === "dashboard" && (
        <h3 className="text-sm font-semibold text-white">Omnichain minting</h3>
      )}
      {collapsible ? (
        <>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-4 text-left text-sm font-medium text-white"
            onClick={() => setExpanded((v) => !v)}
          >
            Optional: omnichain minting
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 text-2xl leading-none text-white">
              {expanded ? "−" : "+"}
            </span>
          </button>
          {expanded && inner}
        </>
      ) : (
        inner
      )}
    </div>
  );
}

function SpokeStatus({ collection, spokeChain }: { collection: Collection; spokeChain: EvmSpokeChainId }) {
  const addr = collectionSpokeAddress(collection, spokeChain);
  if (!addr) return <span className="text-[10px] text-amber-200/90">Spoke not deployed</span>;
  return <span className="text-[10px] text-emerald-300/90">{shortenAddress(addr)}</span>;
}
