// Post passes: painterly (Kuwahara) brush pass for the background, and the compositor that
// combines painted BG, cel FG, ink lines, haze, flash and fade.
import * as THREE from 'three';
import { PALETTE } from '../../shared/map.js';

function fsQuad(mat) { const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); q.frustumCulled = false; const s = new THREE.Scene(); s.add(q); return s; }
const VS = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export function makePaintPass() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { tex: { value: null }, uTexel: { value: new THREE.Vector2(1 / 960, 1 / 540) }, uRadius: { value: 3 } },
    vertexShader: VS,
    fragmentShader: /* glsl */`
      uniform sampler2D tex; uniform vec2 uTexel; uniform int uRadius; varying vec2 vUv;
      // Kuwahara filter: picks the sector with the lowest variance -> flat brush-like regions with crisp edges
      void main(){
        vec3 m[4]; vec3 s[4]; float n = 0.0;
        for (int k=0;k<4;k++){ m[k]=vec3(0.0); s[k]=vec3(0.0); }
        int r = uRadius;
        for (int j=-3;j<=0;j++) for (int i=-3;i<=0;i++){ vec3 c = texture2D(tex, vUv + vec2(float(i),float(j))*uTexel).rgb; m[0]+=c; s[0]+=c*c; }
        for (int j=-3;j<=0;j++) for (int i=0;i<=3;i++){ vec3 c = texture2D(tex, vUv + vec2(float(i),float(j))*uTexel).rgb; m[1]+=c; s[1]+=c*c; }
        for (int j=0;j<=3;j++) for (int i=0;i<=3;i++){ vec3 c = texture2D(tex, vUv + vec2(float(i),float(j))*uTexel).rgb; m[2]+=c; s[2]+=c*c; }
        for (int j=0;j<=3;j++) for (int i=-3;i<=0;i++){ vec3 c = texture2D(tex, vUv + vec2(float(i),float(j))*uTexel).rgb; m[3]+=c; s[3]+=c*c; }
        n = 16.0;
        float minS = 1e9; vec3 col = vec3(0.0);
        for (int k=0;k<4;k++){ m[k]/=n; s[k]=abs(s[k]/n - m[k]*m[k]); float sig = s[k].r+s[k].g+s[k].b; if (sig < minS){ minS = sig; col = m[k]; } }
        gl_FragColor = vec4(col, 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  return { scene: fsQuad(mat), mat };
}

export function makeComposite(width, height) {
  const c = (h) => new THREE.Color(h);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      tBg: { value: null }, tBgDepth: { value: null }, tFg: { value: null }, tFgDepth: { value: null },
      tData: { value: null }, tDataDepth: { value: null },
      uRes: { value: new THREE.Vector2(width, height) }, uNear: { value: 0.2 }, uFar: { value: 2500 },
      uHaze: { value: 0 }, uHazeColor: { value: c(0xD9B26A) }, uAerial: { value: c(0xA9D4F2) },
      uFlash: { value: 0 }, uFlashColor: { value: c(0xDFFCFF) }, uFade: { value: 0 },
      uInkChar: { value: c(PALETTE.ink) }, uInkGiant: { value: c(PALETTE.inkGiant) }, uInkBg: { value: c(PALETTE.inkBg) }, uInkSteam: { value: c(0x6E7FA3) }, uInkDust: { value: c(0x7A5A2A) },
      uSeed: { value: 0 }, uLineScale: { value: 1.0 },
    },
    vertexShader: VS,
    fragmentShader: /* glsl */`
      uniform sampler2D tBg, tBgDepth, tFg, tFgDepth, tData, tDataDepth;
      uniform vec2 uRes; uniform float uNear, uFar, uHaze, uFlash, uFade, uSeed, uLineScale;
      uniform vec3 uHazeColor, uAerial, uFlashColor, uInkChar, uInkGiant, uInkBg, uInkSteam, uInkDust;
      varying vec2 vUv;
      float lin(float d){ float z = d*2.0-1.0; return 2.0*uNear*uFar/(uFar+uNear - z*(uFar-uNear)); }
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
      // ink class from id: 0 none, 1 character, 2 giant/automaton, 3 steam, 4 dust, 5 debris/boulder, 6 bg
      int classOf(float id255){ int id = int(id255*255.0+0.5);
        if (id == 0) return 0; if (id < 100) return 1; if (id < 140) return 2; if (id == 150) return 3; if (id == 151) return 4;
        if (id >= 180 && id <= 183) return 0; if (id < 200) return 5; return 6; }
      void main(){
        vec2 px = 1.0/uRes;
        // hand-drawn wobble of the sampling position, static per shot
        vec2 wob = (vec2(vnoise(vUv*uRes*0.08 + uSeed*17.0), vnoise(vUv*uRes*0.08 + 31.0 + uSeed*17.0)) - 0.5) * 0.9 * px;
        vec2 uv = vUv + wob;
        vec4 dC = texture2D(tData, uv); float zC = lin(texture2D(tDataDepth, uv).x);
        // line weight: thicker close up, thinner far away, with hand-pressure variation
        float wBase = clamp(2.3 - zC * 0.012, 1.0, 2.3) * (0.85 + 0.3 * vnoise(vUv*uRes*0.03 + uSeed)) * uLineScale;
        float w = wBase;
        float idEdge = 0.0, dEdge = 0.0, nEdge = 0.0; float zMin = zC; float idMin = dC.a; vec3 nC = dC.xyz*2.0-1.0;
        float grazing = 1.0 - abs(nC.z);
        for (int i=0;i<8;i++){
          float a = float(i) * 0.785398;
          vec2 o = vec2(cos(a), sin(a)) * w * px;
          vec4 dS = texture2D(tData, uv+o); float zS = lin(texture2D(tDataDepth, uv+o).x);
          if (abs(dS.a - dC.a) > 0.5/255.0) idEdge = 1.0;
          float rel = abs(zS - zC) / max(min(zS, zC), 0.05);
          float thr = 0.006 + 0.07 * grazing * grazing;
          dEdge = max(dEdge, smoothstep(thr, thr*2.5, rel));
          vec3 nS = dS.xyz*2.0-1.0; nEdge = max(nEdge, smoothstep(0.5, 0.8, 1.0 - dot(nS, nC)));
          if (zS < zMin) { zMin = zS; idMin = dS.a; }
        }
        int cls = classOf(idMin);
        float ink = max(idEdge, max(dEdge, nEdge*0.85));
        if (cls == 0) ink = 0.0;
        // thinner, lighter lines for far things and for the background class
        float distFade = 1.0 - smoothstep(60.0, 400.0, zMin);
        vec3 inkCol = uInkChar; float inkA = 1.0;
        if (cls == 2) { inkCol = uInkGiant; inkA = 0.95; }
        else if (cls == 3) { inkCol = uInkSteam; inkA = 0.75; }
        else if (cls == 4) { inkCol = uInkDust; inkA = 0.6; }
        else if (cls == 5) { inkCol = mix(uInkBg, uInkChar, 0.5); inkA = 0.9; }
        else if (cls == 6) { inkCol = uInkBg; inkA = 0.55 * (0.4 + 0.6*distFade); ink *= max(idEdge, dEdge); }
        // compose layers by depth
        vec4 fg = texture2D(tFg, vUv); float zF = lin(texture2D(tFgDepth, vUv).x);
        vec3 bg = texture2D(tBg, vUv).rgb; float zB = lin(texture2D(tBgDepth, vUv).x);
        // paper grain on the painted background only
        float grain = (vnoise(vUv*uRes*0.22) - 0.5) * 0.03 + (vnoise(vUv*uRes*0.045 + 5.0) - 0.5) * 0.045;
        bg *= 1.0 + grain;
        bool useFg = fg.a > 0.5 && zF < zB;
        vec3 col = useFg ? fg.rgb : bg;
        float z = useFg ? zF : zB;
        // aerial perspective: cool blue far away, ochre dust after the kick
        bool isSky = z > uFar * 0.9;
        if (!isSky) {
          float aer = 1.0 - exp(-z * 0.0009);
          col = mix(col, uAerial, aer * 0.35 * (1.0 - uHaze));
          float dustF = 1.0 - exp(-z * (0.004 + 0.02*uHaze));
          col = mix(col, uHazeColor, uHaze * dustF * 0.85);
        }
        col = mix(col, inkCol, ink * inkA * (useFg ? 1.0 : 1.0));
        // vignette
        vec2 q = vUv - 0.5; col *= 1.0 - dot(q,q) * 0.35;
        col = mix(col, uFlashColor, uFlash);
        col = mix(col, vec3(0.0), uFade);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    depthTest: false, depthWrite: false,
  });
  return { scene: fsQuad(mat), mat };
}
