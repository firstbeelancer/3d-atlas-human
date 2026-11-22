import { clamp, smooth } from './geometry';

/*
  Кончик указательного пальца в миллиметрах (вид модели до поворота сцены):
  x — вдоль пальца от средней фаланги (-14) к кончику, y — к тыльной стороне, z — вбок.

  Вся форма выводится из одного сечения пальца: кожа, ногтевая пластинка, валики и ложе
  берут высоту тыльной поверхности из sectionTop(), поэтому пластинка всегда лежит
  по изгибу пальца, а её края уходят в боковые валики.
*/

const bell = (x: number, c: number, w: number) => Math.exp(-(((x - c) / w) ** 2));
const spow = (v: number, p: number) => Math.sign(v) * Math.abs(v) ** p;

/*
  Пропорции сняты с фотографий указательного пальца взрослого (сверху, сбоку, под углом):
  ширина пальца около 15 мм почти постоянна до кончика, толщина около 11-12 мм;
  видимая часть ногтя от валика до гипонихия около 13 мм при ширине около 11 мм,
  свободный край около 2 мм; от складок над суставом до валика около 12 мм гладкой кожи;
  кончик в плане — округлая арка, подушечка снизу поднимается к кончику длинной дугой.
*/

/** Начало модели, начало закругления кончика и его длина до вершины. */
export const FING = { x0: -14, xc: 18.4, tipLen: 6.6, tipX: 25.0 };

/** Центр сечения по y. */
export const fingerCY = (_x: number): number => -1.0;
/** Полуширина пальца: почти постоянна, чуть шире над суставом. */
export const fingerHW = (x: number): number =>
  7.5 + 0.35 * bell(x, -3, 4) - 0.2 * smooth(2, 10, x) + 0.12 * smooth(10, 17, x);
/** Высота тыльной половины от центра: тыл почти прямой, лёгкий подъём над суставом. */
export const fingerRT = (x: number): number => 5.0 + 0.3 * bell(x, -3, 3.5) - 0.12 * smooth(12, 19, x);
/** Глубина ладонной половины: подушечка под ногтем выпуклая. */
export const fingerRB = (x: number): number => 5.3 + 1.0 * bell(x, 14.5, 6.0) - 0.2 * bell(x, -2.4, 1.2);
/** Показатель суперэллипса: тыл почти эллиптический, подушечка чуть полнее. */
export const SEC_P_TOP = 2.15;
export const SEC_P_BOT = 2.35;

/** Естественная тыльная поверхность пальца без ногтевого аппарата. */
export const sectionTop = (x: number, z: number): number => {
  const a = clamp(Math.abs(z) / fingerHW(x));
  return fingerCY(x) + fingerRT(x) * (1 - a ** SEC_P_TOP) ** (1 / SEC_P_TOP);
};
/** Естественная ладонная поверхность. */
export const sectionBottom = (x: number, z: number): number => {
  const a = clamp(Math.abs(z) / fingerHW(x));
  return fingerCY(x) - fingerRB(x) * (1 - a ** SEC_P_BOT) ** (1 / SEC_P_BOT);
};

/** Точка сечения по углу a (0 — тыл, PI — подушечка). */
export const sectionPoint = (x: number, a: number): { y: number; z: number } => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const p = c >= 0 ? SEC_P_TOP : SEC_P_BOT;
  return {
    y: fingerCY(x) + (c >= 0 ? fingerRT(x) : fingerRB(x)) * spow(c, 2 / p),
    z: fingerHW(x) * spow(s, 2 / p),
  };
};

/* ------------------------------ Ногтевая пластинка ------------------------------ */

export const nailPlate = {
  /** Корень под проксимальным валиком. */
  x0: 5.8,
  /** Конец свободного края по центру. */
  x1: 24.9,
  hw: 5.6,
  rootEnd: 10.1,
  lunulaEnd: 12.4,
  /** Онходермальная полоса: здесь пластинка отходит от ложа. */
  bodyEnd: 23.4,
  thick: 0.5,
};

