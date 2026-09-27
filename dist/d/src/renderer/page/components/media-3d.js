'use strict';
// ═══ A 3D model on a page (Procress 14, APP docs/MEDIA-EMBED.md M5) ═════
// three.js r147 draws a .glb / .gltf / .stl / .obj parsed from the bytes
// main hands over — no URL, no fetch. What keeps it light:
//   - it draws only when something changes (a drag, a zoom, a turn, an
//     animation), and not at all while scrolled out of view
//   - at most PC3D_MAX live WebGL contexts per window (Chromium keeps ~16
//     and drops the oldest); past that a block shows its poster until clicked
//   - 50 MB per file (db/media-read.js)
// The first frame becomes the file's poster, for lists and exports.

const PC3D = new Map(); // iid/key → viewer state
const PC3D_MAX = 6;

registerComponent('core.model3d', {
  kind: 'core', labelKey: 'pcModel3d',
  options: () => [
    { key: 'file', type: 'image', cls: 'model', label: 'pcModel3d' },
    { key: 'height', type: 'select', label: 'pcOptHeight', choices: ['s', 'm', 'l'], default: 'm', choiceKey: (v) => `pcSize${pbCap(v)}` },
    { key: 'bg', type: 'select', label: 'pcOptBg', choices: ['theme', 'transparent', 'gradient'], default: 'theme', choiceKey: (v) => `pcBg${pbCap(v)}` },
    { key: 'light', type: 'select', label: 'pcOptLight', choices: ['studio', 'outdoor', 'drama'], default: 'studio', choiceKey: (v) => `pcLight${pbCap(v)}` },
    { key: 'autoRotate', type: 'toggle', label: 'pcOptAutoRotate', default: false },
    { key: 'wireframe', type: 'toggle', label: 'pcOptWireframe', default: false },
    { key: 'anim', type: 'toggle', label: 'pcOptAnim', default: true },
  ],
  render: (c) => {
    const id = pbFileId(pbOpt(c, 'file'));
    if (!id) return pcPickHint(c, 'pcMediaEmpty');
    return `<div class="pc-3d" data-h="${pbOpt(c, 'height')}" data-bg="${pbOpt(c, 'bg')}">
      <div class="pc-3d-stage"></div>
      <div class="pc-3d-cover" role="button" tabindex="0" onclick="pc3dWake(${xj(c.iid)})"
        onkeydown="if(event.key==='Enter'){event.preventDefault();pc3dWake(${xj(c.iid)})}">
        <img src="${pcImgSrc(id, true)}" alt="" onerror="this.remove()"><span>${I.layer} ${t('pcModelShow')}</span></div>
      ${pbArranging(c.page) ? `<button class="btn btn-s btn-sm pc-3d-save" onclick="pc3dSaveView(${xj(c.iid)})">${t('pcModelSaveView')}</button>` : ''}
    </div>`;
  },
  mount: (c) => {
    pc3dStop(c.iid);
    const box = c.root.querySelector('.pc-3d');
    if (!box || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => {
      const st = PC3D.get(c.iid);
      if (st) { st.visible = e.isIntersecting; if (st.visible) pc3dKick(st); return; }
      if (e.isIntersecting) pc3dWake(c.iid, true);
    }, { rootMargin: '100px' });
    io.observe(box);
    PC3D_IO.set(c.iid, io);
  },
});
const PC3D_IO = new Map();
PB_DISPOSERS.push((iid) => { pc3dStop(iid); PC3D_IO.get(iid)?.disconnect(); PC3D_IO.delete(iid); });

