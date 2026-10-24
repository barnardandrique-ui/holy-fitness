#!/usr/bin/env python3
"""Builds lib/planner/library.js (the planner's exercise pools) and js/exercise-links.js from the Free Exercise DB bundle.

  python3 scripts/build-planner-library.py data/exercises.json lib/planner/library.js js/exercise-links.js
"""
import json, re, collections, sys
lib = json.load(open(sys.argv[1] if len(sys.argv) > 1 else 'data/exercises.json', encoding='utf-8'))
EQ_OK = {'barbell', 'dumbbell', 'machine', 'cable', 'e-z curl bar', 'body only', 'kettlebells', 'other', ''}
BLOCK = re.compile(r"behind (the )?neck|upright|neck|jefferson|atlas|stone|yoke|keg|\blog\b|tire|sled|chain|car deadlift|farmer|zercher|snatch|clean|jerk|muscle.?up|handstand|planche|pistol|dragon|sissy|reverse hyper|suspended|trx|\brings?\b|band|rocking|bosu|stability|ball|loaded|weighted|bodyweight flyes|iron cross|flag|wheel|vest|thick bar|axle|bear|rope climb|stair|heavy bag|tractor|truck|hammer.*sled|pull rope|rack pull|deficit|anderson|pin |block|board|jm press|guillotine|wide.?grip.*bench|reverse.?grip.*bench|\bfloor press|lying.*extension.*neck|scapular|crucifix|bottoms|around the world|seated.*(rear|back).*neck|leverage|kipping|pullover|aerobic|jump rope|sandbag|crossover reverse|trap bar jump|power|hang|isometric.*neck", re.I)
def base(e): return e['category'] in ('strength', 'powerlifting') and (e['equipment'] or '') in EQ_OK and not BLOCK.search(e['name'])
nm = lambda e: e['name'].lower()
pm = lambda e: set(e['primaryMuscles'])
RULES = {
 'squat':          lambda e: 'quadriceps' in pm(e) and re.search(r'squat|leg press|hack', nm(e)) and not re.search(r'split|lunge|jump|one.?leg|single|overhead|front.*kettle|goblet.*kettle|bulgarian|wall|bench squat|plie|box squat|sumo|side|sled|hip.*sled|calf|frog|prisoner|rear.?foot|sissy|romanian|hamstring', nm(e)),
 'hinge':          lambda e: re.search(r'deadlift|pull through|hyperextension|back extension|good morning|stiff', nm(e)) and not re.search(r'snatch|clean|one|single|suitcase|sumo.*hip|rack|trap bar jump|power|straight.?leg.*bar', nm(e)),
 'horizontalPush': lambda e: 'chest' in pm(e) and e['force'] == 'push' and re.search(r'bench press|chest press|push.?up|machine.*press|press.*machine', nm(e)) and not re.search(r'incline|decline|close|triceps|clap|plyo|one.?arm|single|svend|pause|hex|neutral|dip|pike|diamond|knuckle|spider|archer|wide|isometric|kneeling|reverse|bench.*lying.*row|fly|rotating|crossover|resistance|hands.?elevated|feet', nm(e)),
 'inclinePush':    lambda e: 'chest' in pm(e) and re.search(r'incline|fly|flye|crossover|butterfly|pec|decline.*(press)|dip', nm(e)) and not re.search(r'reverse|rear|push.?up|curl|row|pullover|decline.*(dumbbell|barbell)?.*(fly|flye)|one.?arm|single|bent|lying.*fly|chest dip', nm(e)),
 'verticalPush':   lambda e: 'shoulders' in pm(e) and re.search(r'shoulder press|military|overhead press|arnold|standing.*press|seated.*press|push press|machine.*press|press.*machine', nm(e)) and not re.search(r'push press|one.?arm|single|alternat|kettlebell.*(bottom|windmill)|bradford|cuban|lying|bent|clean|front raise|raise|incline|chest|decline|sit.?up|squat|reverse|crunch', nm(e)),
 'lateralDelt':    lambda e: 'shoulders' in pm(e) and re.search(r'lateral raise|side lateral|side raise|lateral.*raise|raise.*lateral', nm(e)) and not re.search(r'rear|bent|lying|reverse|front|incline|one.?arm.*lean|leaning|plate|barbell', nm(e)),
 'triceps':        lambda e: 'triceps' in pm(e) and re.search(r'pushdown|push.?down|extension|skull|kickback|press.?down|dip|close.?grip', nm(e)) and not re.search(r'lying.*cable.*neck|chest dip|close.?grip.*bench|kettlebell|decline|one.?arm.*dumbbell.*floor|machine.*bench|tate|jm|reverse|bench dip', nm(e)),
 'verticalPull':   lambda e: 'lats' in pm(e) and re.search(r'pulldown|pull.?down|pull.?up|chin.?up|pullup', nm(e)) and not re.search(r'one arm.*pull.?up|weighted|wide.*pull.?ups?$|rocky|kneeling|straight.?arm|band|muscle|behind|v.?bar|rope|mixed|towel|gorilla|archer|kipping|commando|isometric|negative|bar hang|leverage|front.*pull|underhand.*kneel', nm(e)),
 'horizontalPull': lambda e: ({'middle back', 'lats'} & pm(e)) and re.search(r'\brow', nm(e)) and not re.search(r'upright|rear|one.?arm.*(cable|kettle)|alternat|renegade|inverted.*(?!row)|pendlay|yates|reverse|landmine|gorilla|kneeling|standing.*cable|single.?arm.*bent|bent.?over.*(?:one|single)|high.*pulley.*kneel|towel|sled|seesaw|leverage.*iso|atlas|wide.?grip.*(rear|upper)', nm(e)),
 'rearDelt':       lambda e: 'shoulders' in pm(e) and re.search(r'rear delt|reverse fl|face pull|rear lateral|bent.?over.*raise|reverse butterfly|rear.*raise|reverse machine', nm(e)) and not re.search(r'lying|one.?arm|single|plate|barbell|row|seated.*bent|decline', nm(e)),
 'biceps':         lambda e: 'biceps' in pm(e) and re.search(r'curl', nm(e)) and not re.search(r'hammer|reverse|cross|zottman|wrist|concentration|drag|overhead|spider|21|lying|cheat|clean|preacher.*(?=hammer)|one.?arm.*(?:cable|high)|high cable|standing.*olympic|machine.*(?=hammer)|forearm|palms|finger|leg|hamstring|nordic|lat|rope.*(?=hammer)|crucifix|alternat.*(?=hammer)|reverse|inner|incline.*hammer|seated.*(?:alternate|alternating)|zottman', nm(e)),
 'bicepsB':        lambda e: ('biceps' in pm(e) or 'forearms' in pm(e)) and re.search(r'hammer|cross body|reverse curl|reverse.*curl|zottman', nm(e)) and not re.search(r'wrist|leg|lat|cable.*kneel|incline.*hammer.*cable', nm(e)),
 'quad':           lambda e: re.search(r'leg extension', nm(e)),
 'lunge':          lambda e: 'quadriceps' in pm(e) | pm(e) or True,
 'legCurl':        lambda e: re.search(r'leg curl|hamstring curl|nordic', nm(e)) and not re.search(r'band|cable|ball|glute', nm(e)),
 'glute':          lambda e: re.search(r'hip thrust|glute bridge|glute kickback|kickback|donkey|bridge|clamshell|abduct', nm(e)) and 'triceps' not in pm(e) and not re.search(r'triceps|bridge.*(?:pull|row)|chest|single leg bridge with.*ball', nm(e)),
 'calves':         lambda e: re.search(r'calf raise|calf press|calve', nm(e)) and not re.search(r'donkey.*(?:bar)?|one.?leg|single|rocking', nm(e)),
 'core':           lambda e: 'abdominals' in pm(e) and not re.search(r'sit.?up|weighted|jack.?knife|v.?up|windmill|ball|twist.*weight|russian|flutter|scissor|bicycle|dragon|wheel|toes|l.?sit|loaded|bottoms|hanging.*weighted|mountain|crab|v-up|seated.*twist|suspended|reverse crunch|decline.*weight|landmine|rollout.*barbell|barbell.*rollout|stir|elbow to knee|rope|cross.?body.*crunch.*weight|side bridge.*row', nm(e)),
}
def lunge_rule(e): return re.search(r'lunge|split squat|step.?up', nm(e)) and not re.search(r'jump|walking.*barbell.*overhead|overhead|curtsy|lateral lunge.*weight|clean|snatch|twist|pass|sled|slide|one.?arm|single.?arm|crossover|suspended|bosu|ball|rear.?foot.*(?:dumbbell|barbell)', nm(e))
RULES['lunge'] = lunge_rule

