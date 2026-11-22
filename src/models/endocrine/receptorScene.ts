import type { BufferGeometry } from 'three';
import { smoothSubtract, sphere, type Sdf, type V3 } from '../skeleton/sdf';
import { E, Er, wobble } from '../body/sdfx';
import {
  attachOrganicUv,
  blobGeo,
  ellipGeo,
  peptideMoleculeGeo,
  rbcGeo,
  safeMerge,
  sdfMesh,
  seeded,
  steroidMoleculeGeo,
  strutGeo,
  tint,
  tube,
  wave,
  type PartMeshMap,
} from './geoHelpers';

/*
  Микроскопическая диорама «Клетка и рецептор»:
  - слева: эндокринная клетка в разрезе с аппаратом Гольджи и секреторными везикулами (экзоцитоз);
  - в центре: фенестрированный капилляр в продольном разрезе с эритроцитами и «окошками»-фенестрами;
  - справа: клетка-мишень в разрезе с двойным липидным слоем мембраны, мембранным рецептором для
    водорастворимого (пептидного) гормона («ключ и замок» + несовпадающий рецептор) и
    внутриклеточным рецептором в ядре с двойной спиралью ДНК для жирорастворимого (стероидного) гормона.
*/

export const PEPTIDE_APPROACH_PATH: V3[] = [
  [-1.82, 0.65, 0.25],
  [-0.55, 0.74, 0.12],
  [0.42, 0.72, 0.16],
  [1.18, 0.70, 0.16],
  [1.56, 0.68, 0.14],
];

export const SECOND_MESSENGER_PATH: V3[] = [
  [1.92, 0.66, 0.12],
  [2.32, 0.56, 0.08],
  [2.68, 0.36, 0.04],
  [2.98, 0.16, 0.02],
];

export const STEROID_CROSS_PATH: V3[] = [
  [-1.80, -0.62, 0.20],
  [-0.45, -0.72, 0.12],
  [0.52, -0.72, 0.16],
  [1.58, -0.68, 0.14],
  [2.32, -0.52, 0.10],
  [2.92, -0.26, 0.06],
];

export const CAPILLARY_BLOOD_PATH: V3[] = [
  [-0.58, 2.05, -0.10],
  [-0.36, 1.05, 0.04],
  [-0.42, 0.0, 0.08],
  [-0.56, -1.05, 0.02],
  [-0.44, -2.05, -0.08],
];

