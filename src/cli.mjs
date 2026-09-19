#!/usr/bin/env node
import {
  deleteEnsTxt,
  enableDnssec,
  findZone,
  getDnssec,
  upsertEnsTxt,
} from './cloudflare.mjs';
import { ensAppUrl, normalizeDomain, parseArgs, validateAddress } from './util.mjs';
import { sleep, verifyEnsTxt } from './verify.mjs';

const HELP = `
ens-dns-bootstrap

Automates the Cloudflare side of ENS onchain DNS import.
It never handles wallet private keys. The final ENS claim is signed in your wallet.

Usage:
  ens-dns-bootstrap setup --domain example.com --address 0x... [--no-wait] [--json]
  ens-dns-bootstrap status --domain example.com --address 0x... [--json]
  ens-dns-bootstrap remove --domain example.com --yes [--json]

Environment:
  CLOUDFLARE_API_TOKEN   Scoped Cloudflare API token with Zone:Read + DNS:Edit.

Examples:
  CLOUDFLARE_API_TOKEN=... ens-dns-bootstrap setup \\
    --domain hnudao.online \\
    --address 0x101f99125E4Aa1402f0eaEF896cC175Ba1280f0A
`;

function out(value, json = false) {
  if (json) console.log(JSON.stringify(value, null, 2));
  else if (typeof value === 'string') console.log(value);
  else console.log(JSON.stringify(value, null, 2));
}

async function status(domain, address, token) {
  const zone = await findZone(domain, { token });
  const dnssec = await getDnssec(zone.id, { token });
  let dns;
  try {
    dns = await verifyEnsTxt(domain, address);
  } catch (error) {
    dns = { ok: false, error: error.message };
  }
  return {
    domain,
    address,
    zone: { id: zone.id, name: zone.name, status: zone.status },
    dnssec: {
      status: dnssec?.status ?? 'unknown',
      ds: dnssec?.ds ?? null,
      algorithm: dnssec?.algorithm ?? null,
      digest_algorithm: dnssec?.digest_algorithm ?? null,
    },
    txt: dns,
    readyToClaim: dnssec?.status === 'active' && dns.ok === true,
    ensApp: ensAppUrl(domain),
  };
}

async function setup(args) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error('Set CLOUDFLARE_API_TOKEN first.');
  const domain = normalizeDomain(args.domain);
  const address = validateAddress(args.address);
  const json = Boolean(args.json);

  const zone = await findZone(domain, { token });
  if (args['dry-run']) {
    return out({
      dryRun: true,
      domain,
      address,
      zone: { id: zone.id, name: zone.name },
      actions: [
        'PATCH Cloudflare DNSSEC status=active',
        `UPSERT TXT _ens.${domain} = a=${address} TTL 3000`,
        'Wait for DNSSEC active and public TXT propagation',
        'Open ENS Manager for wallet-signed onchain claim',
      ],
    }, json);
  }

  let dnssec = await getDnssec(zone.id, { token });
  if (!['active', 'pending'].includes(dnssec?.status)) {
    dnssec = await enableDnssec(zone.id, { token });
  }

  const txt = await upsertEnsTxt(zone.id, domain, address, { token });

  if (args['no-wait']) {
    return out({
      ok: true,
      domain,
      address,
      dnssecStatus: dnssec?.status ?? 'unknown',
      txtChanged: txt.changed,
      next: 'Run status later; when readyToClaim=true, open ENS Manager and claim with your wallet.',
      ensApp: ensAppUrl(domain),
    }, json);
  }

  const timeoutMs = Number(args.timeout ?? 1800) * 1000;
  const pollMs = Number(args.interval ?? 15) * 1000;
  const start = Date.now();
  let latest;
  do {
    latest = await status(domain, address, token);
    if (latest.readyToClaim) break;
    if (!json) {
      const txtState = latest.txt.ok
        ? 'ok+dnssec-authenticated'
        : latest.txt.authenticated
          ? 'present-but-mismatch'
          : 'not-authenticated/propagated';
      console.log(`Waiting: Cloudflare DNSSEC=${latest.dnssec.status}, TXT=${txtState}`);
    }
    await sleep(pollMs);
  } while (Date.now() - start < timeoutMs);

  if (!latest.readyToClaim) {
    latest.timedOut = true;
    latest.note = 'Cloudflare changes were applied, but propagation is not complete yet. Re-run status later.';
    return out(latest, json);
  }

  latest.next = 'Open ENS Manager and approve the onchain DNS claim in your wallet.';
  return out(latest, json);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (!command || ['help', '-h', '--help'].includes(command)) {
    console.log(HELP.trim());
    return;
  }

  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error('Set CLOUDFLARE_API_TOKEN first.');

  if (command === 'setup') return setup(args);

  if (command === 'status') {
    const domain = normalizeDomain(args.domain);
    const address = validateAddress(args.address);
    return out(await status(domain, address, token), Boolean(args.json));
  }

  if (command === 'remove') {
    if (!args.yes) throw new Error('Refusing to remove records without --yes');
    const domain = normalizeDomain(args.domain);
    const zone = await findZone(domain, { token });
    const deleted = await deleteEnsTxt(zone.id, domain, { token });
    return out({ ok: true, domain, deletedRecordIds: deleted }, Boolean(args.json));
  }

  throw new Error(`Unknown command: ${command}\n\n${HELP}`);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
