(function () {
'use strict';
const {boot, Layer, palette, words, stColor, indexAt, word, mod, clamp} = window.CODEFDemo;

function rotate(a, b, cosine, sine, subtract) {
  return subtract ? [word(a * cosine - b * sine) >> 7, word(b * cosine + a * sine) >> 7]
    : [word(a * cosine + b * sine) >> 7, word(b * cosine - a * sine) >> 7];
}
function project(value, center, depth) {
  const n = word(value - center), numerator = (n & 0xffff0000) | (n << 8 & 0xffff);
  if (!depth) return -32768;
  const quotient = Math.trunc(numerator / depth);
  return word((quotient < -32768 || quotient > 32767 ? word(numerator) : word(quotient)) + center);
}
async function createScene({assets, screen}) {
  const [scenes, sine, balls, background, font, message, palA, palB, raster0, raster8] = await Promise.all([
    assets.json('objects.json'), assets.bytes('sine.bin'), Promise.all(Array.from({length: 16}, (_, i) => assets.image(`ball-${i}.png`))),
    assets.image('background.png'), assets.image('font.png'), assets.bytes('message.txt'), assets.bytes('palette.bin'), assets.bytes('palette-b.bin'), assets.bytes('raster-0.bin'), assets.bytes('raster-8.bin')
  ]);
  const state = {tick: 0, sceneTick: 0, scene: 0, frame: 0, angles: [0, 0, 0], points: [], row: 14, column: 0, letter: 0};
  const stage = new Layer(), text = [new Layer(), new Layer()]; let front = 0;
  const banks = [words(palA), words(palB)], colors = palette(palA), r0 = palette(raster0), r8 = palette(raster8);
  const gold = [0, 0x530, 0x630, 0x640, 0x750, 0x760, 0x770, 0x420, 0x320, 0x220, 0x100, 0x700, 0x700, 0x700, 0x700, 0x777].map(stColor);
  const trig = angle => [((sine[mod(angle, 360)] - 128) << 24) >> 24, ((sine[mod(90 - angle, 360)] - 128) << 24) >> 24];
  function geometry() {
    const s = state, transition = s.tick >= 1000 && s.sceneTick < 16;
    if (transition && s.sceneTick !== 8) { s.tick++; s.sceneTick++; return; }
    const scene = scenes[s.scene], [cy, sy] = trig(s.angles[0]), [cx, sx] = trig(s.angles[1]), [cz, sz] = trig(s.angles[2]);
    s.points = scene.frames[s.frame].map(p => {
      let [x, y, z] = p.slice(0, 3).map((v, i) => word(v + scene.translation[i])); const pivot = scene.pivot;
      [x, z] = rotate(word(x - pivot[0]), word(z - pivot[2]), cy, sy, true); x = word(x + pivot[0]); z = word(z + pivot[2]);
      [y, z] = rotate(word(y - pivot[1]), word(z - pivot[2]), cx, sx, false); y = word(y + pivot[1]); z = word(z + pivot[2]);
      [x, y] = rotate(word(x - pivot[0]), word(y - pivot[1]), cz, sz, false); x = word(x + pivot[0]); y = word(y + pivot[1]);
      return {x: project(x, 160, word(z + 256)), y: project(y, 100, word(z + 256)), z, material: p[3]};
    }).sort((a, b) => b.z - a.z);
    s.frame = (s.frame + 1) % scene.frames.length;
    if (!transition) {
      for (let i = 0; i < 3; i++) {
        s.angles[i] = word(s.angles[i] + scene.angular_step[i < 2 ? 1 - i : i]);
        if (s.angles[i] >= 359) s.angles[i] -= 359;
        if (s.angles[i] < 0) s.angles[i] += 359;
      }
    }
    s.tick++; s.sceneTick++;
    if (s.sceneTick === 1000) { s.scene = (s.scene + 1) % scenes.length; s.sceneTick = 0; s.frame = 0; s.angles = [0, 0, 0]; }
  }
  return {
    state,
    update() {
      geometry(); const s = state, bank = s.scene % 2;
      banks[bank].forEach((original, i) => {
        let w = original;
        if (s.tick >= 1000 && s.sceneTick <= 16) {
          if (s.sceneTick <= 8) { w = banks[1 - bank][i]; const dark = s.sceneTick; w = Math.max(0, (w >> 8 & 7) - dark) << 8 | Math.max(0, (w >> 4 & 7) - dark) << 4 | Math.max(0, (w & 7) - dark); }
          else { const bright = s.sceneTick - 8; w = Math.min(w >> 8 & 7, bright) << 8 | Math.min(w >> 4 & 7, bright) << 4 | Math.min(w & 7, bright); }
        }
        colors[i] = stColor(w);
      });
      stage.clear();
      for (const p of s.points) if (p.x >= 0 && p.x < 300 && p.y >= 0 && p.y < 151) stage.blit(balls[p.material], p.x, p.y);
      const target = 1 - front, x = s.column * 32; text[target].copy(text[front]);
      text[target].copy(text[front], x, 2, x, 0, 32, 30);
      const glyph = message[s.letter] - 32;
      if (glyph >= 0 && glyph < 61) text[target].copy(font, x, 0, glyph * 32, s.row * 2, 32, 2);
      if (--s.row < 0) { s.row = 14; s.letter = (s.letter + 1) % message.length; s.column = (s.column + 1) % 10; }
      front = target;
    },
    render() {
      const p = stage.pixels(), t = text[front].pixels();
      screen.paint((x, y, at) => {
        if (y >= 168) return gold[indexAt(t, ((y - 168) * 320 + x) * 4)];
        const i = clamp(indexAt(p, at), 0, 7) + indexAt(background.data, at);
        if (i === 0 && y >= 150) return r0[clamp(y - 150, 0, 16)];
        if (i === 8) return r8[clamp(Math.floor((y - 2) / 2), 0, 66)];
        return colors[i];
      });
    }
  };
}
if (typeof document !== 'undefined') boot({title: 'Larcociel — 1st Vectorball Demo On The ST', controls: '14 objets en séquence · P : pause · M : son'}, createScene);

Object.assign(window.CODEFDemo ||= {}, {rotate, project, createScene});
})();
