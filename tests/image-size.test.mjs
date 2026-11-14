import {test} from 'node:test';
import assert from 'node:assert/strict';
import {imageSize} from '../lib/image-size.mjs';

const bytes = (...parts) => new Uint8Array(parts.flatMap(part => typeof part === 'string' ? [...part].map(c => c.charCodeAt(0)) : part));
const be32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255], le16 = n => [n & 255, n >> 8], be16 = n => [n >> 8, n & 255];

test('image headers give the natural size', () => {
  assert.deepEqual(imageSize(bytes([0x89], 'PNG\r\n\x1a\n', be32(13), 'IHDR', be32(1200), be32(600), [8, 6, 0, 0, 0])), {width: 1200, height: 600});
  assert.deepEqual(imageSize(bytes('GIF89a', le16(320), le16(240), [0, 0, 0])), {width: 320, height: 240});
  // JPEG: SOI, an APP0 segment, then SOF0 (precision, height, width).
  assert.deepEqual(imageSize(bytes([0xFF, 0xD8, 0xFF, 0xE0], be16(4), [0, 0], [0xFF, 0xC0], be16(11), [8], be16(480), be16(640), [3, 0, 0, 0, 0])), {width: 640, height: 480});
  // WebP extended (VP8X): 24-bit width − 1 and height − 1.
  assert.deepEqual(imageSize(bytes('RIFF', [0, 0, 0, 0], 'WEBP', 'VP8X', [10, 0, 0, 0], [0, 0, 0, 0], [0x1F, 0x03, 0], [0xC7, 0x01, 0], [0, 0])), {width: 800, height: 456});
  assert.deepEqual(imageSize(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"></svg>')), {width: 64, height: 32});
  assert.deepEqual(imageSize(new TextEncoder().encode('<svg viewBox="0 0 160 90"></svg>')), {width: 160, height: 90});
  // Unknown: no size to read.
  assert.equal(imageSize(new TextEncoder().encode('<svg viewBox="0 0 1.5 2"></svg>')), null);
  assert.equal(imageSize(bytes('not an image')), null);
});
