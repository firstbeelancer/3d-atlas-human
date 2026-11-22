import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three';
import {
  BODY_LABEL_AT,
  BODY_PART_IDS,
  CUT_DEFAULT_T,
  FEEDBACK_FLOWS,
  GROUPS,
  PART_GROUPS,
  PART_IDS,
  PITUITARY_LABEL_AT,
  PITUITARY_PART_IDS,
  RECEPTOR_LABEL_AT,
  RECEPTOR_PART_IDS,
  SYSTEMIC_FLOWS,
  cutPosition,
  viewOf,
} from '../src/models/endocrine/anatomy';
import { buildEndocrineBodySet } from '../src/models/endocrine/glands';
import { buildPituitaryDiorama, PORTAL_FLOW_PATHS, TRACT_FLOW_PATHS } from '../src/models/endocrine/pituitaryScene';
import {
  buildReceptorDiorama,
  CAPILLARY_BLOOD_PATH,
  PEPTIDE_APPROACH_PATH,
  SECOND_MESSENGER_PATH,
  STEROID_CROSS_PATH,
} from '../src/models/endocrine/receptorScene';

function checkFiniteGeometry(g: BufferGeometry, label: string): number {
  const pos = g.attributes.position;
  expect(pos.count, label).toBeGreaterThan(20);
  for (let i = 0; i < pos.array.length; i++) {
    if (!Number.isFinite(pos.array[i])) throw new Error(`Non-finite vertex in ${label}`);
  }
  g.computeBoundingBox();
  expect(g.boundingBox?.isEmpty(), label).toBe(false);
  return pos.count;
}

describe('endocrine anatomy metadata', () => {
  it('has unique parts, complete label anchors, and monotonic cut planes', () => {
    expect(new Set(PART_IDS).size).toBe(PART_IDS.length);
    expect(PART_IDS.length).toBe(31);
    expect(Object.keys(GROUPS)).toHaveLength(9);

    for (const id of BODY_PART_IDS) expect(BODY_LABEL_AT[id], id).toBeDefined();
    for (const id of PITUITARY_PART_IDS) expect(PITUITARY_LABEL_AT[id], id).toBeDefined();
    for (const id of RECEPTOR_PART_IDS) expect(RECEPTOR_LABEL_AT[id], id).toBeDefined();

    for (const view of ['body', 'feedback', 'pituitary-axis', 'receptor'] as const) {
      for (const kind of ['side', 'fundus', 'coronal'] as const) {
        expect(cutPosition(view, kind, 1), `${view}-${kind}`).toBeGreaterThan(cutPosition(view, kind, 0));
        expect(Number.isFinite(cutPosition(view, kind, CUT_DEFAULT_T[kind]))).toBe(true);
      }
    }
  });

  it('routes active views cleanly from modes and selection', () => {
    expect(viewOf({}, null)).toBe('body');
    expect(viewOf({ feedback: true }, null)).toBe('feedback');
    expect(viewOf({ 'pituitary-axis': true }, null)).toBe('pituitary-axis');
    expect(viewOf({ receptor: true }, null)).toBe('receptor');
    expect(viewOf({}, 'portal-system')).toBe('pituitary-axis');
    expect(viewOf({}, 'membrane-receptor')).toBe('receptor');
    expect(viewOf({ receptor: true }, 'thyroid-lobes')).toBe('body');
    expect(viewOf({ feedback: true }, 'adrenal-cortex')).toBe('feedback');
  });

  it('keeps all hormone flow paths finite and bound to known parts', () => {
    const known = new Set(PART_IDS);
    for (const flow of [...SYSTEMIC_FLOWS, ...FEEDBACK_FLOWS]) {
      expect(known.has(flow.source), flow.id).toBe(true);
      expect(flow.points.length, flow.id).toBeGreaterThanOrEqual(3);
      for (const pt of flow.points) for (const c of pt) expect(Number.isFinite(c)).toBe(true);
    }
    for (const path of [
      ...PORTAL_FLOW_PATHS,
      ...TRACT_FLOW_PATHS,
      PEPTIDE_APPROACH_PATH,
      SECOND_MESSENGER_PATH,
      STEROID_CROSS_PATH,
      CAPILLARY_BLOOD_PATH,
    ]) {
      expect(path.length).toBeGreaterThanOrEqual(4);
      for (const pt of path) for (const c of pt) expect(Number.isFinite(c)).toBe(true);
    }
  });
});

