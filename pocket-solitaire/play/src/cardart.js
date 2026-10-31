// 카드 앞면 그림 (직접 그린 SVG — 외부 이미지·저작권 없음)
// 클래식: 진짜 카드처럼 무늬 배치(2~10) + 직접 그린 J·Q·K 인물, 큰 글자: 숫자와 무늬를 크게 (가독성 우선)

export const SUIT_NAMES = ['스페이드', '하트', '다이아', '클로버'];

// 무늬 모양 (0~100 상자)
const SUIT_SHAPES = [
  '<path d="M50 4C62 22 94 38 94 62c0 16-12 26-26 26-8 0-13-4-16-8 1 8 5 14 12 18H36c7-4 11-10 12-18-3 4-8 8-16 8C18 88 6 78 6 62 6 38 38 22 50 4Z"/>',
  '<path d="M50 90C20 68 4 52 4 31 4 15 16 4 30 4c10 0 17 6 20 14 3-8 10-14 20-14 14 0 26 11 26 27 0 21-16 37-46 59Z"/>',
  '<path d="M50 2 88 50 50 98 12 50Z"/>',
  '<circle cx="50" cy="27" r="21"/><circle cx="27" cy="58" r="21"/><circle cx="73" cy="58" r="21"/><path d="M45 52c0 24-5 36-14 46h38c-9-10-14-22-14-46Z"/>',
];

// 문서에 한 번만 무늬 기호를 등록하고 <use>로 재사용
export function installSuitSymbols() {
  if (document.getElementById('suit-defs')) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = `<svg id="suit-defs" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${SUIT_SHAPES.map((d, i) => `<symbol id="suit-${i}" viewBox="0 0 100 100">${d}</symbol>`).join('')}</defs></svg>`;
  document.body.appendChild(wrap.firstChild);
}

const RANK = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const use = (s, cx, cy, size, flip = false) =>
  `<use href="#suit-${s}" x="${cx - size / 2}" y="${cy - size / 2}" width="${size}" height="${size}"${flip ? ` transform="rotate(180 ${cx} ${cy})"` : ''}/>`;

// 무늬 배치: [x, 세로 위치(0=위,1=아래)]  — 무늬 영역 x 40~80, y 50~126
const PL = 30; const PM = 50; const PR = 70;
const PIPS = {
  2: [[PM, 0], [PM, 1]],
  3: [[PM, 0], [PM, 0.5], [PM, 1]],
  4: [[PL, 0], [PR, 0], [PL, 1], [PR, 1]],
  5: [[PL, 0], [PR, 0], [PM, 0.5], [PL, 1], [PR, 1]],
  6: [[PL, 0], [PR, 0], [PL, 0.5], [PR, 0.5], [PL, 1], [PR, 1]],
  7: [[PL, 0], [PR, 0], [PM, 0.25], [PL, 0.5], [PR, 0.5], [PL, 1], [PR, 1]],
  8: [[PL, 0], [PR, 0], [PM, 0.25], [PL, 0.5], [PR, 0.5], [PM, 0.75], [PL, 1], [PR, 1]],
  9: [[PL, 0], [PR, 0], [PL, 1 / 3], [PR, 1 / 3], [PM, 0.5], [PL, 2 / 3], [PR, 2 / 3], [PL, 1], [PR, 1]],
  10: [[PL, 0], [PR, 0], [PM, 1 / 6], [PL, 1 / 3], [PR, 1 / 3], [PL, 2 / 3], [PR, 2 / 3], [PM, 5 / 6], [PL, 1], [PR, 1]],
};
const Y0 = 58; const Y1 = 126;

// 인물 옷 색 (무늬 색에 맞춰 두 벌)
const ROBE = {
  11: { red: '#e8753a', black: '#3b6fd8' },
  12: { red: '#c2417a', black: '#1f8a70' },
  13: { red: '#c8312f', black: '#2c3e70' },
};

