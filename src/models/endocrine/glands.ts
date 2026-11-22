import type { BufferGeometry } from 'three';
import { capsule, smooth, smoothSubtract, sphere, type Sdf, type V3 } from '../skeleton/sdf';
import { E, Er, mirrored, textured, wobble } from '../body/sdfx';
import { flipX } from '../body/geo';
import { cerebellumField, cerebrumField, heartField } from '../body/thorax';
import type { GeometrySet } from '../body/transfer';
import { blobGeo, ellipGeo, safeMerge, sampleAlong, sdfMesh, seeded, tint, tube, wave } from './geoHelpers';
import type { MatKey } from './materials';

/*
  Генератор 3D-геометрии эндокринной системы тела (в дециметрах, совместим с body/skin.ts).
  Для многоматериальных частей ключ кодируется как `<partId>::<matKey>` для передачи через
  Worker без копирования буферов (encodeSet/decodeSet).
*/

function key(part: string, mat: MatKey): string {
  return `${part}::${mat}`;
}

function organicTint(
  g: BufferGeometry,
  fn: (x: number, y: number, z: number) => [number, number, number],
): BufferGeometry {
  return tint(g, (x, y, z) => fn(x, y, z));
}

function chainSdf(pts: V3[], radii: number[], k = 0.04): Sdf {
  const segs: Sdf[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    segs.push(capsule(pts[i], pts[i + 1], radii[i], radii[i + 1]));
  }
  return smooth(k, ...segs);
}

/* ---------------- 1. Центр управления в мозге ---------------- */

function buildHypothalamus(): BufferGeometry {
  // чуть увеличен относительно масштаба всего тела, чтобы чётко читался в общем виде
  const body = smooth(
    0.045,
    // основная воронка гипоталамуса (стенки третьего желудочка)
    E([0, 16.26, 0.02], [0.15, 0.10, 0.14], 0.15),
    // серый бугор и срединное возвышение книзу к воронке
    E([0, 16.17, 0.05], [0.09, 0.06, 0.09], 0.12),
    // парные сосцевидные тела сзади
    mirrored(E([0.055, 16.19, -0.09], [0.042, 0.038, 0.042], 0.1)),
  );
  const g = sdfMesh(wobble(body, 14, 0.006, 0.12), [-0.22, 16.06, -0.18], [0.22, 16.40, 0.22], 0.012, 0.016);
  return organicTint(g, (_x, y, z) => {
    const k = 0.90 + 0.10 * wave(y * 16 + z * 12, 6, 3);
    return [k, k * 0.94, k * 0.96];
  });
}

function buildPituitaryStalk(): BufferGeometry {
  const stalk = tube(
    [
      [0, 16.17, 0.05],
      [0, 16.09, 0.075],
      [0, 16.00, 0.10],
    ],
    (t) => 0.034 - 0.010 * t,
    { radial: 12, segments: 18 },
  );
  return organicTint(stalk, () => [0.98, 0.95, 0.93]);
}

function buildAdenohypophysis(): BufferGeometry {
  // передняя доля (аденогипофиз): бобовидная, крупнее задней, охватывает переднюю сторону воронки
  const f = smooth(
    0.03,
    E([0, 15.96, 0.155], [0.105, 0.078, 0.068], 0.12),
    mirrored(E([0.055, 15.96, 0.14], [0.062, 0.070, 0.058], 0.1)),
    // туберальная часть — воротничок на передней стороне ножки
    capsule([0, 16.01, 0.12], [0, 16.10, 0.095], 0.026, 0.018),
  );
  // выемка сзади для прилегания нейрогипофиза
  const carved = smoothSubtract(0.02, f, E([0, 15.96, 0.04], [0.068, 0.065, 0.055], 0.1));
  const g = sdfMesh(textured(carved, 28, 0.003, 0.1), [-0.17, 15.84, 0.04], [0.17, 16.14, 0.26], 0.010, 0.014);
  return organicTint(g, (x, y) => {
    const k = 0.90 + 0.10 * wave(x * 20 + y * 14, 8, 3);
    return [k, k * 0.92, k * 0.90];
  });
}

function buildNeurohypophysis(): BufferGeometry {
  // задняя доля (нейрогипофиз): округлая, тесно прилегает позади передней доли
  const f = smooth(
    0.02,
    E([0, 15.96, 0.055], [0.068, 0.066, 0.054], 0.1),
    capsule([0, 16.00, 0.065], [0, 16.09, 0.072], 0.024, 0.018),
  );
  const g = sdfMesh(wobble(f, 22, 0.003, 0.08), [-0.11, 15.86, -0.04], [0.11, 16.12, 0.14], 0.010, 0.012);
  return organicTint(g, () => [0.97, 0.95, 0.92]);
}