describe('endocrine 3D geometry builders', () => {
  it('builds every body endocrine gland with anatomical relations and healthy vertex budget', () => {
    const set = buildEndocrineBodySet();
    const partsBuilt = new Set(Object.keys(set).map((k) => k.split('::')[0]));
    expect([...partsBuilt].sort()).toEqual([...BODY_PART_IDS].sort());

    let totalVerts = 0;
    for (const [k, g] of Object.entries(set)) {
      totalVerts += checkFiniteGeometry(g, k);
    }

    // проверяем ключевые анатомические отношения на собранных сетках:
    // 1. паращитовидные железы лежат позади перешейка щитовидной железы
    const paraZ = set['parathyroid-glands::parathyroid'].boundingBox!.max.z;
    const isthmusZ = set['thyroid-isthmus::thyroidIsthmus'].boundingBox!.min.z;
    expect(paraZ).toBeLessThan(isthmusZ + 0.06);

    // 2. мозговое вещество надпочечников вложено внутрь границ коры надпочечников
    const cortexBox = set['adrenal-cortex::adrenalCortex'].boundingBox!;
    const medullaBox = set['adrenal-medulla::adrenalMedulla'].boundingBox!;
    expect(medullaBox.min.x).toBeGreaterThan(cortexBox.min.x);
    expect(medullaBox.max.x).toBeLessThan(cortexBox.max.x);
    expect(medullaBox.min.y).toBeGreaterThan(cortexBox.min.y);
    expect(medullaBox.max.y).toBeLessThan(cortexBox.max.y);

    // 3. аденогипофиз расположен спереди от нейрогипофиза
    const adenoZ = set['adenohypophysis::adenohypophysis'].boundingBox!.max.z;
    const neuroZ = set['neurohypophysis::neurohypophysis'].boundingBox!.max.z;
    expect(adenoZ).toBeGreaterThan(neuroZ);

    // 4. эпифиз расположен позади гипоталамуса
    const pinealZ = set['pineal-gland::pineal'].boundingBox!.max.z;
    const hypoZ = set['hypothalamus::hypothalamus'].boundingBox!.max.z;
    expect(pinealZ).toBeLessThan(hypoZ);

    // 5. бюджет вершин удерживается в разумных рамках для плавного рендера
    expect(totalVerts).toBeGreaterThan(40_000);
    expect(totalVerts).toBeLessThan(650_000);

    for (const g of Object.values(set)) g.dispose();
  });

  it('builds the 10x hypothalamus-pituitary-pineal diorama cleanly', () => {
    const map = buildPituitaryDiorama();
    expect(Object.keys(map).sort()).toEqual([...PITUITARY_PART_IDS].sort());
    for (const [id, defs] of Object.entries(map)) {
      expect(defs.length, id).toBeGreaterThan(0);
      for (const d of defs) checkFiniteGeometry(d.geo, `pituitary:${id}:${d.mat}`);
    }
    // турецкое седло снизу под гипофизом, зрительный перекрёст спереди от воронки
    const adenoBox = map['adenohypophysis'][0].geo.boundingBox!;
    const sellaBox = map['sella-turcica'][0].geo.boundingBox!;
    const chiasmBox = map['optic-chiasm'][0].geo.boundingBox!;
    expect(sellaBox.min.y).toBeLessThan(adenoBox.min.y);
    expect(chiasmBox.max.z).toBeGreaterThan(adenoBox.max.z);
    for (const defs of Object.values(map)) for (const d of defs) d.geo.dispose();
  });

  it('builds the microscopic cell-and-receptor diorama in left-to-right secretion order', () => {
    const map = buildReceptorDiorama();
    expect(Object.keys(map).sort()).toEqual([...RECEPTOR_PART_IDS].sort());
    for (const [id, defs] of Object.entries(map)) {
      expect(defs.length, id).toBeGreaterThan(0);
      for (const d of defs) checkFiniteGeometry(d.geo, `receptor:${id}:${d.mat}`);
    }
    const cellX = map['endocrine-cell'][0].geo.boundingBox!.max.x;
    const capX = map['fenestrated-capillary'][0].geo.boundingBox!.max.x;
    const recX = map['membrane-receptor'][0].geo.boundingBox!.min.x;
    const nucX = map['nuclear-receptor'][0].geo.boundingBox!.min.x;
    expect(cellX).toBeLessThan(capX);
    expect(capX).toBeLessThan(recX);
    expect(recX).toBeLessThan(nucX);
    expect(PART_GROUPS['nuclear-receptor']).toBe('g-receptor');
    for (const defs of Object.values(map)) for (const d of defs) d.geo.dispose();
  });
});
