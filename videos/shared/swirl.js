/*
 * Deterministic Berrypad pixel swirl. The same field as the website hero, but
 * drawn from a time value instead of a clock, so every frame of a render is
 * reproducible. Call BerrySwirl.mount(canvas) once, then draw(t) from a
 * timeline onUpdate.
 */
window.BerrySwirl = (function () {
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function mount(canvas, opts) {
    const o = Object.assign({ cell: 4, seed: 7, quietX: 0.5, quietR: 0.0, gain: 1 }, opts || {});
    const W = canvas.clientWidth || 1920, H = canvas.clientHeight || 1080;
    const cols = Math.ceil(W / o.cell), rows = Math.ceil(H / o.cell);
    canvas.width = cols; canvas.height = rows;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(cols, rows);
    const rnd = mulberry32(o.seed);
    const seed = new Float32Array(cols * rows);
    for (let i = 0; i < seed.length; i++) seed[i] = rnd();
    const state = { gain: o.gain, quiet: o.quietR, quietX: o.quietX };

    function draw(t) {
      const d = img.data, aspect = cols / rows;
      for (let y = 0; y < rows; y++) {
        const ny = y / rows - 0.5;
        for (let x = 0; x < cols; x++) {
          const nx = (x / cols - 0.5) * aspect;
          const wx = nx + 0.42 * Math.sin(ny * 3.1 + t * 0.5) + 0.1 * Math.sin(ny * 11 - t * 0.35);
          const wy = ny + 0.3 * Math.cos(nx * 2.3 - t * 0.38) + 0.06 * Math.sin(nx * 9 + t * 0.2);
          const phase = wy * 11 - wx * 3.2 + Math.sin(wx * 2.8 + t * 0.22) * 2.2;
          const crest = Math.max(0, Math.sin(phase));
          const ribbon = crest ** 16, dust = crest ** 4;
          const i = y * cols + x, s = seed[i];
          const tw = 0.5 + 0.5 * Math.sin(t * 2.4 + s * 40);
          let v = ribbon * (s > 0.3 ? 1.1 : 0.3) * tw + dust * (s > 0.72 ? 0.5 : 0) * tw + (s > 0.985 ? 0.12 : 0);
          if (state.quiet > 0) {
            const dx = x / cols - state.quietX, dy = y / rows - 0.5;
            const r = Math.sqrt(dx * dx * 1.6 + dy * dy);
            v *= 1 - state.quiet * Math.max(0, 1 - r * 2.4);
          }
          v = Math.min(1, v * state.gain);
          const k = i * 4;
          d[k] = 30 * v * v; d[k + 1] = 225 * v; d[k + 2] = 140 * v; d[k + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    }
    return { draw, state };
  }
  return { mount };
})();