function court(s, r) {
  const red = s === 1 || s === 2;
  const robe = ROBE[r][red ? 'red' : 'black'];
  const tint = red ? '#fdeeec' : '#edf1f8';
  const line = red ? 'rgba(200,49,47,.35)' : 'rgba(44,62,112,.3)';
  const skin = '#f4d2ae';
  let head = '';
  if (r === 13) { // K: 왕관 + 흰 수염
    head = `<path d="M37 79 41 64l5 8 4-10 4 10 5-8 4 15Z" fill="#f2b705" stroke="#c98f00" stroke-width="1"/>
      <circle cx="${PM}" cy="88" r="11" fill="${skin}"/>
      <path d="M39 90c1 9 5 14 11 14s10-5 11-14c-3 3-7 4-11 4s-8-1-11-4Z" fill="#f4f4f4" stroke="#d9d9d9" stroke-width=".8"/>`;
  } else if (r === 12) { // Q: 긴 머리 + 작은 관
    head = `<path d="M36 92c-1-14 5-21 14-21s15 7 14 21c0 8-3 13-5 15H41c-2-2-5-7-5-15Z" fill="#5b3a29"/>
      <circle cx="${PM}" cy="88" r="10.5" fill="${skin}"/>
      <path d="M41 77 44 69l3 5 3-7 3 7 3-5 3 8Z" fill="#f2b705" stroke="#c98f00" stroke-width=".8"/>`;
  } else { // J: 깃털 모자
    head = `<circle cx="${PM}" cy="89" r="10.5" fill="${skin}"/>
      <path d="M37 85c0-9 6-13 13-13s13 4 13 13c-4-3-8-4-13-4s-9 1-13 4Z" fill="${robe}"/>
      <path d="M61 78c6-8 10-12 14-12-2 6-6 10-12 13Z" fill="#f2b705"/>`;
  }
  const face = `<circle cx="${PM - 4}" cy="89" r="1.3" fill="#3a2a20"/><circle cx="${PM + 4}" cy="89" r="1.3" fill="#3a2a20"/>
    <path d="M${PM - 3} 94q3 2 6 0" stroke="#b5654b" stroke-width="1.2" fill="none" stroke-linecap="round"/>`;
  return `<rect x="19" y="46" width="62" height="88" rx="8" fill="${tint}" stroke="${line}" stroke-width="1"/>
    <path d="M28 134c2-18 10-27 22-27s20 9 22 27Z" fill="${robe}"/>
    <path d="M42 107l8 9 8-9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/>
    <circle cx="${PM}" cy="124" r="6.5" fill="#fff"/>${use(s, PM, 124, 8.5)}
    ${head}${face}`;
}

export function faceSVG(s, r) {
  // 모서리 표시: 숫자는 왼쪽 위, 무늬는 오른쪽 위 (카드가 겹쳐도 둘 다 보이게, 크게)
  const idx = r === 10
    ? '<text x="3" y="36" font-size="34" letter-spacing="-3">10</text>'
    : `<text x="6" y="37" font-size="38">${RANK[r]}</text>`;
  let body;
  if (r === 1) body = use(s, 52, 92, 50);
  else if (r > 10) body = court(s, r);
  else body = PIPS[r].map(([x, t]) => use(s, x, Y0 + (Y1 - Y0) * t, 17, t > 0.5)).join('');
  return `<svg class="art" viewBox="0 0 100 142" aria-hidden="true"><g class="ix">${idx}${use(s, 81, 22, 24)}</g>${body}</svg>`;
}

// 심플(기본): 중장년층도 한눈에 — 아주 큰 숫자, 큰 무늬, 꾸밈 없음
// J·Q·K는 가운데에 큰 글자 (카드와 같은 흰 바탕, 꾸밈 없음)
export function simpleFace(s, r) {
  const tint = '';
  const big = r > 10
    ? `<text x="50" y="122" font-size="64" text-anchor="middle" class="ct">${RANK[r]}</text>`
    : use(s, 50, 98, r === 1 ? 62 : 52);
  const idx = r === 10
    ? '<text x="1" y="44" font-size="44" letter-spacing="-5">10</text>'
    : `<text x="5" y="46" font-size="50">${RANK[r]}</text>`;
  return `<svg class="art simple" viewBox="0 0 100 142" aria-hidden="true"><g class="ix">${idx}${use(s, 80, 25, 30)}</g>${tint}${big}</svg>`;
}
