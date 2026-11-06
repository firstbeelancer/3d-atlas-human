import { SphereGeometry, TorusGeometry, type BufferGeometry } from 'three';
import {
  WALL_OFF,
  Y_BOTTOM,
  Y_TOP,
  ureterEntryPoint,
  wallPoint,
  type V3,
} from './anatomy';
import {
  frontalCapGeometry,
  loopGeometry,
  pelvicFloorGeometry,
  shellGeometry,
  transverseCapGeometry,
  trigoneGeometry,
  tubeGeometry,
} from './geometry';
import { BLADDER_PART_IDS } from './parts';

export type MatKey =
  | 'surface' | 'surfaceBack' | 'serosa' | 'adventitia' | 'detrusor' | 'submucosa' | 'mucosa'
  | 'mucosaDark' | 'trigone' | 'ridge' | 'urine' | 'artery' | 'vein' | 'nerve' | 'lymph' | 'lymphDuct'
  | 'bone' | 'cartilage' | 'striated' | 'sphincterIn' | 'fibrous' | 'lumenDark' | 'ureterWall'
  | 'ureterSheath' | 'urethraWall' | 'cutA' | 'cutB' | 'cutC';

export interface MeshDef {
  g: BufferGeometry;
  m: MatKey;
  /** Срез стенки: виден только в своём режиме разреза. */
  cap?: 'side' | 'fundus';
  /** Не принимает клики (тонкие оболочки поверх стенки, просветы). */
  noPick?: boolean;
  /** Обрезается плоскостью уровня мочи (только объём мочи). */
  fillClip?: boolean;
  /** Лёгкая геометрия для raycast: большие оболочки нельзя пересекать лучом по полной сетке. */
  proxy?: BufferGeometry;
}

/** Оболочка стенки + её лёгкий двойник для наведения (20×10 вместо 80×40). */
function shell(opts: Parameters<typeof shellGeometry>[0], pick = true): { g: BufferGeometry; proxy?: BufferGeometry } {
  const g = shellGeometry(opts);
  if (!pick) return { g };
  return { g, proxy: shellGeometry({ ...opts, ySegs: 10, thetaSegs: 22, wobble: 0, displace: undefined }) };
}

export type BladderGeometry = Record<string, MeshDef[]>;

const both = (fn: (side: 1 | -1) => MeshDef[]): MeshDef[] => [...fn(1), ...fn(-1)];

/** Путь мочеточника от таза к стенке пузыря (для трубки и для потока мочи). */
export function ureterPath(side: 1 | -1): V3[] {
  const entry = ureterEntryPoint(side);
  return [
    [side * 4.75, 4.55, -3.55],
    [side * 3.75, 2.4, -3.0],
    [side * 2.85, 0.3, -2.52],
    [side * 2.3, -0.68, -2.22],
    entry,
  ];
}

/** Зеркальный угол для левой стороны. */
const mir = (theta: number) => Math.PI * 2 - theta;

