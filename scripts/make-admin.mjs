// scripts/make-admin.mjs - creates the secure login details for an admin. Run it yourself, in your own terminal.
//   node scripts/make-admin.mjs 1 you@gmail.com "Your Name" --code      (admin slot 1, with an authenticator-app code)
//   node scripts/make-admin.mjs 2 coach@gmail.com "Coach Name" --code --no-session   (admin slot 2: reuse the same session setting)
// It asks for the password (typing is hidden), then saves everything into the file  admin-settings.txt  (git ignores it, so it is never uploaded).
// Nothing private is printed on screen, so a screenshot of the terminal cannot leak anything. The password itself is never stored, only a secure code made from it.
// There are exactly TWO admin slots (1 and 2).
import readline from 'node:readline';
import crypto from 'node:crypto';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';

const FILE = 'admin-settings.txt';
const [slot, email, name = '', ...flags] = process.argv.slice(2);
if (!['1', '2'].includes(slot) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) {
  console.log('Usage: node scripts/make-admin.mjs <1|2> <email> "<Name>" [--code] [--no-session]\nThere are only two admin slots: 1 and 2.'); process.exit(1);
}
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });      // ONE prompt for both questions
let hidden = '';
const out = rl._writeToOutput; rl._writeToOutput = s => { if (!hidden || s.includes(hidden)) out.call(rl, s); };    // hide what is typed
const queue = []; let waiter = null;                                                                          // lines are queued, so even two pasted lines at once are never lost
rl.on('line', l => { if (waiter) { const w = waiter; waiter = null; w(l); } else queue.push(l); });
const ask = q => new Promise(res => {
  hidden = q; rl.setPrompt(q); rl.prompt();
  const take = l => { hidden = ''; process.stdout.write('\n'); res(l); };
  if (queue.length) take(queue.shift()); else waiter = take;
});
const p1 = await ask('Choose a password (at least 12 characters, typing is hidden): '), p2 = await ask('Type it again: ');
rl.close();
if (p1 !== p2) { console.log('The two passwords did not match. Nothing was created.'); process.exit(1); }
if (p1.length < 12) { console.log('That password is too short. Use at least 12 characters (a few words is fine). Nothing was created.'); process.exit(1); }

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32 = buf => { let bits = ''; for (const b of buf) bits += b.toString(2).padStart(8, '0'); let o = ''; for (let i = 0; i < bits.length; i += 5) o += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]; return o; };
const totpKey = flags.includes('--code') ? b32(crypto.randomBytes(20)) : null;
const items = [
  { key: `ADMIN_${slot}_EMAIL`, value: email.toLowerCase(), type: 'Config' },
  { key: `ADMIN_${slot}_HASH`, value: bcrypt.hashSync(p1, 12), type: 'Secret' },
  ...(name ? [{ key: `ADMIN_${slot}_NAME`, value: name.replace(/\s+/g, ' ').trim(), type: 'Config' }] : []),
  ...(totpKey ? [{ key: `ADMIN_${slot}_TOTP`, value: totpKey, type: 'Secret' }] : []),
  ...(flags.includes('--no-session') ? [] : [{ key: 'ADMIN_SESSION_SECRET', value: crypto.randomBytes(32).toString('hex'), type: 'Secret' }]),
];
const bar = '-'.repeat(64);
const text = [
  `HOLY FITNESS ADMIN SETTINGS (admin ${slot})`, `Made on ${new Date().toISOString().slice(0, 10)}`, '',
  'HOW TO USE THIS FILE',
  '1. In Vercel open your holy-fitness project, then Settings, then Environment Variables, then Add.',
  `2. Add the ${items.length} settings below, one at a time. Type the KEY exactly as written. For the VALUE, copy ONLY the single line under it`,
  '   (triple-click the line, then Ctrl+C). The value has no spaces, no quote marks and no "KEY=" in front.',
  '3. Tick Production. Choose the Type shown next to each setting (Secret or Config).',
  '4. Click Redeploy in Deployments and wait for Ready. Then DELETE THIS FILE.',
  totpKey ? `5. Add the authenticator key (setting ADMIN_${slot}_TOTP) to Google or Microsoft Authenticator: "Enter a setup key", name it Holy Fitness Admin, time-based.` : '',
  '', 'This file is private and is not uploaded to GitHub. Never paste it into a chat or send a screenshot of it.', '',
  ...items.flatMap((it, i) => [bar, `SETTING ${i + 1} of ${items.length}      KEY:  ${it.key}      TYPE:  ${it.type}`, 'VALUE (copy only the line below):', it.value, '']),
  bar, '',
].filter((l, i, a) => !(l === '' && a[i - 1] === '' )).join('\n');
fs.rmSync(FILE, { force: true });
fs.writeFileSync(FILE, text, { mode: 0o600 });
console.log(`\nDone. Your admin settings are saved in the file: ${FILE}`);
console.log('Open it from the file list on the left, follow the steps at the top, then delete the file.');
console.log('It is private and is not uploaded to GitHub. Nothing private is shown on this screen, on purpose.\n');
