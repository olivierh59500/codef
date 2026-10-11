import {boot, Layer, palette, stColor, indexAt, s16, u16, word, clamp} from '../shared/runtime.js';

const glyphIndex = c => c === ' ' ? 0 : c === '.' ? 27 : c === ',' ? 28 : c === "'" ? 29 : clamp(c.charCodeAt(0) - 64, 0, 26);
export async function createScene({assets, screen, sound}) {
  const [background, ribbon, bats, message, initial, history, fontColors, pal, raster] = await Promise.all([
    assets.image('background.png'), assets.image('ribbon.png'), Promise.all(Array.from({length: 15}, (_, i) => assets.image(`bat-${i}.png`))),
    assets.text('message.txt'), assets.bytes('initial-motion.bin'), assets.bytes('initial-history.bin'), assets.bytes('font-colors.bin'),
    assets.bytes('palette.bin'), assets.bytes('raster.bin')
  ]);
  const state = {tick: 0, counter: 0, hold: 62, vx: s16(initial), ax: s16(initial, 2), x: s16(initial, 4), vy: s16(initial, 6), ay: s16(initial, 8), y: s16(initial, 10), history: Array.from({length: 50}, (_, i) => s16(history, i * 2))};
  const body = new Layer(), meters = new Layer(), colors = palette(pal), rasters = palette(raster), bank = new Uint32Array(1600);
  return {
    state, colorBank: bank,
    update() {
      const s = state; s.tick++;
      if (s.tick % 320 === 0) s.hold = 61;
      s.history.shift();
      if (s.hold > 0) s.hold--;
      else {
        s.x = word(s.x + s.vx); s.y = word(s.y + s.vy);
        if (++s.counter === 5) {
          s.counter = 0; s.vx = word(s.vx + s.ax); s.vy = word(s.vy + s.ay);
          if (Math.abs(s.vx) === 6) s.ax = -s.ax;
          if (Math.abs(s.vy) === 3) s.ay = -s.ay;
        }
      }
      s.history.push(s.x); body.clear(); meters.clear();
      s.history.forEach((x, row) => body.blit(ribbon, x, s.y + row, 0, row, 112, 1));
      const regs = sound.registers();
      [8, 10, 9].forEach((reg, i) => meters.blit(bats[15 - Math.max(1, regs[reg] & 15)], i * 128, 0));
      bank.fill(0xff000000);
      const position = s.tick - 1, current = Math.floor(position / 17) % message.length, shift = position % 17;
      let output = 0, phase = 0, step = 20;
      for (let row = 0; output < 100 && row < 272; row++) {
        phase += step; if (phase < 80) continue; phase -= 80; step++;
        const sourceRow = row + shift, slot = Math.floor(sourceRow / 17);
        const character = slot < 16 && current + slot < message.length ? message[current + slot] : ' ';
        const glyph = glyphIndex(character);
        for (let col = 0; col < 15; col++) bank[output * 16 + col + 1] = stColor(u16(fontColors, (glyph * 255 + sourceRow % 17 * 15 + col) * 2));
        output++;
      }
    },
    render() {
      const b = body.pixels(), m = meters.pixels();
      screen.paint((x, y, at) => {
        let i = indexAt(background.data, at);
        if (b[at + 3]) i = (i >> 2) * 4 + indexAt(b, at);
        if (y < 32) i = i % 4 + indexAt(m, at);
        if (y >= 100 && i > 0) return bank[(y - 100) * 16 + i];
        return i === 4 && y < 64 ? rasters[y] ?? stColor(0x700) : colors[i];
      });
    }
  };
}
if (typeof document !== 'undefined') boot({title: 'Larcociel — DMA Intro 5', controls: 'P : pause · M : son'}, createScene);
