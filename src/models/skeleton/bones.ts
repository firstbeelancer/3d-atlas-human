import { BufferGeometry, CatmullRomCurve3, LineCurve3, Matrix4, SphereGeometry, Vector3, Euler, Quaternion } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  capsule, chain, ellipsoid, flatCapsule, meshSdf, mirrorX, rotateX, roundBox, smooth, smoothSubtract, sphere,
  strip, subtract, torus, triangle, union, bounded, type Sdf, type V3,
} from './sdf';
import { knobbyProfile, sweep } from './sweep';
import { RIB_END_Y, RIB_Y, SKULL_ORIGIN, STERNAL_Y, STERNUM, spineZ, sternumZ } from './anatomy';

/*
  Геометрия костей. Всё строится в коде: поля расстояний (череп, таз, позвонки, длинные кости)
  и трубки по кривым (рёбра, ключица, хрящи, кости кисти и стопы). Левая сторона строится один раз,
  правая — зеркальным отражением в сцене. Координаты — дециметры, как в anatomy.ts.
*/

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
const off = (o: V3, p: V3): V3 => [o[0] + p[0], o[1] + p[1], o[2] + p[2]];

function blob(c: V3, r: V3, seg = 14): BufferGeometry {
  const g = new SphereGeometry(1, seg, Math.max(8, Math.round(seg * 0.7)));
  g.deleteAttribute('uv');
  g.scale(r[0], r[1], r[2]);
  g.translate(c[0], c[1], c[2]);
  return g;
}

function stick(a: V3, b: V3, r: number, segments = 12, radial = 10, ends = 1.45): BufferGeometry {
  return sweep(new LineCurve3(v(...a), v(...b)), { radius: knobbyProfile(r, ends), segments, radial });
}

function merge(list: BufferGeometry[]): BufferGeometry {
  const cleaned = list.map((g) => {
    const n = g;
    if (n.attributes.uv) n.deleteAttribute('uv');
    if (!n.attributes.normal) n.computeVertexNormals();
    return n;
  });
  const g = mergeGeometries(cleaned, false);
  if (!g) throw new Error('merge failed');
  g.computeBoundingSphere();
  return g;
}

/* ---------------- Череп ---------------- */

function skullField(): Sdf {
  const O = SKULL_ORIGIN;
  const p = (x: number, y: number, z: number): V3 => off(O, [x, y, z]);
  // мозговой череп: лоб, темя, затылок и основание
  const cranium = smooth(
    0.16,
    ellipsoid(p(0, 0.32, -0.18), [0.72, 0.82, 0.96]),
    ellipsoid(p(0, 0.3, 0.16), [0.64, 0.7, 0.64]),
    ellipsoid(p(0, 0.05, -0.72), [0.5, 0.45, 0.42]),
    ellipsoid(p(0, -0.2, -0.2), [0.58, 0.34, 0.6]),
  );
  // лицевой череп: края глазниц, скуловые кости и дуги, верхняя челюсть
  const brow = mirrorX(capsule(p(0.05, 0.14, 0.8), p(0.43, 0.13, 0.67), 0.062, 0.05));
  const lateralRim = mirrorX(capsule(p(0.46, 0.11, 0.64), p(0.49, -0.16, 0.6), 0.048, 0.052));
  const lowerRim = mirrorX(capsule(p(0.13, -0.18, 0.8), p(0.45, -0.19, 0.64), 0.04, 0.046));
  const zygoma = mirrorX(ellipsoid(p(0.47, -0.25, 0.58), [0.1, 0.085, 0.085]));
  const arch = mirrorX(capsule(p(0.56, -0.25, 0.44), p(0.67, -0.22, -0.12), 0.042, 0.038));
  const maxilla = smooth(
    0.07,
    roundBox(p(0, -0.36, 0.58), [0.27, 0.19, 0.22], 0.13),
    ellipsoid(p(0, -0.53, 0.5), [0.27, 0.075, 0.31]),
  );
  const mastoid = mirrorX(ellipsoid(p(0.53, -0.42, -0.34), [0.06, 0.11, 0.075]));
  let skull = smooth(0.09, cranium, brow, lateralRim, lowerRim, zygoma, arch, maxilla, mastoid);

  // глазницы: глубокие воронки, сужающиеся к зрительному каналу
  const orbits = mirrorX(
    smooth(
      0.06,
      flatCapsule(p(0.28, -0.02, 1.08), p(0.26, -0.03, 0.64), 0.19, 0.155, [1.06, 0.9, 1]),
      capsule(p(0.26, -0.03, 0.64), p(0.17, -0.03, 0.24), 0.13, 0.045),
    ),
  );
  // грушевидное отверстие носа: узкое вверху, широкое внизу
  const nose = smooth(
    0.06,
    capsule(p(0, -0.17, 1.08), p(0, -0.17, 0.58), 0.05),
    capsule(p(0, -0.33, 1.08), p(0, -0.33, 0.55), 0.085),
  );
  const fossa = mirrorX(ellipsoid(p(0.22, -0.42, 0.8), [0.1, 0.08, 0.06]));
  const temple = mirrorX(ellipsoid(p(0.8, 0.0, 0.16), [0.15, 0.3, 0.3]));
  const ear = mirrorX(capsule(p(0.8, -0.3, -0.22), p(0.52, -0.3, -0.22), 0.055));
  skull = smoothSubtract(0.05, skull, orbits, nose);
  skull = smoothSubtract(0.08, skull, temple, fossa);
  skull = subtract(skull, ear);
  // носовые кости — мостик над грушевидным отверстием
  skull = smooth(0.04, skull, flatCapsule(p(0, 0.06, 0.8), p(0, -0.13, 0.86), 0.055, 0.05, [1.15, 1, 0.5]));

  // верхние зубы: резцы, клыки, премоляры и моляры по дуге
  const teeth: Sdf[] = [];
  for (const side of [1, -1]) {
    for (let k = 0; k < 8; k++) {
      const u = (k + 0.5) / 8;
      const x = side * (-0.004 + 0.29 * Math.pow(Math.sin((u * Math.PI) / 2), 0.85));
      const z = 0.76 - 0.45 * Math.pow(u, 1.5);
      const r = k < 2 ? 0.034 : k < 3 ? 0.036 : k < 5 ? 0.038 : 0.048;
      teeth.push(capsule(p(x, -0.56, z - 0.02), p(x, -0.68, z), r * 0.85, r));
    }
  }
  return union(skull, bounded(union(...teeth), p(-0.4, -0.75, 0.2), p(0.4, -0.5, 0.84)));
}

