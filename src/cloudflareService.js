/**
 * Cloudflare DNS & Subdomain Provisioning Service
 * Cria ou atualiza o subdomínio valeronne.loomadev (ex: valeronne.loomadev.com / .com.br / .dev)
 * na API v4 da Cloudflare.
 */

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

async function resolveZoneId({ apiToken, rootDomain, explicitZoneId }) {
  if (explicitZoneId && String(explicitZoneId).trim()) {
    return { ok: true, zoneId: String(explicitZoneId).trim(), zoneName: rootDomain };
  }
  const cleanDomain = String(rootDomain || '').trim().replace(/^valeronne\./i, '');
  const res = await fetch(`${CF_API_BASE}/zones?name=${encodeURIComponent(cleanDomain)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json'
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success || !Array.isArray(data.result) || data.result.length === 0) {
    // Tenta listar todas as zonas acessíveis pelo token para encontrar "loomadev*"
    const allZonesRes = await fetch(`${CF_API_BASE}/zones?per_page=50`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      }
    });
    const allZonesData = await allZonesRes.json().catch(() => ({}));
    if (allZonesRes.ok && allZonesData.success && Array.isArray(allZonesData.result)) {
      const matched = allZonesData.result.find((z) => z.name.toLowerCase().includes('loomadev'));
      if (matched) {
        return { ok: true, zoneId: matched.id, zoneName: matched.name };
      }
    }
    return {
      ok: false,
      error: data.errors?.[0]?.message || `Zona "${cleanDomain}" não encontrada na conta Cloudflare para o token informado.`
    };
  }
  return {
    ok: true,
    zoneId: data.result[0].id,
    zoneName: data.result[0].name
  };
}

async function provisionCloudflareSubdomain({
  apiToken,
  zoneId,
  subdomain = 'valeronne',
  rootDomain = 'loomadev.com',
  recordType = 'A',
  targetContent,
  proxied = true
}) {
  const cleanToken = String(apiToken || '').trim();
  if (!cleanToken) {
    return {
      ok: false,
      configured: false,
      message: 'Informe o CLOUDFLARE_API_TOKEN (com permissão Zone.DNS Edit) para provisionar automaticamente na Cloudflare.'
    };
  }

  if (!targetContent || !String(targetContent).trim()) {
    return {
      ok: false,
      configured: false,
      message: 'Informe o IP do servidor Looma (para registro A) ou o domínio de destino (para registro CNAME).'
    };
  }

  try {
    const zoneResolution = await resolveZoneId({
      apiToken: cleanToken,
      rootDomain,
      explicitZoneId: zoneId
    });

    if (!zoneResolution.ok) {
      return {
        ok: false,
        configured: true,
        error: zoneResolution.error
      };
    }

    const resolvedZoneId = zoneResolution.zoneId;
    const resolvedRoot = zoneResolution.zoneName || rootDomain;
    const cleanSub = String(subdomain || 'valeronne').replace(/\.$/, '').split('.')[0];
    const fqdn = `${cleanSub}.${resolvedRoot}`;

    // Verifica se o registro já existe
    const searchUrl = `${CF_API_BASE}/zones/${resolvedZoneId}/dns_records?name=${encodeURIComponent(fqdn)}`;
    const existingRes = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        'Content-Type': 'application/json'
      }
    });
    const existingData = await existingRes.json().catch(() => ({}));
    const existingRecord = Array.isArray(existingData?.result) ? existingData.result[0] : null;

    const payload = {
      type: String(recordType || 'A').toUpperCase(),
      name: fqdn,
      content: String(targetContent).trim(),
      ttl: 1, // Auto TTL
      proxied: Boolean(proxied),
      comment: 'Valeronne Beleza e Estética - Criado via Automação Looma'
    };

    const targetUrl = existingRecord
      ? `${CF_API_BASE}/zones/${resolvedZoneId}/dns_records/${existingRecord.id}`
      : `${CF_API_BASE}/zones/${resolvedZoneId}/dns_records`;

    const method = existingRecord ? 'PUT' : 'POST';

    const saveRes = await fetch(targetUrl, {
      method,
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const saveData = await saveRes.json().catch(() => ({}));
    if (!saveRes.ok || !saveData.success) {
      return {
        ok: false,
        configured: true,
        fqdn,
        zoneId: resolvedZoneId,
        error: saveData.errors?.[0]?.message || 'Erro ao criar/atualizar registro DNS na Cloudflare.',
        details: saveData.errors
      };
    }

    return {
      ok: true,
      configured: true,
      action: existingRecord ? 'updated' : 'created',
      fqdn,
      zoneId: resolvedZoneId,
      recordId: saveData.result?.id,
      recordType: saveData.result?.type,
      content: saveData.result?.content,
      proxied: saveData.result?.proxied,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      error: err.message || 'Falha de comunicação com a API da Cloudflare.'
    };
  }
}

module.exports = {
  provisionCloudflareSubdomain
};