# ───────────────────────── Curation (reviewed by hand against the library) ─────────────────────────
EXCLUDE = {
 'squat': ['Speed Squats', 'Squat with Plate Movers', 'Front Barbell Squat To A Bench'],
 'hinge': ['Good Morning', 'Good Morning off Pins', 'Seated Good Mornings', 'Stiff Leg Barbell Good Morning', 'Hyperextensions With No Hyperextension Bench'],
 'horizontalPush': ['Clock Push-Up', 'Push Up to Side Plank'],
 'inclinePush': ['Dips - Chest Version', 'Incline Dumbbell Flyes - With A Twist', 'Decline Barbell Bench Press'],
 'verticalPush': ['Two-Arm Kettlebell Military Press', 'Kettlebell Seated Press'],
 'triceps': ['Close-Grip Push-Up off of a Dumbbell', 'Standing Towel Triceps Extension', 'Lying Close-Grip Barbell Triceps Extension Behind The Head', 'Lying Close-Grip Barbell Triceps Press To Chin',
             'Incline Barbell Triceps Extension', 'Dips - Triceps Version', 'One Arm Supinated Dumbbell Triceps Extension', 'One Arm Pronated Dumbbell Triceps Extension', 'Standing Bent-Over One-Arm Dumbbell Triceps Extension',
             'Standing Bent-Over Two-Arm Dumbbell Triceps Extension', 'Seated Bent-Over One-Arm Dumbbell Triceps Extension', 'Seated Bent-Over Two-Arm Dumbbell Triceps Extension', 'Standing One-Arm Dumbbell Triceps Extension',
             'Dumbbell One-Arm Triceps Extension', 'Standing Low-Pulley One-Arm Triceps Extension', 'Kneeling Cable Triceps Extension', 'Cable One Arm Tricep Extension', 'Incline Push-Up Close-Grip'],
 'horizontalPull': ['Bodyweight Mid Row'],
 'biceps': ['Standing One-Arm Dumbbell Curl Over Incline Bench', 'Flexor Incline Dumbbell Curls', 'Dumbbell Prone Incline Curl'],
 'bicepsB': ['Zottman Preacher Curl', 'Preacher Hammer Dumbbell Curl', 'Reverse Barbell Preacher Curls'],
 'lunge': ['Kettlebell Turkish Get-Up (Lunge style)', 'Lunge Sprint', 'Barbell Side Split Squat', 'Step-up with Knee Raise', 'Elevated Back Lunge'],
 'glute': ['Donkey Calf Raises', 'London Bridges', 'Side Bridge'],
 'calves': ['Smith Machine Reverse Calf Raises'],
}
ADD = {
 'horizontalPush': ['Dumbbell Bench Press with Neutral Grip'],
 'verticalPull': ['Close-Grip Front Lat Pulldown', 'Band Assisted Pull-Up'],
 'horizontalPull': ['Inverted Row'],
 'glute': ['Single Leg Glute Bridge'],
}
CORE = ['Ab Crunch Machine', 'Cable Crunch', 'Cable Seated Crunch', 'Crunches', 'Decline Crunch', 'Oblique Crunches', 'Oblique Crunches - On The Floor', 'Cross-Body Crunch', 'Crunch - Hands Overhead', 'Tuck Crunch',
        'Dead Bug', 'Plank', 'Side Bridge', 'Pallof Press', 'Pallof Press With Rotation', 'Standing Cable Wood Chop', 'Standing Cable Lift', 'Bent-Knee Hip Raise', 'Flat Bench Lying Leg Raise', 'Flat Bench Leg Pull-In',
        'Dumbbell Side Bend', 'One-Arm High-Pulley Cable Side Bends', 'Alternate Heel Touchers', 'Air Bike', 'Ab Roller', 'Knee/Hip Raise On Parallel Bars']
