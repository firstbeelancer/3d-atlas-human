import { BufferGeometry, Color, Float32BufferAttribute, TorusGeometry, type Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  CILIARY,
  CILIARY_PROCESSES,
  LENS,
  POSTERIOR,
  WALL,
  aqueousProfile,
  dirAt,
  foveaPit,
  lensNucleus,
  offsetProfile,
  profileNormals,
  smooth01,
  vitreousProfile,
  type P2,
  type V3,
} from './anatomy';
import {
  MUSCLES,
  NERVE_SKIP,
  bandCap,
  createIris,
  latheGeometry,
  muscleSweep,
  nerveSweeps,
  nerveVessels,
  retinaDecal,
  retinalVesselGeometry,
  ringCapAtZ,
  rimGeometry,
  shellSurfaces,
  solidCap,
  stripCap,
  tubeCrossCaps,
  tubeLongitudinalCap,
  zonuleGeometry,
} from './geometry';
import { CUT_Z } from './parts';
import { FOVEA_DIR, DISC_DIR } from './anatomy';

interface ShellGeo {
  outer: BufferGeometry;
  inner: BufferGeometry;
  rim?: BufferGeometry;
  cap: BufferGeometry;
  ring: BufferGeometry | null;
}

function shell(outer: P2[], inner: P2[], skip?: [number, number], rim = true, innerOpts = {}): ShellGeo {
  const s = shellSurfaces(outer, inner);
  const innerGeo = Object.keys(innerOpts).length ? latheGeometry(inner, { ...innerOpts, flip: true }) : s.inner;
  return {
    outer: s.outer,
    inner: innerGeo,
    rim: rim ? rimGeometry(outer[outer.length - 1], inner[inner.length - 1]) : undefined,
    cap: bandCap(outer, inner, skip),
    ring: ringCapAtZ(outer, inner, CUT_Z),
  };
}

const unit = (x: number, y: number, z: number): V3 => {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
};