function buildPinealGland(): BufferGeometry {
  // шишковидная железа (эпифиз): характерная форма маленькой сосновой шишки на поводке
  const cone = smooth(
    0.025,
    Er([0, 16.30, -0.35], [0.062, 0.056, 0.092], [0.22, 0, 0], 0.12),
    E([0, 16.29, -0.41], [0.040, 0.036, 0.048], 0.1),
    // поводок (habenula) вперёд к крыше третьего желудочка
    capsule([0, 16.31, -0.28], [0, 16.30, -0.17], 0.026, 0.020),
  );
  // чешуйчатый рельеф шишки
  const scaly: Sdf = (x, y, z) => {
    const d = cone(x, y, z);
    if (d > 0.05 || d < -0.06) return d;
    return d - 0.004 * Math.sin(z * 110 + x * 70) * Math.cos(y * 110 - x * 60);
  };
  const g = sdfMesh(scaly, [-0.11, 16.20, -0.50], [0.11, 16.40, -0.12], 0.009, 0.012);
  return organicTint(g, (_x, y, z) => {
    const k = 0.88 + 0.12 * wave(z * 32 + y * 24, 6, 4);
    return [k, k * 0.90, k];
  });
}

/* ---------------- 2. Железы шеи: щитовидная и 4 паращитовидные ---------------- */

function tracheaCavity(): Sdf {
  // цилиндр трахеи для вырезания вогнутой задней поверхности долей щитовидной железы
  return capsule([0, 15.05, 0.15], [0, 14.15, 0.08], 0.112, 0.110);
}

function buildThyroidLobes(): { gland: BufferGeometry; vessels: BufferGeometry } {
  const lobe = (s: 1 | -1): Sdf =>
    smooth(
      0.06,
      // основная грушевидная доля (сужается к верхнему полюсу, полнее внизу)
      Er([0.205 * s, 14.56, 0.20], [0.105, 0.255, 0.115], [0.06, -0.24 * s, -0.15 * s], 0.18),
      // заострённый верхний полюс
      Er([0.195 * s, 14.82, 0.18], [0.062, 0.115, 0.072], [0.12, -0.18 * s, 0.10 * s], 0.15),
      // округлый нижний полюс, охватывающий трахею
      E([0.19 * s, 14.38, 0.21], [0.095, 0.092, 0.098], 0.15),
    );
  let lobes = smooth(0.02, lobe(1), lobe(-1));
  lobes = smoothSubtract(0.035, lobes, tracheaCavity());
  // отделяем центральный перешеек, чтобы перешеек выбирался и подсвечивался отдельно
  const isthmusCut = E([0, 14.62, 0.30], [0.095, 0.095, 0.085], 0.12);
  lobes = smoothSubtract(0.015, lobes, isthmusCut);
  const relief = textured(wobble(lobes, 12, 0.005, 0.12), 28, 0.005, 0.10);
  const gland = sdfMesh(relief, [-0.38, 14.22, 0.04], [0.38, 15.00, 0.40], 0.012, 0.018);
  organicTint(gland, (x, y, z) => {
    const k = 0.88 + 0.12 * wave(x * 16 + y * 14 + z * 12, 8, 4);
    return [k, k * 0.90, k * 0.88];
  });

  // тонкие ветви верхней и нижней щитовидных артерий на поверхности долей
  const vList: BufferGeometry[] = [];
  for (const s of [1, -1] as const) {
    vList.push(
      tube(
        [
          [0.36 * s, 15.12, 0.12],
          [0.24 * s, 14.92, 0.21],
          [0.22 * s, 14.72, 0.30],
          [0.14 * s, 14.66, 0.32],
        ],
        (t) => 0.014 * (1 - 0.35 * t),
        { radial: 7, segments: 24 },
      ),
      tube(
        [
          [0.42 * s, 14.28, 0.06],
          [0.28 * s, 14.34, 0.14],
          [0.22 * s, 14.44, 0.26],
        ],
        (t) => 0.012 * (1 - 0.3 * t),
        { radial: 6, segments: 20 },
      ),
    );
  }
  return { gland, vessels: safeMerge(vList) };
}