POWER = ['Front Box Jump', 'Box Jump (Multiple Response)', 'Lateral Box Jump', 'Standing Long Jump', 'Split Jump', 'Knee Tuck Jump', 'Star Jump', 'Lateral Bound', 'Overhead Slam', 'One-Arm Medicine Ball Slam',
         'Medicine Ball Chest Pass', 'Medicine Ball Scoop Throw', 'Backward Medicine Ball Throw', 'Standing Two-Arm Overhead Throw', 'One-Arm Kettlebell Swings', 'Plyo Push-up']
STRENGTH_LIFTS = {'Barbell Squat', 'Barbell Full Squat', 'Front Barbell Squat', 'Barbell Deadlift', 'Romanian Deadlift', 'Sumo Deadlift', 'Trap Bar Deadlift', 'Stiff-Legged Barbell Deadlift', 'Barbell Bench Press - Medium Grip',
                  'Standing Military Press', 'Seated Barbell Military Press', 'Barbell Shoulder Press', 'Pullups', 'Chin-Up', 'Bent Over Barbell Row', 'T-Bar Row with Handle', 'Barbell Incline Bench Press - Medium Grip', 'Barbell Hip Thrust'}
HIGH_IMPACT = re.compile(r"\b(jump|jumps|hop|hops|bound|swing|swings|slam|throw|plyo|dip|dips|pull.?ups?|pullups|chins?|chin.?ups?|hanging|rollout|roller|walking|step.?ups?|bulgarian|decline|behind)\b|leg raise|knee/hip raise|front barbell|front box|air bike", re.I)
LI_BODYWEIGHT_OK = {'Plank', 'Side Bridge', 'Dead Bug', 'Crunches', 'Cross-Body Crunch', 'Crunch - Hands Overhead', 'Oblique Crunches', 'Oblique Crunches - On The Floor', 'Tuck Crunch', 'Bent-Knee Hip Raise', 'Butt Lift (Bridge)',
                    'Single Leg Glute Bridge', 'Goblet Squat', 'Pushups', 'Bodyweight Squat', 'Chair Squat', 'Inverted Row', 'Hyperextensions (Back Extensions)', 'Trap Bar Deadlift', 'Alternate Heel Touchers', 'Flat Bench Leg Pull-In'}
