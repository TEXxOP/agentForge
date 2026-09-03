import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve('.env');
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    const raw = trimmed.slice(separator + 1).trim();
    const value = raw.replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

// A managed host (Render, Fly, a container platform) has to bind every interface.
// A developer machine keeps the loopback-only default so nothing new is exposed locally.
const managedRuntime = Boolean(process.env.RENDER) || process.env.NODE_ENV === 'production';

// Exact-match allow-list for cross-origin API callers, e.g. a Vercel-hosted frontend.
// Unset means same-origin only: the server never falls back to a wildcard.
function parseOrigins(raw) {
  const seen = new Set();
  for (const entry of String(raw || '').split(',')) {
    const origin = entry.trim().replace(/\/+$/, '');
    if (origin) seen.add(origin);
  }
  return [...seen];
}

export const config = {
  host: process.env.HOST || (managedRuntime ? '0.0.0.0' : '127.0.0.1'),
  port: Number(process.env.PORT || 4173),
  paymentAdapter: process.env.PAYMENT_ADAPTER || 'simulator',
  allowedOrigins: parseOrigins(process.env.ALLOWED_ORIGINS),
  publicOrigin: process.env.PUBLIC_ORIGIN || '',
  llm: {
    baseUrl: process.env.AGENTPROOF_LLM_BASE_URL || '',
    apiKey: process.env.AGENTPROOF_LLM_API_KEY || '',
    model: process.env.AGENTPROOF_LLM_MODEL || ''
  }
};
