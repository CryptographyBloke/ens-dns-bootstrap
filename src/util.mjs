import { domainToASCII } from 'node:url';

export function normalizeDomain(input) {
  const s = String(input ?? '').trim().replace(/\.$/, '').toLowerCase();
  if (!s || s.includes('/') || s.includes(':')) throw new Error(`Invalid domain: ${input}`);
  const ascii = domainToASCII(s);
  if (!ascii || !ascii.includes('.')) throw new Error(`Invalid domain: ${input}`);
  return ascii;
}

export function validateAddress(input) {
  const s = String(input ?? '').trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(s)) {
    throw new Error(`Invalid Ethereum address: ${input}`);
  }
  return s;
}

export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const part = argv[i];
    if (!part.startsWith('--')) {
      args._.push(part);
      continue;
    }
    const key = part.slice(2);
    if (['json', 'no-wait', 'dry-run', 'yes'].includes(key)) {
      args[key] = true;
      continue;
    }
    const value = argv[++i];
    if (value === undefined) throw new Error(`Missing value for --${key}`);
    args[key] = value;
  }
  return args;
}

export function ensAppUrl(domain) {
  return `https://app.ens.domains/${encodeURIComponent(domain)}`;
}
