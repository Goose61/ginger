import { NextRequest, NextResponse } from "next/server";
import { getCollection, saveCollection } from "@/lib/store";
import { consumeDryRun, requireSimulatedDryRun, withClearedMintQuote } from "@/lib/mint-dry-run-store";
import {
  buildCollectorSolanaDebitTx,
  prepareAvalancheHomeDebit,
  tokenAlreadyIssued,
} from "@/lib/home-debit";
import { avalancheL1MintEnabled, getAvalancheL1RpcUrl, snowtraceTxUrl } from "@/lib/avalanche-config";
import { requireWalletAuthAsync, assertPayerAuth } from "@/lib/wallet-auth";
import { toPublicCollection } from "@/lib/public-collection";
import { explorerNftUrl, collectionHomeChain, explorerTxUrl } from "@/lib/chain-registry";
import { isAllowedL1Remote } from "@/lib/l1-allowlist";
import { createPublicClient, http, type Address, type Hex } from "viem";
import { Connection } from "@solana/web3.js";
import { getDirectRpcUrl, getSolanaNetwork } from "@/lib/solana-config";
import {
  avalanchePublicClient,
  avalancheViemChain,
  collectionEvmAddress,
  encodeSafeTransfer,
  l1RemoteOrThrow,
  minterAccount,
  signUserMintAuthorization,
  simulateEvmCall,
} from "@/lib/evm-collection";
import type { Collection, MintDestination, TokenLocation } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const auth = await requireWalletAuthAsync(req);
    const body = (await req.json()) as {
      dryRunId?: string;
      action?: "prepare" | "confirm" | "confirm_debit" | "secondary_transfer";
      from?: string;
      txHash?: string;
      debitPayer?: string;
    };
    const collection = await getCollection(id);
    if (!collection) return NextResponse.json({ error: "not found" }, { status: 404 });
    const rec = requireSimulatedDryRun({
      dryRunId: String(body.dryRunId || ""),
      collectionId: id,
      collection,
    });
    assertPayerAuth(auth, rec.recipient);
    if (rec.destination === "avalanche_l1" && !avalancheL1MintEnabled()) {
      return NextResponse.json(
        { error: "Avalanche L1 minting is not enabled on this network" },
        { status: 400 },
      );
    }
    const token = collection.tokens.find((t) => t.tokenId === rec.tokenId);
    if (!token) return NextResponse.json({ error: "Token not found" }, { status: 404 });

    if (body.action === "secondary_transfer") {
      return prepareSecondaryTransfer(collection, rec.tokenId, rec.recipient as Address, body.txHash);
    }

    if (body.action === "confirm_debit") {
      return confirmHomeDebit(
        collection,
        rec.destination,
        rec.tokenId,
        rec.recipient,
        String(body.txHash || ""),
      );
    }

    if (body.action === "confirm") {
      const res = await confirmUserMint(
        collection,
        rec.destination,
        rec.tokenId,
        rec.recipient,
        String(body.txHash || ""),
        rec.dryRunId,
      );
      if (res.status < 400) consumeDryRun(rec.dryRunId);
      return res;
    }

    if (tokenAlreadyIssued(collection, rec.tokenId) && !token.homeDebitTx && token.location !== "in_flight") {
      return NextResponse.json({ error: "Token already minted" }, { status: 400 });
    }
    if (!token.metadataUri?.startsWith("http")) {
      return NextResponse.json({ error: "Token metadata is not published" }, { status: 400 });
    }

    const homeDebitTx = token.homeDebitTx;
    if (rec.offHome && !homeDebitTx) {
      const home = collectionHomeChain(collection);
      if (home === "avalanche") {
        const simulateFrom = rec.recipient.startsWith("0x")
          ? (rec.recipient as Address)
          : minterAccount().address;
        const debit = await prepareAvalancheHomeDebit({
          collection,
          tokenId: rec.tokenId,
          destination: rec.destination,
          uri: token.metadataUri,
          simulateFrom,
        });
        return NextResponse.json({
          ok: true,
          next: "user_send_debit",
          dryRunId: rec.dryRunId,
          to: debit.to,
          data: debit.data,
          deadline: debit.deadline,
        });
      }
      const payer = rec.recipient.startsWith("0x")
        ? String(body.debitPayer || "").trim()
        : rec.recipient;
      if (!payer || payer.startsWith("0x")) {
        return NextResponse.json(
          {
            error:
              "Connect a Solana wallet to lock this token on home, then mint onto Avalanche. You pay that gas.",
            next: "need_solana_for_debit",
          },
          { status: 400 },
        );
      }
      const built = await buildCollectorSolanaDebitTx({
        payer,
        collectionId: collection.id,
        tokenId: rec.tokenId,
        destination: rec.destination,
      });
      return NextResponse.json({
        ok: true,
        next: "user_sign_solana_debit",
        dryRunId: rec.dryRunId,
        txBase64: built.txBase64,
      });
    }

    if (rec.destination === "solana") {
      return NextResponse.json({
        ok: true,
        next: "solana_sign_mint",
        dryRunId: rec.dryRunId,
        homeDebitTx,
      });
    }

    const contract =
      rec.destination === "avalanche_l1"
        ? l1RemoteOrThrow(collection)
        : collectionEvmAddress(collection);
    if (!contract) throw new Error("Destination contract is not set");
    if (rec.destination === "avalanche_l1" && !isAllowedL1Remote(collection, contract)) {
      return NextResponse.json({ error: "L1 remote is not on the Ginger allowlist" }, { status: 400 });
    }

    const authz = await signUserMintAuthorization({
      contract,
      to: rec.recipient as Address,
      tokenId: rec.tokenId,
      uri: token.metadataUri,
      destination: rec.destination,
      home: collectionHomeChain(collection),
    });
    await simulateEvmCall({
      to: contract,
      data: authz.data,
      account: rec.recipient as Address,
      rpcUrl: rec.destination === "avalanche_l1" ? getAvalancheL1RpcUrl() || undefined : undefined,
    });

    return NextResponse.json({
      ok: true,
      next: "user_send_mint",
      dryRunId: rec.dryRunId,
      to: contract,
      data: authz.data,
      deadline: authz.deadline.toString(),
      homeDebitTx,
      chainId: rec.destination === "avalanche_l1" ? undefined : undefined,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Destination mint failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

async function confirmHomeDebit(
  collection: Collection,
  destination: MintDestination,
  tokenId: number,
  recipient: string,
  txHash: string,
) {
  if (!txHash) {
    return NextResponse.json({ error: "Home debit transaction required" }, { status: 400 });
  }
  const home = collectionHomeChain(collection);
  if (home === "avalanche") {
    if (!txHash.startsWith("0x")) {
      return NextResponse.json({ error: "C-Chain debit transaction hash required" }, { status: 400 });
    }
    const client = avalanchePublicClient();
    const receipt = await client.waitForTransactionReceipt({ hash: txHash as Hex });
    if (receipt.status !== "success") {
      return NextResponse.json({ error: "Home debit transaction failed" }, { status: 400 });
    }
  } else {
    const conn = new Connection(getDirectRpcUrl(getSolanaNetwork()), "confirmed");
    const found = await conn.getSignatureStatus(txHash, { searchTransactionHistory: true });
    const status = found.value?.confirmationStatus;
    if (!found.value || found.value.err || (status !== "confirmed" && status !== "finalized")) {
      return NextResponse.json({ error: "Solana home debit is not confirmed" }, { status: 400 });
    }
  }
  const next = applyTokenMint(collection, tokenId, {
    location: "in_flight",
    homeDebitTx: txHash,
    reservedBy: recipient,
    reservedAt: new Date().toISOString(),
  });
  await saveCollection(next);
  return NextResponse.json({
    ok: true,
    homeDebitTx: txHash,
    explorerUrl: explorerTxUrl(home === "avalanche" ? "avalanche" : "solana", txHash),
    collection: toPublicCollection(next),
  });
}

async function confirmUserMint(
  collection: Collection,
  destination: MintDestination,
  tokenId: number,
  recipient: string,
  txHash: string,
  dryRunId: string,
) {
  if (!txHash.startsWith("0x")) {
    return NextResponse.json({ error: "txHash required" }, { status: 400 });
  }
  const rpc =
    destination === "avalanche_l1" ? getAvalancheL1RpcUrl() || undefined : undefined;
  const client = rpc
    ? createPublicClient({ chain: avalancheViemChain(), transport: http(rpc) })
    : avalanchePublicClient();
  const receipt = await client.waitForTransactionReceipt({ hash: txHash as Hex });
  if (receipt.status !== "success") {
    return NextResponse.json({ error: "Mint transaction failed" }, { status: 400 });
  }
  const contract =
    destination === "avalanche_l1"
      ? l1RemoteOrThrow(collection)
      : collectionEvmAddress(collection);
  if (!contract) throw new Error("Destination contract is not set");
  const location: TokenLocation = destination;
  const token = collection.tokens.find((t) => t.tokenId === tokenId);
  const next = withClearedMintQuote(
    applyTokenMint(collection, tokenId, {
      owner: recipient,
      location,
      assetAddress: contract,
      mintTxUrl: snowtraceTxUrl(txHash),
      spokeAddress: contract,
      homeDebitTx: token?.homeDebitTx,
      icmMessageId: destination === "avalanche_l1" ? txHash : token?.icmMessageId,
      reservedBy: null,
      reservedAt: null,
      listing: null,
    }),
    dryRunId,
  );
  await saveCollection(next);
  return NextResponse.json({
    collection: toPublicCollection(next),
    txHash,
    explorerUrl: snowtraceTxUrl(txHash),
    nftUrl: explorerNftUrl(destination, contract, tokenId),
    location,
  });
}

async function prepareSecondaryTransfer(
  collection: Collection,
  tokenId: number,
  to: Address,
  txHash?: string,
) {
  const token = collection.tokens.find((t) => t.tokenId === tokenId);
  if (!token?.owner?.startsWith("0x")) {
    return NextResponse.json({ error: "On-chain transfer requires an Avalanche NFT" }, { status: 400 });
  }
  if (token.location === "in_flight") {
    return NextResponse.json({ error: "Token is still in flight" }, { status: 409 });
  }
  const contract = collectionEvmAddress(collection);
  if (!contract) {
    return NextResponse.json({ error: "Avalanche collection contract is not set" }, { status: 400 });
  }
  if (txHash?.startsWith("0x")) {
    const client = avalanchePublicClient();
    const receipt = await client.waitForTransactionReceipt({ hash: txHash as Hex });
    if (receipt.status !== "success") {
      return NextResponse.json({ error: "Transfer transaction failed" }, { status: 400 });
    }
    const next = applyTokenMint(collection, tokenId, {
      owner: to,
      location: token.location ?? "avalanche",
      listing: null,
      mintTxUrl: token.mintTxUrl,
      assetAddress: contract,
    });
    await saveCollection(next);
    return NextResponse.json({ collection: toPublicCollection(next), txHash });
  }
  const data = encodeSafeTransfer({
    from: token.owner as Address,
    to,
    tokenId,
  });
  const operator = minterAccount().address;
  await simulateEvmCall({ to: contract, data, account: operator });
  return NextResponse.json({
    ok: true,
    next: "operator_or_owner_transfer",
    to: contract,
    data,
    from: token.owner,
    operator,
  });
}

function applyTokenMint(
  collection: Collection,
  tokenId: number,
  patch: Partial<Collection["tokens"][number]>,
): Collection {
  const tokens = collection.tokens.map((t) => (t.tokenId === tokenId ? { ...t, listing: null, ...patch } : t));
  const mintedCount = tokens.filter((t) => t.owner).length;
  return {
    ...collection,
    tokens,
    mintedCount,
    status: mintedCount >= collection.supply ? "sold_out" : collection.status,
    updatedAt: new Date().toISOString(),
  };
}
