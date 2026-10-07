import { MI, ZONE_INFO, fmtDuration, fmtPace, type Paces, type Zone } from './vdot';

/* ------------------------------------------------------------------ types */

export type Category = 'EASY' | 'LONG' | 'THRESHOLD' | 'VO2' | 'SPEED' | 'HILLS' | 'FARTLEK' | 'RACE' | 'PIZZA';

export const CATEGORY_INFO: Record<Category, { label: string; color: string; ink: string }> = {
  EASY: { label: 'Aerobic', color: '#39ff7a', ink: '#111' },
  LONG: { label: 'Long Run', color: '#3d7bff', ink: '#fff' },
  THRESHOLD: { label: 'Threshold', color: '#ffe62e', ink: '#111' },
  VO2: { label: 'VO₂max', color: '#ff2e4d', ink: '#fff' },
  SPEED: { label: 'Speed', color: '#ff3df5', ink: '#111' },
  HILLS: { label: 'Hills', color: '#ff8c1a', ink: '#111' },
  FARTLEK: { label: 'Fartlek', color: '#2ef5ff', ink: '#111' },
  RACE: { label: 'Race-Specific', color: '#9b4dff', ink: '#fff' },
  PIZZA: { label: 'Nutrition', color: '#ffc94d', ink: '#7a1f00' },
};

export interface Step {
  label: string;
  zone: Zone;
  /** fixed distance (meters). Either meters or seconds. */
  meters?: number;
  /** fixed duration (seconds) — distance is estimated from pace */
  seconds?: number;
  /** pace override, sec/mi */
  pace?: number;
  note?: string;
}
export type Block = { kind: 'step'; step: Step } | { kind: 'repeat'; reps: number; steps: Step[] };
export interface Session { title?: string; blocks: Block[] }
export interface Plan { headline: string; sessions: Session[] }

export interface Ctx {
  /** effective target miles — every plan sums to exactly this */
  miles: number;
  hate: number;
  /** hate normalised 0..1 (capped at 9) */
  h: number;
  p: Paces;
  vdot: number;
}

export interface Workout {
  id: string;
  name: string;
  /** wheel label */
  short: string;
  category: Category;
  /** 0–5 skulls */
  dread: number;
  minMiles: number;
  why: string;
  roast: string;
  cues: string[];
  build: (c: Ctx) => Plan | null;
}

/* ---------------------------------------------------------------- helpers */

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const roundTo = (x: number, q: number) => Math.round(x / q) * q;
const lerpInt = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
const mi = (x: number) => x * MI;

const s = (label: string, zone: Zone, o: Omit<Step, 'label' | 'zone'> = {}): Step => ({ label, zone, ...o });
const one = (step: Step): Block => ({ kind: 'step', step });
const rep = (reps: number, steps: Step[]): Block => ({ kind: 'repeat', reps, steps });

export const stepPace = (st: Step, p: Paces) => st.pace ?? p[st.zone];
export const stepMeters = (st: Step, p: Paces): number =>
  st.zone === 'REST' ? 0 : (st.meters ?? ((st.seconds ?? 0) * MI) / stepPace(st, p));
export const stepSeconds = (st: Step, p: Paces): number =>
  st.seconds ?? ((st.meters ?? 0) / MI) * stepPace(st, p);
export const blockMeters = (b: Block, p: Paces): number =>
  b.kind === 'step' ? stepMeters(b.step, p) : b.reps * b.steps.reduce((a, st) => a + stepMeters(st, p), 0);

export function* flatSteps(plan: Plan): Generator<{ step: Step; count: number }> {
  for (const sess of plan.sessions)
    for (const b of sess.blocks) {
      if (b.kind === 'step') yield { step: b.step, count: 1 };
      else for (const st of b.steps) yield { step: st, count: b.reps };
    }
}

export function planStats(plan: Plan, p: Paces) {
  let m = 0, sec = 0, q = 0;
  for (const { step, count } of flatSteps(plan)) {
    const sm = stepMeters(step, p) * count;
    m += sm;
    sec += stepSeconds(step, p) * count;
    if (ZONE_INFO[step.zone].quality) q += sm;
  }
  return { miles: m / MI, seconds: sec, qualityMiles: q / MI };
}

export function distLabel(m: number): string {
  return Math.abs(m - Math.round(m)) < 1e-6 && m < 10000 ? `${Math.round(m)}m` : `${(m / MI).toFixed(2)} mi`;
}

interface WrapOpts { wuMin?: number; cdMin?: number; wuMax?: number; title?: string; wuNote?: string }

/**
 * Wraps a core set with a warm-up + cool-down that absorb whatever distance is left,
 * so the session sums to exactly `total` miles. Returns null if the core doesn't fit.
 */
