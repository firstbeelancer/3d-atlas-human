import { describe, expect, it } from 'vitest';
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { capsule, meshSdf, smooth, sphere, subtract } from '../src/models/skeleton/sdf';
import { poseAt, REST, WAVE_CYCLE } from '../src/models/skeleton/pose';
import { SKULL_ORIGIN, VERTEBRAE } from '../src/models/skeleton/anatomy';
import { buildMandible, buildSkull } from '../src/models/skeleton/skull';
import { innerR, outerR, CUT } from '../src/models/skeleton/cutBone';

describe('skeleton geometry helpers', () => {
  it('meshes a sphere field into a closed surface of the right size with outward normals', () => {
    const g = meshSdf(sphere([0, 0, 0], 1), { min: [-1.3, -1.3, -1.3], max: [1.3, 1.3, 1.3], cell: 0.1 });
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    expect(pos.count).toBeGreaterThan(500);
    const p = new Vector3();
    const n = new Vector3();
    for (let i = 0; i < pos.count; i += 17) {
      p.fromBufferAttribute(pos, i);
      n.fromBufferAttribute(nor, i);
      expect(Math.abs(p.length() - 1)).toBeLessThan(0.05);
      expect(n.dot(p.clone().normalize())).toBeGreaterThan(0.9);
    }
    // треугольники повёрнуты наружу: нормаль грани смотрит от центра
    const idx = g.index!;
    const a = new Vector3();
    const b = new Vector3();
    const c = new Vector3();
    let outward = 0;
    for (let t = 0; t < idx.count; t += 3) {
      a.fromBufferAttribute(pos, idx.getX(t));
      b.fromBufferAttribute(pos, idx.getX(t + 1));
      c.fromBufferAttribute(pos, idx.getX(t + 2));
      const face = b.clone().sub(a).cross(c.clone().sub(a));
      if (face.dot(a) > 0) outward++;
    }
    expect(outward / (idx.count / 3)).toBeGreaterThan(0.99);
  });

  it('keeps holes cut out of a field (like the obturator foramen)', () => {
    const ring = subtract(capsule([-1, 0, 0], [1, 0, 0], 0.5), capsule([0, 0, -1], [0, 0, 1], 0.25));
    const g = meshSdf(ring, { min: [-1.6, -0.7, -0.7], max: [1.6, 0.7, 0.7], cell: 0.05 });
    const pos = g.attributes.position;
    const p = new Vector3();
    let insideHole = 0;
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      if (Math.hypot(p.x, p.y) < 0.2 && Math.abs(p.z) < 0.3) insideHole++;
    }
    expect(insideHole).toBe(0);
  });

  it('bakes darker shading into hollows when asked', () => {
    const f = smooth(0.05, sphere([0, 0, 0], 0.6), sphere([0.7, 0, 0], 0.4));
    const g = meshSdf(f, { min: [-0.8, -0.8, -0.8], max: [1.3, 0.8, 0.8], cell: 0.05, ao: 0.05 });
    const col = g.attributes.color;
    expect(col).toBeDefined();
    let min = 1;
    for (let i = 0; i < col.count; i++) min = Math.min(min, col.getX(i));
    expect(min).toBeLessThan(0.9);
  });
});

describe('skeleton anatomy', () => {
  it('keeps the orbital and nasal recesses distinct and the incisors nearly together', () => {
    const skull = buildSkull(1.35);
    const jaw = buildMandible(1.35);
    const material = new MeshBasicMaterial();
    const mesh = new Mesh(skull, material);
    const surfaceZ = (x: number, y: number) => {
      const ray = new Raycaster(new Vector3(x, SKULL_ORIGIN[1] + y, 1.3), new Vector3(0, 0, -1));
      return ray.intersectObject(mesh)[0].point.z;
    };
    const forehead = surfaceZ(0, 0.40);
    expect(surfaceZ(0.28, -0.01)).toBeLessThan(forehead - 0.22);
    expect(surfaceZ(-0.28, -0.01)).toBeLessThan(forehead - 0.22);
    expect(surfaceZ(0.077, -0.29)).toBeLessThan(forehead - 0.24);
    // The bony wall between the orbit and the nose must remain at the face.
    expect(surfaceZ(0.12, -0.17)).toBeGreaterThan(forehead - 0.09);
    expect(surfaceZ(-0.12, -0.17)).toBeGreaterThan(forehead - 0.09);

    const incisorHeights = (geo: typeof skull) => {
      const pos = geo.attributes.position;
      const ys: number[] = [];
      for (let i = 0; i < pos.count; i++) {
        if (Math.abs(pos.getX(i)) < 0.09 && pos.getZ(i) > SKULL_ORIGIN[2] + 0.68) ys.push(pos.getY(i));
      }
      return ys;
    };
    const incisorGap = Math.min(...incisorHeights(skull)) - Math.max(...incisorHeights(jaw));
    expect(incisorGap).toBeGreaterThan(0.005);
    expect(incisorGap).toBeLessThan(0.035);
    skull.dispose();
    jaw.dispose();
    material.dispose();
  });

  it('has 7 cervical, 12 thoracic and 5 lumbar vertebrae, top to bottom', () => {
    expect(VERTEBRAE.cervical).toHaveLength(7);
    expect(VERTEBRAE.thoracic).toHaveLength(12);
    expect(VERTEBRAE.lumbar).toHaveLength(5);
    const ys = [...VERTEBRAE.cervical, ...VERTEBRAE.thoracic, ...VERTEBRAE.lumbar].map((v) => v.y);
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeLessThan(ys[i - 1]);
  });

  it('cuts the long bone into a thick shaft wall and a thin shell round the head', () => {
    expect(outerR(-1) - innerR(-1)).toBeGreaterThan(0.1);
    expect(outerR(1.5) - innerR(1.5)).toBeLessThan(0.06);
    expect(outerR(CUT.top)).toBe(0);
  });
});

describe('waving pose', () => {
  it('starts at rest, raises the arm, waves and comes back down', () => {
    expect(poseAt(0).shoulderZ).toBeCloseTo(REST.shoulderZ, 5);
    expect(poseAt(2.5).shoulderZ).toBeGreaterThan(1.2);
    expect(poseAt(2.5).elbowZ).toBeGreaterThan(1.2);
    const wave = [2, 2.25, 2.5, 2.75, 3].map((t) => poseAt(t).elbowZ);
    expect(Math.max(...wave) - Math.min(...wave)).toBeGreaterThan(0.2);
    expect(poseAt(WAVE_CYCLE - 0.5).shoulderZ).toBeCloseTo(0, 5);
  });
});
