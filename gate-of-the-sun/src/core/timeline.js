import shotsJson from '../../shared/shots.json' with { type: 'json' };
export const SHOTS = shotsJson.shots;

export function shotAt(frame) {
  for (const s of SHOTS) if (frame >= s.start && frame < s.end) return s;
  return SHOTS[SHOTS.length - 1];
}
export function frameInfo(frame) {
  const shot = shotAt(frame);
  const local = frame - shot.start;
  const dur = shot.end - shot.start;
  return { frame, t: frame / 24, shot, shotId: shot.id, local, dur, localT: dur > 1 ? local / (dur - 1) : 0 };
}
