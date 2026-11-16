import * as THREE from 'three';
import { fbm2D, voronoi2D } from './mathNoise';

export interface TissueTextureSet {
  skinSurfaceMap: THREE.CanvasTexture;
  skinSurfaceBump: THREE.CanvasTexture;
  skinSurfaceRoughness: THREE.CanvasTexture;
  corneumMap: THREE.CanvasTexture;
  corneumBump: THREE.CanvasTexture;
  granulosumMap: THREE.CanvasTexture;
  spinosumMap: THREE.CanvasTexture;
  spinosumBump: THREE.CanvasTexture;
  basaleMap: THREE.CanvasTexture;
  papillaryDermisMap: THREE.CanvasTexture;
  reticularDermisMap: THREE.CanvasTexture;
  dermisBump: THREE.CanvasTexture;
  sebaceousMap: THREE.CanvasTexture;
  sebaceousBump: THREE.CanvasTexture;
  muscleMap: THREE.CanvasTexture;
  sweatMap: THREE.CanvasTexture;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function finalizeTexture(
  canvas: HTMLCanvasElement,
  isSRGB: boolean,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = isSRGB ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

export function generateAllTissueTextures(): TissueTextureSet {
  // 1. SKIN SURFACE (512x512) — Voronoi sulci cutis + pores + subtle melanin/hemoglobin mottling
  const S = 512;
  const [surfC, surfCtx] = makeCanvas(S, S);
  const [surfBumpC, surfBumpCtx] = makeCanvas(S, S);
  const [surfRoughC, surfRoughCtx] = makeCanvas(S, S);

  const surfImg = surfCtx.createImageData(S, S);
  const bumpImg = surfBumpCtx.createImageData(S, S);
  const roughImg = surfRoughCtx.createImageData(S, S);

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;

      // Primary & secondary Langer skin furrows (sulci cutis)
      const vor1 = voronoi2D(u * 18.0, v * 18.0, 0.85);
      const vor2 = voronoi2D(u * 38.0 + 5.2, v * 38.0 + 3.7, 0.8);
      const sulcus1 = Math.exp(-vor1.edge * 13.0); // 1 inside primary furrow
      const sulcus2 = Math.exp(-vor2.edge * 15.0) * 0.45; // secondary fine furrow
      const poreSpot = vor1.f1 < 0.085 ? Math.pow(1 - vor1.f1 / 0.085, 2) : 0;

      const mottling = fbm2D(u * 6.5, v * 6.5, 4);
      const fineGrain = fbm2D(u * 48.0, v * 48.0, 3);
      const vascularWarmth = fbm2D(u * 9.0 + 11.3, v * 9.0 + 4.1, 3);

      const furrowDepth = Math.min(1, sulcus1 * 0.78 + sulcus2 + poreSpot * 0.65);

      // Natural living skin base color (warm beige-rose with subtle vascular & melanin variation)
      const r =
        228 +
        mottling * 14 +
        vascularWarmth * 11 -
        furrowDepth * 24 +
        fineGrain * 5;
      const g =
        172 +
        mottling * 12 -
        vascularWarmth * 5 -
        furrowDepth * 22 +
        fineGrain * 4;
      const b =
        142 +
        mottling * 10 -
        vascularWarmth * 6 -
        furrowDepth * 19 +
        fineGrain * 4;

      const idx = (y * S + x) * 4;
      surfImg.data[idx] = clampByte(r);
      surfImg.data[idx + 1] = clampByte(g);
      surfImg.data[idx + 2] = clampByte(b);
      surfImg.data[idx + 3] = 255;

      // Bump height: plateaus high, sulci & pores recessed
      const bumpVal = 210 - furrowDepth * 145 + fineGrain * 22;
      const bv = clampByte(bumpVal);
      bumpImg.data[idx] = bv;
      bumpImg.data[idx + 1] = bv;
      bumpImg.data[idx + 2] = bv;
      bumpImg.data[idx + 3] = 255;

      // Roughness: sulci slightly moister/shinier sebum film, squame plateaus slightly rougher
      const roughVal = 138 + (1 - furrowDepth) * 42 + fineGrain * 18;
      const rv = clampByte(roughVal);
      roughImg.data[idx] = rv;
      roughImg.data[idx + 1] = rv;
      roughImg.data[idx + 2] = rv;
      roughImg.data[idx + 3] = 255;
    }
  }
  surfCtx.putImageData(surfImg, 0, 0);
  surfBumpCtx.putImageData(bumpImg, 0, 0);
  surfRoughCtx.putImageData(roughImg, 0, 0);