// Start the block's viewer — unless the window already has its share of
// live contexts: then an off-screen one is let go, or (passive, from the
// observer) the poster simply stays.
async function pc3dWake(iid, passive = false) {
  if (PC3D.has(iid)) return;
  if (PC3D.size >= PC3D_MAX) {
    const idle = [...PC3D.entries()].filter(([, s]) => !s.visible).sort((a, b) => a[1].used - b[1].used)[0]
      || (passive ? null : [...PC3D.entries()].sort((a, b) => a[1].used - b[1].used)[0]);
    if (!idle) return;
    pc3dStop(idle[0]);
  }
  const b = pbBlockOf(iid);
  const root = pbRoot(iid);
  const box = root?.querySelector('.pc-3d');
  if (!b || !box) return;
  const c = { block: b, config: b.config || {} };
  const id = pbFileId(pbOpt(c, 'file'));
  box.classList.add('live');
  try {
    await pc3dView(box.querySelector('.pc-3d-stage'), id, {
      key: iid, bg: pbOpt(c, 'bg'), light: pbOpt(c, 'light'), autoRotate: pbOpt(c, 'autoRotate'),
      wireframe: pbOpt(c, 'wireframe'), anim: pbOpt(c, 'anim'), camera: c.config.opts?.camera,
    });
  } catch (e) {
    box.classList.remove('live');
    box.classList.add('failed'); // the reason, not the poster, is what shows
    box.querySelector('.pc-3d-stage').innerHTML = pbMediaError(e?.code || 'failed');
  }
}

// A viewer in `stage`. opts.key names it in PC3D (a block's iid, or the
// lightbox's own key). → the state.
async function pc3dView(stage, fileId, opts = {}) {
  const key = opts.key || `lb-${fileId}`;
  pc3dStop(key);
  const r = await api.importdock.readBinary(fileId);
  if (!r?.ok) throw Object.assign(new Error(r?.error), { code: r?.error });
  const THREE = await pbThree();
  const bytes = pbBytes(r);
  const obj = await pc3dParse(THREE, r.ext, bytes);

  const canvas = document.createElement('canvas');
  stage.innerHTML = '';
  stage.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputEncoding = THREE.sRGBEncoding;
  const scene = new THREE.Scene();
  if (opts.bg === 'theme') scene.background = new THREE.Color(getComputedStyle(stage).getPropertyValue('--surface').trim() || 'rgb(24,24,31)');
  pc3dLights(THREE, scene, opts.light);
  const model = obj.scene;
  if (opts.wireframe) model.traverse((m) => { if (m.isMesh) [].concat(m.material).forEach((mt) => { mt.wireframe = true; }); });
  scene.add(model);

  // frame it: centred, the camera back far enough to see all of it
  const box3 = new THREE.Box3().setFromObject(model);
  const size = box3.getSize(new THREE.Vector3()).length() || 1;
  const centre = box3.getCenter(new THREE.Vector3());
  const camera = new THREE.PerspectiveCamera(40, 1, size / 100, size * 100);
  camera.position.copy(centre).add(new THREE.Vector3(size * 0.6, size * 0.4, size * 0.9));
  const controls = new THREE.OrbitControls(camera, canvas);
  controls.target.copy(centre);
  const cam = opts.camera;
  if (Array.isArray(cam?.p) && Array.isArray(cam?.t) && cam.p.length === 3 && cam.t.length === 3 && [...cam.p, ...cam.t].every(Number.isFinite)) {
    camera.position.set(...cam.p);
    controls.target.set(...cam.t);
  }
  controls.autoRotate = !!opts.autoRotate;
  controls.autoRotateSpeed = 1.2;
  controls.enableDamping = true;
  controls.update();

  const mixer = opts.anim !== false && obj.animations?.length ? new THREE.AnimationMixer(model) : null;
  if (mixer) obj.animations.forEach((clip) => mixer.clipAction(clip).play());

  const st = { key, fileId, renderer, scene, camera, controls, mixer, clock: new THREE.Clock(), raf: 0, visible: true, used: Date.now(), stage };
  const fit = () => {
    const w = stage.clientWidth || 400, h = stage.clientHeight || 300;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    pc3dKick(st);
  };
  st.ro = new ResizeObserver(fit);
  st.ro.observe(stage);
  controls.addEventListener('change', () => { st.used = Date.now(); pc3dKick(st); });
  PC3D.set(key, st);
  fit();
  renderer.render(scene, camera);
  if (typeof pcPosterOnce === 'function') pcPosterOnce(fileId, canvas);
  return st;
}

// Draw one frame; keep drawing only while something moves and it is seen.
function pc3dKick(st) {
  if (st.raf || !PC3D.has(st.key)) return;
  st.raf = requestAnimationFrame(() => {
    st.raf = 0;
    const dt = st.clock.getDelta();
    const moving = st.controls.update() || st.controls.autoRotate || !!st.mixer;
    if (st.mixer) st.mixer.update(dt);
    st.renderer.render(st.scene, st.camera);
    if (moving && st.visible) pc3dKick(st);
  });
}

