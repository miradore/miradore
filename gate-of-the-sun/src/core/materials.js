// Cel (toon) materials with hard cool shadows, plus the paired "data" material used by the
// ink pass (view-space normal + object id). Every mesh in the film uses makeCel or makeFlat.
import * as THREE from 'three';
import { paintTexture } from './paint.js';

const toonChunk = /* glsl */`
varying vec3 vViewPosition;
struct ToonMaterial { vec3 diffuseColor; };
uniform vec3 uShadeMul;
uniform vec3 uShade2Mul;
uniform float uBand2Edge;
uniform vec3 uHiMul;
uniform float uHiEdge;
uniform float uBandEdge;
uniform float uBandSoft;
uniform float uWobble;
float celHash(vec3 p){ p = fract(p*0.3183099 + vec3(0.1,0.2,0.3)); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float celNoise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(celHash(i+vec3(0,0,0)),celHash(i+vec3(1,0,0)),f.x),mix(celHash(i+vec3(0,1,0)),celHash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(celHash(i+vec3(0,0,1)),celHash(i+vec3(1,0,1)),f.x),mix(celHash(i+vec3(0,1,1)),celHash(i+vec3(1,1,1)),f.x),f.y),f.z); }
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
  float dotNL = dot( geometryNormal, directLight.direction );
  // hand-drawn terminator: wobble the band edge with low frequency world noise
  dotNL += (celNoise(vCelWorld * 1.7) - 0.5) * uWobble;
  float lum = max(directLight.color.r, max(directLight.color.g, directLight.color.b));
  float lit = step(0.45, lum);                 // hard shadow map -> flat shadow shape
  float band = smoothstep(uBandEdge - uBandSoft, uBandEdge + uBandSoft, dotNL) * lit;
  vec3 shadeMul = uShadeMul;
  #ifdef CEL_SHADE2
    // second, deeper shadow tone (core shadow) on the far side of the form
    float band2 = smoothstep(uBand2Edge - uBandSoft, uBand2Edge + uBandSoft, dotNL);
    shadeMul = mix(uShade2Mul, uShadeMul, band2);
  #endif
  vec3 tone = mix(shadeMul, vec3(1.0), band);
  #ifdef CEL_HI
    // painted highlight shape on the most lit part of the form
    float hi = smoothstep(uHiEdge - uBandSoft, uHiEdge + uBandSoft, dotNL) * lit;
    tone = mix(tone, uHiMul, hi);
  #endif
  reflectedLight.directDiffuse += material.diffuseColor * tone;
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) { }
#define RE_Direct RE_Direct_Toon
#define RE_IndirectDiffuse RE_IndirectDiffuse_Toon
`;

const paintChunk = /* glsl */`
uniform sampler2D uPaint; uniform float uPaintScale; uniform float uPaintAmount;
varying vec3 vCelWorld; varying vec3 vCelWN;
vec3 celPaint(){
  vec3 n = abs(normalize(vCelWN)); n = pow(n, vec3(6.0)); n /= (n.x + n.y + n.z);
  vec3 p = vCelWorld * uPaintScale;
  vec3 c = texture2D(uPaint, p.zy).rgb * n.x + texture2D(uPaint, p.xz).rgb * n.y + texture2D(uPaint, p.xy).rgb * n.z;
  return mix(vec3(1.0), c / 0.91, uPaintAmount);
}
`;
const ditherChunk = /* glsl */`
uniform float uOpacity;
float celBayer(vec2 p){
  int x = int(mod(p.x, 4.0)); int y = int(mod(p.y, 4.0));
  int m[16]; m[0]=0;m[1]=8;m[2]=2;m[3]=10;m[4]=12;m[5]=4;m[6]=14;m[7]=6;m[8]=3;m[9]=11;m[10]=1;m[11]=9;m[12]=15;m[13]=7;m[14]=13;m[15]=5;
  return (float(m[y*4+x]) + 0.5) / 16.0;
}
`;
const ditherTest = /* glsl */`
  if (uOpacity < 0.999) { if (celBayer(floor(gl_FragCoord.xy)) > uOpacity) discard; }
`;

// Shared data material (one instance; per-mesh uniforms are set in onBeforeRender).
export function makeDataMaterial() {
  const m = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: { uId: { value: 0 }, uOpacity: { value: 1 }, map: { value: null }, uUseMap: { value: 0 }, uAlphaTest: { value: 0.5 } },
    vertexShader: /* glsl */`
      #include <common>
      out vec3 vN; out vec2 vUvD;
      void main(){
        #include <beginnormal_vertex>
        #include <defaultnormal_vertex>
        vN = normalize(transformedNormal);
        vUvD = uv;
        #include <begin_vertex>
        #include <project_vertex>
      }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uId; uniform sampler2D map; uniform float uUseMap; uniform float uAlphaTest; uniform float uOpacity;
      in vec3 vN; in vec2 vUvD;
      layout(location = 0) out vec4 gData;
      layout(location = 1) out vec4 gAux;
      void main(){
        // fully faded objects leave the data pass so ink lines behind them survive
        if (uOpacity < 0.04) discard;
        if (uUseMap > 0.5) { if (texture(map, vUvD).a < uAlphaTest) discard; }
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        gData = vec4(n * 0.5 + 0.5, uId / 255.0);
        gAux = vec4(uOpacity, 0.0, 0.0, 1.0);
      }`,
    side: THREE.DoubleSide,
  });
  m.name = 'data';
  return m;
}

