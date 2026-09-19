const API_BASE = 'https://api.cloudflare.com/client/v4';

export class CloudflareError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'CloudflareError';
    this.details = details;
  }
}

async function cfFetch(path, { token, method = 'GET', body, fetchImpl = fetch } = {}) {
  if (!token) throw new CloudflareError('Missing Cloudflare API token');
  const res = await fetchImpl(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let json;
  try {
    json = await res.json();
  } catch {
    throw new CloudflareError(`Cloudflare returned non-JSON HTTP ${res.status}`);
  }

  if (!res.ok || json.success === false) {
    const errors = Array.isArray(json.errors)
      ? json.errors.map((e) => `${e.code ?? 'ERR'}: ${e.message ?? 'unknown error'}`).join('; ')
      : `HTTP ${res.status}`;
    throw new CloudflareError(`Cloudflare API error: ${errors}`, json);
  }
  return json;
}

export async function findZone(domain, opts) {
  const json = await cfFetch(`/zones?name=${encodeURIComponent(domain)}`, opts);
  const exact = json.result?.find((z) => z.name?.toLowerCase() === domain.toLowerCase());
  if (!exact) throw new CloudflareError(`No Cloudflare zone found for ${domain}`);
  return exact;
}

export async function getDnssec(zoneId, opts) {
  const json = await cfFetch(`/zones/${zoneId}/dnssec`, opts);
  return json.result;
}

export async function enableDnssec(zoneId, opts) {
  const json = await cfFetch(`/zones/${zoneId}/dnssec`, {
    ...opts,
    method: 'PATCH',
    body: { status: 'active' },
  });
  return json.result;
}

export async function listTxtRecords(zoneId, fqdn, opts) {
  const json = await cfFetch(
    `/zones/${zoneId}/dns_records?type=TXT&name=${encodeURIComponent(fqdn)}`,
    opts,
  );
  return json.result ?? [];
}

export async function upsertEnsTxt(zoneId, domain, address, opts) {
  const fqdn = `_ens.${domain}`;
  const desired = `a=${address}`;
  const existing = await listTxtRecords(zoneId, fqdn, opts);

  if (existing.length > 1) {
    throw new CloudflareError(
      `Found ${existing.length} TXT records at ${fqdn}. Refusing to guess which one to replace.`,
    );
  }

  if (existing.length === 1) {
    const record = existing[0];
    if (!/^a=0x[0-9a-fA-F]{40}$/.test(record.content ?? '')) {
      throw new CloudflareError(
        `Refusing to overwrite non-ENS TXT record at ${fqdn}: ${record.content ?? ''}`,
      );
    }
    if (record.content === desired && Number(record.ttl) === 3000) {
      return { changed: false, record };
    }
    const json = await cfFetch(`/zones/${zoneId}/dns_records/${record.id}`, {
      ...opts,
      method: 'PUT',
      body: {
        type: 'TXT',
        name: fqdn,
        content: desired,
        ttl: 3000,
      },
    });
    return { changed: true, record: json.result };
  }

  const json = await cfFetch(`/zones/${zoneId}/dns_records`, {
    ...opts,
    method: 'POST',
    body: {
      type: 'TXT',
      name: fqdn,
      content: desired,
      ttl: 3000,
    },
  });
  return { changed: true, record: json.result };
}

export async function deleteEnsTxt(zoneId, domain, opts) {
  const fqdn = `_ens.${domain}`;
  const existing = await listTxtRecords(zoneId, fqdn, opts);
  const ensRecords = existing.filter((r) => /^a=0x[0-9a-fA-F]{40}$/.test(r.content ?? ''));
  const deleted = [];
  for (const record of ensRecords) {
    await cfFetch(`/zones/${zoneId}/dns_records/${record.id}`, {
      ...opts,
      method: 'DELETE',
    });
    deleted.push(record.id);
  }
  return deleted;
}
