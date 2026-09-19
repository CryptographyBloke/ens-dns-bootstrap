# ens-dns-bootstrap

A tiny, dependency-free Node.js CLI that automates the **Cloudflare side** of an ENS **onchain DNS import**.

It is aimed at the workflow:

```text
existing DNS domain on Cloudflare
        ↓
enable DNSSEC
        ↓
create _ens TXT = a=0x...
        ↓
wait for DNSSEC + TXT propagation
        ↓
open ENS Manager and approve the Ethereum transaction in your wallet
```

The tool deliberately **never accepts a wallet private key or seed phrase**.

## Why this exists

ENS already provides the protocol, contracts, Manager app, `dnsprovejs`, and ENSjs. Cloudflare already exposes DNS and DNSSEC APIs. What was missing for our use case was a small Cloudflare-first bootstrapper that performs the repetitive DNS work and tells you exactly when the domain is ready to claim.

## Requirements

- Node.js 20+
- A domain using Cloudflare authoritative DNS
- A scoped Cloudflare API token
- DNSSEC support for the TLD / registrar
- An Ethereum wallet for the final ENS onchain claim

## Cloudflare token

Create a token scoped to the single zone if possible. It needs enough permission to:

- read the zone (`Zone Read`);
- edit DNS records and DNSSEC (`DNS Write`).

Do **not** use your Global API Key.

Set it only in your shell environment:

```bash
export CLOUDFLARE_API_TOKEN='...'
```

Never commit the token to a repository.

## Run from source

```bash
git clone https://github.com/CryptographyBloke/ens-dns-bootstrap.git
cd ens-dns-bootstrap
node src/cli.mjs setup \
  --domain hnudao.online \
  --address 0x101f99125E4Aa1402f0eaEF896cC175Ba1280f0A
```

No `npm install` is required for v0.1.

The command will:

1. locate the matching Cloudflare zone;
2. enable DNSSEC if it is not already enabled;
3. create or update `_ens.<domain>` with `a=<address>` and TTL 3000;
4. poll Cloudflare for DNSSEC state;
5. verify the public TXT record through DNS-over-HTTPS and require DNSSEC authentication (`AD=true`);
6. print `readyToClaim: true` only when Cloudflare reports DNSSEC active and the public TXT answer is DNSSEC-authenticated;
7. print the ENS Manager URL for the wallet-signed claim.

## Commands

### Setup

```bash
node src/cli.mjs setup --domain example.com --address 0x...
```

Useful options:

```text
--no-wait          apply Cloudflare changes and exit immediately
--timeout 1800     maximum wait in seconds (default: 1800)
--interval 15      poll interval in seconds (default: 15)
--dry-run          show intended changes without modifying Cloudflare
--json             machine-readable output
```

### Status

```bash
node src/cli.mjs status --domain example.com --address 0x... --json
```

### Remove the ENS ownership TXT record

```bash
node src/cli.mjs remove --domain example.com --yes
```

This only removes matching `_ens` ownership records. It does **not** disable DNSSEC.

## Security model

- The Cloudflare API token stays in the local process environment.
- The CLI does not store the token.
- The CLI does not receive or store an Ethereum private key.
- Any Ethereum transaction remains an explicit wallet confirmation.
- If more than one TXT record exists at `_ens.<domain>`, the tool stops instead of guessing which record to overwrite.
- If the single existing `_ens` TXT record is not an ENS ownership record (`a=0x...`), the tool refuses to overwrite it.

## v0.2 roadmap: actual “one-click” UX

The next version can be a small local/self-hosted web app:

1. Connect browser wallet (EIP-1193 / WalletConnect).
2. Call Cloudflare API for DNSSEC + TXT setup.
3. Generate DNSSEC proof with `@ensdomains/dnsprovejs`.
4. Prepare the ENS `DNSRegistrar` claim transaction.
5. Ask the connected wallet to sign it.
6. Configure the resolver records, including `avatar`.
7. Set the primary/reverse name.
8. Verify address → name → avatar resolution.

The wallet-signing boundary should remain explicit; “one click” should mean orchestration, not custody of signing keys.

## License

MIT