function buildThyroidIsthmus(): BufferGeometry {
  // перешеек на уровне 2–4-го колец трахеи + небольшая пирамидальная доля слева от средней линии
  let f = smooth(
    0.035,
    Er([0, 14.61, 0.285], [0.135, 0.078, 0.048], [0.04, 0, 0], 0.14),
    // пирамидальная доля (lobus pyramidalis), встречающаяся примерно у половины людей
    capsule([0.045, 14.66, 0.295], [0.065, 14.88, 0.285], 0.026, 0.013),
  );
  f = smoothSubtract(0.025, f, tracheaCavity());
  const g = sdfMesh(textured(f, 30, 0.004, 0.08), [-0.20, 14.46, 0.16], [0.20, 14.96, 0.38], 0.010, 0.014);
  return organicTint(g, (x, y) => {
    const k = 0.90 + 0.10 * wave(x * 18 + y * 15, 7, 3);
    return [k, k * 0.92, k * 0.90];
  });
}

function buildParathyroids(): BufferGeometry {
  // 4 чечевицеобразные железы на ЗАДНЕЙ поверхности долей щитовидной железы (2 верхние, 2 нижние)
  const spots: { pos: V3; rot: V3; r: V3 }[] = [
    { pos: [0.195, 14.74, 0.082], rot: [0.12, -0.35, 0.1], r: [0.036, 0.046, 0.026] },
    { pos: [-0.195, 14.73, 0.082], rot: [0.12, 0.35, -0.1], r: [0.036, 0.046, 0.026] },
    { pos: [0.205, 14.43, 0.095], rot: [-0.10, -0.30, -0.1], r: [0.038, 0.048, 0.028] },
    { pos: [-0.205, 14.44, 0.095], rot: [-0.10, 0.30, 0.1], r: [0.038, 0.048, 0.028] },
  ];
  const parts: BufferGeometry[] = spots.map((s) => ellipGeo(s.pos, s.r, s.rot, 18, 12));
  // тонкий задний анастомоз между верхней и нижней паращитовидными железами
  for (const s of [1, -1] as const) {
    parts.push(
      tube(
        [
          [0.20 * s, 14.72, 0.072],
          [0.21 * s, 14.58, 0.075],
          [0.205 * s, 14.45, 0.086],
        ],
        0.007,
        { radial: 6, segments: 12 },
      ),
    );
  }
  return safeMerge(parts);
}

/* ---------------- 3. Тимус (вилочковая железа) ---------------- */

function buildThymus(): BufferGeometry {
  // двудольный, асимметричный дольчатый орган в переднем верхнем средостении (позади грудины)
  const leftLobe = smooth(
    0.055,
    Er([0.145, 13.56, 0.50], [0.155, 0.295, 0.105], [-0.12, -0.16, 0.14], 0.2),
    // верхний шейный рог тимуса
    capsule([0.12, 13.78, 0.44], [0.09, 14.08, 0.36], 0.075, 0.036),
    E([0.19, 13.34, 0.54], [0.135, 0.14, 0.095], 0.16),
  );
  const rightLobe = smooth(
    0.055,
    Er([-0.135, 13.60, 0.51], [0.145, 0.285, 0.102], [-0.12, 0.16, -0.12], 0.2),
    capsule([-0.11, 13.80, 0.44], [-0.085, 14.06, 0.36], 0.072, 0.034),
    E([-0.16, 13.36, 0.54], [0.125, 0.135, 0.092], 0.16),
  );
  // срединная перемычка соединительной ткани между долями (оставляем выраженную борозду)
  const bridge = E([0, 13.64, 0.49], [0.11, 0.15, 0.068], 0.14);
  const combined = smooth(0.035, leftLobe, rightLobe, bridge);
  // дольчатый рельеф тимуса
  const lobulated = textured(wobble(combined, 9, 0.012, 0.15), 22, 0.014, 0.14);
  const g = sdfMesh(lobulated, [-0.42, 13.08, 0.26], [0.44, 14.20, 0.72], 0.016, 0.022);
  return organicTint(g, (x, y, z) => {
    const k = 0.88 + 0.12 * wave(x * 14 + y * 16 + z * 12, 9, 4);
    return [k, k * 0.94, k * 0.92];
  });
}

/* ---------------- 4. Поджелудочная железа и островки Лангерганса ---------------- */

