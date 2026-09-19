import { useEffect, useState } from 'react'
import type { Address } from 'viem'
import { publishEnsAvatar } from './ens'
import { connectWallet, disconnectWallet, type AppWalletClient } from './wallet'
import { publishSnapshotAvatar, readSnapshotAvatar } from './snapshot'
import { resolveAvatarUri, uploadAvatar, validateAvatarFile } from './storage'

type Step = 'idle' | 'connecting' | 'disconnecting' | 'uploading' | 'signing' | 'publishing' | 'done'
type Language = 'zh' | 'en'

const translations = {
  zh: {
    brand: 'HNUDAO · 钱包头像',
    language: '界面语言',
    title: '你的钱包，你的头像。',
    lead: '连接钱包，选择图片，一次发布到兼容的头像资料层。',
    noAvatar: '还没有头像',
    avatarPreview: '钱包头像预览',
    connect: '连接钱包',
    connecting: '连接中…',
    logout: '退出登录',
    loggingOut: '退出中…',
    loggedOut: '已退出本网站。部分钱包仍可能保留授权，请按需在钱包中撤销。',
    walletConnected: '钱包已连接。',
    currentAvatarReady: '已读取当前钱包头像。',
    chooseAnother: '更换图片',
    upload: '上传头像',
    publish: '发布头像',
    chooseImage: '选择图片',
    working: '处理中…',
    openShare: '打开可分享头像链接',
    uploading: '正在上传图片…',
    sign: '请在钱包中签名；不会消耗 Gas。',
    syncing: '如果可用，正在同步兼容性更广的 ENS 头像记录…',
    ensSyncedAddress: 'ENS 头像已同步到钱包地址。',
    ensSyncedName: (name: string) => `ENS 头像已同步到 ${name}。`,
    ensSkipped: 'Snapshot 已完成；跳过 ENS 同步。',
    avatarPublished: (ensNotice: string) =>
      `头像已发布。支持 Snapshot 和 Stamp 的应用可以通过钱包地址读取。${ensNotice}`,
    noEns: '无需设置 ENS。Snapshot 发布无需 Gas；如果已有 ENS 名称，可额外同步一次头像记录。',
    memberDeveloper: 'HNUDAO 成员开发',
    author: '作者：HNUDAO founder',
    telegram: 'TG：cryptoAceisme',
    github: 'GitHub 源码',
    connectFirst: '请先连接钱包。',
    chooseFirst: '请先选择头像。',
    invalidType: '请选择 JPG 或 PNG 图片。',
    tooLarge: '图片太大，请控制在 1 MB 以内。',
    noWallet: '未找到浏览器钱包，请安装 MetaMask、Rabby 或其他 EIP-1193 钱包。',
    noAccount: '钱包没有返回账户。',
  },
  en: {
    brand: 'HNUDAO · Wallet Avatar',
    language: 'Interface language',
    title: 'Your wallet. Your avatar.',
    lead: 'Connect a wallet, choose an image, and publish it across compatible profile layers.',
    noAvatar: 'No avatar yet',
    avatarPreview: 'Wallet avatar preview',
    connect: 'Connect wallet',
    connecting: 'Connecting…',
    logout: 'Logout',
    loggingOut: 'Logging out…',
    loggedOut: 'You are logged out of this site. Some wallets may keep the permission; revoke it in the wallet if needed.',
    walletConnected: 'Wallet connected.',
    currentAvatarReady: 'Your current wallet avatar is ready.',
    chooseAnother: 'Choose another image',
    upload: 'Upload avatar',
    publish: 'Publish avatar',
    chooseImage: 'Choose an image',
    working: 'Working…',
    openShare: 'Open shareable avatar URL',
    uploading: 'Uploading the image…',
    sign: 'Sign once in your wallet. This does not spend gas.',
    syncing: 'Syncing the widely-supported ENS avatar record if available…',
    ensSyncedAddress: 'ENS avatar synced to the wallet address.',
    ensSyncedName: (name: string) => `ENS avatar synced for ${name}.`,
    ensSkipped: 'Snapshot is ready; ENS sync was skipped.',
    avatarPublished: (ensNotice: string) =>
      `Avatar published. Snapshot and Stamp-compatible apps can resolve it from your wallet address.${ensNotice}`,
    noEns: 'No ENS setup required. Snapshot is gasless; an existing ENS name may add one optional transaction.',
    memberDeveloper: 'Built by a HNUDAO member',
    author: 'Author: HNUDAO founder',
    telegram: 'TG: cryptoAceisme',
    github: 'GitHub source',
    connectFirst: 'Connect your wallet first.',
    chooseFirst: 'Choose an avatar first.',
    invalidType: 'Please choose a JPG or PNG image.',
    tooLarge: 'Image is too large. Keep it under 1 MB.',
    noWallet: 'No browser wallet found. Install MetaMask, Rabby, or another EIP-1193 wallet.',
    noAccount: 'Wallet did not return an account.',
  },
} as const

const GITHUB_URL = 'https://github.com/CryptographyBloke/ens-dns-bootstrap'

function detectLanguage(): Language {
  try {
    const saved = window.localStorage.getItem('hnudao-avatar-language')
    if (saved === 'zh' || saved === 'en') return saved
    return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
  } catch {
    return 'zh'
  }
}