function mandibleField(): Sdf {
  const O = SKULL_ORIGIN;
  const p = (x: number, y: number, z: number): V3 => off(O, [x, y, z]);
  // тело челюсти: подкова от подбородка к углу
  const arc: [number, number, number][] = [[0, 0.72, -1.1], [0.15, 0.66, -1.07], [0.28, 0.49, -1.02], [0.38, 0.24, -0.96], [0.44, -0.04, -0.89]];
  const low = arc.map(([x, z, y]) => p(x, y, z));
  const high = arc.map(([x, z]) => p(x * 0.95, -0.8, z - 0.03));
  // ветвь: угол, венечный отросток спереди, мыщелок сзади, между ними вырезка
  const angle = p(0.45, -0.87, -0.1);
  const front = p(0.43, -0.8, 0.08);
  const coronoid = p(0.43, -0.32, 0.12);
  const neck = p(0.49, -0.43, -0.19);
  const half = smooth(
    0.05,
    strip(low, high, 0.045),
    chain(low, [0.065, 0.06, 0.056, 0.053, 0.05]),
    triangle(angle, front, coronoid, 0.034),
    triangle(angle, coronoid, neck, 0.034),
    // задний край ветви и скруглённый угол
    chain([p(0.44, -0.86, 0.02), p(0.455, -0.88, -0.08), p(0.47, -0.78, -0.17), neck], [0.05, 0.052, 0.045, 0.04]),
    chain([p(0.43, -0.62, 0.11), coronoid], [0.035, 0.022]),
    // мыщелок — суставная головка, входит в ямку перед слуховым проходом
    ellipsoid(p(0.5, -0.36, -0.18), [0.1, 0.045, 0.06]),
  );
  let jaw = mirrorX(half);
  // вырезка между венечным отростком и мыщелком
  jaw = smoothSubtract(0.02, jaw, mirrorX(sphere(p(0.46, -0.27, -0.04), 0.11)));
  // подбородочный выступ
  jaw = smooth(0.05, jaw, ellipsoid(p(0, -1.05, 0.72), [0.13, 0.06, 0.05]));
  const teeth: Sdf[] = [];
  for (const side of [1, -1]) {
    for (let k = 0; k < 8; k++) {
      const u = (k + 0.5) / 8;
      const x = side * (-0.022 + 0.3 * Math.pow(Math.sin((u * Math.PI) / 2), 0.85));
      const z = 0.73 - 0.45 * Math.pow(u, 1.5);
      const r = k < 2 ? 0.032 : k < 3 ? 0.034 : k < 5 ? 0.037 : 0.047;
      teeth.push(capsule(p(x, -0.8, z), p(x, -0.68, z + 0.01), r, r * 0.85));
    }
  }
  return union(jaw, bounded(union(...teeth), p(-0.4, -0.86, 0.2), p(0.4, -0.64, 0.82)));
}

/* ---------------- Позвонки ---------------- */

function cervicalField(): Sdf {
  return smooth(
    0.04,
    roundBox([0, 0, 0], [0.14, 0.06, 0.105], 0.045),
    subtract(torus([0, 0, -0.22], 0.12, 0.038), roundBox([0, 0, 0.0], [0.4, 0.4, 0.12], 0)),
    capsule([0, 0, -0.32], [0, -0.07, -0.44], 0.04, 0.032),
    mirrorX(capsule([0.1, 0.0, -0.06], [0.25, -0.01, -0.1], 0.038, 0.03)),
    mirrorX(capsule([0.13, 0.06, -0.2], [0.13, -0.06, -0.22], 0.04)),
  );
}

function thoracicField(): Sdf {
  return smooth(
    0.045,
    roundBox([0, 0, 0], [0.14, 0.085, 0.13], 0.06),
    subtract(torus([0, 0, -0.25], 0.1, 0.045), roundBox([0, 0, 0.02], [0.4, 0.4, 0.13], 0)),
    capsule([0, -0.02, -0.33], [0, -0.26, -0.56], 0.045, 0.028),
    mirrorX(capsule([0.07, 0.02, -0.22], [0.26, 0.04, -0.32], 0.045, 0.04)),
    mirrorX(capsule([0.1, 0.1, -0.24], [0.1, -0.06, -0.27], 0.035)),
  );
}

