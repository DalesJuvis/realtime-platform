#!/usr/bin/env node
/**
 * Dev-only helper: mints a token in the exact format
 * `TokenService::issue_token` produces (backend/src/modules/auth/services/TokenService.rs),
 * for the demo tenant registered by docker-compose's DEMO_TENANT_SECRET.
 *
 * Never ship this in the client bundle — a tenant secret must only ever
 * live server-side. This script exists purely so `web-client`'s connect
 * form has something to paste in against the local docker-compose stack.
 *
 * Usage: node scripts/mint-token.mjs [sub] [ttlSeconds]
 */
import { createHmac } from 'node:crypto'

const TENANT_ID = '00000000-0000-0000-0000-000000000001' // Uuid::from_u128(1)
const TENANT_SECRET = 'dev-secret-change-me' // docker-compose.yml DEMO_TENANT_SECRET

const sub = process.argv[2] ?? 'demo-user'
const ttlSeconds = Number(process.argv[3] ?? 3600)

function b64url(buf) {
  return Buffer.from(buf).toString('base64url')
}

const claims = { tenant_id: TENANT_ID, sub, exp: Math.floor(Date.now() / 1000) + ttlSeconds }
const payloadB64 = b64url(JSON.stringify(claims))
const signature = createHmac('sha256', TENANT_SECRET).update(payloadB64).digest()
const token = `${payloadB64}.${b64url(signature)}`

console.log(token)