  // 2. STRATUM CORNEUM (256x256) — Laminated horizontal flaky keratin squames
  const H = 256;
  const [cornC, cornCtx] = makeCanvas(H, H);
  const [cornBumpC, cornBumpCtx] = makeCanvas(H, H);
  const cornImg = cornCtx.createImageData(H, H);
  const cornBumpImg = cornBumpCtx.createImageData(H, H);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < H; x++) {
      const u = x / H;
      const v = y / H;
      const wave = fbm2D(u * 10, v * 6, 3) * 0.25;
      const lamella = Math.sin((v * 26.0 + wave * 6.0) * Math.PI * 2) * 0.5 + 0.5;
      const flake = fbm2D(u * 28, v * 52, 3);
      const idx = (y * H + x) * 4;

      cornImg.data[idx] = clampByte(218 + lamella * 22 + flake * 14);
      cornImg.data[idx + 1] = clampByte(154 + lamella * 20 + flake * 12);
      cornImg.data[idx + 2] = clampByte(124 + lamella * 18 + flake * 10);
      cornImg.data[idx + 3] = 255;

      const cb = clampByte(115 + lamella * 110 + flake * 25);
      cornBumpImg.data[idx] = cb;
      cornBumpImg.data[idx + 1] = cb;
      cornBumpImg.data[idx + 2] = cb;
      cornBumpImg.data[idx + 3] = 255;
    }
  }
  cornCtx.putImageData(cornImg, 0, 0);
  cornBumpCtx.putImageData(cornBumpImg, 0, 0);

  // 3. STRATUM GRANULOSUM (256x256) — Flattened diamond cells + basophilic keratohyalin granules
  const [granC, granCtx] = makeCanvas(H, H);
  const granImg = granCtx.createImageData(H, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < H; x++) {
      const u = x / H;
      const v = y / H;
      const cell = voronoi2D(u * 16.0, v * 36.0, 0.72);
      const stipple = fbm2D(u * 75.0, v * 75.0, 2);
      const granule = stipple > 0.16 ? 1 : 0;
      const border = Math.exp(-cell.edge * 10.0);
      const idx = (y * H + x) * 4;

      granImg.data[idx] = clampByte(186 - granule * 42 + border * 18);
      granImg.data[idx + 1] = clampByte(102 - granule * 34 + border * 16);
      granImg.data[idx + 2] = clampByte(122 - granule * 18 + border * 18);
      granImg.data[idx + 3] = 255;
    }
  }
  granCtx.putImageData(granImg, 0, 0);

  // 4. STRATUM SPINOSUM (256x256) — Polygonal "prickle" keratinocytes + intercellular bridges + nuclei
  const [spinC, spinCtx] = makeCanvas(H, H);
  const [spinBumpC, spinBumpCtx] = makeCanvas(H, H);
  const spinImg = spinCtx.createImageData(H, H);
  const spinBumpImg = spinBumpCtx.createImageData(H, H);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < H; x++) {
      const u = x / H;
      const v = y / H;
      const cell = voronoi2D(u * 22.0, v * 22.0, 0.8);
      const bridge = Math.exp(-cell.edge * 14.0);
      const nucleus = cell.f1 < 0.22 ? Math.pow(1 - cell.f1 / 0.22, 1.5) : 0;
      const prickle = Math.sin((u + v) * 220) * 0.5 + 0.5;
      const idx = (y * H + x) * 4;

      spinImg.data[idx] = clampByte(218 - nucleus * 48 + bridge * (18 + prickle * 10));
      spinImg.data[idx + 1] = clampByte(128 - nucleus * 44 + bridge * 22);
      spinImg.data[idx + 2] = clampByte(136 - nucleus * 26 + bridge * 20);
      spinImg.data[idx + 3] = 255;

      const sb = clampByte(175 - bridge * 95 + nucleus * 45);
      spinBumpImg.data[idx] = sb;
      spinBumpImg.data[idx + 1] = sb;
      spinBumpImg.data[idx + 2] = sb;
      spinBumpImg.data[idx + 3] = 255;
    }
  }
  spinCtx.putImageData(spinImg, 0, 0);
  spinBumpCtx.putImageData(spinBumpImg, 0, 0);

  // 5. STRATUM BASALE (256x256) — Columnar palisade stem keratinocytes + melanin pigment caps
  const [basC, basCtx] = makeCanvas(H, H);
  const basImg = basCtx.createImageData(H, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < H; x++) {
      const u = x / H;
      const v = y / H;
      const cell = voronoi2D(u * 34.0, v * 16.0, 0.65);
      const border = Math.exp(-cell.edge * 12.0);
      const nucleus = cell.f1 < 0.26 ? 1 - cell.f1 / 0.26 : 0;
      const melanin = fbm2D(u * 20.0 + 3.1, v * 20.0, 3) > 0.22 ? 1 : 0;
      const idx = (y * H + x) * 4;

      basImg.data[idx] = clampByte(172 - nucleus * 38 - melanin * 28 + border * 18);
      basImg.data[idx + 1] = clampByte(86 - nucleus * 30 - melanin * 26 + border * 14);
      basImg.data[idx + 2] = clampByte(108 - nucleus * 18 - melanin * 28 + border * 14);
      basImg.data[idx + 3] = 255;
    }
  }
  basCtx.putImageData(basImg, 0, 0);

  // 6. PAPILLARY & RETICULAR DERMIS (384x384) — Interwoven wavy collagen bundles & elastin threads
  const D = 384;
  const [papC, papCtx] = makeCanvas(D, D);
  const [retC, retCtx] = makeCanvas(D, D);
  const [dermBumpC, dermBumpCtx] = makeCanvas(D, D);
  const papImg = papCtx.createImageData(D, D);
  const retImg = retCtx.createImageData(D, D);
  const dermBumpImg = dermBumpCtx.createImageData(D, D);

  for (let y = 0; y < D; y++) {
    for (let x = 0; x < D; x++) {
      const u = x / D;
      const v = y / D;

      const warpX = fbm2D(u * 7.0, v * 7.0, 3) * 0.35;
      const warpY = fbm2D(u * 7.0 + 9.2, v * 7.0 + 4.4, 3) * 0.35;

      // Cross-weaving collagen bundle waves
      const fiberA = Math.sin(((u + warpX) * 14.0 + (v + warpY) * 4.5) * Math.PI * 2) * 0.5 + 0.5;
      const fiberB = Math.sin(((u - warpY) * 9.0 - (v + warpX) * 11.0) * Math.PI * 2) * 0.5 + 0.5;
      const fineFibril = fbm2D(u * 42.0, v * 28.0, 3);
      const elastinHint = Math.pow(Math.max(0, Math.sin((u * 23 - v * 19 + warpX * 8) * Math.PI)), 12);

      const weave = fiberA * 0.55 + fiberB * 0.45;
      const idx = (y * D + x) * 4;

      // Papillary dermis: looser, lighter warm rose-pink with fine fibrils
      papImg.data[idx] = clampByte(236 - weave * 18 + fineFibril * 14);
      papImg.data[idx + 1] = clampByte(154 - weave * 20 + fineFibril * 12 + elastinHint * 18);
      papImg.data[idx + 2] = clampByte(156 - weave * 16 + fineFibril * 12);
      papImg.data[idx + 3] = 255;

      // Reticular dermis: denser, coarse collagen bundles + golden elastin flecks
      retImg.data[idx] = clampByte(222 - weave * 32 + fineFibril * 16 + elastinHint * 24);
      retImg.data[idx + 1] = clampByte(118 - weave * 28 + fineFibril * 12 + elastinHint * 22);
      retImg.data[idx + 2] = clampByte(124 - weave * 24 + fineFibril * 12 - elastinHint * 14);
      retImg.data[idx + 3] = 255;

      const db = clampByte(95 + weave * 125 + fineFibril * 30);
      dermBumpImg.data[idx] = db;
      dermBumpImg.data[idx + 1] = db;
      dermBumpImg.data[idx + 2] = db;
      dermBumpImg.data[idx + 3] = 255;
    }
  }
  papCtx.putImageData(papImg, 0, 0);
  retCtx.putImageData(retImg, 0, 0);
  dermBumpCtx.putImageData(dermBumpImg, 0, 0);

  // 7. SEBACEOUS GLAND (256x256) — Foamy lipid-laden holocrine sebocytes
  const [sebC, sebCtx] = makeCanvas(H, H);
  const [sebBumpC, sebBumpCtx] = makeCanvas(H, H);
  const sebImg = sebCtx.createImageData(H, H);
  const sebBumpImg = sebBumpCtx.createImageData(H, H);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < H; x++) {
      const u = x / H;
      const v = y / H;
      const cell = voronoi2D(u * 18.0, v * 18.0, 0.85);
      const wall = Math.exp(-cell.edge * 10.0);
      const droplet = 1 - Math.min(1, cell.f1 * 1.6);
      const idx = (y * H + x) * 4;

      sebImg.data[idx] = clampByte(238 - wall * 24 + droplet * 12);
      sebImg.data[idx + 1] = clampByte(212 - wall * 28 + droplet * 14);
      sebImg.data[idx + 2] = clampByte(162 - wall * 30 + droplet * 12);
      sebImg.data[idx + 3] = 255;

      const b = clampByte(120 + droplet * 115 - wall * 40);
      sebBumpImg.data[idx] = b;
      sebBumpImg.data[idx + 1] = b;
      sebBumpImg.data[idx + 2] = b;
      sebBumpImg.data[idx + 3] = 255;
    }
  }
  sebCtx.putImageData(sebImg, 0, 0);
  sebBumpCtx.putImageData(sebBumpImg, 0, 0);

  // 8. SMOOTH MUSCLE (arrector pili) & SWEAT EPITHELIUM
  const [musC, musCtx] = makeCanvas(H, H);
  const [swtC, swtCtx] = makeCanvas(H, H);
  const musImg = musCtx.createImageData(H, H);
  const swtImg = swtCtx.createImageData(H, H);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < H; x++) {
      const u = x / H;
      const v = y / H;
      const idx = (y * H + x) * 4;

      // Longitudinal fusiform smooth muscle fascicles
      const stria = Math.sin((v * 28.0 + fbm2D(u * 6, v * 12, 2) * 1.4) * Math.PI * 2) * 0.5 + 0.5;
      musImg.data[idx] = clampByte(196 + stria * 28);
      musImg.data[idx + 1] = clampByte(76 + stria * 22);
      musImg.data[idx + 2] = clampByte(82 + stria * 20);
      musImg.data[idx + 3] = 255;

      // Cuboidal/myoepithelial sweat tubule mosaic
      const scell = voronoi2D(u * 24.0, v * 16.0, 0.75);
      const sEdge = Math.exp(-scell.edge * 11.0);
      swtImg.data[idx] = clampByte(105 + (1 - sEdge) * 28);
      swtImg.data[idx + 1] = clampByte(182 + (1 - sEdge) * 24);
      swtImg.data[idx + 2] = clampByte(168 + (1 - sEdge) * 24);
      swtImg.data[idx + 3] = 255;
    }
  }
  musCtx.putImageData(musImg, 0, 0);
  swtCtx.putImageData(swtImg, 0, 0);

  return {
    skinSurfaceMap: finalizeTexture(surfC, true, 2.2, 2.2),
    skinSurfaceBump: finalizeTexture(surfBumpC, false, 2.2, 2.2),
    skinSurfaceRoughness: finalizeTexture(surfRoughC, false, 2.2, 2.2),
    corneumMap: finalizeTexture(cornC, true, 3.0, 1.0),
    corneumBump: finalizeTexture(cornBumpC, false, 3.0, 1.0),
    granulosumMap: finalizeTexture(granC, true, 3.0, 1.0),
    spinosumMap: finalizeTexture(spinC, true, 3.0, 1.2),
    spinosumBump: finalizeTexture(spinBumpC, false, 3.0, 1.2),
    basaleMap: finalizeTexture(basC, true, 3.0, 1.0),
    papillaryDermisMap: finalizeTexture(papC, true, 2.5, 1.5),
    reticularDermisMap: finalizeTexture(retC, true, 2.2, 2.0),
    dermisBump: finalizeTexture(dermBumpC, false, 2.4, 2.0),
    sebaceousMap: finalizeTexture(sebC, true, 2.0, 2.0),
    sebaceousBump: finalizeTexture(sebBumpC, false, 2.0, 2.0),
    muscleMap: finalizeTexture(musC, true, 3.0, 1.5),
    sweatMap: finalizeTexture(swtC, true, 4.0, 1.0)
  };
}
