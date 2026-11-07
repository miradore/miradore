// Shared world map for "Gate of the Sun". Units: metres. Y is up.
// The wall runs along the X axis at z = 0. The town is on +z. The fields are on -z.
// Looking from the town toward the wall (camera facing -z), +x is screen RIGHT.
// Every department imports this file and nothing else for world coordinates.

export const FPS = 24;
export const TOTAL_FRAMES = 1860;           // 77.5 s
export const WIDTH = 1920;
export const HEIGHT = 1080;

// ---------------------------------------------------------------- terrain
// Gate plaza is flat. Behind it the hill town climbs gently away from the wall.
export function groundY(x, z) {
  if (z <= 8) return 0;
  const s = (z - 8);
  return s * 0.045 + 0.0004 * s * s * 0.1;      // ~7 m at z = 160
}
export const TOWN_DEPTH = 170;                  // town occupies z in [8, 170]
export const TOWN_HALF_WIDTH = 120;             // x in [-120, 120]

// ---------------------------------------------------------------- wall & gate
export const WALL = {
  height: 50, crenelTop: 53, thickness: 12,     // z in [-6, 6]
  length: 480,                                  // x in [-240, 240]
  towerXs: [-195, -135, -75, 75, 135, 195],     // round towers, centred on the wall line
  towerRadius: 9, towerHeight: 60,
  color: 0xE2B48E, colorShade: 0xB8785A,        // pale ochre-pink sandstone
};
export const GATE = {
  x: 0, width: 20, height: 30, archRadius: 10,  // opening: x in [-10, 10], arch top at y = 30
  doorThickness: 1.2, doorZ: 0,                 // doors sit at z = 0 inside the opening
  color: 0x8F6A2E, colorShade: 0x5B411C,        // bronze
  sunColor: 0xE8C25A,
};

// ---------------------------------------------------------------- streets
// Departments must keep these volumes clear of buildings (characters may stand in them).
export const MAIN_STREET = { xMin: -6, xMax: 6, zMin: 6, zMax: 170 };
export const CROSS_STREETS_Z = [30, 55, 110, 140];   // each 8 m deep: z in [z-4, z+4], spanning x
export const CROSS_STREET_HALF = 4;
export const SQUARE = { xMin: -30, xMax: 30, zMin: 60, zMax: 95 };
export const BELL_TOWERS = [ { x: -22, z: 92, h: 24 }, { x: 22, z: 92, h: 24 } ];

// ---------------------------------------------------------------- canal
// Stone canal with steps on the WEST bank (x from 26 to 32). Water from x = 32 to 40.
// Steps descend east toward the water. Ground at the bank top is groundY(26, z).
export const CANAL = {
  xBankTop: 26, xWater: 32, xEast: 40, zMin: 10, zMax: 150,
  stepDepth: 2.0,     // each step is 2 m wide in x
  stepRise: 0.5,      // each step drops 0.5 m
  steps: 3,           // 3 steps: step i (0..2) top surface at groundY - (i+1)*0.5, x in [26+2i, 28+2i]
  waterDrop: 2.2,     // water surface at groundY - 2.2
};
export function stepTopY(i, z) { return groundY(CANAL.xBankTop, z) - (i + 1) * CANAL.stepRise; }

// ---------------------------------------------------------------- hero house
// The house that loses its facade (shot 23). Facade faces +x onto the main street.
export const HERO_HOUSE = { xMin: -22, xMax: -10, zMin: 34, zMax: 46, floors: 3, floorHeight: 3.4 };

// ---------------------------------------------------------------- giant
export const GIANT = {
  height: 90,
  feet: [0, 0, -46],          // stands outside the wall, facing +z (toward the town)
  headCenter: [0, 82, -46],   // when fully risen
  headRadius: 9,
  handImpact: [30, 51, 0],    // left hand slams onto the wall top, right of the gate (screen right)
  kickTarget: [0, 12, 0],     // foot centre at the moment of impact
};
export const SMALL_AUTOMATONS = {
  count: 5, height: 14,
  // start positions (frame 1548) and they walk toward the gate at ~4 m/s
  starts: [[-28, 0, -230], [14, 0, -205], [-6, 0, -260], [38, 0, -245], [-48, 0, -280]],
};

// ---------------------------------------------------------------- characters
// Anchor positions. Characters department places feet/seat exactly here.
// The three kids sit on the canal steps near the gate, facing EAST (+x) toward the water,
// turning their heads north (-z) toward the wall when needed.
export const KIDS = {
  fox:  { seat: [27.0, stepTopY(0, 46.8), 46.8], step: 0, facing: 'east', height: 1.15 },
  hare: { seat: [29.0, stepTopY(1, 45.4), 45.4], step: 1, facing: 'east', height: 1.05 },
  lynx: { seat: [29.0, stepTopY(1, 48.4), 48.4], step: 1, facing: 'east', height: 1.12 },
};
// Head centres when seated (approximate; characters dept must match within 10 cm)
export const ANCHORS = {
  foxHead:  [27.3, stepTopY(0, 46.8) + 0.82, 46.8],
  hareHead: [29.3, stepTopY(1, 45.4) + 0.74, 45.4],
  lynxHead: [29.3, stepTopY(1, 48.4) + 0.80, 48.4],
  giantHead: GIANT.headCenter,
  handImpact: GIANT.handImpact,
  gate: [0, 15, 0],
  square: [0, groundY(0, 78), 78],
};
// Mothers (shot 2 street scene at cross street z = 110; shot 25 near the square)
export const MOTHERS = {
  badger: { shot2: [-13, groundY(-13, 110), 111.5], shot25: [2, groundY(2, 70), 70] },
  piglet: { shot2: [-11.6, groundY(-11.6, 110), 111.8], shot25: [3.2, groundY(3.2, 70), 70.6] },
  goat:   { shot2: [-3, groundY(-3, 112), 112], shot25: [-4, groundY(-4, 69), 69] },
  kid:    { shot2: [-2, groundY(-2, 112.6), 112.6], shot25: [-5.1, groundY(-5.1, 69.4), 69.4] },
};

