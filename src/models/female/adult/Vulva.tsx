import { useContext, useEffect, useMemo } from 'react';
import { BufferGeometry, DoubleSide, Vector3 } from 'three';
import { VAGINA_AXIS } from '../anatomy';
import { anchorOf, type MatKey, type MeshDef } from '../build';
import { EXTRA_FOCUS } from '../focus';
import { FemalePart, MetaContext, PartLabel } from '../FemalePart';
import { Mesher, blob, curveOf, fbm, mergeGeos, noise3, tubeSolid, type V3 } from '../geometry';
import { VULVA_IDS } from '../parts';

/*
  Наружные половые органы (вульва), вид спереди. Загружается только при включённом режиме 18+:
  модуль подключается динамическим импортом из модели и в основной сборке его нет.
*/

const skinBump = (a: number, b: number, c: number) => 0.035 * fbm(a * 3, b * 3, c * 3, 3);

function lips(): Record<string, MeshDef[]> {
  const out: Record<string, MeshDef[]> = {};
  out['mons-pubis'] = [{ g: blob([0, -5.2, 8.5], [2.1, 1.3, 0.8], { detail: 24, rot: [0.25, 0, 0], bump: skinBump }), m: 'skin', cap: 'fat' }];
  const major: MeshDef[] = [];
  const minor: MeshDef[] = [];
  const bulbs: MeshDef[] = [];
  const glands: MeshDef[] = [];
  for (const side of [-1, 1]) {
    major.push({ g: blob([2.3 * side, -11.0, 3.6], [0.8, 2.6, 1.0], { detail: 30, rot: [0.2, 0, -0.1 * side], bump: skinBump, seed: side }), m: 'skin', cap: 'skin' });
    minor.push({ g: blob([1.05 * side, -11.0, 3.0], [0.26, 1.9, 0.95], { detail: 26, rot: [0.15, 0, 0.08 * side], bump: (a, b, c) => 0.08 * noise3(a * 5, b * 5, c * 5) }), m: 'labiaMinora', cap: 'skin', prio: 1 });
    bulbs.push({ g: blob([1.15 * side, -11.0, 2.1], [0.38, 1.5, 0.5], { detail: 20, rot: [0, 0, 0.05 * side] }), m: 'erectile', cap: 'erectile', prio: 2 });
    glands.push({ g: blob([1.25 * side, -12.1, 2.1], [0.24, 0.22, 0.24], { detail: 12 }), m: 'gland', cap: 'gland', prio: 2 });
    glands.push({ g: blob([0.42 * side, -9.7, 3.75], [0.09, 0.2, 0.09], { detail: 8 }), m: 'gland', cap: 'gland', prio: 2 });
  }
  out['labia-majora'] = major;
  out['labia-minora'] = minor;
  out['vestibular-bulbs'] = bulbs;
  out['vestibular-glands'] = glands;

  // клитор: головка, тело и две ножки вдоль лобковых костей
  const crura: MeshDef[] = [{ g: blob([0, -9.0, 4.7], [0.24, 0.22, 0.24], { detail: 16 }), m: 'glans', cap: 'erectile', prio: 3 }];
  crura.push({ g: tubeSolid(curveOf([[0, -9.0, 4.6], [0, -8.4, 4.1], [0, -8.1, 3.4]]), () => 0.19, { rings: 10, around: 12 }), m: 'erectile', cap: 'erectile', prio: 3 });
  for (const side of [-1, 1]) {
    crura.push({ g: tubeSolid(curveOf([[0, -8.1, 3.4], [0.9 * side, -8.5, 2.9], [1.5 * side, -9.4, 2.3], [1.7 * side, -10.4, 1.9]]), (s) => 0.19 - 0.07 * s, { rings: 20, around: 12 }), m: 'erectile', cap: 'erectile', prio: 3 });
  }
  out.clitoris = crura;

  // преддверие: гладкая площадка между малыми губами с отверстиями уретры и влагалища
  const rows: Vector3[][] = [];
  for (let j = 0; j <= 10; j++) {
    const row: Vector3[] = [];
    for (let i = 0; i <= 14; i++) {
      const u = i / 14 - 0.5, v = j / 10;
      row.push(new Vector3(u * 1.9, -9.5 - v * 2.9, 3.35 - Math.abs(u) * 0.6 - v * 0.45 + 0.06 * Math.sin(v * 6)));
    }
    rows.push(row);
  }
  const meatus = blob([0, -9.8, 3.62], [0.17, 0.12, 0.1], { detail: 10 });
  out.vestibule = [
    { g: new Mesher().grid(rows, true, 2, 2, false).geometry(), m: 'skinInner' },
    { g: meatus, m: 'meatus' },
  ];

  // девственная плева (остатки): неполное кольцо у входа во влагалище
  const T = VAGINA_AXIS.getTangentAt(0).normalize();
  const C = VAGINA_AXIS.getPointAt(0).addScaledVector(T, 0.1);
  const U = new Vector3(1, 0, 0);
  const W = new Vector3().crossVectors(T, U);
  const ringRows: Vector3[][] = [];
  const mk = (rx: number, rz: number) => Array.from({ length: 49 }, (_, j) => {
    const th = (j / 48) * Math.PI * 2;
    const bite = 0.3 + 0.7 * Math.pow(Math.cos(th * 0.5 - 0.4), 2);
    return C.clone().addScaledVector(U, Math.cos(th) * rx * (1 + 0.04 * Math.sin(th * 7))).addScaledVector(W, Math.sin(th) * rz * (th > 4 ? bite : 1));
  });
  ringRows.push(mk(0.95, 0.5), mk(0.56, 0.28));
  out.hymen = [{ g: new Mesher().grid(ringRows, true, 2, 1).geometry(), m: 'hymen', cap: undefined }];

  out.perineum = [{ g: blob([0, -12.9, 0.1], [1.8, 0.55, 1.7], { detail: 18, bump: skinBump }), m: 'skin', cap: 'skin' }];
  return out;
}

