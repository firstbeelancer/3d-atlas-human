// anatomy.js — сцена «Кожа», собранная из неявных полей (SDF). Авторская композиция.
// Каждый слой и каждая структура — собственное поле; мезер превращает их в сетки.

import {
  sphere, ellipsoid, roundBox, capsule, tube, union, intersect, subtract,
  sunion, shell, above, below, fbm2, heightField, rng, lerp,
} from './sdf.js';

const R = rng(77);

/* ------------------------------ Геометрия блока ------------------------------ */
export const BLOCK = { x0: -9, x1: 9, z0: -6, z1: 6, top: 0.4, bottom: -9.2 };
const blockBox = roundBox([0, -4.4, 0], [9, 4.9, 6], 0.25);

const surf = heightField((x, z) => 0.05 * (fbm2(x * 0.6, z * 0.6) - 0.5), -9, 9, -6, 6, 64, 48);
const ridge = (x, z) =>
  (0.5 + 0.5 * Math.sin(x * 1.8 + 0.5 * Math.cos(z * 1.2))) *
  (0.5 + 0.5 * Math.sin(z * 1.6 + 0.7 * Math.sin(x * 1.1)));
const epiBase = heightField((x, z) => -0.85 - 0.4 * ridge(x, z), -9, 9, -6, 6, 64, 48);

/* -------------------------------- Фолликул -------------------------------- */
const AX = [[3.2, 0.1, 0.5], [2.9, -1.4, 0.45], [2.5, -3.0, 0.4], [2.1, -4.6, 0.35], [1.9, -6.2, 0.3], [1.8, -7.1, 0.3]];
const Rct = (t) => 0.72 + 0.5 * Math.pow(Math.max(0, (t - 0.75) / 0.25), 1.5);
const axRadii = AX.map((_, i) => Rct(i / (AX.length - 1)));
const follicleOuter = tube(AX, axRadii);
const HAIR_UP = [[3.2, 0.1, 0.5], [3.7, 1.5, 0.5], [4.6, 2.8, 0.5], [5.9, 3.7, 0.5], [7.4, 4.0, 0.5]];

function layer(topH, botH, carve = true) {
  let f = intersect(blockBox, below(topH), above(botH));
  if (carve) f = subtract(f, follicleOuter);
  return f;
}
const flat = (c) => () => c;
const blockBounds = [[-9.3, -9.4, -6.3], [9.3, 0.6, 6.3]];

function boundsOf(pts, pad) {
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const p of pts) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], p[a]); mx[a] = Math.max(mx[a], p[a]); }
  return [[mn[0] - pad, mn[1] - pad, mn[2] - pad], [mx[0] + pad, mx[1] + pad, mx[2] + pad]];
}

/* ------------------------------ Жировые дольки ------------------------------ */
let fatField = null;
const fatCenters = [];
for (let i = 0; i < 46; i++) {
  const c = [lerp(-8.2, 8.2, R()), lerp(-8.6, -5.6, R()), lerp(-5.2, 5.2, R())];
  if (Math.hypot(c[0] - 1.8, c[1] + 7.1, c[2] - 0.3) < 2.0) continue;
  fatCenters.push(c);
  const s = sphere(c, 0.42 + R() * 0.4);
  fatField = fatField ? sunion(0.35, fatField, s) : s;
}

/* ------------------------------ Сальная железа ------------------------------ */
let seb = null;
for (const c of [[1.5, -1.9, 0.5], [1.0, -2.1, 1.1], [1.2, -2.0, -0.2], [2.0, -2.2, 0.9]]) {
  const s = sphere(c, 0.42 + R() * 0.15);
  seb = seb ? sunion(0.3, seb, s) : s;
}

/* ------------------------------ Эккриновая железа ------------------------------ */
const coilPts = [];
const coilC = [-4.5, -6.8, 0.8];
for (let i = 0; i <= 90; i++) {
  const t = (i / 90) * Math.PI * 2;
  coilPts.push([coilC[0] + 0.8 * Math.sin(5 * t) * 0.8 + 0.25 * Math.sin(2 * t), coilC[1] + 0.55 * Math.sin(4 * t + 1), coilC[2] + 0.7 * Math.cos(3 * t)]);
}
const eccrineField = tube(coilPts, coilPts.map(() => 0.16));
const ductPts = [[-4.5, -5.9, 0.8], [-4.4, -4.2, 0.8], [-4.6, -2.6, 0.8], [-4.5, -1.2, 0.8]];
for (let i = 0; i <= 20; i++) {
  const t = i / 20, a = t * 2.5 * Math.PI * 2, r = 0.12 * (1 - t * 0.7);
  ductPts.push([-4.5 + r * Math.cos(a), lerp(-1.2, 0.05, t), 0.8 + r * Math.sin(a)]);
}
const ductField = tube(ductPts, ductPts.map(() => 0.05));

