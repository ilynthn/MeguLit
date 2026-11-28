// SPDX-License-Identifier: GPL-3.0-or-later

function animated(bytes, mime) {
  if (mime === 'image/gif') return true;
  if (mime === 'image/webp') {
    return bytes.length > 20 && bytes[12] === 86 && bytes[13] === 80 && bytes[14] === 56 && bytes[15] === 88 && Boolean(bytes[20] & 2);
  }
  if (mime !== 'image/png') return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // APNG places the animation control chunk before its first image-data chunk.
  for (let chunk = 8; chunk + 12 <= bytes.length;) {
    const type = view.getUint32(chunk + 4);
    if (type === 0x6163544c) return true;
    if (type === 0x49444154) break;
    chunk += view.getUint32(chunk) + 12;
  }
  return false;
}

self.onmessage = async ({ data: { id, data, mime, width, height, density } }) => {
  let source;
  let bitmap;
  try {
    const bytes = typeof Uint8Array.fromBase64 === 'function'
      ? Uint8Array.fromBase64(data) : Uint8Array.from(atob(data), char => char.charCodeAt(0));
    if (animated(bytes, mime)) {
      self.postMessage({ id });
      return;
    }
    source = await createImageBitmap(new Blob([bytes], { type: mime }));
    const fit = Math.min(1, width / source.width, height / source.height);
    const scale = Math.min(1, fit * density, Math.sqrt(2_400_000 / (source.width * source.height)));
    bitmap = scale === 1 ? source : await createImageBitmap(source, {
      resizeWidth: Math.max(1, Math.round(source.width * scale)),
      resizeHeight: Math.max(1, Math.round(source.height * scale)),
      resizeQuality: 'high'
    });
    self.postMessage({ id, bitmap, width: source.width, height: source.height }, [bitmap]);
    if (source === bitmap) source = null;
    bitmap = null;
  } catch {
    self.postMessage({ id });
  } finally {
    if (bitmap !== source) source?.close();
    bitmap?.close();
  }
};
