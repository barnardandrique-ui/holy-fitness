// api/auth/me.js
// GET  : called on page load: is there a valid session for an account that still exists?
// POST : { coaching: { share?, interest? } } - the client's own coaching switches (both OFF unless they turn them on):
//          share    = my coach may see my progress (plan, workouts, meals, sleep, body numbers)
//          interest = I am interested in personal training and agree to be contacted by email about it
import { getSessionFromRequest, clearSessionCookie } from '../../lib/session.js';
import { getUserById, updateUser, adminCacheClear } from '../../lib/db.js';

const coaching = u => ({ share: !!(u.coach && u.coach.share), interest: !!(u.coach && u.coach.interest), lastViewedAt: (u.coach && u.coach.lastViewedAt) || null });

export default async function handler(req, res) {
  const session = getSessionFromRequest(req);
  if (!session) return res.status(200).json({ user: null });
  try {
    let user = await getUserById(session.sub);
    if (!user || (user.sv || 0) !== (session.sv || 0)) {
      res.setHeader('Set-Cookie', clearSessionCookie());
      return res.status(200).json({ user: null });
    }
    if (req.method === 'POST') {
      const c = (req.body || {}).coaching;
      if (!c || typeof c !== 'object') return res.status(400).json({ error: 'Nothing to change.' });
      const now = new Date().toISOString(), prev = user.coach || {}, next = { ...prev };
      if (c.share !== undefined) { next.share = c.share === true; next[next.share ? 'shareOnAt' : 'shareOffAt'] = now; }
      if (c.interest !== undefined) { next.interest = c.interest === true; next[next.interest ? 'interestOnAt' : 'interestOffAt'] = now; }
      user = await updateUser(user.id, { coach: next });
      await adminCacheClear();                                    // changes show in the admin panel straight away
    }
    return res.status(200).json({ user: { id: user.id, name: user.name, email: user.email }, coaching: coaching(user) });
  } catch (err) {
    console.error('me failed:', err);
    return res.status(req.method === 'POST' ? 500 : 200).json(req.method === 'POST' ? { error: 'Something went wrong. Please try again.' } : { user: null });
  }
}
