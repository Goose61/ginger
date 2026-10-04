"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Collection, GeneratedToken, MintDestination } from "@/lib/types";
import { useWallet } from "./WalletProvider";
import { useEvmWallet } from "./EvmWalletProvider";
import { getClientNetwork, type SolanaNetwork } from "@/lib/solana-config";
import { useExplorerCluster } from "@/hooks/use-explorer-cluster";
import { isGiftBundle } from "@/lib/gift-bundle";
import { isExpirableReservation, isTokenReservationActive, TOKEN_RESERVATION_TTL_MS } from "@/lib/public-collection";
import { formatUsd, formatUsdAmount, formatUsdAndSol, formatSol, usdToSol, filterTokensByTrait, filterTokensByStatus, filterTokensBySearch, filterTokensByRarity, sortTokens, isTokenSold, nftPrice, tokenAskPrice, tokenImageSrc, tokenThumbSrc, tokenName, uniqueTraitFilters, logoImageSrc, COLLECTION_GRID_PAGE_SIZE, type TokenSort, type TokenStatusFilter, type OverallRarityFilter } from "@/lib/collection-ui";
import { MintProgress } from "@/components/market/MintProgress";
import { OVERALL_RARITY_CLASS, OVERALL_RARITY_FRAME, OVERALL_RARITY_LABEL, OVERALL_RARITY_ORDER, rarityRankByTokenId, tokenOverallRarity, tokenRarityRank } from "@/lib/rarity";
import { collectionMarketStats } from "@/lib/collection-stats";
import { CollectionSocialLinks } from "@/components/CollectionSocialLinks";
import { readJsonResponse } from "@/lib/fetch-json";
import { buildAuthHeaders } from "@/lib/wallet-auth-client";
import {
  PRIMARY_PLATFORM_FEE_PERCENT,
  PRIMARY_TRADE_TAX_PERCENT,
  PRIMARY_PLATFORM_TOTAL_PERCENT,
  SECONDARY_PLATFORM_FEE_PERCENT,
} from "@/lib/platform-fees";
import {
  SLICEPAY_ORIGINS,
  buildSlicePayReturnUrl,
  messageInvoiceId,
  messageLooksPaid,
  openSlicePayCheckout,
  parseSlicePayReturnParams,
} from "@/lib/slicepay-client";
import { isPaidStatus } from "@/lib/slicepay-shared";
import {
  CHAIN_DESCRIPTORS,
  chainLabel,
  collectionHomeChain,
  collectionMintDestinations,
  explorerAddressUrl,
  explorerNftUrl,
  homeChainToDestination,
  isDestinationWallet,
  isEvmAddress,
} from "@/lib/chain-registry";
import {
  confirmDestinationMint,
  confirmHomeDebit,
  confirmL1Arrival,
  prepareDestinationMint,
  requestMintQuote,
  runMintDryRun,
  type MintQuotePayload,
} from "@/lib/destination-checkout";
import { TokenLocationBadge } from "@/components/TokenLocationBadge";
import { CollectionContractLinks } from "@/components/CollectionContractLinks";
import type { AvalancheNetwork } from "@/lib/avalanche-config";

