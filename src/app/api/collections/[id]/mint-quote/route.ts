import { NextRequest, NextResponse } from "next/server";
import { getCollection, updateCollection } from "@/lib/store";
import { nftPrice } from "@/lib/collection-ui";
import {
  PRIMARY_PLATFORM_TOTAL_PERCENT,
} from "@/lib/platform-fees";
import { getQuote } from "@/lib/quotes";
import { fetchAvaxUsd } from "@/lib/avax-price";
import { nativeUsdForDestination } from "@/lib/evm-native-usd";
import {
  collectionHomeChain,
  collectionMintDestinations,
  evmRpcForDestination,
  isDestinationWallet,
  parseMintDestination,
} from "@/lib/chain-registry";
import { collectionHomeLedger, homeLedgerToMintDestination } from "@/lib/home-ledger";
import { mintIsOffHome } from "@/lib/omnichain";
import { evmSpokeChainMeta, mintDestinationToSpokeChain } from "@/lib/evm-spoke-chains";
import { tokenAlreadyIssued, simulateHomeDebit } from "@/lib/home-debit";
import {
  collectionEvmAddress,
  encodeMintTo,
  encodeL1MintFromHome,
  estimateEvmGas,
  l1RemoteOrThrow,
} from "@/lib/evm-collection";
import { getMintStepMinLamports } from "@/lib/gift-fees";
import { SOL_USD_FALLBACK } from "@/lib/sol-price";
import type { Address } from "viem";
import { avalancheL1MintEnabled, getAvalancheL1RpcUrl } from "@/lib/avalanche-config";
import { randomUUID } from "crypto";
import { rememberDryRun, type MintDryRunRecord } from "@/lib/mint-dry-run-store";
import {
  mintCheckoutUsd,
  quoteRelayerLineItems,
  relayerExecutionAvailable,
} from "@/lib/omnichain";
import type { MintExecutionMode } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const collection = await getCollection(id);
    if (!collection) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const body = (await req.json()) as {
      tokenId?: number;
      destination?: string;
      recipient?: string;
      executionMode?: MintExecutionMode;
    };
    const tokenId = Number(body.tokenId);
    const dest = parseMintDestination(
      body.destination,
      collectionMintDestinations(collection)[0],
    );
    const recipient = String(body.recipient || "").trim();
    const allowed = collectionMintDestinations(collection);
    if (!allowed.includes(dest)) {
      return NextResponse.json(
        { error: `Destination ${dest} is not enabled for this collection` },
        { status: 400 },
      );
    }
    if (dest === "avalanche_l1" && !avalancheL1MintEnabled()) {
      return NextResponse.json(
        { error: "Avalanche L1 minting is not enabled on this network" },
        { status: 400 },
      );
    }
    if (!recipient || !isDestinationWallet(dest, recipient)) {
      return NextResponse.json(
        { error: dest === "solana" ? "Solana recipient wallet required" : "EVM recipient wallet required" },
        { status: 400 },
      );
    }
    const token = collection.tokens.find((t) => t.tokenId === tokenId);
    if (!token) return NextResponse.json({ error: "Token not found" }, { status: 404 });
    if (tokenAlreadyIssued(collection, tokenId)) {
      return NextResponse.json({ error: "Token already minted" }, { status: 400 });
    }

    const saleUsd = nftPrice(collection, token);
    const platformUsd = (saleUsd * PRIMARY_PLATFORM_TOTAL_PERCENT) / 100;
    const creatorUsd = saleUsd - platformUsd;
    const quote = await getQuote(saleUsd);
    const avaxUsd = await fetchAvaxUsd();
    const homeLedger = collectionHomeLedger(collection);
    const home = collectionHomeChain(collection);
    const offHome = mintIsOffHome(collection, dest);

    const nativeQuote = dest === "solana" ? { symbol: "SOL", usd: quote.solUsd || SOL_USD_FALLBACK } : await nativeUsdForDestination(dest);
    const destGasSymbol = nativeQuote.symbol;
    const recipientKind = dest === "solana" ? "solana" : "evm";
    let destGasUsd = 0;
    let homeDebitUsd = 0;
    let destGasNative = 0;

    if (dest === "solana") {
      const lamports = Number(getMintStepMinLamports());
      destGasNative = lamports / 1e9;
      destGasUsd = destGasNative * (quote.solUsd || SOL_USD_FALLBACK);
    } else {
      try {
        const spoke = mintDestinationToSpokeChain(dest);
        if (spoke && !evmSpokeChainMeta(spoke).mintReady && dest !== "avalanche" && dest !== "avalanche_l1") {
          return NextResponse.json(
            { error: `${evmSpokeChainMeta(spoke).label} minting is not enabled on this server yet.` },
            { status: 400 },
          );
        }
        const contract =
          dest === "avalanche_l1" ? l1RemoteOrThrow(collection) : collectionEvmAddress(collection, dest);
        if (contract && recipient.startsWith("0x") && token.metadataUri) {
          const data =
            dest === "avalanche_l1"
              ? encodeL1MintFromHome({
                  to: recipient as Address,
                  tokenId,
                  uri: token.metadataUri,
                })
              : encodeMintTo({
                  to: recipient as Address,
                  tokenId,
                  uri: token.metadataUri,
                  destination: dest,
                  home: homeLedger,
                });
          const est = await estimateEvmGas({
            to: contract,
            data,
            account: recipient as Address,
            rpcUrl: evmRpcForDestination(dest) ?? getAvalancheL1RpcUrl() ?? undefined,
            destination: dest,
          });
          destGasNative = Number(est.feeWei) / 1e18;
          destGasUsd = destGasNative * nativeQuote.usd;
        }
      } catch {
        destGasNative = 0.002;
        destGasUsd = destGasNative * nativeQuote.usd;
      }
    }

    if (offHome) {
      try {
        const sim = await simulateHomeDebit({
          collection,
          tokenId,
          destination: dest,
          uri: token.metadataUri ?? "",
        });
        if (sim.feeLamports) {
          homeDebitUsd = (sim.feeLamports / 1e9) * (quote.solUsd || SOL_USD_FALLBACK);
        } else if (sim.feeWei) {
          const homeNative = await nativeUsdForDestination(homeLedgerToMintDestination(homeLedger));
          homeDebitUsd = (Number(sim.feeWei) / 1e18) * homeNative.usd;
        }
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "Home debit quote failed" },
          { status: 400 },
        );
      }
    }

    const executionMode: MintExecutionMode =
      body.executionMode === "relayer" &&
      relayerExecutionAvailable(collection, dest)
        ? "relayer"
        : "self";
    const { relayerUsd, omnichainFeeUsd, bufferUsd } = quoteRelayerLineItems({
      mintUsd: saleUsd,
      destGasUsd,
      homeDebitUsd,
      executionMode,
      relayerAvailable: relayerExecutionAvailable(collection, dest),
    });
    const totalUsd = mintCheckoutUsd({
      mintUsd: saleUsd,
      executionMode,
      relayerUsd,
      omnichainFeeUsd,
    });

    const dryRunId = randomUUID();
    const rec: MintDryRunRecord = {
      dryRunId,
      collectionId: collection.id,
      tokenId,
      destination: dest,
      recipient,
      home,
      offHome,
      executionMode,
      lineItems: {
        mintUsd: saleUsd,
        platformUsd,
        creatorUsd,
        destGasUsd,
        homeDebitUsd,
        relayerUsd,
        omnichainFeeUsd,
        bufferUsd,
        totalUsd,
      },
      destGasNative,
      destGasSymbol,
      avaxUsd,
      solUsd: quote.solUsd,
      createdAt: Date.now(),
    };
    rememberDryRun(rec);
    await updateCollection(id, (current) => ({ ...current, activeMintQuote: rec }));

    return NextResponse.json({
      quote: {
        ...rec,
        recipientKind,
        destinations: allowed,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Quote failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