const PANCREAS_AXIS: V3[] = [
  [-0.28, 10.55, 0.16],
  [-0.02, 10.74, 0.22],
  [0.36, 10.90, 0.12],
  [0.76, 11.06, -0.10],
  [1.08, 11.30, -0.36],
];

function buildPancreasAndIslets(): { parenchyma: BufferGeometry; islets: BufferGeometry } {
  const f = smooth(
    0.08,
    // головка в подкове ДПК
    E([-0.30, 10.56, 0.15], [0.27, 0.31, 0.19], 0.25),
    // крючковидный отросток
    capsule([-0.26, 10.36, 0.10], [-0.04, 10.28, 0.10], 0.115, 0.085),
    // шейка, тело и хвост к воротам селезёнки
    chainSdf(PANCREAS_AXIS, [0.20, 0.165, 0.155, 0.135, 0.090], 0.06),
  );
  // выраженная бугристая дольчатость железы
  const lobular = textured(wobble(f, 8, 0.012, 0.18), 20, 0.018, 0.16);
  const parenchyma = sdfMesh(lobular, [-0.66, 10.08, -0.56], [1.28, 11.54, 0.50], 0.018, 0.025);
  organicTint(parenchyma, (x, y, z) => {
    const k = 0.88 + 0.12 * wave(x * 15 + y * 15 + z * 15, 8, 4);
    return [k, k * 0.95, k * 0.86];
  });

  // 110 островков Лангерганса: в теле и особенно в хвосте их в 2–3 раза больше, чем в головке
  const rnd = seeded(2026);
  const isletList: BufferGeometry[] = [];
  for (let i = 0; i < 110; i++) {
    // смещённое распределение к телу и хвосту (t = 0 — головка, t = 1 — хвост)
    const u = Math.pow(rnd(), 0.62);
    const base = sampleAlong(PANCREAS_AXIS, u);
    const maxR = u < 0.2 ? 0.18 : 0.13 - 0.05 * u;
    const ang = rnd() * Math.PI * 2;
    const elev = (rnd() - 0.5) * Math.PI;
    // часть островков чуть ближе к поверхности, чтобы мерцали сквозь дольки и отлично читались на срезе
    const radialFrac = 0.25 + 0.72 * rnd();
    const ox = Math.cos(ang) * Math.cos(elev) * maxR * radialFrac;
    const oy = Math.sin(elev) * maxR * radialFrac * 0.92;
    const oz = Math.sin(ang) * Math.cos(elev) * maxR * radialFrac * 0.85;
    const r = 0.018 + rnd() * 0.014;
    isletList.push(blobGeo([base[0] + ox, base[1] + oy, base[2] + oz], [r, r * 0.92, r * 0.95], 0));
  }
  return { parenchyma, islets: safeMerge(isletList) };
}

/* ---------------- 5. Надпочечники: кора (асимметричная!) и мозговое вещество ---------------- */

function kidneyField(s: 1 | -1): Sdf {
  const y = s === 1 ? 10.78 : 10.60;
  let f = smooth(
    0.1,
    Er([0.84 * s, y, -0.52], [0.30, 0.58, 0.25], [0, 0, 0.12 * s], 0.25),
    E([0.84 * s, y + 0.05, -0.52], [0.25, 0.48, 0.25], 0.25),
  );
  f = smoothSubtract(0.07, f, E([0.55 * s, y, -0.50], [0.15, 0.20, 0.20], 0.2));
  return wobble(f, 3.5, 0.010, 0.15);
}

function rightAdrenalOuter(): Sdf {
  // правый надпочечник — ПИРАМИДАЛЬНЫЙ (треугольная «треуголка») над правой почкой
  const base = smooth(
    0.045,
    Er([-0.68, 11.20, -0.49], [0.18, 0.09, 0.12], [0, 0, -0.22], 0.16),
    Er([-0.64, 11.33, -0.49], [0.11, 0.14, 0.09], [0, 0, -0.10], 0.15),
    E([-0.62, 11.42, -0.49], [0.055, 0.075, 0.055], 0.12),
  );
  // вогнутое основание ложится точно на верхний полюс правой почки
  return smoothSubtract(0.03, base, E([-0.82, 10.78, -0.52], [0.30, 0.42, 0.28], 0.2));
}