/* ------------------------------ Сосуды ------------------------------ */
const wave = (y, z) => Array.from({ length: 12 }, (_, i) => [lerp(-8.6, 8.6, i / 11), y + 0.1 * Math.sin(i * 1.2 + z), z + 0.1 * Math.sin(i * 0.8)]);
const deepArt = tube(wave(-5.4, -2.5), wave(-5.4, -2.5).map(() => 0.14));
const deepVein = tube(wave(-5.6, 1.5), wave(-5.6, 1.5).map(() => 0.16));
const subPlex = tube(wave(-1.9, 0.5), wave(-1.9, 0.5).map(() => 0.06));
let loops = null;
for (let x = -8; x <= 8; x += 1.6) {
  for (let z = -4.5; z <= 4.5; z += 1.8) {
    if (Math.hypot(x - 2.4, z - 0.4) < 1.6) continue;
    const apex = -0.85 - 0.4 * ridge(x, z) - 0.12;
    const u = tube([[x - 0.09, -1.9, z], [x, apex, z], [x + 0.09, -1.9, z]], [0.03, 0.03, 0.03]);
    loops = loops ? union(loops, u) : u;
  }
}

/* ------------------------------ Нервы и рецепторы ------------------------------ */
const nerveTrunk = tube([[-8.8, -8.4, -2.5], [-5, -6.6, -1.8], [-1, -5.4, -1.2], [3, -4.8, -0.8], [7, -4.6, -0.5]], [0.13, 0.11, 0.09, 0.07, 0.06]);
let nerveBranch = null;
for (const x of [-6, -2, 2, 6]) {
  const b = tube([[x, -4.9, -0.9], [x + 0.2, -3.4, -0.5], [x, -2.0, -0.2]], [0.04, 0.035, 0.03]);
  nerveBranch = nerveBranch ? union(nerveBranch, b) : b;
}
const nerveField = union(nerveTrunk, nerveBranch);

// тельце Пачини: концентрические оболочки
let pac = null;
const pacC = [-1, -8, 2];
for (let k = 0; k < 7; k++) {
  const s = 1 - k * 0.11;
  const sh = shell(ellipsoid(pacC, [0.55 * s, 0.85 * s, 0.55 * s]), 0.03);
  pac = pac ? union(pac, sh) : sh;
}
const pacCore = ellipsoid(pacC, [0.14, 0.45, 0.14]);

// тельца Мейснера: стопка пластинок в капсуле
let mei = null;
for (const c of [[-6, -1.15, 1.5], [0.5, -1.15, 2.5], [5.5, -1.15, 1.8]]) {
  for (let k = 0; k < 5; k++) {
    const d = ellipsoid([c[0], c[1] - 0.25 + k * 0.12, c[2]], [0.2, 0.045, 0.2]);
    mei = mei ? union(mei, d) : d;
  }
}

// окончания Руффини: ветвящиеся окончания
let ruf = null;
const rufC = [4, -4, 2];
for (let k = 0; k < 6; k++) {
  const a = (k / 6) * Math.PI * 2;
  const b = capsule(rufC, [rufC[0] + Math.cos(a) * 0.5, rufC[1] + 0.3, rufC[2] + Math.sin(a) * 0.5], 0.025);
  ruf = ruf ? union(ruf, b) : b;
}

// свободные нервные окончания: тонкие ветви в эпидермис
let free = null;
for (const [x, z] of [[-7.5, 1.2], [-3.5, 2.2], [0.5, 1.4], [4.5, 2.6], [7, 1.0], [-5.5, 3.4]]) {
  const top = -0.85 - 0.4 * ridge(x, z) + 0.45;
  const b = tube([[x, -1.9, z], [x + 0.05, -1.2, z], [x, top, z]], [0.018, 0.016, 0.012]);
  free = free ? union(free, b) : b;
}