export function buildReceptorDiorama(): PartMeshMap {
  // 1. Эндокринная клетка (слева, x ≈ -3.15), вскрыта спереди-справа, чтобы видеть Гольджи и везикулы
  const endoOuter = wobble(E([-3.15, 0, -0.10], [1.28, 1.38, 1.12], 0.4), 2.8, 0.04, 0.3);
  const endoCavity = E([-2.62, 0.06, 0.48], [1.05, 1.10, 0.96], 0.3);
  const endoBody = attachOrganicUv(
    tint(
      sdfMeshSafe(smoothSubtract(0.12, endoOuter, endoCavity), [-4.6, -1.6, -1.4], [-1.7, 1.6, 1.2], 0.085, 0.10),
      (x, y) => {
        const k = 0.90 + 0.10 * wave(x * 3 + y * 3, 4, 2);
        return [k, k * 0.94, k * 0.90];
      },
    ),
    0.6,
  );

  // Аппарат Гольджи (4 изогнутые стопки цистерн) + ядро эндокринной клетки
  const golgiParts: BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const ox = -2.92 + i * 0.18;
    const h = 0.56 - i * 0.06;
    golgiParts.push(
      tube(
        [
          [ox - 0.12, -h, -0.04],
          [ox + 0.04, -h * 0.42, 0.08],
          [ox + 0.08, 0, 0.12],
          [ox + 0.04, h * 0.42, 0.08],
          [ox - 0.12, h, -0.04],
        ],
        (t) => 0.055 + 0.025 * Math.pow(Math.abs(t - 0.5) * 2, 2),
        { radial: 10, segments: 24 },
      ),
    );
  }
  const golgiGeo = safeMerge(golgiParts);

  // Секреторные везикулы, отпочковывающиеся к капилляру (экзоцитоз!)
  const vesicleSpots: [V3, number][] = [
    [[-2.26, 0.48, 0.18], 0.11],
    [[-2.14, 0.20, 0.24], 0.10],
    [[-2.22, -0.18, 0.22], 0.11],
    [[-2.12, -0.52, 0.16], 0.10],
    [[-1.92, 0.62, 0.24], 0.12], // момент слияния с мембраной (экзоцитоз)
    [[-1.90, -0.60, 0.20], 0.12],
    [[-2.42, 0.72, 0.08], 0.09],
    [[-2.40, -0.74, 0.08], 0.09],
  ];
  const vesicleGeo = safeMerge(
    vesicleSpots.map(([c, r]) => blobGeo(c, [r, r * 0.94, r], 1)),
  );

  // 2. Фенестрированный капилляр (в центре, продольно рассечён спереди)
  // строим стенку капилляра как разность двух труб (внешняя − внутренняя − переднее окно − поры-фенестры)
  const capOuter = (x: number, y: number, z: number): number => {
    const cx = -0.46 + 0.09 * Math.sin(y * 1.15);
    const cz = 0.02 + 0.06 * Math.cos(y * 1.0);
    const radial = Math.hypot(x - cx, z - cz) - 0.64;
    const capY = Math.abs(y) - 1.95;
    return Math.max(radial, capY);
  };
  const capInner = (x: number, y: number, z: number): number => {
    const cx = -0.46 + 0.09 * Math.sin(y * 1.15);
    const cz = 0.02 + 0.06 * Math.cos(y * 1.0);
    return Math.hypot(x - cx, z - cz) - 0.52;
  };
  // передний продольный срез для обзора просвета капилляра
  const frontWindow: Sdf = (x, y, z) => {
    const cx = -0.46 + 0.09 * Math.sin(y * 1.15);
    return Math.max(-(z - 0.16), Math.abs(x - cx) - 0.66, Math.abs(y) - 2.05);
  };
  // фенестры — круглые «окошки» в эндотелии капилляра, через которые выходят гормоны!
  const fenestrae: Sdf[] = [];
  const rnd = seeded(909);
  for (let i = 0; i < 16; i++) {
    const fy = -1.55 + (i / 15) * 3.10;
    const ang = (i % 2 === 0 ? 0.25 : -0.35) + (rnd() - 0.5) * 0.5;
    const cx = -0.46 + 0.09 * Math.sin(fy * 1.15);
    const cz = 0.02 + 0.06 * Math.cos(fy * 1.0);
    const side = i % 3 === 0 ? -1 : 1;
    fenestrae.push(sphere([cx + side * 0.58 * Math.cos(ang), fy, cz - 0.18 + 0.25 * Math.sin(ang)], 0.088));
  }
  const capWallF = smoothSubtract(0.02, smoothSubtract(0.015, capOuter, capInner, frontWindow), ...fenestrae);
  const capWallGeo = attachOrganicUv(
    tint(
      sdfMeshSafe(capWallF, [-1.32, -2.05, -0.78], [0.42, 2.05, 0.72], 0.068, 0.08),
      (_x, y) => {
        const k = 0.90 + 0.10 * wave(y * 4, 5, 2);
        return [k, k * 0.92, k * 0.92];
      },
    ),
    0.8,
  );
  // двояковогнутые эритроциты в просвете капилляра
  const rbcGeoAll = safeMerge([
    rbcGeo([-0.48, 1.22, -0.08], 0.26, [0.45, 0.2, 0.35]),
    rbcGeo([-0.36, 0.24, -0.14], 0.25, [-0.35, 0.4, 0.65]),
    rbcGeo([-0.54, -0.68, -0.06], 0.26, [0.60, -0.3, -0.25]),
    rbcGeo([-0.42, -1.48, -0.12], 0.25, [0.25, 0.5, 0.80]),
  ]);

  // 3. Пептидные (водорастворимые) гормоны — бирюзовые глобулярные «ключи»
  const peptideGeo = safeMerge([
    peptideMoleculeGeo([-0.12, 0.88, 0.16], 0.30, [0.2, 0.4, 0.1]),
    peptideMoleculeGeo([0.62, 0.78, 0.20], 0.32, [-0.15, 0.2, 0.25]),
    // гормон-ключ, точно входящий в карман мембранного рецептора!
    peptideMoleculeGeo([1.36, 0.68, 0.16], 0.34, [0, 0.1, 0]),
  ]);

  // 4. Стероидные (жирорастворимые) гормоны — золотистые 4-кольцевые молекулы, проходящие сквозь мембрану!
  const steroidGeo = safeMerge([
    steroidMoleculeGeo([0.48, -0.76, 0.18], 0.19, [0.25, 0.45, 0.12]),
    // прямо в момент прохождения через двойной липидный слой!
    steroidMoleculeGeo([1.68, -0.68, 0.18], 0.20, [0.12, 0.30, -0.08]),
    // внутри цитоплазмы на пути к ядру
    steroidMoleculeGeo([2.42, -0.44, 0.12], 0.19, [-0.20, 0.18, 0.22]),
  ]);

  // 5. Клетка-мишень (справа, x ≈ +3.25) с двойной мембраной и рядами головок фосфолипидов на срезе!
  const targetCenter: V3 = [3.25, 0, -0.12];
  const cellOuter = E(targetCenter, [1.68, 1.72, 1.38], 0.5);
  const cellInner = E(targetCenter, [1.46, 1.50, 1.16], 0.5);
  // передний вырез, открывающий внутренность клетки-мишени и край двойного слоя мембраны
  const targetFrontCut: Sdf = (_x, _y, z) => -(z - 0.26);
  const membraneShellF = smoothSubtract(0.03, cellOuter, cellInner, targetFrontCut);
  const membraneGeo = sdfMeshSafe(membraneShellF, [1.42, -1.86, -1.62], [5.05, 1.86, 0.40], 0.082, 0.09);

  // два концентрических ряда «головок» фосфолипидов по всему переднему срезу мембраны (наглядно виден бислой!)
  const lipidHeads: BufferGeometry[] = [];
  const headCount = 42;
  for (let i = 0; i < headCount; i++) {
    const a = (i / headCount) * Math.PI * 2;
    const cs = Math.cos(a);
    const sn = Math.sin(a);
    // внешний слой головок
    lipidHeads.push(
      ellipGeo([targetCenter[0] + cs * 1.62, targetCenter[1] + sn * 1.66, 0.26], [0.055, 0.055, 0.055], [0, 0, 0], 8, 6),
    );
    // внутренний слой головок
    lipidHeads.push(
      ellipGeo([targetCenter[0] + cs * 1.48, targetCenter[1] + sn * 1.52, 0.26], [0.052, 0.052, 0.052], [0, 0, 0], 8, 6),
    );
  }
  const lipidGeo = safeMerge(lipidHeads);

  // полупрозрачная цитоплазма внутри клетки-мишени
  const cytoF = smoothSubtract(0.03, cellInner, targetFrontCut, E([3.36, -0.05, -0.15], [0.84, 0.84, 0.78], 0.3));
  const cytoGeo = sdfMeshSafe(cytoF, [1.62, -1.65, -1.40], [4.85, 1.65, 0.34], 0.11);

  // 6. Мембранный рецептор (7-трансмембранный пучок спиралей с карманом «замка» + контрольный неподходящий рецептор)
  const recParts: BufferGeometry[] = [];
  const recY = 0.68;
  const recX = 1.72;
  const recZ = 0.14;
  // пучок из 6 трансмембранных альфа-спиралей, пронизывающих мембрану по кругу
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    const dy = Math.cos(ang) * 0.13;
    const dz = Math.sin(ang) * 0.13;
    recParts.push(
      strutGeo([recX - 0.22, recY + dy, recZ + dz], [recX + 0.22, recY + dy * 0.9, recZ + dz * 0.9], 0.048, 0.048, 8),
    );
  }
  // наружный вогнутый карман-«замок» под форму пептидного гормона-«ключа»
  const pocketOuter = Er([recX - 0.28, recY, recZ], [0.24, 0.28, 0.26], [0, 0, 0], 0.2);
  const pocketCut = sphere([recX - 0.42, recY, recZ], 0.22);
  recParts.push(sdfMeshSafe(smoothSubtract(0.03, pocketOuter, pocketCut), [recX - 0.60, recY - 0.36, recZ - 0.34], [recX + 0.05, recY + 0.36, recZ + 0.34], 0.042));
  // внутриклеточный сигнальный домен (G-белок), запускающий каскад вторичных посредников
  recParts.push(ellipGeo([recX + 0.32, recY - 0.04, recZ], [0.16, 0.14, 0.14], [0, 0, 0], 12, 10));
  const membraneRecGeo = safeMerge(recParts);

  // второй (несовпадающий по форме!) рецептор выше — показывает избирательность гормона
  const decoyX = 1.98;
  const decoyY = 1.18;
  const decoyParts: BufferGeometry[] = [
    strutGeo([decoyX - 0.18, decoyY + 0.08, 0.06], [decoyX + 0.18, decoyY + 0.02, 0.06], 0.055, 0.055, 8),
    strutGeo([decoyX - 0.18, decoyY - 0.08, 0.06], [decoyX + 0.18, decoyY - 0.14, 0.06], 0.055, 0.055, 8),
    ellipGeo([decoyX - 0.26, decoyY + 0.05, 0.06], [0.09, 0.18, 0.12], [0, 0, 0.3], 10, 8),
  ];
  const decoyGeo = safeMerge(decoyParts);

  // 7. Ядро клетки-мишени (с порами), внутриклеточный рецептор и двойная спираль ДНК
  const nucC: V3 = [3.38, -0.06, -0.14];
  const nucOuter = E(nucC, [0.82, 0.82, 0.74], 0.3);
  const nucInner = E(nucC, [0.71, 0.71, 0.63], 0.3);
  const nucCut: Sdf = (_x, _y, z) => -(z - 0.12);
  // ядерные поры на оболочке
  const pores: Sdf[] = [
    sphere([nucC[0] - 0.76, nucC[1] - 0.18, 0.02], 0.12),
    sphere([nucC[0] - 0.64, nucC[1] + 0.44, -0.02], 0.10),
    sphere([nucC[0] + 0.52, nucC[1] + 0.56, -0.10], 0.10),
  ];
  const nucShellGeo = sdfMeshSafe(
    smoothSubtract(0.025, smoothSubtract(0.02, nucOuter, nucInner, nucCut), ...pores),
    [2.45, -0.98, -0.98],
    [4.32, 0.88, 0.24],
    0.058,
    0.07,
  );

  // Внутриклеточный рецептор (димер в ядре, обхватывающий ДНК после связывания стероидного гормона)
  const nucRecGeo = safeMerge([
    ellipGeo([3.04, -0.18, -0.02], [0.20, 0.15, 0.15], [0.1, 0.2, 0.3], 14, 10),
    ellipGeo([3.20, -0.28, -0.06], [0.18, 0.14, 0.14], [-0.1, -0.2, -0.2], 14, 10),
    // «цинковые пальцы», сцепляющиеся со спиралью ДНК
    strutGeo([3.12, -0.18, -0.02], [3.36, -0.14, -0.14], 0.042, 0.036, 8),
    strutGeo([3.24, -0.26, -0.06], [3.46, -0.22, -0.14], 0.042, 0.036, 8),
  ]);

  // Настоящая 3D-двойная спираль ДНК внутри ядра!
  const strandA: V3[] = [];
  const strandB: V3[] = [];
  const rungs: BufferGeometry[] = [];
  const steps = 28;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = -0.60 + t * 1.12;
    const ang = t * Math.PI * 3.2;
    const r = 0.18;
    const cx = 3.52;
    const cz = -0.16;
    const pa: V3 = [cx + Math.cos(ang) * r, y, cz + Math.sin(ang) * r];
    const pb: V3 = [cx - Math.cos(ang) * r, y, cz - Math.sin(ang) * r];
    strandA.push(pa);
    strandB.push(pb);
    if (i % 2 === 1 && i < steps) {
      rungs.push(strutGeo(pa, pb, 0.022, 0.022, 6));
    }
  }
  const dnaGeo = safeMerge([
    tube(strandA, 0.034, { radial: 8, segments: 56 }),
    tube(strandB, 0.034, { radial: 8, segments: 56 }),
    ...rungs,
  ]);

  return {
    'endocrine-cell': [
      { mat: 'endocrineCell', geo: endoBody },
      { mat: 'golgi', geo: golgiGeo },
      { mat: 'vesicle', geo: vesicleGeo },
    ],
    'fenestrated-capillary': [
      { mat: 'capillaryWall', geo: capWallGeo },
      { mat: 'rbc', geo: rbcGeoAll },
    ],
    'peptide-hormone': [{ mat: 'peptideHormone', geo: peptideGeo }],
    'membrane-receptor': [
      { mat: 'membraneReceptor', geo: membraneRecGeo },
      { mat: 'decoyReceptor', geo: decoyGeo },
    ],
    'steroid-hormone': [{ mat: 'steroidHormone', geo: steroidGeo }],
    'cell-membrane': [
      { mat: 'cellMembrane', geo: membraneGeo },
      { mat: 'lipidHead', geo: lipidGeo },
      { mat: 'cytoplasm', geo: cytoGeo, noPick: true },
    ],
    'nuclear-receptor': [
      { mat: 'nucleusShell', geo: nucShellGeo },
      { mat: 'nuclearReceptor', geo: nucRecGeo },
      { mat: 'dnaStrand', geo: dnaGeo },
    ],
  };
}

function sdfMeshSafe(f: Sdf, min: V3, max: V3, cell: number, ao?: number): BufferGeometry {
  return sdfMesh(f, min, max, cell, ao);
}
