import {boot, palette, indexAt, stColor, mod, clamp} from '../shared/runtime.js';

export async function createScene({assets, screen}) {
  const [background, mask, font, message, pal] = await Promise.all([
    assets.image('background.png'), assets.image('palette-mask.png'), assets.image('font.png'), assets.text('message.txt'), assets.bytes('palette.bin')
  ]);
  const colors = palette(pal), state = {tick: 0};
  const cells = new Uint32Array(35 * 8);
  return {
    state,
    update() {
      state.tick++; cells.fill(0);
      const origin = 41 - state.tick;
      for (let col = 0; col < 35; col++) {
        const pos = col - origin;
        if (pos < 0) continue;
        const glyph = message[Math.floor(mod(pos, message.length * 6 + 6) / 6)];
        const g = glyph ? glyph.charCodeAt(0) - 64 : -1;
        if (g < 0 || g >= 27) continue;
        for (let row = 0; row < 7; row++) {
          const at = (row * font.width + g * 6 + mod(pos, 6)) * 4;
          cells[row * 35 + col] = (0xff000000 | font.data[at + 2] << 16 | font.data[at + 1] << 8 | font.data[at]) >>> 0;
        }
      }
    },
    render() {
      screen.paint((x, y, at) => {
        const col = clamp(Math.floor((x - 16) / 8), 0, 34), row = Math.min(7, Math.floor(y % 25 / 3));
        const color = cells[row * 35 + col];
        return mask.data[at + 3] > 127 && color ? color : colors[indexAt(background.data, at)] ?? stColor(0);
      });
    }
  };
}
if (typeof document !== 'undefined') boot({title: 'Larcociel — DMA Intro 4', controls: 'P : pause · M : son'}, createScene);