/* -------------------------------- Каталог частей -------------------------------- */
export const PARTS = [
  { id: 'corneum', name: 'Роговой слой', latin: 'Stratum corneum', group: 'Слои', color: 0xecd9c6, cut: 0xe0c3a4, cell: 0.28, smooth: 2, bounds: blockBounds, field: layer(surf, flat(-0.2)), text: 'Наружный слой мёртвых кератиновых чешуек: барьер для воды и микробов, постоянно отшелушивается.' },
  { id: 'epidermis', name: 'Живой эпидермис', latin: 'Epidermis', group: 'Слои', color: 0xe9b9a3, cut: 0xd99f85, cell: 0.24, smooth: 2, bounds: blockBounds, field: layer(flat(-0.19), epiBase), text: 'Зернистый, шиповатый и базальный слои: клетки делятся снизу, поднимаются и наполняются кератином.' },
  { id: 'papillary', name: 'Сосочковая дерма', latin: 'Stratum papillare', group: 'Слои', color: 0xf1cbbb, cut: 0xe5b39c, cell: 0.26, smooth: 2, bounds: blockBounds, field: layer(epiBase, flat(-2.3)), text: 'Рыхлый слой с сосочками, капиллярными петлями и тельцами Мейснера.' },
  { id: 'reticular', name: 'Сетчатая дерма', latin: 'Stratum reticulare', group: 'Слои', color: 0xf3d8c8, cut: 0xe6c2a8, cell: 0.3, smooth: 2, bounds: blockBounds, field: layer(flat(-2.28), flat(-5.2)), text: 'Плотный слой коллагена и эластина: прочность и упругость кожи.' },
  { id: 'hypodermis', name: 'Гиподерма', latin: 'Hypodermis', group: 'Слои', color: 0xf2d98c, cut: 0xe8c46a, cell: 0.32, smooth: 2, bounds: blockBounds, field: layer(flat(-5.18), flat(-9.0), false), text: 'Подкожная жировая клетчатка: энергия, теплоизоляция, амортизация.' },
  { id: 'fat', name: 'Жировые дольки', latin: 'Lobuli adiposi', group: 'Слои', color: 0xf7e394, cut: 0xf0d470, cell: 0.24, smooth: 5, bounds: [[-8.8, -9, -5.8], [8.8, -5.2, 5.8]], field: fatField, text: 'Скопления адипоцитов, заполненных каплей жира.' },
  { id: 'hair-shaft', name: 'Стержень волоса', latin: 'Scapus pili', group: 'Придатки', color: 0x6e4b2f, cut: 0x8a5f3a, cell: 0.14, smooth: 3, bounds: boundsOf(HAIR_UP, 0.5), field: tube(HAIR_UP, HAIR_UP.map((_, i) => 0.24 * (1 - 0.7 * (i / (HAIR_UP.length - 1))))), text: 'Волос над кожей из мёртвых ороговевших клеток.' },
  { id: 'hair-root', name: 'Корень волоса', latin: 'Radix pili', group: 'Придатки', color: 0xd9a78f, cut: 0xc99276, cell: 0.18, smooth: 3, bounds: boundsOf(AX, 1.4), field: follicleOuter, text: 'Фолликул с корневыми влагалищами, растёт под углом к поверхности.' },
  { id: 'hair-bulb', name: 'Луковица', latin: 'Bulbus pili', group: 'Придатки', color: 0xf3c8a0, cut: 0xe8b586, cell: 0.16, smooth: 4, bounds: [[0.6, -8.4, -1], [3.2, -6.2, 1.6]], field: ellipsoid([1.8, -7.2, 0.3], [1.0, 1.1, 1.0]), text: 'Здесь клетки матрикса делятся и рождают волос.' },
  { id: 'hair-papilla', name: 'Волосяной сосочек', latin: 'Papilla pili', group: 'Придатки', color: 0xd96b5b, cut: 0xc85a4a, cell: 0.12, smooth: 4, bounds: [[1.0, -8.2, -0.5], [2.6, -6.6, 1.1]], field: ellipsoid([1.8, -7.5, 0.3], [0.45, 0.7, 0.45]), text: 'Соединительнотканный сосочек с капиллярами, питает луковицу.' },
  { id: 'sebaceous', name: 'Сальная железа', latin: 'Glandula sebacea', group: 'Придатки', color: 0xf4e4a8, cut: 0xecd78e, cell: 0.18, smooth: 5, bounds: [[0.2, -2.9, -0.9], [2.8, -1.2, 1.9]], field: seb, text: 'Выделяет кожное сало в воронку фолликула, смазывает кожу и волос.' },
  { id: 'arrector', name: 'Мышца, поднимающая волос', latin: 'M. arrector pili', group: 'Придатки', color: 0xb9444c, cut: 0xa8383f, cell: 0.16, smooth: 3, bounds: [[-2.2, -3.8, -0.4], [3, -0.8, 1.2]], field: capsule([2.2, -3.2, 0.4], [-1.5, -1.4, 0.4], 0.16), text: 'Гладкая мышца: сокращаясь, поднимает волос — «мурашки».' },
  { id: 'eccrine', name: 'Потовая железа', latin: 'Glandula sudorifera', group: 'Придатки', color: 0xa8c6ea, cut: 0x96b6de, cell: 0.16, smooth: 3, bounds: boundsOf(coilPts, 0.5), field: eccrineField, text: 'Клубочек, вырабатывающий водянистый пот для охлаждения тела.' },
  { id: 'eccrine-duct', name: 'Проток потовой железы', latin: 'Ductus sudoriferus', group: 'Придатки', color: 0xc3d8ef, cut: 0xb2cbe8, cell: 0.12, smooth: 2, bounds: boundsOf(ductPts, 0.4), field: ductField, text: 'Каналец к поре; сквозь эпидермис идёт спиралью.' },
  { id: 'apocrine', name: 'Апокриновая железа', latin: 'Glandula apocrina', group: 'Придатки', color: 0xa9b6e2, cut: 0x98a6d4, cell: 0.18, smooth: 3, bounds: [[5.4, -7.4, -2.8], [7.8, -5.2, -0.4]], field: tube(Array.from({ length: 60 }, (_, i) => { const t = (i / 59) * Math.PI * 2; return [6.5 + 0.7 * Math.sin(4 * t), -6.2 + 0.5 * Math.sin(3 * t + 1), -1.5 + 0.6 * Math.cos(3 * t)]; }), Array.from({ length: 60 }, () => 0.18)), text: 'Густой секрет в воронку фолликула; запах пота создают бактерии кожи.' },
  { id: 'deep-plexus', name: 'Глубокое сплетение', latin: 'Plexus profundus', group: 'Сосуды', color: 0xd03a34, cut: 0xb83029, cell: 0.18, smooth: 2, bounds: [[-9, -6.2, -3.2], [9, -4.8, 2.4]], field: union(deepArt, deepVein), text: 'Артерии и вены на границе дермы и гиподермы.' },
  { id: 'capillaries', name: 'Капиллярные петли', latin: 'Ansa capillaris', group: 'Сосуды', color: 0xe4544e, cut: 0xd04842, cell: 0.14, smooth: 2, bounds: [[-8.6, -2.4, -5], [8.6, -0.6, 5]], field: union(subPlex, loops), text: 'Петли в сосочках дермы питают эпидермис.' },
  { id: 'nerve', name: 'Нервное сплетение', latin: 'Plexus nervosus', group: 'Нервы', color: 0xe8cb4a, cut: 0xd8bb3a, cell: 0.16, smooth: 2, bounds: [[-9, -8.8, -3], [7.6, -1.6, 0.4]], field: nerveField, text: 'Чувствительные и вегетативные нервы дермы.' },
  { id: 'pacinian', name: 'Тельце Пачини', latin: 'Corpusculum Pacini', group: 'Нервы', color: 0x9b6dc2, cut: 0x8a5cb2, cell: 0.12, smooth: 3, bounds: [[-2, -9.2, 1], [0, -6.8, 3]], field: union(pac, pacCore), text: 'Рецептор давления и вибрации, похож на луковицу.' },
  { id: 'meissner', name: 'Тельца Мейснера', latin: 'Corpuscula Meissneri', group: 'Нервы', color: 0x6db794, cut: 0x5ca784, cell: 0.12, smooth: 3, bounds: [[-6.6, -1.9, 0.9], [6.1, -0.5, 3.1]], field: mei, text: 'Рецепторы лёгкого прикосновения в сосочках дермы.' },
  { id: 'ruffini', name: 'Окончания Руффини', latin: 'Corpuscula Ruffini', group: 'Нервы', color: 0xe89a5a, cut: 0xd88a4a, cell: 0.12, smooth: 3, bounds: [[3.2, -4.6, 1.2], [4.8, -3.4, 2.8]], field: ruf, text: 'Рецепторы растяжения кожи.' },
  { id: 'free', name: 'Свободные окончания', latin: 'Terminationes liberae', group: 'Нервы', color: 0xf2a73a, cut: 0xe2972a, cell: 0.1, smooth: 2, bounds: [[-8, -2.2, 0.6], [7.6, -0.3, 4]], field: free, text: 'Боль, температура, зуд — самые многочисленные рецепторы.' },
];