/** Край проксимального валика: мягкая дуга, по бокам уходит дальше к кончику. */
export const proximalEdge = (z: number): number =>
  10.3 + 0.045 * z * z + 1.3 * Math.min(1.2, Math.abs(z) / nailPlate.hw) ** 6;
/** Линия отделения пластинки от ложа (гипонихий), выпуклая к кончику. */
export const hyponychiumEdge = (z: number): number => nailPlate.bodyEnd - 0.75 * (z / nailPlate.hw) ** 2;

/** Сдвиг сечений вдоль x: скругление корня, полумесяц лунулы и дуга свободного края. */
export const plateX = (x: number, across: number): number => {
  const root = 1.05 * (1 - smooth(nailPlate.x0, nailPlate.x0 + 3.8, x));
  const crescent = 0.95 * smooth(9.8, 12.4, x) * (1 - smooth(12.4, 17, x));
  const tip = 2.4 * smooth(19.5, nailPlate.x1, x);
  return x + (root - crescent) * across ** 2 - tip * Math.abs(across) ** 3.2;
};

/** Полуширина пластинки. */
export const plateHW = (x: number): number =>
  nailPlate.hw * (0.8 + 0.2 * smooth(nailPlate.x0, nailPlate.x0 + 5, x)) * (1 + 0.02 * smooth(11, 18, x) - 0.05 * smooth(21, nailPlate.x1, x));

/** Верх пластинки повторяет тыл пальца (с чуть меньшей поперечной кривизной) и слегка загнут у края. */
export const plateTop = (x: number, z: number): number => {
  const mid = sectionTop(x, 0);
  const drop = mid - sectionTop(x, z);
  const rootDip = 0.45 * (1 - smooth(nailPlate.x0, nailPlate.x0 + 4.8, x));
  const curl = 0.7 * smooth(20.5, nailPlate.x1 + 0.4, x);
  return mid + 0.06 - 0.86 * drop - rootDip - curl;
};
export const plateBottom = (x: number, z: number): number =>
  plateTop(x, z) - nailPlate.thick * (1 - 0.14 * (z / nailPlate.hw) ** 2);

/* ------------------------------ Тыльная кожа ------------------------------ */

/**
  Высота тыльной кожи с ногтевым аппаратом: проксимальный валик укрывает корень,
  под видимой пластинкой кожа образует ложе, по бокам поднимаются боковые валики.
*/
export const dorsalSkinY = (x: number, z: number): number => {
  const nat = sectionTop(x, z);
  const across = Math.abs(z);
  const edge = across - plateHW(x);
  // складки над дистальным межфаланговым суставом
  const knuckle = (0.22 * bell(x, -1.6 + 0.06 * z * z, 0.24) + 0.16 * bell(x, -2.8 + 0.05 * z * z, 0.28)
    + 0.1 * bell(x, -0.6 + 0.07 * z * z, 0.2)) * (1 - smooth(4.4, 7.0, across));
  // боковые валики: мягкий гребень сразу за краем пластинки, к кончику сходит на нет
  const rim = 0.36 * bell(edge, 0.32, 0.5) * smooth(nailPlate.x0 + 4, nailPlate.x0 + 6.5, x) * (1 - smooth(19, 23, x));
  const outer = nat + rim - knuckle;

  const lip = proximalEdge(z);
  const bed = plateBottom(x, z) - 0.07;
  // валик над корнем: у края около 0,35 мм над пластинкой, к суставу плавно сходит в обычную кожу
  const fold = plateTop(x, z) + 0.24 + 0.06 * bell(x, lip - 0.85, 0.75);
  const foldReach = smooth(nailPlate.x0 - 2.2, lip - 1.4, x);
  const foldH = Math.max(outer, outer + (fold - outer) * foldReach);
  const covered = outer + (foldH - outer) * (1 - smooth(-0.4, 1.5, edge));
  const visible = outer + (bed - outer) * (1 - smooth(-0.32, 0.22, edge));
  const skin = covered + (visible - covered) * smooth(lip - 0.5, lip + 0.06, x);
  // за гипонихием кожа кончика плавно уходит под свободный край
  const hypo = hyponychiumEdge(z);
  return skin + (tipSkinY(x, z) - skin) * smooth(hypo - 0.15, hypo + 0.45, x);
};

