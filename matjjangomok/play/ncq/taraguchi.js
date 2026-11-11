import { size } from "./position.js?v=964bf8474dc9";

export const offerCount = 10;
const center = Math.floor(size / 2);

export function maySwap(state) {
  return state.opening === "limited" && state.placed > 0 && !state.swapped;
}

export function mayOffer(state) {
  return maySwap(state) && state.placed === 4;
}

export function openingRadius(state) {
  return state.opening === "limited" && state.placed < 5 ? state.placed : null;
}

function symmetricOffer(board, offers, index) {
  if (!offers.length) return false;
  const stones = board.flatMap((color, square) => color ? [square] : []);
  // Reflections and rotations count only if they preserve the four stones already played.
  for (const transpose of [false, true]) {
    for (const flipRow of [false, true]) {
      for (const flipCol of [false, true]) {
        if (!transpose && !flipRow && !flipCol) continue;
        const transform = square => {
          const row = Math.floor(square / size);
          const col = square % size;
          const y = transpose ? col : row;
          const x = transpose ? row : col;
          return (flipRow ? size - 1 - y : y) * size + (flipCol ? size - 1 - x : x);
        };
        if (offers.includes(transform(index)) && stones.every(square => board[square] === board[transform(square)])) {
          return true;
        }
      }
    }
  }
  return false;
}

export function openingError(state, index) {
  const radius = openingRadius(state);
  if (radius !== null) {
    const row = Math.floor(index / size);
    const col = index % size;
    if (Math.max(Math.abs(row - center), Math.abs(col - center)) > radius) return "outsideOpening";
  }
  if (state.opening === "offerFive") {
    if (state.offers.includes(index)) return "alreadyOffered";
    if (symmetricOffer(state.board, state.offers, index)) return "symmetricOffer";
  }
  if (state.opening === "pickFive" && !state.offers.includes(index)) return "chooseOffered";
}

export function applyOpening(state, seat, action, color) {
  if (action.type === "swap" && maySwap(state)) {
    return { ...state, black: 3 - state.black, turn: 3 - seat, swapped: true };
  }
  if (action.type === "offerFive" && mayOffer(state)) {
    return { ...state, opening: "offerFive", offers: [] };
  }
  const { index } = action;
  if (action.type !== "move" || !Number.isInteger(index) || index < 0 || index >= state.board.length) {
    return { error: "invalid" };
  }
  if (state.board[index]) return { error: "occupied" };
  const error = openingError(state, index);
  if (error) return { error };
  if (state.opening === "offerFive") {
    const offers = [...state.offers, index];
    return offers.length === offerCount
      ? { ...state, offers, opening: "pickFive", turn: 3 - seat }
      : { ...state, offers };
  }

  const board = [...state.board];
  board[index] = color;
  if (state.opening === "pickFive") {
    return { ...state, board, opening: null, placed: 5, offers: [] };
  }
  const placed = state.placed + 1;
  return { ...state, board, placed, opening: placed === 6 ? null : "limited", turn: 3 - seat, swapped: false };
}
