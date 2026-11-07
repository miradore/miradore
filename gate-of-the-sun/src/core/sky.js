// Painted sky: cobalt gradient and hard-edged cumulus with lavender shadows. Drawn as a
// full-screen pass into the background target before the BG geometry.
import * as THREE from 'three';
import { PALETTE } from '../../shared/map.js';

export function makeSky() {
  const c = (h) => new THREE.Color(h);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
      uZenith: { value: c(PALETTE.skyZenith) }, uSky: { value: c(PALETTE.sky) }, uHorizon: { value: c(PALETTE.skyHorizon) },
      uCloud: { value: c(PALETTE.cloud) }, uCloudShade: { value: c(PALETTE.cloudShade) },
      uHaze: { value: 0 }, uHazeColor: { value: c(0xD9B26A) }, uSeed: { value: 0 },
    },
    depthWrite: false, depthTest: false,
    vertexShader: /* glsl */`
      varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform mat4 uInvProj, uCamWorld; uniform vec3 uZenith, uSky, uHorizon, uCloud, uCloudShade, uHazeColor; uniform float uHaze, uSeed;
      varying vec2 vUv;
      float h3(vec3 p){ p = fract(p*0.3183099 + vec3(0.1,0.2,0.3)); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      float n3(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
      float fbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s+=a*n3(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=0.5; } return s; }
      void main(){
        vec4 vp = uInvProj * vec4(vUv*2.0-1.0, 1.0, 1.0); vec3 dv = normalize(vp.xyz/vp.w);
        vec3 d = normalize((uCamWorld * vec4(dv,0.0)).xyz);
        float e = clamp(d.y, -0.2, 1.0);
        vec3 sky = mix(uHorizon, uSky, smoothstep(0.0, 0.25, e));
        sky = mix(sky, uZenith, smoothstep(0.3, 0.9, e));
        // cumulus: project direction onto a cloud plane at height 1 (so clouds get perspective)
        vec3 col = sky;
        if (d.y > 0.015) {
          vec2 cp = d.xz / (d.y + 0.08) * 1.6 + vec2(uSeed*3.1, 0.0);
          // two cloud scales: big cumulus towers and small puffs
          float dens = fbm(vec3(cp*0.55, 1.0 + uSeed)) * 0.75 + fbm(vec3(cp*1.7 + 7.0, 3.0 + uSeed)) * 0.25;
          float cover = smoothstep(0.53, 0.56, dens);                   // hard painted edge
          // shadow where the cloud is thicker above this point (flat lavender undersides)
          vec2 cpUp = cp * 0.93;
          float densUp = fbm(vec3(cpUp*0.55, 1.0 + uSeed)) * 0.75 + fbm(vec3(cpUp*1.7 + 7.0, 3.0 + uSeed)) * 0.25;
          float shade = smoothstep(0.015, 0.05, densUp - dens);
          shade = max(shade, smoothstep(0.60, 0.66, dens) * 0.6);    // deep interior slightly shaded
          vec3 cc = mix(uCloud, uCloudShade, shade);
          float fade = smoothstep(0.02, 0.10, d.y);
          col = mix(col, cc, cover * fade);
        }
        // far haze toward the horizon (aerial perspective), dust haze when uHaze > 0
        float hz = 1.0 - smoothstep(0.0, 0.22, e);
        col = mix(col, uHorizon, hz*0.5);
        col = mix(col, uHazeColor, uHaze * (0.35 + 0.65*hz));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const scene = new THREE.Scene(); scene.add(quad);
  const cam = new THREE.Camera();
  return {
    scene, cam, mat,
    update(camera, haze, seed) {
      mat.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
      mat.uniforms.uCamWorld.value.copy(camera.matrixWorld);
      mat.uniforms.uHaze.value = haze; mat.uniforms.uSeed.value = seed;
    },
  };
}
