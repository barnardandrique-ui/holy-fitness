// lib/db.js
// ---------------------------------------------------------------------------
// User storage backed by Vercel KV — a simple key-value store that lives
// directly inside your Vercel account (Storage tab -> Create Database -> KV).
// No SQL, no separate signup — it's genuinely just storage inside Vercel.
//
// Each user is stored twice under two keys, so lookups by either email or id
// are both fast:
//   user:id:<id>          -> the full user object
//   user:email:<email>    -> just the id (a pointer to the record above)
//
// Every API route calls only the three functions below — nothing else in
// the app needs to know this is KV under the hood.
// ---------------------------------------------------------------------------

import { kv } from '@vercel/kv';
import crypto from 'crypto';

export async function getUserByEmail(email) {
  const normalized = email.toLowerCase();
  const id = await kv.get(`user:email:${normalized}`);
  if (!id) return null;
  return (await kv.get(`user:id:${id}`)) || null;
}

export async function createUser({ name, email, passwordHash }) {
  const normalized = email.toLowerCase();
  const existing = await getUserByEmail(normalized);
  if (existing) {
    throw new Error('EMAIL_TAKEN');
  }
  const id = crypto.randomUUID();
  const user = {
    id,
    name,
    email: normalized,
    passwordHash,
    createdAt: new Date().toISOString(),
  };
  await kv.set(`user:id:${id}`, user);
  await kv.set(`user:email:${normalized}`, id);
  return user;
}

export async function getUserById(id) {
  return (await kv.get(`user:id:${id}`)) || null;
}
