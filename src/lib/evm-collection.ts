import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  decodeEventLog,
  encodeAbiParameters,
  keccak256,
  toBytes,
  type Hex,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalanche, avalancheFuji } from "viem/chains";
import {
  getAvalancheChainId,
  getAvalancheFactoryAddress,
  getAvalancheL1RemoteAddress,
  getAvalancheL1RpcUrl,
  getAvalancheNetwork,
  getAvalancheRpcUrl,
  getEvmMinterPrivateKey,
  snowtraceTxUrl,
} from "./avalanche-config";
import {
  type EvmSpokeChainId,
  factoryAddressForSpokeChain,
  getEvmNftChainDefinition,
  mintDestinationToSpokeChain,
  rpcUrlForSpokeChain,
  evmSpokeChainMeta,
  viemChainForSpokeId,
} from "./evm-spoke-chains";
import { collectionSpokeAddress } from "./collection-spoke";
import { explorerTxUrl } from "./chain-registry";
import {
  gingerFactoryAbi,
  gingerL1RemoteAbi,
  gingerNftAbi,
  LOCATION_HOME,
  LOCATION_L1,
  LOCATION_SPOKE,
} from "./ginger-nft-abi";
import type { ChainKey, Collection, MintDestination } from "./types";
import { collectionHomeChain, homeChainToDestination } from "./chain-registry";
import type { HomeLedger } from "./home-ledger";
import { collectionHomeLedger } from "./home-ledger";
import { collectionHomeEvmAddress } from "./collection-spoke";
import { registeredL1Remote } from "./l1-allowlist";

export function avalancheViemChain() {
  return getAvalancheNetwork() === "mainnet" ? avalanche : avalancheFuji;
}

export function avalanchePublicClient() {
  return createPublicClient({
    chain: avalancheViemChain(),
    transport: http(getAvalancheRpcUrl()),
  });
}

function l1PublicClient() {
  const rpc = getAvalancheL1RpcUrl() || getAvalancheRpcUrl();
  return createPublicClient({
    chain: avalancheViemChain(),
    transport: http(rpc),
  });
}

/** On-chain location: home dest → LOC_HOME, L1 → LOC_L1, any other dest → LOC_SPOKE. */
export function locationByte(dest: MintDestination, home?: ChainKey | HomeLedger): number {
  if (dest === "avalanche_l1") return LOCATION_L1;
  if (home && dest === homeChainToDestination(home)) return LOCATION_HOME;
  if (home) return LOCATION_SPOKE;
  if (dest === "avalanche") return LOCATION_SPOKE;
  return LOCATION_HOME;
}

/** EIP-1167 init code: 10-byte initializer + 45-byte runtime (55 bytes). */
export function eip1167CloneInitCode(implementation: Address): Hex {
  const addr = implementation.slice(2).toLowerCase().padStart(40, "0");
  return `0x3d602d80600a3d3981f3363d3d373d3d3d363d73${addr}5af43d82803e903d91602b57fd5bf3`;
}

export function encodeCreateCollection(params: {
  name: string;
  symbol: string;
  owner: Address;
  maxSupply: number;
  royaltyReceiver: Address;
  royaltyBps: number;
}): Hex {
  return encodeFunctionData({
    abi: gingerFactoryAbi,
    functionName: "createCollection",
    args: [
      params.name,
      params.symbol,
      params.owner,
      BigInt(params.maxSupply),
      params.royaltyReceiver,
      BigInt(params.royaltyBps),
    ],
  });
}

export function encodeMintTo(params: {
  to: Address;
  tokenId: number;
  uri: string;
  destination: MintDestination;
  home?: ChainKey | HomeLedger;
}): Hex {
  return encodeFunctionData({
    abi: gingerNftAbi,
    functionName: "mintTo",
    args: [params.to, BigInt(params.tokenId), params.uri, locationByte(params.destination, params.home)],
  });
}

export function encodeDebit(params: {
  tokenId: number;
  uri: string;
  destination: MintDestination;
  home?: ChainKey | HomeLedger;
}): Hex {
  return encodeFunctionData({
    abi: gingerNftAbi,
    functionName: "debit",
    args: [BigInt(params.tokenId), locationByte(params.destination, params.home), params.uri],
  });
}

export function encodeSafeTransfer(params: {
  from: Address;
  to: Address;
  tokenId: number;
}): Hex {
  return encodeFunctionData({
    abi: gingerNftAbi,
    functionName: "safeTransferFrom",
    args: [params.from, params.to, BigInt(params.tokenId)],
  });
}

export function encodeL1MintFromHome(params: {
  to: Address;
  tokenId: number;
  uri: string;
}): Hex {
  return encodeFunctionData({
    abi: gingerL1RemoteAbi,
    functionName: "mintFromHome",
    args: [params.to, BigInt(params.tokenId), params.uri],
  });
}

export function encodeSetApprovalForAll(operator: Address, approved: boolean): Hex {
  return encodeFunctionData({
    abi: gingerNftAbi,
    functionName: "setApprovalForAll",
    args: [operator, approved],
  });
}