export function CollectionMint({ initial }: { initial: Collection }) {
  const searchParams = useSearchParams();
  const { publicKey, connect, signMintTx, signAndSendTx, isPhantom } = useWallet();
  const { address: evmAddress, connectEvm, ensureAvalancheChain, sendContractTx } = useEvmWallet();
  const destinations = useMemo(() => collectionMintDestinations(initial), [initial]);
  const homeDest = homeChainToDestination(collectionHomeChain(initial));
  const [mintDest, setMintDest] = useState<MintDestination>(destinations[0] ?? homeDest);
  const [mintQuote, setMintQuote] = useState<MintQuotePayload | null>(null);
  const [dryRunId, setDryRunId] = useState<string | null>(null);
  const [collection, setCollection] = useState(initial);
  const [selected, setSelected] = useState<GeneratedToken | null>(null);
  const [recipient, setRecipient] = useState("");
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [isDemoCheckout, setIsDemoCheckout] = useState(false);
  const [slicePayLive, setSlicePayLive] = useState<boolean | null>(null);
  const [clientNetwork, setClientNetwork] = useState<SolanaNetwork>("devnet");
  const [paymentMethod, setPaymentMethod] = useState<"slicepay" | "sol">(() =>
    initial.payments.acceptSol ? "sol" : "slicepay",
  );
  const [checkoutKind, setCheckoutKind] = useState<"primary_mint" | "secondary_buy">("primary_mint");
  const [listPrice, setListPrice] = useState("");
  const [traitFilters, setTraitFilters] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<TokenStatusFilter>("all");
  const [sort, setSort] = useState<TokenSort>("id_asc");
  const [search, setSearch] = useState("");
  const [rarityFilter, setRarityFilter] = useState<OverallRarityFilter>("all");
  const [solUsd, setSolUsd] = useState<number | null>(null);
  const [platformWallet, setPlatformWallet] = useState<string | null>(null);
  const [platformWalletReady, setPlatformWalletReady] = useState(false);
  const [avalancheNetwork, setAvalancheNetwork] = useState<AvalancheNetwork | undefined>(undefined);
  const [visibleCount, setVisibleCount] = useState(COLLECTION_GRID_PAGE_SIZE);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reservationTick, setReservationTick] = useState(0);
  const pendingTokenRef = useRef<GeneratedToken | null>(null);
  const returnHandledRef = useRef(false);

  const rarityRanks = useMemo(
    () => rarityRankByTokenId(collection.tokens),
    [collection.tokens],
  );
  const tokens = useMemo(() => {
    const searched = filterTokensBySearch(collection.tokens, collection, search);
    const byStatus = filterTokensByStatus(searched, collection, statusFilter);
    const byRarity = filterTokensByRarity(byStatus, collection, rarityFilter, rarityRanks);
    const byTrait = filterTokensByTrait(byRarity, collection, traitFilters);
    return sortTokens(byTrait, collection, sort, rarityRanks);
  }, [collection, traitFilters, statusFilter, sort, search, rarityFilter, rarityRanks, reservationTick]);
  const traitFilterOptions = useMemo(
    () => uniqueTraitFilters(collection),
    [collection],
  );
  const stats = useMemo(() => collectionMarketStats(collection), [collection, reservationTick]);
  const soldCount = stats.sold;
  const remaining = stats.available;
  const visibleTokens = tokens.slice(0, visibleCount);
  const logoSrc = logoImageSrc(collection);
  const explorerCluster = useExplorerCluster();
  const fees = collection.fees;
  const buybackTreasuryWallet =
    collection.buybackTreasuryWallet?.trim() ||
    collection.payments.creatorWallet?.trim() ||
    null;
  const socials = collection.socials ?? {};

  const [mintBusy, setMintBusy] = useState(false);

  useEffect(() => {
    setVisibleCount(COLLECTION_GRID_PAGE_SIZE);
  }, [search, statusFilter, sort, traitFilters, rarityFilter]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/quotes?usd=1")
      .then((r) => r.json())
      .then((data: { quote?: { solUsd?: number } }) => {
        if (!cancelled && data.quote?.solUsd) setSolUsd(data.quote.solUsd);
      })
      .catch(() => {});
    void fetch("/api/network", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { platformWallet?: string | null; avalancheNetwork?: string }) => {
        if (!cancelled) {
          setPlatformWallet(data.platformWallet ?? null);
          setPlatformWalletReady(true);
          if (data.avalancheNetwork === "mainnet" || data.avalancheNetwork === "fuji") {
            setAvalancheNetwork(data.avalancheNetwork);
          }
        }
      })
      .catch(() => {
        if (!cancelled) setPlatformWalletReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const expiring = collection.tokens.filter((t) => isExpirableReservation(t, collection));
    if (expiring.length === 0) return;
    const wait = Math.min(
      ...expiring.map((t) => {
        const at = t.reservedAt ? new Date(t.reservedAt).getTime() : 0;
        return at + TOKEN_RESERVATION_TTL_MS - Date.now();
      }),
    );
    if (!Number.isFinite(wait) || wait > 24 * 60 * 60 * 1000) return;
    const id = window.setTimeout(
      () => setReservationTick((n) => n + 1),
      Math.max(500, wait + 50),
    );
    return () => window.clearTimeout(id);
  }, [collection.tokens, collection.pendingMint, reservationTick]);

  const pendingOnChainToken = useMemo(() => {
    if (!publicKey) return null;
    return (
      collection.tokens.find(
        (t) =>
          !t.mintTxUrl &&
          (t.owner === publicKey ||
            (isTokenReservationActive(t, collection) &&
              (t.reservedBy === publicKey ||
                (collection.pendingMint?.payer === publicKey &&
                  collection.pendingMint?.tokenId === t.tokenId)))),
      ) ?? null
    );
  }, [collection, publicKey, reservationTick]);

  const isUnmintedGift =
    Boolean(pendingOnChainToken) &&
    (collection.payments.giftMintEnabled ||
      collection.supply > 1 ||
      Boolean(collection.pendingMint));

  useEffect(() => {
    void getClientNetwork().then(setClientNetwork);
  }, []);

  useEffect(() => {
    if (paymentMethod === "slicepay" && !collection.payments.acceptSlicePay && collection.payments.acceptSol) {
      setPaymentMethod("sol");
    } else if (paymentMethod === "sol" && !collection.payments.acceptSol && collection.payments.acceptSlicePay) {
      setPaymentMethod("slicepay");
    }
  }, [collection.payments.acceptSlicePay, collection.payments.acceptSol, paymentMethod]);

  const destWallet = mintDest === "solana" ? publicKey : evmAddress;

  const connectDestWallet = useCallback(async () => {
    if (mintDest === "solana") {
      await connect();
      return;
    }
    await connectEvm();
    await ensureAvalancheChain();
  }, [mintDest, connect, connectEvm, ensureAvalancheChain]);

  const ensureQuoteAndDryRun = useCallback(
    async (token: GeneratedToken, recipientWallet: string) => {
      if (!isDestinationWallet(mintDest, recipientWallet)) {
        throw new Error(
          mintDest === "solana"
            ? "Connect a Solana wallet to mint onto Solana."
            : "Connect MetaMask or Core to mint onto Avalanche.",
        );
      }
      setMessage("Quoting mint + gas…");
      const quote = await requestMintQuote({
        collectionId: collection.id,
        tokenId: token.tokenId,
        destination: mintDest,
        recipient: recipientWallet,
      });
      setMintQuote(quote);
      setMessage("Simulating mint. Ginger will not charge if this fails…");
      await runMintDryRun(collection.id, quote.dryRunId);
      setDryRunId(quote.dryRunId);
      setMessage(null);
      return quote;
    },
    [collection.id, mintDest],
  );

  useEffect(() => {
    fetch("/api/slicepay/invoice")
      .then((r) => r.json())
      .then((d) => setSlicePayLive(Boolean(d.configured)))
      .catch(() => setSlicePayLive(false));
  }, []);

  const completeSlicePayFlow = useCallback(
    async (token: GeneratedToken, id: string, kind: "primary_mint" | "secondary_buy") => {
      setBusy(true);
      setMessage("Payment confirmed. Completing mint…");
      try {
        if (kind === "secondary_buy") {
          await finalizeSecondaryBuy(token, id);
        } else {
          await finalizeMint(token, isDemoCheckout ? "demo" : "slicepay", undefined, id);
        }
        setCheckoutPending(false);
        window.history.replaceState({}, "", window.location.pathname);
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Could not complete purchase");
      } finally {
        setBusy(false);
      }
    },
    [isDemoCheckout],
  );

  const pollInvoice = useCallback(
    async (id: string, token: GeneratedToken, kind: "primary_mint" | "secondary_buy") => {
      const res = await fetch(`/api/slicepay/status/${encodeURIComponent(id)}`);
      const data = await res.json();
      if (data.paid || isPaidStatus(data.status)) {
        await completeSlicePayFlow(token, id, kind);
        return true;
      }
      return false;
    },
    [completeSlicePayFlow],
  );

  useEffect(() => {
    if (!invoiceId || !pendingTokenRef.current || !checkoutPending) return;
    const token = pendingTokenRef.current;
    const kind = checkoutKind;
    const interval = setInterval(() => {
      void pollInvoice(invoiceId, token, kind);
    }, 3000);
    return () => clearInterval(interval);
  }, [invoiceId, checkoutPending, checkoutKind, pollInvoice]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!SLICEPAY_ORIGINS.includes(event.origin)) return;
      if (!messageLooksPaid(event.data)) return;
      const rec = event.data && typeof event.data === "object" ? (event.data as Record<string, unknown>) : {};
      const id = messageInvoiceId(event.data) ?? (rec.invoiceId != null ? String(rec.invoiceId) : null) ?? invoiceId;
      const token = pendingTokenRef.current ?? selected;
      if (!id || !token) return;
      setInvoiceId(id);
      void completeSlicePayFlow(token, id, checkoutKind);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [invoiceId, selected, checkoutKind, completeSlicePayFlow]);

  useEffect(() => {
    const raw = searchParams.get("token");
    if (!raw || searchParams.get("slicepay") || searchParams.get("invoiceId")) return;
    const id = Number(raw);
    if (!Number.isFinite(id)) return;
    const token = collection.tokens.find((t) => t.tokenId === id);
    if (token) setSelected(token);
  }, [searchParams, collection.tokens]);

  useEffect(() => {
    if (returnHandledRef.current) return;
    const { invoiceId: retId, tokenId, status } = parseSlicePayReturnParams(searchParams.toString());
    if (!retId) return;
    if (!searchParams.get("slicepay") && !isPaidStatus(status) && !searchParams.get("invoiceId")) return;
    returnHandledRef.current = true;
    const token =
      tokenId != null
        ? collection.tokens.find((t) => t.tokenId === tokenId) ?? null
        : collection.tokens[0] ?? null;
    if (!token) return;
    setSelected(token);
    setInvoiceId(retId);
    setCheckoutPending(true);
    if (isPaidStatus(status)) {
      void completeSlicePayFlow(token, retId, token.listing ? "secondary_buy" : "primary_mint");
    } else {
      void pollInvoice(retId, token, token.listing ? "secondary_buy" : "primary_mint");
    }
  }, [searchParams, collection.tokens, completeSlicePayFlow, pollInvoice]);

  async function completeOnChainMint(tokenId?: number, snapshot?: Collection) {
    if (!publicKey) {
      await connect();
      return;
    }
    const col = snapshot ?? collection;
    setMintBusy(true);
    setMessage(null);
    try {
      const resolvedTokenId =
        tokenId ??
        col.pendingMint?.tokenId ??
        pendingOnChainToken?.tokenId ??
        col.tokens[0]?.tokenId;

      if (!col.pendingMint || col.pendingMint.tokenId !== resolvedTokenId) {
        const res = await fetch("/api/gift/mint", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            collectionId: col.id,
            tokenId: resolvedTokenId,
            payer: publicKey,
            network: clientNetwork,
          }),
        });
        const data = await readJsonResponse<{
          txBase64?: string;
          assetAddress?: string;
          collection?: Collection;
          error?: string;
        }>(res);
        if (!res.ok) throw new Error(data.error ?? "Could not build mint transaction");
        if (data.collection) setCollection(data.collection);
      }

      setMessage("Approve the mint in your wallet…");
      const mintNetwork = await getClientNetwork();
      const txSignature = await signMintTx(col.id, mintNetwork);

      const confirmEndpoint = isGiftBundle(col)
        ? "/api/gift/mint"
        : `/api/collections/${col.id}/confirm-mint`;

      const confirm = await fetch(confirmEndpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collectionId: col.id,
          tokenId: resolvedTokenId,
          txSignature,
          network: mintNetwork,
        }),
      });
      const confirmed = await readJsonResponse<{ collection?: Collection; error?: string }>(confirm);
      if (!confirm.ok) throw new Error(confirmed.error ?? "Could not confirm mint");

      if (confirmed.collection) setCollection(confirmed.collection);
        setMessage("Minted on-chain! Check your wallet or Solana Explorer.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Mint failed");
    } finally {
      setMintBusy(false);
    }
  }

  async function startCheckout(token: GeneratedToken, kind: "primary_mint" | "secondary_buy" = "primary_mint") {
    if (kind === "primary_mint") {
      if (!destWallet) {
        await connectDestWallet();
        return;
      }
      try {
        await ensureQuoteAndDryRun(token, destWallet);
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Dry-run failed");
        return;
      }
    }
    if (!publicKey || isPhantom) {
      if (kind === "secondary_buy" || mintDest === "solana") {
        if (isPhantom) {
          setMessage("Phantom does not work with SlicePay. Connect Solflare, Backpack, or MetaMask.");
        }
        await connect({ excludeWalletIds: ["phantom"] });
        return;
      }
    }
    setBusy(true);
    setMessage(null);
    setInvoiceId(null);
    setIsDemoCheckout(false);
    setCheckoutKind(kind);
    pendingTokenRef.current = token;
    try {
      const amountUsd =
        kind === "secondary_buy" && token.listing
          ? token.listing.priceUsd
          : nftPrice(collection, token);
      const orderPrefix = kind === "secondary_buy" ? `secondary-${collection.id}-` : `mint-${collection.id}-`;
      const inv = await fetch("/api/slicepay/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountUsd,
          orderId: `${orderPrefix}${token.tokenId}-${Date.now()}`,
          description:
            kind === "secondary_buy"
              ? `Secondary: ${tokenName(collection, token)}`
              : tokenName(collection, token),
          redirectUrl: buildSlicePayReturnUrl(collection.slug || collection.id, token.tokenId),
          collectionId: collection.id,
          tokenId: token.tokenId,
          payerWallet: kind === "primary_mint" ? destWallet || publicKey : publicKey,
          kind,
        }),
      }).then((r) => r.json());
      if (inv.error) throw new Error(String(inv.error));
      if (inv.invoiceId) setInvoiceId(String(inv.invoiceId));
      if (inv.demo) {
        setIsDemoCheckout(true);
        setMessage("Demo mode: confirm below after reviewing the order.");
        setCheckoutPending(true);
        return;
      }
      if (inv.checkoutUrl) {
        setCheckoutPending(true);
        setMessage("Complete payment in the SlicePay window. This page will update automatically.");
        openSlicePayCheckout(String(inv.checkoutUrl));
      } else {
        throw new Error("SlicePay did not return a checkout URL");
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setBusy(false);
    }
  }

  async function payWithSol(token: GeneratedToken) {
    if (mintDest !== "solana") {
      setMessage("SOL pay-and-mint is only for Solana destinations. Pick Solana or pay with SlicePay.");
      return;
    }
    if (!publicKey) {
      await connect();
      return;
    }
    if (!platformWallet) {
      setMessage(
        "Platform payment wallet not configured on the server (ARWEAVE_SOLANA_KEY on Vercel). Try SlicePay or refresh and retry.",
      );
      return;
    }
    if (!collection.payments.creatorWallet) {
      setMessage("Creator payout wallet not configured.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await ensureQuoteAndDryRun(token, publicKey);
      await finalizeMint(token, "sol");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "SOL payment failed");
    } finally {
      setBusy(false);
    }
  }

  async function finalizeMint(
    token: GeneratedToken,
    method: "slicepay" | "sol" | "demo",
    txSignature?: string,
    confirmedInvoiceId?: string,
  ) {
    const payer = mintDest === "solana" ? publicKey : evmAddress;
    if (!payer) {
      await connectDestWallet();
      return;
    }
    let quoteId = dryRunId;
    if (!quoteId) {
      const quote = await ensureQuoteAndDryRun(token, payer);
      quoteId = quote.dryRunId;
    }
    if (!quoteId) throw new Error("Dry-run required before mint");
    const network = await getClientNetwork();
    setClientNetwork(network);
    const giftTo =
      mintDest === "solana" && collection.payments.giftMintEnabled && recipient ? recipient : payer;
    const res = await fetch(`/api/collections/${collection.id}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(await buildAuthHeaders(payer)),
      },
      body: JSON.stringify({
        action: "mint",
        payer,
        recipient: giftTo,
        qty: 1,
        tokenId: token.tokenId,
        method,
        invoiceId: method === "slicepay" ? (confirmedInvoiceId ?? invoiceId) : undefined,
        txSignature: method === "sol" ? txSignature : undefined,
        network,
        dryRunId: quoteId,
        destination: mintDest,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    if (data.collection) setCollection(data.collection);
    if (data.requiresDestinationMint) {
      setMessage("Approve the destination mint in your wallet. You pay this chain’s gas.");
      await completeEvmDestinationMint(token, payer, quoteId);
    } else if (data.requiresOnChainMint) {
      setMessage("Approve pay + mint in your wallet…");
      await payHomeDebitIfNeeded(payer, quoteId);
      await completeOnChainMint(token.tokenId, data.collection);
    } else {
      const feeNote =
        Array.isArray(data.feeBreakdowns) && data.feeBreakdowns.length > 0
          ? ` · Holder pool +${formatUsd(
              data.feeBreakdowns.reduce(
                (sum: number, b: { holdersUsd: number }) => sum + b.holdersUsd,
                0,
              ),
            )}`
          : "";
      setMessage(`Minted #${data.mintedTokenIds.join(", ")} → ${data.recipient}${feeNote}`);
    }
    setCheckoutPending(false);
    setInvoiceId(null);
    setSelected(null);
    setDryRunId(null);
    setMintQuote(null);
  }

  async function payHomeDebitIfNeeded(wallet: string, quoteId: string) {
    let prep = await prepareDestinationMint({
      collectionId: collection.id,
      dryRunId: quoteId,
      wallet,
      debitPayer: publicKey ?? undefined,
    });
    if (prep.next === "need_solana_for_debit" || prep.next === "user_sign_solana_debit") {
      if (!publicKey) await connect();
      const solPayer = publicKey;
      if (!solPayer) {
        throw new Error("Connect a Solana wallet to lock this token on home. You pay that gas.");
      }
      if (prep.next === "need_solana_for_debit") {
        prep = await prepareDestinationMint({
          collectionId: collection.id,
          dryRunId: quoteId,
          wallet,
          debitPayer: solPayer,
        });
      }
      if (prep.next === "user_sign_solana_debit") {
        if (!prep.txBase64) throw new Error("Home debit transaction was not returned");
        setMessage("Approve home-chain debit in your Solana wallet. You pay this gas.");
        const sig = await signAndSendTx(prep.txBase64);
        const next = await confirmHomeDebit({
          collectionId: collection.id,
          dryRunId: quoteId,
          wallet,
          txHash: sig,
        });
        setCollection(next);
      }
      return;
    }
    if (prep.next !== "user_send_debit") return;
    if (!prep.to || !prep.data) throw new Error("Home debit transaction was not returned");
    if (!evmAddress) await connectEvm();
    await ensureAvalancheChain();
    setMessage("Approve home-chain debit in MetaMask or Core. You pay this gas.");
    const txHash = await sendContractTx(prep.to, prep.data);
    const next = await confirmHomeDebit({
      collectionId: collection.id,
      dryRunId: quoteId,
      wallet,
      txHash,
    });
    setCollection(next);
  }

  async function completeEvmDestinationMint(token: GeneratedToken, wallet: string, quoteId: string) {
    await payHomeDebitIfNeeded(wallet, quoteId);
    await ensureAvalancheChain();
    const prep = await prepareDestinationMint({
      collectionId: collection.id,
      dryRunId: quoteId,
      wallet,
      debitPayer: publicKey ?? undefined,
    });
    if (prep.next === "solana_sign_mint") {
      await completeOnChainMint(token.tokenId);
      return;
    }
    if (!prep.to || !prep.data) throw new Error("Destination mint transaction was not returned");
    const txHash = await sendContractTx(prep.to, prep.data);
    const next = await confirmDestinationMint({
      collectionId: collection.id,
      dryRunId: quoteId,
      wallet,
      txHash,
    });
    setCollection(next);
    const loc = next.tokens.find((t) => t.tokenId === token.tokenId)?.location;
    if (loc === "in_flight") {
      setMessage("Mint submitted. Waiting for Fuji L1 remote…");
      const arrived = await confirmL1Arrival({
        collectionId: collection.id,
        tokenId: token.tokenId,
        wallet,
      });
      if (arrived) {
        setCollection(arrived);
        setMessage(`Minted #${token.tokenId} onto Avalanche L1`);
      }
    } else {
      setMessage(`Minted #${token.tokenId} onto ${chainLabel(mintDest)}`);
    }
  }

  async function finalizeSecondaryBuy(token: GeneratedToken, confirmedInvoiceId?: string) {
    const loc = token.location ?? "solana";
    const payer = loc === "solana" ? publicKey : evmAddress;
    if (!payer) return;
    const res = await fetch(`/api/collections/${collection.id}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(await buildAuthHeaders(payer)),
      },
      body: JSON.stringify({
        action: "buy_secondary",
        payer,
        tokenId: token.tokenId,
        method: isDemoCheckout ? "demo" : "slicepay",
        invoiceId: confirmedInvoiceId ?? invoiceId,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setCollection(data.collection);
    const feeNote = data.feeBreakdown
      ? ` · Royalties: holder +${formatUsd(data.feeBreakdown.holdersUsd)}, buyback +${formatUsd(data.feeBreakdown.buybackUsd)}`
      : "";
    setMessage(`Purchased #${token.tokenId}${feeNote}`);
    setCheckoutPending(false);
    setInvoiceId(null);
    setSelected(null);
  }

  async function listForSale(token: GeneratedToken) {
    const wallet =
      token.owner?.startsWith("0x") ? evmAddress : publicKey;
    if (!wallet) {
      if (token.owner?.startsWith("0x")) await connectEvm();
      else await connect();
      return;
    }
    const priceUsd = Number(listPrice);
    if (!priceUsd || priceUsd <= 0) {
      setMessage("Enter a valid list price.");
      return;
    }
    setBusy(true);
    try {
      const headers = {
        "Content-Type": "application/json",
        ...(await buildAuthHeaders(wallet)),
      };
      const res = await fetch(`/api/collections/${collection.id}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "list_secondary", tokenId: token.tokenId, priceUsd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCollection(data.collection);
      setMessage(`#${token.tokenId} listed at ${formatUsd(priceUsd)}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Listing failed");
    } finally {
      setBusy(false);
    }
  }

  async function unlist(token: GeneratedToken) {
    const wallet = token.owner?.startsWith("0x") ? evmAddress : publicKey;
    if (!wallet) return;
    setBusy(true);
    try {
      const headers = {
        "Content-Type": "application/json",
        ...(await buildAuthHeaders(wallet)),
      };
      const res = await fetch(`/api/collections/${collection.id}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "unlist_secondary", tokenId: token.tokenId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCollection(data.collection);
      setMessage(`#${token.tokenId} unlisted`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unlist failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmMint(token: GeneratedToken) {
    if (!publicKey) {
      await connect();
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      if (checkoutKind === "secondary_buy") {
        await finalizeSecondaryBuy(token);
      } else {
        await finalizeMint(token, isDemoCheckout ? "demo" : "slicepay");
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Mint failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[26rem] bg-[radial-gradient(ellipse_at_top,rgba(226,60,47,0.14),transparent_58%)]"
      />
    <div className="container relative mx-auto max-w-6xl px-4 py-6 sm:py-10">
      {isUnmintedGift && pendingOnChainToken && (
        <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-amber-200">
              #{pendingOnChainToken.tokenId} paid. On-chain mint pending
            </p>
            <p className="text-xs text-amber-200/70 mt-0.5">
              Metadata is stored permanently, but the Solana NFT still needs to be minted.
            Connect your wallet as the payer and approve the transaction (~0.002 SOL rent + fees).
            </p>
          </div>
          <button
            type="button"
            onClick={() => void completeOnChainMint(pendingOnChainToken.tokenId)}
            disabled={mintBusy}
            className="shrink-0 rounded-full bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/80 disabled:opacity-50"
          >
            {mintBusy ? "Minting…" : publicKey ? "Mint on-chain now" : "Connect & mint"}
          </button>
        </div>
      )}

      {collection.blindMint && !collection.revealed && (
        <div className="mb-6 rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm text-white/60">
          Blind mint active. Art reveals when the collection hits its reveal trigger or the creator reveals manually.
        </div>
      )}

      {slicePayLive === false && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-100/90">
          SlicePay checkout is not live. Set SLICEPAY_MERCHANT_ID and SLICEPAY_API_KEY on the server.
        </div>
      )}

      {message && (
        <p className="mb-4 text-sm text-white/60">{message}</p>
      )}

      <div className="overflow-hidden rounded-3xl border border-white/12 bg-card">
        <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="p-4 sm:p-8">
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:gap-5 sm:text-left">
            <div className="collection-logo-frame mb-0 h-28 w-28 shrink-0 rounded-2xl p-1.5 sm:h-32 sm:w-32">
              {logoSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoSrc}
                  alt={collection.name}
                  className="collection-logo"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-white/30">
                  {collection.name.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.22em] text-white/40">
                {chainLabel(collectionHomeChain(collection)).toUpperCase()} · {collection.symbol}
              </p>
              <h1 className="mt-2 break-words text-3xl font-bold tracking-tight text-white sm:text-5xl">{collection.name}</h1>
              <div className="mt-4">
                <CollectionSocialLinks socials={socials} />
              </div>
            </div>
          </div>
          <p className="mt-5 max-w-xl font-[family-name:var(--font-body)] text-sm leading-6 text-white/60">
            {collection.description}
          </p>
          {collection.holderPageUnlocked && (
            <p className="mt-4 text-sm">
              <Link
                href={`/collection/${collection.slug || collection.id}/holders`}
                className="text-primary underline-offset-2 hover:underline"
              >
                Holder lounge
              </Link>
            </p>
          )}

          <MintProgress
            minted={soldCount}
            supply={collection.supply || collection.tokens.length}
            className="mt-8"
          />

          <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Floor" value={formatUsdAndSol(stats.floorUsd, solUsd)} tip="Lowest listing, or cheapest remaining mint price" />
            <Stat label="Volume" value={formatUsdAmount(stats.volumeUsd)} tip="All-time primary + secondary sales" />
            <Stat label="Market cap" value={formatUsdAmount(stats.marketCapUsd)} tip="Floor × total supply" />
            <Stat label="Price from" value={formatUsdAndSol(collection.payments.basePriceUsd, solUsd)} />
            <Stat label="Available" value={String(remaining)} />
            <Stat label="Sold" value={String(soldCount)} />
          </dl>
        </div>

        <div className="border-t border-white/10 p-4 sm:p-8 lg:border-l lg:border-t-0">
          <h2 className="text-2xl">Fee structure</h2>
          <p className="mt-2 font-[family-name:var(--font-body)] text-sm text-white/50">
            Creator split locks at launch. Ginger marketplace fees are fixed and deducted before your split.
          </p>
          <div className="mt-5 flex h-3 overflow-hidden rounded-full border border-white/15">
            <div className="bg-primary" style={{ width: `${fees.ownerPercent}%` }} />
            <div className="bg-white" style={{ width: `${fees.holdersPercent}%` }} />
            <div className="bg-[#f5c542]" style={{ width: `${fees.buybackPercent}%` }} />
          </div>
          <ul className="mt-4 space-y-3 font-[family-name:var(--font-body)] text-sm">
            <FeeRow color="bg-primary" label="Creator" percent={fees.ownerPercent} note="Your share after marketplace fees" />
            <FeeRow color="bg-white" label="Holders" percent={fees.holdersPercent} note="Shared with current holders" />
            <FeeRow color="bg-[#f5c542]" label="Buyback" percent={fees.buybackPercent} note="Platform swaps this share into the creator treasury SPL" />
          </ul>
          {fees.buybackPercent > 0 && buybackTreasuryWallet && (
            <div className="mt-4 rounded-xl border border-[#f5c542]/25 bg-[#f5c542]/5 px-3 py-2.5">
              <p className="text-xs font-medium text-[#f5c542]">Buyback treasury wallet</p>
              <p className="mt-1 text-xs text-white/50">
                SPL from each buyback lands in this wallet.
              </p>
              <a
                href={explorerAddressUrl("solana", buybackTreasuryWallet, {
                  solanaClusterQuery: explorerCluster,
                })}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 block break-all font-mono text-xs text-white/80 hover:text-[#f5c542] hover:underline"
              >
                {buybackTreasuryWallet}
              </a>
            </div>
          )}
          <CollectionContractLinks
            variant="tile"
            collection={collection}
            solanaClusterQuery={explorerCluster}
            avalancheNetwork={avalancheNetwork}
          />
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/50">
            <p className="font-medium text-white/70">Ginger marketplace (fixed)</p>
            <p className="mt-1">Primary: {PRIMARY_PLATFORM_FEE_PERCENT}% + {PRIMARY_TRADE_TAX_PERCENT}% trade tax ({PRIMARY_PLATFORM_TOTAL_PERCENT}% total)</p>
            <p>Secondary: {SECONDARY_PLATFORM_FEE_PERCENT}%</p>
          </div>
        </div>
        </div>
      </div>

      <section className="mt-12">
        <div className="mb-5 flex flex-col items-start justify-between gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <h2 className="text-3xl sm:text-4xl">The collection</h2>
          <p className="font-[family-name:var(--font-mono)] text-xs text-white/50">
            {tokens.length} shown · {remaining} for sale · {soldCount} sold
          </p>
        </div>

        <div className="sticky top-2 z-20 mb-5 rounded-2xl border border-white/10 bg-background/90 p-3 backdrop-blur-md">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <input
              className="input min-h-11 lg:max-w-xs"
              placeholder="Search # or name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              enterKeyHint="search"
            />
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
              {(["all", "for_sale", "sold", "listed"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value)}
                  className={`min-h-11 shrink-0 rounded-full px-3.5 text-xs capitalize transition ${
                    statusFilter === value
                      ? "bg-primary text-white"
                      : "border border-white/12 bg-white/5 text-white/60 hover:text-white"
                  }`}
                >
                  {value === "for_sale" ? "For sale" : value}
                </button>
              ))}
            </div>
            <label className="flex w-full items-center gap-2 text-xs text-white/50 sm:w-auto">
              Rarity
              <select
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-white/12 bg-white/5 px-2 text-white sm:min-h-0 sm:flex-none"
                value={rarityFilter}
                onChange={(e) => setRarityFilter(e.target.value as OverallRarityFilter)}
              >
                <option value="all">All rarities</option>
                {OVERALL_RARITY_ORDER.map((value) => (
                  <option key={value} value={value}>
                    {OVERALL_RARITY_LABEL[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex w-full items-center gap-2 text-xs text-white/50 sm:ml-auto sm:w-auto">
              Sort
              <select
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-white/12 bg-white/5 px-2 text-white sm:min-h-0 sm:flex-none"
                value={sort}
                onChange={(e) => setSort(e.target.value as TokenSort)}
              >
                <option value="id_asc">Token ID</option>
                <option value="price_asc">Price: low to high</option>
                <option value="price_desc">Price: high to low</option>
                <option value="rarity_asc">Rarity: rarest first</option>
                <option value="rarity_desc">Rarity: most common first</option>
              </select>
            </label>
          </div>
          {traitFilterOptions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-white/8 pt-3">
              {traitFilterOptions.map(({ traitType, values }) => (
                <label key={traitType} className="text-xs text-white/60">
                  {traitType}
                  <select
                    className="ml-1 rounded-lg border border-white/12 bg-white/5 px-2 py-1 text-white"
                    value={traitFilters[traitType] ?? ""}
                    onChange={(e) =>
                      setTraitFilters((prev) => {
                        const next = { ...prev };
                        if (e.target.value) next[traitType] = e.target.value;
                        else delete next[traitType];
                        return next;
                      })
                    }
                  >
                    <option value="">All</option>
                    {values.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}
        </div>

        {tokens.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-white/50">
            No NFTs match those filters.
          </p>
        ) : (
          <>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5">
          {visibleTokens.map((token, index) => {
            const sold = isTokenSold(token, collection);
            const listed = Boolean(token.listing);
            const priceUsd = tokenAskPrice(collection, token);
            const rarity = tokenOverallRarity(
              token,
              collection.supply || collection.tokens.length,
              rarityRanks,
            );
            return (
              <button
                key={token.tokenId}
                type="button"
                onClick={() => {
                  setSelected(token);
                  setCheckoutPending(false);
                  setInvoiceId(null);
                  setMessage(null);
                }}
                className={`nft-card group text-left ${OVERALL_RARITY_FRAME[rarity]}`}
              >
                <div className={`nft-tile-media ${sold ? "is-sold" : ""}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={tokenThumbSrc(collection, token, 480)}
                    alt={tokenName(collection, token)}
                    loading={index < 4 ? "eager" : "lazy"}
                    decoding="async"
                    width={480}
                    height={480}
                    className={sold ? undefined : "transition duration-500 group-hover:scale-[1.04]"}
                  />
                </div>
                <div className="border-t border-white/10 px-2.5 py-2 sm:px-3 sm:py-2.5">
                  <div className="truncate text-[13px] font-medium text-white sm:text-sm">
                    {tokenName(collection, token)}
                  </div>
                  <div className="mt-0.5 font-[family-name:var(--font-mono)] text-[10px] tracking-[0.12em] text-white/40">
                    #{token.tokenId}
                  </div>
                  <div className="mt-2 flex min-w-0 items-center gap-1">
                    <span
                      className={`min-w-0 truncate rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${OVERALL_RARITY_CLASS[rarity]}`}
                    >
                      {OVERALL_RARITY_LABEL[rarity]}
                    </span>
                    <span
                      className={`min-w-0 truncate rounded-full px-2 py-0.5 font-[family-name:var(--font-mono)] text-[10px] ${
                        sold && !listed ? "bg-white text-black" : "bg-primary/90 text-white"
                      }`}
                    >
                      {sold && !listed ? "SOLD" : formatUsdAndSol(priceUsd, solUsd)}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        {visibleCount < tokens.length && (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() => setVisibleCount((n) => n + COLLECTION_GRID_PAGE_SIZE)}
              className="rounded-full border border-white/15 bg-white/5 px-5 py-2 text-sm text-white/80 hover:border-white/30 hover:text-white"
            >
              Load more · {tokens.length - visibleCount} remaining
            </button>
          </div>
        )}
          </>
        )}
      </section>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="tile max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-t-3xl border border-white/15 bg-[#161311] pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl sm:pb-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid md:grid-cols-2">
              <div className={`nft-tile-media ${isTokenSold(selected, collection) ? "is-sold" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={tokenImageSrc(collection, selected)}
                  alt={tokenName(collection, selected)}
                />
              </div>
              <div className="bg-[#161311] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-[family-name:var(--font-mono)] text-[11px] text-white/40">
                      {isTokenSold(selected, collection) ? "SOLD" : "AVAILABLE"}
                    </p>
                    <h3 className="mt-1 break-words text-2xl font-bold text-white sm:text-3xl">{tokenName(collection, selected)}</h3>
                    <div className="mt-2">
                      <TokenLocationBadge location={selected.location} />
                    </div>
                    {(() => {
                      const rarity = tokenOverallRarity(
                        selected,
                        collection.supply || collection.tokens.length,
                        rarityRanks,
                      );
                      const rank = rarityRanks.get(selected.tokenId) ?? tokenRarityRank(selected);
                      return (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${OVERALL_RARITY_CLASS[rarity]}`}>
                            {OVERALL_RARITY_LABEL[rarity]}
                          </span>
                          {rank != null && (
                            <span className="text-xs text-white/45">
                              Rank {rank}/{collection.supply || collection.tokens.length}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  <button onClick={() => setSelected(null)} className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center text-sm text-white/70">
                    Close
                  </button>
                </div>
                <p className="mt-3 text-lg font-semibold text-white">
                  {formatUsdAndSol(tokenAskPrice(collection, selected), solUsd)}
                </p>
                <dl className="mt-4 grid grid-cols-2 gap-2">
                  {selected.attributes
                    .filter((a) => a.trait_type !== "Rarity Rank")
                    .map((a) => {
                      const traitP = collection.traitPricing?.[a.trait_type]?.[String(a.value)];
                      return (
                        <div key={a.trait_type} className="border border-white/10 p-2">
                          <dt className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.12em] text-white/40">
                            {a.trait_type.toUpperCase()}
                          </dt>
                          <dd className="mt-1 flex items-center justify-between gap-2 text-sm text-white">
                            <span>{String(a.value)}</span>
                            {traitP && (
                              <span className={`rounded-full px-1.5 py-0.5 text-[10px] capitalize ${
                                traitP.rarity === "epic"   ? "bg-primary/20 text-primary" :
                                traitP.rarity === "rare"   ? "bg-[#f5c542]/20 text-[#f5c542]" :
                                                             "bg-white/10 text-white/40"
                              }`}>
                                {traitP.rarity}{traitP.priceModifier > 0 ? ` +${formatUsd(traitP.priceModifier)}` : ""}
                              </span>
                            )}
                          </dd>
                        </div>
                      );
                    })}
                </dl>

                {isTokenSold(selected, collection) && (
                  <div className="mt-4 space-y-2 rounded border border-white/10 bg-white/5 px-3 py-3 text-xs">
                    {selected.owner && (
                      <div>
                        <p className="text-white/40 uppercase tracking-wider text-[10px]">Owner wallet</p>
                        <p className="mt-0.5 font-mono text-white break-all">{selected.owner}</p>
                        <p className="mt-1 text-white/40">
                          The NFT was sent to this address. Check this wallet in{" "}
                          {isEvmAddress(selected.owner) ? "MetaMask or Core" : "Phantom"}.
                        </p>
                      </div>
                    )}
                    {selected.assetAddress && (
                      <a
                        href={
                          selected.location && selected.location !== "solana" && selected.location !== "in_flight"
                            ? explorerNftUrl(
                                selected.location,
                                selected.spokeAddress || selected.assetAddress,
                                selected.tokenId,
                                { avalancheNetwork },
                              )
                            : explorerAddressUrl("solana", selected.assetAddress, {
                                solanaClusterQuery: explorerCluster,
                              })
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-primary hover:underline"
                      >
                        View asset on {selected.location === "solana" || !selected.location ? "Solana Explorer" : "Snowtrace"} ↗
                      </a>
                    )}
                    {selected.mintTxUrl && (
                      <a
                        href={selected.mintTxUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-primary hover:underline"
                      >
                        View mint transaction ↗
                      </a>
                    )}
                  </div>
                )}

                <p className="mt-3 text-lg font-semibold text-white">
                  {formatUsdAndSol(tokenAskPrice(collection, selected), solUsd)}
                </p>

                {/* Secondary: buy listed token */}
                {collection.secondaryEnabled && selected.listing && selected.owner !== publicKey && (
                  <div className="mt-5 space-y-3">
                    <p className="text-xs text-white/50">Secondary listing</p>
                    <p className="text-xs leading-5 text-amber-200/80">
                      Phantom does not work with SlicePay. Use Solflare, Backpack, or MetaMask.
                    </p>
                    {checkoutPending ? (
                      <>
                        <p className="text-sm text-white/60">
                          Waiting for SlicePay… this page updates automatically when payment completes.
                        </p>
                        {(isDemoCheckout || !slicePayLive) && (
                          <button
                            disabled={busy}
                            onClick={() => void confirmMint(selected)}
                            className="w-full border border-white/15 py-3 text-sm font-medium disabled:opacity-40"
                          >
                            {busy ? "Confirming…" : "Confirm purchase (demo)"}
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        disabled={busy || !collection.payments.acceptSlicePay}
                        onClick={() => void startCheckout(selected, "secondary_buy")}
                        className="w-full bg-primary py-3 text-sm font-medium text-white disabled:opacity-40"
                      >
                        {busy ? "Opening SlicePay…" : `Buy for ${formatUsdAndSol(selected.listing.priceUsd, solUsd)}`}
                      </button>
                    )}
                  </div>
                )}

                {/* Secondary: owner list / unlist */}
                {collection.secondaryEnabled &&
                  isTokenSold(selected, collection) &&
                  (selected.owner === publicKey ||
                    (Boolean(evmAddress) && selected.owner?.toLowerCase() === evmAddress?.toLowerCase())) && (
                  <div className="mt-5 space-y-3 border-t border-white/10 pt-4">
                    <p className="text-xs text-white/50">Your NFT on the secondary market</p>
                    {selected.listing ? (
                      <>
                        <p className="text-sm text-white">Listed at {formatUsdAndSol(selected.listing.priceUsd, solUsd)}</p>
                        <button
                          disabled={busy}
                          onClick={() => void unlist(selected)}
                          className="w-full border border-white/15 py-2 text-sm"
                        >
                          Remove listing
                        </button>
                      </>
                    ) : (
                      <>
                        <input
                          className="input"
                          type="number"
                          min={0}
                          step={0.01}
                          placeholder="List price (USD)"
                          value={listPrice}
                          onChange={(e) => setListPrice(e.target.value)}
                        />
                        <button
                          disabled={busy}
                          onClick={() => void listForSale(selected)}
                          className="w-full bg-white/10 py-2 text-sm text-white hover:bg-white/15"
                        >
                          List for sale
                        </button>
                      </>
                    )}
                  </div>
                )}

                {!isTokenSold(selected, collection) && collection.status === "live" && (
                  <div className="mt-5 space-y-3">
                    {destinations.length > 1 && (
                      <div>
                        <p className="text-xs text-white/50">Mint onto</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {destinations.map((dest) => (
                            <button
                              key={dest}
                              type="button"
                              onClick={() => {
                                setMintDest(dest);
                                setDryRunId(null);
                                setMintQuote(null);
                              }}
                              className={`rounded-full px-3 py-1 text-xs ${
                                mintDest === dest ? "bg-primary text-white" : "bg-white/10 text-white/60"
                              }`}
                            >
                              {CHAIN_DESCRIPTORS[dest].label}
                            </button>
                          ))}
                        </div>
                        <p className="mt-2 text-[11px] text-white/45">
                          Connect the wallet for that chain. You pay its gas. If you mint off the home chain, you also pay a small home-chain debit in that chain’s wallet. Ginger does not.
                        </p>
                      </div>
                    )}
                    {mintQuote && (
                      <dl className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/60 space-y-1">
                        <div className="flex justify-between"><dt>Mint</dt><dd>{formatUsd(mintQuote.lineItems.mintUsd)}</dd></div>
                        <div className="flex justify-between"><dt>Ginger 1%</dt><dd>{formatUsd(mintQuote.lineItems.platformUsd)}</dd></div>
                        <div className="flex justify-between"><dt>Creator</dt><dd>{formatUsd(mintQuote.lineItems.creatorUsd)}</dd></div>
                        {mintQuote.offHome && mintQuote.lineItems.homeDebitUsd > 0 && (
                          <div className="flex justify-between"><dt>Home debit gas (you pay)</dt><dd>{formatUsd(mintQuote.lineItems.homeDebitUsd)}</dd></div>
                        )}
                        <div className="flex justify-between"><dt>Dest gas ({mintQuote.destGasSymbol}, you pay)</dt><dd>{formatUsd(mintQuote.lineItems.destGasUsd)}</dd></div>
                      </dl>
                    )}
                    {mintDest === "solana" && collection.payments.giftMintEnabled && (
                      <input
                        className="input"
                        placeholder="Gift to Solana wallet (optional)"
                        value={recipient}
                        onChange={(e) => setRecipient(e.target.value)}
                      />
                    )}
                    {mintDest !== "solana" && !evmAddress && (
                      <button
                        type="button"
                        onClick={() => void connectEvm()}
                        className="w-full rounded-lg border border-primary/50 py-2 text-sm text-white"
                      >
                        Connect MetaMask or Core
                      </button>
                    )}

                    {(collection.payments.acceptSlicePay ||
                      collection.payments.acceptSol ||
                      collection.payments.acceptUsdc ||
                      collection.payments.acceptAvax) && (
                      <div className="flex gap-2 text-xs">
                        {collection.payments.acceptSol && mintDest === "solana" && (
                          <button
                            type="button"
                            onClick={() => setPaymentMethod("sol")}
                            className={`rounded-full px-3 py-1 ${paymentMethod === "sol" ? "bg-primary text-white" : "bg-white/10 text-white/60"}`}
                          >
                            SOL
                          </button>
                        )}
                        {collection.payments.acceptSlicePay && (
                          <button
                            type="button"
                            onClick={() => setPaymentMethod("slicepay")}
                            className={`rounded-full px-3 py-1 ${paymentMethod === "slicepay" ? "bg-primary text-white" : "bg-white/10 text-white/60"}`}
                          >
                            SlicePay
                          </button>
                        )}
                      </div>
                    )}

                    {paymentMethod === "slicepay" && collection.payments.acceptSlicePay && (
                      <p className="text-xs leading-5 text-amber-200/80">
                        Phantom does not work with SlicePay. Use Solflare, Backpack, or MetaMask.
                      </p>
                    )}

                    {paymentMethod === "sol" && collection.payments.acceptSol ? (
                      <button
                        disabled={busy || !platformWalletReady || !platformWallet}
                        onClick={() => void payWithSol(selected)}
                        className="w-full bg-primary py-3 text-sm font-medium text-primary-foreground disabled:opacity-40"
                      >
                        {!platformWalletReady
                          ? "Loading payment config…"
                          : !platformWallet
                            ? "SOL pay unavailable (server wallet not set)"
                            : busy
                              ? "Approve in wallet…"
                              : publicKey
                                ? `Mint for ${formatUsdAndSol(nftPrice(collection, selected), solUsd)}`
                                : "Connect wallet"}
                      </button>
                    ) : checkoutPending ? (
                      <>
                        <p className="text-sm text-white/60">
                          Waiting for SlicePay… complete payment in the popup window.
                        </p>
                        {(isDemoCheckout || slicePayLive === false) && (
                          <button
                            disabled={busy}
                            onClick={() => void confirmMint(selected)}
                            className="w-full border border-white/15 py-3 text-sm font-medium disabled:opacity-40"
                          >
                            {busy ? "Confirming…" : "Confirm mint (demo)"}
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        disabled={busy || !collection.payments.acceptSlicePay}
                        onClick={() => void startCheckout(selected, "primary_mint")}
                        className="w-full bg-primary py-3 text-sm font-medium text-primary-foreground disabled:opacity-40"
                      >
                        {busy ? "Opening SlicePay…" : publicKey ? "Pay with SlicePay" : "Connect wallet"}
                      </button>
                    )}
                  </div>
                )}
                {message && <p className="mt-3 text-sm text-white/50">{message}</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}

function Stat({ label, value, tip }: { label: string; value: string; tip?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3" title={tip}>
      <dt className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.14em] text-white/50">
        {label.toUpperCase()}
      </dt>
      <dd className="mt-1 text-xl text-white">{value}</dd>
    </div>
  );
}

function FeeRow({
  color,
  label,
  percent,
  note,
}: {
  color: string;
  label: string;
  percent: number;
  note: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className={`mt-1 h-3 w-3 shrink-0 ${color}`} />
      <span>
        <span className="font-medium">
          {label} · {percent}%
        </span>
        <span className="block text-xs text-white/50">{note}</span>
      </span>
    </li>
  );
}