function pc3dStop(key) {
  const st = PC3D.get(key);
  if (!st) return;
  PC3D.delete(key);
  cancelAnimationFrame(st.raf);
  st.ro?.disconnect();
  st.controls.dispose();
  st.scene.traverse((o) => {
    o.geometry?.dispose?.();
    for (const m of [].concat(o.material || [])) { for (const v of Object.values(m)) v?.isTexture && v.dispose(); m.dispose?.(); }
  });
  st.renderer.dispose();
  st.renderer.forceContextLoss?.();
  st.stage?.closest('.pc-3d')?.classList.remove('live');
}

function pc3dLights(THREE, scene, kind) {
  if (kind === 'outdoor') {
    scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x6b5a3a, 1.1));
    const sun = new THREE.DirectionalLight(0xfff2dd, 1.3);
    sun.position.set(3, 6, 2);
    scene.add(sun);
  } else if (kind === 'drama') {
    scene.add(new THREE.AmbientLight(0xffffff, 0.12));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-4, 3, 1);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x88aaff, 0.8);
    rim.position.set(3, 1, -4);
    scene.add(rim);
  } else {
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444450, 1));
    const a = new THREE.DirectionalLight(0xffffff, 1);
    a.position.set(2, 4, 3);
    scene.add(a);
    const b2 = new THREE.DirectionalLight(0xffffff, 0.4);
    b2.position.set(-3, 1, -2);
    scene.add(b2);
  }
}

// Bytes → { scene, animations }. Never a URL: a .gltf naming a file outside
// itself is refused; its data: buffers are handed to THREE.Cache so the
// loader's fetch (which the CSP forbids) is never made. Textures load as
// <img> (img-src allows blob:/data:), not with fetch: GLTFLoader picks
// ImageBitmapLoader when createImageBitmap exists, so it is hidden for the
// synchronous moment the parser is built.
async function pc3dParse(THREE, ext, bytes) {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const fail = (code) => Object.assign(new Error(code), { code });
  if (ext === 'stl') {
    const geo = new THREE.STLLoader().parse(buf);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xb8bcc8, metalness: 0.1, roughness: 0.6 }));
    const g = new THREE.Group();
    g.add(mesh);
    return { scene: g, animations: [] };
  }
  if (ext === 'obj') {
    const g = new THREE.OBJLoader().parse(new TextDecoder().decode(bytes));
    g.traverse((m) => { if (m.isMesh && !m.material?.map) m.material = new THREE.MeshStandardMaterial({ color: 0xb8bcc8, roughness: 0.6 }); });
    return { scene: g, animations: [] };
  }
  let data = buf;
  if (ext === 'gltf') {
    let json;
    try { json = JSON.parse(new TextDecoder().decode(bytes)); } catch (_) { throw fail('failed'); }
    if (pbGltfExternalUris(json).length) throw fail('external');
    THREE.Cache.enabled = true;
    for (const b of json.buffers || []) if (b.uri) THREE.Cache.add(b.uri, pbDataUriBytes(b.uri));
    data = JSON.stringify(json);
  }
  const saved = window.createImageBitmap;
  return new Promise((resolve, reject) => {
    const loader = new THREE.GLTFLoader();
    try {
      window.createImageBitmap = undefined;
      loader.parse(data, '', (g) => resolve({ scene: g.scene, animations: g.animations || [] }), () => reject(fail('failed')));
    } catch (_) { reject(fail('failed')); } finally { window.createImageBitmap = saved; }
  });
}

// "Save this view": the camera as it is now becomes the block's opening view.
function pc3dSaveView(iid) {
  const st = PC3D.get(iid);
  if (!st) { toast(t('pcModelShowFirst'), 'warn'); return; }
  const r3 = (v) => [v.x, v.y, v.z].map((n) => Math.round(n * 1000) / 1000);
  pbOptSet(iid, 'camera', { p: r3(st.camera.position), t: r3(st.controls.target) });
  toast(t('saved'), 'ok');
}