function leftAdrenalOuter(): Sdf {
  // левый надпочечник — ПОЛУЛУННЫЙ (серповидный), выше правого и охватывает верхнемедиальный край левой почки
  const base = smooth(
    0.045,
    Er([0.66, 11.42, -0.49], [0.185, 0.095, 0.115], [0, 0, 0.36], 0.16),
    Er([0.52, 11.31, -0.48], [0.11, 0.135, 0.095], [0, 0, 0.55], 0.15),
    Er([0.82, 11.44, -0.50], [0.105, 0.085, 0.095], [0, 0, -0.20], 0.14),
  );
  return smoothSubtract(0.03, base, E([0.84, 10.94, -0.52], [0.31, 0.44, 0.28], 0.2));
}

function rightAdrenalMedullaField(): Sdf {
  return smooth(
    0.025,
    Er([-0.66, 11.26, -0.49], [0.095, 0.068, 0.058], [0, 0, -0.18], 0.12),
    E([-0.64, 11.33, -0.49], [0.052, 0.058, 0.042], 0.1),
  );
}

function leftAdrenalMedullaField(): Sdf {
  return smooth(
    0.025,
    Er([0.65, 11.40, -0.49], [0.10, 0.056, 0.055], [0, 0, 0.38], 0.12),
    Er([0.55, 11.33, -0.49], [0.062, 0.062, 0.048], [0, 0, 0.50], 0.1),
  );
}

function buildAdrenals(): { cortex: BufferGeometry; medulla: BufferGeometry; veins: BufferGeometry } {
  // вырезаем внутри коры полость под мозговое вещество, чтобы при разрезе слои не мерцали (без z-fighting)
  const rCortexF = smoothSubtract(0.01, textured(rightAdrenalOuter(), 34, 0.006, 0.1), rightAdrenalMedullaField());
  const lCortexF = smoothSubtract(0.01, textured(leftAdrenalOuter(), 34, 0.006, 0.1), leftAdrenalMedullaField());
  const rCortex = sdfMesh(rCortexF, [-0.96, 11.02, -0.72], [-0.38, 11.58, -0.26], 0.013, 0.016);
  const lCortex = sdfMesh(lCortexF, [0.34, 11.12, -0.72], [1.02, 11.64, -0.26], 0.013, 0.016);
  const cortex = organicTint(safeMerge([rCortex, lCortex]), (x, y) => {
    const k = 0.89 + 0.11 * wave(x * 18 + y * 22, 7, 3);
    return [k, k * 0.94, k * 0.82];
  });

  const rMed = sdfMesh(rightAdrenalMedullaField(), [-0.82, 11.14, -0.62], [-0.50, 11.45, -0.36], 0.011, 0.012);
  const lMed = sdfMesh(leftAdrenalMedullaField(), [0.44, 11.22, -0.62], [0.82, 11.54, -0.36], 0.011, 0.012);
  const medulla = organicTint(safeMerge([rMed, lMed]), () => [0.95, 0.86, 0.86]);

  // центральные надпочечниковые вены: правая впадает прямо в НПВ, левая — в левую почечную вену
  const veins = safeMerge([
    tube(
      [
        [-0.63, 11.27, -0.48],
        [-0.48, 11.30, -0.40],
        [-0.35, 11.34, -0.30],
      ],
      0.016,
      { radial: 7, segments: 14 },
    ),
    tube(
      [
        [0.60, 11.36, -0.48],
        [0.44, 11.12, -0.44],
        [0.36, 10.74, -0.38],
      ],
      0.016,
      { radial: 7, segments: 18 },
    ),
  ]);

  return { cortex, medulla, veins };
}

/* ---------------- 6. Половые железы (гонады): яичники и яички ---------------- */

