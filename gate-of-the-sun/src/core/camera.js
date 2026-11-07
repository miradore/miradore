// Camera rig: interpolates the shot's camera keys (position, look, fov) with easing, adds
// bounded shake windows. Pure function of the frame so renders are reproducible.
import * as THREE from 'three';
import { ANCHORS, smooth, easeIn, easeOut, lerp, hash1 } from '../../shared/map.js';
import { frameInfo } from './timeline.js';

const EASES = { linear: (t) => t, inout: smooth, in: easeIn, out: easeOut };
export const ANCHOR_OVERRIDES = {};   // departments may update anchors per frame (e.g. hare standing pose)

function resolve(p) {
  if (Array.isArray(p)) return new THREE.Vector3(p[0], p[1], p[2]);
  const a = ANCHOR_OVERRIDES[p.anchor] || ANCHORS[p.anchor];
  if (!a) throw new Error('unknown anchor ' + p.anchor);
  const off = p.off || [0, 0, 0];
  return new THREE.Vector3(a[0] + off[0], a[1] + off[1], a[2] + off[2]);
}

export function cameraState(frame) {
  const info = frameInfo(frame);
  const shot = info.shot;
  const keys = shot.cam;
  const ease = EASES[shot.ease || 'inout'];
  let k0 = keys[0], k1 = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) if (info.local >= keys[i].f && info.local <= keys[i + 1].f) { k0 = keys[i]; k1 = keys[i + 1]; break; }
  const span = Math.max(1, k1.f - k0.f);
  const u = ease(Math.min(1, Math.max(0, (info.local - k0.f) / span)));
  const pos = resolve(k0.pos).lerp(resolve(k1.pos), u);
  const look = resolve(k0.look).lerp(resolve(k1.look), u);
  let fov = shot.fov;
  if (Array.isArray(fov)) fov = lerp(fov[0], fov[1], ease(info.localT)); 
  // shake: sum of two sines, decays over the window, in camera right/up
  let shakeX = 0, shakeY = 0, roll = 0;
  if (shot.shake) for (const s of shot.shake) {
    if (info.local >= s.start && info.local <= s.end) {
      const w = (info.local - s.start) / Math.max(1, s.end - s.start);
      const env = Math.sin(Math.PI * Math.min(1, w * 4)) * (1 - w) ;   // fast attack, decay
      const tt = info.local / 24;
      const ph = hash1(shot.id) * 10;
      shakeX += s.amp * env * (Math.sin(tt * s.freq * 6.283 + ph) * 0.7 + Math.sin(tt * s.freq * 3.1 + ph * 2) * 0.3);
      shakeY += s.amp * env * (Math.cos(tt * s.freq * 5.1 + ph * 3) * 0.7 + Math.sin(tt * s.freq * 2.3) * 0.3);
      roll += s.amp * env * 0.01 * Math.sin(tt * s.freq * 4.0);
    }
  }
  return { info, pos, look, fov, shakeX, shakeY, roll, shadowSize: shot.shadowSize || 200, haze: shot.haze || 0 };
}

export function applyCamera(camera, st) {
  camera.position.copy(st.pos);
  camera.up.set(0, 1, 0);
  camera.lookAt(st.look);
  camera.fov = st.fov;
  // shake in camera space
  if (st.shakeX || st.shakeY || st.roll) {
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    camera.position.addScaledVector(right, st.shakeX).addScaledVector(up, st.shakeY);
    camera.rotateZ(st.roll);
  }
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}
