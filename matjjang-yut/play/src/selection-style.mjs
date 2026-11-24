export const SELECTED_TINT = Object.freeze({ color: '#f2ff00', strength: .5 });
const channels = [242, 255, 0], images = new WeakMap();

export function selectedColor(color) {
  return 'rgb(' + [1, 3, 5].map((offset, index) => Math.round(
    parseInt(color.slice(offset, offset + 2), 16) * (1 - SELECTED_TINT.strength) + channels[index] * SELECTED_TINT.strength,
  )).join(',') + ')';
}

// Keep the original sprite's alpha and reuse the tinted bitmap across cue frames.
export function selectedImage(image) {
  if (images.has(image)) return images.get(image);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = SELECTED_TINT.strength;
  ctx.fillStyle = SELECTED_TINT.color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  images.set(image, canvas);
  return canvas;
}