/** Тыльная кожа кончика под свободным краем: гладкий свод без ступеней по краям пластинки. */
export const tipSkinY = (x: number, z: number): number => {
  const nat = sectionTop(x, z);
  const below = plateBottom(x, z) - 0.55;
  const w = 1 - smooth(-0.6, 1.6, Math.abs(z) - plateHW(x));
  return nat + (Math.min(nat, below) - nat) * w;
};

/* ------------------------------ Кончик ------------------------------ */

/** Длина закругления кончика по углу сечения: подушечка поднимается к кончику чуть дольше тыла. */
export const tipLength = (a: number): number => 6.2 + 0.5 * (1 - Math.cos(a)) / 2;
/** Высота вершины кончика: около трети толщины пальца под ногтем. */
export const TIP_APEX_Y = 0.7;

/**
  Точка закругления кончика: кольцо в начале кончика сжимается к вершине по четверти эллипса.
  phi = 0 — начало кончика, phi = PI/2 — вершина. В плане получается округлая арка.
*/
export const tipPoint = (ring: { y: number; z: number }, a: number, phi: number): [number, number, number] => {
  const s = Math.sin(phi);
  const c = Math.cos(phi);
  const L = tipLength(a);
  const len = L + (FING.tipLen - L) * s ** 6;
  const cy0 = fingerCY(FING.xc);
  const cy = cy0 + (TIP_APEX_Y - cy0) * s * s;
  return [FING.xc + len * s, cy + (ring.y - cy0) * c, ring.z * c];
};

/**
  На кончике тыльная кожа под пластинкой остаётся ложем до гипонихия, а дальше и по бокам
  уходит вниз по своду кончика: края ногтя у кончика нависают над кожей, как на фото сверху.
*/
export const capDorsalY = (x: number, z: number, capY: number): number => {
  const bedY = dorsalSkinY(x, z);
  const hold = (1 - smooth(hyponychiumEdge(z) - 0.1, hyponychiumEdge(z) + 0.7, x))
    * (1 - smooth(-0.6, 0.45, Math.abs(z) - plateHW(x)));
  return capY + Math.max(0, bedY - capY) * hold;
};

/* ------------------------------ Проверка вложенности ------------------------------ */

/** Лежит ли точка внутри кожи пальца с запасом margin (для проверки внутренних тканей). */
export function insideFinger(x: number, y: number, z: number, margin = 0.05): boolean {
  if (x < FING.x0 - 1e-3) return false;
  if (x <= FING.xc) {
    const hw = fingerHW(x) - margin;
    if (Math.abs(z) >= hw) return false;
    if (y >= fingerCY(x)) return y <= dorsalSkinY(x, z) - margin;
    return y >= sectionBottom(x, z) + margin;
  }
  // кончик: ищем угол phi, при котором точка попадает на нужное x, и сравниваем радиус
  const cy0 = fingerCY(FING.xc);
  const ay = y - cy0;
  const a = Math.atan2(z / fingerHW(FING.xc), ay / (ay >= 0 ? fingerRT(FING.xc) : fingerRB(FING.xc)));
  let lo = 0;
  let hi = Math.PI / 2;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const ring = sectionPoint(FING.xc, a);
    if (tipPoint(ring, a, mid)[0] < x) lo = mid;
    else hi = mid;
  }
  const phi = (lo + hi) / 2;
  if (phi >= Math.PI / 2 - 1e-3) return false;
  const ring = sectionPoint(FING.xc, a);
  if (Math.cos(a) > 0) ring.y = Math.min(ring.y, dorsalSkinY(FING.xc, ring.z));
  const p = tipPoint(ring, a, phi);
  const cy = cy0 + (TIP_APEX_Y - cy0) * Math.sin(phi) ** 2;
  const rOut = Math.hypot(p[1] - cy, p[2]);
  const rIn = Math.hypot(y - cy, z);
  return rIn <= rOut - margin;
}
