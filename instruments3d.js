/* ==========================================================================
   Raaga Sudha — procedural 3D instruments: tanpura · veena · guitar (Three.js, classic script)
   Built by hand from two reference photos: a full-length teak tanpura and a
   walnut gourd close-up. Everything is generated in code: no model files, no
   photo textures. Inlay patterns are drawn on canvases at load.

   Parts: pear gourd (tumba) · flat soundboard with inlaid border (tabli) ·
   hollow neck (dand) · ivory collars · peg head with four pegs ·
   ivory nut · ivory bridge (jawari) · ebony tail piece with pearl beads ·
   four vibrating strings.

   Public API  window.Tanpura3D
     vibrate(i, vel)         shake string i (0..3)
     stringPoint(i, t)       client-space {x,y} on string i, t 0 (nut) .. 1 (bridge)
     setInstrument('tanpura'|'veena'|'guitar')
     fretAt(t)               fret number for a touch at fraction t along a string (0 = open)
     info()                  {name, strings, fretted, nFrets}
     setFinish('teak'|'walnut')  (tanpura)
     setView(yaw, pitch)     for testing
   Calls back  window.RS.pluck(i, {cx, cy, vel, t, fret})  when a string is touched.
   ========================================================================== */
(function () {
  var data = window.RS_PHOTOS || {}, keys = Object.keys(data), PHT = {}, left = keys.length;
  if (!left) { bootInst(PHT); return; }
  keys.forEach(function (k) {
    var im = new Image();
    im.onload = function () { PHT[k] = im; if (--left === 0) bootInst(PHT); };
    im.onerror = function () { if (--left === 0) bootInst(PHT); };
    im.src = data[k];
  });
})();
function bootInst(PHT) {
  'use strict';
  var stage = document.getElementById('stage');
  var canvas = document.getElementById('gl3d');
  if (!stage || !canvas) return;
  if (!window.THREE) { stage.classList.add('no-gl'); return; }
  var T = window.THREE;

  var renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    if (!renderer.getContext()) throw new Error('no context');
  } catch (e) { stage.classList.add('no-gl'); return; }

  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var TAU = Math.PI * 2;

  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  var scene = new T.Scene();
  var camera = new T.PerspectiveCamera(26, 1, 10, 45);
  var MAXANISO = renderer.capabilities.getMaxAnisotropy();

  /* ---------------------------------------------------------------- helpers */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rgb(c) { return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function mkCanvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function toTex(c, srgb) {
    var t = new T.CanvasTexture(c);
    if (srgb !== false) t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = MAXANISO;
    t.wrapS = t.wrapT = T.RepeatWrapping;
    return t;
  }

  /* ---------------------------------------------------------------- finishes */
  var FINISH = {
    teak:   { a: [168, 86, 30],  b: [200, 116, 46], dark: [92, 40, 12],  light: [236, 168, 92], rough: 0.36 },
    walnut: { a: [56, 30, 19],   b: [80, 45, 29],   dark: [26, 12, 8],   light: [134, 90, 62],  rough: 0.30 }
  };
  var IVORY = [239, 230, 207], INK = [58, 30, 16];

  function woodCanvas(w, h, pal, seed, streaks) {
    var r = rng(seed), c = mkCanvas(w, h), g = c.getContext('2d');
    var gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, rgb(pal.a)); gr.addColorStop(0.5, rgb(pal.b)); gr.addColorStop(1, rgb(pal.a));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    var i, x;
    for (i = 0; i < 46; i++) {
      x = r() * w; var bw = w * (0.03 + r() * 0.1);
      var gg = g.createLinearGradient(x - bw, 0, x + bw, 0);
      gg.addColorStop(0, 'rgba(0,0,0,0)');
      gg.addColorStop(0.5, rgba(r() < 0.5 ? pal.dark : pal.light, 0.10 + r() * 0.14));
      gg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gg; g.fillRect(x - bw, 0, bw * 2, h);
    }
    var n = streaks || Math.round(w * 0.5);
    for (i = 0; i < n; i++) {
      x = r() * w;
      g.strokeStyle = rgba(r() < 0.62 ? pal.dark : pal.light, 0.03 + r() * 0.12);
      g.lineWidth = 0.6 + r() * 2.4;
      g.beginPath();
      var ph = r() * 6.28, amp = 0.5 + r() * 3, fq = 0.0015 + r() * 0.005;
      for (var y = 0; y <= h; y += 14) {
        var xx = x + Math.sin(y * fq + ph) * amp;
        if (y === 0) g.moveTo(xx, y); else g.lineTo(xx, y);
      }
      g.stroke();
    }
    var id = g.getImageData(0, 0, w, h), d = id.data;
    for (i = 0; i < d.length; i += 4) {
      var nz = (r() - 0.5) * 13;
      d[i] += nz; d[i + 1] += nz; d[i + 2] += nz;
    }
    g.putImageData(id, 0, 0);
    return c;
  }

  /* real wood / paint photographed from the reference photos, mirror-tiled over the procedural base */
  function photoWood(w, h, pal, seed, streaks, key, cellFrac) {
    var c = woodCanvas(w, h, pal, seed, streaks), im = PHT[key];
    if (!im) return c;
    var g = c.getContext('2d'), cw = Math.round(w * (cellFrac || 0.5)), ch = Math.max(8, Math.round(cw * im.naturalHeight / im.naturalWidth));
    for (var ty = 0; ty * ch < h; ty++) for (var tx = 0; tx * cw < w; tx++) {
      g.save(); g.translate(tx * cw + (tx % 2 ? cw : 0), ty * ch + (ty % 2 ? ch : 0)); g.scale(tx % 2 ? -1 : 1, ty % 2 ? -1 : 1);
      g.drawImage(im, 0, 0, cw, ch); g.restore();
    }
    return c;
  }

  /* ---------------------------------------------------------------- geometry constants (1 unit ≈ 20 cm) */
  var CUT = 0.2;          // z of the flat soundboard plane
  var YE = 2.0;           // gourd stem top
  var RN = 0.13;          // stem radius
  var NECK_HW = 0.20;     // neck half width
  var PLATE_Z = CUT + 0.0025;
  var NECK_FRONT = CUT + 0.01;

  function rProf(y) {
    if (y <= 0) return Math.sqrt(Math.max(0, 1 - y * y));
    var s = Math.min(1, y / YE);
    return RN + (1 - RN) * Math.pow(Math.cos(s * Math.PI / 2), 1.5);
  }
  function halfW(y) { var r = rProf(y); return Math.sqrt(Math.max(0, r * r - CUT * CUT)); }

  var Y_BOT = -Math.sqrt(1 - CUT * CUT) + 0.004;
  var Y_TOP = (function () { var y = 0.5; while (y < YE && halfW(y) > NECK_HW) y += 0.001; return y; })();
  var NECK_Y1 = 6.16;
  var HEAD_Y0 = 6.38, HEAD_Y1 = 7.12;

  /* soundboard outline, counter-clockwise from the bottom point */
  var outline = [];
  (function () {
    var N = 90, i, y;
    for (i = 0; i <= N; i++) { y = Y_BOT + (Y_TOP - Y_BOT) * i / N; outline.push([halfW(y), y]); }
    for (i = N; i >= 0; i--) { y = Y_BOT + (Y_TOP - Y_BOT) * i / N; outline.push([-halfW(y), y]); }
  })();
  var PL = { X0: -0.84, X1: 0.84, Y0: Y_BOT - 0.07, Y1: Y_TOP + 0.07 };
  var PW = 1024, PS = PW / (PL.X1 - PL.X0), PH = Math.round((PL.Y1 - PL.Y0) * PS);

  /* ---------------------------------------------------------------- inlay painting */
  function insetPath(pts, d) {
    var n = pts.length, out = [];
    for (var i = 0; i < n; i++) {
      var a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
      var tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
      out.push([pts[i][0] + (-ty / l) * d, pts[i][1] + (tx / l) * d]);
    }
    return out;
  }
  function alongPath(pts, step, fn) {
    var n = pts.length, acc = 0, next = 0;
    for (var i = 0; i < n; i++) {
      var a = pts[i], b = pts[(i + 1) % n];
      var sx = b[0] - a[0], sy = b[1] - a[1], seg = Math.hypot(sx, sy);
      if (seg < 1e-9) continue;
      var tx = sx / seg, ty = sy / seg;
      while (next <= acc + seg) { var t = next - acc; fn(a[0] + tx * t, a[1] + ty * t, tx, ty); next += step; }
      acc += seg;
    }
  }
  function P(x, y) { return [(x - PL.X0) * PS, (PL.Y1 - y) * PS]; }

  function strokePoly(g, pts, close) {
    g.beginPath();
    for (var i = 0; i < pts.length; i++) {
      var p = P(pts[i][0], pts[i][1]);
      if (i === 0) g.moveTo(p[0], p[1]); else g.lineTo(p[0], p[1]);
    }
    if (close) g.closePath();
    g.stroke();
  }
  function vineBand(g, pts, d, width) {
    var path = insetPath(pts, d);
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.strokeStyle = rgb(IVORY); g.lineWidth = width * PS; strokePoly(g, path, true);
    g.strokeStyle = rgba(INK, 0.9); g.lineWidth = 1.6; strokePoly(g, path, true);
    var flip = 1;
    alongPath(path, 0.02, function (x, y, tx, ty) {
      var nx = -ty * flip, ny = tx * flip, p = P(x + nx * width * 0.2, y + ny * width * 0.2);
      g.fillStyle = rgba(INK, 0.78);
      g.beginPath(); g.ellipse(p[0], p[1], width * PS * 0.17, width * PS * 0.06, -Math.atan2(ty, tx) + flip * 0.7, 0, TAU); g.fill();
      flip = -flip;
    });
  }
  function lotus(g, cx, cy, s) {
    var p = P(cx, cy), k = s * PS;
    g.save(); g.translate(p[0], p[1]);
    var n, i;
    for (n = 0; n < 2; n++) {
      var cnt = n ? 8 : 12, len = n ? 0.62 : 1.0;
      for (i = 0; i < cnt; i++) {
        g.save(); g.rotate(i * TAU / cnt + (n ? Math.PI / cnt : 0));
        g.beginPath(); g.moveTo(0, 0);
        g.bezierCurveTo(0.34 * k * len, -0.22 * k * len, 0.30 * k * len, -0.82 * k * len, 0, -1.0 * k * len);
        g.bezierCurveTo(-0.30 * k * len, -0.82 * k * len, -0.34 * k * len, -0.22 * k * len, 0, 0);
        g.fillStyle = rgb(IVORY); g.fill();
        g.strokeStyle = rgba(INK, 0.85); g.lineWidth = 1.6; g.stroke();
        g.beginPath(); g.moveTo(0, -0.18 * k * len); g.lineTo(0, -0.78 * k * len); g.stroke();
        g.restore();
      }
    }
    g.beginPath(); g.arc(0, 0, 0.2 * k, 0, TAU); g.fillStyle = rgb(IVORY); g.fill(); g.stroke();
    g.beginPath(); g.arc(0, 0, 0.1 * k, 0, TAU); g.fillStyle = rgba(INK, 0.85); g.fill();
    g.restore();
  }
  function paisley(g, cx, cy, s, rot, mirror) {
    var p = P(cx, cy), k = s * PS;
    g.save(); g.translate(p[0], p[1]); g.rotate(rot); if (mirror) g.scale(-1, 1);
    g.beginPath(); g.moveTo(1.7 * k, 0.34 * k);
    g.bezierCurveTo(1.3 * k, -0.62 * k, 0.1 * k, -0.78 * k, -0.02 * k, 0.02 * k);
    g.bezierCurveTo(-0.1 * k, 0.68 * k, 1.1 * k, 0.74 * k, 1.7 * k, 0.34 * k);
    g.closePath();
    g.fillStyle = rgb(IVORY); g.fill();
    g.strokeStyle = rgba(INK, 0.9); g.lineWidth = 1.8; g.stroke();
    g.beginPath(); g.arc(0.3 * k, 0.04 * k, 0.12 * k, 0, TAU); g.fillStyle = rgba(INK, 0.85); g.fill();
    g.lineWidth = 1.3;
    for (var i = 0; i < 4; i++) {
      g.beginPath(); g.moveTo((0.62 + i * 0.22) * k, 0.08 * k); g.quadraticCurveTo((0.72 + i * 0.22) * k, -0.2 * k, (0.92 + i * 0.22) * k, -0.14 * k); g.stroke();
    }
    g.restore();
  }
  function arch(g, cx, cy, w, h) {
    var p = P(cx, cy), W = w * PS, H = h * PS;
    g.save(); g.translate(p[0], p[1]);
    function shape(inset) {
      var hw = W / 2 - inset, top = -H / 2 + inset, bot = H / 2 - inset;
      g.beginPath(); g.moveTo(-hw, bot); g.lineTo(-hw, top + hw);
      g.arc(0, top + hw, hw, Math.PI, 0); g.lineTo(hw, bot); g.closePath();
    }
    shape(0); g.fillStyle = rgb(IVORY); g.fill(); g.strokeStyle = rgba(INK, 0.9); g.lineWidth = 2; g.stroke();
    shape(W * 0.07); g.lineWidth = 1.4; g.stroke();
    g.restore();
  }
  function paintPlate(fin, seed) {
    var c = woodCanvas(PW, PH, fin, seed, 520), g = c.getContext('2d');
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.strokeStyle = rgba(INK, 0.9); g.lineWidth = 3; strokePoly(g, outline, true);
    vineBand(g, outline, 0.052, 0.05);
    g.strokeStyle = rgb(IVORY); g.lineWidth = 3.6; strokePoly(g, insetPath(outline, 0.112), true);
    g.strokeStyle = rgba(INK, 0.8); g.lineWidth = 1.2; strokePoly(g, insetPath(outline, 0.12), true);
    arch(g, 0, 0.96, 0.31, 0.44);
    lotus(g, 0, 0.9, 0.12);
    paisley(g, -0.52, 0.12, 0.12, 0.55, true);
    paisley(g, 0.50, -0.08, 0.12, 0.55 + Math.PI, false);
    return c;
  }
  function paintCollar(w, h, seed) {
    var r = rng(seed), c = mkCanvas(w, h), g = c.getContext('2d');
    g.fillStyle = rgb(IVORY); g.fillRect(0, 0, w, h);
    var id = g.getImageData(0, 0, w, h), d = id.data;
    for (var i = 0; i < d.length; i += 4) { var n = (r() - 0.5) * 10; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    g.putImageData(id, 0, 0);
    g.strokeStyle = rgba(INK, 0.85); g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, h * 0.16); g.lineTo(w, h * 0.16); g.moveTo(0, h * 0.84); g.lineTo(w, h * 0.84); g.stroke();
    g.fillStyle = rgba(INK, 0.8);
    var step = w / 36;
    for (var k = 0; k < 36; k++) {
      var x = k * step + step / 2;
      g.beginPath(); g.ellipse(x, h * 0.5 - h * 0.12, step * 0.34, h * 0.07, 0.5, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(x + step * 0.1, h * 0.5 + h * 0.12, step * 0.34, h * 0.07, -0.5, 0, TAU); g.fill();
    }
    g.beginPath(); g.moveTo(0, h * 0.5); for (var q = 0; q <= w; q += 6) g.lineTo(q, h * 0.5 + Math.sin(q / w * TAU * 18) * h * 0.06); g.stroke();
    return c;
  }
  function paintNeckDecal() {
    var w = 128, h = 1536, c = mkCanvas(w, h), g = c.getContext('2d');
    var bw = 20;
    [0, w - bw].forEach(function (x0) {
      g.fillStyle = rgb(IVORY); g.fillRect(x0, 0, bw, h);
      g.strokeStyle = rgba(INK, 0.9); g.lineWidth = 1.5; g.strokeRect(x0 + 0.5, 0.5, bw - 1, h - 1);
      g.fillStyle = rgba(INK, 0.78);
      for (var y = 0; y < h; y += 13) { g.beginPath(); g.ellipse(x0 + bw / 2, y + 6, 3.2, 5, 0.6, 0, TAU); g.fill(); }
    });
    return c;
  }

  /* ---------------------------------------------------------------- environment (soft-boxes so varnish has something to reflect) */
  (function () {
    var w = 1024, h = 512, c = mkCanvas(w, h), g = c.getContext('2d');
    var gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#fff0d4'); gr.addColorStop(0.32, '#8aa6a4'); gr.addColorStop(0.5, '#10393b'); gr.addColorStop(1, '#03100f');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    function box(u, v, bw, bh, col, blur) {
      g.save(); g.filter = 'blur(' + blur + 'px)'; g.fillStyle = col; g.fillRect(u * w - bw / 2, v * h - bh / 2, bw, bh); g.restore();
    }
    box(0.75, 0.40, 300, 150, '#fff6e2', 16);
    box(0.62, 0.30, 36, 230, '#ffffff', 5);
    box(0.88, 0.34, 90, 170, '#bfeff2', 14);
    box(0.14, 0.36, 150, 190, '#fff3d8', 14);
    box(0.40, 0.26, 40, 220, '#ffffff', 6);
    box(0.97, 0.30, 70, 120, '#f2d78b', 10);
    box(0.5, 0.05, 420, 44, '#fff8e8', 10);
    var tex = new T.CanvasTexture(c);
    tex.mapping = T.EquirectangularReflectionMapping;
    tex.colorSpace = T.SRGBColorSpace;
    var pm = new T.PMREMGenerator(renderer);
    scene.environment = pm.fromEquirectangular(tex).texture;
    tex.dispose(); pm.dispose();
  })();

  var key = new T.DirectionalLight(0xffe2b0, 1.5); key.position.set(-6, 9, 12); scene.add(key);
  var fill = new T.DirectionalLight(0x6fd0d6, 0.55); fill.position.set(9, 2, 7); scene.add(fill);
  var rim = new T.DirectionalLight(0xe0c468, 1.1); rim.position.set(5, 6, -11); scene.add(rim);
  scene.add(new T.HemisphereLight(0xcfe9e6, 0x06201f, 0.32));

  /* ---------------------------------------------------------------- materials */
  var finishName = 'teak', fin = FINISH.teak;
  var texPlate, texGourd, texNeck, texHead;
  var matPlate = new T.MeshPhysicalMaterial({ roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.7 });
  var matGourd = new T.MeshPhysicalMaterial({ roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.7 });
  var matNeck  = new T.MeshPhysicalMaterial({ roughness: 0.38, clearcoat: 0.8, clearcoatRoughness: 0.16, envMapIntensity: 1.05 });
  var matHead  = new T.MeshPhysicalMaterial({ roughness: 0.38, clearcoat: 0.8, clearcoatRoughness: 0.16, envMapIntensity: 1.05 });
  var matIvory = new T.MeshPhysicalMaterial({ color: 0xede3cb, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.35 });
  var matEbony = new T.MeshPhysicalMaterial({ color: 0x1c0e08, roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.1 });
  var matPeg   = new T.MeshPhysicalMaterial({ color: 0x3a1a0e, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08 });
  var matPearl = new T.MeshPhysicalMaterial({ color: 0xf6f0e4, roughness: 0.16, clearcoat: 1, sheen: 1, sheenColor: new T.Color(0xffffff), iridescence: 0.7, iridescenceIOR: 1.4 });

  var collarCv = paintCollar(512, 96, 11);
  var texCollar = toTex(collarCv);
  var matCollar = new T.MeshPhysicalMaterial({ map: texCollar, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.35 });
  var texDecal = toTex(paintNeckDecal());
  var matDecal = new T.MeshStandardMaterial({ map: texDecal, transparent: true, roughness: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

  function applyFinish(name) {
    finishName = FINISH[name] ? name : 'teak'; fin = FINISH[finishName];
    var old = [texPlate, texGourd, texNeck, texHead];
    texPlate = toTex(paintPlate(fin, 7)); texPlate.wrapS = texPlate.wrapT = T.ClampToEdgeWrapping;
    texGourd = toTex(finishName === 'teak' ? photoWood(1024, 1024, fin, 21, 520, 'tGourd', 0.5) : woodCanvas(1024, 1024, fin, 21, 520));
    texNeck = toTex(finishName === 'teak' ? photoWood(512, 2048, fin, 33, 300, 'tGourd', 0.5) : woodCanvas(512, 2048, fin, 33, 300));
    texHead = texNeck.clone(); texHead.repeat.set(1, 0.18); texHead.needsUpdate = true;
    matPlate.map = texPlate; matGourd.map = texGourd; matNeck.map = texNeck; matHead.map = texHead;
    matPlate.roughness = matGourd.roughness = fin.rough;
    [matPlate, matGourd, matNeck, matHead].forEach(function (m) { m.needsUpdate = true; });
    old.forEach(function (t) { if (t) t.dispose(); });
  }
  applyFinish('teak');

  /* ---------------------------------------------------------------- geometry builders */
  function rrProfile(w, d, r, seg) {
    var pts = [], hw = w / 2 - r, hd = d / 2 - r;
    function arc(cx, cz, a0, a1) {
      for (var k = 0; k <= seg; k++) {
        var a = a0 + (a1 - a0) * k / seg;
        pts.push({ x: cx + r * Math.cos(a), z: cz + r * Math.sin(a), nx: Math.cos(a), nz: Math.sin(a) });
      }
    }
    arc(hw, hd, Math.PI / 2, 0); arc(hw, -hd, 0, -Math.PI / 2);
    arc(-hw, -hd, -Math.PI / 2, -Math.PI); arc(-hw, hd, Math.PI, Math.PI / 2);
    pts.push({ x: pts[0].x, z: pts[0].z, nx: pts[0].nx, nz: pts[0].nz });
    return pts;
  }
  /* rounded-rectangle tube along +Y; zc shifts it along z; topScale tapers it */
  function roundedTube(w, d, r, y0, y1, o) {
    o = o || {};
    var zc = o.zc || 0, topScale = o.topScale || 1, ny = o.ny || 8, seg = o.seg || 7, vRepeat = o.vRepeat || 1;
    var prof = rrProfile(w, d, r, seg), M = prof.length, i, j, k;
    var perim = [0];
    for (i = 1; i < M; i++) perim.push(perim[i - 1] + Math.hypot(prof[i].x - prof[i - 1].x, prof[i].z - prof[i - 1].z));
    var total = perim[M - 1];
    var pos = [], nor = [], uv = [], idx = [];
    for (j = 0; j <= ny; j++) {
      var t = j / ny, y = y0 + (y1 - y0) * t, sc = 1 + (topScale - 1) * t;
      for (i = 0; i < M; i++) {
        pos.push(prof[i].x * sc, y, zc + prof[i].z * sc);
        nor.push(prof[i].nx, 0, prof[i].nz);
        uv.push(perim[i] / total, t * vRepeat);
      }
    }
    for (j = 0; j < ny; j++) for (i = 0; i < M - 1; i++) {
      var a = j * M + i, b = a + 1, c = a + M, dd = c + 1;
      idx.push(a, b, c, b, dd, c);
    }
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    if (o.capTop) {
      var cp = [], cn = [], cu = [], ci = [], sc2 = topScale;
      cp.push(0, y1, zc); cn.push(0, 1, 0); cu.push(0.5, 0.5);
      for (i = 0; i < M; i++) { cp.push(prof[i].x * sc2, y1, zc + prof[i].z * sc2); cn.push(0, 1, 0); cu.push(0.5 + prof[i].x / w, 0.5 + prof[i].z / d); }
      for (i = 1; i < M; i++) ci.push(0, i + 1, i);
      var cg = new T.BufferGeometry();
      cg.setAttribute('position', new T.Float32BufferAttribute(cp, 3));
      cg.setAttribute('normal', new T.Float32BufferAttribute(cn, 3));
      cg.setAttribute('uv', new T.Float32BufferAttribute(cu, 2));
      cg.setIndex(ci);
      g.userData.cap = cg;
    }
    return g;
  }
  function meshWithCap(geo, mat) {
    var m = new T.Mesh(geo, mat);
    if (geo.userData.cap) m.add(new T.Mesh(geo.userData.cap, mat));
    return m;
  }

  /* ---------------------------------------------------------------- assemble */
  var pivot = new T.Group(), root = new T.Group();
  var CENTER_Y = (Y_BOT - 0.05 + HEAD_Y1) / 2;
  root.position.y = -CENTER_Y; pivot.add(root); scene.add(pivot);

  /* gourd: pear-shaped lathe, front clamped flat */
  (function () {
    var pts = [], i, y;
    for (i = 0; i <= 80; i++) { y = -1 + i / 80; pts.push(new T.Vector2(Math.max(0, rProf(y)), y)); }
    for (i = 1; i <= 90; i++) { y = YE * i / 90; pts.push(new T.Vector2(rProf(y), y)); }
    var g = new T.LatheGeometry(pts, 120);
    var p = g.attributes.position;
    for (i = 0; i < p.count; i++) if (p.getZ(i) > CUT) p.setZ(i, CUT);
    g.computeVertexNormals();
    root.add(new T.Mesh(g, matGourd));
  })();

  /* soundboard plate + ivory edge bead */
  (function () {
    var shape = new T.Shape(outline.map(function (p) { return new T.Vector2(p[0], p[1]); }));
    var g = new T.ShapeGeometry(shape, 1), p = g.attributes.position, uv = g.attributes.uv;
    for (var i = 0; i < p.count; i++) {
      uv.setXY(i, (p.getX(i) - PL.X0) / (PL.X1 - PL.X0), (p.getY(i) - PL.Y0) / (PL.Y1 - PL.Y0));
    }
    var m = new T.Mesh(g, matPlate); m.position.z = PLATE_Z; root.add(m);

    var half = outline.length / 2, pts = [];
    for (i = half; i < outline.length; i++) pts.push(outline[i]);
    for (i = 0; i < half; i++) pts.push(outline[i]);
    var curve = new T.CatmullRomCurve3(pts.map(function (q) { return new T.Vector3(q[0], q[1], CUT - 0.014); }), false, 'centripetal');
    root.add(new T.Mesh(new T.TubeGeometry(curve, 420, 0.013, 6, false), matIvory));
  })();

  /* neck + front inlay decal */
  var neckLen = NECK_Y1 - Y_TOP;
  (function () {
    var depth = 0.36, zc = NECK_FRONT - depth / 2;
    root.add(new T.Mesh(roundedTube(0.40, depth, 0.045, Y_TOP - 0.02, NECK_Y1 + 0.02, { zc: zc, ny: 24, seg: 5, vRepeat: 1 }), matNeck));
    var dec = new T.Mesh(new T.PlaneGeometry(0.31, neckLen), matDecal);
    dec.position.set(0, (Y_TOP + NECK_Y1) / 2, NECK_FRONT + 0.0012); root.add(dec);
  })();

  /* ivory collars */
  function collar(y0, y1, w, d, zc) { root.add(new T.Mesh(roundedTube(w, d, 0.07, y0, y1, { zc: zc, ny: 2, seg: 6, capTop: true }), matCollar)); }
  collar(Y_TOP - 0.1, Y_TOP + 0.2, 0.52, 0.46, 0.04);
  collar(NECK_Y1 + 0.02, NECK_Y1 + 0.24, 0.50, 0.44, 0.04);

  /* peg head + pegs */
  (function () {
    root.add(meshWithCap(roundedTube(0.38, 0.36, 0.08, HEAD_Y0 - 0.02, HEAD_Y1, { zc: 0.03, ny: 6, seg: 6, topScale: 0.78, capTop: true, vRepeat: 1 }), matHead));
    var band = new T.Mesh(roundedTube(0.42, 0.40, 0.08, HEAD_Y1 - 0.2, HEAD_Y1 - 0.11, { zc: 0.03, ny: 1, seg: 6, topScale: 0.84 }), matCollar);
    root.add(band);

    var lp = [[0, 0], [0.03, 0], [0.04, 0.3], [0.058, 0.31], [0.058, 0.35], [0.05, 0.36], [0.075, 0.4], [0.088, 0.46], [0.078, 0.53], [0.045, 0.58], [0, 0.6]]
      .map(function (q) { return new T.Vector2(q[0], q[1]); });
    var pegGeo = new T.LatheGeometry(lp, 28);
    [[-1, 6.58], [-1, 6.9], [1, 6.74], [1, 7.03]].forEach(function (s) {
      var m = new T.Mesh(pegGeo, matPeg);
      m.rotation.z = s[0] < 0 ? Math.PI / 2 : -Math.PI / 2;
      m.position.set(s[0] * 0.14, s[1], 0.03); root.add(m);
    });
  })();

  /* nut, bridge, tail piece, beads */
  var NUT_Y = NECK_Y1 - 0.02, NUT_Z = NECK_FRONT + 0.05;
  var BR_Y = -0.2, BR_TOPZ = PLATE_Z + 0.03 + 0.078;
  var TAIL_Y = -0.80, BEAD_Y = -0.9, BEAD_Z = PLATE_Z + 0.045 + 0.036;
  var NUT_X = [-0.105, -0.035, 0.035, 0.105], BR_X = [-0.21, -0.07, 0.07, 0.21], BEAD_X = [-0.195, -0.065, 0.065, 0.195];

  (function () {
    var nut = new T.Mesh(new T.BoxGeometry(0.34, 0.034, 0.05), matIvory); nut.position.set(0, NUT_Y, NECK_FRONT + 0.025); root.add(nut);

    var base = new T.Mesh(new T.BoxGeometry(0.64, 0.22, 0.03), matEbony); base.position.set(0, BR_Y, PLATE_Z + 0.015); root.add(base);
    var jaw = new T.Mesh(new T.BoxGeometry(0.58, 0.13, 0.078), matIvory); jaw.position.set(0, BR_Y, PLATE_Z + 0.03 + 0.039); root.add(jaw);
    for (var i = 0; i < 4; i++) {
      var groove = new T.Mesh(new T.BoxGeometry(0.012, 0.13, 0.004), matEbony);
      groove.position.set(BR_X[i], BR_Y, BR_TOPZ + 0.0005); root.add(groove);
    }

    var tail = new T.Mesh(new T.BoxGeometry(0.56, 0.46, 0.045), matEbony); tail.position.set(0, TAIL_Y, PLATE_Z + 0.0225); root.add(tail);
    var leaf = new T.Shape();
    leaf.moveTo(0, 0.17); leaf.bezierCurveTo(0.05, 0.07, 0.05, -0.06, 0.03, -0.14); leaf.lineTo(-0.03, -0.14); leaf.bezierCurveTo(-0.05, -0.06, -0.05, 0.07, 0, 0.17);
    var leafGeo = new T.ShapeGeometry(leaf, 10);
    for (i = 0; i < 4; i++) {
      var lf = new T.Mesh(leafGeo, matIvory); lf.position.set(BEAD_X[i], TAIL_Y + 0.03, PLATE_Z + 0.0465); root.add(lf);
      var bead = new T.Mesh(new T.SphereGeometry(0.038, 24, 16), matPearl); bead.position.set(BEAD_X[i], BEAD_Y, BEAD_Z); root.add(bead);
    }
  })();

  /* strings: vibrating section (nut → bridge) is a shader-displaced cylinder; tail section is static */
  var matStringProto = { color: 0xefdc9a, metalness: 1, roughness: 0.26, emissive: 0xffc860, emissiveIntensity: 0, envMapIntensity: 1.4 };
  var strings = [], WVIB = TAU * 13, A0 = 0.085;
  (function () {
    for (var i = 0; i < 4; i++) {
      var a = new T.Vector3(NUT_X[i], NUT_Y + 0.017, NUT_Z), b = new T.Vector3(BR_X[i], BR_Y, BR_TOPZ + 0.004);
      var L = a.distanceTo(b), dir = a.clone().sub(b).normalize();
      var uni = { uAmp: { value: 0 }, uTime: { value: 0 }, uLen: { value: L }, uW: { value: WVIB * (1 + i * 0.045) } };
      var mat = new T.MeshStandardMaterial(matStringProto);
      mat.onBeforeCompile = (function (u) {
        return function (sh) {
          sh.uniforms.uAmp = u.uAmp; sh.uniforms.uTime = u.uTime; sh.uniforms.uLen = u.uLen; sh.uniforms.uW = u.uW;
          sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\nuniform float uAmp;\nuniform float uTime;\nuniform float uLen;\nuniform float uW;')
            .replace('#include <begin_vertex>',
              'vec3 transformed = vec3(position);\n' +
              'float uu = clamp(position.y / uLen + 0.5, 0.0, 1.0);\n' +
              'float s1 = sin(3.14159265 * uu);\n' +
              'float s2 = sin(6.2831853 * uu) * 0.36;\n' +
              'float s3 = sin(9.424778 * uu) * 0.16;\n' +
              'transformed.x += uAmp * (s1 * cos(uTime * uW) + s2 * cos(uTime * uW * 2.01 + 1.3) + s3 * cos(uTime * uW * 3.02 + 0.4));\n' +
              'transformed.z += uAmp * (s1 * sin(uTime * uW) + s2 * sin(uTime * uW * 2.01 + 1.3) + s3 * sin(uTime * uW * 3.02 + 0.4));');
        };
      })(uni);
      var m = new T.Mesh(new T.CylinderGeometry(0.011, 0.011, L, 6, 110, true), mat);
      m.position.copy(a.clone().add(b).multiplyScalar(0.5));
      m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir);
      root.add(m);

      var c = new T.Vector3(BEAD_X[i], BEAD_Y + 0.036, BEAD_Z), L2 = b.distanceTo(c);
      var tailS = new T.Mesh(new T.CylinderGeometry(0.011, 0.011, L2, 6, 1, true), new T.MeshStandardMaterial(matStringProto));
      tailS.position.copy(b.clone().add(c).multiplyScalar(0.5));
      tailS.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(c).normalize());
      root.add(tailS);

      strings.push({ mesh: m, mat: mat, uni: uni, a: a, b: b, amp: 0, hover: 0, A0: A0 });
    }
  })();

  /* ================================================================ shared string builder (veena + guitar) */
  function patchShader(mat, u) {
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.uAmp = u.uAmp; sh.uniforms.uTime = u.uTime; sh.uniforms.uLen = u.uLen; sh.uniforms.uW = u.uW;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uAmp;\nuniform float uTime;\nuniform float uLen;\nuniform float uW;')
        .replace('#include <begin_vertex>',
          'vec3 transformed = vec3(position);\n' +
          'float uu = clamp(position.y / uLen + 0.5, 0.0, 1.0);\n' +
          'float s1 = sin(3.14159265 * uu);\n' +
          'float s2 = sin(6.2831853 * uu) * 0.36;\n' +
          'float s3 = sin(9.424778 * uu) * 0.16;\n' +
          'transformed.x += uAmp * (s1 * cos(uTime * uW) + s2 * cos(uTime * uW * 2.01 + 1.3) + s3 * cos(uTime * uW * 3.02 + 0.4));\n' +
          'transformed.z += uAmp * (s1 * sin(uTime * uW) + s2 * sin(uTime * uW * 2.01 + 1.3) + s3 * sin(uTime * uW * 3.02 + 0.4));');
    };
  }
  function addString(parent, list, a, b, rad, col, i, amp, wBase) {
    var L = a.distanceTo(b), dir = a.clone().sub(b).normalize();
    var u = { uAmp: { value: 0 }, uTime: { value: 0 }, uLen: { value: L }, uW: { value: (wBase || TAU * 13) * (1 + i * 0.045) } };
    var mat = new T.MeshStandardMaterial({ color: col, metalness: 1, roughness: 0.26, emissive: 0xffc860, emissiveIntensity: 0, envMapIntensity: 1.4 });
    patchShader(mat, u);
    var m = new T.Mesh(new T.CylinderGeometry(rad, rad, L, 6, 110, true), mat);
    m.position.copy(a.clone().add(b).multiplyScalar(0.5));
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir);
    parent.add(m);
    list.push({ mesh: m, mat: mat, uni: u, a: a, b: b, amp: 0, hover: 0, A0: amp });
  }
  function staticRod(parent, a, b, rad, mat) {
    var L = a.distanceTo(b), m = new T.Mesh(new T.CylinderGeometry(rad, rad, L, 6, 1, true), mat);
    m.position.copy(a.clone().add(b).multiplyScalar(0.5));
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    parent.add(m);
  }
  function fretP(f) { return 1 - Math.pow(2, -f / 12); }   // fraction of the scale length from the nut

  var matBrass = new T.MeshStandardMaterial({ color: 0xd9ab48, metalness: 1, roughness: 0.27, envMapIntensity: 1.7 });
  var matNickel = new T.MeshStandardMaterial({ color: 0xd9dcd8, metalness: 1, roughness: 0.22, envMapIntensity: 1.5 });
  var STR_BRONZE = 0xd6a24c, STR_STEEL = 0xe6ebe8;
  var pegProfile = [[0, 0], [0.03, 0], [0.04, 0.3], [0.058, 0.31], [0.058, 0.35], [0.05, 0.36], [0.075, 0.4], [0.088, 0.46], [0.078, 0.53], [0.045, 0.58], [0, 0.6]]
    .map(function (q) { return new T.Vector2(q[0], q[1]); });
  var pegGeoShared = new T.LatheGeometry(pegProfile, 28);

  /* ================================================================ VEENA (Saraswati veena) */
  var veena = { group: new T.Group(), strings: [], fretted: true, nFrets: 24, amp: 0.05 };
  (function () {
    var G = veena.group, R = 1.05, CUTV = 0.46, NUT_Y = 5.45, BR_Y = -0.12, NECK0 = 0.8, NECK1 = 5.62, NF = CUTV + 0.02;
    var vfin = { a: [150, 86, 34], b: [198, 124, 54], dark: [76, 38, 14], light: [238, 184, 106], rough: 0.34 };
    var texBowl = toTex(photoWood(1024, 1024, vfin, 51, 520, 'vBowl', 0.3));
    var texNeckV = toTex(woodCanvas(256, 1536, vfin, 52, 260));
    var matBowl = new T.MeshPhysicalMaterial({ map: texBowl, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 1.5 });
    var matTumba = new T.MeshPhysicalMaterial({ map: toTex(photoWood(1024, 512, vfin, 53, 200, 'vGourd', 0.5)), roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.4, envMapIntensity: 0.55 });
    var matNeckV = new T.MeshPhysicalMaterial({ map: texNeckV, roughness: 0.36, clearcoat: 0.9, clearcoatRoughness: 0.14, envMapIntensity: 1.3 });

    /* resonator bowl (kudam): sphere clamped flat at the front */
    var pts = [], i, y;
    for (i = 0; i <= 90; i++) { y = -R + 2 * R * i / 90; pts.push(new T.Vector2(Math.max(0.0001, Math.sqrt(Math.max(0, R * R - y * y))), y)); }
    var bg = new T.LatheGeometry(pts, 96), bp = bg.attributes.position;
    for (i = 0; i < bp.count; i++) if (bp.getZ(i) > CUTV) bp.setZ(i, CUTV);
    bg.computeVertexNormals();
    G.add(new T.Mesh(bg, matBowl));

    /* face plate with painted lotus ring */
    var PWV = 1024, c = mkCanvas(PWV, PWV), g = c.getContext('2d');
    var wc = photoWood(PWV, PWV, vfin, 61, 600, 'vTop', 0.45); g.drawImage(wc, 0, 0);
    if (PHT.vBand) {
      var BH = PWV * 0.062, NB = 900, rb = PWV * 0.5 * 0.955, sw0 = PHT.vBand.naturalWidth, sh0 = PHT.vBand.naturalHeight;
      for (var kb = 0; kb < NB; kb++) {
        var tb = (kb / NB * 6) % 2, ub = tb < 1 ? tb : 2 - tb, dwb = TAU * rb / NB + 0.8;
        g.save(); g.translate(PWV / 2, PWV / 2); g.rotate(kb / NB * TAU);
        g.drawImage(PHT.vBand, Math.min(sw0 - 2, ub * (sw0 - 2)), 0, 2, sh0, -dwb / 2, -rb - BH / 2, dwb, BH); g.restore();
      }
    }
    var cx = PWV / 2, rr = PWV / 2;
    function ring(r, col, lw) { g.beginPath(); g.arc(cx, cx, r * rr, 0, TAU); g.strokeStyle = col; g.lineWidth = lw; g.stroke(); }
    g.save(); g.beginPath(); g.arc(cx, cx, rr, 0, TAU); g.clip();
    ring(0.97, 'rgba(36,16,6,0.9)', 5); ring(0.93, 'rgba(236,196,108,0.95)', 9); ring(0.885, 'rgba(36,16,6,0.85)', 3);
    for (var k = 0; k < 40; k++) { var an = k * TAU / 40; g.beginPath(); g.arc(cx + Math.cos(an) * 0.91 * rr, cx + Math.sin(an) * 0.91 * rr, 3.2, 0, TAU); g.fillStyle = 'rgba(36,16,6,0.85)'; g.fill(); }
    var np = 16;
    for (k = 0; k < np; k++) {
      g.save(); g.translate(cx, cx); g.rotate(k * TAU / np);
      g.beginPath(); g.moveTo(0, -0.46 * rr);
      g.bezierCurveTo(0.16 * rr, -0.56 * rr, 0.14 * rr, -0.76 * rr, 0, -0.84 * rr);
      g.bezierCurveTo(-0.14 * rr, -0.76 * rr, -0.16 * rr, -0.56 * rr, 0, -0.46 * rr);
      g.fillStyle = 'rgba(236,196,108,0.9)'; g.fill(); g.strokeStyle = 'rgba(36,16,6,0.9)'; g.lineWidth = 3; g.stroke();
      g.beginPath(); g.moveTo(0, -0.52 * rr); g.lineTo(0, -0.78 * rr); g.stroke();
      g.restore();
    }
    ring(0.42, 'rgba(36,16,6,0.85)', 3); ring(0.38, 'rgba(236,196,108,0.95)', 7);
    g.beginPath(); g.arc(cx, cx, 0.26 * rr, 0, TAU); g.fillStyle = 'rgba(30,14,6,0.88)'; g.fill();
    for (k = 0; k < 8; k++) { var a2 = k * TAU / 8; g.beginPath(); g.arc(cx + Math.cos(a2) * 0.17 * rr, cx + Math.sin(a2) * 0.17 * rr, 0.045 * rr, 0, TAU); g.fillStyle = 'rgba(236,196,108,0.95)'; g.fill(); }
    g.restore();
    var texFace = toTex(c); texFace.wrapS = texFace.wrapT = T.ClampToEdgeWrapping;
    var plateR = Math.sqrt(R * R - CUTV * CUTV);
    var plate = new T.Mesh(new T.CircleGeometry(plateR, 96), new T.MeshPhysicalMaterial({ map: texFace, color: PHT.vTop ? 0xe6c8a8 : 0xffffff, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.6 }));
    plate.position.z = CUTV + 0.002; G.add(plate);
    var rim = new T.Mesh(new T.TorusGeometry(plateR, 0.04, 14, 120), matBrass); rim.position.z = CUTV; G.add(rim);

    /* neck (dandi) */
    G.add(new T.Mesh(roundedTube(0.34, 0.30, 0.06, NECK0, NECK1, { zc: NF - 0.15, ny: 24, seg: 5 }), matNeckV));
    var cl = new T.Mesh(roundedTube(0.46, 0.42, 0.08, NECK0 - 0.08, NECK0 + 0.2, { zc: NF - 0.15, ny: 2, seg: 6, capTop: true }), matBrass); G.add(cl);

    /* 24 brass frets */
    for (i = 1; i <= 24; i++) {
      y = NUT_Y - fretP(i) * (NUT_Y - BR_Y);
      var fr = new T.Mesh(new T.BoxGeometry(0.31, 0.017, 0.03), matBrass);
      fr.position.set(0, y, NF + 0.012); G.add(fr);
    }
    [5, 7, 12, 17, 19, 24].forEach(function (f) {
      var yy = (NUT_Y - fretP(f - 1) * (NUT_Y - BR_Y) + NUT_Y - fretP(f) * (NUT_Y - BR_Y)) / 2;
      var d = new T.Mesh(new T.CylinderGeometry(0.02, 0.02, 0.006, 16), matPearl); d.rotation.x = Math.PI / 2; d.position.set(0, yy, NF + 0.004); G.add(d);
    });

    /* nut, bridge, tail */
    var nut = new T.Mesh(new T.BoxGeometry(0.22, 0.04, 0.05), matBrass); nut.position.set(0, NUT_Y, NF + 0.03); G.add(nut);
    var disc = new T.Mesh(new T.CylinderGeometry(0.25, 0.28, 0.06, 56), matBrass); disc.rotation.x = Math.PI / 2; disc.position.set(0, BR_Y - 0.02, CUTV + 0.03); G.add(disc);
    var bar = new T.Mesh(new T.BoxGeometry(0.26, 0.035, 0.08), matBrass); bar.position.set(0, BR_Y, CUTV + 0.06 + 0.04); G.add(bar);
    var BRTOP = CUTV + 0.06 + 0.08 + 0.004;
    var tail = new T.Mesh(new T.BoxGeometry(0.3, 0.13, 0.03), matBrass); tail.position.set(0, -0.62, CUTV + 0.02); G.add(tail);

    /* peg box, pegs, swan-neck yali, little gourd */
    G.add(meshWithCap(roundedTube(0.38, 0.34, 0.08, NECK1 - 0.1, NECK1 + 0.78, { zc: NF - 0.17, ny: 6, seg: 6, topScale: 0.86, capTop: true }), matNeckV));
    [[-1, 5.82], [1, 6.0], [-1, 6.18], [1, 6.36]].forEach(function (p) {
      var m = new T.Mesh(pegGeoShared, matPeg);
      m.rotation.z = p[0] < 0 ? Math.PI / 2 : -Math.PI / 2;
      m.position.set(p[0] * 0.15, p[1], NF - 0.17); G.add(m);
    });
    var curve = new T.CatmullRomCurve3([
      new T.Vector3(0, 6.3, NF - 0.17), new T.Vector3(0, 6.62, NF - 0.2), new T.Vector3(0, 6.98, NF - 0.36),
      new T.Vector3(0, 7.12, NF - 0.66), new T.Vector3(0, 6.96, NF - 0.96), new T.Vector3(0, 6.62, NF - 1.06)]);
    G.add(new T.Mesh(new T.TubeGeometry(curve, 60, 0.105, 14, false), matBowl));
    var fin = new T.Mesh(new T.SphereGeometry(0.14, 24, 18), matBrass); fin.position.set(0, 6.58, NF - 1.08); G.add(fin);
    [-1, 1].forEach(function (sx) { var hn = new T.Mesh(new T.ConeGeometry(0.045, 0.26, 12), matBrass); hn.position.set(sx * 0.08, 6.74, NF - 1.0); hn.rotation.z = -sx * 0.5; G.add(hn); });
    var tumba = new T.Mesh(new T.SphereGeometry(0.46, 48, 32), matTumba); tumba.scale.set(1, 0.92, 1); tumba.position.set(0, 5.05, NF - 0.5); G.add(tumba);
    var tring = new T.Mesh(new T.TorusGeometry(0.2, 0.035, 12, 48), matBrass); tring.position.set(0, 5.05, NF - 0.5 + 0.44); G.add(tring);

    /* four main strings: two steel, two bronze */
    var NX = [-0.06, -0.02, 0.02, 0.06], BX = [-0.075, -0.025, 0.025, 0.075], cols = [STR_STEEL, STR_STEEL, STR_BRONZE, STR_BRONZE];
    for (i = 0; i < 4; i++) {
      var a = new T.Vector3(NX[i], NUT_Y + 0.02, NF + 0.062), b = new T.Vector3(BX[i], BR_Y, BRTOP);
      addString(G, veena.strings, a, b, 0.0085 + (i > 1 ? 0.002 : 0), cols[i], i, veena.amp, TAU * 13);
      staticRod(G, b, new T.Vector3(BX[i] * 0.8, -0.58, CUTV + 0.04), 0.0085, new T.MeshStandardMaterial({ color: cols[i], metalness: 1, roughness: 0.3 }));
    }
    veena.pMax = fretP(24) + 0.004;
  })();

  /* ================================================================ GUITAR (acoustic, steel-string) */
  var guitar = { group: new T.Group(), strings: [], fretted: true, nFrets: 19, amp: 0.026 };
  (function () {
    var G = guitar.group, NUT_Y = 3.85, BR_Y = 0.62, FB0 = 1.55, DEPTH = 0.46;
    var spruce = { a: [214, 170, 104], b: [232, 196, 130], dark: [150, 104, 52], light: [250, 226, 170], rough: 0.4 };
    var rose = { a: [94, 44, 28], b: [124, 66, 40], dark: [38, 16, 10], light: [176, 104, 72], rough: 0.32 };
    var maho = { a: [120, 62, 34], b: [150, 84, 48], dark: [56, 26, 14], light: [200, 130, 86], rough: 0.36 };
    var matSide = new T.MeshPhysicalMaterial({ map: toTex(woodCanvas(512, 1024, rose, 71, 400)), color: 0x9a6648, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.5 });
    var matNeckG = new T.MeshPhysicalMaterial({ map: toTex(woodCanvas(256, 1024, maho, 72, 240)), roughness: 0.34, clearcoat: 0.9, clearcoatRoughness: 0.14, envMapIntensity: 1.3 });
    var matFB = new T.MeshPhysicalMaterial({ color: 0x1b0f0a, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.25 });

    /* outline: spline through (half-width, y) control points, mirrored */
    var cp = [[0.0, 0.0], [0.4, 0.012], [0.74, 0.14], [0.93, 0.42], [0.96, 0.78], [0.85, 1.08], [0.63, 1.28], [0.6, 1.42], [0.7, 1.66], [0.75, 1.9], [0.63, 2.18], [0.35, 2.29], [0.0, 2.31]]
      .map(function (q) { return new T.Vector2(q[0], q[1]); });
    var half = new T.SplineCurve(cp).getPoints(120);
    var outl = [], i;
    for (i = 0; i < half.length; i++) outl.push([half[i].x, half[i].y]);
    for (i = half.length - 2; i >= 1; i--) outl.push([-half[i].x, half[i].y]);
    var shape = new T.Shape(outl.map(function (p) { return new T.Vector2(p[0], p[1]); }));
    var eg = new T.ExtrudeGeometry(shape, { depth: DEPTH - 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3, curveSegments: 1 });
    eg.translate(0, 0, -(DEPTH - 0.06 + 0.03));
    G.add(new T.Mesh(eg, matSide));

    /* spruce top: canvas with soundhole + rosette */
    var CW = 1024, CH = Math.round(CW * 2.31 / 1.92), c = mkCanvas(CW, CH), g = c.getContext('2d');
    g.drawImage(photoWood(CW, CH, spruce, 81, 700, 'gTop', 0.62), 0, 0);
    function G2(x, y) { return [(x + 0.96) / 1.92 * CW, (1 - y / 2.31) * CH]; }
    var sh = G2(0, 1.66), sr = 0.26 * CW / 1.92;
    function ringG(r, col, lw) { g.beginPath(); g.arc(sh[0], sh[1], r * CW / 1.92, 0, TAU); g.strokeStyle = col; g.lineWidth = lw; g.stroke(); }
    ringG(0.35, 'rgba(40,20,10,0.9)', 3); ringG(0.33, 'rgba(240,232,214,0.95)', 6); ringG(0.305, 'rgba(40,20,10,0.9)', 4); ringG(0.285, 'rgba(236,196,108,0.9)', 5);
    for (i = 0; i < 48; i++) { var an = i * TAU / 48; g.fillStyle = i % 2 ? 'rgba(30,14,8,0.9)' : 'rgba(240,232,214,0.95)'; g.fillRect(sh[0] + Math.cos(an) * 0.318 * CW / 1.92 - 3, sh[1] + Math.sin(an) * 0.318 * CW / 1.92 - 3, 6, 6); }
    var grd = g.createRadialGradient(sh[0], sh[1], sr * 0.2, sh[0], sh[1], sr);
    grd.addColorStop(0, '#030201'); grd.addColorStop(0.85, '#120a05'); grd.addColorStop(1, '#4a2e18');
    g.beginPath(); g.arc(sh[0], sh[1], sr, 0, TAU); g.fillStyle = grd; g.fill();
    var texTop = toTex(c); texTop.wrapS = texTop.wrapT = T.ClampToEdgeWrapping;
    var matTop = new T.MeshPhysicalMaterial({ map: texTop, color: PHT.gTop ? 0xf3dcb4 : 0xffffff, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.4 });
    var tg = new T.ShapeGeometry(shape, 1), tp = tg.attributes.position, tu = tg.attributes.uv;
    for (i = 0; i < tp.count; i++) tu.setXY(i, (tp.getX(i) + 0.96) / 1.92, tp.getY(i) / 2.31);
    var top = new T.Mesh(tg, matTop); top.position.z = 0.002; G.add(top);
    var bpts = []; var hf = outl.length / 2;
    for (i = 0; i < outl.length; i++) bpts.push(new T.Vector3(outl[i][0], outl[i][1], 0.0));
    bpts.push(bpts[0].clone());
    G.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(bpts, true, 'centripetal'), 420, 0.015, 6, true), matIvory));

    /* neck, fretboard, frets */
    var NZ = 0.04;
    G.add(new T.Mesh(roundedTube(0.27, 0.2, 0.05, 1.9, NUT_Y + 0.02, { zc: NZ - 0.1, ny: 14, seg: 5, topScale: 0.82 }), matNeckG));
    var fb = new T.Shape(); fb.moveTo(-0.158, FB0); fb.lineTo(0.158, FB0); fb.lineTo(0.108, NUT_Y); fb.lineTo(-0.108, NUT_Y); fb.closePath();
    var fbg = new T.ExtrudeGeometry(fb, { depth: 0.035, bevelEnabled: false }); fbg.translate(0, 0, NZ); G.add(new T.Mesh(fbg, matFB));
    var FBZ = NZ + 0.035;
    function fbHalf(y) { return 0.108 + (0.158 - 0.108) * (NUT_Y - y) / (NUT_Y - FB0); }
    for (i = 1; i <= 19; i++) {
      var yf = NUT_Y - fretP(i) * (NUT_Y - BR_Y);
      var f = new T.Mesh(new T.BoxGeometry(fbHalf(yf) * 2 + 0.012, 0.011, 0.016), matNickel); f.position.set(0, yf, FBZ + 0.005); G.add(f);
    }
    [3, 5, 7, 9, 12, 15, 17, 19].forEach(function (n) {
      var y0 = NUT_Y - fretP(n - 1) * (NUT_Y - BR_Y), y1 = NUT_Y - fretP(n) * (NUT_Y - BR_Y), ym = (y0 + y1) / 2;
      var xs = n === 12 ? [-0.035, 0.035] : [0];
      xs.forEach(function (x) { var d = new T.Mesh(new T.CylinderGeometry(0.014, 0.014, 0.004, 14), matPearl); d.rotation.x = Math.PI / 2; d.position.set(x, ym, FBZ + 0.002); G.add(d); });
    });
    var nut = new T.Mesh(new T.BoxGeometry(0.225, 0.03, 0.05), matIvory); nut.position.set(0, NUT_Y, FBZ + 0.01); G.add(nut);

    /* bridge */
    var bridge = new T.Mesh(new T.BoxGeometry(0.8, 0.2, 0.045), matEbony); bridge.position.set(0, 0.5, 0.0225); G.add(bridge);
    var wing = new T.Mesh(new T.CylinderGeometry(0.1, 0.1, 0.045, 24), matEbony); wing.rotation.x = Math.PI / 2;
    [-0.4, 0.4].forEach(function (x) { var w2 = wing.clone(); w2.position.set(x, 0.5, 0.0225); G.add(w2); });
    var sad = new T.Mesh(new T.BoxGeometry(0.7, 0.026, 0.04), matIvory); sad.position.set(0, BR_Y, 0.045 + 0.02); G.add(sad);
    var BRZ = 0.045 + 0.04 + 0.004;
    var NXg = [], BXg = [];
    for (i = 0; i < 6; i++) { NXg.push((i - 2.5) * 0.034); BXg.push((i - 2.5) * 0.052); var pin = new T.Mesh(new T.SphereGeometry(0.017, 14, 10), matPearl); pin.position.set(BXg[i], 0.47, 0.048); G.add(pin); }

    /* headstock with six tuners (tilted back) */
    var hs = new T.Group(); hs.position.set(0, NUT_Y, 0.0); hs.rotation.x = -0.32; G.add(hs);
    var hm = new T.Mesh(roundedTube(0.34, 0.07, 0.03, 0, 0.95, { zc: 0.0, ny: 6, seg: 4, topScale: 0.96 }), matNeckG); hm.position.set(0, 0, 0); hs.add(hm);
    var plateFront = new T.Mesh(new T.BoxGeometry(0.3, 0.9, 0.006), matFB); plateFront.position.set(0, 0.47, 0.037); hs.add(plateFront);
    var postL = [0.72, 0.48, 0.24], tailMat = new T.MeshStandardMaterial({ color: 0xcfd3cf, metalness: 1, roughness: 0.3 });
    for (i = 0; i < 6; i++) {
      var left = i < 3, py = left ? postL[i] : postL[5 - i], px = left ? -0.085 : 0.085;
      var post = new T.Mesh(new T.CylinderGeometry(0.017, 0.017, 0.07, 12), matNickel); post.rotation.x = Math.PI / 2; post.position.set(px, py, 0.05); hs.add(post);
      var key = new T.Mesh(new T.BoxGeometry(0.07, 0.05, 0.022), matPearl); key.position.set(left ? -0.22 : 0.22, py, 0.0); hs.add(key);
      var shaft = new T.Mesh(new T.CylinderGeometry(0.01, 0.01, 0.14, 8), matNickel); shaft.rotation.z = Math.PI / 2; shaft.position.set(left ? -0.16 : 0.16, py, 0.0); hs.add(shaft);
      staticRod(hs, new T.Vector3(NXg[i], 0.0, 0.105 - 0.0), new T.Vector3(px, py, 0.05), 0.006, tailMat);
    }

    /* six strings: three wound (bronze), three plain (steel) */
    for (i = 0; i < 6; i++) {
      var a = new T.Vector3(NXg[i], NUT_Y + 0.008, FBZ + 0.016 + 0.004), b = new T.Vector3(BXg[i], BR_Y, BRZ);
      addString(G, guitar.strings, a, b, 0.0115 - i * 0.0009, i < 3 ? STR_BRONZE : STR_STEEL, i, guitar.amp, TAU * 15);
    }
    guitar.pMax = fretP(19) + 0.004;
    G.scale.setScalar(1.42);
  })();

  /* ---------------------------------------------------------------- registry, centering, framing */
  var tanpura = { group: root, strings: strings, fretted: false, nFrets: 0, amp: A0, h: (HEAD_Y1 - Y_BOT) + 0.6, w: 3.0 };
  [veena, guitar].forEach(function (ins) {
    pivot.add(ins.group); ins.group.updateMatrixWorld(true);
    var bx = new T.Box3().setFromObject(ins.group), sz = new T.Vector3(), ct = new T.Vector3();
    bx.getSize(sz); bx.getCenter(ct);
    ins.group.position.sub(ct);
    ins.h = sz.y + 0.7; ins.w = sz.x + 1.0;
    ins.group.visible = false;
  });
  var INST = { tanpura: tanpura, veena: veena, guitar: guitar };
  var curName = 'tanpura', cur = tanpura;

  /* a glowing dot where a string was just touched */
  var marker = new T.Mesh(new T.SphereGeometry(0.055, 16, 12), new T.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0, depthTest: false }));
  marker.renderOrder = 10; tanpura.group.add(marker);
  var markerLife = 0;
  function markAt(i, t) {
    var s = strings[i]; if (!s) return;
    marker.position.copy(s.a).lerp(s.b, t); marker.position.z += 0.03;
    var sc = cur.group === tanpura.group ? 1 : 1; marker.scale.setScalar(sc);
    markerLife = 1;
  }
  function fretAt(t) {
    if (!cur.fretted) return 0;
    if (t > cur.pMax) return 0;
    var x = -12 * Math.log(Math.max(1e-6, 1 - t)) / Math.LN2;
    return Math.max(0, Math.min(cur.nFrets, Math.ceil(x - 0.001)));
  }
  var swap = 1;
  function setInstrument(name) {
    var n = INST[name]; if (!n || n === cur) return;
    cur.group.visible = false; cur.group.remove(marker);
    cur = n; curName = name; strings = n.strings; n.group.visible = true; n.group.add(marker);
    marker.material.opacity = 0; markerLife = 0;
    mode = null; dragging = null; last = null;
    if (!reduce) { view.intro = 0.35; swap = 0; }
    resize();
  }

  /* ---------------------------------------------------------------- view state */
  var view = { yaw: -1.5, pitch: 0.06, yawV: 0, idleAt: 0, base: 0.5, intro: reduce ? 1 : 0 };
  if (reduce) view.yaw = view.base;
  var dragging = null, W = 1, H = 1;

  function resize() {
    W = canvas.clientWidth || 1; H = canvas.clientHeight || 1;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    var needH = cur.h, needW = cur.w;
    var tanHalf = Math.tan(T.MathUtils.degToRad(camera.fov / 2));
    var dist = Math.max(needH / 2 / tanHalf, needW / 2 / (tanHalf * camera.aspect));
    camera.position.set(0, 0.35, dist); camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas); else window.addEventListener('resize', resize);
  resize();

  /* ---------------------------------------------------------------- picking: screen-space distance to each string */
  var tmp = new T.Vector3();
  function toPx(v) {
    cur.group.localToWorld(tmp.copy(v)); tmp.project(camera);
    return { x: (tmp.x * 0.5 + 0.5) * W, y: (-tmp.y * 0.5 + 0.5) * H };
  }
  function segInfo(i) { var s = strings[i]; return { A: toPx(s.a), B: toPx(s.b) }; }
  function nearestString(px, py, tol) {
    var best = -1, bd = tol, bt = 0.5;
    for (var i = 0; i < strings.length; i++) {
      var s = segInfo(i), dx = s.B.x - s.A.x, dy = s.B.y - s.A.y, l2 = dx * dx + dy * dy;
      var t = Math.max(0, Math.min(1, ((px - s.A.x) * dx + (py - s.A.y) * dy) / l2));
      var d = Math.hypot(px - (s.A.x + dx * t), py - (s.A.y + dy * t));
      if (d < bd) { bd = d; best = i; bt = t; }
    }
    return best < 0 ? null : { i: best, t: bt };
  }
  function side(s, x, y) { return (s.B.x - s.A.x) * (y - s.A.y) - (s.B.y - s.A.y) * (x - s.A.x); }

  function vibrate(i, vel) {
    var s = strings[i]; if (!s) return;
    s.amp = Math.max(s.amp, (s.A0 || A0) * Math.min(1.2, vel || 1));
  }
  function stringPoint(i, t) {
    var s = strings[i], r = canvas.getBoundingClientRect();
    var a = toPx(s.a), b = toPx(s.b), tt = t == null ? 0.55 : t;
    return { x: r.left + a.x + (b.x - a.x) * tt, y: r.top + a.y + (b.y - a.y) * tt };
  }
  function pluckAt(i, t, vel) {
    var r = canvas.getBoundingClientRect(), s = segInfo(i);
    var cx = r.left + s.A.x + (s.B.x - s.A.x) * t, cy = r.top + s.A.y + (s.B.y - s.A.y) * t;
    var fr = fretAt(t);
    markAt(i, t);
    if (window.RS && window.RS.pluck) window.RS.pluck(i, { cx: cx, cy: cy, vel: vel, t: t, fret: fr });
    else vibrate(i, vel);
  }

  var last = null, lastHit = [0, 0, 0, 0, 0, 0, 0, 0], mode = null;
  function local(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  canvas.addEventListener('pointerdown', function (e) {
    var p = local(e), hit = nearestString(p.x, p.y, e.pointerType === 'touch' ? 22 : 14);
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    last = p; view.idleAt = performance.now() + 5000;
    if (hit) { mode = 'strum'; lastHit[hit.i] = performance.now(); pluckAt(hit.i, hit.t, 0.95); }
    else { mode = 'orbit'; dragging = { x: p.x, y: p.y }; view.yawV = 0; canvas.style.cursor = 'grabbing'; }
  });
  canvas.addEventListener('pointermove', function (e) {
    var p = local(e);
    if (!mode) {
      var h = nearestString(p.x, p.y, 12);
      canvas.style.cursor = h ? 'pointer' : 'grab';
      strings.forEach(function (s, k) { s.hover = h && h.i === k ? 1 : 0; });
      return;
    }
    view.idleAt = performance.now() + 5000;
    if (mode === 'strum' && last) {
      var now = performance.now();
      for (var i = 0; i < strings.length; i++) {
        var s = segInfo(i), a = side(s, last.x, last.y), b = side(s, p.x, p.y);
        if (((a < 0 && b >= 0) || (a > 0 && b <= 0)) && now - lastHit[i] > 80) {
          var f = Math.abs(a) / (Math.abs(a) + Math.abs(b) || 1);
          var cx = last.x + (p.x - last.x) * f, cy = last.y + (p.y - last.y) * f;
          var dx = s.B.x - s.A.x, dy = s.B.y - s.A.y;
          var t = Math.max(0, Math.min(1, ((cx - s.A.x) * dx + (cy - s.A.y) * dy) / (dx * dx + dy * dy)));
          lastHit[i] = now; pluckAt(i, t, Math.min(1, 0.55 + Math.hypot(p.x - last.x, p.y - last.y) / 45));
        }
      }
    } else if (mode === 'orbit' && dragging) {
      var ddx = p.x - dragging.x, ddy = p.y - dragging.y;
      view.yaw += ddx * 0.011; view.yawV = ddx * 0.011;
      view.pitch = Math.max(-0.4, Math.min(0.4, view.pitch + ddy * 0.004));
      dragging = { x: p.x, y: p.y };
    }
    last = p;
  });
  function release() { mode = null; dragging = null; last = null; canvas.style.cursor = 'grab'; }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', function () { if (!mode) strings.forEach(function (s) { s.hover = 0; }); });
  canvas.style.cursor = 'grab';

  /* ---------------------------------------------------------------- render loop */
  var visible = true, raf = 0, t0 = performance.now(), prev = t0;
  function frame(now) {
    raf = 0;
    if (!visible || document.hidden) return;
    var dt = Math.min(0.05, (now - prev) / 1000); prev = now;
    var t = (now - t0) / 1000;

    if (!reduce) {
      if (view.intro < 1) {
        view.intro = Math.min(1, view.intro + dt / 2.4);
        var e = 1 - Math.pow(1 - view.intro, 3);
        view.yaw = -1.5 + (view.base + 0.0 + 1.5) * e;
      } else if (!mode) {
        if (Math.abs(view.yawV) > 0.0005) { view.yaw += view.yawV; view.yawV *= 0.93; }
        else if (now > view.idleAt) {
          var target = view.base + Math.sin(t * 0.33) * 0.42;
          view.yaw += (target - view.yaw) * Math.min(1, dt * 0.9);
          view.pitch += (0.06 + Math.sin(t * 0.21) * 0.03 - view.pitch) * Math.min(1, dt * 0.8);
        }
      }
    }
    pivot.rotation.set(view.pitch, view.yaw, -0.10, 'YXZ');
    if (swap < 1) { swap = Math.min(1, swap + dt / 0.6); var se = 1 - Math.pow(1 - swap, 3); pivot.scale.setScalar(0.8 + 0.2 * se); } else if (pivot.scale.x !== 1) pivot.scale.setScalar(1);
    if (markerLife > 0) { markerLife = Math.max(0, markerLife - dt * 2.2); marker.material.opacity = markerLife; marker.scale.setScalar(1 + (1 - markerLife) * 1.6); }

    var any = false;
    strings.forEach(function (s) {
      s.amp *= Math.exp(-dt * 1.7);
      if (s.amp < 0.0004) s.amp = 0; else any = true;
      s.uni.uAmp.value = s.amp; s.uni.uTime.value = t;
      s.mat.emissiveIntensity = Math.min(1.4, s.amp / (s.A0 || A0) * 1.3) + s.hover * 0.35;
    });
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  function start() { if (!raf) { prev = performance.now(); raf = requestAnimationFrame(frame); } }
  if ('IntersectionObserver' in window) new IntersectionObserver(function (en) { visible = en[0].isIntersecting; if (visible) start(); }).observe(stage);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) start(); });
  start();

  stage.classList.add('gl-ready');
  window.Inst3D = window.Tanpura3D = {
    vibrate: vibrate,
    stringPoint: stringPoint,
    setInstrument: setInstrument,
    fretAt: fretAt,
    info: function () { return { name: curName, strings: strings.length, fretted: cur.fretted, nFrets: cur.nFrets }; },
    setFinish: function (n) { applyFinish(n); },
    setView: function (yaw, pitch) { view.intro = 1; view.yaw = yaw; view.pitch = pitch || 0; view.idleAt = performance.now() + 1e9; },
    finish: function () { return finishName; }
  };
}