LI_LUNGE_OK = {'Dumbbell Rear Lunge', 'Split Squat with Dumbbells', 'Smith Single-Leg Split Squat'}
LEVEL = {'beginner': 1, 'intermediate': 2, 'expert': 3}
by_name = {e['name']: e for e in lib}
def need(name):
    if name not in by_name: raise SystemExit(f'NOT IN LIBRARY: {name}')
    return by_name[name]

POOLS = {}
for pool, rule in RULES.items():
    names = [e['name'] for e in lib if base(e) and rule(e)]
    names = [n for n in names if n not in EXCLUDE.get(pool, [])]
    for n in ADD.get(pool, []): need(n); names.append(n)
    if pool == 'core': names = [n for n in CORE if need(n)]
    POOLS[pool] = list(dict.fromkeys(names))
POOLS['power'] = [n for n in POWER if need(n)]

def entry(pool, name):
    e = need(name); eq = e['equipment'] or 'body only'
    lvl = LEVEL.get(e['level'], 2)
    if eq == 'barbell': lvl = max(lvl, 2)                                          # barbells are not for day-one beginners
    if re.search(r'pull.?up|chin.?up|pullups|dip', name, re.I) and eq in ('body only', 'other') and 'Assisted' not in name: lvl = max(lvl, 2)
    if pool == 'power': lvl = max(lvl, 2) if re.search(r'box|depth|bound|plyo|split jump|slam|swing', name, re.I) else lvl
    flags = {}
    if name in STRENGTH_LIFTS: flags['strength'] = 1
    # accessory-only: genuinely isolation pools, flyes, or (in pools that also have accessory slots) the library's own "isolation" label.
    # Compound pools used only as main / secondary lifts must NOT inherit that label, or the exercise could never be chosen.
    COMPOUND_ONLY = ('squat', 'horizontalPush', 'verticalPush', 'verticalPull', 'horizontalPull', 'lunge')
    if pool in ('lateralDelt', 'rearDelt', 'triceps', 'biceps', 'bicepsB', 'quad', 'legCurl', 'calves', 'core') or re.search(r'fly|flye|crossover|butterfly', name, re.I) or (e['mechanic'] == 'isolation' and pool not in COMPOUND_ONLY): flags['noMain'] = 1
    if re.search(r'one.?arm|single|alternat|lunge|step.?up|split squat|kickback|one.?legged|side bend|pallof|wood chop|side bridge|heel touch', name, re.I): flags['perSide'] = 1
    if name in ('Plank', 'Side Bridge'): flags['timed'] = 1
    # low-impact safe? conservative: machines / cables / dumbbells / EZ bar / barbells unless a risky pattern; bodyweight only if reviewed
    if pool == 'power': li = False
    elif pool == 'glute' and 'Kickback' in name: li = False                       # standing single-leg balance work
    elif pool == 'lunge': li = name in LI_LUNGE_OK
    elif eq in ('machine', 'cable', 'dumbbell', 'e-z curl bar', 'barbell') and not HIGH_IMPACT.search(name): li = True
    elif name in LI_BODYWEIGHT_OK or (eq == 'other' and name in LI_BODYWEIGHT_OK): li = True
    else: li = False
    if li: flags['li'] = 1
    return {'id': e['id'], 'name': name, 'lvl': lvl, 'eq': eq, **flags}