function lumbarField(): Sdf {
  return smooth(
    0.05,
    roundBox([0, 0, 0], [0.22, 0.13, 0.16], 0.07),
    subtract(torus([0, 0, -0.29], 0.12, 0.058), roundBox([0, 0, 0.02], [0.4, 0.4, 0.16], 0)),
    roundBox([0, -0.02, -0.5], [0.04, 0.1, 0.13], 0.04),
    mirrorX(capsule([0.1, 0.02, -0.22], [0.38, 0.03, -0.26], 0.042, 0.028)),
    mirrorX(capsule([0.12, 0.13, -0.33], [0.12, -0.1, -0.35], 0.048)),
  );
}

function sacrumField(): Sdf {
  const pts: [number, number, number, number][] = [
    [9.72, -0.42, 0.5, 0.14], [9.52, -0.55, 0.42, 0.12], [9.33, -0.68, 0.32, 0.1], [9.16, -0.79, 0.22, 0.085],
    [9.02, -0.87, 0.14, 0.07],
  ];
  const body = smooth(0.12, ...pts.map(([y, z, w, t]) => ellipsoid([0, y, z], [w, 0.14, t])));
  const alae = mirrorX(ellipsoid([0.36, 9.66, -0.52], [0.24, 0.16, 0.2]));
  const crest = chain(pts.map(([y, z]) => [0, y, z - 0.12] as V3), 0.04);
  let s = smooth(0.08, body, alae, crest);
  const holes: Sdf[] = [];
  for (let i = 0; i < 4; i++) {
    const [y0, z0] = pts[i];
    const [y1, z1] = pts[i + 1];
    holes.push(mirrorX(sphere([0.2 - i * 0.03, (y0 + y1) / 2, (z0 + z1) / 2 + 0.11], 0.042)));
  }
  s = subtract(s, ...holes);
  return s;
}

function coccyxField(): Sdf {
  return smooth(
    0.03,
    ellipsoid([0, 8.9, -0.9], [0.1, 0.07, 0.06]),
    ellipsoid([0, 8.8, -0.89], [0.075, 0.055, 0.05]),
    ellipsoid([0, 8.71, -0.85], [0.055, 0.045, 0.04]),
    ellipsoid([0, 8.64, -0.8], [0.035, 0.035, 0.03]),
  );
}

/* ---------------- Таз (левая тазовая кость) ---------------- */

function hipBoneField(): Sdf {
  const A: V3 = [0.88, 9.15, 0.02];
  // крыло подвздошной кости — изогнутая пластинка между дугообразной линией и гребнем
  const lower: V3[] = [[1.05, 9.42, 0.36], [0.95, 9.38, 0.2], [0.82, 9.45, 0.0], [0.68, 9.55, -0.22], [0.54, 9.68, -0.42]];
  const crestPts: V3[] = [[1.18, 9.92, 0.46], [1.38, 10.22, 0.28], [1.46, 10.42, 0.0], [1.3, 10.42, -0.3], [0.82, 10.12, -0.56]];
  const wing = strip(lower, crestPts, 0.035);
  const crest = chain(crestPts, [0.07, 0.06, 0.06, 0.065, 0.075]);
  const body = ellipsoid([0.9, 9.36, 0.05], [0.17, 0.2, 0.22]);
  const auricular = ellipsoid([0.6, 9.74, -0.45], [0.1, 0.22, 0.14]);
  const backEdge = chain([[0.82, 10.12, -0.56], [0.62, 9.85, -0.52], [0.6, 9.5, -0.36], [0.72, 9.0, -0.16]], [0.07, 0.07, 0.06, 0.07]);
  // кольцо вокруг запирательного отверстия: ветви лобковой и седалищной костей
  const ring: V3[] = [
    [0.76, 8.95, 0.22], [0.45, 8.96, 0.42], [0.1, 8.93, 0.56], [0.09, 8.72, 0.55], [0.26, 8.55, 0.44],
    [0.44, 8.44, 0.26], [0.6, 8.43, 0.02], [0.74, 8.7, 0.0], [0.76, 8.95, 0.22],
  ];
  const rami = chain(ring, [0.1, 0.07, 0.08, 0.08, 0.055, 0.06, 0.11, 0.1, 0.1]);
  const tuber = ellipsoid([0.6, 8.42, -0.05], [0.1, 0.1, 0.14]);
  const ischialSpine = capsule([0.68, 8.86, -0.2], [0.55, 8.84, -0.32], 0.04, 0.022);
  const cup = sphere(A, 0.33);
  let bone = smooth(0.08, wing, crest, body, auricular, backEdge);
  bone = smooth(0.07, bone, cup, rami, tuber, ischialSpine);
  // вертлужная впадина: глубокая чаша для головки бедра, открыта вбок, вперёд и вниз
  const d = new Vector3(0.75, -0.35, 0.55).normalize();
  bone = smoothSubtract(0.03, bone, sphere([A[0] + d.x * 0.11, A[1] + d.y * 0.11, A[2] + d.z * 0.11], 0.26));
  return bone;
}

/* ---------------- Пояс верхней конечности ---------------- */

