import {boot, Layer, clamp, mod} from '../shared/runtime.js';

export const oscillator = (t, amplitude, rate, spacing = 0, item = 0) => amplitude * Math.sin((t * 85 * rate + item * spacing) % (Math.PI * 2));
export function cubePosition(t) {
  return [oscillator(t, 60, .0323) + oscillator(t, 60, .02), oscillator(t, 50, .0321) + oscillator(t, 50, .0257),
    100 + oscillator(t, 50, .0357) + oscillator(t, 50, .0279)];
}
const vertices = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
const faces = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 4, 7, 3], [1, 2, 6, 5], [0, 1, 5, 4], [3, 7, 6, 2]];
const cellVertices = [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]];
const cellFaces = [[0, 3, 2, 1], [0, 1, 5, 4], [1, 2, 6, 5], [7, 6, 2, 3], [0, 4, 7, 3], [4, 5, 6, 7]];
const ribbonColors = ['#ffffff', '#ffffd0', '#ffffb0', '#ffff90', '#ffe080', '#ffc080', '#ffa080', '#ff8080', '#ff8080', '#d080a0', '#b080c0', '#9080e0', '#8090f0', '#80b0f0', '#80d0f0', '#90f0f0'];
const levels = [62, 161, 265, 377, 580, 774, 1155, 1575, 2260, 3088, 4570, 6233, 9330, 13187, 21220, 32767];

