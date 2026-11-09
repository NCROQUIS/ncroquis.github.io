// 결제 도구 NcqIap — 출시 빌드(구글플레이·토스)가 진짜를 넣어 줘요. 개발 중(로컬)에는 없어서 대신 써요 (바로 산 것으로 해요).
// 출시 빌드인데 NcqIap이 없으면(window.NCQ·window.Capacitor가 있으면) 상품을 모두 숨겨요.
const dev = !window.NCQ && !window.Capacitor;
let grant = null;
export const NcqIap = window.NcqIap || {
  onGrant: (fn) => { grant = fn; },
  can: () => dev,
  ready: async () => dev,
  price: () => "",
  owned: async () => false,
  restore: async () => ({ ok: dev, restored: [] }),
  buy: async (id) => (dev && grant && grant(String(id).toUpperCase(), {}) !== false ? { ok: true, id } : { ok: false, id }),
  buyOnce: async (id) => (dev && grant && grant(String(id).toUpperCase(), {}) !== false ? { ok: true, id } : { ok: false, id }),
};
