// scripts/generate-vapid.mjs - makes the keys that let your server send reminder notifications.
//   node scripts/generate-vapid.mjs
// Prints a public key, a private key and a cron secret. Add all four lines to Vercel -> Settings -> Environment Variables.
// The private key and the secret are passwords: never share them or commit them.
import crypto from 'node:crypto';
const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pub = publicKey.export({ format: 'jwk' }), priv = privateKey.export({ format: 'jwk' });
const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]).toString('base64url');
console.log('\nAdd these four in Vercel (Settings -> Environment Variables), then redeploy:\n');
console.log('VAPID_PUBLIC_KEY=' + raw);
console.log('VAPID_PRIVATE_KEY=' + priv.d);
console.log('VAPID_SUBJECT=mailto:you@example.com   <- put your own email here');
console.log('CRON_SECRET=' + crypto.randomBytes(24).toString('hex'));
console.log('');
