export async function queryTxt(fqdn, { fetchImpl = fetch } = {}) {
  const url = new URL('https://cloudflare-dns.com/dns-query');
  url.searchParams.set('name', fqdn);
  url.searchParams.set('type', 'TXT');
  url.searchParams.set('do', '1');
  url.searchParams.set('cd', '0');

  const res = await fetchImpl(url, {
    headers: { Accept: 'application/dns-json' },
  });
  if (!res.ok) throw new Error(`DNS-over-HTTPS query failed: HTTP ${res.status}`);
  const json = await res.json();
  const answers = json.Answer ?? [];
  return {
    authenticated: json.AD === true,
    values: answers
      .filter((a) => a.type === 16)
      .map((a) => String(a.data ?? '').replace(/^"|"$/g, '').replace(/"\s*"/g, '')),
  };
}

export async function verifyEnsTxt(domain, address, opts) {
  const fqdn = `_ens.${domain}`;
  const txt = await queryTxt(fqdn, opts);
  return {
    fqdn,
    expected: `a=${address}`,
    values: txt.values,
    authenticated: txt.authenticated,
    ok: txt.authenticated && txt.values.includes(`a=${address}`),
  };
}

export async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
