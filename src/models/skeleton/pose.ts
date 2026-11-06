/**
 * Поза скелета во времени: машет правой рукой, потом опускает её и стоит.
 * Углы — в радианах, в системе левой руки (правая рука — её зеркальное отражение).
 */
export interface Pose {
  girdle: number;
  shoulderZ: number;
  shoulderY: number;
  elbowZ: number;
  wristZ: number;
  headY: number;
  headZ: number;
  sway: number;
  breath: number;
}

export const WAVE_CYCLE = 8;

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export const REST: Pose = { girdle: 0, shoulderZ: 0, shoulderY: 0, elbowZ: 0, wristZ: 0, headY: 0, headZ: 0, sway: 0, breath: 0.5 };

export function poseAt(time: number): Pose {
  const t = ((time % WAVE_CYCLE) + WAVE_CYCLE) % WAVE_CYCLE;
  // 0–1.3 с поднимает руку, 1.3–4.6 машет, 4.6–6 опускает, дальше стоит
  const up = ease(t / 1.3) * (1 - ease((t - 4.6) / 1.4));
  const waving = ease((t - 1.0) / 0.5) * (1 - ease((t - 4.3) / 0.5));
  const w = Math.sin((t - 1.3) * Math.PI * 2 * 0.95);
  return {
    girdle: 0.16 * up,
    shoulderZ: 1.36 * up,
    shoulderY: -0.3 * up,
    elbowZ: 1.66 * up + 0.28 * waving * w,
    wristZ: 0.05 * up + 0.22 * waving * Math.sin((t - 1.45) * Math.PI * 2 * 0.95),
    headY: -0.2 * up,
    headZ: -0.06 * up,
    sway: 0.012 * Math.sin(time * 0.9),
    breath: 0.5 + 0.5 * Math.sin(time * 1.6),
  };
}