function wrap(total: number, core: Block[], p: Paces, o: WrapOpts = {}): Session | null {
  const coreMi = core.reduce((a, b) => a + blockMeters(b, p), 0) / MI;
  const rest = total - coreMi;
  const wuMin = o.wuMin ?? 1, cdMin = o.cdMin ?? 0.75, wuMax = o.wuMax ?? 3;
  if (rest < wuMin + cdMin - 1e-9) return null;
  let wu = clamp(roundTo(rest * 0.5, 0.25), wuMin, wuMax);
  if (rest - wu < cdMin) wu = rest - cdMin;
  const cd = rest - wu;
  return {
    title: o.title,
    blocks: [
      one(s('Warm up', 'E', { meters: mi(wu), note: o.wuNote })),
      ...core,
      one(s(cd > 3.01 ? 'Cool down + easy miles' : 'Cool down', 'E', { meters: mi(cd) })),
    ],
  };
}

/** largest n in [lo, hi] for which make(n) fits */
function fit<T>(lo: number, hi: number, make: (n: number) => T | null): [number, T] | null {
  for (let n = Math.max(lo, hi); n >= lo; n--) {
    const r = make(n);
    if (r) return [n, r];
  }
  return null;
}

const solo = (headline: string, session: Session | null): Plan | null =>
  session ? { headline, sessions: [session] } : null;

/* ---------------------------------------------------------------- catalog */
// Order matters: it's the order around the wheel (interleaved so colors alternate).

const PYRAMIDS = [
  [200, 400, 600, 400, 200],
  [400, 800, 1200, 800, 400],
  [400, 800, 1200, 1600, 1200, 800, 400],
  [400, 800, 1200, 1600, 2000, 1600, 1200, 800, 400],
];
const pyramidZone = (m: number): Zone => (m <= 400 ? '3K' : m <= 1200 ? '5K' : '10K');

const HANSONS: [number, number, number][] = [
  [3, 1, 400], [4, 1, 400], [6, 1, 400], [4, 1.5, 800], [3, 2, 800], [2, 3, 800],
];

const monaSet = (): Block[] => [
  rep(2, [s('On 90s', '5K', { seconds: 90 }), s('Float 90s', 'FLOAT', { seconds: 90 })]),
  rep(4, [s('On 60s', '5K', { seconds: 60 }), s('Float 60s', 'FLOAT', { seconds: 60 })]),
  rep(4, [s('On 30s', '3K', { seconds: 30 }), s('Float 30s', 'FLOAT', { seconds: 30 })]),
  rep(4, [s('On 15s', 'MILE', { seconds: 15 }), s('Float 15s', 'FLOAT', { seconds: 15 })]),
];

