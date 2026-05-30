#!/usr/bin/env node
/**
 * promote-admin.mjs
 *
 * Promotes a user to super_admin via the live API.
 * Works with any user that already has `admin` role (which can call
 * PATCH /api/v1/admin/users/:id — no database access needed).
 *
 * Usage:
 *   node scripts/promote-admin.mjs <password> [username] [api-url]
 *
 * Examples:
 *   node scripts/promote-admin.mjs mypassword
 *   node scripts/promote-admin.mjs mypassword admin https://noon-system-api.vercel.app
 *   node scripts/promote-admin.mjs mypassword admin http://localhost:3000
 */

const password = process.argv[2];
const username = process.argv[3] ?? 'admin';
const API_BASE = (process.argv[4] ?? 'https://noon-system-api.vercel.app').replace(/\/$/, '');

if (!password) {
  console.error('Usage: node scripts/promote-admin.mjs <password> [username] [api-url]');
  process.exit(1);
}

async function req(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${json.message ?? text}`);
  }
  return json;
}

async function main() {
  console.log(`\n🔐  Logging in as "${username}" → ${API_BASE}`);

  // 1. Login
  const login = await req('/api/v1/auth/login', {
    method: 'POST',
    body: { username, password },
  });
  const token = login.accessToken;
  console.log(`✓   Logged in — current role: ${login.user.role}`);

  if (login.user.role === 'super_admin') {
    console.log(`✓   Already super_admin — nothing to do.`);
    process.exit(0);
  }

  if (login.user.role === 'platform_admin') {
    console.log(`✓   Already platform_admin — already has access to merchant management.`);
    process.exit(0);
  }

  // 2. Fetch users to confirm the target user ID
  const users = await req('/api/v1/admin/users', { token });
  const target = users.find(u => u.username === username);
  if (!target) {
    throw new Error(`User "${username}" not found in /api/v1/admin/users`);
  }
  console.log(`✓   Found user #${target.id} (${target.username}) — role: ${target.role}`);

  // 3. Promote to super_admin
  console.log(`\n⬆️   Promoting to super_admin…`);
  const updated = await req(`/api/v1/admin/users/${target.id}`, {
    method: 'PATCH',
    token,
    body: { role: 'super_admin' },
  });
  console.log(`✓   Updated! New role: ${updated.role}`);

  // 4. Verify by logging in fresh
  console.log(`\n🔍  Verifying with fresh login…`);
  const verify = await req('/api/v1/auth/login', {
    method: 'POST',
    body: { username, password },
  });
  console.log(`✓   Confirmed role: ${verify.user.role}`);
  console.log('\n✅  Done. You can now access /admin/merchants, /admin/plans,');
  console.log('    /admin/subscriptions, and /admin/payments.\n');
}

main().catch(err => {
  console.error('\n❌ ', err.message);
  process.exit(1);
});