function buildOvaries(): { ovaries: BufferGeometry; follicles: BufferGeometry } {
  // миндалевидные парные железы в малом тазу с фолликулярным рельефом
  const one = (s: 1 | -1): Sdf => {
    const body = Er([0.50 * s, 9.15, 0.08], [0.115, 0.165, 0.095], [0.18, 0.25 * s, -0.32 * s], 0.16);
    // поверхностные созревающие фолликулы
    const f1 = sphere([0.54 * s, 9.22, 0.14], 0.036);
    const f2 = sphere([0.46 * s, 9.06, 0.13], 0.032);
    const f3 = sphere([0.56 * s, 9.12, 0.04], 0.030);
    return smooth(0.025, body, f1, f2, f3);
  };
  const leftG = sdfMesh(one(1), [0.30, 8.90, -0.10], [0.70, 9.42, 0.28], 0.012, 0.014);
  const rightG = sdfMesh(one(-1), [-0.70, 8.90, -0.10], [-0.30, 9.42, 0.28], 0.012, 0.014);
  const ovaries = organicTint(safeMerge([leftG, rightG]), (x, y) => {
    const k = 0.90 + 0.10 * wave(x * 20 + y * 18, 8, 3);
    return [k, k * 0.94, k * 0.96];
  });

  // жёлтое тело и крупные антральные фолликулы (золотисто-тёплые акценты)
  const follicles = safeMerge([
    ellipGeo([0.54, 9.22, 0.155], [0.030, 0.030, 0.024], [0, 0, 0], 12, 10),
    ellipGeo([-0.52, 9.20, 0.152], [0.028, 0.028, 0.022], [0, 0, 0], 12, 10),
    // тонкая собственная связка к центру таза
    tube(
      [
        [0.42, 9.13, 0.08],
        [0.24, 9.08, 0.08],
      ],
      0.012,
      { radial: 6, segments: 10 },
    ),
    tube(
      [
        [-0.42, 9.13, 0.08],
        [-0.24, 9.08, 0.08],
      ],
      0.012,
      { radial: 6, segments: 10 },
    ),
  ]);
  return { ovaries, follicles };
}

function buildTestes(): BufferGeometry {
  // парные овальные семенники (левый чуть ниже правого — анатомическая норма!) + придаток сзади-сверху
  const one = (s: 1 | -1): Sdf => {
    const y = s === 1 ? 8.34 : 8.40;
    const body = Er([0.155 * s, y, 0.34], [0.105, 0.155, 0.115], [0.16, 0.08 * s, 0.08 * s], 0.16);
    // придаток яичка (epididymis): головка сверху и тело вдоль задненаружного края
    const epi = chainSdf(
      [
        [0.175 * s, y + 0.14, 0.31],
        [0.215 * s, y + 0.06, 0.24],
        [0.205 * s, y - 0.06, 0.24],
        [0.175 * s, y - 0.13, 0.29],
      ],
      [0.044, 0.032, 0.026, 0.024],
      0.025,
    );
    return smooth(0.022, body, epi);
  };
  const leftG = sdfMesh(one(1), [0.00, 8.08, 0.14], [0.34, 8.62, 0.54], 0.012, 0.014);
  const rightG = sdfMesh(one(-1), [-0.34, 8.14, 0.14], [0.00, 8.68, 0.54], 0.012, 0.014);
  return organicTint(safeMerge([leftG, rightG]), (x, y) => {
    const k = 0.91 + 0.09 * wave(x * 16 + y * 16, 6, 3);
    return [k, k * 0.95, k * 0.93];
  });
}

/* ---------------- 7. Вторичные эндокринные органы, сосуды и ориентиры ---------------- */

function buildHeartContext(): BufferGeometry {
  return sdfMesh(heartField(), [-0.9, 11.8, -0.6], [1.3, 13.9, 1.0], 0.036, 0.04);
}

function buildKidneysContext(): BufferGeometry {
  const kL = sdfMesh(kidneyField(1), [0.42, 10.05, -0.90], [1.28, 11.48, -0.18], 0.028, 0.03);
  const kR = sdfMesh(kidneyField(-1), [-1.28, 9.88, -0.90], [-0.42, 11.30, -0.18], 0.028, 0.03);
  return safeMerge([kL, kR]);
}

