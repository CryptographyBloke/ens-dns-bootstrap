# ENS Avatar web app (v0.2)

The intended user experience is deliberately tiny:

1. connect wallet;
2. upload an image;
3. publish;
4. see the avatar.

The app hides the ENS details as much as possible.

## What it already does

- Connects an EIP-1193 browser wallet.
- Switches to Ethereum mainnet.
- Detects an existing primary ENS name automatically.
- Lets the user provide a DNS/ENS name once if no primary name exists.
- Reads the current `avatar` text record.
- Uses the same signed-upload pattern as the ENS Manager app and stores the image at `https://euc.li/<name>`.
- If the DNS name has not been imported yet, attempts ENS onchain DNS import using `getDnsImportData()` + `importDnsName()`.
- On first setup, writes the wallet address + avatar URL to the name's resolver.
- Sets the name as the wallet primary name.
- On later avatar changes, if the avatar record already points to the managed upload endpoint, only the signed upload is needed; no avatar-record transaction is necessary.

## Important first-time prerequisite for DNS names

A traditional DNS name still needs DNSSEC and the ENS ownership TXT record before an onchain claim can succeed:

```text
_ens.example.com TXT "a=0xYourWallet"
```

The existing root CLI can automate that Cloudflare side.

The planned v0.3 UX uses Cloudflare OAuth + PKCE so the web app can obtain narrowly scoped DNS access without asking the user to paste an API token.

## Run locally

```bash
cd web
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Security boundary

The web app never receives a seed phrase or private key. Ethereum operations are signed by the user's browser wallet. Avatar uploads use an EIP-712 signature. Cloudflare authorization is not yet implemented in v0.2.
