// lib/db.js
// ---------------------------------------------------------------------------
// User-storage abstraction.
//
// This ships with a JSON-file-backed implementation so the whole app can be
// built and tested locally with zero setup. IMPORTANT: this is NOT durable
// once deployed on Vercel — serverless functions get a fresh, read-only-ish
// filesystem per invocation, so data written here will not reliably persist
// in production.
//
// Before you go live with real users, swap the three functions below for
// calls to a real database (e.g. Vercel Postgres, Neon, or Supabase). Keep
// the function names and shapes the same and nothing else in the app needs
// to change — every API route only talks to this file.
//
// Example swap (Postgres via @vercel/postgres), once you're ready:
//
//   import { sql } from '@vercel/postgres';
//   export async function getUserByEmail(email) {
//     const { rows } = await sql`SELECT * FROM users WHERE email = ${email.toLowerCase()}`;
//     return rows[0] || null;
//   }
//   export async function createUser({ name, email, passwordHash }) {
//     const { rows } = await sql`
//       INSERT INTO users (name, email, password_hash)
//       VALUES (${name}, ${email.toLowerCase()}, ${passwordHash})
//       RETURNING *`;
//     return rows[0];
//   }
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DB_PATH = path.join(process.cwd(), '.data', 'users.json');

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

function writeAll(users) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(users, null, 2));
}

export async function getUserByEmail(email) {
  const users = readAll();
  return users.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
}

export async function createUser({ name, email, passwordHash }) {
  const users = readAll();
  if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
    throw new Error('EMAIL_TAKEN');
  }
  const user = {
    id: crypto.randomUUID(),
    name,
    email,
    passwordHash,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  writeAll(users);
  return user;
}

export async function getUserById(id) {
  const users = readAll();
  return users.find(u => u.id === id) || null;
}
