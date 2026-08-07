// api/plan/generate.js
import { getSessionFromRequest } from '../../lib/session.js';

const MODEL = 'claude-sonnet-4-6';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = getSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ error: 'Please log in first.' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error: 'Server is missing ANTHROPIC_API_KEY. Add it to your environment variables.',
    });
  }

  const profile = { ...(req.body || {}), name: session.name };
  const goal = profile.goal || 'muscle gain';

  try {
    const [overviewRes, days1Res, days2Res] = await Promise.all([
      callClaude(buildOverviewPrompt(profile), 1200, 40000),
      callClaude(buildDaysPrompt(profile, ['Monday', 'Tuesday', 'Wednesday', 'Thursday']), 4200, 55000),
      callClaude(buildDaysPrompt(profile, ['Friday', 'Saturday', 'Sunday']), 3400, 55000),
    ]);

    const plan = {
      overview: overviewRes.overview,
      sleepProtocol: overviewRes.sleepProtocol,
      days: [...days1Res.days, ...days2Res.days],
    };

    return res.status(200).json({ plan, goal });
  } catch (err) {
    const message =
      err.name === 'AbortError'
        ? 'The request took too long and timed out. Please try again.'
        : err.message || 'Something went wrong generating your plan.';
    return res.status(500).json({ error: message });
  }
}

async function callClaude(prompt, maxTokens, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    clearTimeout(timeout);

    const data = await upstream.json();

    if (!upstream.ok) {
      throw new Error(data?.error?.message || `Upstream request failed (status ${upstream.status}).`);
    }
    if (data.stop_reason === 'max_tokens') {
      throw new Error('A section of the plan was cut off before it finished generating. Please try again.');
    }

    const rawText = data.content.map(b => b.text || '').join('');
    let clean = rawText.replace(/```json|```/gi, '').trim();
    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      clean = clean.slice(firstBrace, lastBrace + 1);
    }
    return JSON.parse(clean);
  } finally {
    clearTimeout(timeout);
  }
}

function profileBlock(profile) {
  return `CLIENT PROFILE:
- Name: ${profile.name}
- Gender: ${profile.gender}
- Age: ${profile.age} | Height: ${profile.height}cm | Weight: ${profile.weight}kg | Body Fat: ${profile.bf}%
- Training Experience: ${profile.exp}
- Training Days/Week: ${profile.freq}
- Current Sleep: ${profile.sleep} hrs/night | Stress Level: ${profile.stress}
- Primary Goal: ${profile.goal}
- Diet Style: ${profile.diet} | Allergies/Avoidances: ${profile.allerg}
- Menstrual Cycle Phase: ${profile.cycle}
- Enhanced/On Cycle: ${profile.enhancedVal ? 'YES — ' + profile.compound + ', Week ' + profile.cycleWeek : 'Natural'}`;
}

function buildOverviewPrompt(profile) {
  return `You are Holy Fitness AI — an elite fitness coach and sports nutritionist. Based on the client profile below, generate the high-level overview and sleep strategy for a 7-day plan (the day-by-day details are generated separately — do not include them here).

${profileBlock(profile)}

Generate a response in STRICT JSON format only. No markdown, no preamble, just raw JSON, with this exact structure:
{
  "overview": {
    "dailyCalories": number,
    "dailyProtein": number,
    "dailyCarbs": number,
    "dailyFats": number,
    "programName": "string",
    "summary": "string (3-4 sentences covering the overall strategy, why it suits this client, and what to expect)"
  },
  "sleepProtocol": {
    "overview": "string (2-3 sentences max)",
    "tips": ["string (short)", "string (short)", "string (short)", "string (short)"]
  }
}

Rules:
- Calories and macros must be mathematically consistent with the goal and body stats
- Enhanced clients should have higher protein
- Sleep protocol must be tailored to the goal
- Output raw JSON only — no markdown fences, no preamble, no trailing commentary`;
}

function buildDaysPrompt(profile, dayNames) {
  return `You are Holy Fitness AI — an elite fitness coach and sports nutritionist. Generate ONLY the following days of a 7-day plan, in this exact order: ${dayNames.join(', ')}. Do not generate any other days.

${profileBlock(profile)}

Generate a response in STRICT JSON format only. No markdown, no preamble, just raw JSON, with this exact structure:
{
  "days": [
    {
      "day": "${dayNames[0]}",
      "trainingType": "string e.g. Push — Chest, Shoulders, Triceps",
      "isRest": false,
      "training": {
        "warmup": "string (short, max 12 words)",
        "exercises": [
          { "name": "string", "sets": "string e.g. 4", "reps": "string e.g. 8-10", "rest": "string e.g. 90s", "notes": "string (max 8 words, omit if nothing important to add)" }
        ],
        "cooldown": "string (short, max 12 words)"
      },
      "nutrition": {
        "totalCalories": number,
        "meals": [
          { "time": "string e.g. 7:00 AM", "name": "string e.g. Pre-Workout Breakfast", "foods": "string (specific foods and portions, max 15 words)", "calories": number, "protein": number, "carbs": number, "fats": number }
        ],
        "hydration": "string (max 12 words)",
        "supplements": "string (max 12 words)"
      },
      "sleep": {
        "targetHours": number,
        "bedtime": "string e.g. 10:00 PM",
        "wakeTime": "string e.g. 6:00 AM",
        "protocol": "string (max 15 words)"
      }
    }
  ]
}

Rules:
- Include exactly ${dayNames.length} day object(s), for ${dayNames.join(', ')}, in that order — nothing else
- isRest should be true for rest days; on rest days training exercises can be an empty array and warmup/cooldown can be "Active recovery"
- 3-4 meals per day is enough — do not over-generate
- Calories and macros must be mathematically consistent with the goal and body stats
- Meal foods must be specific, not generic (e.g. "200g chicken breast, 150g rice, 80g broccoli"), but keep it brief — no long descriptions
- Respect the diet style and allergies exactly
- Enhanced clients should have higher protein and volume
- Cycle phase for women should influence training intensity and nutrition
- Make exercise selection specific and appropriate for experience level
- Keep every string field as short as possible while staying specific and useful — brevity matters, this is a fast lookup reference, not an essay
- Output raw JSON only — no markdown fences, no preamble, no trailing commentary`;
}
