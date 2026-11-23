export const BOARD_LENGTH = 6.16;
export const THROW_DEFAULTS = Object.freeze({
  gather: .2, landingMin: .5, landingMax: 1,
  heightMin: 5, heightMax: 300, distanceMin: 5, distanceMax: 65, spacingMin: 10, spacingMax: 30,
});
export const THROW_LIMITS = Object.freeze({
  gather: [.1, 2, .05], landingMin: [.3, 5, .05], landingMax: [.3, 5, .05],
  heightMin: [5, 300, 1], heightMax: [5, 300, 1],
  distanceMin: [5, 65, 1], distanceMax: [5, 65, 1],
  spacingMin: [0, 30, 1], spacingMax: [0, 30, 1],
});
const ranges = ['landing', 'height', 'distance', 'spacing'];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
function settingValue(key, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return THROW_DEFAULTS[key];
  const [min, max, step] = THROW_LIMITS[key];
  return Number((min + Math.round((clamp(value, min, max) - min) / step) * step).toFixed(2));
}
export function normalizeThrowSettings(value) {
  const result = { ...THROW_DEFAULTS };
  for (const key of Object.keys(THROW_LIMITS)) result[key] = settingValue(key, value?.[key]);
  for (const range of ranges) result[range + 'Max'] = Math.max(result[range + 'Min'], result[range + 'Max']);
  return result;
}
export function changeThrowSetting(current, key, value) {
  const result = normalizeThrowSettings(current);
  if (!Object.hasOwn(THROW_LIMITS, key)) return result;
  result[key] = settingValue(key, value);
  if (key.endsWith('Min')) result[key.replace('Min', 'Max')] = Math.max(result[key], result[key.replace('Min', 'Max')]);
  if (key.endsWith('Max')) result[key.replace('Max', 'Min')] = Math.min(result[key], result[key.replace('Max', 'Min')]);
  return result;
}
export function createThrowPlan(value, random = Math.random) {
  const settings = normalizeThrowSettings(value);
  const between = (min, max) => min + random() * (max - min);
  const gaps = Array.from({ length: 3 }, () => between(settings.spacingMin, settings.spacingMax) * BOARD_LENGTH / 100);
  const centers = [-gaps.reduce((sum, gap) => sum + gap, 0) / 2];
  for (const gap of gaps) centers.push(centers.at(-1) + gap);
  const sticks = Array.from({ length: 4 }, (_, i) => ({
    height: between(settings.heightMin, settings.heightMax) * BOARD_LENGTH / 100,
    distance: between(settings.distanceMin, settings.distanceMax) * BOARD_LENGTH / 100,
    x: centers[i], angle: between(-.2, .2), duration: between(settings.landingMin, settings.landingMax) * 1000,
    turns: 2 + Math.min(1, Math.floor(random() * 2)),
  }));
  for (const stick of sticks) stick.y = 2.05 - stick.distance;
  const gather = settings.gather * 1000, launch = gather + 180, bounce = 470;
  const lastLanding = launch + Math.max(...sticks.map(stick => stick.duration));
  const reveal = lastLanding + bounce + 150;
  return { settings, gaps, sticks, timing: { gather, launch, bounce, lastLanding, reveal, end: reveal + 650 } };
}
export function heightMagnification(height) {
  return 1 / (1 - .48 * clamp((height - .28) / (BOARD_LENGTH * 3 - .28), 0, 1));
}
