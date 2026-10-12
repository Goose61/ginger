/**
 * Platform-paid Metaplex Core mint into a collection's Solana spoke (EVM-home omnichain).
 */
import {
  createSignerFromKeypair,
  generateSigner,
  keypairIdentity,
  publicKey as umiPublicKey,
} from "@metaplex-foundation/umi";
import { create } from "@metaplex-foundation/mpl-core";
import { base64 } from "@metaplex-foundation/umi/serializers";
import { getDirectRpcUrl, getSolanaNetwork, type SolanaNetwork } from "./solana-config";
import { createMintUmi, fetchLatestBlockhash } from "./mint-umi";
import { fetchCoreCollection } from "./core-collection";
import { getPlatformSecretKey } from "./platform-key";
import { coreImmutableMetadataPlugins } from "./mint-nft";
import { collectionSolanaSpokeAddress } from "./collection-spoke";
import type { Collection } from "./types";

async function sendRawTx(rpcUrl: string, txBase64: string): Promise<string> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "sendTransaction",
      params: [txBase64, { encoding: "base64", skipPreflight: false, preflightCommitment: "confirmed" }],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const json = (await res.json()) as { result?: string; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  if (!json.result) throw new Error("Solana sendTransaction returned no signature");
  return json.result;
}

export async function executeSolanaSpokeMint(params: {
  collection: Collection;
  tokenId: number;
  name: string;
  metadataUri: string;
  recipient: string;
  network?: SolanaNetwork;
}): Promise<{ txSignature: string; assetAddress: string; coreCollectionAddress: string }> {
  const spokeCore = collectionSolanaSpokeAddress(params.collection);
  if (!spokeCore) throw new Error("Solana spoke Core collection is not configured");

  const platformSecret = getPlatformSecretKey();
  if (!platformSecret) throw new Error("Platform Solana key missing for spoke mint");

  const network = params.network ?? getSolanaNetwork();
  const rpcUrl = getDirectRpcUrl(network);
  const umi = createMintUmi(network);

  const platformKeypair = umi.eddsa.createKeypairFromSecretKey(platformSecret);
  const platformSigner = createSignerFromKeypair(umi, platformKeypair);
  umi.use(keypairIdentity(platformKeypair));

  const assetSigner = generateSigner(umi);
  const collection = await fetchCoreCollection(umi, spokeCore, network);
  const blockhash = await fetchLatestBlockhash(rpcUrl);

  const builder = create(umi, {
    asset: assetSigner,
    name: params.name,
    uri: params.metadataUri,
    owner: umiPublicKey(params.recipient),
    payer: platformSigner,
    collection,
    authority: platformSigner,
    plugins: coreImmutableMetadataPlugins(),
  });

  let tx = await builder.useV0().setFeePayer(platformSigner).setBlockhash(blockhash.blockhash).build(umi);
  tx = await platformSigner.signTransaction(tx);
  tx = await assetSigner.signTransaction(tx);

  const serialized = umi.transactions.serialize(tx);
  const txBase64 = base64.deserialize(serialized)[0];
  const txSignature = await sendRawTx(rpcUrl, txBase64);

  return {
    txSignature,
    assetAddress: assetSigner.publicKey.toString(),
    coreCollectionAddress: spokeCore,
  };
}
