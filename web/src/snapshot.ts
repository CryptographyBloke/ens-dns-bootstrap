import type { Address } from 'viem'
import type { AppWalletClient } from './wallet'

const sequencerUrl = import.meta.env.VITE_SNAPSHOT_SEQUENCER_URL || 'https://seq.snapshot.org'
const apiUrl = import.meta.env.VITE_SNAPSHOT_API_URL || 'https://hub.snapshot.org/graphql'

const snapshotDomain = {
  name: 'snapshot',
  version: '0.1.4',
} as const

const snapshotProfileTypes = {
  Profile: [
    { name: 'from', type: 'address' },
    { name: 'timestamp', type: 'uint64' },
    { name: 'profile', type: 'string' },
  ],
} as const

export async function readSnapshotAvatar(address: Address): Promise<string | null> {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `query WalletAvatar($id: String!) {
        user(id: $id) { avatar }
      }`,
      variables: { id: address },
    }),
  })

  const body = (await response.json().catch(() => ({}))) as {
    data?: { user?: { avatar?: unknown } | null }
    errors?: Array<{ message?: string }>
  }

  if (!response.ok || body.errors?.length) {
    throw new Error(body.errors?.[0]?.message || `Snapshot profile lookup failed (HTTP ${response.status}).`)
  }

  return typeof body.data?.user?.avatar === 'string' ? body.data.user.avatar : null
}

export async function publishSnapshotAvatar(
  walletClient: AppWalletClient,
  address: Address,
  avatarURI: string,
) {
  if (avatarURI.length > 256) throw new Error('The avatar URI is too long for a Snapshot profile.')

  const timestamp = Math.floor(Date.now() / 1000)
  const message = {
    from: address,
    timestamp: BigInt(timestamp),
    profile: JSON.stringify({ avatar: avatarURI }),
  }

  const signature = await walletClient.signTypedData({
    account: address,
    domain: snapshotDomain,
    types: snapshotProfileTypes,
    primaryType: 'Profile',
    message,
  })

  // Keep the JSON envelope compatible with snapshot.js, which serializes the
  // uint64 timestamp as a regular JSON number.
  const wireMessage = { ...message, timestamp }

  const response = await fetch(sequencerUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      address,
      sig: signature,
      data: {
        domain: snapshotDomain,
        types: snapshotProfileTypes,
        message: wireMessage,
      },
    }),
  })

  const body = (await response.json().catch(() => ({}))) as {
    error?: string | { message?: string }
    message?: string
  }

  if (!response.ok || body.error) {
    const error = typeof body.error === 'string' ? body.error : body.error?.message
    throw new Error(error || body.message || `Snapshot profile publish failed (HTTP ${response.status}).`)
  }

  // Stamp caches resolved avatars. A cache miss here must not make a successful
  // Snapshot profile update look like a failed publish.
  await fetch(`https://cdn.stamp.fyi/clear/avatar/eth:${address}`).catch(() => undefined)
}
