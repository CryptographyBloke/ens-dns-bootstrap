import { addEnsContracts } from '@ensdomains/ensjs'
import { getName, getResolver, getTextRecord } from '@ensdomains/ensjs/public'
import { getDnsImportData, importDnsName } from '@ensdomains/ensjs/dns'
import { setPrimaryName, setRecords } from '@ensdomains/ensjs/wallet'
import {
  createPublicClient,
  createWalletClient,
  custom,
  getAddress,
  http,
  type Address,
  type WalletClient,
} from 'viem'
import { mainnet } from 'viem/chains'

const chain = addEnsContracts(mainnet)

export const publicClient = createPublicClient({
  chain,
  transport: http(),
})

export type ConnectedWallet = {
  address: Address
  walletClient: WalletClient
}

export async function connectWallet(): Promise<ConnectedWallet> {
  if (!window.ethereum) {
    throw new Error('No browser wallet found. Install MetaMask, Rabby, or another EIP-1193 wallet.')
  }

  await window.ethereum.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: '0x1' }],
  })

  const accounts = (await window.ethereum.request({
    method: 'eth_requestAccounts',
  })) as string[]

  if (!accounts?.[0]) throw new Error('Wallet did not return an account.')

  const address = getAddress(accounts[0])
  const walletClient = createWalletClient({
    account: address,
    chain,
    transport: custom(window.ethereum),
  })

  return { address, walletClient }
}

export async function getPrimaryName(address: Address) {
  const result = await getName(publicClient, { address })
  if (!result?.match || !result.name) return null
  return result.name
}

export async function getAvatarRecord(name: string) {
  return getTextRecord(publicClient, { name, key: 'avatar' })
}

export async function getResolverAddress(name: string) {
  return getResolver(publicClient, { name })
}

export async function ensureDnsNameImported(
  name: string,
  address: Address,
  walletClient: WalletClient,
) {
  let resolverAddress = await getResolverAddress(name)
  if (resolverAddress) return resolverAddress

  const dnsImportData = await getDnsImportData(publicClient, { name })
  const hash = await importDnsName(walletClient, {
    name,
    address,
    dnsImportData,
    account: address,
  })
  await publicClient.waitForTransactionReceipt({ hash })

  resolverAddress = await getResolverAddress(name)
  if (!resolverAddress) {
    throw new Error('ENS claim completed but no resolver is visible yet. Wait a moment and try again.')
  }
  return resolverAddress
}

export async function publishAvatarRecord({
  name,
  address,
  avatarUrl,
  resolverAddress,
  walletClient,
}: {
  name: string
  address: Address
  avatarUrl: string
  resolverAddress: Address
  walletClient: WalletClient
}) {
  const hash = await setRecords(walletClient, {
    name,
    coins: [{ coin: 'ETH', value: address }],
    texts: [{ key: 'avatar', value: avatarUrl }],
    resolverAddress,
    account: address,
  })
  await publicClient.waitForTransactionReceipt({ hash })
  return hash
}

export async function ensurePrimaryName(
  name: string,
  address: Address,
  walletClient: WalletClient,
) {
  const current = await getName(publicClient, { address })
  if (current?.match && current.name?.toLowerCase() === name.toLowerCase()) return null

  const hash = await setPrimaryName(walletClient, {
    name,
    account: address,
  })
  await publicClient.waitForTransactionReceipt({ hash })
  return hash
}
