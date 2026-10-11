import {boot, Layer, palette, stColor, indexAt, s16, clamp} from '../shared/runtime.js';

export class Lockbuster2Clock {
  constructor(font, messages, maps) {
    Object.assign(this, {font, messages, maps: maps.map(b => Array.from({length: 40}, (_, i) => ({source: s16(b, i * 4), destination: s16(b, i * 4 + 2)}))),
      buffers: [new Uint8Array(131072), new Uint8Array(131072)], front: 0, tick: 0, phase: -1, frame: 0, bytePhase: 0, offset: 0, remaining: 0, headerTick: 0, gold: false, colorText: false, newRaster: false});
    this.header = [0, 1].map(i => {
      const b = new Uint8Array(17000); let position = 320, line = 0;
      for (const r of messages[i]) {
        if (r === 32) { position = 320 + ++line * 4000; continue; }
        const glyph = clamp(r - 32, 0, 58) * 400;
        for (let y = 0; y < 25; y++) if (position + y * 160 + 16 <= b.length) b.set(font.subarray(glyph + y * 16, glyph + y * 16 + 16), position + y * 160);
        position += 16;
      }
      return b;
    });
  }
  get screen() { return this.buffers[this.front].subarray(32768, 32768 + 32000); }
  step() {
    const c = this; c.tick++;
    if (c.headerTick < 610) {
      const bank = Math.floor(c.headerTick / 305), frame = c.headerTick % 305 + 1; let start = -99 + frame, length = 101 * 160;
      if (bank === 1) { c.gold = true; start = 202 - frame; length = 106 * 160; }
      const target = 1 - c.front; c.buffers[target].set(c.header[bank].subarray(0, length), 32768 + start * 160); c.front = target; c.headerTick++; return;
    }
    if (c.remaining === 0) {
      c.phase = (c.phase + 1) % 8; c.frame = c.bytePhase = c.offset = 0;
      const text = c.messages[2 + c.phase]; c.remaining = text.length * 4; c.compiled = new Uint8Array(text.length * 400 + 416);
      text.forEach((r, i) => { const glyph = clamp(r - 32, 0, 58) * 400; c.compiled.set(c.font.subarray(glyph, glyph + 400), i * 400); });
      switch (c.phase) {
        case 0: case 2: c.colorText = false; break;
        case 1: case 5: c.gold = c.colorText = true; break;
        case 3: c.gold = true; break;
        case 4: c.colorText = c.newRaster = false; break;
      }
    }
    const mode = [0, 1, 2, 3, 4, 5, 5, 5][c.phase];
    if (c.frame === 4) { c.frame = 0; c.offset += 384; }
    let base = 32768 + 87 * 160;
    if (mode === 3) base += 15 * 160; if (mode === 4) base -= 20 * 160; if (mode === 5) base -= 15 * 160;
    const from = c.buffers[c.front], to = c.buffers[1 - c.front], height = mode === 5 ? 24 : 25;
    for (let y = 0; y < height; y++) for (let plane = 0; plane < 4; plane++) {
      const start = base + y * 160 + plane * 2;
      for (const op of c.maps[mode]) {
        const dst = start + op.destination;
        if (op.source === 0x7fff) { const off = c.offset + y * 16 + plane * 2; if (off < c.compiled.length) to[dst] = c.compiled[off]; }
        else to[dst] = from[start + op.source];
      }
    }
    c.front = 1 - c.front; c.bytePhase ^= 1; if (!c.bytePhase) c.offset += 6; c.offset++; c.frame++; c.remaining--;
    const b = c.buffers[c.front];
    const copyRows = (src, dst, rows, step, double) => {
      for (let y = 0; y < rows; y++) { b.copyWithin(dst, src, src + 160); if (double) b.copyWithin(dst + 160, src, src + 160); src += 160; dst += step; }
    };
    switch (mode) {
      case 0: copyRows(base, base + 0x38e0, 24, -320, false); break;
      case 1: copyRows(base + 160, base + 0x3700, 23, -320, true); break;
      case 2: copyRows(base, base + 0x46a0, 35, -320, false); break;
      case 3: {
        let src = base, dst = base - 0x2a80, step = 160;
        for (let count = 22; count >= 0; count--) { b.copyWithin(dst, src, src + 160); b.copyWithin(dst + 160, src, src + 160); src += 160; dst += 160; if (count === 20) step += 160; dst += step; }
        break;
      }
      case 4: {
        copyRows(base, base + 0x3e80, 29, -320, false); let pos = 32768 + 0x50f0, delta = 238;
        for (let count = 19; count >= 0; count--) { const n = (count + 21) * 2; b.fill(0, pos, pos + n); pos += n - delta; delta -= 2; }
        break;
      }
      case 5: for (let y = 0; y < 24; y++) { const s = base + y * 160; b.copyWithin(s + 0x2bc0, s, s + 160); b.copyWithin(s + 0x2bc0 - 0x5140, s, s + 160); } break;
    }
  }
}
export async function createScene({assets, screen}) {
  const [font, messages, maps, oldRaster, newRaster] = await Promise.all([
    assets.bytes('font.bin'), Promise.all(Array.from({length: 10}, (_, i) => assets.bytes(`message-${i}.bin`))),
    Promise.all(Array.from({length: 6}, (_, i) => assets.bytes(`copy-map-${i}.bin`))), assets.bytes('raster-old.bin'), assets.bytes('raster-new.bin')
  ]);
  const clock = new Lockbuster2Clock(font, messages, maps), stage = new Layer(), rasters = [palette(oldRaster), palette(newRaster)];
  const metallic = [0, 0, 0x134, 0x235, 0x124, 0x023, 0x346, 0x245, 0x356, 0x457, 0x467, 0x567, 0x677, 0x577, 0x701, 0x777].map(stColor);
  const gold = [0, 0, 0x341, 0x532, 0x421, 0x320, 0x643, 0x542, 0x653, 0x754, 0x764, 0x765, 0x776, 0x775, 0x107, 0x777].map(stColor);
  return {
    clock,
    key(code) { if (code === 'F1') clock.gold = true; if (code === 'F2') clock.gold = false; if (code === 'F3') clock.colorText = true; if (code === 'F4') clock.colorText = false; if (code === 'F5') clock.newRaster = true; if (code === 'F6') clock.newRaster = false; },
    click(x) { if (x < 160) clock.gold = !clock.gold; else clock.colorText = !clock.colorText; },
    update() { clock.step(); stage.planar(clock.screen); },
    render() {
      const p = stage.pixels(), colors = clock.gold ? gold : metallic, raster = rasters[clock.newRaster ? 1 : 0];
      screen.paint((x, y, at) => { const i = indexAt(p, at), row = y >> 1; if (i === 0 || (i === 1 && clock.colorText)) return raster[row + (i === 1 ? 9 : 0)] ?? 0xff000000; return colors[i]; });
    }
  };
}
if (typeof document !== 'undefined') boot({title: 'Lockbuster of DMA — Lockbuster 2', controls: 'F1/F2 : or / métal · F3/F4 : fond coloré / noir · F5/F6 : rasters · P : pause · M : son'}, createScene);