function scapulaField(): Sdf {
  const SA: V3 = [0.75, 14.32, -0.96];
  const IA: V3 = [0.86, 12.55, -0.9];
  const G: V3 = [1.56, 14.0, -0.4];
  const M: V3 = [1.12, 13.35, -0.8];
  const sup: V3 = [1.3, 14.24, -0.62];
  const plate = union(triangle(SA, M, IA, 0.03), triangle(SA, sup, M, 0.03), triangle(sup, G, M, 0.03), triangle(M, G, IA, 0.03));
  const lateralBorder = chain([IA, [1.2, 13.25, -0.7], G], [0.05, 0.06, 0.07]);
  const medialBorder = chain([SA, [0.72, 13.4, -0.98], IA], 0.035);
  const superiorBorder = chain([SA, sup, [1.45, 14.12, -0.5]], 0.03);
  const spine = chain([[0.76, 13.95, -1.02], [1.18, 14.1, -1.02], [1.48, 14.28, -0.82]], [0.04, 0.06, 0.07]);
  const acromion = flatCapsule([1.5, 14.32, -0.78], [1.74, 14.34, -0.3], 0.08, 0.075, [1, 0.55, 1]);
  const coracoid = chain([[1.42, 14.12, -0.5], [1.4, 14.22, -0.28], [1.5, 14.12, -0.06]], [0.05, 0.045, 0.035]);
  const glenoid = ellipsoid([1.58, 14.0, -0.38], [0.08, 0.17, 0.12]);
  let s = smooth(0.06, plate, lateralBorder, medialBorder, superiorBorder, spine, acromion, coracoid, glenoid);
  s = smoothSubtract(0.02, s, ellipsoid([1.72, 14.0, -0.32], [0.08, 0.16, 0.12]));
  return s;
}

function clavicleGeometry(): BufferGeometry {
  const path = new CatmullRomCurve3(
    [v(0.15, 14.25, 0.88), v(0.55, 14.3, 0.94), v(1.02, 14.36, 0.66), v(1.42, 14.38, 0.12), v(1.66, 14.35, -0.28)],
    false,
    'centripetal',
  );
  return sweep(path, {
    radius: (t) => {
      const medial = Math.exp(-((t / 0.12) ** 2));
      const lateral = Math.exp(-(((1 - t) / 0.2) ** 2));
      const w = 0.058 + 0.05 * medial + 0.045 * lateral;
      const h = 0.055 + 0.04 * medial - 0.01 * lateral;
      return [w, h];
    },
    segments: 56,
    radial: 16,
  });
}

/* ---------------- Кости руки ---------------- */

function humerusField(): Sdf {
  const head = sphere([1.6, 14.02, -0.28], 0.235);
  const greater = ellipsoid([1.79, 13.97, -0.22], [0.1, 0.15, 0.13]);
  const lesser = sphere([1.63, 13.9, -0.06], 0.065);
  const shaft = chain([[1.7, 13.8, -0.27], [1.79, 12.6, -0.3], [1.83, 11.3, -0.33]], [0.12, 0.1, 0.11]);
  const deltoid = ellipsoid([1.87, 12.95, -0.26], [0.06, 0.25, 0.08]);
  const flare = ellipsoid([1.83, 11.12, -0.33], [0.25, 0.26, 0.1]);
  const trochlea = capsule([1.62, 10.9, -0.28], [1.82, 10.9, -0.28], 0.09);
  const capitulum = sphere([1.95, 10.92, -0.26], 0.085);
  const medialEpi = sphere([1.53, 10.98, -0.34], 0.075);
  const lateralEpi = sphere([2.1, 10.99, -0.32], 0.055);
  let b = smooth(0.08, head, greater, lesser, shaft, deltoid);
  b = smooth(0.07, b, flare, trochlea, capitulum, medialEpi, lateralEpi);
  b = smoothSubtract(0.03, b, ellipsoid([1.8, 11.08, -0.44], [0.1, 0.1, 0.06]));
  return b;
}

function radiusField(): Sdf {
  return smooth(
    0.05,
    capsule([1.97, 10.8, -0.27], [1.97, 10.7, -0.27], 0.095),
    chain([[1.98, 10.62, -0.26], [2.08, 9.5, -0.2], [2.1, 8.6, -0.15]], [0.05, 0.06, 0.075]),
    ellipsoid([2.07, 8.48, -0.15], [0.16, 0.09, 0.11]),
    capsule([2.18, 8.48, -0.15], [2.22, 8.36, -0.15], 0.045, 0.025),
  );
}

function ulnaField(): Sdf {
  let u = smooth(
    0.05,
    ellipsoid([1.7, 10.97, -0.42], [0.09, 0.14, 0.1]),
    capsule([1.7, 10.92, -0.36], [1.7, 10.72, -0.26], 0.09, 0.08),
    chain([[1.7, 10.7, -0.32], [1.78, 9.6, -0.26], [1.88, 8.55, -0.19]], [0.075, 0.055, 0.045]),
    sphere([1.88, 8.49, -0.19], 0.06),
    capsule([1.86, 8.48, -0.24], [1.85, 8.38, -0.24], 0.03, 0.02),
  );
  u = smoothSubtract(0.02, u, sphere([1.7, 10.88, -0.26], 0.1));
  return u;
}

