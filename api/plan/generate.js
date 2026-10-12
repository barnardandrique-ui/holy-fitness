// api/plan/generate.js
// Builds a plan with the built-in rule-based planner (lib/planner).
// No AI call, no API key, no per-plan cost — and it responds in milliseconds.
import { getSessionFromRequest } from '../../lib/session.js';
import { generatePlan } from '../../lib/planner/engine.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = getSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ error: 'Please log in first.' });
  }

  try {
    const profile = { ...(req.body || {}), name: session.name };
    const plan = generatePlan(profile);
    return res.status(200).json({ plan, goal: plan.meta.goal });
  } catch (err) {
    console.error('plan generation failed:', err);
    return res.status(400).json({
      error: err.message || 'Could not build a plan from those details. Please check them and try again.',
    });
  }
}
