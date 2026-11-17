// Keep glyph alignment independent from the body's travel/landing transforms.
export function setPieceGlyph(stone, text) {
  let glyph = stone.firstElementChild;
  if (!glyph?.classList.contains('jangi-glyph')) {
    glyph = document.createElement('span');
    glyph.className = 'jangi-glyph';
    stone.replaceChildren(glyph);
  }
  glyph.textContent = text;
}
