import {boot, Layer, SliceStream, palette, stColor, indexAt, u16} from '../shared/runtime.js';

export async function createScene({assets, screen, sound}) {
  const [font, titles, message, bounce, pal, vu, scrollRaster] = await Promise.all([
    assets.image('font.png'), Promise.all(Array.from({length: 18}, (_, i) => assets.image(`title-${i}.png`))),
    assets.bytes('message.bin'), assets.bytes('bounce.bin'), assets.bytes('palette.bin'), assets.bytes('raster-vu.bin'), assets.bytes('raster-scroll.bin')
  ]);
  const state = {tick: 0, mode: 0, bounceCursor: -1};
  const tokens = [{glyph: -1, width: 24}, ...Array.from(message, c => c === 254 ? {control: 'bounce'} : {glyph: c - 32}), {control: 'normal'}];
  const stream = new SliceStream(tokens, 40, {loopStart: 1});
  const main = new Layer(320, 240), stage = new Layer(320, 240), colors = palette(pal);
  const background = new Uint32Array(240), ink = new Uint32Array(240), wave = [5, 5, 5, 4, 4, 3, 2, 1, 1, 0, 0, 0, 1, 1, 2, 3, 4, 4];
  for (let y = 0; y < 240; y++) {
    let bg = 7, fg = 0x777;
    if (y >= 34 && y < 68) bg = u16(vu, (y - 34) * 2);
    if (y >= 75 && y < 153) { const row = (y - 75) >> 1; bg = u16(scrollRaster, row * 4); fg = u16(scrollRaster, row * 4 + 2); }
    background[y] = stColor(bg); ink[y] = stColor(fg);
  }
  return {
    state,
    update() {
      state.tick++; stream.step(control => { state.mode = control === 'bounce' ? 1 : 0; });
      if (state.mode) state.bounceCursor = (state.bounceCursor + 1) % (bounce.length / 2);
      main.clear(); stage.clear();
      stream.draw(main, font, slot => ({x: slot * 8, y: state.mode ? u16(bounce, state.bounceCursor * 2) : 100 + wave[slot % 18]}), {columns: 10, glyphHeight: 25});
      stage.blit(main);
      if (!state.mode) for (let row = 0; row < 31; row++) stage.blit(main, 0, 190 - row * 2, 0, 100 + row, 320, 1);
      stage.blit(titles[(state.tick - 1) % 18], 96, 220);
      const regs = sound.registers();
      for (let ch = 0; ch < 3; ch++) for (let cell = 0; cell <= (regs[8 + ch] & 15); cell++) stage.rect(cell * 16, 40 + ch * 10, 14, 1, 1);
    },
    render() {
      const p = stage.pixels();
      screen.paint((x, y, at) => { const i = indexAt(p, at); return i === 0 ? background[y] : i === 1 ? ink[y] : colors[i]; });
    }
  };
}
if (typeof document !== 'undefined') boot({title: 'Mad of DMA — The Nitro Intro', height: 240, controls: 'P : pause · M : son'}, createScene);
