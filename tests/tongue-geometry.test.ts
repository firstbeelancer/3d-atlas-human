import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { buildScene } from '../src/models/tongue/build';
import { SCENE_PARTS, sceneOf } from '../src/models/tongue/parts';
import { signedVolume } from '../src/models/tongue/geometry';
import {
  CUT_DEFAULT_T,
  GENIAL,
  HYOID_PTS,
  MID_LEN,
  U_FORAMEN,
  botV,
  cutPlane,
  displace,
  frameAt,
  halfWidth,
  inside,
  motionAt,
  surface,
  topV,
  uSulcus,
  type SceneId,
} from '../src/models/tongue/anatomy';

describe('tongue anatomy', () => {
  it('is about 9 cm long along its axis, tip in front and root going down to the hyoid', () => {
    expect(MID_LEN).toBeGreaterThan(8);
    expect(MID_LEN).toBeLessThan(10.5);
    const tip = frameAt(1).c;
    const root = frameAt(0).c;
    expect(tip.x).toBeGreaterThan(4);
    expect(root.y).toBeLessThan(-2.5);
    // корень почти вертикален, тело почти горизонтально
    expect(Math.abs(frameAt(0.1).t.y)).toBeGreaterThan(0.8);
    expect(Math.abs(frameAt(0.7).t.x)).toBeGreaterThan(0.9);
    // подъязычная кость ниже корня
    expect(HYOID_PTS[0][1]).toBeLessThan(root.y - 0.5);
  });

  it('has a positive cross-section everywhere: dorsum above the axis, underside below, width ~4–5 cm', () => {
    for (let u = 0; u <= 1.0001; u += 0.05) {
      expect(topV(u, 0)).toBeGreaterThan(0);
      expect(botV(u, 0)).toBeLessThan(0);
      expect(halfWidth(u)).toBeGreaterThan(0.5);
    }
    expect(2 * halfWidth(0.6)).toBeGreaterThan(4);
    expect(2 * halfWidth(0.6)).toBeLessThan(5.5);
    // в теле спинка обращена вверх
    const top = surface(0.65, Math.PI / 2);
    const bot = surface(0.65, -Math.PI / 2);
    expect(top.y).toBeGreaterThan(bot.y + 1.2);
  });

  it('cuts the median and terminal grooves into the dorsum, deepest at the foramen cecum', () => {
    const plain = topV(0.7, 0, 0, false);
    expect(topV(0.7, 0)).toBeLessThan(plain - 0.03);
    expect(topV(0.7, 1.0)).toBeCloseTo(topV(0.7, 1.0, 0, false), 3);
    expect(topV(U_FORAMEN, 0, 0, false) - topV(U_FORAMEN, 0)).toBeGreaterThan(0.1);
    // V открыта вперёд: боковые концы борозды ближе к верхушке, чем вершина
    expect(uSulcus(1.8)).toBeGreaterThan(uSulcus(0));
    expect(inside(uSulcus(1.8), 1.8, 0).x).toBeGreaterThan(inside(uSulcus(0), 0, 0).x);
  });

  it('starts the genioglossus on the inner side of the chin, below and in front of the tongue body', () => {
    expect(GENIAL[0]).toBeGreaterThan(4);
    expect(GENIAL[1]).toBeLessThan(botV(0.85, 0) + inside(0.85, 0, 0).y - 1.5);
  });

  it('returns unit cut planes for both scenes and moves the default cut through the tongue', () => {
    for (const scene of ['tongue', 'bud'] as SceneId[])
      for (const kind of ['side', 'fundus', 'coronal'] as const)
        for (const t of [0, CUT_DEFAULT_T[kind], 1]) {
          const p = cutPlane(scene, kind, t);
          expect(Math.hypot(...p.n)).toBeCloseTo(1, 6);
          expect(Number.isFinite(p.c)).toBe(true);
        }
    // поперечный срез по умолчанию проходит через тело языка
    const f = cutPlane('tongue', 'fundus', CUT_DEFAULT_T.fundus);
    const x = f.c;
    expect(x).toBeGreaterThan(frameAt(0.45).c.x);
    expect(x).toBeLessThan(frameAt(0.95).c.x);
    expect(cutPlane('tongue', 'side', 0.5).c).toBeCloseTo(0, 6);
  });

  it('moves the tip but keeps the hyoid and the chin in place', () => {
    let maxTip = 0;
    for (let t = 0; t < 12; t += 0.25) {
      const m = motionAt(t);
      for (const v of Object.values(m)) {
        expect(v).toBeGreaterThanOrEqual(-1.0001);
        expect(v).toBeLessThanOrEqual(1.0001);
      }
      const tip = displace([4.9, -0.1, 0], m);
      maxTip = Math.max(maxTip, Math.hypot(tip[0] - 4.9, tip[1] + 0.1, tip[2]));
      const hy = displace(HYOID_PTS[0], m);
      expect(Math.hypot(hy[0] - HYOID_PTS[0][0], hy[1] - HYOID_PTS[0][1], hy[2] - HYOID_PTS[0][2])).toBeLessThan(1e-6);
      const ch = displace(GENIAL, m);
      expect(Math.hypot(ch[0] - GENIAL[0], ch[1] - GENIAL[1], ch[2] - GENIAL[2])).toBeLessThan(1e-6);
    }
    expect(maxTip).toBeGreaterThan(1);
  });
});

