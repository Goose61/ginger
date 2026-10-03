import type { Collection, MintDestination } from "@/lib/types";
import { buildAuthHeaders } from "@/lib/wallet-auth-client";
import { readJsonResponse } from "@/lib/fetch-json";

export type MintQuotePayload = {
  dryRunId: string;
  collectionId: string;
  tokenId: number;
  destination: MintDestination;
  recipient: string;
  home: string;
  offHome: boolean;
  recipientKind?: "solana" | "evm";
  destinations?: MintDestination[];
  lineItems: {
    mintUsd: number;
    platformUsd: number;
    creatorUsd: number;
    destGasUsd: number;
    homeDebitUsd: number;
    bufferUsd: number;
    totalUsd: number;
  };
  destGasNative: number;
  destGasSymbol: string;
  avaxUsd: number;
  solUsd: number;
};

export async function requestMintQuote(params: {
  collectionId: string;
  tokenId: number;
  destination: MintDestination;
  recipient: string;
}): Promise<MintQuotePayload> {
  const res = await fetch(`/api/collections/${params.collectionId}/mint-quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tokenId: params.tokenId,
      destination: params.destination,
      recipient: params.recipient,
    }),
  });
  const data = await readJsonResponse<{ quote?: MintQuotePayload; error?: string }>(res);
  if (!res.ok || !data.quote) throw new Error(data.error || "Could not quote mint");
  return data.quote;
}

export async function runMintDryRun(collectionId: string, dryRunId: string): Promise<void> {
  const res = await fetch(`/api/collections/${collectionId}/mint-dry-run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dryRunId }),
  });
  const data = await readJsonResponse<{ ok?: boolean; error?: string }>(res);
  if (!res.ok) throw new Error(data.error || "Dry-run failed. Mint refused.");
}

export async function prepareDestinationMint(params: {
  collectionId: string;
  dryRunId: string;
  wallet: string;
  debitPayer?: string;
}): Promise<{
  next?: "solana_sign_mint" | "user_send_mint" | "user_send_debit" | "user_sign_solana_debit" | "need_solana_for_debit";
  to?: `0x${string}`;
  data?: `0x${string}`;
  txBase64?: string;
  homeDebitTx?: string;
}> {
  const res = await fetch(`/api/collections/${params.collectionId}/destination-mint`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await buildAuthHeaders(params.wallet)),
    },
    body: JSON.stringify({
      dryRunId: params.dryRunId,
      action: "prepare",
      debitPayer: params.debitPayer,
    }),
  });
  const data = (await readJsonResponse(res)) as {
    error?: string;
    next?: "solana_sign_mint" | "user_send_mint" | "user_send_debit" | "user_sign_solana_debit" | "need_solana_for_debit";
    to?: `0x${string}`;
    data?: `0x${string}`;
    txBase64?: string;
    homeDebitTx?: string;
  };
  if (!res.ok) throw new Error(data.error || "Could not prepare destination mint");
  return data;
}

export async function confirmHomeDebit(params: {
  collectionId: string;
  dryRunId: string;
  wallet: string;
  txHash: string;
}): Promise<Collection> {
  const res = await fetch(`/api/collections/${params.collectionId}/destination-mint`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await buildAuthHeaders(params.wallet)),
    },
    body: JSON.stringify({ dryRunId: params.dryRunId, action: "confirm_debit", txHash: params.txHash }),
  });
  const data = await readJsonResponse<{ collection?: Collection; error?: string }>(res);
  if (!res.ok || !data.collection) throw new Error(data.error || "Could not confirm home debit");
  return data.collection;
}

export async function confirmDestinationMint(params: {
  collectionId: string;
  dryRunId: string;
  wallet: string;
  txHash: string;
}): Promise<Collection> {
  const res = await fetch(`/api/collections/${params.collectionId}/destination-mint`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await buildAuthHeaders(params.wallet)),
    },
    body: JSON.stringify({ dryRunId: params.dryRunId, action: "confirm", txHash: params.txHash }),
  });
  const data = await readJsonResponse<{ collection?: Collection; error?: string }>(res);
  if (!res.ok || !data.collection) throw new Error(data.error || "Could not confirm destination mint");
  return data.collection;
}

export async function confirmL1Arrival(params: {
  collectionId: string;
  tokenId: number;
  wallet: string;
}): Promise<Collection | null> {
  const res = await fetch(`/api/collections/${params.collectionId}/l1-confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await buildAuthHeaders(params.wallet)),
    },
    body: JSON.stringify({ tokenId: params.tokenId }),
  });
  const data = await readJsonResponse<{ collection?: Collection; error?: string }>(res);
  if (!res.ok) return null;
  return data.collection ?? null;
}
