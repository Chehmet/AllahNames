import { qrcode } from './vendor/qrcode.mjs';

export function matrix(url) {
  const qr = qrcode(0, 'M');
  qr.addData(url, 'Byte');
  qr.make();
  const count = qr.getModuleCount();
  return Array.from({ length: count }, (_, y) => Array.from({ length: count }, (_, x) => qr.isDark(y, x)));
}

export function drawQR(canvas, url) {
  const points = matrix(url);
  const margin = 4;
  const pixels = Math.max(3, Math.floor(180 / (points.length + margin * 2)));
  canvas.width = canvas.height = (points.length + margin * 2) * pixels;
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#24193f';
  points.forEach((row, y) => row.forEach((point, x) => {
    if (point) context.fillRect((x + margin) * pixels, (y + margin) * pixels, pixels, pixels);
  }));
}
