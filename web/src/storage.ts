import { upload as pineappleUpload } from '@snapshot-labs/pineapple'

const maxFileSize = 1024 * 1024
const supportedTypes = new Set(['image/jpeg', 'image/jpg', 'image/png'])

export function validateAvatarFile(file: File) {
  if (!supportedTypes.has(file.type)) throw new Error('Please choose a JPG or PNG image.')
  if (file.size > maxFileSize) throw new Error('Image is too large. Keep it under 1 MB.')
}

export async function uploadAvatar(file: File) {
  validateAvatarFile(file)

  const formData = new FormData()
  formData.append('file', file)

  const endpoint = import.meta.env.VITE_PINEAPPLE_URL || undefined
  const receipt = await pineappleUpload(formData, endpoint)
  const cid = typeof receipt?.cid === 'string' ? receipt.cid : receipt?.cid?.toString?.()

  if (!cid) throw new Error(receipt?.error?.message || 'Image upload did not return an IPFS CID.')
  return assertContentAddressedUri(`ipfs://${cid}`)
}

export function assertContentAddressedUri(uri: string) {
  const normalized = uri.trim()
  if (!/^(ipfs|ar):\/\//i.test(normalized)) {
    throw new Error('Avatar storage must return an ipfs:// or ar:// URI.')
  }
  if (normalized.length > 256) throw new Error('Avatar URI is too long for a Snapshot profile.')
  return normalized
}

export function resolveAvatarUri(uri: string | null | undefined) {
  if (!uri) return null
  const value = uri.trim()
  if (value.startsWith('ipfs://')) {
    const gateway = (import.meta.env.VITE_IPFS_GATEWAY || 'https://ipfs.io/ipfs/').replace(/\/$/, '')
    return `${gateway}/${value.slice('ipfs://'.length)}`
  }
  if (value.startsWith('ar://')) {
    const gateway = (import.meta.env.VITE_ARWEAVE_GATEWAY || 'https://arweave.net').replace(/\/$/, '')
    return `${gateway}/${value.slice('ar://'.length)}`
  }
  if (/^https?:\/\//i.test(value)) return value
  return null
}
