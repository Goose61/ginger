import { buildAuthHeaders } from "./wallet-auth-client";
import { readJsonResponse } from "./fetch-json";
import type { Collection } from "./types";
import type { EvmSpokeChainId } from "./evm-spoke-chains";

export async function deployEvmSpoke(params: {
  collectionId: string;
  spokeChain: EvmSpokeChainId;
  evmWallet: string;
  sendContractTx: (to: `0x${string}`, data: `0x${string}`) => Promise<`0x${string}`>;
  confirmWallet: string;
  ensureEvmChain?: (chainId: number) => Promise<void>;
}): Promise<{ collection: Collection; address: string; txHash: string }> {
  const evmHeaders = {
    "Content-Type": "application/json",
    ...(await buildAuthHeaders(params.evmWallet)),
  };
  const prepRes = await fetch(`/api/collections/${params.collectionId}/evm-collection/prepare`, {
    method: "POST",
    headers: evmHeaders,
    body: JSON.stringify({ spokeChain: params.spokeChain }),
  });
  const prep = await readJsonResponse<{
    to?: `0x${string}`;
    data?: `0x${string}`;
    collectionAddress?: string;
    chainId?: number;
    error?: string;
  }>(prepRes);
  if (prepRes.status === 409 && prep.collectionAddress) {
    const getRes = await fetch(`/api/collections/${params.collectionId}`);
    const getData = await readJsonResponse<{ collection?: Collection }>(getRes);
    return {
      collection: getData.collection ?? ({} as Collection),
      address: prep.collectionAddress,
      txHash: "",
    };
  }
  if (!prepRes.ok) throw new Error(prep.error || "Could not prepare spoke deploy");
  if (!prep.to || !prep.data) throw new Error("Spoke deploy transaction missing");
  if (prep.chainId && params.ensureEvmChain) await params.ensureEvmChain(prep.chainId);
  const txHash = await params.sendContractTx(prep.to, prep.data);
  const confRes = await fetch(`/api/collections/${params.collectionId}/evm-collection/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await buildAuthHeaders(params.confirmWallet)),
    },
    body: JSON.stringify({ txHash, spokeChain: params.spokeChain }),
  });
  const conf = await readJsonResponse<{ collection?: Collection; collectionAddress?: string; error?: string }>(
    confRes,
  );
  if (!confRes.ok || !conf.collection) throw new Error(conf.error || "Could not confirm spoke deploy");
  if (!conf.collectionAddress) throw new Error("Spoke address missing from confirm");
  return { collection: conf.collection, address: conf.collectionAddress, txHash };
}