// ---------------------------------------------------------------- key event frames (global)
export const T = {
  BOLT: 348,           // flash frame
  DOME_START: 360, DOME_END: 430,
  SHOCK_START: 420, SHOCK_END: 480,   // shock wave crosses the town (z from 0 to 170)
  STEAM_COLUMN: 440,                   // column rises from behind the wall
  HAND_IMPACT: 640,
  HEAD_RISE_START: 756, HEAD_RISE_END: 840,
  HEAD_TURN_START: 996, HEAD_TURN_END: 1056,
  LEG_LIFT_START: 1056, LEG_LIFT_END: 1104,
  KICK: 1112,
  GATE_BURST_START: 1112, GATE_BURST_END: 1176,
  BOULDER_LANDINGS: [1190, 1203, 1219, 1236, 1247, 1262, 1281, 1301, 1322, 1341, 1372, 1395],
  DOME_SHATTER: 1236,                  // turquoise dome at (-18, 55) breaks
  FACADE_START: 1247, FACADE_END: 1296,
  DUST_WALL_START: 1180,               // dust wall advances from the gate into the town
  DISSOLVE_START: 1476, DISSOLVE_END: 1560,
  AUTOMATONS_START: 1548,
  BLACK: 1812,
};

// ---------------------------------------------------------------- render ids (data pass)
// Each mesh gets userData.inkId. Ranges decide ink colour/weight in the ink pass.
export const ID = {
  NONE: 0,
  CHAR_MIN: 1, CHAR_MAX: 99,        // one id per character; all parts of a character share it
  GIANT_MIN: 100, GIANT_MAX: 119,   // cycle plates through these so adjacent plates get a line
  AUTOMATON_MIN: 120, AUTOMATON_MAX: 139,
  STEAM: 150, DUST: 151, BOLT: 180, DOME: 181, SHOCK: 182, GLOW: 183,
  BOULDER_MIN: 160, BOULDER_MAX: 169,
  DEBRIS_MIN: 170, DEBRIS_MAX: 179,
  BG_MIN: 200, BG_MAX: 239,         // houses, cycle
  WALL: 240, GATE: 241, TOWER: 242, BELL: 243, LAUNDRY: 244, AWNING: 245, PLANT: 246,
  TERRAIN: 250, CANAL: 251, WATER: 252, MOUNTAIN: 253, FIELD: 254,
};
export const LAYER = { BG: 1, FG: 2 };   // three.js layers: BG = painted pass, FG = cel + ink

// ---------------------------------------------------------------- palette
export const PALETTE = {
  sky: 0x2F6FD6, skyZenith: 0x1E4FB8, skyHorizon: 0xA9D4F2,
  cloud: 0xFFFFFF, cloudShade: 0xC7B9EA,
  stucco: [0xFCF7EE, 0xF4E7D3, 0xEBD9BD, 0xFFFDF7],
  stuccoShade: 0xB9A4C9,            // cool violet shadow on white walls
  dome: 0x33C2CC, domeShade: 0x1D8798,
  cobalt: 0x1F49B5, cobaltShade: 0x15307A,
  bougainvillea: 0xE6397E, bougainvilleaShade: 0xA71E5A,
  awning: [0xE9553B, 0x3C8ED8, 0xF2C94C],
  sandstone: 0xE2B48E, sandstoneShade: 0xB8785A,
  bronze: 0x8F6A2E, bronzeShade: 0x5B411C,
  verdigris: 0x5FA68F, verdigrisShade: 0x2F6A5A, gold: 0xE8C25A, slit: 0x7CF2FF,
  steam: 0xF3F6FA, steamShade: 0xB8C4DC,
  dust: 0xD9B26A, dustShade: 0xA8803D,
  field: 0xA7C957, fieldShade: 0x6F9A3A, mountain: 0x6D85C9, mountainShade: 0x4C5FA3,
  ink: 0x2A1A14, inkGiant: 0x12302C, inkBg: 0x8A5A3C,
};

// deterministic hash helpers (all departments use these; never Math.random)
export function hash1(n) { let x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
export function hash2(a, b) { return hash1(a * 1.7 + b * 113.3 + hash1(b) * 7.0); }
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Animation on 2s: quantise a frame to 12 fps holds (classic anime timing)
export function hold(frame, n = 2) { return Math.floor(frame / n) * n; }
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeIn = (t) => Math.pow(clamp(t, 0, 1), 3);
export const remap = (v, a, b, c = 0, d = 1) => lerp(c, d, clamp((v - a) / (b - a), 0, 1));

// Actual walkable/visible surface height including the canal cut (steps and water).
export function surfaceY(x, z) {
  if (z >= CANAL.zMin && z <= CANAL.zMax && x >= CANAL.xBankTop && x <= CANAL.xEast) {
    if (x < CANAL.xWater) { const i = Math.min(CANAL.steps - 1, Math.floor((x - CANAL.xBankTop) / CANAL.stepDepth)); return stepTopY(i, z); }
    return groundY(CANAL.xBankTop, z) - CANAL.waterDrop;
  }
  return groundY(x, z);
}
