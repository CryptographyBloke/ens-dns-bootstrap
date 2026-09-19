import { useMemo, useState } from 'react'
import type { Address, WalletClient } from 'viem'
import {
  connectWallet,
  ensureDnsNameImported,
  ensurePrimaryName,
  getAvatarRecord,
  getPrimaryName,
  getResolverAddress,
  publishAvatarRecord,
} from './ens'
import {
  avatarEndpoint,
  fileToDataUrl,
  isManagedAvatarUrl,
  uploadAvatar,
} from './avatar'

type Step = 'idle' | 'connecting' | 'uploading' | 'claiming' | 'publishing' | 'primary' | 'done'

const queryName = new URLSearchParams(window.location.search).get('name') || ''

function shortAddress(address?: string) {
  if (!address) return ''
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function normalizeName(value: string) {
  return value.trim().replace(/\.$/, '').toLowerCase()
}

export default function App() {
  const [address, setAddress] = useState<Address>()
  const [walletClient, setWalletClient] = useState<WalletClient>()
  const [name, setName] = useState(() => queryName || localStorage.getItem('ens-avatar-name') || '')
  const [avatarRecord, setAvatarRecord] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [step, setStep] = useState<Step>('idle')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  const normalizedName = useMemo(() => normalizeName(name), [name])
  const connected = Boolean(address && walletClient)

  const loadNameState = async (nextName: string) => {
    const normalized = normalizeName(nextName)
    if (!normalized) return
    setName(normalized)
    localStorage.setItem('ens-avatar-name', normalized)
    try {
      const record = await getAvatarRecord(normalized)
      setAvatarRecord(record)
    } catch {
      setAvatarRecord(null)
    }
  }

  const handleConnect = async () => {
    setError(null)
    setNotice('')
    setStep('connecting')
    try {
      const connectedWallet = await connectWallet()
      setAddress(connectedWallet.address)
      setWalletClient(connectedWallet.walletClient)

      const primary = await getPrimaryName(connectedWallet.address)
      if (primary) {
        await loadNameState(primary)
        setNotice(`Found your primary ENS name: ${primary}`)
      } else if (normalizedName) {
        await loadNameState(normalizedName)
      } else {
        setNotice('Wallet connected. Enter the DNS/ENS name you want to use once.')
      }
      setStep('idle')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setStep('idle')
    }
  }

  const handleFile = async (file?: File) => {
    if (!file) return
    setError(null)
    try {
      setPreview(await fileToDataUrl(file))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const handlePublish = async () => {
    if (!address || !walletClient) return setError('Connect your wallet first.')
    if (!normalizedName) return setError('Enter your ENS or DNS name.')
    if (!preview) return setError('Choose an avatar first.')

    setError(null)
    setNotice('')
    try {
      await loadNameState(normalizedName)

      setStep('uploading')
      setNotice('Sign once to upload the image. This signature does not spend gas.')
      const uploadedUrl = await uploadAvatar({
        name: normalizedName,
        address,
        dataUrl: preview,
        walletClient,
      })

      let resolverAddress = await getResolverAddress(normalizedName)
      if (!resolverAddress) {
        setStep('claiming')
        setNotice('First-time setup: confirm the ENS DNS-import transaction in your wallet.')
        resolverAddress = await ensureDnsNameImported(normalizedName, address, walletClient)
      }

      const currentRecord = await getAvatarRecord(normalizedName)
      if (!isManagedAvatarUrl(currentRecord, normalizedName)) {
        setStep('publishing')
        setNotice('First-time setup: confirm one transaction to bind your address and avatar.')
        await publishAvatarRecord({
          name: normalizedName,
          address,
          avatarUrl: uploadedUrl,
          resolverAddress,
          walletClient,
        })
      }

      setStep('primary')
      setNotice('Making this name your wallet primary name if needed…')
      await ensurePrimaryName(normalizedName, address, walletClient)

      setAvatarRecord(avatarEndpoint(normalizedName))
      setPreview(null)
      setStep('done')
      setNotice('Avatar published. ENS-aware apps can now resolve it from your wallet address.')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      const dnsHint =
        /dns|proof|suffix|oracle|nsec|claim/i.test(message)
          ? ' If this is a new DNS name, make sure DNSSEC is active and _ens.<domain> contains a=<your wallet address>.'
          : ''
      setError(message + dnsHint)
      setStep('idle')
    }
  }

  const imageSrc = preview || avatarRecord || null
  const busy = !['idle', 'done'].includes(step)

  return (
    <main className="shell">
      <section className="card">
        <div className="brand">ENS Avatar</div>
        <h1>Your wallet. Your face.</h1>
        <p className="lead">
          Connect your wallet, choose an image, and publish one avatar that ENS-aware apps can reuse.
        </p>

        <div className="avatarWrap">
          {imageSrc ? (
            <img className="avatar" src={imageSrc} alt="Avatar preview" />
          ) : (
            <div className="avatar empty" aria-label="No avatar yet">+</div>
          )}
        </div>

        {!connected ? (
          <button className="primary" onClick={handleConnect} disabled={busy}>
            {step === 'connecting' ? 'Connecting…' : 'Connect wallet'}
          </button>
        ) : (
          <>
            <div className="walletPill">{shortAddress(address)}</div>

            {!normalizedName && (
              <div className="field">
                <label htmlFor="name">Your domain / ENS name</label>
                <input
                  id="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="example.com or name.eth"
                  autoCapitalize="none"
                  autoCorrect="off"
                />
              </div>
            )}

            {normalizedName && (
              <button className="nameButton" onClick={() => setName('')}>
                {normalizedName} <span>change</span>
              </button>
            )}

            <label className="upload">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(event) => handleFile(event.target.files?.[0])}
                disabled={busy}
              />
              <span>{preview ? 'Choose another image' : 'Upload avatar'}</span>
            </label>

            <button
              className="primary"
              onClick={handlePublish}
              disabled={busy || !preview || !normalizedName}
            >
              {busy ? 'Working…' : preview ? 'Publish avatar' : 'Choose an image'}
            </button>
          </>
        )}

        {notice && <p className="notice">{notice}</p>}
        {error && <p className="error">{error}</p>}

        <p className="fine">
          No seed phrase. No private key. Wallet signatures stay in your wallet.
        </p>
      </section>
    </main>
  )
}