/** Кисть: 8 костей запястья, 5 пястных, 14 фаланг. Ладонь вперёд, большой палец наружу. */
function handGeometry(): BufferGeometry {
  const W = [2.0, 8.38, -0.15] as V3;
  const P = (x: number, y: number, z: number): V3 => off(W, [x, y, z]);
  const parts: BufferGeometry[] = [];
  // запястье: проксимальный и дистальный ряды
  // кости запястья плотно уложены в два ряда и упираются в лучевую кость
  const carpals: [V3, V3][] = [
    [P(0.16, -0.045, 0.0), [0.09, 0.06, 0.075]], // ладьевидная
    [P(0.03, -0.04, 0.0), [0.075, 0.062, 0.078]], // полулунная
    [P(-0.09, -0.05, -0.01), [0.068, 0.058, 0.068]], // трёхгранная
    [P(-0.12, -0.075, 0.07), [0.045, 0.045, 0.045]], // гороховидная
    [P(0.2, -0.15, 0.03), [0.07, 0.06, 0.068]], // кость-трапеция
    [P(0.1, -0.16, 0.0), [0.055, 0.058, 0.062]], // трапециевидная
    [P(0.0, -0.155, -0.01), [0.068, 0.075, 0.078]], // головчатая
    [P(-0.12, -0.15, 0.0), [0.072, 0.072, 0.072]], // крючковидная
  ];
  parts.push(
    meshSdf(smooth(0.012, ...carpals.map(([c, r]) => ellipsoid(c, r))), {
      min: P(-0.24, -0.26, -0.12),
      max: P(0.31, 0.04, 0.16),
      cell: 0.012,
    }),
  );

  const fingers = [
    { x: 0.15, meta: 0.66, prox: 0.42, mid: 0.25, dist: 0.18, r: 0.042 },
    { x: 0.04, meta: 0.64, prox: 0.45, mid: 0.29, dist: 0.19, r: 0.043 },
    { x: -0.07, meta: 0.58, prox: 0.42, mid: 0.27, dist: 0.19, r: 0.04 },
    { x: -0.17, meta: 0.52, prox: 0.34, mid: 0.2, dist: 0.17, r: 0.036 },
  ];
  for (const f of fingers) {
    const base = P(f.x * 0.75, -0.25, 0.0);
    const spread = f.x * 0.22;
    let cur = base;
    const segs = [f.meta, f.prox, f.mid, f.dist];
    const radii = [f.r, f.r * 0.92, f.r * 0.78, f.r * 0.66];
    segs.forEach((len, i) => {
      const curl = 0.1 + i * 0.12; // лёгкий изгиб пальцев вперёд
      const dir = new Vector3(spread, -1, Math.sin(curl) * 0.5).normalize();
      const next: V3 = [cur[0] + dir.x * len, cur[1] + dir.y * len, cur[2] + dir.z * len];
      parts.push(stick(cur, next, radii[i], 10, 10, i === 3 ? 1.25 : 1.45));
      cur = [next[0] + dir.x * 0.025, next[1] + dir.y * 0.025, next[2] + dir.z * 0.025];
    });
  }
  // большой палец: смотрит наружу и немного вперёд
  let cur = P(0.23, -0.2, 0.07);
  const thumb = [0.36, 0.27, 0.2];
  const tr = [0.048, 0.042, 0.034];
  thumb.forEach((len, i) => {
    const dir = new Vector3(0.3 - i * 0.07, -1, 0.42 + i * 0.08).normalize();
    const next: V3 = [cur[0] + dir.x * len, cur[1] + dir.y * len, cur[2] + dir.z * len];
    parts.push(stick(cur, next, tr[i], 10, 10, i === 2 ? 1.25 : 1.45));
    cur = [next[0] + dir.x * 0.025, next[1] + dir.y * 0.025, next[2] + dir.z * 0.025];
  });
  return merge(parts);
}

/* ---------------- Кости ноги ---------------- */

function femurField(): Sdf {
  const head = sphere([0.88, 9.15, 0.02], 0.24);
  const neck = capsule([0.9, 9.13, 0.02], [1.22, 8.95, -0.02], 0.14, 0.16);
  const greater = ellipsoid([1.36, 9.06, -0.1], [0.13, 0.21, 0.15]);
  const lesser = sphere([1.08, 8.68, -0.13], 0.07);
  const shaft = chain([[1.28, 8.82, -0.04], [0.98, 7.1, 0.06], [0.66, 5.4, 0.0]], [0.145, 0.125, 0.14]);
  const aspera = chain([[1.2, 8.5, -0.14], [0.97, 7.1, -0.07], [0.7, 5.6, -0.12]], 0.05);
  const flare = ellipsoid([0.58, 5.2, -0.03], [0.3, 0.32, 0.22]);
  const medCond = ellipsoid([0.41, 4.93, -0.06], [0.15, 0.18, 0.26]);
  const latCond = ellipsoid([0.75, 4.95, -0.06], [0.15, 0.18, 0.25]);
  let f = smooth(0.1, head, neck, greater, lesser, shaft, aspera);
  f = smooth(0.1, f, flare, medCond, latCond);
  f = smoothSubtract(0.03, f, capsule([0.58, 4.82, -0.36], [0.58, 4.86, 0.0], 0.075));
  f = smoothSubtract(0.04, f, capsule([0.58, 4.95, 0.3], [0.58, 5.25, 0.27], 0.06));
  return f;
}

function patellaField(): Sdf {
  return smooth(
    0.06,
    ellipsoid([0.58, 5.06, 0.3], [0.2, 0.2, 0.09]),
    capsule([0.58, 5.02, 0.3], [0.58, 4.84, 0.28], 0.1, 0.04),
  );
}

