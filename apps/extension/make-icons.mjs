#!/usr/bin/env node
// Writes icons/{16,48,128}.png (a navy rounded square). Run: node apps/extension/make-icons.mjs
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size) {
  const r = Math.round(size * 0.22);
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = [0];
    for (let x = 0; x < size; x++) {
      const dx = Math.max(r - x, x - (size - 1 - r), 0);
      const dy = Math.max(r - y, y - (size - 1 - r), 0);
      const inside = dx * dx + dy * dy <= r * r;
      // Navy square with a lighter "H" bar shape in the middle.
      const bar = x > size * 0.3 && x < size * 0.7 && y > size * 0.45 && y < size * 0.55;
      const legs =
        (Math.abs(x - size * 0.33) < size * 0.07 || Math.abs(x - size * 0.67) < size * 0.07) &&
        y > size * 0.25 &&
        y < size * 0.75;
      const [cr, cg, cb] = bar || legs ? [255, 255, 255] : [30, 58, 95];
      row.push(cr, cg, cb, inside ? 255 : 0);
    }
    rows.push(Buffer.from(row));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const s of [16, 48, 128]) writeFileSync(new URL(`./icons/${s}.png`, import.meta.url), png(s));
console.log("icons written");