function colorOf(c) { return c instanceof THREE.Color ? c.clone() : new THREE.Color(c); }

/**
 * makeCel({ color, shade, map, emissive, emissiveIntensity, bandEdge, bandSoft, wobble, side, opacity, vertexColors })
 * color: base lit colour (sRGB hex). shade: absolute shadow colour (sRGB hex); if omitted a cool darker shade is derived.
 * Returned material has material.userData.uniforms with uOpacity, uShadeMul for animation.
 */
export function makeCel(opts = {}) {
  const base = colorOf(opts.color ?? 0xffffff);
  const rel = (c, fallback) => new THREE.Vector3(
    base.r > 0.001 ? c.r / base.r : fallback, base.g > 0.001 ? c.g / base.g : fallback, base.b > 0.001 ? c.b / base.b : fallback).clampScalar(0, 1.6);
  let shade;
  if (opts.shade !== undefined) shade = colorOf(opts.shade);
  else { shade = base.clone(); const hsl = {}; shade.getHSL(hsl); shade.setHSL((hsl.h + 0.04) % 1, Math.min(1, hsl.s * 1.1 + 0.08), hsl.l * 0.62); }
  // shade multiplier relative to base (works with maps and instance colours)
  const mul = rel(shade, 0.6).clampScalar(0, 1.2);
  const shade2 = opts.shade2 !== undefined ? colorOf(opts.shade2) : null;
  const hiCol = opts.highlight !== undefined ? colorOf(opts.highlight) : null;
  const m = new THREE.MeshToonMaterial({
    color: base, map: opts.map ?? null, emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.emissiveIntensity ?? 1,
    side: opts.side ?? THREE.FrontSide, vertexColors: !!opts.vertexColors,
  });
  const paint = opts.paint ? paintTexture(opts.paint, opts.paintSeed ?? 1) : null;
  const uniforms = {
    uShadeMul: { value: mul }, uBandEdge: { value: opts.bandEdge ?? 0.12 }, uBandSoft: { value: opts.bandSoft ?? 0.02 },
    uWobble: { value: opts.wobble ?? 0.14 }, uOpacity: { value: opts.opacity ?? 1 },
    uShade2Mul: { value: shade2 ? rel(shade2, 0.4).clampScalar(0, 1.2) : mul.clone() }, uBand2Edge: { value: opts.band2Edge ?? -0.45 },
    uHiMul: { value: hiCol ? rel(hiCol, 1.15) : new THREE.Vector3(1, 1, 1) }, uHiEdge: { value: opts.highlightEdge ?? 0.82 },
    uPaint: { value: paint }, uPaintScale: { value: 1 / (opts.paintScale ?? 4) }, uPaintAmount: { value: opts.paintAmount ?? 1 },
  };
  const defs = [];
  if (shade2) defs.push('CEL_SHADE2');
  if (hiCol) defs.push('CEL_HI');
  if (paint) defs.push('CEL_PAINT');
  m.defines = Object.fromEntries(defs.map((d) => [d, '']));
  m.userData.uniforms = uniforms;
  m.userData.isCel = true;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCelWorld;\nvarying vec3 vCelWN;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        { vec4 wp = vec4(transformed, 1.0); vec3 wn = objectNormal;
          #ifdef USE_INSTANCING
            wp = instanceMatrix * wp; wn = mat3(instanceMatrix) * wn;
          #endif
          vCelWorld = (modelMatrix * wp).xyz; vCelWN = normalize(mat3(modelMatrix) * wn); }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <lights_toon_pars_fragment>', toonChunk)
      .replace('#include <common>', '#include <common>\n' + ditherChunk + paintChunk)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + ditherTest)
      .replace('#include <color_fragment>', `#include <color_fragment>
        #ifdef CEL_PAINT
          diffuseColor.rgb *= celPaint();
        #endif`);
  };
  m.customProgramCacheKey = () => 'cel2' + defs.join('|');
  return m;
}

/** Unlit flat material (eyes, glow, emissive slit, sky-facing flats). Same dithering support. */
export function makeFlat(opts = {}) {
  const m = new THREE.MeshBasicMaterial({
    color: opts.color ?? 0xffffff, map: opts.map ?? null, side: opts.side ?? THREE.FrontSide,
    alphaTest: opts.alphaTest ?? (opts.map ? 0.5 : 0), vertexColors: !!opts.vertexColors,
  });
  const uniforms = { uOpacity: { value: opts.opacity ?? 1 } };
  m.userData.uniforms = uniforms; m.userData.isFlat = true;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + ditherChunk)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + ditherTest);
  };
  m.customProgramCacheKey = () => 'flat1';
  return m;
}

/** Set dithered opacity on a mesh or a whole group (materials must not be shared across groups with different opacity). */
export function setOpacity(obj, v) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.userData.opacity = v;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) if (m && m.userData.uniforms && m.userData.uniforms.uOpacity) m.userData.uniforms.uOpacity.value = v;
  });
}
