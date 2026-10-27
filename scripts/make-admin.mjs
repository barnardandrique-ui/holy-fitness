// scripts/make-admin.mjs - creates the secure login details for an admin. Run it yourself, in your own terminal.
//   node scripts/make-admin.mjs 1 you@gmail.com "Your Name"            (admin slot 1)
//   node scripts/make-admin.mjs 2 coach@gmail.com "Coach Name" --code  (admin slot 2, with an authenticator-app code)
// It asks for the password (typing is hidden), then prints the settings to add in Vercel. Nothing is stored or sent anywhere.
// There are exactly TWO admin slots. The password itself is never printed or stored, only a secure code made from it.
import readline from 'node:readline';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

const [slot, email, name = '', ...flags] = process.argv.slice(2);
if (!['1', '2'].includes(slot) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) {
  console.log('Usage: node scripts/make-admin.mjs <1|2> <email> "<Name>" [--code]\nThere are only two admin slots: 1 and 2.'); process.exit(1);
}
const ask = q => new Promise(res => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const out = rl._writeToOutput; rl._writeToOutput = s => { if (s.includes(q)) out.call(rl, s); };      // hide what is typed
  rl.question(q, a => { rl.close(); process.stdout.write('\n'); res(a); });
});
const p1 = await ask('Choose a password (at least 12 characters): '), p2 = await ask('Type it again: ');
if (p1 !== p2) { console.log('The two passwords did not match. Nothing was created.'); process.exit(1); }
if (p1.length < 12) { console.log('That password is too short. Use at least 12 characters (a few words is fine). Nothing was created.'); process.exit(1); }
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const secret = (buf => { let bits = ''; for (const b of buf) bits += b.toString(2).padStart(8, '0'); let o = ''; for (let i = 0; i < bits.length; i += 5) o += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]; return o; })(crypto.randomBytes(20));
console.log('\nAdd these in Vercel -> your project -> Settings -> Environment Variables, then redeploy.');
console.log('The VALUE is everything after the = sign: no spaces, no quote marks.\n');
console.log(`ADMIN_${slot}_EMAIL=${email.toLowerCase()}`);
console.log(`ADMIN_${slot}_HASH=${bcrypt.hashSync(p1, 12)}`);
if (name) console.log(`ADMIN_${slot}_NAME=${name}`);
if (flags.includes('--code')) {
  console.log(`ADMIN_${slot}_TOTP=${secret}`);
  console.log(`\nTo get the 6-digit codes: in an authenticator app (Google Authenticator, Microsoft Authenticator...) choose "Enter a setup key",`);
  console.log(`name it "Holy Fitness Admin", and type this key: ${secret}   (time-based)`);
}
console.log('\nOnly ONCE (not per admin): also add these two if you have not yet:');
console.log('ADMIN_SESSION_SECRET=' + crypto.randomBytes(32).toString('hex') + '   <- must be different from SESSION_SECRET');
console.log('');
