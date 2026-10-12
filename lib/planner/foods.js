// lib/planner/foods.js
// ---------------------------------------------------------------------------
// Food library + meal templates for the plan generator.
//
// All macros are per 100 g (cooked/prepared where that's how it's eaten).
// tags drive diet/allergy filtering:
//   flesh (meat, poultry, fish, shellfish), egg, dairy, gluten, soy,
//   treenut, peanut, fish, shellfish, poultry, beef, pork
// piece: lets amounts show as "2 large eggs" / "1.5 tbsp olive oil" instead of grams
// min/max: gram limits the solver may use for that food in one meal
// ---------------------------------------------------------------------------

const F = (id, label, p, c, f, tags = [], extra = {}) => ({ id, label, p, c, f, tags, ...extra });

export const FOODS = [
  // ── Animal proteins ──
  F('chicken', 'grilled chicken breast', 31, 0, 3.6, ['flesh', 'poultry'], { min: 85, max: 450 }),
  F('turkey', 'roast turkey breast', 29, 0, 1.5, ['flesh', 'poultry'], { min: 85, max: 450 }),
  F('lean_beef', 'lean ground beef (95%)', 26, 0, 5.5, ['flesh', 'beef'], { min: 85, max: 420 }),
  F('sirloin', 'grilled sirloin steak', 27, 0, 8, ['flesh', 'beef'], { min: 85, max: 400 }),
  F('pork_tenderloin', 'roast pork tenderloin', 26, 0, 3.5, ['flesh', 'pork'], { min: 85, max: 420 }),
  F('salmon', 'baked salmon fillet', 22, 0, 12, ['flesh', 'fish'], { min: 85, max: 380 }),
  F('cod', 'baked cod fillet', 23, 0, 1, ['flesh', 'fish'], { min: 90, max: 450 }),
  F('tuna', 'canned tuna (in water)', 25, 0, 1, ['flesh', 'fish'], { min: 60, max: 300 }),
  F('shrimp', 'cooked shrimp', 24, 0.2, 1, ['flesh', 'shellfish'], { min: 85, max: 400 }),
  F('egg', 'whole eggs', 12.6, 0.7, 9.5, ['egg'], { min: 50, max: 250, piece: { one: 'large egg', many: 'large eggs', g: 50, step: 1 } }),
  F('egg_white', 'liquid egg whites', 11, 0.7, 0.2, ['egg'], { min: 60, max: 450 }),
  F('greek_yogurt', 'non-fat Greek yogurt', 10, 3.6, 0.4, ['dairy'], { min: 100, max: 500 }),
  F('cottage_cheese', 'low-fat cottage cheese', 11, 3.4, 1, ['dairy'], { min: 100, max: 450 }),
  F('whey', 'whey protein powder', 80, 6, 5, ['dairy'], { min: 15, max: 70 }),

  // ── Plant proteins ──
  F('plant_protein', 'plant protein powder (pea/rice)', 75, 8, 6, [], { min: 15, max: 70 }),
  F('tofu', 'firm tofu', 9, 2, 5, ['soy'], { plant: true, min: 100, max: 450 }),
  F('tempeh', 'tempeh', 19, 9, 11, ['soy'], { plant: true, min: 80, max: 260 }),
  F('seitan', 'seitan', 25, 4, 2, ['gluten'], { plant: true, min: 80, max: 320 }),
  F('edamame', 'shelled edamame', 11, 9, 5, ['soy'], { plant: true, min: 80, max: 300 }),
  F('lentils', 'cooked lentils', 9, 20, 0.4, [], { plant: true, min: 100, max: 450 }),
  F('chickpeas', 'cooked chickpeas', 9, 27, 2.6, [], { plant: true, min: 100, max: 400 }),
  F('black_beans', 'cooked black beans', 8.9, 24, 0.5, [], { plant: true, min: 100, max: 400 }),

  // ── Carbs ──
  F('white_rice', 'cooked white rice', 2.7, 28, 0.3, [], { fam: 'grain', min: 80, max: 450 }),
  F('brown_rice', 'cooked brown rice', 2.6, 23, 0.9, [], { fam: 'grain', min: 80, max: 450 }),
  F('quinoa', 'cooked quinoa', 4.4, 21, 1.9, [], { fam: 'grain', min: 80, max: 400 }),
  F('potato', 'baked potato', 2.5, 21, 0.1, [], { fam: 'tuber', min: 100, max: 450 }),
  F('sweet_potato', 'baked sweet potato', 2, 20, 0.1, [], { fam: 'tuber', min: 100, max: 450 }),
  F('oats', 'rolled oats (dry)', 13, 66, 7, ['gluten'], { fam: 'grain', min: 25, max: 120 }),
  F('cream_of_rice', 'cream of rice (dry)', 6, 82, 0.5, [], { fam: 'grain', min: 25, max: 90 }),
  F('bread', 'whole-wheat bread', 12.5, 43, 3.5, ['gluten'], { fam: 'bread', min: 35, max: 175, piece: { one: 'slice whole-wheat bread', many: 'slices whole-wheat bread', g: 35, step: 1 } }),
  F('pasta', 'cooked pasta', 5.8, 31, 0.9, ['gluten'], { fam: 'grain', min: 100, max: 350 }),
  F('rice_noodles', 'cooked rice noodles', 0.9, 25, 0.2, [], { fam: 'grain', min: 100, max: 450 }),
  F('tortilla', 'whole-wheat tortilla', 9, 45, 7, ['gluten'], { fam: 'bread', min: 60, max: 180, piece: { one: 'whole-wheat tortilla', many: 'whole-wheat tortillas', g: 60, step: 1 } }),
  F('rice_cake', 'rice cakes', 8, 81, 3, [], { fam: 'bread', min: 9, max: 45, piece: { one: 'rice cake', many: 'rice cakes', g: 9, step: 1 } }),
  F('banana', 'banana', 1.1, 23, 0.3, [], { fam: 'fruit', min: 59, max: 240, piece: { one: 'medium banana', many: 'medium bananas', g: 118, step: 0.5 } }),
  F('apple', 'apple', 0.3, 14, 0.2, [], { fam: 'fruit', min: 90, max: 360, piece: { one: 'medium apple', many: 'medium apples', g: 180, step: 0.5 } }),
  F('orange', 'orange', 0.9, 12, 0.1, [], { fam: 'fruit', min: 130, max: 390, piece: { one: 'orange', many: 'oranges', g: 130, step: 1 } }),
  F('berries', 'mixed berries', 0.7, 12, 0.3, [], { fam: 'fruit', min: 40, max: 150 }),

  F('bagel', 'plain bagel', 10, 55, 1.5, ['gluten'], { fam: 'bread', min: 95, max: 190, piece: { one: 'plain bagel', many: 'plain bagels', g: 95, step: 1 } }),
  F('dates', 'Medjool dates', 2.5, 75, 0.4, [], { fam: 'fruit', min: 24, max: 120, piece: { one: 'Medjool date', many: 'Medjool dates', g: 24, step: 1 } }),

  // ── Vegetables ──
  F('broccoli', 'steamed broccoli', 2.8, 7, 0.4),
  F('spinach', 'wilted spinach', 2.9, 3.6, 0.4),
  F('green_beans', 'green beans', 1.8, 7, 0.2),
  F('peppers', 'sautéed peppers and onions', 1, 6, 0.3),
  F('asparagus', 'roasted asparagus', 2.2, 3.9, 0.1),
  F('zucchini', 'grilled zucchini', 1.2, 3.1, 0.3),
  F('cauliflower', 'roasted cauliflower', 1.9, 5, 0.3),

  // ── Fats ──
  F('olive_oil', 'olive oil', 0, 0, 100, [], { min: 5, max: 42, piece: { one: 'tbsp olive oil', many: 'tbsp olive oil', g: 13.5, step: 0.5 } }),
  F('avocado', 'avocado', 2, 9, 15, [], { min: 40, max: 150 }),
  F('almonds', 'almonds', 21, 22, 50, ['treenut'], { min: 10, max: 45 }),
  F('walnuts', 'walnuts', 15, 14, 65, ['treenut'], { min: 10, max: 45 }),
  F('pumpkin_seeds', 'pumpkin seeds', 30, 11, 49, [], { min: 10, max: 40 }),
  F('peanut_butter', 'peanut butter', 25, 20, 50, ['peanut'], { min: 8, max: 48, piece: { one: 'tbsp peanut butter', many: 'tbsp peanut butter', g: 16, step: 0.5 } }),
  F('almond_butter', 'almond butter', 21, 19, 56, ['treenut'], { min: 8, max: 48, piece: { one: 'tbsp almond butter', many: 'tbsp almond butter', g: 16, step: 0.5 } }),
  F('cheddar', 'cheddar cheese', 25, 1.3, 33, ['dairy'], { min: 10, max: 45 }),
];