export function mintAuthDigest(params: {
  contract: Address;
  to: Address;
  tokenId: number;
  uri: string;
  location: number;
  deadline: bigint;
}): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "uint8" },
        { type: "uint256" },
      ],
      [
        params.contract,
        params.to,
        BigInt(params.tokenId),
        keccak256(toBytes(params.uri)),
        params.location,
        params.deadline,
      ],
    ),
  );
}

export function debitAuthDigest(params: {
  contract: Address;
  tokenId: number;
  uri: string;
  location: number;
  deadline: bigint;
}): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "address" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "uint8" },
        { type: "uint256" },
      ],
      [
        keccak256(toBytes("GINGER_DEBIT_V1")),
        params.contract,
        BigInt(params.tokenId),
        keccak256(toBytes(params.uri)),
        params.location,
        params.deadline,
      ],
    ),
  );
}

function l1AuthDigest(params: {
  contract: Address;
  to: Address;
  tokenId: number;
  uri: string;
  deadline: bigint;
}): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "uint256" },
      ],
      [
        params.contract,
        params.to,
        BigInt(params.tokenId),
        keccak256(toBytes(params.uri)),
        params.deadline,
      ],
    ),
  );
}

export async function signUserMintAuthorization(params: {
  contract: Address;
  to: Address;
  tokenId: number;
  uri: string;
  destination: MintDestination;
  home?: ChainKey | HomeLedger;
  deadlineSeconds?: number;
}): Promise<{ deadline: bigint; signature: Hex; data: Hex }> {
  const account = minterAccount();
  const deadline = BigInt(Math.floor(Date.now() / 1000) + (params.deadlineSeconds ?? 20 * 60));
  if (params.destination === "avalanche_l1") {
    const digest = l1AuthDigest({
      contract: params.contract,
      to: params.to,
      tokenId: params.tokenId,
      uri: params.uri,
      deadline,
    });
    const signature = await account.signMessage({ message: { raw: digest } });
    const data = encodeFunctionData({
      abi: gingerL1RemoteAbi,
      functionName: "mintFromHomeWithAuthorization",
      args: [params.to, BigInt(params.tokenId), params.uri, deadline, signature],
    });
    return { deadline, signature, data };
  }
  const location = locationByte(params.destination, params.home);
  const digest = mintAuthDigest({
    contract: params.contract,
    to: params.to,
    tokenId: params.tokenId,
    uri: params.uri,
    location,
    deadline,
  });
  const signature = await account.signMessage({ message: { raw: digest } });
  const data = encodeFunctionData({
    abi: gingerNftAbi,
    functionName: "mintWithAuthorization",
    args: [
      params.to,
      BigInt(params.tokenId),
      params.uri,
      location,
      deadline,
      signature,
    ],
  });
  return { deadline, signature, data };
}

export async function signUserDebitAuthorization(params: {
  contract: Address;
  tokenId: number;
  uri: string;
  destination: MintDestination;
  home?: ChainKey | HomeLedger;
  deadlineSeconds?: number;
}): Promise<{ deadline: bigint; signature: Hex; data: Hex }> {
  const account = minterAccount();
  const deadline = BigInt(Math.floor(Date.now() / 1000) + (params.deadlineSeconds ?? 20 * 60));
  const location = locationByte(params.destination, params.home);
  const digest = debitAuthDigest({
    contract: params.contract,
    tokenId: params.tokenId,
    uri: params.uri,
    location,
    deadline,
  });
  const signature = await account.signMessage({ message: { raw: digest } });
  const data = encodeFunctionData({
    abi: gingerNftAbi,
    functionName: "debitWithAuthorization",
    args: [BigInt(params.tokenId), location, params.uri, deadline, signature],
  });
  return { deadline, signature, data };
}

export function resolveSpokeChainForEvm(params: {
  spokeChain?: EvmSpokeChainId;
  destination?: MintDestination;
}): EvmSpokeChainId {
  if (params.spokeChain) return params.spokeChain;
  if (params.destination === "avalanche_l1") return "avalanche";
  if (params.destination) {
    const spoke = mintDestinationToSpokeChain(params.destination);
    if (spoke) return spoke;
  }
  return "avalanche";
}

function evmPublicClient(spokeChain: EvmSpokeChainId, rpcUrl?: string) {
  const chain = viemChainForSpokeId(spokeChain);
  const rpc = rpcUrl ?? rpcUrlForSpokeChain(spokeChain);
  return createPublicClient({ chain, transport: http(rpc) });
}

export async function estimateEvmGas(params: {
  to: Address;
  data: Hex;
  account: Address;
  rpcUrl?: string;
  spokeChain?: EvmSpokeChainId;
  destination?: MintDestination;
}): Promise<{ gas: bigint; gasPrice: bigint; feeWei: bigint }> {
  const spoke = resolveSpokeChainForEvm(params);
  const client = evmPublicClient(spoke, params.rpcUrl);
  const gas = await client.estimateGas({
    account: params.account,
    to: params.to,
    data: params.data,
  });
  const gasPrice = await client.getGasPrice();
  return { gas, gasPrice, feeWei: gas * gasPrice };
}