export const WORKOUTS: Workout[] = [
  {
    id: 'recovery', name: 'Recovery Run', short: 'RECOVERY', category: 'EASY', dread: 1, minMiles: 1,
    why: 'Blood flow, capillary upkeep, and proving you can run slow in public.',
    roast: "If anyone passes you, that's the workout working.",
    cues: ['Actually conversational. Full sentences, not grunts.', 'HR under ~70% max. Pace is irrelevant today.', 'No Strava segments. They can smell desperation.'],
    build: ({ miles, p }) => ({
      headline: `${miles.toFixed(2)} mi @ ${fmtPace(p.REC)}/mi or slower`,
      sessions: [{ blocks: [one(s('Recovery jog', 'REC', { meters: mi(miles), note: 'HR cap ~70% max' }))] }],
    }),
  },
  {
    id: 'yasso', name: 'Yasso 800s', short: 'YASSO 800s', category: 'VO2', dread: 4, minMiles: 5,
    why: "Bart Yasso's folk law: your 800 split in m:ss = your marathon in h:mm. Scientifically dubious. Spiritually mandatory.",
    roast: 'Rep 10 is where the marathon prediction stops being cute.',
    cues: ['Recovery jog takes about as long as the rep. Do not stand.', 'Even splits. The first one should feel insultingly easy.', 'If you miss two in a row by 3+ seconds, the prediction is lying to you. Finish anyway.'],
    build: ({ miles, h, p }) => {
      const marathon = (p.M * 42195) / MI;
      const split = marathon / 60;
      const pace = (split * MI) / 800;
      const r = fit(4, lerpInt(6, 10, h), (n) =>
        wrap(miles, [rep(n, [s('800m', 'I', { meters: 800, pace, note: `hit ${fmtDuration(split)}` }), s('Jog 400m', 'JOG', { meters: 400 })])], p));
      return r ? solo(`${r[0]} × 800m in ${fmtDuration(split)} (≈ ${fmtDuration(marathon)} marathon, allegedly)`, r[1]) : null;
    },
  },
  {
    id: 'tempo', name: 'Tempo Run', short: 'TEMPO', category: 'THRESHOLD', dread: 3, minMiles: 4,
    why: 'Raises lactate threshold — the pace you could race for ~60 minutes. The bread and butter.',
    roast: '"Comfortably hard." Comfort sold separately.',
    cues: ['Settle in by the first half mile. No hero first mile.', 'Breathing: rhythmic, 2-in-2-out. Talking: 3–4 words, max.', 'If it turns into a race, you ran a 10K, not a tempo.'],
    build: ({ miles, h, p }) => {
      const r = fit(4, Math.round((2 + h * 4) * 2), (k) => wrap(miles, [one(s('Tempo', 'T', { meters: mi(k / 2) }))], p));
      return r ? solo(`${r[0] / 2} mi continuous @ T (${fmtPace(p.T)}/mi)`, r[1]) : null;
    },
  },
  {
    id: 'kenyan-hills', name: 'Kenyan Hills', short: 'KENYAN HILLS', category: 'HILLS', dread: 4, minMiles: 5,
    why: 'Strength endurance and economy. Hills are speedwork in disguise — Lydiard figured this out in the 60s.',
    roast: "The jog down is the only good part and it's over in two minutes.",
    cues: ['Find a 4–6% grade that takes ~90s to climb hard.', 'Drive the knees, punch the arms, stay tall. Do not hunch.', 'Effort is ~5K. Ignore your watch pace entirely; gravity is cheating.'],
    build: ({ miles, h, p }) => {
      const r = fit(6, lerpInt(8, 14, h), (n) =>
        wrap(miles, [rep(n, [s('Uphill 90s', 'HILL', { seconds: 90, note: '5K effort, not pace' }), s('Jog down', 'JOG', { seconds: 120 })])], p));
      return r ? solo(`${r[0]} × 90s uphill @ 5K effort, jog down`, r[1]) : null;
    },
  },
  {
    id: 'long', name: 'Long Run', short: 'LONG RUN', category: 'LONG', dread: 2, minMiles: 8,
    why: 'Mitochondrial density, capillarization, glycogen storage, fat oxidation, and podcast completion.',
    roast: 'Long and slow. Like your Boston qualifier timeline.',
    cues: ['Fuel every 30–45 min like you would on race day.', 'First third should feel embarrassingly slow.', 'Easy means easy. Your long run is not a race-pace audition.'],
    build: ({ miles, hate }) => {
      const fin = hate >= 6 ? Math.min(3, roundTo(miles * 0.15, 0.5)) : 0;
      const blocks: Block[] = [one(s('Long run', 'E', { meters: mi(miles - fin), note: 'fuel every 30–45 min' }))];
      if (fin > 0) blocks.push(one(s('Steady finish', 'ST', { meters: mi(fin) })));
      return { headline: fin ? `${(miles - fin).toFixed(2)} mi easy + ${fin} mi steady` : `${miles.toFixed(2)} mi @ E`, sessions: [{ blocks }] };
    },
  },
  {
    id: 'deeks', name: "Deek's Quarters", short: "DEEK'S 400s", category: 'SPEED', dread: 4, minMiles: 6,
    why: "Rob de Castella's continuous 400 on / 200 float. Speed endurance with nowhere to hide.",
    roast: 'The float is not a jog. The float is a lie you tell the 400.',
    cues: ['Continuous. No stopping. The float is barely slower than marathon pace.', 'Keep the 400s at 10K pace — not 5K, not faster. Discipline.', 'If the floats are dying, the session is working.'],
    build: ({ miles, h, p }) => {
      const float = p.M * 1.04;
      const r = fit(8, lerpInt(12, 24, h), (n) =>
        wrap(miles, [rep(n, [s('400m', '10K', { meters: 400 }), s('Float 200m', 'FLOAT', { meters: 200, pace: float, note: 'faster than you want' })])], p));
      return r ? solo(`${r[0]} × (400m @ 10K / 200m float @ ${fmtPace(float)}) — continuous`, r[1]) : null;
    },
  },
  {
    id: 'mona', name: 'Mona Fartlek', short: 'MONA FARTLEK', category: 'FARTLEK', dread: 3, minMiles: 5,
    why: "Steve Moneghetti's 20-minute fartlek: surges at 5K-ish effort with floats at steady. Race simulation, compressed.",
    roast: "20 minutes. That's it. That's what they all say.",
    cues: ['Float recoveries are steady running, not jogging.', 'The 15s reps are fast and loose — think "turnover," not "sprint."', 'Run it on a loop or a road. Track is optional, suffering is not.'],
    build: ({ miles, hate, p }) => {
      if (hate >= 7) {
        const dbl = wrap(miles, [...monaSet(), one(s('Jog between sets', 'JOG', { seconds: 300 })), ...monaSet()], p, { wuMin: 1.25 });
        if (dbl) return solo('DOUBLE Mona: 2 × 20 min (90/60/30/15s on, equal float)', dbl);
      }
      return solo('20 min: 2×90s, 4×60s, 4×30s, 4×15s on — equal float', wrap(miles, monaSet(), p, { wuMin: 1.25 }));
    },
  },
  {
    id: 'michigan', name: 'The Michigan', short: 'THE MICHIGAN', category: 'RACE', dread: 5, minMiles: 8.5,
    why: "Ron Warhurst's Michigan: descending track reps interleaved with tempo miles. Teaches you to run fast when you're already wrecked.",
    roast: 'Named after a university. Conceived in a torture chamber.',
    cues: ['Go straight from each rep into the tempo mile. No pause.', 'The tempo miles stay at T no matter how bad the rep felt.', 'The final 400 is everything left. Lie down after. You have earned the infield.'],
    build: ({ miles, p }) =>
      solo('1600 · tempo mile · 1200 · tempo mile · 800 · tempo mile · 400', wrap(miles, [
        one(s('1600m', '10K', { meters: 1600 })), one(s('Tempo mile', 'T', { meters: MI, note: 'straight into it' })), one(s('Jog', 'JOG', { meters: 400 })),
        one(s('1200m', '5K', { meters: 1200 })), one(s('Tempo mile', 'T', { meters: MI })), one(s('Jog', 'JOG', { meters: 400 })),
        one(s('800m', '3K', { meters: 800 })), one(s('Tempo mile', 'T', { meters: MI })), one(s('Jog', 'JOG', { meters: 400 })),
        one(s('400m', 'MILE', { meters: 400, note: 'everything left. all of it.' })),
      ], p, { wuMin: 1.5, cdMin: 1 })),
  },
  {
    id: 'strides', name: 'Easy + Strides', short: 'STRIDES', category: 'EASY', dread: 1, minMiles: 2,
    why: 'Neuromuscular recruitment with zero metabolic cost. Reminds your legs that fast is a thing.',
    roast: "The workout you tell people about when you didn't do a workout.",
    cues: ['Strides are fast, not hard: ~mile pace, relaxed face, quick feet.', 'Full walk-back recovery. These are about form, not fitness.', 'Flat, smooth surface. Grass is perfect.'],
    build: ({ miles, h }) => {
      const r = fit(4, lerpInt(4, 8, h), (n) => {
        const e = miles - (n * 200) / MI;
        return e >= 1.5
          ? { blocks: [one(s('Easy run', 'E', { meters: mi(e) })), rep(n, [s('Stride', 'SPRINT', { meters: 100, note: 'fast, relaxed, tall' }), s('Walk back', 'JOG', { meters: 100 })])] }
          : null;
      });
      return r ? { headline: `Easy run + ${r[0]} × 100m strides`, sessions: [r[1]] } : null;
    },
  },
  {
    id: 'k-repeats', name: '1K Repeats', short: '1K REPEATS', category: 'VO2', dread: 4, minMiles: 6,
    why: 'Classic Daniels I-pace: 3–4 minute reps at ~vVO₂max. Maximal stroke volume, maximal suffering.',
    roast: 'Each rep is about 3–4 minutes. Each recovery is about 4 seconds, emotionally.',
    cues: ['Hit I-pace from the gun — no slow first 200.', 'Jog the recoveries. Hands-on-knees costs you the adaptation.', 'Last rep ≈ first rep. If you can negative-split it, you went too easy early.'],
    build: ({ miles, h, p }) => {
      const recov = Math.round(150 - h * 60);
      const r = fit(4, lerpInt(5, 8, h), (n) =>
        wrap(miles, [rep(n, [s('1000m', 'I', { meters: 1000 }), s(`Jog ${fmtDuration(recov)}`, 'JOG', { seconds: recov })])], p));
      return r ? solo(`${r[0]} × 1000m @ I (${fmtDuration((p.I * 1000) / MI)}) w/ ${fmtDuration(recov)} jog`, r[1]) : null;
    },
  },
  {
    id: 'cruise', name: 'Cruise Intervals', short: 'CRUISE', category: 'THRESHOLD', dread: 3, minMiles: 4,
    why: "Daniels' cruise intervals: more total time at threshold than a tempo, thanks to tiny rests.",
    roast: 'The 60 seconds of rest will feel like 6. Then like 0.',
    cues: ['Every mile at T. Not faster. Faster is a different workout.', 'Keep jogging during the 60s. Standing is for track workouts.', 'Last rep should feel like rep 2, plus character.'],
    build: ({ miles, h, p }) => {
      const r = fit(2, lerpInt(3, 6, h), (n) =>
        wrap(miles, [rep(n, [s('Cruise mile', 'T', { meters: MI }), s('Jog 60s', 'JOG', { seconds: 60 })])], p));
      return r ? solo(`${r[0]} × 1 mi @ T (${fmtPace(p.T)}) w/ 60s jog`, r[1]) : null;
    },
  },
  {
    id: 'alternations', name: 'Canova Alternations', short: 'ALTERNATIONS', category: 'RACE', dread: 5, minMiles: 7,
    why: 'Canova-style lactate shuttling: clear lactate while still moving fast. The float is the workout.',
    roast: 'There is no recovery. There is only slightly-less-fast.',
    cues: ['"On" is ~103–104% of marathon pace. "Float" is ~90%. Never jog.', 'Continuous. The watch should never read slower than float pace.', 'Practice fuel on the floats. This is a dress rehearsal.'],
    build: ({ miles, h, p }) => {
      const r = fit(3, lerpInt(5, 12, h), (n) =>
        wrap(miles, [rep(n, [s('On 1K', 'HM', { meters: 1000, note: '~103–104% MP' }), s('Float 1K', 'FLOAT', { meters: 1000, note: '~90% MP — NOT a jog' })])], p, { wuMin: 1.5, cdMin: 1 }));
      return r ? solo(`${r[0]} × (1K @ ${fmtPace(p.HM)} / 1K float @ ${fmtPace(p.FLOAT)}) — continuous`, r[1]) : null;
    },
  },
  {
    id: 'pizza', name: 'Order a Large Pizza', short: '🍕 PIZZA', category: 'PIZZA', dread: 0, minMiles: 0,
    why: 'Glycogen supercompensation via aggressive carbohydrate intake.',
    roast: 'The wheel has decided you will run zero miles.',
    cues: [],
    build: () => ({ headline: '1 × LARGE (16")', sessions: [] }),
  },
  {
    id: 'mp-long', name: 'Marathon-Pace Long Run', short: 'MP LONG RUN', category: 'LONG', dread: 5, minMiles: 10,
    why: 'Specific endurance. Probably the single most marathon-predictive session there is.',
    roast: 'Goal pace feels easy at mile 3. Write that down so you can laugh at it later.',
    cues: ['Race-day shoes, race-day fuel, race-day breakfast. Rehearse everything.', 'Lock MP on feel by mile 1 of the block, then confirm on the watch.', 'If MP falls apart, that is data. Not failure. (It is a little bit failure.)'],
    build: ({ miles, h, hate, p }) => {
      const broken = (x: number) => hate >= 6 && x >= 8;
      const r = fit(4, clamp(Math.round(miles * (0.45 + 0.2 * h)), 4, 16), (x) =>
        wrap(miles, broken(x)
          ? [one(s('MP block 1', 'M', { meters: mi(x / 2) })), one(s('Float', 'FLOAT', { meters: MI })), one(s('MP block 2', 'M', { meters: mi(x / 2) }))]
          : [one(s('Marathon pace', 'M', { meters: mi(x) }))], p, { wuMin: 2, cdMin: 1 }));
      return r ? solo(`${r[0]} mi @ MP (${fmtPace(p.M)}/mi)${broken(r[0]) ? ' — split by a 1 mi float' : ''}`, r[1]) : null;
    },
  },
  {
    id: '200s', name: '200s @ Rep Pace', short: '200s', category: 'SPEED', dread: 3, minMiles: 4,
    why: 'R-pace economy work: fast, relaxed, perfect form. Turnover for people whose turnover is "marathon shuffle."',
    roast: 'Short enough to feel fun. Long enough to remember why you quit the 400.',
    cues: ['Mile race pace, not a sprint. Relaxed shoulders, loose hands.', 'Full 200 jog recovery — R-pace is about quality.', 'If form breaks, stop. Bad reps teach bad habits.'],
    build: ({ miles, h, p }) => {
      const r = fit(8, lerpInt(10, 16, h), (n) =>
        wrap(miles, [rep(n, [s('200m', 'MILE', { meters: 200 }), s('Jog 200m', 'JOG', { meters: 200 })])], p));
      return r ? solo(`${r[0]} × 200m in ${fmtDuration((p.MILE * 200) / MI)} w/ 200m jog`, r[1]) : null;
    },
  },
  {
    id: 'over-under', name: 'Over/Unders', short: 'OVER/UNDERS', category: 'THRESHOLD', dread: 4, minMiles: 5,
    why: 'Alternating just above and just below threshold teaches your body to clear lactate while still producing it. Race surges, simulated.',
    roast: 'The "under" is a marathon-pace recovery. Read that sentence again.',
    cues: ['Continuous — no jog between the over and the under.', 'The over is 10K pace, not 5K. The under is MP, not easy.', 'When it gets ugly, shorten your stride, not your effort.'],
    build: ({ miles, h, p }) => {
      const r = fit(2, lerpInt(3, 6, h), (n) =>
        wrap(miles, [rep(n, [s('Over 800m', '10K', { meters: 800 }), s('Under 800m', 'M', { meters: 800 })])], p));
      return r ? solo(`${r[0]} × (800m @ 10K → 800m @ MP) — continuous`, r[1]) : null;
    },
  },
  {
    id: 'billat', name: 'Billat 30-30s', short: '30-30s', category: 'VO2', dread: 3, minMiles: 4,
    why: "Véronique Billat's 30-30s: accumulate more time at VO₂max than continuous reps. Sneaky volume.",
    roast: 'Starts trivial. By rep 20 the 30s float feels like a magic trick that stopped working.',
    cues: ['Fast reps at ~3K pace. Float at a slow jog — keep moving.', 'Feels too easy for the first 8. That is the trap.', 'Stop if you can no longer hit pace. That is your VO₂ ceiling today.'],
    build: ({ miles, h, p }) => {
      const r = fit(12, lerpInt(16, 32, h), (n) =>
        wrap(miles, [rep(n, [s('30s fast', '3K', { seconds: 30 }), s('30s float', 'JOG', { seconds: 30 })])], p));
      return r ? solo(`${r[0]} × (30s @ 3K pace / 30s jog)`, r[1]) : null;
    },
  },
  {
    id: 'hill-sprints', name: 'Hill Sprints', short: 'HILL SPRINTS', category: 'HILLS', dread: 2, minMiles: 3,
    why: 'Alactic power and tendon stiffness with near-zero injury risk. The cheapest speed you will ever buy.',
    roast: '10 seconds of pain, 2 minutes of staring at the sky. Peak runner lifestyle.',
    cues: ['Steep hill (6–10%). MAX effort for 8–10 seconds.', 'Walk down and rest fully. Fresh legs or it becomes conditioning.', 'Tall posture, violent arms, no leaning from the waist.'],
    build: ({ miles, h, p }) => {
      const r = fit(6, lerpInt(6, 10, h), (n) =>
        wrap(miles, [rep(n, [s('Hill sprint', 'SPRINT', { seconds: 10, note: 'MAX effort, steep grade' }), s('Walk down + rest', 'REST', { seconds: 110 })])], p, { wuMin: 1.5, cdMin: 0.5 }));
      return r ? solo(`${r[0]} × 10s max hill sprints (full recovery)`, r[1]) : null;
    },
  },
  {
    id: 'time-trial', name: '5K Time Trial', short: '5K TIME TRIAL', category: 'RACE', dread: 5, minMiles: 5.5,
    why: 'A solo all-out 5K. Recalibrates your VDOT and your self-image.',
    roast: 'No bib. No crowd. No excuses. Just you and the ghost of your PR.',
    cues: ['Even pace for 2 miles, then race the last 1.1.', 'Track, bike path, measured loop — no GPS-drift excuses.', 'Beat the target? Update your race time above and enjoy the faster paces you just signed up for.'],
    build: ({ miles, p }) => {
      const t = (p['5K'] * 5000) / MI;
      return solo(`5000m solo, all out — VDOT says ${fmtDuration(t)}`, wrap(miles, [one(s('TIME TRIAL', '5K', { meters: 5000, note: `target ${fmtDuration(t)}` }))], p, { wuMin: 1.5, wuNote: 'include 4 × 20s strides' }));
    },
  },
  {
    id: 'steady', name: 'Steady State', short: 'STEADY STATE', category: 'THRESHOLD', dread: 2, minMiles: 5,
    why: 'Aerobic power just slower than marathon pace. Big aerobic stimulus, low recovery cost.',
    roast: 'Too fast to be easy, too slow to brag about. The middle child of workouts.',
    cues: ['Should feel "pleasantly purposeful." Not hard.', 'Breathing controlled; you could say a sentence if you had to.', 'Great day to practice fueling at speed.'],
    build: ({ miles, h, p }) => {
      const r = fit(6, Math.round((4 + h * 6) * 2), (k) => wrap(miles, [one(s('Steady', 'ST', { meters: mi(k / 2) }))], p));
      return r ? solo(`${r[0] / 2} mi @ steady (${fmtPace(p.ST)}/mi)`, r[1]) : null;
    },
  },
  {
    id: 'pyramid', name: 'Pyramid of Doom', short: 'PYRAMID', category: 'FARTLEK', dread: 4, minMiles: 6,
    why: 'Every system in one session: VO₂ on the way up, speed on the way down, regret throughout.',
    roast: "Going up is hard. Coming down is harder, because now you're tired AND it's faster.",
    cues: ['Short reps at 3K pace, middle at 5K, long at 10K.', 'Jog recovery = half the rep distance.', 'The back half of the pyramid is where the workout actually happens.'],
    build: ({ miles, h, p }) => {
      const r = fit(0, lerpInt(1, 3, h), (i) =>
        wrap(miles, PYRAMIDS[i].flatMap((m) => [one(s(`${m}m`, pyramidZone(m), { meters: m })), one(s(`Jog ${m / 2}m`, 'JOG', { meters: m / 2 }))]), p));
      return r ? solo(`${PYRAMIDS[r[0]].join('-')}m w/ half-distance jogs`, r[1]) : null;
    },
  },
  {
    id: 'fast-finish', name: 'Fast-Finish Long Run', short: 'FAST FINISH', category: 'LONG', dread: 4, minMiles: 8,
    why: 'Goal pace on pre-fatigued, glycogen-depleted legs. A mile-20 rehearsal.',
    roast: 'The first 80% is a lie to lull you into a false sense of security.',
    cues: ['Truly easy until the switch. Banking time is cheating yourself.', 'Shift gears smoothly into MP — no surge.', 'The last mile at half-marathon pace is a test of will, not fitness.'],
    build: ({ miles, h }) => {
      const x = clamp(roundTo(miles * 0.2 + h * 2, 0.5), 2, 6);
      const e = miles - x - 1;
      if (e < 4) return null;
      return {
        headline: `${e.toFixed(2)} mi easy → ${x} mi @ MP → 1 mi @ HMP`,
        sessions: [{ blocks: [one(s('Easy', 'E', { meters: mi(e) })), one(s('Marathon pace', 'M', { meters: mi(x) })), one(s('Finish @ half pace', 'HM', { meters: MI, note: 'empty the tank (politely)' }))] }],
      };
    },
  },
  {
    id: 'mile-repeats', name: 'Mile Repeats', short: 'MILE REPEATS', category: 'VO2', dread: 4, minMiles: 6,
    why: 'Long reps near critical velocity. Builds the ability to hurt for a long time, on purpose.',
    roast: 'Mile 1 is fine. Mile 4 is a character study.',
    cues: ['10K pace. Even splits per lap — check every 400.', 'Recovery is short on purpose. Jog it.', 'Rep 3 decides who you are.'],
    build: ({ miles, h, hate, p }) => {
      const recov = hate >= 7 ? s('Jog 90s', 'JOG', { seconds: 90 }) : s('Jog 400m', 'JOG', { meters: 400 });
      const r = fit(3, lerpInt(3, 6, h), (n) => wrap(miles, [rep(n, [s('Mile', '10K', { meters: MI }), recov])], p));
      return r ? solo(`${r[0]} × 1 mi @ 10K (${fmtPace(p['10K'])}) w/ ${recov.label.replace('Jog ', '')} jog`, r[1]) : null;
    },
  },
  {
    id: 'double-t', name: 'Norwegian Double Threshold', short: 'DOUBLE T', category: 'THRESHOLD', dread: 4, minMiles: 9,
    why: 'Two controlled threshold sessions in one day = huge volume at the sweet spot with low muscle damage. The Ingebrigtsen family business.',
    roast: "You don't own a lactate meter. You're going to pretend you do.",
    cues: ['Controlled. Both sessions should feel like you could do one more rep.', 'AM is slightly slower than T; PM is right at T.', 'Eat between. 6+ hours apart is ideal.'],
    build: ({ miles, h, p }) => {
      const am = roundTo(miles * 0.55, 0.25);
      const pm = miles - am;
      const A = fit(4, lerpInt(5, 10, h), (n) =>
        wrap(am, [rep(n, [s('1000m', 'HM', { meters: 1000, note: 'controlled, just under T' }), s('Jog 60s', 'JOG', { seconds: 60 })])], p, { wuMin: 1, cdMin: 0.5, wuMax: 2, title: 'AM' }));
      const B = fit(8, lerpInt(10, 25, h), (n) =>
        wrap(pm, [rep(n, [s('400m', 'T', { meters: 400, note: 'smooth, NOT a race' }), s('Jog 30s', 'JOG', { seconds: 30 })])], p, { wuMin: 1, cdMin: 0.5, wuMax: 2, title: 'PM' }));
      if (!A || !B) return null;
      return { headline: `AM ${A[0]} × 1K · PM ${B[0]} × 400m — both at threshold`, sessions: [A[1], B[1]] };
    },
  },
  {
    id: 'hansons', name: 'Hansons Strength', short: 'STRENGTH', category: 'RACE', dread: 4, minMiles: 6,
    why: "Hansons 'strength' session: long reps at MP − 10s/mi. Not glamorous. Brutally effective.",
    roast: "10 seconds faster than marathon pace doesn't sound like much. It is.",
    cues: ['Exactly MP − 10s. Faster is not better.', 'Jog the recoveries; they are short on purpose.', 'This is a marathon workout. Act accordingly: fuel, shoes, patience.'],
    build: ({ miles, h, p }) => {
      const pace = p.M - 10;
      const r = fit(0, lerpInt(1, 5, h), (i) => {
        const [n, d, j] = HANSONS[i];
        return wrap(miles, [rep(n, [s(`${d} mi`, 'M', { meters: mi(d), pace, note: 'MP − 10s' }), s(`Jog ${j}m`, 'JOG', { meters: j })])], p);
      });
      if (!r) return null;
      const [n, d] = HANSONS[r[0]];
      return solo(`${n} × ${d} mi @ ${fmtPace(pace)} (MP − 10s)`, r[1]);
    },
  },
  {
    id: 'cutdown', name: '3-2-1 Cutdown', short: '3-2-1', category: 'RACE', dread: 4, minMiles: 8.5,
    why: 'Each segment shorter and faster. Practices shifting gears when you have nothing left.',
    roast: "The 1 is the shortest piece. It won't feel like it.",
    cues: ['3 mi @ MP, 2 mi @ T, 1 mi @ 5K pace.', 'Recoveries shrink as your self-hate grows.', 'The final mile is a race. Treat it like one.'],
    build: ({ miles, h, p }) => {
      const recov = Math.round(180 - h * 120);
      const jog = s(`Jog ${fmtDuration(recov)}`, 'JOG', { seconds: recov });
      return solo(`3 mi @ MP → 2 mi @ T → 1 mi @ 5K, ${fmtDuration(recov)} jogs`, wrap(miles, [
        one(s('3 mi', 'M', { meters: mi(3) })), one(jog), one(s('2 mi', 'T', { meters: mi(2) })), one(jog), one(s('1 mi', '5K', { meters: MI, note: 'race it' })),
      ], p));
    },
  },
  {
    id: 'progression', name: 'Progression Run', short: 'PROGRESSION', category: 'THRESHOLD', dread: 3, minMiles: 4,
    why: 'Pacing discipline and finishing fast on tired legs. Negative-split muscle memory.',
    roast: 'Starts as a jog. Ends as a cry for help.',
    cues: ['Each chunk faster than the last. No going back.', 'The first chunk should feel almost too slow.', 'Shift gears; do not lurch.'],
    build: ({ miles, h }) => {
      const parts: [string, Zone][] = h < 0.34
        ? [['Easy', 'E'], ['Steady', 'ST'], ['Marathon pace', 'M']]
        : [['Easy', 'E'], ['Steady', 'ST'], ['Marathon pace', 'M'], ['Threshold', 'T']];
      const q = roundTo(miles / parts.length, 0.25);
      const blocks = parts.map(([l, z], i) => one(s(l, z, { meters: mi(i === parts.length - 1 ? miles - q * (parts.length - 1) : q) })));
      return { headline: `${parts.map((x) => x[1]).join(' → ')} in ${parts.length} chunks`, sessions: [{ blocks }] };
    },
  },
];

