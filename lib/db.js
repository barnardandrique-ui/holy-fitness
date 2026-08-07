// lib/db.js
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
