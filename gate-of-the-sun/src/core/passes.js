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
      tData: { value: null }, tAux: { value: null }, tDataDepth: { value: null },
      uRes: { value: new THREE.Vector2(width, height) }, uNear: { value: 0.2 }, uFar: { value: 2500 },
      uHaze: { value: 0 }, uHazeColor: { value: c(0xD9B26A) }, uAerial: { value: c(0xA9D4F2) },
      uInkChar: { value: c(PALETTE.ink) }, uInkGiant: { value: c(PALETTE.inkGiant) }, uInkBg: { value: c(PALETTE.inkBg) }, uInkSteam: { value: c(0x5E6E9A) }, uInkDust: { value: c(0x6E4E22) },
      uSeed: { value: 0 }, uLineScale: { value: 1.0 }, uSunView: { value: new THREE.Vector3(0, 1, 0) }, uBgBlur: { value: 0 },
    },
    vertexShader: VS,
    fragmentShader: /* glsl */`
      uniform sampler2D tBg, tBgDepth, tFg, tFgDepth, tData, tAux, tDataDepth;
      uniform vec2 uRes; uniform float uNear, uFar, uHaze, uSeed, uLineScale, uBgBlur;
      uniform vec3 uHazeColor, uAerial, uInkChar, uInkGiant, uInkBg, uInkSteam, uInkDust, uSunView;
      varying vec2 vUv;
      float lin(float d){ float z = d*2.0-1.0; return 2.0*uNear*uFar/(uFar+uNear - z*(uFar-uNear)); }
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
      // ink class from id: 0 none, 1 character, 2 giant/automaton, 3 steam, 4 dust, 5 debris/boulder, 6 bg
      int classOf(float id255){ int id = int(id255*255.0+0.5);
        if (id == 0) return 0; if (id < 100) return 1; if (id < 140) return 2; if (id <= 150) return 3; if (id <= 159) return 4;
        if (id >= 180 && id <= 183) return 0; if (id < 200) return 5; return 6; }
      void main(){
        vec2 px = 1.0/uRes;
        vec2 wob = (vec2(vnoise(vUv*uRes*0.06 + uSeed*17.0), vnoise(vUv*uRes*0.06 + 31.0 + uSeed*17.0)) - 0.5) * 0.9 * px;
        vec2 uv = vUv + wob;
        vec4 dC = texture2D(tData, uv); float zC = lin(texture2D(tDataDepth, uv).x); vec3 nC = dC.xyz*2.0-1.0;
        // ---- ink: search rings of growing radius for the nearest edge, remember the edge's character
        float dEdge = 99.0; float eKind = 0.0;  // 1 silhouette or object boundary, 0.55 crease, 0.7 inner billow line
        float eId = dC.a; float eZ = zC; vec2 eUv = uv; vec3 eN = nC; bool found = false;
        float grazingC = 1.0 - abs(nC.z);
        for (int r = 1; r <= 4; r++) {
          if (found) break;
          float rad = float(r) * 0.85 * uLineScale;
          for (int i = 0; i < 8; i++) {
            float a = (float(i) + 0.5 * float(r)) * 0.785398;
            vec2 o = vec2(cos(a), sin(a)) * rad * px;
            vec4 dS = texture2D(tData, uv + o); float zS = lin(texture2D(tDataDepth, uv + o).x);
            vec3 nS = dS.xyz*2.0-1.0;
            bool idE = abs(dS.a - dC.a) > 0.5/255.0;
            float rel = abs(zS - zC) / max(min(zS, zC), 0.05);
            float thr = 0.006 + 0.07 * grazingC * grazingC;
            bool dE = rel > thr * 1.8;
            bool nE = (1.0 - dot(nS, nC)) > 0.6;
            if (idE || dE || nE) {
              float k = (idE || dE) ? 1.0 : 0.55;
              // inner lines between puffs of the same billow: id differs but depth nearly continuous
              if (idE && !dE) { int c1 = classOf(dS.a); int c2 = classOf(dC.a); if ((c1 == 3 || c1 == 4) && (c2 == 3 || c2 == 4)) k = 0.6; }
              found = true; dEdge = rad - 0.5 * 0.85 * uLineScale; eKind = k;
              // the nearer of the two surfaces owns the line
              if (zS < zC) { eId = dS.a; eZ = zS; eUv = uv + o; eN = nS; }
              break;
            }
          }
        }
        float ink = 0.0; vec3 inkCol = uInkChar; float inkA = 1.0; int cls = classOf(eId);
        if (found && cls != 0) {
          // line half width in pixels: by distance, kind, light side and a slow hand-pressure noise
          float hw = clamp(2.4 - eZ * 0.010, 0.75, 2.4) * uLineScale;
          float lightSide = dot(normalize(eN), uSunView);          // > 0 lit, < 0 in shadow
          hw *= mix(1.25, 0.7, smoothstep(-0.2, 0.6, lightSide));   // lines thin out on the lit side
          hw *= eKind;
          hw *= 0.75 + 0.5 * vnoise(vUv * uRes * 0.012 + uSeed * 5.0); // pressure along the stroke
          if (cls == 6) hw *= 0.6;
          if (cls == 3 || cls == 4) hw *= 0.85;
          ink = 1.0 - smoothstep(hw - 0.6, hw + 0.4, dEdge);
          ink *= texture2D(tAux, eUv).r;   // fades with the object's opacity
          float distFade = 1.0 - smoothstep(60.0, 400.0, eZ);
          if (cls == 2) { inkCol = uInkGiant; inkA = 0.95; }
          else if (cls == 3) { inkCol = uInkSteam; inkA = 0.8; }
          else if (cls == 4) { inkCol = uInkDust; inkA = 0.7; }
          else if (cls == 5) { inkCol = mix(uInkBg, uInkChar, 0.5); inkA = 0.9; }
          else if (cls == 6) { inkCol = uInkBg; inkA = 0.55 * (0.4 + 0.6*distFade); if (eKind < 0.9) ink = 0.0; }
        }
        // ---- compose layers by depth
        vec4 fg = texture2D(tFg, vUv); float zF = lin(texture2D(tFgDepth, vUv).x);
        vec3 bg = texture2D(tBg, vUv).rgb; float zB = lin(texture2D(tBgDepth, vUv).x);
        if (uBgBlur > 0.0) {
          // close-up lens: soften the painted background behind the characters
          vec3 acc = bg; float n = 1.0;
          for (int i = 0; i < 12; i++) { float a = float(i) * 2.39996; float rr = sqrt((float(i) + 0.5) / 12.0) * uBgBlur;
            acc += texture2D(tBg, vUv + vec2(cos(a), sin(a)) * rr * px).rgb; n += 1.0; }
          bg = acc / n;
        }
        else {
          // gouache wet edge: pigment pools darker along colour boundaries of the painted background
          vec2 e = 2.0 * px; float lc = dot(bg, vec3(0.299, 0.587, 0.114)); float dmax = 0.0;
          dmax = max(dmax, abs(dot(texture2D(tBg, vUv + vec2(e.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114)) - lc));
          dmax = max(dmax, abs(dot(texture2D(tBg, vUv - vec2(e.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114)) - lc));
          dmax = max(dmax, abs(dot(texture2D(tBg, vUv + vec2(0.0, e.y)).rgb, vec3(0.299, 0.587, 0.114)) - lc));
          dmax = max(dmax, abs(dot(texture2D(tBg, vUv - vec2(0.0, e.y)).rgb, vec3(0.299, 0.587, 0.114)) - lc));
          bg *= 1.0 - 0.10 * smoothstep(0.02, 0.12, dmax);
        }
        float grain = (vnoise(vUv*uRes*0.22) - 0.5) * 0.03 + (vnoise(vUv*uRes*0.045 + 5.0) - 0.5) * 0.045;
        bg *= 1.0 + grain;
        bool useFg = fg.a > 0.5 && zF < zB;
        vec3 col = useFg ? fg.rgb : bg;
        float z = useFg ? zF : zB;
        // translucent surfaces are drawn with an ordered dither; resolve it into a flat tone by averaging
        // the layer colours over the dither cell wherever the nearest surface is partly transparent
        float opNear = texture2D(tAux, vUv).r;
        if (opNear < 0.995 && texture2D(tData, vUv).a > 0.5/255.0) {
          vec3 acc = vec3(0.0);
          for (int j = -1; j <= 2; j++) for (int i = -1; i <= 2; i++) {
            vec2 o = vec2(float(i), float(j)) * px;
            vec4 f2 = texture2D(tFg, vUv + o); float zf2 = lin(texture2D(tFgDepth, vUv + o).x);
            float zb2 = lin(texture2D(tBgDepth, vUv + o).x);
            acc += (f2.a > 0.5 && zf2 < zb2) ? f2.rgb : texture2D(tBg, vUv + o).rgb;
          }
          col = acc / 16.0;
        }
        bool isSky = z > uFar * 0.9;
        if (!isSky) {
          float aer = 1.0 - exp(-z * 0.0009);
          col = mix(col, uAerial, aer * 0.35 * (1.0 - uHaze));
          float dustF = 1.0 - exp(-z * (0.004 + 0.02*uHaze));
          col = mix(col, uHazeColor, uHaze * dustF * 0.85);
        }
        if (uBgBlur > 0.0 && !useFg) ink *= 0.3;
        col = mix(col, inkCol, clamp(ink, 0.0, 1.0) * inkA);
        gl_FragColor = vec4(col, 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  return { scene: fsQuad(mat), mat };
}

// Bloom helpers: bright pass and separable blur at quarter resolution.
export function makeBloom() {
  const bright = new THREE.ShaderMaterial({
    uniforms: { tex: { value: null }, uThresh: { value: 0.78 } },
    vertexShader: VS,
    fragmentShader: /* glsl */`uniform sampler2D tex; uniform float uThresh; varying vec2 vUv;
      void main(){ vec3 c = texture2D(tex, vUv).rgb; float l = max(c.r, max(c.g, c.b));
        float k = smoothstep(uThresh, uThresh + 0.2, l); gl_FragColor = vec4(c * k, 1.0); }`,
    depthTest: false, depthWrite: false,
  });
  const blur = new THREE.ShaderMaterial({
    uniforms: { tex: { value: null }, uDir: { value: new THREE.Vector2(1, 0) } },
    vertexShader: VS,
    fragmentShader: /* glsl */`uniform sampler2D tex; uniform vec2 uDir; varying vec2 vUv;
      void main(){ vec3 s = vec3(0.0); float wsum = 0.0;
        for (int i = -7; i <= 7; i++) { float w = exp(-float(i*i) / 18.0); s += texture2D(tex, vUv + uDir * float(i)).rgb * w; wsum += w; }
        gl_FragColor = vec4(s / wsum, 1.0); }`,
    depthTest: false, depthWrite: false,
  });
  return { brightScene: fsQuad(bright), bright, blurScene: fsQuad(blur), blur };
}

// Final "satsuei" (photography) pass: diffusion glow, light leak, chromatic fringe, grain, vignette,
// speed lines, impact frames, flash and fade, then output colour space.
export function makeFinal(width, height) {
  const c = (h) => new THREE.Color(h);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      tComp: { value: null }, tBloom: { value: null }, uRes: { value: new THREE.Vector2(width, height) },
      uBloom: { value: 0.35 }, uLeakColor: { value: c(0xFFD9A0) }, uLeakPos: { value: new THREE.Vector2(0.0, 1.0) }, uLeakAmt: { value: 0.0 },
      uSeed: { value: 0 }, uFlash: { value: 0 }, uFlashColor: { value: c(0xDFFCFF) }, uFade: { value: 0 },
      uSpeed: { value: 0 }, uSpeedCenter: { value: new THREE.Vector2(0.5, 0.5) }, uSpeedDark: { value: 0 },
      uImpact: { value: 0 }, uImpactDeep: { value: c(0x160A10) }, uImpactPaper: { value: c(0xF5EEE2) },
      uGrade: { value: 0 },
    },
    vertexShader: VS,
    fragmentShader: /* glsl */`
      uniform sampler2D tComp, tBloom; uniform vec2 uRes, uLeakPos, uSpeedCenter;
      uniform float uBloom, uLeakAmt, uSeed, uFlash, uFade, uSpeed, uSpeedDark, uImpact, uGrade;
      uniform vec3 uLeakColor, uFlashColor, uImpactDeep, uImpactPaper;
      varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      void main(){
        vec2 q = vUv - 0.5;
        // faint lateral chromatic fringe toward the frame edges
        vec2 ca = q * 0.0018;
        vec3 col = vec3(texture2D(tComp, vUv + ca).r, texture2D(tComp, vUv).g, texture2D(tComp, vUv - ca).b);
        // diffusion glow (screen blend)
        vec3 bl = texture2D(tBloom, vUv).rgb * uBloom;
        col = 1.0 - (1.0 - col) * (1.0 - bl);
        // light leak / gradient overlay (parablend), screen blend
        float d = length((vUv - uLeakPos) * vec2(uRes.x / uRes.y, 1.0));
        vec3 leak = uLeakColor * uLeakAmt * pow(max(0.0, 1.0 - d / 1.4), 2.2);
        col = 1.0 - (1.0 - col) * (1.0 - leak);
        // gentle grade: lift shadows toward violet, keep highlights clean
        float l = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(col, col + vec3(0.025, 0.01, 0.045) * (1.0 - l), 1.0);
        col = mix(vec3(l), col, 1.06);
        // speed / focus lines
        if (uSpeed > 0.0) {
          vec2 p = (vUv - uSpeedCenter) * vec2(uRes.x / uRes.y, 1.0);
          float ang = atan(p.y, p.x); float rr = length(p);
          float cell = floor((ang + 3.14159) / 6.28318 * 220.0);
          float h = hash(vec2(cell, uSeed));
          float frac = fract((ang + 3.14159) / 6.28318 * 220.0);
          float width = 0.15 + 0.35 * h;
          float line = step(1.0 - 0.45 * uSpeed, h) * (1.0 - smoothstep(width * 0.5, width * 0.5 + 0.08, abs(frac - 0.5)));
          float start = 0.25 + 0.35 * hash(vec2(cell, uSeed + 3.0));
          line *= smoothstep(start, start + 0.18, rr);
          vec3 lc = uSpeedDark > 0.5 ? vec3(0.08, 0.05, 0.07) : vec3(1.0);
          col = mix(col, lc, line * 0.85 * min(1.0, uSpeed * 1.5));
        }
        // impact frame: two-tone negative
        if (uImpact > 0.0) {
          float t = smoothstep(0.55, 0.6, pow(max(l, 0.0), 1.0 / 2.2));
          vec3 imp = mix(uImpactPaper, uImpactDeep, t);
          col = mix(col, imp, uImpact);
        }
        // film grain on 2s and vignette
        float g = hash(floor(vUv * uRes) + vec2(uSeed * 13.0, uSeed * 7.0)) - 0.5;
        col += g * 0.022;
        col *= 1.0 - dot(q, q) * 0.38;
        col = mix(col, uFlashColor, uFlash);
        col = mix(col, vec3(0.0), uFade);
        gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
        #include <colorspace_fragment>
      }`,
    depthTest: false, depthWrite: false,
  });
  return { scene: fsQuad(mat), mat };
}