function tibiaField(): Sdf {
  // мыщелки плато плавно сужаются в стержень, а не нависают «грибом»
  const med = ellipsoid([0.43, 4.62, -0.04], [0.17, 0.1, 0.22]);
  const lat = ellipsoid([0.74, 4.62, -0.06], [0.16, 0.1, 0.21]);
  const flare = ellipsoid([0.58, 4.42, -0.03], [0.27, 0.26, 0.2]);
  const tub = ellipsoid([0.58, 4.36, 0.17], [0.08, 0.11, 0.07]);
  const shaft = chain([[0.58, 4.45, -0.03], [0.55, 2.6, 0.04], [0.53, 1.0, 0.0]], [0.15, 0.11, 0.12]);
  const crest = chain([[0.6, 4.3, 0.12], [0.56, 2.6, 0.13], [0.54, 1.3, 0.08]], 0.035);
  const distal = ellipsoid([0.53, 0.86, -0.02], [0.17, 0.14, 0.17]);
  const malleolus = ellipsoid([0.38, 0.7, -0.02], [0.07, 0.13, 0.09]);
  let t = smooth(0.12, med, lat, flare, tub, shaft, crest);
  t = smooth(0.08, t, distal, malleolus);
  t = smoothSubtract(0.02, t, ellipsoid([0.58, 4.76, -0.05], [0.06, 0.05, 0.3]));
  return t;
}

function fibulaField(): Sdf {
  return smooth(
    0.05,
    ellipsoid([0.89, 4.38, -0.15], [0.08, 0.09, 0.08]),
    chain([[0.89, 4.3, -0.15], [0.87, 2.6, -0.11], [0.81, 0.92, -0.1]], [0.045, 0.05, 0.05]),
    ellipsoid([0.8, 0.7, -0.1], [0.07, 0.16, 0.08]),
  );
}

/** Стопа: 7 костей предплюсны, 5 плюсневых, 14 фаланг пальцев. Свод стопы приподнят. */
function footGeometry(): BufferGeometry {
  const A = [0.58, 0.6, -0.02] as V3;
  const turn = 0.12; // носки чуть развёрнуты наружу
  const m = new Matrix4().compose(new Vector3(...A), new Quaternion().setFromEuler(new Euler(0, turn, 0)), new Vector3(1, 1, 1));
  const parts: BufferGeometry[] = [];
  // кости предплюсны — поле расстояний (таранная и пяточная перетекают в характерную форму)
  const tarsal = smooth(
    0.04,
    ellipsoid([0, -0.02, 0.0], [0.15, 0.11, 0.25]),
    ellipsoid([0.04, -0.3, -0.2], [0.14, 0.19, 0.3]),
    sphere([0.03, -0.4, -0.42], 0.135),
  );
  const mid = union(
    ellipsoid([-0.1, -0.12, 0.32], [0.13, 0.1, 0.07]),
    roundBox([0.17, -0.3, 0.3], [0.09, 0.09, 0.12], 0.04),
    ellipsoid([-0.15, -0.2, 0.47], [0.07, 0.12, 0.085]),
    ellipsoid([-0.03, -0.18, 0.46], [0.055, 0.09, 0.07]),
    ellipsoid([0.08, -0.2, 0.47], [0.06, 0.1, 0.08]),
  );
  parts.push(meshSdf(union(tarsal, mid), { min: [-0.32, -0.62, -0.62], max: [0.34, 0.14, 0.6], cell: 0.022 }));
  const metas: [V3, V3, number][] = [
    [[-0.15, -0.28, 0.56], [-0.2, -0.5, 1.22], 0.06],
    [[-0.04, -0.24, 0.56], [-0.07, -0.5, 1.28], 0.042],
    [[0.06, -0.26, 0.56], [0.05, -0.51, 1.22], 0.04],
    [[0.15, -0.3, 0.5], [0.16, -0.52, 1.13], 0.038],
    [[0.24, -0.36, 0.42], [0.27, -0.53, 1.0], 0.038],
  ];
  const toes = [
    [0.33, 0.25],
    [0.24, 0.14, 0.11],
    [0.22, 0.13, 0.1],
    [0.2, 0.12, 0.09],
    [0.18, 0.1, 0.09],
  ];
  metas.forEach(([a, b, r], i) => {
    parts.push(stick(a, b, r, 12, 10));
    let cur: V3 = [b[0], b[1], b[2] + 0.03];
    toes[i].forEach((len, k) => {
      const dir = new Vector3(i === 0 ? -0.05 : 0.02 * i, k === 0 ? 0.08 : -0.12, 1).normalize();
      const next: V3 = [cur[0] + dir.x * len, cur[1] + dir.y * len, cur[2] + dir.z * len];
      const rr = (i === 0 ? 0.055 : 0.032) * (1 - k * 0.15);
      parts.push(stick(cur, next, rr, 8, 9, k === toes[i].length - 1 ? 1.2 : 1.4));
      cur = [next[0] + dir.x * 0.02, next[1] + dir.y * 0.02, next[2] + dir.z * 0.02];
    });
  });
  parts.push(blob([0.27, -0.42, 0.42], [0.05, 0.045, 0.06], 10));
  const g = merge(parts);
  g.applyMatrix4(m);
  return g;
}

/* ---------------- Грудная клетка ---------------- */