out = {p: [entry(p, n) for n in names] for p, names in POOLS.items()}
MIN = {'squat': 8, 'hinge': 6, 'horizontalPush': 6, 'inclinePush': 8, 'verticalPush': 8, 'lateralDelt': 3, 'triceps': 8, 'verticalPull': 6, 'horizontalPull': 8, 'rearDelt': 4, 'biceps': 8, 'bicepsB': 5, 'quad': 2, 'lunge': 5, 'legCurl': 3, 'glute': 5, 'calves': 5, 'core': 12, 'power': 8}
for p, m in MIN.items():
    if len(out[p]) < m: raise SystemExit(f'pool {p} too small: {len(out[p])} < {m}')
    # every pool must be usable by a beginner and (except power) in low-impact mode
    if p != 'power' and not any(x['lvl'] == 1 for x in out[p]) : raise SystemExit(f'pool {p} has no beginner exercise')
    if p != 'power' and not any(x.get('li') for x in out[p] if x['lvl'] <= 2): raise SystemExit(f'pool {p} has no low-impact option')

def js(v): return json.dumps(v, ensure_ascii=False, separators=(', ', ': '))
lines = ['// lib/planner/library.js  - GENERATED by scripts/build-planner-library.py from the Free Exercise DB (public domain).', '// Do not edit by hand; edit the curation lists in the script and re-run it.',
         '// lvl: 1 beginner-friendly, 2 intermediate+, 3 advanced | li: safe for low-impact / gentle plans | eq: equipment', 'export const POOLS = {']
for p, arr in out.items():
    lines.append(f'  {p}: [')
    lines += [f'    {js(x)},' for x in arr]
    lines.append('  ],')
lines.append('};\n')
lines.append('export const LIBRARY_VERSION = ' + json.dumps(len(lib)) + ';')
open(sys.argv[2] if len(sys.argv) > 2 else 'lib/planner/library.js', 'w', encoding='utf-8').write('\n'.join(lines) + '\n')

