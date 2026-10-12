// api/auth/me.js
// Called on page load: is there a valid session for an account that still exists?
import { getSessionFromRequest, clearSessionCookie } from '../../lib/session.js';
import { getUserById } from '../../lib/db.js';

export default async function handler(req, res) {
  const session = getSessionFromRequest(req);
  if (!session) return res.status(200).json({ user: null });
  try {
    const user = await getUserById(session.sub);
    if (!user || (user.sv || 0) !== (session.sv || 0)) {
      res.setHeader('Set-Cookie', clearSessionCookie());
      return res.status(200).json({ user: null });
    }
    return res.status(200).json({ user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    console.error('me failed:', err);
    return res.status(200).json({ user: null });
  }
}
