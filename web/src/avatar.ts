import type { Address, WalletClient } from 'viem'

const AVATAR_BASE = 'https://euc.li'

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1]
  if (!base64) throw new Error('Invalid image data.')
  const binary = atob(base64)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const view = new Uint8Array(digest)
  return ('0x' + Array.from(view, (byte) => byte.toString(16).padStart(2, '0')).join('')) as `0x${string}`
}

export async function fileToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.')
  if (file.size > 5 * 1024 * 1024) throw new Error('Image is too large. Keep it under 5 MB.')

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read image.'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })
}

export function avatarEndpoint(name: string) {
  return `${AVATAR_BASE}/${name}`
}

export function isManagedAvatarUrl(value: string | null | undefined, name: string) {
  if (!value) return false
  const endpoint = avatarEndpoint(name)
  return value === endpoint || value.startsWith(`${endpoint}?`)
}

export async function uploadAvatar({
  name,
  address,
  dataUrl,
  walletClient,
}: {
  name: string
  address: Address
  dataUrl: string
  walletClient: WalletClient
}) {
  const endpoint = avatarEndpoint(name)
  const hash = await sha256Hex(dataUrlToBytes(dataUrl))
  const expiry = String(Date.now() + 7 * 24 * 60 * 60 * 1000)

  const sig = await walletClient.signTypedData({
    account: address,
    primaryType: 'Upload',
    domain: {
      name: 'Ethereum Name Service',
      version: '1',
    },
    types: {
      Upload: [
        { name: 'upload', type: 'string' },
        { name: 'expiry', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'hash', type: 'string' },
      ],
    },
    message: {
      upload: 'avatar',
      expiry,
      name,
      hash,
    },
  })

  const response = await fetch(endpoint, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expiry,
      dataURL: dataUrl,
      sig,
      unverifiedAddress: address,
    }),
  })

  const body = (await response.json()) as { message?: string; error?: string }
  if (!response.ok || body.message !== 'uploaded') {
    throw new Error(body.error || `Avatar upload failed (HTTP ${response.status}).`)
  }

  return endpoint
}
