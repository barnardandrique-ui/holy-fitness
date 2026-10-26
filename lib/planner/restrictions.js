// lib/planner/restrictions.js - which foods a person may eat (diet, allergies, foods they asked to avoid).
// Shared by the plan generator and the swap engine so both always follow the same rules.
import { FOODS } from './foods.js';

export const ALLERGY_MAP = {
  dairy: ['dairy'], milk: ['dairy'], lactose: ['dairy'], cheese: ['dairy'], yogurt: ['dairy'], yoghurt: ['dairy'], whey: ['dairy'], casein: ['dairy'],
  egg: ['egg'], eggs: ['egg'],
  gluten: ['gluten'], wheat: ['gluten'], celiac: ['gluten'], coeliac: ['gluten'], barley: ['gluten'], rye: ['gluten'],
  nut: ['treenut', 'peanut'], nuts: ['treenut', 'peanut'], treenut: ['treenut'], treenuts: ['treenut'],
  almond: ['treenut'], almonds: ['treenut'], walnut: ['treenut'], walnuts: ['treenut'], cashew: ['treenut'], cashews: ['treenut'], pecan: ['treenut'], hazelnut: ['treenut'], pistachio: ['treenut'],
  peanut: ['peanut'], peanuts: ['peanut'],
  soy: ['soy'], soya: ['soy'], tofu: ['soy'], tempeh: ['soy'], edamame: ['soy'],
  fish: ['fish'], salmon: ['fish'], tuna: ['fish'], cod: ['fish'], seafood: ['fish', 'shellfish'],
  shellfish: ['shellfish'], shrimp: ['shellfish'], prawn: ['shellfish'], prawns: ['shellfish'], crab: ['shellfish'], lobster: ['shellfish'],
  beef: ['beef'], pork: ['pork'], chicken: ['poultry'], turkey: ['poultry'], poultry: ['poultry'], meat: ['flesh'],
};
export const STOPWORDS = new Set(['and', 'allergy', 'allergic', 'allergies', 'intolerant', 'intolerance', 'avoid', 'avoidance', 'free', 'the', 'dont', 'not', 'eat', 'like', 'none', 'nothing', 'any', 'all']);

// Foods a person asked never to see again: a short list of food ids.
export function normalizeAvoid(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter(id => typeof id === 'string' && /^[a-z0-9_]{1,40}$/.test(id)))].slice(0, 40);
}

export function allowedFoods(p) {
  const banned = new Set();
  const textBans = [];
  if (p.diet === 'vegan') ['flesh', 'egg', 'dairy'].forEach(t => banned.add(t));
  if (p.diet === 'vegetarian') banned.add('flesh');

  const tokens = p.allerg.toLowerCase().split(/[^a-z]+/).filter(t => t.length >= 3 && !STOPWORDS.has(t));
  for (const tok of tokens) {
    if (ALLERGY_MAP[tok]) ALLERGY_MAP[tok].forEach(t => banned.add(t));
    else if (tok.length >= 4) textBans.push(tok.replace(/s$/, ''));
  }

  const avoid = new Set(normalizeAvoid(p.avoid));
  const map = new Map();
  for (const f of FOODS) {
    if (avoid.has(f.id)) continue;
    if (f.tags.some(t => banned.has(t))) continue;
    const lbl = f.label.toLowerCase();
    if (textBans.some(w => lbl.includes(w))) continue;
    map.set(f.id, f);
  }
  return map;
}
