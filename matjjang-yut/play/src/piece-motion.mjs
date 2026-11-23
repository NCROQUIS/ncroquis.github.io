export const HOP_MS = 260;
export const HOP_CONTACT = .7;
export const RETURN_MS = 440;
export const RETURN_STAGGER_MS = 45;
const clamp = value => Math.max(0, Math.min(1, value));
const lerp = (a, b, t) => a + (b - a) * t;

// Each hop has its own takeoff and held landing, rather than sliding through cells.
export function hopPose(progress) {
  const t = clamp(progress);
  if (t < .12) {
    const q = t / .12;
    return { advance: 0, lift: 0, zoom: 1, sx: 1 + .08 * q, sy: 1 - .1 * q };
  }
  if (t < HOP_CONTACT) {
    const q = (t - .12) / (HOP_CONTACT - .12), arc = Math.sin(q * Math.PI);
    return { advance: q * q * (3 - 2 * q), lift: .48 * arc, zoom: 1 + .1 * arc, sx: 1, sy: 1 };
  }
  const q = (t - HOP_CONTACT) / (1 - HOP_CONTACT);
  const keys = [[0, 1.2, .78], [.3, 1.16, .84], [.7, .97, 1.04], [1, 1, 1]];
  const end = keys.findIndex(key => key[0] >= q), b = keys[Math.max(1, end)], a = keys[Math.max(1, end) - 1];
  const u = clamp((q - a[0]) / (b[0] - a[0]));
  return { advance: 1, lift: 0, zoom: 1, sx: lerp(a[1], b[1], u), sy: lerp(a[2], b[2], u) };
}

// A shallow fan exposes every piece's rim, including stacks of four.
export function stackOffsets(count, radius) {
  return Array.from({ length: count }, (_, index) => ({
    x: (index - (count - 1) / 2) * radius * .34,
    y: -(index - (count - 1) / 2) * radius * .42,
  }));
}

export function returnPose(from, to, progress) {
  const t = clamp(progress), q = 1 - Math.pow(1 - t, 3), arc = Math.sin(t * Math.PI);
  return {
    x: lerp(from.x, to.x, q) + arc * 14,
    y: lerp(from.y, to.y, q) - arc * 24,
    r: lerp(from.r, to.r, q) * (1 + arc * .1),
    rotation: -arc * .12,
    alpha: lerp(1, to.alpha ?? 1, clamp((t - .7) / .3)),
  };
}
