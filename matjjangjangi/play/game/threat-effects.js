import { speechPlacement, threatPoint } from './threat-geometry.js';
import { clearCheckResponse } from './check-response.js';

const controllers = new WeakMap(), svgNS = 'http://www.w3.org/2000/svg';
let serial = 0;
function svgElement(tag, attributes) {
  const node = document.createElementNS(svgNS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

function createController(board, cells) {
  const grid = board.querySelector('.board-grid'), layer = document.createElement('div');
  layer.className = 'jangi-threat-effects'; layer.hidden = true;
  layer.setAttribute('role', 'status'); layer.setAttribute('aria-live', 'polite'); layer.setAttribute('aria-atomic', 'true');
  grid.append(layer);
  const id = ++serial;
  let key, geometry, flipped, startTimer, hideTimer, animations = [], speeches = [], rings = [], paths = [];
  const cancelAnimations = () => { animations.forEach(animation => animation.cancel()); animations = []; };
  function clear() {
    clearTimeout(startTimer); clearTimeout(hideTimer); cancelAnimations();
    key = null; geometry = null; layer.hidden = true; layer.replaceChildren();
  }
  function position() {
    if (!geometry || layer.hidden) return;
    const bounds = grid.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const box = (cell, calling = false) => {
      const visible = flipped ? 89 - Number(cell.dataset.index) : Number(cell.dataset.index);
      // Measure the skin's resting body, then reserve the caller's full hop/scale.
      // This remains stable during travel and also covers the larger general.
      const style = getComputedStyle(cell.querySelector('.stone'));
      const width = (parseFloat(style.width) || bounds.width / 9) * (calling ? 1.1 : 1);
      const height = (parseFloat(style.height) || bounds.height / 10) * (calling ? 1.1 : 1) + (calling ? 6 : 0);
      return { x: (visible % 9 + .5) * bounds.width / 9 - width / 2,
        y: (Math.floor(visible / 9) + .5) * bounds.height / 10 - height / 2 - (calling ? 3 : 0), width, height };
    };
    const occupied = cells.filter(cell => cell.dataset.stone !== '0');
    const placed = [];
    for (const speech of speeches) {
      const caller = cells[Number(speech.dataset.caller)], anchor = box(caller, true), size = speech.getBoundingClientRect();
      const best = speechPlacement(anchor, size, bounds, [...occupied.filter(cell => cell !== caller).map(cell => box(cell)), ...placed]);
      speech.style.left = `${best.x}px`; speech.style.top = `${best.y}px`;
      speech.dataset.tail = best.side; speech.style.setProperty('--tail-offset', `${best.tail}px`);
      placed.push({ x: best.x, y: best.y, width: size.width, height: size.height });
    }
  }
  function start() {
    if (!geometry || layer.hidden) return;
    layer.removeAttribute('data-entering'); position();
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { for (const speech of speeches) speech.hidden = true; }, 1400);
    if (document.hidden) return;
    for (const line of paths) {
      const length = line.getTotalLength();
      line.style.strokeDasharray = length;
      animations.push(line.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], { duration: 440, easing: 'cubic-bezier(.2,.7,.2,1)' }));
    }
    for (const speech of speeches) animations.push(speech.animate([
      { transform: 'scale(.72)', opacity: .2 }, { transform: 'scale(1.1)', opacity: 1, offset: .65 }, { transform: 'scale(1)', opacity: 1 },
    ], { duration: 380, easing: 'ease-out' }));
    for (const caller of geometry.callers) {
      const cell = cells[caller], stone = cell.querySelector('.stone');
      // Never compete with the existing lift/travel animation on a moving piece.
      if (!cell.classList.contains('placing')) animations.push(stone.animate([
        { transform: 'translate(-50%,-50%) scale(1)' },
        { transform: 'translate(-50%,calc(-50% - 3px)) scale(1.07)', offset: .4 },
        { transform: 'translate(-50%,-50%) scale(1)' },
      ], { duration: 380, easing: 'ease-out' }));
    }
    for (const ring of rings) animations.push(ring.animate([
      { boxShadow: '0 0 0 2px #e7302440' }, { boxShadow: '0 0 0 7px #e7302410' }, { boxShadow: '0 0 0 2px #e7302440' },
    ], { duration: 600, iterations: 2 }));
  }
  function render(model, nextKey, nextFlipped, t, delay = 0) {
    if (!model) { clear(); return; }
    const label = t(model.kind === 'bikjang' ? 'jangiBikjangCall' : 'jangiCheckCall');
    if (key === nextKey && flipped === nextFlipped) {
      for (const speech of speeches) if (speech.textContent !== label) speech.textContent = label;
      position(); return;
    }
    clear(); key = nextKey; geometry = model; flipped = nextFlipped;
    layer.hidden = false; layer.dataset.kind = model.kind; layer.setAttribute('data-entering', '');
    const svg = svgElement('svg', { class: 'jangi-threat-line' + (model.kind === 'bikjang' ? ' jangi-bikjang-line' : ''),
      viewBox: '0 0 9 10', preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' });
    paths = [];
    for (const route of model.routes) {
      const underlay = svgElement('path', { d: route.path, class: 'jangi-threat-underlay' });
      const line = svgElement('path', { d: route.arrowPath, class: 'jangi-threat-route', 'marker-end': `url(#jangi-threat-arrow-${id})`, 'data-from': route.from, 'data-to': route.to });
      svg.append(underlay, line); paths.push(underlay, line);
    }
    const defs = svgElement('defs', {}), marker = svgElement('marker', { id: `jangi-threat-arrow-${id}`, markerWidth: '.26', markerHeight: '.24', refX: '.24', refY: '.12', markerUnits: 'userSpaceOnUse', orient: 'auto' });
    marker.append(svgElement('path', { d: 'M0 0L.26 .12L0 .24Z', class: 'jangi-threat-arrow' })); defs.append(marker); svg.append(defs); layer.append(svg);
    rings = model.kings.map(index => {
      const ring = document.createElement('span'), p = threatPoint(index, flipped);
      ring.className = 'jangi-threat-ring'; ring.style.left = `${p[0] / 9 * 100}%`; ring.style.top = `${p[1] / 10 * 100}%`;
      ring.setAttribute('aria-hidden', 'true'); layer.append(ring); return ring;
    });
    speeches = model.callers.map(index => {
      const speech = document.createElement('span'); speech.className = 'jangi-threat-speech'; speech.dataset.caller = index; speech.textContent = label;
      if (model.kind === 'bikjang' && board.id === 'board') speech.id = 'bikjang-call';
      layer.append(speech); return speech;
    });
    position();
    // The regular 320ms move lands first; server confirmation keeps the same board key.
    startTimer = setTimeout(start, 360 + delay);
  }
  new ResizeObserver(position).observe(grid);
  document.fonts?.ready.then(position);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    clearTimeout(startTimer); cancelAnimations();
    layer.removeAttribute('data-entering'); for (const speech of speeches) speech.hidden = true;
  });
  return { render, clear };
}

export function renderJangiThreats({ board, cells, geometry, key, flipped, t, delay }) {
  if (!controllers.has(board)) controllers.set(board, createController(board, cells));
  controllers.get(board).render(geometry, key, flipped, t, delay);
}
export function clearJangiThreats(board) { controllers.get(board)?.clear(); clearCheckResponse(board); }
