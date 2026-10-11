import {boot, Layer, palette, stColor, indexAt, u16, u32, s32, clamp} from '../shared/runtime.js';

export async function createScene({assets, screen, sound}) {
  const [sprites, logos, title, font, smallFont, forms, message, top, bottom, offsets, spritePalettes, raster, titlePal] = await Promise.all([
    Promise.all(Array.from({length: 10}, (_, i) => assets.image(`sprite-${i + 1}.png`))), assets.image('logos.png'), assets.image('title.png'), assets.image('font-main.png'), assets.image('font-small.png'),
    Promise.all(Array.from({length: 9}, (_, i) => assets.bytes(`form-${i + 1}.bin`))),
    assets.bytes('message-main.bin'), assets.bytes('message-top.bin'), assets.bytes('message-bottom.bin'), assets.bytes('raster-offsets.bin'), assets.bytes('sprite-palettes.bin'), assets.bytes('raster-colors.bin'), assets.bytes('title-palette.bin')
  ]);
  const state = {tick: 0, form: 8, sprite: 4, front: 0, cursor: 0, slice: 8, glyph: 0, pause: 0, columns: Array(82).fill(null), peaks: new Uint8Array(16)};
  const counts = [6, 6, 6, 1, 1, 2, 6, 3, 3], cursors = Array(9).fill(0);
  const trajectories = forms.map(b => Array.from({length: b.length / 8}, (_, i) => { const off = u32(b, i * 8), shift = u32(b, i * 8 + 4); return {x: Math.floor(off % 160 / 8) * 16 + shift / 768, y: Math.floor(off / 160)}; }));
  const profile = Array.from({length: offsets.length / 4}, (_, i) => s32(offsets, i * 4) / 160);
  const buffers = Array.from({length: 4}, () => { const layer = new Layer(320, 270); layer.fill(); layer.blit(logos); return layer; });
  const text = new Layer(320, 270), titleColors = palette(titlePal), rows = Array.from({length: 270}, () => []);
  function setPalette() {
    for (let y = 0; y < 270; y++) {
      const p = [0x114, 0x100, 0x200, 0x310, 0x420, 0x430, 0x540, 0x663, 0x212, 0x223, 0x234, 0x444, 0x212, 0x323, 0x433, 0x644];
      if (y >= 30) {
        for (let i = 0; i < 8; i++) p[i] = u16(spritePalettes, state.sprite * 16 + i * 2);
        for (let i = 8; i < 16; i++) p[i] = 0x212;
        if (y < 40) p[0] = u16(raster, (y - 30) * 2);
        else if (y < 223) p[0] = 0x033;
        else if (y < 233) p[0] = u16(raster, (y - 223 + 10) * 2);
        else { p[0] = 0x030; p[1] = y >= 235 ? u16(raster, 40 + Math.min(27, (y - 235) >> 1) * 2) : 0x300; }
      }
      rows[y] = p.map(stColor);
    }
  }
  function clear() { for (const b of buffers) b.rect(0, 30, 320, 200); cursors[state.form] = 0; }
  const scene = {
    state, started: false,
    start() { scene.started = true; },
    selectForm(n) { state.form = n; clear(); },
    selectSprite(n) { state.sprite = n; clear(); setPalette(); },
    key(code) {
      if (code === 'Enter' || code === 'Space') scene.start();
      else if (/^Digit[1-9]$/.test(code)) scene.selectForm(Number(code.slice(5)) - 1);
      else if (/^F([1-9]|10)$/.test(code)) scene.selectSprite(Number(code.slice(1)) - 1);
    },
    click(x) { if (!scene.started) scene.start(); else if (x < 160) scene.selectForm((state.form + 1) % 9); else scene.selectSprite((state.sprite + 1) % 10); },
    update() {
      if (!scene.started) return;
      const s = state; s.tick++; s.front = (s.front + 1) % 4; const buf = buffers[s.front], poses = trajectories[s.form];
      for (let i = 0; i < counts[s.form]; i++) { const p = poses[cursors[s.form]]; cursors[s.form] = (cursors[s.form] + 1) % poses.length; buf.blit(sprites[s.sprite], p.x, p.y); }
      if (s.pause > 0) s.pause--;
      else {
        if (s.slice === 8) {
          if (s.cursor >= message.length || message[s.cursor] === 0) s.cursor = 0;
          const c = message[s.cursor++];
          if (c === 37) s.pause = 50; else { s.glyph = clamp(c - 32, 0, 58); s.slice = 0; }
        }
        if (!s.pause) { s.columns.shift(); s.columns.push({glyph: s.glyph, slice: s.slice++}); }
      }
      text.clear();
      s.columns.forEach((c, slot) => {
        if (!c) return;
        const x = slot * 4 - 8, col = clamp(Math.trunc(x / 8), 0, 39), y = 120 + profile[(s.tick - 1 + col) % profile.length];
        text.blit(font, x, y, c.glyph % 16 * 32 + c.slice * 4, Math.floor(c.glyph / 16) * 16, 4, 16);
      });
      [top, bottom].forEach((msg, lane) => {
        const position = s.tick % (msg.length * 8), first = Math.floor(position / 8);
        for (let i = 0; i < 42; i++) {
          const glyph = clamp(msg[(first + i) % msg.length] - 32, 0, 127);
          text.blit(smallFont, i * 8 - position % 8, lane ? 223 : 31, glyph % 16 * 8, Math.floor(glyph / 16) * 7, 8, 7);
        }
      });
      const regs = sound.registers();
      for (let ch = 0; ch < 3; ch++) { const period = regs[ch * 2] | (regs[ch * 2 + 1] & 15) << 8; s.peaks[period % 16] = Math.max(s.peaks[period % 16], (regs[8 + ch] & 15) * 2); }
      for (let i = 0; i < 16; i++) s.peaks[i] = Math.max(0, s.peaks[i] - 1);
      buf.rect(32, 228, 256, 34);
      s.peaks.forEach((h, i) => buf.rect(32 + i * 16, 260 - h, 15, h + 1, 1));
    },
    render() {
      if (!scene.started) { screen.paint((x, y) => y >= 35 && y < 35 + title.height ? titleColors[indexAt(title.data, ((y - 35) * title.width + x) * 4)] : 0xff000000); return; }
      const b = buffers[state.front].pixels(), t = text.pixels();
      screen.paint((x, y, at) => { let i = indexAt(b, at); if (y >= 30 && y < 233) i = i % 8 + (t[at + 3] > 127 ? 8 : 0); return rows[y][i]; });
    }
  };
  setPalette(); return scene;
}
if (typeof document !== 'undefined') boot({title: 'Jinx of DMA — Never Mind', height: 270, controls: 'Entrée / clic : démarrer · 1–9 : trajectoire · F1–F10 : sprite · Clic gauche/droite : suivant · P : pause · M : son'}, createScene);
