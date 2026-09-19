import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  zeroAddress,
  type Address,
} from 'viem'
import { mainnet } from 'viem/chains'
import { getEnsName, getEnsResolver, namehash } from 'viem/ens'

const ensRpcUrl = import.meta.env.VITE_ENS_RPC_URL || 'https://cloudflare-eth.com'

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(ensRpcUrl),
})

const resolverAbi = [
  {
    type: 'function',
    name: 'setText',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'key', type: 'string' },
      { name: 'value', type: 'string' },
    ],
    outputs: [],
  },
] as const

type EnsAvatarResult =
  | { updated: true; name: string; direct: boolean }
  | { updated: false; reason: 'no-ens-record' | 'no-resolver' }

/**
 * Best-effort compatibility adapter. Snapshot is the source that makes the
 * no-gas path complete; this only writes ENS when the wallet already has a
 * valid primary name or an already-claimed address reverse record. It never
 * creates an ENS record, so wallets without one stay on the gasless path.
 */
export async function publishEnsAvatar(
  address: Address,
  avatarURI: string,
): Promise<EnsAvatarResult> {
  const primaryName = await getEnsName(publicClient, { address })
  const reverseName = `${address.slice(2).toLowerCase()}.addr.reverse`
  const name = primaryName || reverseName

  const resolverAddress = await getEnsResolver(publicClient, { name })
  if (!resolverAddress || resolverAddress === zeroAddress) {
    return { updated: false, reason: primaryName ? 'no-resolver' : 'no-ens-record' }
  }

  if (!window.ethereum) return { updated: false, reason: 'no-ens-record' }

  await window.ethereum.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: '0x1' }],
  })

  const ensWalletClient = createWalletClient({
    account: address,
    chain: mainnet,
    transport: custom(window.ethereum),
  })

  const hash = await ensWalletClient.writeContract({
    address: resolverAddress,
    abi: resolverAbi,
    functionName: 'setText',
    args: [namehash(name), 'avatar', avatarURI],
    account: address,
    chain: mainnet,
  })

  await publicClient.waitForTransactionReceipt({ hash })
  return { updated: true, name, direct: !primaryName }
}