/** Все геометрии модели глаза. Строятся один раз при первом показе. */
export function buildEye() {
  const W = WALL;
  const sOuter = W.outer.slice(0, W.iLimbus + 1);
  const sInner = W.inner.slice(0, W.iLimbus + 1);
  const sclera = shell(sOuter, sInner, NERVE_SKIP, false);

  const cOuter = W.outer.slice(W.iLimbus);
  const cInner = W.inner.slice(W.iLimbus);
  const corneaSurf = shellSurfaces(cOuter, cInner);
  const cornea = {
    body: mergeGeometries([corneaSurf.outer, corneaSurf.inner], false),
    cap: bandCap(cOuter, cInner),
  };

  const i0 = W.phi.findIndex((p) => p >= 100);
  const conjProfile = offsetProfile(W.outer.slice(i0, W.iLimbus), W.normal.slice(i0, W.iLimbus), () => 0.07);
  const conjunctiva = latheGeometry(conjProfile, { segments: 160 });

  const l0 = W.iLimbus - 8;
  const limbusProfile = offsetProfile(W.outer.slice(l0, W.iLimbus + 8), W.normal.slice(l0, W.iLimbus + 8), () => 0.05);
  const limbus = latheGeometry(limbusProfile, { segments: 160 });

  const choroid = shell(POSTERIOR.choroid.outer, POSTERIOR.choroid.inner, NERVE_SKIP);
  const rpe = shell(POSTERIOR.rpe.outer, POSTERIOR.rpe.inner, NERVE_SKIP);

  // сетчатка: на внутренней поверхности — центральная ямка
  const retIn = POSTERIOR.retina.inner;
  const retNrm = profileNormals(retIn);
  const pitAt = (side: 1 | -1) => offsetProfile(retIn, retNrm, (i) => foveaPit(unit(side * retIn[i][0], 0, retIn[i][1])));
  const retinaSurf = shellSurfaces(POSTERIOR.retina.outer, retIn);
  const retina = {
    outer: retinaSurf.outer,
    inner: latheGeometry(retIn, { flip: true, displace: (x, y, z) => foveaPit(unit(x, y, z)) }),
    rim: rimGeometry(POSTERIOR.retina.outer[POSTERIOR.retina.outer.length - 1], retIn[retIn.length - 1]),
    cap: bandCap(POSTERIOR.retina.outer, pitAt, NERVE_SKIP),
    ring: ringCapAtZ(POSTERIOR.retina.outer, retIn, CUT_Z),
  };

  const vitProfile = vitreousProfile();
  const vitreous = {
    body: latheGeometry(vitProfile),
    cap: solidCap(vitProfile),
    disc: ringCapAtZ(retIn, null, CUT_Z),
  };

  const aqProfile = aqueousProfile();
  const aqueous = { body: latheGeometry(aqProfile, { flip: true }), cap: solidCap(aqProfile) };

  const lens = { body: latheGeometry(LENS.profile, { flip: true }), cap: solidCap(LENS.profile) };
  const nucProfile = lensNucleus();
  const nucleus = { body: latheGeometry(nucProfile, { flip: true }), cap: solidCap(nucProfile) };

  // ресничное тело
  const ciliaryMuscle = {
    ...(() => {
      const s = shellSurfaces(CILIARY.outer, CILIARY.muscleInner);
      return { outer: s.outer, inner: s.inner };
    })(),
    rim: rimGeometry(CILIARY.outer[CILIARY.count - 1], CILIARY.muscleInner[CILIARY.count - 1]),
    cap: bandCap(CILIARY.outer, CILIARY.muscleInner),
  };
  const tipsStartR = CILIARY.tips[0][0];
  const tipsEndR = CILIARY.tips[CILIARY.count - 1][0];
  const fOf = (r: number) => Math.min(1, Math.max(0, (tipsStartR - r) / (tipsStartR - tipsEndR)));
  const ridgeAmp = (f: number) => 0.34 * smooth01((f - 0.5) / 0.3);
  const processes = {
    body: latheGeometry(CILIARY.tips, {
      flip: true,
      segments: CILIARY_PROCESSES * 4,
      displace: (x, y) => {
        const th = Math.atan2(y, x);
        const ridge = Math.pow(0.5 + 0.5 * Math.cos(CILIARY_PROCESSES * th), 1.6);
        return -ridgeAmp(fOf(Math.hypot(x, y))) * ridge;
      },
    }),
    cap: bandCap(
      CILIARY.muscleInner,
      offsetProfile(CILIARY.tips, profileNormals(CILIARY.tips), (k) => -ridgeAmp(fOf(CILIARY.tips[k][0]))),
    ),
  };

  // цинновы связки
  const front = LENS.profile.findIndex(([r]) => r === LENS.rEq);
  const eqFront = LENS.profile.slice(0, front).reduce((best, p) => (Math.abs(p[0] - (LENS.rEq - 0.45)) < Math.abs(best[0] - (LENS.rEq - 0.45)) ? p : best));
  const eqBack = LENS.profile.slice(front + 1).reduce((best, p) => (Math.abs(p[0] - (LENS.rEq - 0.45)) < Math.abs(best[0] - (LENS.rEq - 0.45)) ? p : best));
  const at = (p: P2, th: number): V3 => [p[0] * Math.cos(th), p[0] * Math.sin(th), p[1]];
  const tipFront = CILIARY.tips[CILIARY.count - 4];
  const tipBack = CILIARY.tips[Math.round(CILIARY.count * 0.7)];
  const zonule = mergeGeometries(
    [
      zonuleGeometry((th) => at(tipFront, th), (th) => at(eqFront, th), 144, 0.03),
      zonuleGeometry((th) => at(tipBack, th), (th) => at(eqBack, th), 144, 0.03),
    ],
    false,
  );

  const iris = createIris();

  // сетчатка: пятна и сосуды
  const macula = retinaDecal(FOVEA_DIR, 2.6, 2.1, 0.02);
  const fovea = retinaDecal(FOVEA_DIR, 0.95, 0.95, 0.035);
  const disc = retinaDecal(DISC_DIR, 1.12, 1.25, 0.04);
  const arteries = retinalVesselGeometry(false);
  const veins = retinalVesselGeometry(true);

  // зрительный нерв
  const nerve = nerveSweeps();
  const nv = nerveVessels();
  const half = nerve.radial / 2;
  const nerveCaps = {
    core: tubeLongitudinalCap(nerve.core.rings, nerve.radial),
    csf: tubeLongitudinalCap(nerve.subarachnoid.rings, nerve.radial),
    duraPlus: stripCap(nerve.dura.rings, 0, nerve.subarachnoid.rings, 0),
    duraMinus: stripCap(nerve.dura.rings, half, nerve.subarachnoid.rings, half),
    artery: tubeLongitudinalCap(nv.artery.rings, nv.radial),
    vein: tubeLongitudinalCap(nv.vein.rings, nv.radial),
  };
  const duraCap = mergeGeometries([nerveCaps.duraPlus, nerveCaps.duraMinus], false);

  // мышцы: у сухожилия светлая окраска
  const tendon = new Color('#efe0cf');
  const belly = new Color('#b0382f');
  const tmp = new Color();
  const muscles = MUSCLES.map((m) => {
    const sw = muscleSweep(m);
    const uv = sw.geometry.getAttribute('uv');
    const col = new Float32Array(uv.count * 3);
    for (let i = 0; i < uv.count; i++) {
      const t = uv.getY(i);
      // у верхней косой сухожилие и в конце (блок), у остальных — у места прикрепления
      const tend = m.id === 'oblique-superior' ? smooth01((t - 0.6) / 0.08) : 1 - smooth01((t - 0.06) / 0.14);
      tmp.copy(belly).lerp(tendon, tend);
      col.set([tmp.r, tmp.g, tmp.b], i * 3);
    }
    sw.geometry.setAttribute('color', new Float32BufferAttribute(col, 3));
    const horizontal = m.id === 'rectus-medial' || m.id === 'rectus-lateral';
    return {
      id: m.id,
      geometry: sw.geometry,
      sideCap: horizontal ? tubeLongitudinalCap(sw.rings, 20) : tubeCrossCaps(sw.rings as Vector3[][], 'y', 0),
      fundusCap: tubeCrossCaps(sw.rings as Vector3[][], 'z', CUT_Z),
    };
  });

  const trochlea = new TorusGeometry(1.35, 0.42, 12, 32);

  const geometries: BufferGeometry[] = [];
  const collect = (o: unknown) => {
    if (o instanceof BufferGeometry) geometries.push(o);
    else if (o && typeof o === 'object') Object.values(o).forEach(collect);
  };

  const eye = {
    sclera,
    cornea,
    conjunctiva,
    limbus,
    choroid,
    rpe,
    retina,
    vitreous,
    aqueous,
    lens,
    nucleus,
    ciliaryMuscle,
    processes,
    zonule,
    iris,
    macula,
    fovea,
    disc,
    arteries,
    veins,
    nerve,
    nv,
    nerveCaps: { ...nerveCaps, dura: duraCap },
    muscles,
    trochlea,
    dirAt,
  };
  collect({ ...eye, nerve: undefined, nv: undefined, iris: undefined, dirAt: undefined });
  collect([nerve.core.geometry, nerve.subarachnoid.geometry, nerve.dura.geometry, nv.artery.geometry, nv.vein.geometry]);
  collect([iris.front, iris.back, iris.rim, iris.cap]);

  return { ...eye, dispose: () => geometries.forEach((g) => g.dispose()) };
}

export type EyeGeometry = ReturnType<typeof buildEye>;