# Old plans (saved before the library existed) used the previous names: link them to library exercises so they get "How to" too.
LEGACY = {
 'Barbell Back Squat': 'Barbell Squat', 'Front Squat': 'Front Barbell Squat', 'Goblet Squat': 'Goblet Squat', 'Leg Press': 'Leg Press', 'Hack Squat': 'Hack Squat', 'Smith Machine Squat': 'Smith Machine Squat',
 'Trap Bar Deadlift': 'Trap Bar Deadlift', 'Romanian Deadlift': 'Romanian Deadlift', 'Conventional Deadlift': 'Barbell Deadlift', 'Sumo Deadlift': 'Sumo Deadlift', 'Dumbbell Romanian Deadlift': 'Stiff-Legged Dumbbell Deadlift',
 'Cable Pull-Through': 'Pull Through', '45° Back Extension': 'Hyperextensions (Back Extensions)',
 'Barbell Bench Press': 'Barbell Bench Press - Medium Grip', 'Dumbbell Bench Press': 'Dumbbell Bench Press', 'Machine Chest Press': 'Machine Bench Press', 'Smith Machine Bench Press': 'Smith Machine Bench Press', 'Push-Ups': 'Pushups',
 'Close-Grip Bench Press': 'Close-Grip Barbell Bench Press', 'Incline Dumbbell Press': 'Incline Dumbbell Press', 'Incline Barbell Press': 'Barbell Incline Bench Press - Medium Grip', 'Pec Deck Fly': 'Butterfly',
 'Low-to-High Cable Fly': 'Low Cable Crossover', 'Chest Dips': 'Dips - Chest Version', 'Standing Barbell Overhead Press': 'Standing Military Press', 'Seated Dumbbell Shoulder Press': 'Seated Dumbbell Press',
 'Machine Shoulder Press': 'Machine Shoulder (Military) Press', 'Arnold Press': 'Arnold Dumbbell Press', 'Dumbbell Lateral Raise': 'Side Lateral Raise', 'Cable Lateral Raise': 'Cable Seated Lateral Raise',
 'Cable Triceps Pressdown': 'Triceps Pushdown', 'Rope Pushdown': 'Triceps Pushdown - Rope Attachment', 'Overhead Cable Triceps Extension': 'Cable Rope Overhead Triceps Extension', 'Dumbbell Overhead Triceps Extension': 'Standing Dumbbell Triceps Extension',
 'EZ-Bar Skull Crushers': 'EZ-Bar Skullcrusher', 'Parallel Bar Dips': 'Parallel Bar Dip', 'Pull-Ups': 'Pullups', 'Chin-Ups': 'Chin-Up', 'Lat Pulldown': 'Wide-Grip Lat Pulldown', 'Neutral-Grip Pulldown': 'Close-Grip Front Lat Pulldown',
 'Assisted Pull-Ups': 'Band Assisted Pull-Up', 'Single-Arm Lat Pulldown': 'One Arm Lat Pulldown', 'Barbell Row': 'Bent Over Barbell Row', 'T-Bar Row': 'T-Bar Row with Handle', 'Seated Cable Row': 'Seated Cable Rows',
 'Chest-Supported Dumbbell Row': 'Dumbbell Incline Row', 'One-Arm Dumbbell Row': 'One-Arm Dumbbell Row', 'Inverted Row': 'Inverted Row', 'Face Pulls': 'Face Pull', 'Reverse Pec Deck': 'Reverse Machine Flyes',
 'Rear-Delt Dumbbell Fly': 'Reverse Flyes', 'Cable Rear-Delt Fly': 'Cable Rear Delt Fly', 'Dumbbell Curl': 'Dumbbell Bicep Curl', 'EZ-Bar Curl': 'EZ-Bar Curl', 'Cable Curl': 'Standing Biceps Cable Curl', 'Incline Dumbbell Curl': 'Incline Dumbbell Curl',
 'Preacher Curl': 'Preacher Curl', 'Hammer Curl': 'Hammer Curls', 'Rope Hammer Curl': 'Cable Hammer Curls - Rope Attachment', 'Cross-Body Hammer Curl': 'Cross Body Hammer Curl', 'Leg Extension': 'Leg Extensions',
 'Single-Leg Leg Extension': 'Single-Leg Leg Extension', 'Walking Lunges': 'Bodyweight Walking Lunge', 'Reverse Lunge': 'Dumbbell Rear Lunge', 'Dumbbell Split Squat': 'Split Squat with Dumbbells', 'Step-Ups': 'Dumbbell Step Ups',
 'Lying Leg Curl': 'Lying Leg Curls', 'Seated Leg Curl': 'Seated Leg Curl', 'Hip Thrust': 'Barbell Hip Thrust', 'Glute Bridge': 'Butt Lift (Bridge)', 'Cable Glute Kickback': 'One-Legged Cable Kickback',
 'Standing Calf Raise': 'Standing Calf Raises', 'Seated Calf Raise': 'Seated Calf Raise', 'Leg Press Calf Raise': 'Calf Press On The Leg Press Machine', 'Plank': 'Plank', 'Side Plank': 'Side Bridge', 'Cable Crunch': 'Cable Crunch',
 'Dead Bug': 'Dead Bug', 'Pallof Press': 'Pallof Press', 'Hanging Knee Raise': 'Knee/Hip Raise On Parallel Bars', 'Ab Wheel Rollout': 'Ab Roller', 'Box Jump': 'Front Box Jump', 'Kettlebell Swing': 'One-Arm Kettlebell Swings',
 'Medicine Ball Slam': 'One-Arm Medicine Ball Slam', 'Medicine Ball Chest Throw': 'Medicine Ball Chest Pass', 'Jump Squat': 'Freehand Jump Squat', 'Broad Jump': 'Standing Long Jump',
}
links = {old: need(new)['id'] for old, new in LEGACY.items()}
open(sys.argv[3] if len(sys.argv) > 3 else 'js/exercise-links.js', 'w', encoding='utf-8').write(
    '// js/exercise-links.js - GENERATED by scripts/build-planner-library.py\n// Links exercise names from plans saved BEFORE the Training Center to library ids (so old plans get "How to" too).\n'
    'window.HF_LEGACY_EXERCISES = ' + json.dumps(links, ensure_ascii=False, indent=1) + ';\n')
print('pools:', {p: len(a) for p, a in out.items()}); print('total entries:', sum(len(a) for a in out.values()), '| legacy links:', len(links))