export async function createScene({assets, screen, sound}) {
  const [logoImage, ballImage, largeFont, smallFont, fontMap, largeText, smallText] = await Promise.all([
    assets.image('logo.png'), assets.image('ball.png'), assets.bytes('font-large.bin'), assets.bytes('font-small.bin'), assets.bytes('font-map.bin'), assets.text('large-message.txt'), assets.text('small-message.txt')
  ]);
  function transparent(im) {
    const layer = new Layer(im.width, im.height), pixels = layer.upload.data;
    pixels.set(im.data);
    for (let at = 0; at < pixels.length; at += 4) if (pixels[at] === 0 && pixels[at + 1] === 0 && pixels[at + 2] === 0) pixels[at + 3] = 0;
    layer.codef.contex.putImageData(layer.upload, 0, 0);
    return layer;
  }
  const logo = transparent(logoImage), ball = transparent(ballImage), state = {tick: 0, wireframe: false, showLoad: false, peaks: new Float64Array(80)};
  const cubeLayer = new Layer(640, 480), smallLayer = new Layer(640, 480), largeLayer = new Layer(640, 480);
  const cube = new window.codef3D(cubeLayer.codef, 0, 60, .1, 2000);
  const sourceColors = [0xfff0ff, 0xffe0ff, 0xffd0ff, 0xffc0ff, 0xffb0ff, 0xffa0ff];
  const cubeMaterials = [4, 0, 3, 1, 2, 5].map(i => new window.THREE.MeshBasicMaterial({color: sourceColors[i]}));
  cube.faces4(vertices.map(p => ({x: p[0] * 30, y: -p[1] * 30, z: -p[2] * 30})), faces.map((f, i) => ({p1: f[0], p2: f[1], p3: f[2], p4: f[3], params: cubeMaterials[i]})), false, false);
  const cubeGeometry = cube.group.children[0].geometry;
  const small = new window.codef3D(smallLayer.codef, 0, 60, .1, 2000), pool = [];
  const cellColors = [0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffff00, 0xff8000, 0x0000ff, 0x00ffff].map(c => new window.THREE.Color(c));
  function cell(number, x, y, z) {
    if (!pool[number]) {
      const geometry = new window.THREE.Geometry();
      cellVertices.forEach(p => geometry.vertices.push(new window.THREE.Vector3(p[0] * 10, p[1] * 10, -p[2] * 10)));
      cellFaces.forEach(f => { const face = new window.THREE.Face4(...f); face.vertexColors = f.map(i => cellColors[i]); geometry.faces.push(face); });
      geometry.computeCentroids(); geometry.computeFaceNormals();
      const mesh = new window.THREE.Mesh(geometry, new window.THREE.MeshBasicMaterial({vertexColors: window.THREE.VertexColors, wireframeLinewidth: 1.2}));
      mesh.doubleSided = true;
      small.group.add(mesh); pool.push(mesh);
    }
    const mesh = pool[number]; mesh.visible = true; mesh.position.set(x, y, -z); mesh.material.wireframe = state.wireframe;
  }
  function quad(layer, points, color, outline = state.wireframe) {
    const c = layer.codef.contex; c.beginPath(); points.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath();
    if (outline) { c.strokeStyle = color; c.lineWidth = 1.2; c.stroke(); } else { c.fillStyle = color; c.fill(); }
    layer.data = null;
  }
  function drawBands(t) {
    for (let i = 0; i < 16; i++) {
      const left = clamp(Math.round(232 + oscillator(t, 116, .019, .108333, i) + oscillator(t, 116, .0337, .0413, i)), 0, 463);
      const right = clamp(Math.round(232 + oscillator(t, 116, .023, .1125, i) + oscillator(t, 116, .0232, .0539, i)), 0, 463);
      quad(screen, [[0, left], [640, right], [640, right + 8], [0, left + 8]], ribbonColors[i]);
    }
  }
  function drawBalls(t) {
    for (let i = 0; i < 80; i++) {
      const x = Math.round(320 + oscillator(t, 151, .0242, .1254, i) + oscillator(t, 151, .0193, .253, i));
      const y = Math.round(240 + oscillator(t, 111, .0242, .1145, i) + oscillator(t, 111, .0203, .223, i));
      if (state.wireframe) quad(screen, [[x - 16, y - 16], [x + 16, y - 16], [x + 16, y + 16], [x - 16, y + 16]], '#ffffff');
      else screen.blit(ball, x - 16, y - 16);
    }
  }
  function drawLogo(t) {
    const shifts = Array.from({length: 11}, (_, i) => oscillator(t, 101.75, .0342, .2736, i) + oscillator(t, 101.75, .0143, .1144, i));
    const y = 188.5 + oscillator(t, 94.25, .0342) + oscillator(t, 94.25, .0443);
    if (state.wireframe) {
      for (let i = 0; i < 10; i++) quad(screen, [[203.5 + shifts[i], y + i * 10.3], [436.5 + shifts[i], y + i * 10.3], [436.5 + shifts[i + 1], y + (i + 1) * 10.3], [203.5 + shifts[i + 1], y + (i + 1) * 10.3]], '#eb87f5');
    } else {
      for (let row = 0; row < 80; row++) {
        const strip = row / 8, i = Math.floor(strip), dx = shifts[i] + (shifts[i + 1] - shifts[i]) * (strip - i);
        logo.source.drawPart(screen.codef, 203.5 + dx, y + row * 103 / 80, 0, row, 180, 1, 1, 0, 233 / 180, 103 / 80);
      }
    }
  }
  function drawLarge(t) {
    const length = largeText.length * 576, origin = 720 - mod(t * 510, length), context = screen.codef.contex;
    context.save(); context.beginPath(); context.rect(0, 20, 640, 480); context.clip();
    const gradient = context.createLinearGradient(0, 20, 0, 500), warm = clamp((t - 24) / 24, 0, 1);
    const vertexColors = [];
    for (let i = 0; i <= 30; i++) {
      const p = clamp(i / 30 + .07 * Math.sin(t * .11), 0, 1);
      const color = [Math.trunc(20 + 205 * p * p), Math.trunc(240 - 215 * p), Math.trunc(245 - 20 * p - 165 * warm * p)];
      vertexColors.push(color); gradient.addColorStop(i / 30, `rgb(${color.join(',')})`);
    }
    context.fillStyle = context.strokeStyle = gradient;
    const tint = new Uint32Array(480);
    for (let y = 20; y < 480; y++) {
      const pos = (y - 20 + .5) / 16, row = Math.floor(pos), f = pos - row;
      const color = vertexColors[row].map((v, i) => Math.round(v * (1 - f) + vertexColors[row + 1][i] * f));
      tint[y] = 0xff000000 | color[2] << 16 | color[1] << 8 | color[0];
    }
    largeLayer.rgba.fill(0);
    const first = Math.max(0, Math.floor((-origin - 640) / 576));
    for (let char = first; char < first + 5; char++) {
      const glyph = fontMap[(largeText[char % largeText.length].charCodeAt(0) & 255) * 2 + 1];
      if (largeText[char % largeText.length] === ' ' || glyph >= 48) continue;
      for (let row = 0; row < 30; row++) {
        const dx = oscillator(t, 32, .08, .19, row), dy = oscillator(t, 32, .103, .212, row), y = row * 16 + 20 + dy;
        for (let col = 0; col < 32; col++) {
          const at = glyph * 120 + (col >> 4) * 60 + Math.floor(col % 16 / 8) + row * 2;
          if (!(largeFont[at] >> (7 - col % 8) & 1)) continue;
          const x = origin + char * 576 + col * 18 - 20 + dx;
          if (x < -32 || x > 640) continue;
          if (state.wireframe) context.strokeRect(x, y, 16, 14);
          else {
            const left = Math.max(0, Math.ceil(x - .5)), right = Math.min(640, Math.ceil(x + 16 - .5));
            const top = Math.max(20, Math.ceil(y - .5)), bottom = Math.min(480, Math.ceil(y + 14 - .5));
            if (left < right) for (let line = top; line < bottom; line++) largeLayer.rgba.fill(tint[line], line * 640 + left, line * 640 + right);
          }
        }
      }
    }
    context.restore();
    if (!state.wireframe) { largeLayer.codef.contex.putImageData(largeLayer.upload, 0, 0); screen.blit(largeLayer); }
  }
  function drawSmall(t) {
    smallLayer.clear(); pool.forEach(mesh => { mesh.visible = false; });
    const length = smallText.length * 224, origin = 39 * 28 - mod(t * 595, length), first = Math.max(0, Math.floor((70 - origin) / 224));
    const globalY = 120 + oscillator(t, 70, .0067) + oscillator(t, 70, .0239), globalZ = 340 + oscillator(t, 30, .0097) + oscillator(t, 30, .0339);
    let count = 0;
    for (let char = first; char < first + 7; char++) {
      const glyph = smallText[char % smallText.length].charCodeAt(0) - 32;
      if (glyph < 0 || glyph >= 100) continue;
      for (let row = 0; row < 8; row++) {
        const y = globalY - row * 30 - oscillator(t, 30, .103, .222, row), z = globalZ + oscillator(t, 10, .1, .17, row);
        for (let col = 0; col < 8; col++) if (smallFont[glyph * 8 + row] >> (7 - col) & 1) {
          const x = origin + char * 224 + col * 28 - 470;
          if (x < -400 || x > 400) continue;
          cell(count++, x, y, z);
        }
      }
    }
    small.draw(); screen.blit(smallLayer);
  }
  function drawCube(t) {
    const [x, y, z] = cubePosition(t), angle = t * Math.PI / 2, sx = Math.sin(-angle), cx = Math.cos(-angle), sy = Math.sin(angle * 1.1), cy = Math.cos(angle * 1.1);
    vertices.forEach((p, i) => {
      const px = p[0] * 30, py = p[1] * 30, pz = p[2] * 30;
      const vx = cy * px + sy * sx * py + sy * cx * pz, vy = cx * py - sx * pz, vz = -sy * px + cy * sx * py + cy * cx * pz;
      cubeGeometry.vertices[i].set(x + vx, y - vy, -(200 + z + vz));
    });
    cubeGeometry.computeCentroids(); cubeGeometry.computeFaceNormals(); cubeMaterials.forEach(m => { m.wireframe = state.wireframe; m.wireframeLinewidth = 1.2; });
    cubeLayer.clear(); cube.draw(); screen.blit(cubeLayer);
  }
  return {
    state,
    key(code) { if (code === 'KeyW') state.wireframe = !state.wireframe; if (code === 'Tab') state.showLoad = !state.showLoad; },
    update() {
      state.tick++; const regs = sound.registers();
      const charge = (period, level) => { if (period < 1 || period >= 4095) return; const col = Math.round(10000 / period); if (col < 80) state.peaks[col] = Math.max(state.peaks[col], levels[level] * .003); };
      for (let ch = 0; ch < 3; ch++) {
        const volume = regs[8 + ch] & 31, envelope = !!(volume & 16), gated = (regs[7] >> ch & 1) && !envelope;
        charge(regs[ch * 2] | (regs[ch * 2 + 1] & 15) << 8, gated ? 0 : envelope ? 15 : volume & 15);
        if (envelope) charge((regs[11] | regs[12] << 8) >> 6, 15);
      }
      state.peaks.forEach((h, i) => { state.peaks[i] = Math.max(0, h - 3); });
    },
    render() {
      screen.codef.fill('#000000'); const t = state.tick / 50;
      if (t >= 4) drawBands(t - 4);
      if (t >= 12) drawBalls(t - 12);
      if (t >= 18) drawLogo(t - 18);
      if (t >= 36) drawLarge(t - 36);
      drawCube(t);
      if (t >= 26) drawSmall(t - 26);
      const c = screen.codef.contex;
      state.peaks.forEach((h, i) => {
        const gradient = c.createLinearGradient(0, 479 - h, 0, 479); gradient.addColorStop(0, '#ffff00'); gradient.addColorStop(1, '#ff0000');
        c.fillStyle = gradient; c.strokeStyle = gradient;
        if (state.wireframe) c.strokeRect(i * 8, 479 - h, 7, h); else c.fillRect(i * 8, 479 - h, 7, h);
      });
      if (state.showLoad) { c.fillStyle = '#3c143c'; c.fillRect(400, 10, 160, 12); c.fillStyle = '#b4ff50'; c.fillRect(400, 10, 158.4, 12); }
    }
  };
}
if (typeof document !== 'undefined') boot({title: 'Leonard / Oxygene — Old skool Demo', width: 640, height: 480, controls: 'W : fil de fer · Tab : témoin · P : pause · M : son'}, createScene);
