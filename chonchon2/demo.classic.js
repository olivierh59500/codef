(function () {
'use strict';
const {boot, Layer, palette, indexAt, u16, s16, u32, put16, put32} = window.CODEFDemo;

class Chonchon2Clock {
  constructor(background, font, message, profile, panel, pathA, pathB) {
    Object.assign(this, {background, font, message, profile, panel, paths: [pathA, pathB], tick: 0, profileCursor: 0, messageCursor: 0,
      glyphColumn: 0, glyphCounter: 4, scrollY: 70, oldY: 0, spriteCursor: [0, 0], captionCursor: 0, captionHold: 1, captionWait: 100, captionShift: 0});
    this.screen = new Uint8Array(32000); this.glyph = new Uint8Array(184); this.ribbon = Array.from({length: 23}, () => new Uint8Array(320)); this.poses = [];
    this.step(); this.tick = 0;
  }
  pixel(x, y, v) {
    const at = y * 160 + (x >> 4) * 8, mask = 1 << (15 - x % 16);
    for (let p = 0; p < 4; p++) put16(this.screen, at + p * 2, (u16(this.screen, at + p * 2) & ~mask) | ((v >> p & 1) ? mask : 0));
  }
  step() {
    const c = this; c.tick++; c.screen.set(c.background);
    if (c.profileCursor + 6 > c.profile.length || s16(c.profile, c.profileCursor) < 0) c.profileCursor = 0;
    c.oldY = c.scrollY; c.scrollY = Math.floor(u16(c.profile, c.profileCursor) / 160); c.profileCursor += 6;
    if (c.glyphCounter === 4) {
      c.glyphCounter = 0;
      if (c.messageCursor + 4 > c.message.length) c.messageCursor = 0;
      if (s16(c.message, c.messageCursor) < 0) { c.glyphCounter = 2; c.messageCursor += 4; }
      const off = u32(c.message, c.messageCursor); c.messageCursor += 4; c.glyph.fill(0);
      if (off + 184 <= c.font.length) c.glyph.set(c.font.subarray(off, off + 184));
    }
    for (let row = 0; row < 23; row++) {
      c.ribbon[row].copyWithin(0, 8);
      for (let x = 0; x < 8; x++) {
        let i = 0;
        for (let plane = 0; plane < 2; plane++) { const at = row * 8 + (c.glyphColumn >> 1) * 4 + plane * 2 + c.glyphColumn % 2; i |= (c.glyph[at] >> (7 - x) & 1) << plane; }
        c.ribbon[row][312 + x] = i;
      }
      const y = c.scrollY + row;
      if (y >= 0 && y < 200) for (let x = 0; x < 320; x++) c.pixel(x, y, c.ribbon[row][x]);
    }
    c.glyphColumn = (c.glyphColumn + 1) % 4; c.glyphCounter++;
    for (let i = 0; i < 2; i++) {
      let p = c.spriteCursor[i];
      if (p + 4 > c.paths[i].length || s16(c.paths[i], p) < 0) p = 0;
      const off = u16(c.paths[i], p); c.poses[i] = {x: Math.floor(off % 160 / 8) * 16 + Math.floor(off % 8 / 4) * 8, y: Math.floor(off / 160), half: s16(c.paths[i], p + 2) < 0}; c.spriteCursor[i] = p + 4;
    }
    if (c.panelPattern?.length >= 69 * 160 && c.captionCursor + 4 < c.panel.length) {
      const y = u16(c.panel, c.captionCursor), rows = u16(c.panel, c.captionCursor + 2);
      for (let row = 0; row <= rows; row++) {
        const yy = y + row; if (yy < 0 || yy >= 69) continue;
        const src = yy * 160 + c.captionShift * 16, dst = yy * 160 + 0x200;
        for (let k = 0; k < 16; k++) {
          if (src + k < c.panelPattern.length && dst + k < 32000) c.screen[dst + k] = c.panelPattern[src + k];
          if (src + k < c.panelPattern.length && dst + 80 + k < 32000) c.screen[dst + 80 + k] = c.panelPattern[src + k];
        }
      }
    }
    if (--c.captionWait <= 0) {
      c.captionShift = (c.captionShift + 1) % 10;
      if (c.captionShift === 0 && --c.captionHold < 0) {
        c.captionCursor += 6;
        if (c.captionCursor + 6 > c.panel.length || s16(c.panel, c.captionCursor) < 0) c.captionCursor = 0;
        c.captionHold = u16(c.panel, c.captionCursor + 4);
      }
      c.captionWait = 2;
    }
  }
}
async function createScene({assets, screen, sound}) {
  const native = await Promise.all(['background.bin', 'font.bin', 'message.bin', 'scroll-profile.bin', 'panel-script.bin', 'sprite-a-path.bin', 'sprite-b-path.bin'].map(n => assets.bytes(n)));
  const clock = new Chonchon2Clock(...native);
  const [pattern, sprites, pal, base, program, foreground, material] = await Promise.all([
    assets.bytes('panel-pattern.bin'), Promise.all(['sprite-a.png', 'sprite-b.png'].map(n => assets.image(n))), assets.bytes('palette.bin'),
    assets.bytes('raster-background.bin'), assets.bytes('raster-program.bin'), assets.bytes('raster-base.bin'), assets.bytes('raster-scroll.bin')
  ]);
  clock.panelPattern = pattern;
  const stage = new Layer(), colors = palette(pal); let track = 0;
  const bg = new Uint8Array(400), fg = new Uint8Array(400); let bgColors = palette(base), fgColors = palette(foreground);
  const select = n => { track = n; return sound.select(`music-${n + 1}.ym`); };
  return {
    clock,
    key(code) { if (/^F[1-7]$/.test(code)) select(Number(code.slice(1)) - 1).catch(console.error); },
    click() { select((track + 1) % 7).catch(console.error); },
    update() {
      clock.step(); bg.set(base); fg.set(foreground);
      const count = program.length / 180; let frame = clock.tick;
      if (frame >= count) frame = 25 + (frame - count) % Math.max(1, count - 25);
      bg.set(program.subarray(frame * 180, frame * 180 + 180), 136);
      const at = clock.oldY * 2; if (at >= 0 && at + material.length <= 400) fg.set(material, at);
      bgColors = palette(bg); fgColors = palette(fg);
      const regs = sound.registers();
      for (let ch = 0; ch < 3; ch++) for (let row = 0; row < 7; row++) for (let cell = 0; cell <= (regs[8 + ch] & 15); cell++) {
        const off = 0x6868 + ch * 0x5a0 + row * 160 + cell * 8;
        if (off + 4 <= 32000) put32(clock.screen, off, 0x0000ffff);
      }
      stage.planar(clock.screen);
      clock.poses.forEach((p, i) => {
        for (let row = 0; row < 34; row++) { const sy = i === 1 && row >= 2 && row < 32 ? 2 + (clock.tick + row - 2) % 192 : row; stage.blit(sprites[i], p.x, p.y + row, 0, sy, 80, 1); }
      });
    },
    render() { const p = stage.pixels(); screen.paint((x, y, at) => { const i = indexAt(p, at); return i === 0 ? bgColors[y] : i === 2 ? fgColors[y] : colors[i]; }); }
  };
}
if (typeof document !== 'undefined') boot({title: 'Chon-Chon of DMA — Chonchon 2', music: 'music-1.ym', controls: 'F1–F7 / clic : musique · P : pause · M : son'}, createScene);

Object.assign(window.CODEFDemo ||= {}, {Chonchon2Clock, createScene});
})();
