import {boot, Layer, SliceStream, palette, indexAt, s16, word, clamp} from '../shared/runtime.js';

export async function createScene({assets, screen, sound, input}) {
  const [backgrounds, balls, font, message, order, initial, history, pal, raster] = await Promise.all([
    Promise.all(Array.from({length: 36}, (_, i) => assets.image(`background-${i}.png`))),
    Promise.all(Array.from({length: 16}, (_, i) => assets.image(`ball-${i}.png`))),
    assets.image('font.png'), assets.text('message.txt'), assets.text('font-order.txt'),
    assets.bytes('initial-motion.bin'), assets.bytes('initial-history.bin'), assets.bytes('palette.bin'), assets.bytes('raster.bin')
  ]);
  const state = {tick: 0, counter: s16(initial, 18), velocity: [0, 2, 4].map(i => s16(initial, i)),
    acceleration: [6, 8, 10].map(i => s16(initial, i)), position: [12, 14, 16].map(i => s16(initial, i)),
    history: Array.from({length: 66}, (_, i) => [0, 2, 4].map(j => s16(history, i * 6 + j))), center: [160, 80]};
  const stream = new SliceStream(Array.from(message, c => ({glyph: order.indexOf(c) < 0 ? 30 : order.indexOf(c)})), 36);
  const body = new Layer(), text = new Layer(), colors = palette(pal), rasters = palette(raster);
  return {
    state,
    pointer(x, y, type) { if (type === 'touch') state.center = [x, y]; },
    update() {
      const s = state;
      for (const [key, axis, delta] of [['ArrowLeft', 0, -1], ['ArrowRight', 0, 1], ['ArrowUp', 1, -1], ['ArrowDown', 1, 1]]) if (input.keys.has(key)) s.center[axis] = word(s.center[axis] + delta);
      s.history.shift();
      s.position = s.position.map((v, i) => word(v + s.velocity[i])); s.history.push([...s.position]);
      if (++s.counter === 3) {
        s.counter = 0;
        for (let i = 0; i < 3; i++) {
          s.velocity[i] = word(s.velocity[i] + s.acceleration[i]);
          if (Math.abs(s.velocity[i]) === [10, 7, 12][i]) s.acceleration[i] = -s.acceleration[i];
        }
      }
      s.tick++; stream.step(); body.clear(); text.clear();
      for (let i = 0; i < 6; i++) {
        const p = s.history[i * 11], depth = word(p[2] + 205);
        if (!depth) continue;
        const x = word(Math.trunc(word(p[0] - s.center[0]) * 205 / depth) + s.center[0]);
        const y = word(Math.trunc(word(p[1] - s.center[1]) * 205 / depth) + s.center[1]);
        body.blit(balls[clamp(p[2] >> 5, 0, 15)], x, y);
      }
      stream.draw(text, font, null, {columns: 31, x: 16});
    },
    render() {
      const bg = backgrounds[(state.tick - 1 + 36) % 36].data, b = body.pixels(), t = text.pixels();
      screen.paint((x, y, at) => {
        let i = indexAt(bg, at);
        if (b[at + 3]) i = (i >> 2) * 4 + indexAt(b, at);
        if (t[at + 3]) i = i % 8 + 8;
        if (i === 8 && y < 16) return rasters[y >> 1];
        if (i === 4 && y >= 49 && y < 93) return rasters[9 + ((y - 49) >> 2)];
        return colors[i];
      });
    }
  };
}
if (typeof document !== 'undefined') boot({title: 'Larcociel — DMA Intro 2', controls: 'Flèches : déplacer le centre de projection · P : pause · M : son'}, createScene);
