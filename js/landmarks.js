/* Meridian landmarks: hand-built cartoon 3D models of famous buildings, drawn on the detail map.
   Models are made in code (metres, Y up) with toon shading and an ink outline. three.js loads only when the map opens. */
(() => {
  'use strict';
  const SRC = new URL('vendor/three.module.min.js', document.baseURI).href;
  let T = null, lib = null, built = null;
  const load = () => lib ||= import(SRC).then(m => { T = m; });

  /* ---------- tiny modelling kit ---------- */
  const mats = new Map();
  const mat = (color, double) => {
    const k = color + (double ? 'd' : '');
    if (!mats.has(k)) mats.set(k, new T.MeshToonMaterial({ color, side: double ? T.DoubleSide : T.FrontSide }));
    return mats.get(k);
  };
  let ink = null, inkT = 1.2;
  // add a mesh plus a slightly larger dark back-face shell, which reads as a drawn outline
  const put = (g, geom, color, x = 0, y = 0, z = 0, o = {}) => {
    const m = new T.Mesh(geom, mat(color, o.double));
    m.position.set(x, y, z);
    if (o.rx) m.rotation.x = o.rx; if (o.ry) m.rotation.y = o.ry; if (o.rz) m.rotation.z = o.rz;
    if (o.s) m.scale.set(o.s[0], o.s[1], o.s[2]);
    if (!o.noInk) {
      geom.computeBoundingBox();
      const b = geom.boundingBox, sx = (b.max.x - b.min.x) * (o.s?.[0] || 1), sy = (b.max.y - b.min.y) * (o.s?.[1] || 1), sz = (b.max.z - b.min.z) * (o.s?.[2] || 1);
      const h = new T.Mesh(geom, ink);
      h.scale.set(1 + 2 * inkT / Math.max(sx, 1), 1 + 2 * inkT / Math.max(sy, 1), 1 + 2 * inkT / Math.max(sz, 1));
      m.add(h);
    }
    g.add(m); return m;
  };
  const box = (w, h, d) => new T.BoxGeometry(w, h, d);
  const cyl = (rt, rb, h, seg = 16, open = false, len = Math.PI * 2) => new T.CylinderGeometry(rt, rb, h, seg, 1, open, 0, len);
  const sph = (r, w = 16, h = 12) => new T.SphereGeometry(r, w, h);
  const beam = (g, color, a, b, thick) => {
    const A = new T.Vector3(...a), B = new T.Vector3(...b), d = B.clone().sub(A);
    const m = put(g, box(thick, d.length(), thick), color, (A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
    return m;
  };
  const Q = Math.PI / 4;

  /* ---------- models ---------- */
  const lattice = (g, body, deck, H) => {   // Eiffel-style tower, 330 m tall before scaling
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      beam(g, body, [62 * sx, 0, 62 * sz], [33 * sx, 57, 33 * sz], 17);
      beam(g, body, [31 * sx, 63, 31 * sz], [16 * sx, 115, 16 * sz], 11);
    }
    put(g, box(80, 6, 80), deck, 0, 60, 0);
    put(g, box(42, 5, 42), deck, 0, 117.5, 0);
    put(g, cyl(4.5, 15, 160, 4), body, 0, 200, 0, { ry: Q });
    put(g, box(13, 8, 13), deck, 0, 284, 0);
    put(g, cyl(1, 5.5, 12, 4), body, 0, 294, 0, { ry: Q });
    put(g, cyl(0.9, 0.9, 30, 6), body, 0, 315, 0);
    g.scale.setScalar(H / 330);
  };
  const M = {
    eiffel: g => lattice(g, '#c98a5e', '#8f5f43', 330),
    tokyotower: g => lattice(g, '#ff5a3c', '#ffffff', 333),
    opera: g => {
      put(g, box(120, 14, 200), '#e3b99a', 0, 7, 0);
      const sail = (x, z, r, back) => put(g, new T.SphereGeometry(r, 12, 8, Math.PI / 2 - 0.75, 1.5, 0, Math.PI / 2), '#fffdf4', x, 13, z,
        { double: true, noInk: true, ry: back ? 0 : Math.PI, rx: back ? 0.22 : -0.22, s: [1, 1.2, 1] });
      for (const [x, k] of [[-30, 1], [30, 0.86]]) {
        sail(x, 18, 58 * k); sail(x, -22, 46 * k); sail(x, -56, 34 * k); sail(x, 52, 32 * k, true);
      }
      sail(-2, 88, 20); sail(-2, 96, 16, true);
    },
    bigben: g => {
      put(g, box(15, 62, 15), '#dcb97c', 0, 31, 0);
      put(g, box(18, 14, 18), '#ecd092', 0, 69, 0);
      for (let i = 0; i < 4; i++) put(g, cyl(5.6, 5.6, 1, 20), '#ffffff', Math.sin(i * Q * 2) * 9.2, 69, Math.cos(i * Q * 2) * 9.2, { rx: Math.PI / 2, rz: -i * Q * 2, noInk: true });
      put(g, cyl(0, 13, 17, 4), '#55656e', 0, 84.5, 0, { ry: Q });
      put(g, cyl(0, 2.2, 10, 4), '#ffd23f', 0, 97, 0, { ry: Q });
      put(g, box(38, 26, 130), '#dcb97c', -4, 13, 78);
      put(g, box(42, 4, 134), '#55656e', -4, 28, 78);
    },
    pyramids: g => {
      const pyr = (x, z, base, h) => put(g, cyl(0, base / Math.SQRT2, h, 4), '#f4cf86', x, h / 2, z, { ry: Q });
      pyr(0, 0, 230, 139); pyr(-328, 345, 215, 136); pyr(-569, 746, 105, 65);
    },
    taj: g => {
      const w = '#fbf6ec';
      put(g, box(100, 7, 100), '#f1e6d2', 0, 3.5, 0);
      put(g, box(58, 32, 58), w, 0, 23, 0);
      for (let i = 0; i < 4; i++) put(g, box(17, 23, 1.2), '#d9cbb8', Math.sin(i * Q * 2) * 29.3, 19, Math.cos(i * Q * 2) * 29.3, { ry: i * Q * 2, noInk: true });
      put(g, cyl(15, 15, 8, 20), w, 0, 43, 0);
      put(g, sph(17), w, 0, 62, 0, { s: [1, 1.22, 1] });
      put(g, cyl(0, 1.3, 11, 8), '#ffd23f', 0, 88, 0);
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        put(g, cyl(5.2, 5.2, 5, 12), w, 19 * sx, 41.5, 19 * sz); put(g, sph(6), w, 19 * sx, 46, 19 * sz);
        put(g, cyl(2.4, 3.1, 42, 10), w, 46 * sx, 28, 46 * sz); put(g, sph(3.4), w, 46 * sx, 50.5, 46 * sz);
      }
    },
    burj: g => {
      for (let i = 0; i < 10; i++) { const r = 44 * (1 - i / 11.5); put(g, cyl(r * 0.84, r, 70, 6), i % 2 ? '#a9cdea' : '#c4e0f5', 0, i * 70 + 35, 0, { ry: i * 0.52 }); }
      put(g, cyl(0.6, 5, 128, 6), '#e8f4fc', 0, 764, 0);
    },
    liberty: g => {
      const c = '#7fd3b6';
      put(g, cyl(33, 36, 10, 11), '#cbb99d', 0, 5, 0);
      put(g, cyl(9, 14, 37, 4), '#decfb3', 0, 28.5, 0, { ry: Q });
      put(g, cyl(3.2, 7, 30, 10), c, 0, 62, 0);
      put(g, sph(3.1), c, 0, 80, 0);
      put(g, cyl(4.6, 3.3, 1.6, 7), c, 0, 82.6, 0);
      beam(g, c, [2, 74, 0], [6.2, 90, 0], 2.1);
      put(g, sph(2.3, 8, 6), '#ffd23f', 6.6, 92.6, 0);
      put(g, box(3.2, 5, 1.5), c, -4.2, 68, 2.2);
    },
    colosseum: g => {
      const o = { double: true, noInk: true };
      put(g, cyl(1, 1, 2, 44), '#c9a673', 0, 1, 0, { s: [95, 1, 79], noInk: true });
      put(g, cyl(1, 1, 48, 44, true, 3.7), '#efd6a6', 0, 24, 0, { ...o, s: [94, 1, 78] });
      put(g, cyl(1, 1, 31, 44, true), '#e6c995', 0, 15.5, 0, { ...o, s: [92, 1, 76] });
      put(g, cyl(1, 0.6, 24, 44, true), '#dcbf8a', 0, 13, 0, { ...o, s: [90, 1, 74] });
      put(g, cyl(1, 1, 1.2, 36), '#f3e6c4', 0, 2.4, 0, { s: [46, 1, 30], noInk: true });
    },
    christ: g => {
      put(g, cyl(22, 60, 30, 9), '#7cc46a', 0, -15, 0, { noInk: true });
      put(g, box(6, 8, 6), '#cdd2d5', 0, 4, 0);
      put(g, cyl(1.8, 3.3, 20, 10), '#f5f4ee', 0, 18, 0);
      put(g, box(28, 2.3, 2.3), '#f5f4ee', 0, 25, 0);
      put(g, sph(2, 10, 8), '#f5f4ee', 0, 30, 0);
    },
    goldengate: g => {
      const r = '#f2542d';
      put(g, box(27, 6, 2000), r, 0, 67, 0);
      for (const z of [-640, 640]) {
        for (const x of [-14, 14]) put(g, box(10, 227, 14), r, x, 113.5, z);
        for (const y of [95, 135, 175, 218]) put(g, box(28, 7, 10), r, 0, y, z);
      }
      for (const x of [-14, 14]) {
        beam(g, r, [x, 227, -640], [x, 76, 0], 2.6); beam(g, r, [x, 227, 640], [x, 76, 0], 2.6);
        beam(g, r, [x, 227, -640], [x, 70, -1000], 2.6); beam(g, r, [x, 227, 640], [x, 70, 1000], 2.6);
      }
    },
    watarun: g => {
      const pts = [[28, 0], [24, 12], [18, 14], [16, 30], [11, 34], [9, 55], [5, 62], [3, 78], [0.1, 82]].map(p => new T.Vector2(p[0], p[1]));
      const lathe = new T.LatheGeometry(pts, 12);
      put(g, box(86, 4, 86), '#eadcc0', 0, 2, 0);
      put(g, lathe, '#f7f0e2', 0, 4, 0);
      put(g, cyl(0, 1.4, 8, 6), '#ffd23f', 0, 89, 0);
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) put(g, lathe, '#f7f0e2', 33 * sx, 4, 33 * sz, { s: [0.38, 0.38, 0.38] });
    },
    petronas: g => {
      for (const x of [-29, 29]) {
        put(g, cyl(22, 23, 300, 16), '#cdd8e4', x, 150, 0); put(g, cyl(17, 19, 50, 16), '#dde6ee', x, 325, 0);
        put(g, cyl(11, 14, 40, 16), '#cdd8e4', x, 370, 0); put(g, cyl(5, 9, 25, 12), '#dde6ee', x, 402.5, 0);
        put(g, cyl(0.5, 4, 37, 8), '#f2f6f9', x, 433.5, 0);
      }
      put(g, box(36, 7, 6), '#aebccb', 0, 172, 0);
    },
    empire: g => {
      const c = '#dccfb9';
      put(g, box(130, 30, 60), c, 0, 15, 0); put(g, box(100, 60, 52), c, 0, 60, 0); put(g, box(62, 230, 42), '#e6dac6', 0, 205, 0);
      put(g, box(40, 40, 30), c, 0, 340, 0); put(g, box(22, 21, 22), '#e6dac6', 0, 370.5, 0);
      put(g, cyl(1, 6, 62, 8), '#aebccb', 0, 412, 0);
    },
    pisa: g => {
      const t = new T.Group(); t.rotation.z = 0.07; g.add(t);
      put(t, cyl(7.7, 7.7, 56, 20), '#f8f3e8', 0, 28, 0);
      for (let y = 9; y < 56; y += 8) put(t, cyl(8.4, 8.4, 1.3, 20), '#e3d8c3', 0, y, 0, { noInk: true });
      put(t, cyl(6, 6, 8, 16), '#f8f3e8', 0, 60, 0);
    },
    mbs: g => {
      for (const z of [-78, 0, 78]) put(g, box(38, 195, 26), '#c9e2ec', 0, 97.5, z);
      put(g, box(40, 8, 340), '#f1f6f8', 0, 199, 6);
      put(g, box(30, 3, 300), '#8fdd78', 0, 204.5, 6, { noInk: true });
    },
    londoneye: g => {
      put(g, new T.TorusGeometry(60, 2.2, 8, 40), '#f3f6fa', 0, 68, 0, { noInk: true });
      for (let i = 0; i < 16; i++) {
        const a = i * Math.PI / 8;
        if (i % 2 === 0) beam(g, '#dfe6ee', [0, 68, 0], [Math.cos(a) * 60, 68 + Math.sin(a) * 60, 0], 0.9).children[0].visible = false;
        put(g, sph(3.6, 8, 6), '#8fd3ff', Math.cos(a) * 62, 68 + Math.sin(a) * 62, 0);
      }
      put(g, cyl(4, 4, 8, 12), '#f3f6fa', 0, 68, 0, { rx: Math.PI / 2 });
      beam(g, '#f3f6fa', [0, 68, -5], [26, 0, -34], 3.2); beam(g, '#f3f6fa', [0, 68, -5], [-26, 0, -34], 3.2);
    },
    cntower: g => {
      put(g, cyl(6, 17, 340, 10), '#d6dadf', 0, 170, 0); put(g, cyl(22, 17, 20, 18), '#eef1f4', 0, 350, 0);
      put(g, cyl(4, 6, 100, 10), '#d6dadf', 0, 410, 0); put(g, cyl(0.6, 3, 93, 6), '#ff5a3c', 0, 506.5, 0);
    },
    spaceneedle: g => {
      put(g, cyl(3, 10, 150, 6), '#f5f5f2', 0, 75, 0); put(g, cyl(21, 8, 10, 20), '#f5f5f2', 0, 152, 0);
      put(g, cyl(9, 21, 6, 20), '#ff8c42', 0, 160, 0); put(g, cyl(0.4, 2, 21, 6), '#f5f5f2', 0, 173.5, 0);
    },
    skytree: g => {
      put(g, cyl(8, 34, 450, 8), '#dfe9f2', 0, 225, 0); put(g, cyl(17, 13, 26, 18), '#bcd6ea', 0, 352, 0);
      put(g, cyl(14, 11, 20, 18), '#bcd6ea', 0, 448, 0); put(g, cyl(1.2, 5, 174, 8), '#f5f8fb', 0, 547, 0);
    },
  };

  const LIST = [
    ['eiffel', 'Eiffel Tower', 48.8584, 2.2945], ['tokyotower', 'Tokyo Tower', 35.6586, 139.7454], ['skytree', 'Tokyo Skytree', 35.7101, 139.8107],
    ['opera', 'Sydney Opera House', -33.8568, 151.2153], ['bigben', 'Big Ben', 51.5007, -0.1246], ['londoneye', 'London Eye', 51.5033, -0.1196],
    ['pyramids', 'Pyramids of Giza', 29.9792, 31.1342], ['taj', 'Taj Mahal', 27.1751, 78.0421], ['burj', 'Burj Khalifa', 25.1972, 55.2744],
    ['liberty', 'Statue of Liberty', 40.6892, -74.0445], ['empire', 'Empire State Building', 40.7484, -73.9857], ['colosseum', 'Colosseum', 41.8902, 12.4922],
    ['pisa', 'Leaning Tower of Pisa', 43.723, 10.3966], ['christ', 'Christ the Redeemer', -22.9519, -43.2105], ['goldengate', 'Golden Gate Bridge', 37.8199, -122.4783],
    ['watarun', 'Wat Arun', 13.7437, 100.4889], ['petronas', 'Petronas Towers', 3.1579, 101.7116], ['mbs', 'Marina Bay Sands', 1.2834, 103.8607],
    ['cntower', 'CN Tower', 43.6426, -79.3871], ['spaceneedle', 'Space Needle', 47.6205, -122.3493],
  ].map(([key, name, lat, lng]) => ({ key, name, lat, lng, group: null }));

  const build = () => {
    if (built) return built;
    ink = new T.MeshBasicMaterial({ color: 0x33283f, side: T.BackSide });
    const scene = new T.Scene(), camera = new T.Camera();
    const sun = new T.DirectionalLight(0xffffff, 2.4); sun.position.set(-0.6, 1, 0.8); scene.add(sun);
    scene.add(new T.AmbientLight(0xffffff, 1.5));
    for (const L of LIST) {
      const g = new T.Group(); inkT = 1.2;
      try { M[L.key](g); } catch (e) { console.warn('landmark', L.key, e); }
      L.group = new T.Group(); L.group.add(g); L.group.visible = false; scene.add(L.group);
    }
    return built = { scene, camera };
  };

  const layer = map => ({
    id: 'landmarks', type: 'custom', renderingMode: '3d',
    onAdd(m, gl) {
      const { scene, camera } = build();
      this.scene = scene; this.camera = camera;
      this.renderer = m.__lmRenderer ||= new T.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
      this.renderer.autoClear = false;
    },
    render(gl, args) {
      const z = map.getZoom(); if (z < 8.5) return;
      const c = map.getCenter(), near = LIST.filter(L => Math.abs(L.lat - c.lat) < 2 && Math.abs(L.lng - c.lng) < 3);
      if (!near.length) return;
      // far away the models are drawn oversized, like toys on the map; close up they settle to near real size
      const k = Math.min(36, Math.max(1.12, 2 ** (14.4 - z)));
      const main = args?.defaultProjectionData?.mainMatrix || args?.modelViewProjectionMatrix || args;
      this.renderer.resetState(); this.renderer.clearDepth();
      for (const L of near) {
        const mm = map.transform.getMatrixForModel([L.lng, L.lat], 0);
        this.camera.projectionMatrix = new T.Matrix4().fromArray(main).multiply(new T.Matrix4().fromArray(mm)).multiply(new T.Matrix4().makeScale(k, k, k));
        LIST.forEach(o => { o.group.visible = o === L; });
        this.renderer.render(this.scene, this.camera);
      }
      this.renderer.resetState();
    },
  });

  window.Landmarks = {
    list: LIST,
    attach(map) {
      load().then(() => {
        if (map.getLayer('landmarks')) return;
        const before = map.getStyle().layers.find(l => l.type === 'symbol')?.id;
        map.addLayer(layer(map), before);
      }).catch(e => console.warn('landmarks unavailable', e));
    },
  };
})();
