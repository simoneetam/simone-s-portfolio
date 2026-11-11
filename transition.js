// Grainy page transition, shared by every page.
//
// Clicking a link with a data-transition="#colour" attribute sweeps that colour up the screen as
// a very grainy gradient, then opens the link. The new page starts covered in the same colour
// and the grain sweeps on upwards to reveal it, so the two halves read as one movement.
//
// Settings you can tweak:
const TRANSITION = {
  duration: 850,   // ms for each half (covering the old page, then revealing the new one)
  grain: 0.6,      // 0 = smooth gradient, 1 = pure static; higher = noisier edge
  soft: 0.1,       // how soft each speck of grain is
  pixel: 1,        // size of one grain speck in CSS pixels (2 = chunkier grain)
};

(() => {
  const KEY = 'page-transition';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ease = p => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

  function hexToRgb(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  // Draws the wipe. `cover` true = colour sweeps in; false = it sweeps away.
  // Either way the edge travels from the bottom of the screen to the top.
  function wipe(color, cover) {
    const canvas = document.createElement('canvas');
    canvas.className = 'grain-wipe';
    Object.assign(canvas.style, {
      position: 'fixed', left: '0', top: '0', width: '100vw', height: '100vh',
      zIndex: '10000', pointerEvents: 'none', imageRendering: 'pixelated',
    });
    const w = Math.ceil(innerWidth / TRANSITION.pixel), h = Math.ceil(innerHeight / TRANSITION.pixel);
    canvas.width = w;
    canvas.height = h;
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    const px = new Uint32Array(img.data.buffer);
    const [r, g, b] = hexToRgb(color);
    const rgb = (b << 16) | (g << 8) | r;

    // each pixel's turn: a bottom-to-top gradient, heavily mixed with random grain
    const turn = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const base = 1 - y / (h - 1);                       // 0 at the bottom, 1 at the top
      for (let x = 0; x < w; x++) {
        turn[y * w + x] = base * (1 - TRANSITION.grain) + Math.random() * TRANSITION.grain;
      }
    }

    const S = TRANSITION.soft;
    const draw = covered => {
      // covered: 0 = nothing covered, 1 = whole screen covered
      const P = -S + covered * (1 + 2 * S);
      for (let i = 0; i < px.length; i++) {
        // when covering, low turns fill first; when revealing, low turns clear first
        const a = cover ? (P - turn[i]) / S : (turn[i] - (1 - P)) / S;
        px[i] = ((a <= 0 ? 0 : a >= 1 ? 255 : (a * 255) | 0) << 24) | rgb;
      }
      ctx.putImageData(img, 0, 0);
    };

    draw(cover ? 0 : 1);
    return new Promise(resolve => {
      if (reduceMotion) { draw(cover ? 1 : 0); resolve(canvas); return; }
      let start = null, done = false;
      const finish = () => {
        if (done) return;
        done = true;
        draw(cover ? 1 : 0);
        resolve(canvas);
      };
      const frame = now => {
        if (done) return;
        if (start === null) start = now;
        const t = Math.min(1, (now - start) / TRANSITION.duration);
        const p = ease(t);
        draw(cover ? p : 1 - p);
        if (t < 1) requestAnimationFrame(frame);
        else finish();
      };
      requestAnimationFrame(frame);
      // safety net: if the browser pauses animation (e.g. the tab is in the background),
      // still finish so the page never gets stuck covered
      setTimeout(finish, TRANSITION.duration + 400);
    });
  }

  function go(url, color) {
    try { sessionStorage.setItem(KEY, color); } catch (e) {}
    wipe(color, true).then(() => { location.href = url; });
  }

  // links: <a href="contact.html" data-transition="#B4FFF1">
  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-transition]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    go(a.href, a.dataset.transition);
  });

  // arriving from a transition: start covered, then sweep the colour away
  let arriving = null;
  try { arriving = sessionStorage.getItem(KEY); sessionStorage.removeItem(KEY); } catch (e) {}
  const html = document.documentElement;
  if (arriving) {
    wipe(arriving, false).then(c => c.remove());
  }
  html.classList.remove('tr-arriving');
  html.style.removeProperty('background');

  // coming back with the browser's Back button: clear any leftover wipe
  addEventListener('pageshow', e => {
    if (e.persisted) document.querySelectorAll('.grain-wipe').forEach(c => c.remove());
  });

  window.pageTransition = { go };
})();
