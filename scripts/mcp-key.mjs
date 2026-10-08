#!/usr/bin/env node
// R-N12 — mint an MCP API key.
// Usage: node scripts/mcp-key.mjs [label]
// Prints the plaintext key once (give it to the client) and the hash entry to
// append to the MCP_API_KEYS environment variable on the server.
import { generateKey } from '../api/_mcp/auth.js';

const label = (process.argv[2] || '').trim().replace(/[,:]/g, '-');
const { key, keyHash } = generateKey();

console.log('Client key (shown once, store it in the MCP client config):');
console.log(`  ${key}`);
console.log('');
console.log('Server entry (append to MCP_API_KEYS, comma-separated):');
console.log(`  ${keyHash}${label ? `:${label}` : ''}`);