describe('tongue geometry', () => {
  const scenes: SceneId[] = ['tongue', 'bud'];
  const built = Object.fromEntries(scenes.map((s) => [s, buildScene(s)]));

  it('builds every part of every scene with finite, non-empty meshes', () => {
    for (const scene of scenes) {
      const data = built[scene];
      for (const id of SCENE_PARTS[scene]) {
        expect(sceneOf(id)).toBe(scene);
        const defs = data.parts[id];
        expect(defs?.length, `${scene}/${id}`).toBeGreaterThan(0);
        for (const d of defs) {
          const pos = d.g.getAttribute('position');
          expect(pos.count, id).toBeGreaterThan(8);
          for (let i = 0; i < pos.array.length; i++) if (!Number.isFinite(pos.array[i])) throw new Error(`${id}: NaN in positions`);
          const n = d.g.getAttribute('normal');
          for (let i = 0; i < n.array.length; i++) if (!Number.isFinite(n.array[i])) throw new Error(`${id}: NaN in normals`);
        }
      }
      expect(Object.keys(data.parts).sort()).toEqual([...SCENE_PARTS[scene]].sort());
    }
  });

  it('has outward-facing closed bodies for tissues that show a cut face', () => {
    const t = built.tongue.parts;
    for (const id of ['sup-longitudinal', 'septum', 'hyoid', 'epiglottis', 'mandible', 'frenulum']) expect(signedVolume(t[id][0].g), id).toBeGreaterThan(0);
    expect(built.tongue.context.length).toBe(2);
    for (const c of built.tongue.context) expect(signedVolume(c.g)).toBeGreaterThan(8);
    const b = built.bud.parts;
    for (const id of ['b-epithelium', 'b-core', 'taste-bud']) expect(signedVolume(b[id][0].g), id).toBeGreaterThan(0);
  });

  it('keeps the inner muscles inside the mucosa', () => {
    const p = built.tongue.parts['sup-longitudinal'][0].g.getAttribute('position');
    const v = new Vector3();
    let inside = 0;
    for (let i = 0; i < p.count; i += 7) {
      v.fromBufferAttribute(p, i);
      if (v.y < 1.25 && v.x < 5.2) inside++;
    }
    expect(inside / Math.ceil(p.count / 7)).toBeGreaterThan(0.99);
  });

  it('places 8–12 vallate papillae and many more filiform than fungiform ones', () => {
    const t = built.tongue.parts;
    const verts = (id: string) => t[id][0].g.getAttribute('position').count;
    expect(verts('filiform')).toBeGreaterThan(1500 * 10);
    expect(verts('fungiform')).toBeLessThan(verts('filiform') * 2);
    const ring = t.vallate[1].g.getAttribute('position').count;
    const perRing = 29 * 2;
    expect(ring / perRing).toBeGreaterThanOrEqual(8);
    expect(ring / perRing).toBeLessThanOrEqual(12);
  });

  it('stays within a reasonable vertex budget', () => {
    let total = 0;
    for (const scene of scenes) for (const defs of Object.values(built[scene].parts)) for (const d of defs) total += d.g.getAttribute('position').count;
    expect(total).toBeLessThan(400_000);
  });
});