function VMaterial({ kind }: { kind: MatKey }) {
  switch (kind) {
    case 'skin':
      return <meshPhysicalMaterial color="#e2a690" roughness={0.55} sheen={0.5} sheenColor="#ffd2c2" clearcoat={0.2} transparent opacity={0.8} />;
    case 'labiaMinora':
      return <meshPhysicalMaterial color="#d97d89" roughness={0.3} clearcoat={0.8} clearcoatRoughness={0.2} sheen={0.6} sheenColor="#ffb7bf" />;
    case 'skinInner':
      return <meshPhysicalMaterial color="#e08b90" roughness={0.28} clearcoat={0.9} clearcoatRoughness={0.16} side={DoubleSide} />;
    case 'meatus':
      return <meshStandardMaterial color="#9c4a52" roughness={0.4} />;
    case 'hymen':
      return <meshPhysicalMaterial color="#e8a2a6" roughness={0.4} clearcoat={0.6} side={DoubleSide} />;
    case 'erectile':
      return <meshPhysicalMaterial color="#c9606a" roughness={0.45} transparent opacity={0.6} depthWrite={false} />;
    case 'glans':
      return <meshPhysicalMaterial color="#d95f78" roughness={0.3} clearcoat={0.8} />;
    case 'gland':
      return <meshStandardMaterial color="#e6c15f" roughness={0.5} />;
    default:
      return <meshStandardMaterial color="#e8b69f" roughness={0.6} />;
  }
}

const FOCUS_DIR: V3 = [0.2, 0.35, 0.92];

export default function Vulva({ names }: { names: Record<string, string>; tex?: unknown }) {
  const G = useMemo(lips, []);
  const parent = useContext(MetaContext);
  const meta = useMemo(() => {
    const label = { ...parent.label };
    const spread = { ...parent.spread };
    for (const id of VULVA_IDS) {
      const a = anchorOf(G[id] ?? []);
      if (!a) continue;
      label[id] = a.at;
      spread[id] = [a.center[0] * 0.5, -1.6 + (a.center[1] + 11) * 0.3, 2.2];
      EXTRA_FOCUS[id] = { at: a.center, dir: FOCUS_DIR, dist: Math.min(22, Math.max(9, a.size * 2 + 6)) };
    }
    EXTRA_FOCUS['g-vulva'] = { at: [0, -10.6, 3.2], dir: FOCUS_DIR, dist: 22 };
    return { label, spread };
  }, [G, parent]);
  useEffect(
    () => () => {
      for (const defs of Object.values(G)) for (const d of defs) d.g.dispose();
    },
    [G],
  );
  void mergeGeos;
  void (null as unknown as BufferGeometry);
  return (
    <MetaContext.Provider value={meta}>
      {VULVA_IDS.map((id) => (
        <FemalePart key={id} id={id}>
          {(G[id] ?? []).map((d, i) => (
            <mesh key={i} geometry={d.g} userData={{ solid: d.cap, prio: d.prio, noPick: d.noPick }}>
              <VMaterial kind={d.m} />
            </mesh>
          ))}
          <PartLabel id={id} names={names} />
        </FemalePart>
      ))}
    </MetaContext.Provider>
  );
}