/** relative odds — dread-weighted by self-hate */
export function weightFor(w: Workout, hate: number): number {
  if (w.category === 'PIZZA') return 0.45;
  const alpha = ((Math.min(hate, 9) - 4.5) / 4.5) * 0.8;
  return Math.exp(alpha * (w.dread - 3));
}

/* ----------------------------------------------------------- text export */

function stepText(st: Step, p: Paces): string {
  if (st.zone === 'REST') return `${st.label}: ${fmtDuration(st.seconds ?? 0)} standing`;
  const dist = st.seconds !== undefined ? fmtDuration(st.seconds) : distLabel(st.meters ?? 0);
  return `${st.label}: ${dist} @ ${fmtPace(stepPace(st, p))}/mi${st.note ? ` (${st.note})` : ''}`;
}

export function planToText(w: Workout, plan: Plan, p: Paces): string {
  const lines = [`BODY BY GEORGE — ${w.name}`, plan.headline, ''];
  for (const sess of plan.sessions) {
    if (sess.title) lines.push(`[${sess.title}]`);
    for (const b of sess.blocks) {
      if (b.kind === 'step') lines.push(`• ${stepText(b.step, p)}`);
      else {
        lines.push(`• ${b.reps} ×`);
        for (const st of b.steps) lines.push(`    – ${stepText(st, p)}`);
      }
    }
  }
  const st = planStats(plan, p);
  lines.push('', `Total: ${st.miles.toFixed(2)} mi · ~${fmtDuration(st.seconds)} · ${st.qualityMiles.toFixed(2)} mi of quality`, 'bodyby.georgedemian.com');
  return lines.join('\n');
}