const NUT_FATS = ['peanut_butter', 'almond_butter', 'walnuts', 'almonds', 'pumpkin_seeds'];
const VEG = ['broccoli', 'green_beans', 'spinach', 'peppers', 'asparagus', 'zucchini', 'cauliflower'];

// Meal templates. "fixed" items are always included at that gram amount;
// protein / carb / fat / veg list the foods the generator may choose from.
export const MEAL_TEMPLATES = [
  // ── Breakfasts ──
  { type: 'breakfast', name: 'Egg & Egg-White Scramble', carb2: ['bagel', 'banana', 'dates'], fixed: [{ food: 'egg', g: 100 }], protein: ['egg_white'], carb: ['bread', 'potato', 'sweet_potato', 'rice_cake'], fat: ['avocado', 'olive_oil', 'cheddar'], veg: ['spinach', 'peppers', 'zucchini'] },
  { type: 'breakfast', name: 'Greek Yogurt Power Bowl', carb2: ['banana', 'dates', 'bagel'], fixed: [{ food: 'berries', g: 80 }], protein: ['greek_yogurt'], carb: ['oats', 'banana'], fat: NUT_FATS },
  { type: 'breakfast', name: 'Protein Oats', needs: [['oats']], carb2: ['banana', 'dates', 'bagel'], fixed: [{ food: 'berries', g: 60 }], protein: ['whey', 'plant_protein'], carb: ['oats'], fat: NUT_FATS },
  { type: 'breakfast', name: 'Protein Cream of Rice', needs: [['cream_of_rice']], carb2: ['banana', 'dates', 'bagel'], fixed: [{ food: 'berries', g: 60 }], protein: ['whey', 'plant_protein'], carb: ['cream_of_rice'], fat: NUT_FATS },
  { type: 'breakfast', name: 'Cottage Cheese & Fruit Plate', needs: [['banana', 'apple', 'orange']], carb2: ['dates', 'bagel'], protein: ['cottage_cheese'], carb: ['banana', 'apple', 'orange', 'rice_cake', 'bread'], fat: ['almonds', 'walnuts', 'pumpkin_seeds', 'peanut_butter'] },
  { type: 'breakfast', name: 'Tofu Scramble', carb2: ['banana', 'dates', 'bread'], protein: ['tofu'], carb: ['potato', 'sweet_potato', 'bread', 'quinoa'], fat: ['avocado', 'olive_oil'], veg: ['spinach', 'peppers', 'zucchini'] },

  // ── Main meals (lunch / dinner) ──
  { type: 'main', name: null, carb2: ['bread', 'bagel', 'tortilla'], protein: ['chicken', 'turkey', 'lean_beef', 'sirloin', 'pork_tenderloin', 'salmon', 'cod', 'shrimp', 'tuna', 'tofu', 'tempeh', 'seitan', 'edamame', 'lentils', 'chickpeas', 'black_beans'], carb: ['white_rice', 'brown_rice', 'potato', 'sweet_potato', 'quinoa', 'pasta', 'rice_noodles', 'tortilla'], fat: ['olive_oil', 'avocado', 'almonds', 'walnuts', 'cheddar'], veg: VEG },

  // ── Snacks ──
  { type: 'snack', name: 'Protein Shake & Fruit', needs: [['banana', 'apple', 'orange']], carb2: ['banana', 'dates', 'apple'], protein: ['whey', 'plant_protein'], carb: ['banana', 'apple', 'orange'], fat: ['peanut_butter', 'almond_butter', 'almonds'] },
  { type: 'snack', name: 'Greek Yogurt & Berries', needs: [['berries']], carb2: ['banana', 'dates', 'apple'], protein: ['greek_yogurt'], carb: ['berries', 'banana', 'apple'], fat: ['almonds', 'walnuts', 'pumpkin_seeds'] },
  { type: 'snack', name: 'Cottage Cheese & Fruit', needs: [['apple', 'banana', 'orange']], carb2: ['banana', 'dates', 'apple'], protein: ['cottage_cheese'], carb: ['apple', 'banana', 'orange', 'rice_cake'], fat: ['almonds', 'walnuts', 'pumpkin_seeds'] },
  { type: 'snack', name: 'Tuna & Rice Cakes', needs: [['rice_cake']], carb2: ['banana', 'dates', 'apple'], protein: ['tuna'], carb: ['rice_cake'], fat: ['avocado', 'olive_oil'] },
  { type: 'snack', name: null, carb2: ['banana', 'dates', 'apple'], protein: ['turkey', 'chicken'], carb: ['rice_cake', 'banana'], fat: ['avocado'] },
  { type: 'snack', name: 'Edamame & Fruit', needs: [['banana', 'apple', 'orange']], carb2: ['banana', 'dates', 'apple'], protein: ['edamame'], carb: ['banana', 'apple', 'orange', 'rice_cake'], fat: ['pumpkin_seeds', 'almonds'] },
  { type: 'snack', name: 'Plant Shake & Banana', needs: [['banana']], carb2: ['banana', 'dates', 'apple'], protein: ['plant_protein'], carb: ['banana', 'apple'], fat: ['peanut_butter', 'almond_butter', 'pumpkin_seeds'] },
];
