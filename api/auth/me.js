// api/auth/me.js
import { getSessionFromRequest } from '../../lib/session.js';

export default async function handler(req, res) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return res.status(200).json({ user: null });
  }
  return res.status(200).json({
    user: { id: session.sub, name: session.name, email: session.email },
  });
}
