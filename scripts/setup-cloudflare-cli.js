#!/usr/bin/env node
/**
 * Script CLI para criar/atualizar o subdomínio valeronne.loomadev no Cloudflare
 * Uso:
 *   CLOUDFLARE_API_TOKEN=xxx CF_ROOT_DOMAIN=loomadev.com CF_TARGET_CONTENT=1.2.3.4 npm run cloudflare:setup
 */
const { provisionCloudflareSubdomain } = require('../src/cloudflareService');

async function run() {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN || process.argv[2];
  const rootDomain = process.env.CF_ROOT_DOMAIN || process.argv[3] || 'loomadev.com';
  const targetContent = process.env.CF_TARGET_CONTENT || process.argv[4];
  const recordType = process.env.CF_RECORD_TYPE || 'A';
  const zoneId = process.env.CLOUDFLARE_ZONE_ID || '';

  console.log(`☁️  Provisionando subdomínio valeronne.${rootDomain} na Cloudflare...`);
  const result = await provisionCloudflareSubdomain({
    apiToken,
    zoneId,
    subdomain: 'valeronne',
    rootDomain,
    recordType,
    targetContent,
    proxied: true
  });

  if (result.ok) {
    console.log(`✅ Sucesso! Subdomínio ${result.fqdn} (${result.action}) -> ${result.content} [Record ID: ${result.recordId}]`);
    process.exit(0);
  } else {
    console.error(`❌ Falha ao provisionar DNS:`, result.error || result.message);
    process.exit(1);
  }
}

run();
