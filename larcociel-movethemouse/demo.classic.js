(function () {
'use strict';
const {boot, Layer, palette, stColor, indexAt, u16, u32, clamp, mod} = window.CODEFDemo;

async function createScene({assets, screen, sound, input}) {
  const [backgrounds, logo, moon, moons, meters, font, message, phase, initialLogo, pal, sky, floor] = await Promise.all([
    Promise.all(Array.from({length: 12}, (_, i) => assets.image(`background-${i}.png`))),
    assets.image('logo.png'), assets.image('moon.png'), assets.json('moons.json'),
    Promise.all(['meter-8-eeee.png', 'meter-8-7777.png', 'meter-4-eeee.png', 'meter-4-7777.png'].map(n => assets.image(n))),
    assets.bytes('font.bin'), assets.bytes('message.txt'), assets.bytes('font-phase.bin'), assets.bytes('logo-state.bin'),
    assets.bytes('palette.bin'), assets.bytes('sky-palette.bin'), assets.bytes('floor-colors.bin')
  ]);
  const state = {tick: 0, letter: 0, column: 32, floor: 0, floorHold: 100, colorHold: 0, direction: 1, colorDirection: 1,
    mouseX: 96, logo: Array.from({length: 12}, (_, i) => u16(initialLogo, 4 + i * 2)), phase: Array.from(phase),
    glyph: new Uint32Array(16), rows: new Uint8Array(640), colorCursor: 0};
  const body = new Layer(), text = new Layer(320, 16), shadow = new Layer();
  const colors = palette(pal), skies = palette(sky), floorColors = new Uint32Array(68), textIndices = new Uint8Array(5120);
  return {
    state,
    pointer(x, y, type) { if (type === 'touch') state.mouseX = clamp(x - 72, 0, 176); },
    update() {
      const s = state; s.tick++; s.logo.copyWithin(1, 0, 11);
      s.mouseX = clamp(s.mouseX + input.dx, 0, 176); s.logo[0] = s.mouseX;
      if (--s.floorHold < 0) { s.floorHold = 200; s.direction = -s.direction; }
      if (--s.colorHold < 0) { s.colorHold = 400; s.colorDirection = -s.colorDirection; }
      s.floor = mod(s.floor + s.direction, 12);
      if (s.column === 32) {
        s.column = 0; const glyph = message[s.letter] - 32; s.letter = (s.letter + 1) % message.length;
        for (let row = 0; row < 16; row++) s.glyph[row] = glyph >= 0 && glyph < 96 ? u32(font, glyph * 64 + row * 4) : 0;
      }
      for (let row = 0; row < 16; row++) {
        let shift = 8; s.phase[row] += 30 - row * 2;
        if (s.phase[row] >= 75) { s.phase[row] -= 75; shift = 7; }
        const at = row * 40;
        for (let i = 0; i < 39; i++) s.rows[at + i] = s.rows[at + i] << shift | s.rows[at + i + 1] >>> (8 - shift);
        s.rows[at + 39] = s.rows[at + 39] << shift | s.glyph[row] >>> (32 - shift); s.glyph[row] <<= shift;
      }
      s.column += 8; body.clear(); shadow.clear();
      s.logo.forEach((x, row) => body.blit(logo, x, 32 - row * 2, 0, 11 - row, 144, 1));
      moons.forEach(p => body.blit(moon, (p[0] + s.tick * 4) % 288, p[1]));
      const regs = sound.registers();
      for (let ch = 0; ch < 3; ch++) for (let cell = 0; cell <= (regs[8 + ch] & 15) >> 1; cell++) {
        const bank = ch === 1 ? 2 : 0;
        body.blit(meters[bank], 144 + cell * 16, 73 + ch * 2); body.blit(meters[bank + 1], 144 - cell * 16, 73 + ch * 2);
      }
      for (let row = 0; row < 16; row++) for (let x = 0; x < 320; x++) textIndices[row * 320 + x] = s.rows[row * 40 + (x >> 3)] >> (7 - x % 8) & 1;
      text.indices(textIndices, true);
      for (let row = 0; row < 16; row += 2) shadow.blit(text, 0, 184 + row, 0, row, 320, 1);
      s.colorCursor = mod(s.colorCursor + s.colorDirection, floor.length / 4);
      let source = s.colorCursor, acceleration = 0, step = 5;
      for (let row = 0; row < 34; row++) {
        while (true) { acceleration += step; if (acceleration >= 25) { acceleration -= 25; step++; break; } source++; }
        source %= floor.length / 4;
        for (let bank = 0; bank < 2; bank++) floorColors[row * 2 + bank] = stColor(u16(floor, source * 4 + bank * 2));
        source++;
      }
    },
    render() {
      const bg = backgrounds[state.floor].data, b = body.pixels(), t = text.pixels(), sh = shadow.pixels();
      screen.paint((x, y, at) => {
        let i = indexAt(bg, at);
        if (b[at + 3]) {
          const v = indexAt(b, at);
          if (v < 4) i = (i >> 2) * 4 + v;
          else if (v === 4) i += 4 - ((i >> 2) % 2) * 4;
          else i = i % 8 + 8;
        }
        if (y >= 177 && y < 193) { const off = ((y - 177) * 320 + x) * 4; if (t[off + 3]) i = i - i % 2 + indexAt(t, off); }
        if (sh[at + 3]) i += 2 - ((i >> 1) % 2) * 2;
        if (y >= 132 && (i === 8 || i === 12)) return floorColors[clamp((y - 132) >> 1, 0, 33) * 2 + (i === 12 ? 1 : 0)];
        return y >= 81 ? skies[i] : colors[i];
      });
    }
  };
}
if (typeof document !== 'undefined') boot({title: 'Larcociel — Move The Mouse!!!', controls: 'Souris / doigt : déformer le logo · P : pause · M : son'}, createScene);

Object.assign(window.CODEFDemo ||= {}, {createScene});
})();
