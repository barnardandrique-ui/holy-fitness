// lib/db.js
// ---------------------------------------------------------------------------
// All persistent storage, backed by Vercel KV (Upstash Redis).
//
// Keys:
//   user:id:<id>            full user record
//   user:email:<email>      -> id (lookup by email)
//   state:<id>              the user's plan, goal, progress and logs
//   reset:<sha256(token)>   password-reset token (expires after 1 hour)
//   loginfail:<email>       failed-login counter (expires after 15 minutes)
//   resetsent:<email>       reset-email rate limit (expires after 1 minute)
//
// Every API route talks to this file only, never to KV directly.
// ---------------------------------------------------------------------------

import { kv } from '@vercel/kv';
import crypto from 'crypto';

// ── Users ──
export async function getUserByEmail(email) {
  const normalized = String(email).toLowerCase();
  const id = await kv.get(`user:email:${normalized}`);
  if (!id) return null;
  return (await kv.get(`user:id:${id}`)) || null;
}

export async function getUserById(id) {
  if (!id) return null;
  return (await kv.get(`user:id:${id}`)) || null;
}

export async function createUser({ name, email, passwordHash, consentAt }) {
  const normalized = String(email).toLowerCase();
  if (await getUserByEmail(normalized)) throw new Error('EMAIL_TAKEN');
  const id = crypto.randomUUID();
  const user = {
    id,
    name,
    email: normalized,
    passwordHash,
    sv: 0, // session version: bumping it signs the user out everywhere
    consentAt: consentAt || null,
    createdAt: new Date().toISOString(),
  };
  await kv.set(`user:id:${id}`, user);
  await kv.set(`user:email:${normalized}`, id);
  return user;
}

export async function updateUser(id, patch) {
  const user = await getUserById(id);
  if (!user) throw new Error('NO_SUCH_USER');
  const next = { ...user, ...patch };
  await kv.set(`user:id:${id}`, next);
  return next;
}

// Removes the account and everything stored for it.
export async function deleteUser(user) {
  await kv.del(`user:id:${user.id}`, `user:email:${user.email}`, `state:${user.id}`, `push:${user.id}`);
  await kv.srem('push:users', user.id);       // reminders: delete the person's devices and take them off the schedule
  await kv.del('admin:cache:accounts');       // the admin panel's cached summary must not outlive the account
}

// ── Plan / progress / logs ──
export async function getState(userId) {
  return (await kv.get(`state:${userId}`)) || null;
}

export async function setState(userId, state) {
  await kv.set(`state:${userId}`, state);
}

// ── Password reset tokens ──
export async function setResetToken(hash, value, ttlSeconds) {
  await kv.set(`reset:${hash}`, value, { ex: ttlSeconds });
}
export async function getResetToken(hash) {
  return (await kv.get(`reset:${hash}`)) || null;
}
export async function deleteResetToken(hash) {
  await kv.del(`reset:${hash}`);
}

// ── Counters (rate limiting) ──
export async function incrWithExpiry(key, ttlSeconds) {
  const n = await kv.incr(key);
  if (n === 1) await kv.expire(key, ttlSeconds);
  return n;
}
export async function getCount(key) {
  return Number(await kv.get(key)) || 0;
}
export async function clearKey(key) {
  await kv.del(key);
}

// ── Reminders (web push): one document per user + a set of everyone who has reminders on ──
export async function getPushDoc(userId) { return (await kv.get(`push:${userId}`)) || null; }
export async function setPushDoc(userId, doc) { await kv.set(`push:${userId}`, doc); }
export async function delPushDoc(userId) { await kv.del(`push:${userId}`); }
export async function pushUsersAdd(userId) { await kv.sadd('push:users', userId); }
export async function pushUsersRemove(userId) { await kv.srem('push:users', userId); }
export async function pushUsersList() { return (await kv.smembers('push:users')) || []; }

// ── Admin panel support (admin identities are NOT stored here: they live in Vercel settings) ──
export async function scanUserIds() {
  const ids = []; let cursor = 0;
  do {
    const [next, keys] = await kv.scan(cursor, { match: 'user:id:*', count: 500 });
    cursor = Number(next) || 0;
    for (const k of keys) ids.push(String(k).slice('user:id:'.length));
  } while (cursor !== 0);
  return ids;
}
export async function adminSessionGet(sid) { return (await kv.get(`adminsess:${sid}`)) || null; }
export async function adminSessionSet(sid, value, ttlSeconds) { await kv.set(`adminsess:${sid}`, value, { ex: ttlSeconds }); }
export async function adminSessionDel(sid) { await kv.del(`adminsess:${sid}`); }
export async function getTotpStep(slot) { return Number(await kv.get(`admintotp:${slot}`)) || -1; }
export async function setTotpStep(slot, step) { await kv.set(`admintotp:${slot}`, step, { ex: 600 }); }
export async function auditAdd(entry) { await kv.lpush('audit:log', JSON.stringify(entry)); await kv.ltrim('audit:log', 0, 1999); }
export async function auditList(n = 200) { return ((await kv.lrange('audit:log', 0, n - 1)) || []).map(x => (typeof x === 'string' ? JSON.parse(x) : x)); }
export async function adminCacheGet() { return (await kv.get('admin:cache:accounts')) || null; }
export async function adminCacheSet(value, ttlSeconds) { await kv.set('admin:cache:accounts', value, { ex: ttlSeconds }); }
export async function adminCacheClear() { await kv.del('admin:cache:accounts'); }
