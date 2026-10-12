// api/plan/generate.js
// Builds a plan with the built-in rule-based planner (lib/planner).
// No AI call and no per-plan cost. The planner screens the health answers first;
// if a condition needs a doctor, it returns { blocked: true, ... } instead of a plan.
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
    const result = generatePlan(profile);
    if (result.blocked) {
      return res.status(200).json({ blocked: true, reasons: result.reasons, eatingDisorder: !!result.eatingDisorder, message: result.message });
    }
    return res.status(200).json({ plan: result, goal: result.meta.goal });
  } catch (err) {
    console.error('plan generation failed:', err);
    return res.status(400).json({
      error: err.message || 'Could not build a plan from those details. Please check them and try again.',
    });
  }
}
