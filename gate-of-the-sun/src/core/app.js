// Core application: scene, sun, layered render passes, department registry, headless frame API.
import * as THREE from 'three';
import * as MAP from '../../shared/map.js';
import { makeCel, makeFlat, makeDataMaterial, setOpacity } from './materials.js';
import { makeSky } from './sky.js';
import { cameraState, applyCamera, ANCHOR_OVERRIDES } from './camera.js';
import { frameInfo, SHOTS } from './timeline.js';
import { makePaintPass, makeComposite } from './passes.js';

const { WIDTH, HEIGHT, LAYER, ID } = MAP;

export async function createApp({ canvas, departments, scale = 1 }) {
  const W = Math.round(WIDTH * scale), H = Math.round(HEIGHT * scale);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setSize(W, H, false);
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;       // hard cel shadows
  renderer.shadowMap.autoUpdate = false;
  renderer.autoClear = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, W / H, 0.2, 2500);
  scene.add(camera);

  // Sun: afternoon, high, from the south-west so the town-facing wall and the giant are lit.
  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(-0.45, 0.8, 0.42).normalize().multiplyScalar(600);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.6;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 1600;
  sun.layers.enableAll(); scene.add(sun); scene.add(sun.target);

  // render targets
  const dataRT = new THREE.WebGLRenderTarget(W, H, { depthTexture: new THREE.DepthTexture(W, H, THREE.UnsignedIntType), depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const fgRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(W, H, THREE.UnsignedIntType), depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const bw = Math.round(W / 2), bh = Math.round(H / 2);
  const bgRT = new THREE.WebGLRenderTarget(bw, bh, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(bw, bh, THREE.UnsignedIntType), depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const bgPaintRT = new THREE.WebGLRenderTarget(bw, bh, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });

  const sky = makeSky();
  const paint = makePaintPass(); paint.mat.uniforms.uTexel.value.set(1 / bw, 1 / bh);
  const comp = makeComposite(W, H);
  comp.mat.uniforms.tBg.value = bgPaintRT.texture; comp.mat.uniforms.tBgDepth.value = bgRT.depthTexture;
  comp.mat.uniforms.tFg.value = fgRT.texture; comp.mat.uniforms.tFgDepth.value = fgRT.depthTexture;
  comp.mat.uniforms.tData.value = dataRT.texture; comp.mat.uniforms.tDataDepth.value = dataRT.depthTexture;
  comp.mat.uniforms.uNear.value = camera.near; comp.mat.uniforms.uFar.value = camera.far;
  comp.mat.uniforms.uLineScale.value = scale;
  const quadCam = new THREE.Camera();
  const dataMat = makeDataMaterial();

  // global post state that departments (FX) can drive per frame
  const post = { flash: 0, fade: 0 };

  // ------------------------------------------------------------- tagging helpers
  function tag(obj, { inkId, layer, castShadow = true, receiveShadow = true, collider = null } = {}) {
    obj.traverse((o) => {
      if (inkId !== undefined) o.userData.inkId = inkId;
      if (layer !== undefined) { o.layers.set(layer); }
      if (o.isMesh) {
        o.castShadow = castShadow; o.receiveShadow = receiveShadow;
        if (collider) o.userData.collider = collider;
      }
    });
    return obj;
  }

  const ctx = {
    THREE, MAP, ID, LAYER, scene, camera, sun, renderer, post, SHOTS,
    makeCel, makeFlat, setOpacity, tag, anchors: ANCHOR_OVERRIDES,
    frameInfo, cameraState,
  };

  // ------------------------------------------------------------- departments
  const built = [];
  for (const d of departments) {
    const r = await d.build(ctx);
    if (!r || !r.group) throw new Error('department ' + d.name + ' returned nothing');
    r.name = d.name;
    scene.add(r.group);
    built.push(r);
  }

  // ------------------------------------------------------------- material swapping for the data pass
  const swapList = [];
  function collectMeshes() {
    swapList.length = 0;
    scene.traverse((o) => { if (o.isMesh || o.isInstancedMesh) swapList.push(o); });
  }
  function onBeforeData(renderer, scene, camera, geometry, material) {
    const u = material.uniforms;
    u.uId.value = this.userData.inkId ?? 0;
    u.uOpacity.value = this.userData.opacity ?? 1;
    const bm = this.userData._beautyMat;
    const map = bm && !Array.isArray(bm) && bm.map && bm.alphaTest > 0 ? bm.map : null;
    u.map.value = map; u.uUseMap.value = map ? 1 : 0; u.uAlphaTest.value = bm && bm.alphaTest ? bm.alphaTest : 0.5;
    material.uniformsNeedUpdate = true;
  }
  function toData() {
    collectMeshes();
    for (const m of swapList) {
      m.userData._beautyMat = m.material; m.userData._beautyOBR = m.onBeforeRender;
      m.material = dataMat; m.onBeforeRender = onBeforeData;
    }
  }
  function toBeauty() {
    for (const m of swapList) { m.material = m.userData._beautyMat; m.onBeforeRender = m.userData._beautyOBR || (() => {}); }
  }

  // ------------------------------------------------------------- per-frame
  let lastState = null;
  function update(frame) {
    const st = cameraState(frame);
    const info = st.info;
    post.flash = 0; post.fade = frame >= MAP.T.BLACK ? 1 : 0;
    // departments first: they may move anchors (e.g. hare standing pose)
    for (const b of built) if (b.update) b.update(frame, info, ctx);
    const st2 = cameraState(frame);          // re-resolve anchors after department updates
    applyCamera(camera, st2);
    // sun shadow camera follows the look target with the shot's shadow size
    const half = st2.shadowSize / 2;
    const sc = sun.shadow.camera;
    sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half;
    sc.updateProjectionMatrix();
    const dir = new THREE.Vector3(-0.45, 0.8, 0.42).normalize();
    sun.target.position.copy(st2.look);
    sun.position.copy(st2.look).addScaledVector(dir, 700);
    sun.target.updateMatrixWorld(); sun.updateMatrixWorld();
    lastState = st2;
    return st2;
  }

  const dbg = new URLSearchParams(location.search);
  if (dbg.get('noshadow')) renderer.shadowMap.enabled = false;
  function render(frame) {
    const st = update(frame);
    if (dbg.get('raw')) { camera.layers.enableAll(); renderer.shadowMap.needsUpdate = true; renderer.setRenderTarget(null); renderer.setClearColor(0x335599, 1); renderer.clear(); renderer.render(scene, camera); return st; }
    const seed = st.info.shot.id;
    // 1) data pass (all layers) + shadow map
    camera.layers.enableAll();
    toData();
    renderer.shadowMap.needsUpdate = true;
    renderer.setRenderTarget(dataRT); renderer.setClearColor(0x000000, 0); renderer.clear(true, true, false);
    renderer.render(scene, camera);
    renderer.shadowMap.needsUpdate = false;
    toBeauty();
    // 2) background: sky then BG layer
    camera.layers.set(LAYER.BG);
    sky.update(camera, st.haze, seed);
    renderer.setRenderTarget(bgRT); renderer.setClearColor(0x000000, 1); renderer.clear(true, true, false);
    renderer.render(sky.scene, sky.cam);
    renderer.render(scene, camera);
    // 3) paint pass
    paint.mat.uniforms.tex.value = bgRT.texture;
    renderer.setRenderTarget(bgPaintRT); renderer.render(paint.scene, quadCam);
    // 4) foreground cel layer
    camera.layers.set(LAYER.FG);
    renderer.setRenderTarget(fgRT); renderer.setClearColor(0x000000, 0); renderer.clear(true, true, false);
    renderer.render(scene, camera);
    // 5) composite + ink to screen
    comp.mat.uniforms.uHaze.value = st.haze; comp.mat.uniforms.uSeed.value = seed;
    comp.mat.uniforms.uFlash.value = post.flash; comp.mat.uniforms.uFade.value = post.fade;
    renderer.setRenderTarget(null); renderer.render(comp.scene, quadCam);
    camera.layers.enableAll();
    return st;
  }

  // visibility / state snapshot for the checker
  function snapshot(frame) {
    const st = update(frame);
    camera.updateMatrixWorld(true);
    const vis = [];
    scene.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && o.name) vis.push({ name: o.name, visible: o.visible && isVisibleUp(o) }); });
    return { frame, shot: st.info.shot.id, pos: camera.position.toArray(), quat: camera.quaternion.toArray(), fov: camera.fov, vis };
  }
  function isVisibleUp(o) { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; }

  return { renderer, scene, camera, sun, built, ctx, render, update, snapshot, W, H };
}
