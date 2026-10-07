// Daniels/Gilbert oxygen-cost + drop-dead equations. Everything pace-related flows from here.

export const MI = 1609.344;

export type Zone =
  | 'REC' | 'E' | 'ST' | 'M' | 'HM' | 'T' | '10K' | '5K' | 'I' | '3K' | 'MILE'
  | 'SPRINT' | 'HILL' | 'JOG' | 'FLOAT' | 'REST';

/** seconds per mile for each zone */
export type Paces = Record<Zone, number>;

export const ZONE_INFO: Record<Zone, { name: string; color: string; quality: boolean }> = {
  REC: { name: 'Recovery', color: '#c9f7d4', quality: false },
  E: { name: 'Easy', color: '#7dff9b', quality: false },
  ST: { name: 'Steady', color: '#c6ff4d', quality: false },
  M: { name: 'Marathon', color: '#4dd2ff', quality: true },
  HM: { name: 'Half Marathon', color: '#7aa8ff', quality: true },
  T: { name: 'Threshold', color: '#ffe14d', quality: true },
  '10K': { name: '10K', color: '#ffb84d', quality: true },
  '5K': { name: '5K', color: '#ff8a3d', quality: true },
  I: { name: 'Interval (vVO₂)', color: '#ff5c5c', quality: true },
  '3K': { name: '3K', color: '#ff3d77', quality: true },
  MILE: { name: 'Mile / Rep', color: '#ff3dd8', quality: true },
  SPRINT: { name: 'Sprint', color: '#c43dff', quality: true },
  HILL: { name: 'Hill', color: '#e0904a', quality: true },
  JOG: { name: 'Jog', color: '#e4e4e4', quality: false },
  FLOAT: { name: 'Float', color: '#a8e6ff', quality: false },
  REST: { name: 'Rest', color: '#ffffff', quality: false },
};

export type RaceKey = 'mile' | '5k' | '10k' | 'half' | 'marathon';
export const RACES: Record<RaceKey, { label: string; meters: number }> = {
  mile: { label: 'Mile', meters: MI },
  '5k': { label: '5K', meters: 5000 },
  '10k': { label: '10K', meters: 10000 },
  half: { label: 'Half', meters: 21097.5 },
  marathon: { label: 'Marathon', meters: 42195 },
};

/** ml/kg/min required to run at v meters/minute */
const vo2At = (v: number) => -4.6 + 0.182258 * v + 0.000104 * v * v;
/** fraction of VO2max sustainable for t minutes */
const pctMax = (t: number) =>
  0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
/** inverse of vo2At → meters/minute */
const velocity = (vo2: number) => {
  const a = 0.000104, b = 0.182258, c = -4.6 - vo2;
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
};

export function vdotFrom(meters: number, seconds: number): number {
  const t = seconds / 60;
  return vo2At(meters / t) / pctMax(t);
}

/** predicted race time in seconds for a distance at a given VDOT */
export function predict(vdot: number, meters: number): number {
  let lo = 0.5, hi = 2000;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (vo2At(meters / mid) - vdot * pctMax(mid) > 0) lo = mid;
    else hi = mid;
  }
  return ((lo + hi) / 2) * 60;
}

const perMile = (mPerMin: number) => (MI / mPerMin) * 60;

export function buildPaces(vdot: number): Paces {
  const race = (m: number) => predict(vdot, m) / (m / MI);
  const atPct = (p: number) => perMile(velocity(vdot * p));
  const M = race(42195);
  const mile = race(MI);
  return {
    REC: atPct(0.62),
    E: atPct(0.7),
    ST: atPct(0.76),
    M,
    HM: race(21097.5),
    T: atPct(pctMax(60)), // ~1-hour race effort
    '10K': race(10000),
    '5K': race(5000),
    I: atPct(0.975),
    '3K': race(3000),
    MILE: mile,
    SPRINT: mile * 0.9,
    HILL: race(5000) * 1.12, // uphill at 5K effort ≈ slower on the watch
    JOG: atPct(0.58),
    FLOAT: M / 0.9, // ~90% of MP speed
    REST: Infinity,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

export function fmtDuration(sec: number): string {
  if (!isFinite(sec)) return '—';
  const s = Math.round(sec);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`;
}

export const fmtPace = (secPerMile: number) => fmtDuration(secPerMile);

/** "19:30" → 1170, "1:25:00" → 5100, "20" → 1200 (minutes) */
export function parseTime(str: string): number | null {
  const parts = str.trim().split(':');
  if (parts.length < 1 || parts.length > 3 || parts.some((p) => p === '' || isNaN(Number(p)))) return null;
  const nums = parts.map(Number);
  if (nums.length === 1) return nums[0] > 0 ? nums[0] * 60 : null;
  const t = nums.reduce((acc, n) => acc * 60 + n, 0);
  return t > 0 ? t : null;
}