function buildEndocrineVessels(): { arteries: BufferGeometry; veins: BufferGeometry } {
  const art: BufferGeometry[] = [];
  const ven: BufferGeometry[] = [];
  const T = (pts: V3[], r0: number, r1 = r0, rad = 9) =>
    tube(pts, (t) => r0 + (r1 - r0) * t, { radial: rad, segments: Math.max(12, Math.round(pts.length * 10)) });

  // Дуга аорты, грудная и брюшная аорта
  art.push(
    T(
      [
        [0.20, 12.98, 0.24],
        [0.14, 13.45, 0.26],
        [0.18, 13.92, 0.16],
        [0.36, 14.10, -0.04],
        [0.52, 14.04, -0.24],
        [0.62, 13.55, -0.48],
        [0.54, 12.70, -0.48],
        [0.42, 11.75, -0.34],
        [0.32, 11.28, -0.26],
        [0.27, 10.65, -0.22],
        [0.22, 10.02, -0.16],
      ],
      0.115,
      0.072,
      12,
    ),
  );

  // Плечеголовной ствол
  art.push(T([[0.18, 13.92, 0.16], [-0.08, 14.28, 0.12], [-0.32, 14.48, 0.10]], 0.064, 0.054));

  // Сонные артерии к щитовидной железе и гипофизу
  for (const s of [1, -1] as const) {
    const start: V3 = s === 1 ? [0.34, 14.08, -0.02] : [-0.32, 14.48, 0.10];
    art.push(
      T(
        [
          start,
          [0.36 * s, 14.88, 0.08],
          [0.38 * s, 15.54, 0.06],
          [0.30 * s, 15.96, -0.06],
          [0.16 * s, 16.08, 0.04],
        ],
        0.044,
        0.022,
      ),
    );
    // почечные и надпочечниковые артерии
    const yK = s === 1 ? 10.76 : 10.60;
    art.push(
      T(
        [
          [0.27, yK, -0.22],
          [0.48 * s, yK + 0.04, -0.38],
          [0.72 * s, yK, -0.50],
        ],
        0.030,
        0.020,
      ),
      // средняя надпочечниковая артерия прямо от аорты к надпочечнику
      T(
        [
          [0.30, 11.26, -0.26],
          [0.46 * s, 11.30, -0.38],
          [0.64 * s, s === 1 ? 11.38 : 11.24, -0.48],
        ],
        0.015,
        0.010,
        7,
      ),
    );
    // общие подвздошные и гонадные (яичниковые / яичковые) артерии
    art.push(
      T(
        [
          [0.22, 10.02, -0.16],
          [0.48 * s, 9.64, 0.02],
          [0.68 * s, 9.18, 0.18],
        ],
        0.056,
        0.040,
      ),
      T(
        [
          [0.24, 10.48, -0.20],
          [0.36 * s, 9.85, -0.06],
          [0.48 * s, 9.22, 0.08],
        ],
        0.014,
        0.011,
        7,
      ),
      T(
        [
          [0.48 * s, 9.22, 0.08],
          [0.38 * s, 8.76, 0.24],
          [0.17 * s, 8.42, 0.32],
        ],
        0.011,
        0.009,
        6,
      ),
    );
  }

  // Чревный ствол и селезёночная артерия вдоль верхнего края поджелудочной
  art.push(
    T(
      [
        [0.32, 11.28, -0.26],
        [0.24, 11.24, 0.06],
        [0.58, 11.16, -0.02],
        [0.98, 11.34, -0.32],
      ],
      0.036,
      0.020,
    ),
  );

  // Венозная магистраль: верхняя и нижняя полые вены, ярёмные и почечные вены
  ven.push(
    // нижняя полая вена (НПВ)
    T(
      [
        [-0.24, 9.98, -0.24],
        [-0.28, 10.65, -0.26],
        [-0.36, 11.40, -0.26],
        [-0.38, 12.18, -0.18],
        [-0.32, 12.78, 0.04],
      ],
      0.095,
      0.105,
      12,
    ),
    // верхняя полая вена (ВПВ)
    T(
      [
        [-0.34, 13.06, 0.14],
        [-0.44, 13.68, 0.14],
        [-0.46, 14.18, 0.08],
      ],
      0.088,
      0.072,
      11,
    ),
    // левая плечеголовная вена (идёт позади тимуса!)
    T(
      [
        [-0.46, 14.18, 0.08],
        [-0.08, 14.22, 0.14],
        [0.42, 14.34, 0.06],
      ],
      0.062,
      0.056,
    ),
  );
  // внутренние ярёмные и подвздошные вены
  for (const s of [1, -1] as const) {
    const pts: V3[] = [
      [0.44 * s, 14.32, 0.06],
      [0.45 * s, 15.02, 0.04],
      [0.42 * s, 15.72, -0.04],
      [0.24 * s, 16.02, -0.04],
    ];
    ven.push(T(s === 1 ? pts : flipX(pts), 0.048, 0.024));
    // почечные вены
    const yK = s === 1 ? 10.74 : 10.58;
    ven.push(
      T(
        [
          [-0.28, yK, -0.26],
          [0.32 * s, yK, -0.36],
          [0.68 * s, yK, -0.50],
        ],
        0.032,
        0.024,
      ),
    );
    // подвздошные вены
    ven.push(
      T(
        [
          [-0.24, 9.98, -0.24],
          [0.42 * s, 9.56, -0.04],
          [0.62 * s, 9.10, 0.12],
        ],
        0.058,
        0.042,
      ),
    );
  }

  return { arteries: safeMerge(art), veins: safeMerge(ven) };
}

