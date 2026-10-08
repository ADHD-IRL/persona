// @ts-check
// R-N12 — bearer-key auth for the MCP endpoint.
//
// Keys look like `adb_live_<random>`. Only sha256 hashes are configured on the
// server (MCP_API_KEYS = "hash[:label],hash[:label],..."), so a leaked env var
// cannot be replayed as a key. Everything here is pure and Node-testable.
import { createHash, randomBytes } from 'node:crypto';

export const KEY_PREFIX = 'adb_live_';
const HASH_RE = /^[0-9a-f]{64}$/;

/** @param {string} key */
export function hashKey(key) {
  return createHash('sha256').update(key).digest('hex');
}

/** Mint a key. The plaintext is shown once; store only `keyHash`. */
export function generateKey() {
  const key = `${KEY_PREFIX}${randomBytes(24).toString('base64url')}`;
  return { key, keyPrefix: key.slice(0, KEY_PREFIX.length + 8), keyHash: hashKey(key) };
}

/**
 * Parse the MCP_API_KEYS env value into a ring of accepted key hashes.
 * Blank entries are skipped; a malformed hash is a configuration error and
 * throws so the endpoint fails closed instead of accepting nothing silently.
 * @param {string | undefined} value
 * @returns {Map<string, { label: string }>}
 */
export function parseKeyRing(value) {
  const ring = new Map();
  const entries = String(value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  entries.forEach((entry, i) => {
    const [hash, ...rest] = entry.split(':');
    const h = hash.trim().toLowerCase();
    if (!HASH_RE.test(h)) {
      throw new Error(`MCP_API_KEYS entry ${i + 1} is not a 64-character sha256 hex hash`);
    }
    const label = rest.join(':').trim() || h.slice(0, 8);
    ring.set(h, { label });
  });
  return ring;
}

/**
 * Resolve an Authorization header to an auth context, or null.
 * @param {string | undefined} header
 * @param {Map<string, { label: string }>} ring
 */
export function resolveBearer(header, ring) {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m) return null;
  const token = m[1].trim();
  if (!token.startsWith(KEY_PREFIX)) return null;
  const keyHash = hashKey(token);
  const entry = ring.get(keyHash);
  if (!entry) return null;
  return { keyHash, label: entry.label, scopes: ['read'] };
}

/** @param {{ scopes: string[] }} ctx @param {string} scope */
export function requireScope(ctx, scope) {
  if (!ctx.scopes.includes(scope)) {
    throw new Error(`This API key does not have the '${scope}' scope`);
  }
}