function sternumField(): Sdf {
  const top = STERNUM.top;
  const tilt = Math.atan2(STERNUM.bottomZ - STERNUM.topZ, STERNUM.top - STERNUM.bottom);
  const c: V3 = [0, top, STERNUM.topZ];
  const z = STERNUM.topZ;
  // рукоятка — широкая трапеция, тело — длинная пластинка, мечевидный отросток — узкий хвостик
  const manubrium = smooth(
    0.06,
    flatCapsule([-0.13, top - 0.12, z], [0.13, top - 0.12, z], 0.13, 0.13, [1, 1, 0.38]),
    flatCapsule([0, top - 0.16, z], [0, top - 0.44, z], 0.16, 0.12, [1, 1, 0.38]),
  );
  const body = smooth(
    0.06,
    flatCapsule([0, top - 0.5, z], [0, top - 1.0, z], 0.12, 0.13, [1, 1, 0.4]),
    flatCapsule([0, top - 1.0, z], [0, top - 1.42, z], 0.13, 0.1, [1, 1, 0.4]),
  );
  const angle = capsule([-0.13, top - 0.47, z + 0.02], [0.13, top - 0.47, z + 0.02], 0.035);
  const xiphoid = flatCapsule([0, top - 1.48, z + 0.005], [0, top - 1.86, z + 0.03], 0.06, 0.025, [1, 1, 0.45]);
  // яремная и ключичные вырезки
  const notches = union(sphere([0, top + 0.03, z], 0.085), mirrorX(sphere([0.19, top - 0.01, z], 0.07)));
  // вырезки для рёберных хрящей по краям тела
  const facets: Sdf[] = [];
  for (const ys of STERNAL_Y.slice(1)) facets.push(mirrorX(sphere([0.17, ys + (top - STERNUM.top), z], 0.035)));
  const local = smoothSubtract(0.02, smooth(0.05, manubrium, body, angle, xiphoid), notches, ...facets);
  return rotateX(local, tilt, c);
}

interface RibSpec {
  a: number;
  xf: number;
  zf: number;
}

const RIBS: RibSpec[] = [
  { a: 0.55, xf: 0.38, zf: 0.74 },
  { a: 0.84, xf: 0.5, zf: 0.9 },
  { a: 1.02, xf: 0.6, zf: 0.98 },
  { a: 1.14, xf: 0.68, zf: 1.03 },
  { a: 1.24, xf: 0.76, zf: 1.05 },
  { a: 1.32, xf: 0.86, zf: 1.03 },
  { a: 1.38, xf: 0.96, zf: 0.98 },
  { a: 1.42, xf: 1.1, zf: 0.82 },
  { a: 1.44, xf: 1.22, zf: 0.64 },
  { a: 1.44, xf: 1.33, zf: 0.44 },
  { a: 1.38, xf: 1.34, zf: 0.06 },
  { a: 1.16, xf: 1.06, zf: -0.26 },
];

export function ribPath(i: number): CatmullRomCurve3 {
  const { a, xf, zf } = RIBS[i];
  const y = RIB_Y[i];
  const zi = spineZ(y);
  const d = y - RIB_END_Y[i];
  const zb = zi - 0.4;
  const zl = zb + 0.55 * (zf - zb);
  const pts = [
    v(0.13, y + 0.02, zi - 0.06),
    v(0.3, y, zi - 0.3),
    v(0.62 * a, y - 0.05, zb),
    v(0.92 * a, y - 0.28 * d, zb + 0.32 * (zf - zb)),
    v(a, y - 0.5 * d, zl),
    v(0.6 * (a + xf), y - 0.78 * d, zb + 0.84 * (zf - zb)),
    v(xf, y - d, zf),
  ];
  return new CatmullRomCurve3(pts, false, 'centripetal');
}

function ribsGeometry(): BufferGeometry {
  const list: BufferGeometry[] = [];
  RIBS.forEach((_, i) => {
    const floating = i >= 10;
    list.push(
      sweep(ribPath(i), {
        radius: (t) => {
          const h = 0.045 + 0.022 * Math.sin(Math.PI * Math.min(1, t * 1.3)) - (floating ? 0.02 * t : 0);
          const w = 0.03 + 0.012 * Math.exp(-((t / 0.08) ** 2));
          return [w, Math.max(0.03, h)];
        },
        segments: 64,
        radial: 12,
      }),
    );
  });
  return merge(list);
}

/** Рёберные хрящи: 1–7 идут к грудине, 8–10 — к хрящу ребра выше и вместе образуют рёберную дугу. */
function cartilagePath(i: number): CatmullRomCurve3 {
  const a = v(RIBS[i].xf, RIB_END_Y[i], RIBS[i].zf);
  const ys = STERNAL_Y[i];
  const b = v(0.13 + (i === 0 ? 0.08 : 0.03), ys, sternumZ(ys) - 0.01);
  const rise = ys - a.y;
  // сначала хрящ продолжает ребро к середине, у нижних рёбер затем круто поднимается к грудине
  const m1 = v(a.x - (a.x - b.x) * 0.45, a.y + rise * (i < 3 ? 0.45 : 0.18), Math.max(a.z, b.z) + 0.02);
  const m2 = v(b.x + (i < 3 ? 0.06 : 0.12), ys - rise * (i < 3 ? 0.05 : 0.22), b.z + 0.015);
  return new CatmullRomCurve3([a, m1, m2, b], false, 'centripetal');
}

function cartilageGeometry(): BufferGeometry {
  const list: BufferGeometry[] = [];
  const flat = (w: number, h: number) => () => [w, h] as [number, number];
  for (let i = 0; i < 7; i++) {
    list.push(sweep(cartilagePath(i), { radius: flat(0.032, 0.05 - i * 0.002), segments: 32, radial: 10 }));
  }
  // хрящи 8–10 вливаются в хрящ ребра выше, образуя рёберную дугу
  for (let i = 7; i < 10; i++) {
    const a = v(RIBS[i].xf, RIB_END_Y[i], RIBS[i].zf);
    const target = cartilagePath(6).getPointAt([0.45, 0.3, 0.17][i - 7]);
    const mid = v((a.x + target.x) / 2 + 0.03, (a.y + target.y) / 2 - 0.05, Math.max(a.z, target.z) + 0.03);
    list.push(sweep(new CatmullRomCurve3([a, mid, target], false, 'centripetal'), { radius: flat(0.028, 0.042), segments: 22, radial: 10 }));
  }
  return merge(list);
}