export async function simulateEvmCall(params: {
  to: Address;
  data: Hex;
  account: Address;
  rpcUrl?: string;
  spokeChain?: EvmSpokeChainId;
  destination?: MintDestination;
}): Promise<void> {
  const spoke = resolveSpokeChainForEvm(params);
  const client = evmPublicClient(spoke, params.rpcUrl);
  await client.call({
    account: params.account,
    to: params.to,
    data: params.data,
  });
}

export function factoryAddressOrThrow(spokeChain: EvmSpokeChainId = "avalanche"): Address {
  const addr = factoryAddressForSpokeChain(spokeChain);
  if (!addr) {
    const meta = evmSpokeChainMeta(spokeChain);
    throw new Error(
      `${meta.label} factory is not configured. Deploy GingerCollectionFactory and set the EVM_FACTORY_ADDRESS_* env var.`,
    );
  }
  return addr as Address;
}

export function collectionEvmAddress(
  collection: Collection,
  destination?: MintDestination,
): Address | null {
  if (destination === "avalanche_l1" || destination === "solana") return null;
  const spoke = mintDestinationToSpokeChain(destination ?? "avalanche");
  if (!spoke) return null;
  const addr = collectionSpokeAddress(collection, spoke);
  if (!addr?.startsWith("0x")) return null;
  return addr as Address;
}

export function l1RemoteOrThrow(collection: Collection): Address {
  const addr = registeredL1Remote(collection);
  if (!addr) {
    throw new Error("Avalanche L1 remote is not configured. Set AVALANCHE_L1_REMOTE_ADDRESS.");
  }
  return addr as Address;
}

function minterPrivateKeyHex(spokeChain: EvmSpokeChainId = "avalanche"): Hex {
  const def = getEvmNftChainDefinition(spokeChain);
  const suffix = def?.envSuffix;
  let key = getEvmMinterPrivateKey();
  if (suffix && typeof process !== "undefined") {
    const override = process.env[`EVM_MINTER_KEY_${suffix}`]?.trim();
    if (override) key = override;
  }
  if (!key) throw new Error("AVALANCHE_MINTER_KEY is not set");
  return (key.startsWith("0x") ? key : `0x${key}`) as Hex;
}

export function minterAccount(spokeChain: EvmSpokeChainId = "avalanche") {
  return privateKeyToAccount(minterPrivateKeyHex(spokeChain));
}

export async function sendMinterTx(params: {
  to: Address;
  data: Hex;
  rpcUrl?: string;
  spokeChain?: EvmSpokeChainId;
  destination?: MintDestination;
}): Promise<{ txHash: Hex; explorerUrl: string }> {
  const spoke = resolveSpokeChainForEvm(params);
  const account = minterAccount(spoke);
  const chain = viemChainForSpokeId(spoke);
  const rpc = params.rpcUrl ?? rpcUrlForSpokeChain(spoke);
  const wallet = createWalletClient({
    account,
    chain,
    transport: http(rpc),
  });
  const hash = await wallet.sendTransaction({
    to: params.to,
    data: params.data,
    chain,
    account,
  });
  const publicClient = createPublicClient({ chain, transport: http(rpc) });
  await publicClient.waitForTransactionReceipt({ hash });
  const dest =
    params.destination ??
    (spoke === "avalanche" ? "avalanche" : (spoke as MintDestination));
  return { txHash: hash, explorerUrl: explorerTxUrl(dest, hash) };
}

export function parseCloneFromReceiptLogs(logs: { data: Hex; topics: Hex[] }[]): Address | null {
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: gingerFactoryAbi,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      });
      if (decoded.eventName === "CollectionCreated") {
        return decoded.args.clone as Address;
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

export function createCollectionTxRequest(
  collection: Collection,
  owner: Address,
  spokeChain: EvmSpokeChainId = "avalanche",
) {
  const factory = factoryAddressOrThrow(spokeChain);
  const royaltyReceiver = (collection.payments.creatorWallet.startsWith("0x")
    ? collection.payments.creatorWallet
    : owner) as Address;
  const data = encodeCreateCollection({
    name: collection.name,
    symbol: collection.symbol || collection.name.slice(0, 6).toUpperCase(),
    owner,
    maxSupply: collection.supply,
    royaltyReceiver,
    royaltyBps: collection.royaltyBps ?? 500,
  });
  return {
    to: factory,
    data,
    chainId: evmSpokeChainMeta(spokeChain).chainId,
  };
}

export function homeContractForDebit(collection: Collection): Address | null {
  const home = collectionHomeLedger(collection);
  if (home === "solana") return null;
  const addr = collectionHomeEvmAddress(collection, home);
  return addr ? (addr as Address) : null;
}
