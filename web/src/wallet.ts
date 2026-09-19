import {
  createWalletClient,
  custom,
  getAddress,
  type Address,
} from 'viem'

export async function connectWallet() {
  if (!window.ethereum) {
    throw new Error('No browser wallet found. Install MetaMask, Rabby, or another EIP-1193 wallet.')
  }

  const accounts = (await window.ethereum.request({
    method: 'eth_requestAccounts',
  })) as string[]

  if (!accounts?.[0]) throw new Error('Wallet did not return an account.')

  const address = getAddress(accounts[0])
  const walletClient = createWalletClient({
    account: address,
    transport: custom(window.ethereum),
  })

  return { address, walletClient }
}

/**
 * Clear this site's wallet session and ask wallets that support EIP-2255 to
 * revoke the account permission. Many wallets do not implement revocation,
 * so the UI must still clear its local state when this request is rejected.
 */
export async function disconnectWallet() {
  if (!window.ethereum) return

  try {
    await window.ethereum.request({
      method: 'wallet_revokePermissions',
      params: [{ eth_accounts: {} }],
    })
  } catch {
    // Local logout remains valid for wallets without revoke support.
  }
}

export type AppWalletClient = Awaited<ReturnType<typeof connectWallet>>['walletClient']
export type WalletAddress = Address