/* ---------------- Сборка ---------------- */

export interface SkeletonGeometry {
  skull: BufferGeometry;
  mandible: BufferGeometry;
  cervical: BufferGeometry;
  thoracic: BufferGeometry;
  lumbar: BufferGeometry;
  disc: BufferGeometry;
  sacrum: BufferGeometry;
  coccyx: BufferGeometry;
  sternum: BufferGeometry;
  ribs: BufferGeometry;
  cartilage: BufferGeometry;
  clavicle: BufferGeometry;
  scapula: BufferGeometry;
  humerus: BufferGeometry;
  radius: BufferGeometry;
  ulna: BufferGeometry;
  hand: BufferGeometry;
  hipBone: BufferGeometry;
  femur: BufferGeometry;
  patella: BufferGeometry;
  tibia: BufferGeometry;
  fibula: BufferGeometry;
  foot: BufferGeometry;
}

const cache = new Map<number, SkeletonGeometry>();

/** Строит все кости один раз за сессию; повторное открытие раздела берёт готовые буферы. detail > 1 — грубее сетка (главная страница). */
export function skeletonGeometry(detail = 1): SkeletonGeometry {
  const hit = cache.get(detail);
  if (hit) return hit;
  const K = detail;
  const O = SKULL_ORIGIN;
  const disc = new SphereGeometry(1, 18, 8);
  disc.deleteAttribute('uv');
  disc.scale(1, 0.32, 0.78);
  const built: SkeletonGeometry = {
    skull: meshSdf(skullField(), { min: off(O, [-0.82, -0.9, -1.16]), max: off(O, [0.82, 1.18, 1.0]), cell: 0.02 * K, ao: 0.05 }),
    mandible: meshSdf(mandibleField(), { min: off(O, [-0.62, -1.22, -0.36]), max: off(O, [0.62, -0.2, 0.92]), cell: 0.018 * K, ao: 0.03 }),
    cervical: meshSdf(cervicalField(), { min: [-0.32, -0.14, -0.52], max: [0.32, 0.14, 0.16], cell: 0.016 * K, ao: 0.018 }),
    thoracic: meshSdf(thoracicField(), { min: [-0.34, -0.36, -0.64], max: [0.34, 0.18, 0.2], cell: 0.018 * K, ao: 0.02 }),
    lumbar: meshSdf(lumbarField(), { min: [-0.46, -0.2, -0.68], max: [0.46, 0.22, 0.25], cell: 0.02 * K, ao: 0.022 }),
    disc,
    sacrum: meshSdf(sacrumField(), { min: [-0.64, 8.85, -1.04], max: [0.64, 9.9, -0.24], cell: 0.02 * K, ao: 0.03 }),
    coccyx: meshSdf(coccyxField(), { min: [-0.14, 8.56, -1.0], max: [0.14, 9.0, -0.72], cell: 0.012 * K, ao: 0.015 }),
    sternum: meshSdf(sternumField(), { min: [-0.32, 12.3, 0.78], max: [0.32, 14.34, 1.35], cell: 0.018 * K, ao: 0.02 }),
    ribs: ribsGeometry(),
    cartilage: cartilageGeometry(),
    clavicle: clavicleGeometry(),
    scapula: meshSdf(scapulaField(), { min: [0.6, 12.42, -1.12], max: [1.9, 14.56, 0.04], cell: 0.022 * K, ao: 0.03 }),
    humerus: meshSdf(humerusField(), { min: [1.38, 10.72, -0.58], max: [2.2, 14.3, 0.04], cell: 0.022 * K, ao: 0.025 }),
    radius: meshSdf(radiusField(), { min: [1.84, 8.3, -0.4], max: [2.3, 10.92, 0.0], cell: 0.018 * K, ao: 0.02 }),
    ulna: meshSdf(ulnaField(), { min: [1.56, 8.32, -0.56], max: [2.0, 11.14, -0.12], cell: 0.018 * K, ao: 0.02 }),
    hand: handGeometry(),
    hipBone: meshSdf(hipBoneField(), { min: [-0.05, 8.26, -0.7], max: [1.6, 10.56, 0.66], cell: 0.021 * K, ao: 0.04 }),
    femur: meshSdf(femurField(), { min: [0.18, 4.68, -0.4], max: [1.54, 9.42, 0.34], cell: 0.026 * K, ao: 0.03 }),
    patella: meshSdf(patellaField(), { min: [0.34, 4.74, 0.16], max: [0.82, 5.3, 0.44], cell: 0.014 * K, ao: 0.02 }),
    tibia: meshSdf(tibiaField(), { min: [0.16, 0.52, -0.34], max: [0.99, 4.76, 0.3], cell: 0.024 * K, ao: 0.03 }),
    fibula: meshSdf(fibulaField(), { min: [0.68, 0.5, -0.27], max: [1.0, 4.5, 0.0], cell: 0.016 * K, ao: 0.02 }),
    foot: footGeometry(),
  };
  cache.set(detail, built);
  return built;
}

