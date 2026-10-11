(function () {
'use strict';
const {boot, Layer, SliceStream, palette, stColor, indexAt, u16, s16, u32, s32, word, mod} = window.CODEFDemo;

async function createScene({assets, screen, sound}) {
  const [bg, logo, sprite, pillars, font, message, profile, initial, path, program, land, raster, pairs, meter, pal] = await Promise.all([
    assets.image('background.png'), assets.image('logo.png'), assets.image('sprite.png'),
    Promise.all(Array.from({length: 4}, (_, i) => assets.image(`pillar-${i}.png`))),
    assets.image('font.png'), assets.bytes('message.txt'), assets.json('scroll-profile.json'), assets.bytes('initial-sprites.bin'),
    assets.bytes('logo-path.bin'), assets.bytes('landscape-script.bin'), assets.bytes('landscape.bin'), assets.bytes('raster-data.bin'),
    assets.bytes('raster-pairs.bin'), assets.bytes('meter-colors.bin'), assets.bytes('palette.bin')
  ]);
  const state = {tick: 0, x: s16(initial), y: s16(initial, 64), vx: s16(initial, 128), vy: s16(initial, 130), ax: s16(initial, 132), ay: s16(initial, 134),
    xs: Array.from({length: 32}, (_, i) => s16(initial, i * 2)), ys: Array.from({length: 32}, (_, i) => s16(initial, 64 + i * 2)),
    logo: Array(32).fill(64), cursor: 0, landscape: 4000, sceneCounter: 1000, sceneCursor: 0};
  const stream = new SliceStream(Array.from(message, c => ({glyph: c >= 32 && c < 128 ? c - 32 : 0})), 40);
  const body = new Layer(), text = new Layer(), colors = palette(pal);
  for (const [i, w] of [[4, 0x667], [5, 0x667], [6, 0x400], [12, 0x223], [14, 0x400]]) colors[i] = stColor(w);
  const rows = new Uint32Array(200), ink = new Uint32Array(200);
  return {
    state,
    update() {
      const s = state; s.tick++;
      s.xs.copyWithin(1, 0, 28); s.ys.copyWithin(1, 0, 28);
      s.x = word(s.x + s.vx); s.y = word(s.y + s.vy); s.xs[0] = s.x; s.ys[0] = s.y;
      if (s.tick % 2) {
        s.vx = word(s.vx + s.ax); s.vy = word(s.vy + s.ay);
        if (Math.abs(s.vx) === 11) s.ax = -s.ax;
        if (Math.abs(s.vy) === 6) s.ay = -s.ay;
      }
      s.logo.copyWithin(1, 0, 31);
      if (s.cursor + 2 > path.length || s16(path, s.cursor) < 0) s.cursor = 0;
      s.logo[0] = s16(path, s.cursor); s.cursor += 2;
      if (--s.sceneCounter < 0) {
        s.sceneCursor += 8;
        if (s.sceneCursor + 8 > program.length || u32(program, s.sceneCursor) === 0xffff) s.sceneCursor = 0;
        s.sceneCounter = u32(program, s.sceneCursor);
      }
      s.landscape = mod(s.landscape + s32(program, s.sceneCursor + 4), 100000);
      stream.step(); body.clear(); text.clear();
      s.logo.forEach((x, row) => body.blit(logo, x, 40 - row, 0, 31 - row, 208, 1));
      for (let i = 27; i >= 0; i--) body.blit(sprite, s.xs[i], s.ys[i]);
      const phase = (s.tick - 1) % 319;
      if (phase < 68) body.blit(pillars[phase % 4], Math.floor(phase / 4) * 16, 171);
      stream.draw(text, font, slot => ({x: slot * 8, y: profile[slot]}));
      const regs = sound.registers(), meters = new Uint16Array(48);
      for (let ch = 0; ch < 3; ch++) {
        const blank = 15 - Math.max(0, (regs[8 + ch] & 15) - 1);
        for (let row = blank; row < 16; row++) meters[row * 3 + ch] = u16(meter, (ch * 16 + row - blank) * 2);
      }
      for (let y = 0; y < 200; y++) {
        let w = 0x223;
        if (y >= 100 && y < 196) w = meters[(y - 100) >> 1];
        if (y < 100) w = u16(raster, y * 4 % raster.length);
        rows[y] = stColor(w); ink[y] = stColor(y < 100 ? u16(pairs, y * 4 + 2) : 0x234);
      }
    },
    render() {
      const b = body.pixels(), t = text.pixels();
      screen.paint((x, y, at) => {
        let i = indexAt(bg.data, at);
        if (y >= 100) { const off = (state.landscape + (y - 100) * 40 + (x >> 4) * 2) % land.length; i = 4 + ((land[off] << 8 | land[(off + 1) % land.length]) >> (15 - x % 16) & 1) * 8; }
        if (b[at + 3]) { const v = indexAt(b, at); if (v < 4) i = (i >> 2) * 4 + v; }
        if (t[at + 3]) i = i - i % 2 + 1;
        return i === 0 ? rows[y] : y < 100 && i === 1 ? ink[y] : colors[i];
      });
    }
  };
}
if (typeof document !== 'undefined') boot({title: 'Larcociel — DMA Intro 3', controls: 'P : pause · M : son'}, createScene);

Object.assign(window.CODEFDemo ||= {}, {createScene});
})();
