// lib/email.js
// Sends email through Resend (https://resend.com) using plain fetch — no SDK.
//
// Needs these environment variables in Vercel:
//   RESEND_API_KEY   your Resend API key
//   EMAIL_FROM       e.g.  Holy Fitness <noreply@yourdomain.com>
//   APP_URL          e.g.  https://holy-fitness-rho.vercel.app  (optional on Vercel)
//
// Note: until you verify your own domain in Resend, it will only deliver to the
// email address you signed up to Resend with. Verify a domain to email anyone.

export function appUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return null;
}

export function emailConfigured() {
  return !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM && appUrl());
}

export async function sendEmail({ to, subject, html, text }) {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, html, text }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`Email provider error ${resp.status}: ${detail.slice(0, 200)}`);
  }
}