function buildBodyLandmarks(): { brain: BufferGeometry; cartilage: BufferGeometry } {
  // полупрозрачный мозг для пространственной привязки гипоталамуса, гипофиза и эпифиза
  const brain = safeMerge([
    sdfMesh(cerebrumField(), [-0.78, 15.9, -1.05], [0.78, 17.45, 0.9], 0.032),
    sdfMesh(cerebellumField(), [-0.7, 15.4, -1.2], [0.7, 16.5, -0.1], 0.032),
  ]);

  // гортань (щитовидный и перстневидный хрящи) + трахея с полукольцами для привязки щитовидной железы
  const rings = 16;
  const trachea = tube(
    [
      [0, 14.95, 0.16],
      [0, 14.42, 0.11],
      [0, 13.80, 0.02],
      [0, 13.22, -0.08],
    ],
    (t) => {
      const ring = Math.pow(Math.max(0, Math.sin(t * rings * Math.PI)), 0.5);
      const r = 0.098 + 0.010 * ring;
      return [r * 1.04, r * 0.92];
    },
    { segments: 120, radial: 14 },
  );
  // щитовидный хрящ (адамово яблоко) прямо над щитовидной железой
  const plate = (s: 1 | -1): Sdf => Er([0.095 * s, 15.04, 0.34], [0.024, 0.14, 0.11], [0, 0.55 * s, 0], 0.1);
  const shield = smooth(
    0.025,
    plate(1),
    plate(-1),
    E([0, 15.04, 0.42], [0.028, 0.12, 0.028], 0.08),
    smoothSubtract(
      0.015,
      E([0, 14.84, 0.28], [0.12, 0.055, 0.11], 0.08),
      E([0, 14.84, 0.28], [0.082, 0.09, 0.072], 0.08),
    ),
  );
  const larynxGeo = sdfMesh(shield, [-0.26, 14.74, 0.12], [0.26, 15.24, 0.52], 0.018);
  return { brain, cartilage: safeMerge([trachea, larynxGeo]) };
}

/* ---------------- Главная сборка для фонового потока ---------------- */

export function buildEndocrineBodySet(): GeometrySet {
  const out: GeometrySet = {};

  out[key('hypothalamus', 'hypothalamus')] = buildHypothalamus();
  out[key('pituitary-stalk', 'pituitaryStalk')] = buildPituitaryStalk();
  out[key('adenohypophysis', 'adenohypophysis')] = buildAdenohypophysis();
  out[key('neurohypophysis', 'neurohypophysis')] = buildNeurohypophysis();
  out[key('pineal-gland', 'pineal')] = buildPinealGland();

  const thyroid = buildThyroidLobes();
  out[key('thyroid-lobes', 'thyroid')] = thyroid.gland;
  out[key('thyroid-lobes', 'artery')] = thyroid.vessels;
  out[key('thyroid-isthmus', 'thyroidIsthmus')] = buildThyroidIsthmus();
  out[key('parathyroid-glands', 'parathyroid')] = buildParathyroids();

  out[key('thymus', 'thymus')] = buildThymus();

  const panc = buildPancreasAndIslets();
  out[key('pancreas-parenchyma', 'pancreas')] = panc.parenchyma;
  out[key('islets-of-langerhans', 'islets')] = panc.islets;

  const adr = buildAdrenals();
  out[key('adrenal-cortex', 'adrenalCortex')] = adr.cortex;
  out[key('adrenal-medulla', 'adrenalMedulla')] = adr.medulla;
  out[key('adrenal-medulla', 'vein')] = adr.veins;

  const ov = buildOvaries();
  out[key('ovaries', 'ovary')] = ov.ovaries;
  out[key('ovaries', 'islets')] = ov.follicles;
  out[key('testes', 'testis')] = buildTestes();

  out[key('heart-endocrine', 'heartGhost')] = buildHeartContext();
  out[key('kidneys-endocrine', 'kidneyGhost')] = buildKidneysContext();

  const ves = buildEndocrineVessels();
  out[key('endocrine-vessels', 'artery')] = ves.arteries;
  out[key('endocrine-vessels', 'vein')] = ves.veins;

  const lm = buildBodyLandmarks();
  out[key('body-landmarks', 'brainGhost')] = lm.brain;
  out[key('body-landmarks', 'cartilageGhost')] = lm.cartilage;

  return out;
}