function shortAddress(address?: string) {
  if (!address) return ''
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function errorText(cause: unknown, language: Language) {
  const raw = cause instanceof Error ? cause.message : String(cause)
  if (language === 'en') return raw
  if (raw === 'Please choose a JPG or PNG image.') return translations.zh.invalidType
  if (raw === 'Image is too large. Keep it under 1 MB.') return translations.zh.tooLarge
  if (raw.startsWith('No browser wallet found.')) return translations.zh.noWallet
  if (raw === 'Wallet did not return an account.') return translations.zh.noAccount
  return raw
}

export default function App() {
  const [language, setLanguage] = useState<Language>(detectLanguage)
  const [address, setAddress] = useState<Address>()
  const [walletClient, setWalletClient] = useState<AppWalletClient>()
  const [avatarURI, setAvatarURI] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [step, setStep] = useState<Step>('idle')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  const t = translations[language]
  const connected = Boolean(address && walletClient)
  const imageSrc = preview || resolveAvatarUri(avatarURI)
  const shareUrl = address ? `https://cdn.stamp.fyi/avatar/${address}?s=512` : null
  const busy = !['idle', 'done'].includes(step)

  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
    try {
      window.localStorage.setItem('hnudao-avatar-language', language)
    } catch {
      // Language selection still works when local storage is unavailable.
    }
  }, [language])

  const handleConnect = async () => {
    setError(null)
    setNotice('')
    setStep('connecting')
    try {
      const connectedWallet = await connectWallet()
      setAddress(connectedWallet.address)
      setWalletClient(connectedWallet.walletClient)

      try {
        const current = await readSnapshotAvatar(connectedWallet.address)
        setAvatarURI(current)
        if (current) setNotice(t.currentAvatarReady)
        else setNotice(t.walletConnected)
      } catch (cause) {
        setNotice(`${t.walletConnected} ${errorText(cause, language)}`)
      }
      setStep('idle')
    } catch (cause) {
      setError(errorText(cause, language))
      setStep('idle')
    }
  }

  const handleFile = async (file?: File) => {
    if (!file) return
    setError(null)
    try {
      validateAvatarFile(file)
      if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview)
      setSelectedFile(file)
      setPreview(URL.createObjectURL(file))
      setStep('idle')
    } catch (cause) {
      setError(errorText(cause, language))
    }
  }

  const handleLogout = async () => {
    setError(null)
    setNotice('')
    setStep('disconnecting')
    await disconnectWallet()
    if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview)
    setAddress(undefined)
    setWalletClient(undefined)
    setAvatarURI(null)
    setPreview(null)
    setSelectedFile(null)
    setStep('idle')
    setNotice(t.loggedOut)
  }

  const handlePublish = async () => {
    if (!address || !walletClient) return setError(t.connectFirst)
    if (!selectedFile) return setError(t.chooseFirst)

    setError(null)
    setNotice('')
    try {
      setStep('uploading')
      setNotice(t.uploading)
      const uploadedURI = await uploadAvatar(selectedFile)

      setStep('signing')
      setNotice(t.sign)
      setStep('publishing')
      await publishSnapshotAvatar(walletClient, address, uploadedURI)

      let ensNotice = ''
      try {
        setNotice(t.syncing)
        const ens = await publishEnsAvatar(address, uploadedURI)
        if (ens.updated) ensNotice = ` ${ens.direct ? t.ensSyncedAddress : t.ensSyncedName(ens.name)}`
      } catch {
        ensNotice = ` ${t.ensSkipped}`
      }

      setAvatarURI(uploadedURI)
      if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview)
      setPreview(null)
      setSelectedFile(null)
      setStep('done')
      setNotice(t.avatarPublished(ensNotice))
    } catch (cause) {
      setError(errorText(cause, language))
      setStep('idle')
    }
  }

  return (
    <main className="shell">
      <section className="card">
        <div className="cardHeader">
          <div className="brand">{t.brand}</div>
          <label className="languageSelect">
            <span className="srOnly">{t.language}</span>
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value as Language)}
              aria-label={t.language}
            >
              <option value="zh">中文</option>
              <option value="en">English</option>
            </select>
          </label>
        </div>

        <h1>{t.title}</h1>
        <p className="lead">{t.lead}</p>

        <div className="avatarWrap">
          {imageSrc ? (
            <img className="avatar" src={imageSrc} alt={t.avatarPreview} />
          ) : (
            <div className="avatar empty" aria-label={t.noAvatar}>+</div>
          )}
        </div>

        {!connected ? (
          <button className="primary" onClick={handleConnect} disabled={busy}>
            {step === 'connecting' ? t.connecting : t.connect}
          </button>
        ) : (
          <>
            <div className="accountRow">
              <div className="walletPill">{shortAddress(address)}</div>
              <button className="logout" onClick={handleLogout} disabled={busy}>
                {step === 'disconnecting' ? t.loggingOut : t.logout}
              </button>
            </div>

            <label className="upload">
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={(event) => handleFile(event.target.files?.[0])}
                disabled={busy}
              />
              <span>{preview ? t.chooseAnother : t.upload}</span>
            </label>

            <button className="primary" onClick={handlePublish} disabled={busy || !preview}>
              {busy ? t.working : preview ? t.publish : t.chooseImage}
            </button>
          </>
        )}

        {avatarURI && !preview && (
          <p className="uri" title={avatarURI}>
            {avatarURI}
          </p>
        )}
        {shareUrl && avatarURI && (
          <a className="shareLink" href={shareUrl} target="_blank" rel="noreferrer">
            {t.openShare}
          </a>
        )}
        {notice && <p className="notice">{notice}</p>}
        {error && <p className="error">{error}</p>}

        <p className="fine">{t.noEns}</p>

        <footer className="siteFooter">
          <p className="memberCredit">{t.memberDeveloper}</p>
          <div className="footerLinks">
            <span>{t.author}</span>
            <a href="https://t.me/cryptoAceisme" target="_blank" rel="noreferrer">
              {t.telegram}
            </a>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer">
              {t.github}
            </a>
          </div>
        </footer>
      </section>
    </main>
  )
}
