# HNUDAO Avatar web app

This is the small browser client for publishing a wallet avatar through
existing compatibility layers. ENS, DNS, and a custom contract are not
required.

The user flow is:

1. connect a browser wallet;
2. choose a JPG or PNG image under 1 MB;
3. upload it to IPFS through Pineapple;
4. sign one EIP-712 Snapshot `Profile` message;
5. if a primary ENS name already exists, optionally confirm one transaction to
   sync its `avatar` record;
6. display the avatar by wallet address.

The interface supports Chinese and English. After connecting, `Logout` clears
the local app session and attempts an EIP-2255 permission revoke when the
wallet supports it. It does not delete already-published IPFS or Snapshot
data.

## Configuration

The defaults use the public Snapshot services. Copy `.env.example` to
`.env.local` only if you need to override them:

```text
VITE_PINEAPPLE_URL=https://pineapple.fyi/upload
VITE_SNAPSHOT_SEQUENCER_URL=https://seq.snapshot.org
VITE_SNAPSHOT_API_URL=https://hub.snapshot.org/graphql
VITE_ENS_RPC_URL=https://cloudflare-eth.com
VITE_IPFS_GATEWAY=https://ipfs.io/ipfs/
VITE_ARWEAVE_GATEWAY=https://arweave.net
```

The upload endpoint receives only the selected image. The wallet signs the
profile update in the browser; the site never receives a private key or seed
phrase.

## Network path

The deployed site is a static client. DNS sends `face.hnudao.online` to the
hosted site, and the browser then makes the following direct requests:

```text
Browser
  ├─ EIP-1193 calls → wallet extension
  ├─ POST image → Pineapple → ipfs://CID
  ├─ EIP-712 signature → Snapshot sequencer
  ├─ GraphQL read → Snapshot Hub
  └─ optional Ethereum RPC + wallet transaction → ENS resolver
```

The browser is the coordinator. There is no application server holding user
keys or avatar state. Snapshot stores the signed profile, while the image is
content-addressed by IPFS. The ENS adapter is best-effort and only runs when
an existing ENS name/resolver can be found.

## Run locally

```bash
npm install
npm run dev
```

## Build and protocol check

```bash
npm run test:protocol
npm run build
```

## Compatibility

Snapshot stores the signed profile and the avatar points to an IPFS CID. The
avatar is immediately compatible with Snapshot and services such as Stamp that
use Snapshot's resolver. If the wallet already has an ENS primary name, the
same IPFS URI is also written to the ENS `avatar` text record so ENS-aware apps
can resolve it. That optional transaction is best-effort; Snapshot publication
still succeeds if it is rejected or unavailable.