export function buildBladder(): BladderGeometry {
  const out: BladderGeometry = {};
  const put = (id: string, defs: MeshDef[]) => {
    out[id] = defs;
  };

  /* ---------- Отделы пузыря (наружная поверхность) ---------- */
  put('apex', [{ ...shell({ y0: 1.38, y1: Y_TOP, off: 0.014, wobble: 0.018, seed: 3 }), m: 'surface' }]);
  put('body', [{ ...shell({ y0: -1.98, y1: 1.45, off: 0, wobble: 0.02, seed: 5 }), m: 'surface' }]);
  put('neck', [
    { ...shell({ y0: Y_BOTTOM, y1: -1.9, off: 0.007, wobble: 0.012, seed: 9 }), m: 'surface' },
    // лобково-пузырные связки: шейка привязана к лобковым костям
    ...both((side) => [
      {
        g: tubeGeometry([[side * 0.52, -2.68, 0.72], [side * 0.44, -2.52, 1.85], [side * 0.3, -2.5, 3.02]], 0.085, 0.115),
        m: 'fibrous' as MatKey,
      },
    ]),
  ]);
  put('fundus', [
    {
      ...shell({ y0: -2.32, y1: -0.42, off: 0.028, theta0: Math.PI / 2 - 0.3, theta1: (Math.PI * 3) / 2 + 0.3, wobble: 0.015, seed: 13 }),
      m: 'surfaceBack',
    },
  ]);
  put('urachus', [
    { g: tubeGeometry([[0, 3.02, 0.32], [0, 3.7, 0.58], [0, 4.5, 0.98], [0, 5.1, 1.22]], 0.105, 0.07), m: 'fibrous' },
    // срединная пупочная складка брюшины — гребешок от верхушки к пупку поверх стенки
    {
      g: tubeGeometry([wallPoint(1.45, 0, 0.05), wallPoint(2.3, 0, 0.05), wallPoint(2.92, 0, 0.05), [0, 3.55, 0.52]], 0.055, 0.045),
      m: 'serosa',
      noPick: true,
    },
  ]);

  /* ---------- Слои стенки ---------- */
  put('serosa', [
    { g: shellGeometry({ y0: 0.02, y1: Y_TOP - 0.02, off: WALL_OFF.serosa, wobble: 0.008, seed: 17, ySegs: 26, thetaSegs: 56 }), m: 'serosa', noPick: true },
    // нижний край брюшины — свободная «юбка» у линии отражения
    { g: shellGeometry({ y0: -0.38, y1: 0.06, off: WALL_OFF.serosa, displace: (y) => Math.max(0, 0.08 - y) * 0.55, seed: 19, ySegs: 8, thetaSegs: 56 }), m: 'serosa', noPick: true },
  ]);
  put('adventitia', [
    { g: shellGeometry({ y0: Y_BOTTOM + 0.04, y1: 0.14, off: WALL_OFF.adventitia, wobble: 0.01, seed: 23, ySegs: 26, thetaSegs: 56 }), m: 'adventitia', noPick: true },
  ]);
  // трабекулы детрузора: переплетающиеся пучки на внутренней стороне мышцы, видны в разрезе под слизистой
  const trabeculae: MeshDef[] = [];
  for (const ty of [-1.0, -0.25, 0.5, 1.2]) {
    const pts: V3[] = [];
    for (let j = 0; j < 20; j++) {
      const th = (j / 20) * Math.PI * 2;
      pts.push(wallPoint(ty + 0.13 * Math.sin(4 * th + ty * 1.7), th, -0.4));
    }
    trabeculae.push({ g: loopGeometry(pts, 0.07), m: 'detrusor', noPick: true });
  }
  put('detrusor', [
    { ...shell({ y0: Y_BOTTOM + 0.02, y1: Y_TOP - 0.03, off: WALL_OFF.detrusor, wobble: 0.014, seed: 29 }), m: 'detrusor' },
    ...trabeculae,
    { g: frontalCapGeometry(0.03, -0.19), m: 'cutA', cap: 'side' },
    { g: frontalCapGeometry(-0.19, -0.35), m: 'cutB', cap: 'side' },
    { g: frontalCapGeometry(-0.35, -0.48), m: 'cutC', cap: 'side' },
    { g: transverseCapGeometry(0.03, -0.19), m: 'cutA', cap: 'fundus' },
    { g: transverseCapGeometry(-0.19, -0.35), m: 'cutB', cap: 'fundus' },
    { g: transverseCapGeometry(-0.35, -0.48), m: 'cutC', cap: 'fundus' },
  ]);
  put('submucosa', [
    { ...shell({ y0: Y_BOTTOM + 0.03, y1: Y_TOP - 0.05, off: WALL_OFF.submucosa, seed: 31, ySegs: 34, thetaSegs: 68 }), m: 'submucosa' },
  ]);
  put('mucosa', [
    { ...shell({ y0: Y_BOTTOM + 0.04, y1: Y_TOP - 0.06, off: WALL_OFF.mucosa, wobble: 0.02, seed: 37 }), m: 'mucosa' },
  ]);
  const rugae: MeshDef[] = [];
  for (const ry of [-1.15, -0.45, 0.25, 0.95, 1.6]) {
    const pts: V3[] = [];
    for (let j = 0; j < 20; j++) {
      const th = (j / 20) * Math.PI * 2;
      pts.push(wallPoint(ry + 0.1 * Math.sin(3 * th + ry * 2.1), th, -0.53));
    }
    rugae.push({ g: loopGeometry(pts, 0.055), m: 'mucosaDark' });
  }
  // нижняя складка обходит гладкий треугольник сзади: дуга только по передней и боковым стенкам
  const arcPts: V3[] = [];
  for (let j = 0; j <= 16; j++) {
    const th = 4.05 + ((Math.PI * 2 + 2.23 - 4.05) * j) / 16;
    arcPts.push(wallPoint(-1.85 + 0.08 * Math.sin(3 * th), th % (Math.PI * 2), -0.53));
  }
  rugae.push({ g: tubeGeometry(arcPts, 0.055, 0.055), m: 'mucosaDark' });
  put('rugae', rugae);

  /* ---------- Просвет и его детали ---------- */
  put('urine', [
    { ...shell({ y0: -2.92, y1: 3.02, off: WALL_OFF.lumen, seed: 41, ySegs: 30, thetaSegs: 60 }), m: 'urine', fillClip: true },
  ]);
  put('trigone', [{ g: trigoneGeometry(), m: 'trigone' }]);
  const ridgePts: V3[] = [];
  for (let j = 0; j <= 10; j++) {
    const s = j / 10;
    const th = 2.47 + (Math.PI * 2 - 2.47 - 2.47) * s;
    ridgePts.push(wallPoint(-1.55 + 0.16 * Math.sin(s * Math.PI), th, -0.43));
  }
  put('interureteric-ridge', [{ g: tubeGeometry(ridgePts, 0.08, 0.08), m: 'ridge' }]);
  // устья мочеточников и отверстие уретры собираются в модели (им нужны повороты по нормали стенки)
  put('ureteric-orifices', []);
  put('urethral-orifice', []);
  put('uvula', [
    { g: new SphereGeometry(1, 20, 14).scale(0.36, 0.2, 0.3).translate(0, -2.58, -0.5), m: 'mucosaDark' },
  ]);

  /* ---------- Трубы: вход и выход ---------- */
  put('ureters', [
    ...both((side) => {
      const path = ureterPath(side);
      return [
        { g: tubeGeometry(path, 0.175, 0.15), m: 'ureterWall' as MatKey },
        { g: tubeGeometry(path, 0.215, 0.19), m: 'ureterSheath' as MatKey, noPick: true },
      ];
    }),
  ]);
  put('intramural-ureter', [
    ...both((side) => {
      const th = side === 1 ? 2.32 : mir(2.32);
      const thO = side === 1 ? 2.47 : mir(2.47);
      const path: V3[] = [wallPoint(-1.02, th, -0.02), wallPoint(-1.28, th + (side === 1 ? 0.07 : -0.07), -0.26), wallPoint(-1.52, thO, -0.44)];
      return [{ g: tubeGeometry(path, 0.135, 0.115), m: 'ureterWall' as MatKey }];
    }),
  ]);
  const urethraPath: V3[] = [[0, -2.72, 0.27], [0, -3.4, 0.36], [0, -4.12, 0.48], [0, -4.66, 0.58]];
  put('urethra', [
    { g: tubeGeometry(urethraPath, 0.3, 0.26), m: 'urethraWall' },
    { g: tubeGeometry(urethraPath, 0.145, 0.13), m: 'lumenDark', noPick: true },
  ]);
  const sphIn: MeshDef[] = [];
  for (const [y, z] of [[-3.04, 0.315], [-3.24, 0.345], [-3.44, 0.375]] as const) {
    sphIn.push({ g: new TorusGeometry(0.46, 0.15, 14, 32).rotateX(Math.PI / 2 + 0.1).translate(0, y, z), m: 'sphincterIn' });
  }
  put('internal-sphincter', sphIn);
  put('external-sphincter', [
    { g: new TorusGeometry(0.56, 0.21, 16, 36).rotateX(Math.PI / 2 + 0.12).translate(0, -4.1, 0.47), m: 'striated' },
  ]);

  /* ---------- Сосуды, нервы, лимфа ---------- */
  put('arteries', [
    ...both((side) => {
      const th = (t: number) => (side === 1 ? t : mir(t));
      const sup: V3[] = [[side * 3.95, 1.65, -0.95], [side * 3.35, 1.55, -0.25], wallPoint(1.32, th(0.95), 0.1)];
      const trunkEnd = wallPoint(1.32, th(0.95), 0.1);
      const defs: MeshDef[] = [{ g: tubeGeometry(sup, 0.085, 0.06), m: 'artery' }];
      for (const target of [wallPoint(2.35, th(0.72), 0.1), wallPoint(1.8, th(0.28), 0.1), wallPoint(1.95, th(1.95), 0.1)]) {
        defs.push({ g: tubeGeometry([trunkEnd, target], 0.05, 0.028), m: 'artery' });
      }
      const inf: V3[] = [[side * 3.85, -1.05, -1.25], [side * 3.05, -1.55, -0.75], wallPoint(-1.85, th(1.2), 0.1)];
      defs.push({ g: tubeGeometry(inf, 0.08, 0.05), m: 'artery' });
      defs.push({ g: tubeGeometry([wallPoint(-1.85, th(1.2), 0.1), wallPoint(-2.05, th(2.25), 0.1)], 0.045, 0.026), m: 'artery' });
      return defs;
    }),
  ]);
  put('veins', [
    ...both((side) => {
      const th = (t: number) => (side === 1 ? t : mir(t));
      const defs: MeshDef[] = [];
      const starts: [number, number][] = [[-1.5, 1.5], [-1.9, 2.15], [-2.25, 2.7]];
      for (const [yy, tt] of starts) {
        const path: V3[] = [
          wallPoint(yy, th(tt), 0.13),
          wallPoint(yy - 0.55, th(tt - 0.25 * side), 0.16),
          [side * 2.35, -2.95, -0.55 + (tt - 2) * 0.2],
          [side * 2.75, -3.45, -0.7],
        ];
        defs.push({ g: tubeGeometry(path, 0.115, 0.09), m: 'vein' });
      }
      return defs;
    }),
  ]);
  put('nerves', [
    ...both((side) => {
      const th = (t: number) => (side === 1 ? t : mir(t));
      const defs: MeshDef[] = [];
      const main: V3[] = [[side * 3.7, -1.3, -1.45], [side * 2.95, -1.75, -0.95], wallPoint(-2.0, th(1.45), 0.14)];
      defs.push({ g: tubeGeometry(main, 0.055, 0.04), m: 'nerve' });
      for (const target of [wallPoint(-1.7, th(2.5), 0.12), wallPoint(-2.3, th(2.1), 0.12), wallPoint(-1.15, th(1.7), 0.12)]) {
        defs.push({ g: tubeGeometry([wallPoint(-2.0, th(1.45), 0.14), target], 0.035, 0.02), m: 'nerve' });
      }
      return defs;
    }),
  ]);
  const lymph: MeshDef[] = [];
  for (const side of [1, -1] as const) {
    const nodes: [V3, number][] = [
      [[side * 2.55, -2.15, 0.95], 0.3],
      [[side * 2.95, -1.35, 1.25], 0.26],
      [[side * 2.2, -2.9, 0.25], 0.24],
      [[side * 3.3, -0.55, 1.05], 0.22],
    ];
    for (const [p, r] of nodes) {
      lymph.push({ g: new SphereGeometry(r, 16, 12).scale(1, 1.25, 0.85).translate(...p), m: 'lymph' });
    }
    for (let i = 0; i < nodes.length - 1; i++) {
      lymph.push({ g: tubeGeometry([nodes[i][0], nodes[i + 1][0]], 0.032, 0.032), m: 'lymphDuct', noPick: true });
    }
  }
  put('lymph-nodes', lymph);

  /* ---------- Соседи и опоры ---------- */
  put('pelvic-floor', [{ g: pelvicFloorGeometry(), m: 'striated' }]);
  const pubis: MeshDef[] = [];
  for (const side of [1, -1] as const) {
    pubis.push({
      g: new SphereGeometry(1, 20, 14).scale(0.37, 0.85, 0.3).rotateZ(side * 0.1).translate(side * 0.31, -2.52, 3.32),
      m: 'bone',
    });
  }
  pubis.push({ g: new SphereGeometry(1, 16, 12).scale(0.13, 0.74, 0.27).translate(0, -2.52, 3.32), m: 'cartilage' });
  put('pubic-symphysis', pubis);

  for (const id of BLADDER_PART_IDS) if (!out[id]) out[id] = [];
  return out;
}
