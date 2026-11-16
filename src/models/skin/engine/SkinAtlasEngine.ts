import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  ANATOMY_STRUCTURES,
  AnatomyStructureId,
  CameraPresetId,
  MicroTourPreset,
  STRUCTURE_MAP,
  ViewModeId
} from '../../../content/ru/skin-atlas';
import { buildSkinAppendages } from './builders/appendagesBuilder';
import { buildEpidermisAndDermis } from './builders/epidermisDermisBuilder';
import { buildHypodermis } from './builders/hypodermisBuilder';
import { buildNeurovascularSystems } from './builders/neurovascularBuilder';
import { generateAllTissueTextures, TissueTextureSet } from './proceduralTextures';
import {
  buildStratumSliceCapGeometry,
  SliceBoundsState,
  StratumLayerKey
} from './skinHeightfield';

export interface LayerControlState {
  visible: boolean;
  opacity: number;
}

export interface PinScreenPosition {
  id: AnatomyStructureId;
  name: string;
  color: string;
  x: number;
  y: number;
  visible: boolean;
}

export interface EngineCallbacks {
  onSelectStructure: (id: AnatomyStructureId | null) => void;
  onHoverStructure: (id: AnatomyStructureId | null) => void;
  onPinsUpdate: (pins: PinScreenPosition[]) => void;
}

const STRATUM_KEY_TO_STRUCTURE: Record<StratumLayerKey, AnatomyStructureId> = {
  corneum: 'stratum_corneum',
  granulosum: 'stratum_granulosum',
  spinosum: 'stratum_spinosum',
  basale: 'stratum_basale',
  papillary: 'papillary_dermis',
  reticular: 'reticular_dermis'
};

const OVERVIEW_TARGET = new THREE.Vector3(0, -1.55, 0);
const OVERVIEW_CAMERA = new THREE.Vector3(14.5, 9.35, 16.5);
const DEFAULT_SLICE: SliceBoundsState = {
  xEnabled: false, xPos: 0.2, xInvert: false,
  yEnabled: false, yPos: 1.95, yInvert: false,
  zEnabled: false, zPos: 0.4, zInvert: false,
};

export class SkinAtlasEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private pmremGenerator: THREE.PMREMGenerator;
  private envRT: THREE.WebGLRenderTarget;
  private textures: TissueTextureSet;

  private rootSpecimenGroup = new THREE.Group();
  private structureGroups = new Map<AnatomyStructureId, THREE.Group>();
  private stratumMaterials = new Map<StratumLayerKey, THREE.MeshPhysicalMaterial>();
  private sliceCapGroup = new THREE.Group();
  private sliceCapMeshes = new Map<StratumLayerKey, THREE.Mesh>();
  private sliceGuideGroup = new THREE.Group();
  private groundShadowMesh: THREE.Mesh;

  // Hardware WebGL clipping planes [X, Y, Z]
  private planeX = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 999);
  private planeY = new THREE.Plane(new THREE.Vector3(0, -1, 0), 999);
  private planeZ = new THREE.Plane(new THREE.Vector3(0, 0, -1), 999);
  private clippingPlanes: THREE.Plane[];

  // Interactive states
  private layerStates = new Map<AnatomyStructureId, LayerControlState>();
  private isolatedIds: Set<AnatomyStructureId> | null = null;
  private selectedIds = new Set<AnatomyStructureId>();
  private hoveredId: AnatomyStructureId | null = null;

  private targetExploded = 0;
  private currentExploded = 0;
  private peelAmount = 0; // 0 = intact, 1 = fully peeled down to deep structures
  private showPins = false;
  private showSliceGuides = true;

  private sliceState = { ...DEFAULT_SLICE };
  private sliceCapsDirty = false;

  // Smooth camera flight animation
  private camAnim: {
    active: boolean;
    startTime: number;
    duration: number;
    fromPos: THREE.Vector3;
    toPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
  } = {
    active: false,
    startTime: 0,
    duration: 750,
    fromPos: new THREE.Vector3(),
    toPos: new THREE.Vector3(),
    fromTarget: new THREE.Vector3(),
    toTarget: new THREE.Vector3()
  };

  // Raycasting & pointer tracking
  private raycaster = new THREE.Raycaster();
  private pointerNDC = new THREE.Vector2();
  private pointerDownPos = new THREE.Vector2();
  private isPointerDown = false;
  private rafId = 0;
  private disposed = false;
  private resizeObserver: ResizeObserver;
  private intersectionObserver?: IntersectionObserver;
  private inView = true;
  private events = new AbortController();

  constructor(container: HTMLElement, callbacks: EngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.clippingPlanes = [this.planeX, this.planeY, this.planeZ];

    // 1. Initialize Renderer
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.localClippingEnabled = true;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(this.renderer.domElement);

    // 2. Scene & Studio Environment
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf1f5f9);

    this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.envRT = this.pmremGenerator.fromScene(roomEnv, 0.04);
    roomEnv.dispose();
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.52;

    // 3. Camera & OrbitControls (initial 3/4 medical atlas showcase angle!)
    this.camera = new THREE.PerspectiveCamera(38, width / height, 0.05, 120);
    this.camera.position.copy(OVERVIEW_CAMERA);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(OVERVIEW_TARGET);
    this.camera.position.sub(this.controls.target).multiplyScalar(this.widthFit()).add(this.controls.target);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.068;
    this.controls.rotateSpeed = 0.78;
    this.controls.zoomSpeed = 0.95;
    this.controls.panSpeed = 0.8;
    this.controls.minDistance = 1.25;
    this.controls.maxDistance = 46;
    this.controls.update();

    // Cancel automatic camera flight if user manually grabs camera
    this.controls.addEventListener('start', () => {
      this.camAnim.active = false;
    });

    // 4. Studio Multi-Point Lighting
    this.setupStudioLighting();

    // 5. Soft Ground Contact Shadow Plane
    this.groundShadowMesh = this.createContactShadowDisc();
    this.scene.add(this.groundShadowMesh);

    // 6. Generate Procedural Textures & All 3D Anatomical Geometries
    this.textures = generateAllTissueTextures();
    this.buildCompleteSpecimen();

    this.scene.add(this.rootSpecimenGroup);
    this.scene.add(this.sliceCapGroup);
    this.scene.add(this.sliceGuideGroup);
    this.buildSliceGuideFrames();

    // 7. Initialize Default Layer States
    for (const s of ANATOMY_STRUCTURES) {
      let defaultOpacity = 1.0;
      if (s.id === 'papillary_dermis') defaultOpacity = 0.66;
      if (s.id === 'reticular_dermis') defaultOpacity = 0.48;
      if (s.id === 'follicle_sheaths') defaultOpacity = 0.74;
      this.layerStates.set(s.id, {
        visible: true,
        opacity: defaultOpacity
      });
    }
    this.syncAllMaterialsAndVisibility();

    // 8. Bind Events & Start Render Loop
    this.bindDOMEvents();
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);
    if (typeof IntersectionObserver !== 'undefined') {
      this.intersectionObserver = new IntersectionObserver(([entry]) => {
        this.inView = entry.isIntersecting;
        this.requestRender();
      }, { rootMargin: '100px' });
      this.intersectionObserver.observe(container);
    }
    this.controls.addEventListener('change', this.requestRender);

    this.requestRender();
  }

  public setTheme(dark: boolean): void {
    (this.scene.background as THREE.Color).setHex(dark ? 0x191b22 : 0xf1f5f9);
    this.requestRender();
  }

  private widthFit(): number {
    return Math.min(2.2, Math.max(1, 0.95 / this.camera.aspect));
  }

  private setupStudioLighting(): void {
    const hemi = new THREE.HemisphereLight(0xffffff, 0xe2d5c8, 0.68);
    this.scene.add(hemi);

    // Main warm surgical studio key light with soft shadows
    const keyLight = new THREE.DirectionalLight(0xfffaf2, 1.55);
    keyLight.position.set(11.5, 16.5, 12.5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 42;
    const d = 9.5;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0004;
    keyLight.shadow.normalBias = 0.022;
    this.scene.add(keyLight);

    // Cool scientific fill light from opposite side
    const fillLight = new THREE.DirectionalLight(0xe4effa, 0.72);
    fillLight.position.set(-13, 8, -11);
    this.scene.add(fillLight);

    // Warm rim/under-bounce light illuminating hypodermis adipocytes & deep hair bulbs
    const bounceLight = new THREE.DirectionalLight(0xffebd6, 0.42);
    bounceLight.position.set(2, -12, 7);
    this.scene.add(bounceLight);
  }

  private createContactShadowDisc(): THREE.Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(128, 128, 18, 128, 128, 124);
    grad.addColorStop(0, 'rgba(15, 23, 42, 0.20)');
    grad.addColorStop(0.55, 'rgba(15, 23, 42, 0.09)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    const tex = new THREE.CanvasTexture(canvas);
    const geom = new THREE.PlaneGeometry(16.5, 16.5);
    geom.rotateX(-Math.PI * 0.5);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.y = -6.85;
    return mesh;
  }

  private buildCompleteSpecimen(): void {
    // 1. Epidermis (4 layers + outer surface) & Dermis (2 layers + 3D collagen/elastin network)
    const epiDerm = buildEpidermisAndDermis(this.textures, this.clippingPlanes);
    epiDerm.groups.forEach((grp, id) => {
      this.structureGroups.set(id, grp);
      this.rootSpecimenGroup.add(grp);
    });
    epiDerm.stratumMaterials.forEach((mat, key) => {
      this.stratumMaterials.set(key, mat);
    });

    // 2. Hypodermis (460+ organic adipocytes in lobules + fibrous retinacula cutis septa)
    const hypo = buildHypodermis(this.textures, this.clippingPlanes);
    hypo.forEach((grp, id) => {
      this.structureGroups.set(id, grp);
      this.rootSpecimenGroup.add(grp);
    });

    // 3. Appendages (Terminal follicles in Anagen/Catagen/Telogen, sebaceous, arrector pili, vellus, eccrine sweat)
    const app = buildSkinAppendages(this.textures, this.clippingPlanes);
    app.forEach((grp, id) => {
      this.structureGroups.set(id, grp);
      this.rootSpecimenGroup.add(grp);
    });

    // 4. Vascular & Neural Systems (Arteries, veins, capillary loops, nerve trunks, Meissner, Pacinian, Merkel, free, follicular)
    const neuroVasc = buildNeurovascularSystems(this.clippingPlanes);
    neuroVasc.forEach((grp, id) => {
      this.structureGroups.set(id, grp);
      this.rootSpecimenGroup.add(grp);
    });
  }

  private buildSliceGuideFrames(): void {
    const makeFrame = (w: number, h: number, color: number): THREE.LineSegments => {
      const planeG = new THREE.PlaneGeometry(w, h);
      const edges = new THREE.EdgesGeometry(planeG);
      planeG.dispose();
      const mat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.55
      });
      return new THREE.LineSegments(edges, mat);
    };

    const guideX = makeFrame(10.2, 10.6, 0xe11d48); // X-axis frame (rose)
    guideX.rotation.y = Math.PI * 0.5;
    guideX.position.set(0, -1.5, 0);
    guideX.name = 'guideX';

    const guideY = makeFrame(10.2, 10.2, 0x059669); // Y-axis frame (emerald)
    guideY.rotation.x = Math.PI * 0.5;
    guideY.name = 'guideY';

    const guideZ = makeFrame(10.2, 10.6, 0x0284c7); // Z-axis frame (sky)
    guideZ.position.set(0, -1.5, 0);
    guideZ.name = 'guideZ';

    this.sliceGuideGroup.add(guideX, guideY, guideZ);
    this.updateClippingPlanesAndGuides();
  }

  private updateClippingPlanesAndGuides(): void {
    const s = this.sliceState;

    // Plane X: keeps points where n.dot(p) + constant >= 0
    if (s.xEnabled) {
      if (!s.xInvert) {
        // Keep x <= xPos -> -x + xPos >= 0
        this.planeX.normal.set(-1, 0, 0);
        this.planeX.constant = s.xPos;
      } else {
        // Keep x >= xPos -> x - xPos >= 0
        this.planeX.normal.set(1, 0, 0);
        this.planeX.constant = -s.xPos;
      }
    } else {
      this.planeX.normal.set(-1, 0, 0);
      this.planeX.constant = 999;
    }

    // Plane Y
    if (s.yEnabled) {
      if (!s.yInvert) {
        // Keep y <= yPos
        this.planeY.normal.set(0, -1, 0);
        this.planeY.constant = s.yPos;
      } else {
        // Keep y >= yPos
        this.planeY.normal.set(0, 1, 0);
        this.planeY.constant = -s.yPos;
      }
    } else {
      this.planeY.normal.set(0, -1, 0);
      this.planeY.constant = 999;
    }

    // Plane Z
    if (s.zEnabled) {
      if (!s.zInvert) {
        // Keep z <= zPos
        this.planeZ.normal.set(0, 0, -1);
        this.planeZ.constant = s.zPos;
      } else {
        // Keep z >= zPos
        this.planeZ.normal.set(0, 0, 1);
        this.planeZ.constant = -s.zPos;
      }
    } else {
      this.planeZ.normal.set(0, 0, -1);
      this.planeZ.constant = 999;
    }

    // Update wireframe slice guides
    const gx = this.sliceGuideGroup.getObjectByName('guideX')!;
    const gy = this.sliceGuideGroup.getObjectByName('guideY')!;
    const gz = this.sliceGuideGroup.getObjectByName('guideZ')!;

    gx.visible = this.showSliceGuides && s.xEnabled;
    gx.position.x = s.xPos;

    gy.visible = this.showSliceGuides && s.yEnabled;
    gy.position.y = s.yPos;

    gz.visible = this.showSliceGuides && s.zEnabled;
    gz.position.z = s.zPos;

    this.sliceCapsDirty = true;
    this.requestRender();
  }

  private rebuildAnalyticalSliceCaps(): void {
    // Clear existing cap meshes
    this.sliceCapMeshes.forEach((mesh) => {
      mesh.geometry.dispose();
      this.sliceCapGroup.remove(mesh);
    });
    this.sliceCapMeshes.clear();

    const anyActive =
      this.sliceState.xEnabled || this.sliceState.yEnabled || this.sliceState.zEnabled;
    if (!anyActive) return;

    const stratumKeys: StratumLayerKey[] = [
      'corneum',
      'granulosum',
      'spinosum',
      'basale',
      'papillary',
      'reticular'
    ];

    for (const key of stratumKeys) {
      const structId = STRATUM_KEY_TO_STRUCTURE[key];
      const grp = this.structureGroups.get(structId);
      if (!grp || !grp.visible) continue;

      const capGeom = buildStratumSliceCapGeometry(key, this.sliceState, grp.position.y);
      if (!capGeom) continue;

      const baseMat = this.stratumMaterials.get(key)!;
      const capMesh = new THREE.Mesh(capGeom, baseMat);
      capMesh.renderOrder = baseMat.opacity < 0.985 ? 5 : 1;
      capMesh.userData.structureId = structId;
      this.sliceCapGroup.add(capMesh);
      this.sliceCapMeshes.set(key, capMesh);
    }
  }

  /**
   * Computes effective visibility & opacity for every structure taking into account:
   * - Individual layer toggle & opacity slider
   * - Isolation mode (single structure or category)
   * - Progressive top-down skin peeling (peelAmount in [0, 1])
   * - Hover & Selection emissive highlight
   */
  private syncAllMaterialsAndVisibility(): void {
    for (const info of ANATOMY_STRUCTURES) {
      const grp = this.structureGroups.get(info.id);
      if (!grp) continue;

      const state = this.layerStates.get(info.id)!;
      const isAllowedByIsolation =
        this.isolatedIds === null || this.isolatedIds.has(info.id);

      // Progressive top-down peeling factor for stratified layers (peelRank 0..7)
      let peelAlpha = 1.0;
      let peelLiftY = 0.0;
      if (this.peelAmount > 0.001 && info.peelRank >= 0) {
        const threshold = info.peelRank / 7.5;
        const span = 1 / 7.5;
        const localPeel = THREE.MathUtils.clamp((this.peelAmount - threshold) / span, 0, 1);
        peelAlpha = 1.0 - localPeel;
        peelLiftY = localPeel * 0.65;
      }

      const effectiveOpacity = state.opacity * peelAlpha;
      const isVisible =
        state.visible && isAllowedByIsolation && effectiveOpacity > 0.015;

      grp.visible = isVisible;
      grp.userData.peelLiftY = peelLiftY;

      const isSelected = this.selectedIds.has(info.id);
      const isHovered = this.hoveredId === info.id;

      grp.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          const mat = mesh.material as THREE.MeshPhysicalMaterial;
          if (!mat) return;

          // Respect sub-meshes with intrinsic lower opacity (like Pacinian/Meissner capsules)
          const intrinsicMax = mat.userData.baseOpacity ?? 1.0;
          const finalOpacity =
            intrinsicMax < 0.6 ? Math.min(effectiveOpacity, intrinsicMax + 0.12) : effectiveOpacity;

          const isEnclosingSlab =
            info.categoryId === 'epidermis' ||
            info.id === 'skin_surface' ||
            info.id === 'papillary_dermis' ||
            info.id === 'reticular_dermis';

          const shouldBeTransparent = finalOpacity < 0.985;
          const shouldWriteDepth = !shouldBeTransparent || (!isEnclosingSlab && finalOpacity >= 0.82);

          if (mat.transparent !== shouldBeTransparent || mat.depthWrite !== shouldWriteDepth) {
            mat.transparent = shouldBeTransparent;
            mat.depthWrite = shouldWriteDepth;
            mat.needsUpdate = true;
          }
          mat.opacity = finalOpacity;

          // Multi-tier anatomical render order:
          // 1 = Opaque organs/cells | 2 = Semi-opaque internal fibers | 3 = Translucent capsules | 5 = Translucent enclosing slabs
          if (!shouldBeTransparent) {
            mesh.renderOrder = 1;
          } else if (isEnclosingSlab) {
            mesh.renderOrder = 5;
          } else if (shouldWriteDepth) {
            mesh.renderOrder = 2;
          } else {
            mesh.renderOrder = 3;
          }

          // Subtle medical atlas selection & hover emissive highlight
          if (isSelected) {
            mat.emissive.setHex(0x0ea5e9);
            mat.emissiveIntensity = 0.24;
          } else if (isHovered) {
            mat.emissive.setHex(0x38bdf8);
            mat.emissiveIntensity = 0.14;
          } else {
            mat.emissive.setHex(0x000000);
            mat.emissiveIntensity = 0.0;
          }
        }
      });
    }

    this.sliceCapsDirty = true;
    this.requestRender();
  }

  // =========================================================================
  // PUBLIC API FOR REACT UI
  // =========================================================================

  public getLayerStatesSnapshot(): Record<AnatomyStructureId, LayerControlState> {
    const out = {} as Record<AnatomyStructureId, LayerControlState>;
    this.layerStates.forEach((val, key) => {
      out[key] = { ...val };
    });
    return out;
  }

  public setStructureVisible(id: AnatomyStructureId, visible: boolean): void {
    const s = this.layerStates.get(id);
    if (!s) return;
    s.visible = visible;
    this.syncAllMaterialsAndVisibility();
  }

  public setStructureOpacity(id: AnatomyStructureId, opacity: number): void {
    const s = this.layerStates.get(id);
    if (!s) return;
    s.opacity = THREE.MathUtils.clamp(opacity, 0, 1);
    if (s.opacity > 0.02 && !s.visible) {
      s.visible = true;
    }
    this.syncAllMaterialsAndVisibility();
  }

  public setSelection(ids: readonly AnatomyStructureId[], isolated: boolean): void {
    this.selectedIds = new Set(ids);
    this.isolateStructures(isolated ? ids : null);
  }

  public focusOnGroup(ids: readonly AnatomyStructureId[]): void {
    if (ids.length === 1) {
      this.focusOnStructure(ids[0]);
      return;
    }
    const box = new THREE.Box3();
    for (const id of ids) {
      const group = this.structureGroups.get(id);
      if (group) box.expandByObject(group);
    }
    if (box.isEmpty()) return;
    const target = box.getCenter(new THREE.Vector3());
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    const distance = Math.max(3, box.getSize(new THREE.Vector3()).length() * 1.2);
    this.flyCameraTo(target, target.clone().addScaledVector(direction, distance));
  }

  private selectStructure(id: AnatomyStructureId | null): void {
    this.callbacks.onSelectStructure(id);
  }

  private focusOnStructure(id: AnatomyStructureId): void {
    const info = STRUCTURE_MAP[id];
    if (!info) return;
    const explodeShift = info.explodeOffsetY * this.targetExploded;
    const target = new THREE.Vector3(
      info.focusTarget[0],
      info.focusTarget[1] + explodeShift,
      info.focusTarget[2]
    );
    const camPos = target
      .clone()
      .add(
        new THREE.Vector3(
          info.focusCameraOffset[0],
          info.focusCameraOffset[1],
          info.focusCameraOffset[2]
        )
      );
    this.flyCameraTo(target, camPos, 780);
  }

  private isolateStructures(ids: readonly AnatomyStructureId[] | null): void {
    if (!ids || ids.length === 0) {
      this.isolatedIds = null;
    } else {
      this.isolatedIds = new Set(ids);
      // Ensure isolated structures are visible and clearly legible
      for (const id of ids) {
        const st = this.layerStates.get(id);
        if (st) {
          st.visible = true;
          if (st.opacity < 0.25) st.opacity = 1.0;
        }
      }
    }
    this.syncAllMaterialsAndVisibility();
  }

  public setExplodedAmount(amount: number): void {
    this.targetExploded = THREE.MathUtils.clamp(amount, 0, 1);
    this.requestRender();
  }

  public setPeelAmount(amount: number): void {
    this.peelAmount = THREE.MathUtils.clamp(amount, 0, 1);
    this.syncAllMaterialsAndVisibility();
  }

  public setSliceState(partial: Partial<SliceBoundsState>): void {
    this.sliceState = { ...this.sliceState, ...partial };
    this.updateClippingPlanesAndGuides();
  }

  public getSliceState(): SliceBoundsState {
    return { ...this.sliceState };
  }

  public setShowSliceGuides(show: boolean): void {
    this.showSliceGuides = show;
    this.updateClippingPlanesAndGuides();
  }

  public setShowPins(show: boolean): void {
    this.showPins = show;
    if (!show) {
      this.callbacks.onPinsUpdate([]);
    }
    this.requestRender();
  }

  public setCameraPreset(preset: CameraPresetId): void {
    const t = new THREE.Vector3(0, -0.75, 0);
    switch (preset) {
      case 'iso':
        this.flyCameraTo(OVERVIEW_TARGET, OVERVIEW_CAMERA.clone());
        break;
      case 'front':
        this.flyCameraTo(t, new THREE.Vector3(0.0, 0.2, 16.5));
        break;
      case 'side':
        this.flyCameraTo(t, new THREE.Vector3(16.5, 0.2, 0.0));
        break;
      case 'top':
        this.flyCameraTo(new THREE.Vector3(0, 2.5, 0), new THREE.Vector3(0.01, 16.8, 1.8));
        break;
      case 'bottom':
        this.flyCameraTo(new THREE.Vector3(0, -4.5, 0), new THREE.Vector3(0.01, -17.2, 2.2));
        break;
    }
  }

  /**
   * Reconfigures the actual 3D model, materials, cross-sections, separation, and camera
   * for each of the 5 scientific viewing modes!
   */
  public applyViewMode(mode: ViewModeId): SliceBoundsState {
    this.isolatedIds = null;
    this.peelAmount = 0;

    // Reset baseline layer visibilities & natural opacities first
    for (const s of ANATOMY_STRUCTURES) {
      const st = this.layerStates.get(s.id)!;
      st.visible = true;
      if (s.id === 'papillary_dermis') st.opacity = 0.66;
      else if (s.id === 'reticular_dermis') st.opacity = 0.48;
      else if (s.id === 'follicle_sheaths') st.opacity = 0.74;
      else st.opacity = 1.0;
    }

    switch (mode) {
      case 'overview': {
        this.targetExploded = 0;
        this.setSliceState({
          xEnabled: false,
          yEnabled: false,
          zEnabled: false
        });
        this.flyCameraTo(
          OVERVIEW_TARGET,
          OVERVIEW_CAMERA.clone()
        );
        break;
      }

      case 'layers': {
        // Spatial separation of all epidermal, dermal, and hypodermal strata!
        this.targetExploded = 0.68;
        this.layerStates.get('papillary_dermis')!.opacity = 0.9;
        this.layerStates.get('reticular_dermis')!.opacity = 0.82;
        this.setSliceState({
          xEnabled: false,
          yEnabled: false,
          zEnabled: false
        });
        this.flyCameraTo(
          new THREE.Vector3(0, 0.25, 0),
          new THREE.Vector3(13.2, 6.2, 14.5)
        );
        break;
      }

      case 'cross_section': {
        // Real 3D surgical corner cross-section right through the central Anagen follicle & sweat zone!
        this.targetExploded = 0;
        this.layerStates.get('papillary_dermis')!.opacity = 0.94;
        this.layerStates.get('reticular_dermis')!.opacity = 0.88;
        this.setSliceState({
          xEnabled: true,
          xPos: -0.48,
          xInvert: false,
          yEnabled: false,
          yPos: 1.95,
          yInvert: false,
          zEnabled: true,
          zPos: 2.35,
          zInvert: false
        });
        this.flyCameraTo(
          new THREE.Vector3(-1.1, -0.65, 0.2),
          new THREE.Vector3(8.6, 4.8, 9.8)
        );
        break;
      }

      case 'neurovascular': {
        // Ghost surrounding matrices so vessels, capillaries, nerve trunks, Meissner, Pacinian, Merkel & free endings shine!
        this.targetExploded = 0;
        this.setSliceState({
          xEnabled: false,
          yEnabled: false,
          zEnabled: false
        });
        const ghostMap: Partial<Record<AnatomyStructureId, number>> = {
          skin_surface: 0.14,
          vellus_hairs: 0.15,
          stratum_corneum: 0.1,
          stratum_granulosum: 0.08,
          stratum_spinosum: 0.1,
          stratum_basale: 0.14,
          papillary_dermis: 0.12,
          reticular_dermis: 0.08,
          collagen_elastin: 0.08,
          adipose_lobules: 0.12,
          fibrous_septa: 0.18,
          follicle_sheaths: 0.28,
          sebaceous_gland: 0.25,
          arrector_pili: 0.25,
          sweat_secretory: 0.28,
          sweat_duct: 0.25
        };
        Object.entries(ghostMap).forEach(([k, op]) => {
          const st = this.layerStates.get(k as AnatomyStructureId);
          if (st && op !== undefined) st.opacity = op;
        });
        this.flyCameraTo(
          new THREE.Vector3(0, -0.85, 0.2),
          new THREE.Vector3(10.2, 5.4, 11.4)
        );
        break;
      }

      case 'microanatomy': {
        // High-magnification microhistological inspection of dermal papillae, Meissner, capillary loops & epidermal strata
        this.targetExploded = 0;
        this.setSliceState({
          xEnabled: false,
          yEnabled: false,
          zEnabled: false
        });
        this.layerStates.get('papillary_dermis')!.opacity = 0.35;
        this.layerStates.get('reticular_dermis')!.opacity = 0.32;
        this.layerStates.get('collagen_elastin')!.opacity = 0.45;
        this.flyCameraTo(
          new THREE.Vector3(-0.6, 1.75, 2.45),
          new THREE.Vector3(1.85, 2.55, 5.45)
        );
        break;
      }
    }

    this.syncAllMaterialsAndVisibility();
    return this.getSliceState();
  }

  public applyMicroTour(tour: MicroTourPreset): SliceBoundsState {
    this.isolatedIds = null;
    this.peelAmount = 0;

    for (const s of ANATOMY_STRUCTURES) {
      const st = this.layerStates.get(s.id)!;
      st.visible = true;
      if (tour.dimMatrix) {
        if (s.id === 'reticular_dermis') st.opacity = 0.22;
        else if (s.id === 'papillary_dermis') st.opacity = 0.28;
        else if (s.id === 'collagen_elastin') st.opacity = 0.25;
        else if (s.id === 'adipose_lobules') st.opacity = 0.35;
        else if (s.id === 'follicle_sheaths') st.opacity = 0.55;
        else st.opacity = 1.0;
      } else {
        if (s.id === 'papillary_dermis') st.opacity = 0.66;
        else if (s.id === 'reticular_dermis') st.opacity = 0.48;
        else if (s.id === 'follicle_sheaths') st.opacity = 0.74;
        else st.opacity = 1.0;
      }
    }

    this.targetExploded = tour.exploded ?? 0;

    if (tour.sliceConfig) {
      this.setSliceState({
        xEnabled: tour.sliceConfig.xEnabled,
        xPos: tour.sliceConfig.xPos,
        xInvert: false,
        yEnabled: tour.sliceConfig.yEnabled,
        yPos: tour.sliceConfig.yPos,
        yInvert: false,
        zEnabled: tour.sliceConfig.zEnabled,
        zPos: tour.sliceConfig.zPos,
        zInvert: false
      });
    } else {
      this.setSliceState({
        xEnabled: false,
        yEnabled: false,
        zEnabled: false
      });
    }

    this.syncAllMaterialsAndVisibility();
    this.callbacks.onSelectStructure(tour.structureId);

    this.flyCameraTo(
      new THREE.Vector3(...tour.target),
      new THREE.Vector3(...tour.cameraPos),
      850
    );

    return this.getSliceState();
  }

  public resetAll(): SliceBoundsState {
    this.selectedIds.clear();
    this.hoveredId = null;
    this.isolatedIds = null;
    this.peelAmount = 0;
    this.targetExploded = 0;
    this.sliceState = { ...DEFAULT_SLICE };
    this.callbacks.onHoverStructure(null);
    this.callbacks.onSelectStructure(null);
    return this.applyViewMode('overview');
  }

  // =========================================================================
  // INTERNAL CAMERA FLIGHT, RAYCASTING & RENDER LOOP
  // =========================================================================

  private flyCameraTo(target: THREE.Vector3, camPos: THREE.Vector3, duration = 760): void {
    camPos.sub(target).multiplyScalar(this.widthFit()).add(target);
    this.camAnim.active = true;
    this.requestRender();
    this.camAnim.startTime = performance.now();
    this.camAnim.duration = duration;
    this.camAnim.fromPos.copy(this.camera.position);
    this.camAnim.toPos.copy(camPos);
    this.camAnim.fromTarget.copy(this.controls.target);
    this.camAnim.toTarget.copy(target);
  }

  private isPointInsideClippingHalfSpaces(pt: THREE.Vector3): boolean {
    if (this.sliceState.xEnabled && this.planeX.distanceToPoint(pt) < -0.008) return false;
    if (this.sliceState.yEnabled && this.planeY.distanceToPoint(pt) < -0.008) return false;
    if (this.sliceState.zEnabled && this.planeZ.distanceToPoint(pt) < -0.008) return false;
    return true;
  }

  private performRaycast(clientX: number, clientY: number): {
    id: AnatomyStructureId | null;
    point: THREE.Vector3 | null;
  } {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointerNDC, this.camera);

    const targets: THREE.Object3D[] = [];
    this.structureGroups.forEach((grp, id) => {
      const st = this.layerStates.get(id);
      // Skip nearly-invisible ghosted layers (< 0.18 opacity) so user clicks right through ghosted dermis onto vessels/nerves!
      if (grp.visible && st && st.opacity >= 0.18) {
        targets.push(grp);
      }
    });
    if (this.sliceCapGroup.children.length > 0) {
      this.sliceCapGroup.children.forEach((c) => {
        const sid = c.userData.structureId as AnatomyStructureId | undefined;
        const st = sid ? this.layerStates.get(sid) : undefined;
        if (c.visible && st && st.opacity >= 0.18) {
          targets.push(c);
        }
      });
    }

    const hits = this.raycaster.intersectObjects(targets, true);
    for (const hit of hits) {
      if (!this.isPointInsideClippingHalfSpaces(hit.point)) continue;
      let curr: THREE.Object3D | null = hit.object;
      while (curr) {
        if (curr.userData && curr.userData.structureId) {
          return {
            id: curr.userData.structureId as AnatomyStructureId,
            point: hit.point
          };
        }
        curr = curr.parent;
      }
    }
    return { id: null, point: null };
  }

  private bindDOMEvents(): void {
    const dom = this.renderer.domElement;

    const onPointerDown = (e: PointerEvent) => {
      this.isPointerDown = true;
      this.pointerDownPos.set(e.clientX, e.clientY);
    };

    const onPointerMove = (e: PointerEvent) => {
      // Avoid heavy raycasting during active drag-orbit
      if (this.isPointerDown && e.buttons > 0) {
        if (this.hoveredId !== null) {
          this.hoveredId = null;
          this.syncAllMaterialsAndVisibility();
          this.callbacks.onHoverStructure(null);
        }
        return;
      }

      const { id } = this.performRaycast(e.clientX, e.clientY);
      dom.style.cursor = id ? 'pointer' : 'grab';

      if (id !== this.hoveredId) {
        this.hoveredId = id;
        this.syncAllMaterialsAndVisibility();
        this.callbacks.onHoverStructure(id);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!this.isPointerDown) return;
      this.isPointerDown = false;

      const dist = Math.hypot(
        e.clientX - this.pointerDownPos.x,
        e.clientY - this.pointerDownPos.y
      );
      if (dist < 5) {
        const { id } = this.performRaycast(e.clientX, e.clientY);
        this.selectStructure(id);
      }
    };

    const onDoubleClick = (e: MouseEvent) => {
      const { id, point } = this.performRaycast(e.clientX, e.clientY);
      if (id && point) {
        this.selectStructure(id);
        const dir = new THREE.Vector3()
          .subVectors(this.camera.position, point)
          .normalize();
        const zoomDist = 3.2;
        this.flyCameraTo(point.clone(), point.clone().addScaledVector(dir, zoomDist), 680);
      }
    };

    const onPointerLeave = () => {
      this.isPointerDown = false;
      if (this.hoveredId !== null) {
        this.hoveredId = null;
        this.syncAllMaterialsAndVisibility();
      }
      this.callbacks.onHoverStructure(null);
    };

    const options = { signal: this.events.signal };
    dom.addEventListener('pointerdown', onPointerDown, options);
    dom.addEventListener('pointermove', onPointerMove, options);
    dom.addEventListener('pointerup', onPointerUp, options);
    dom.addEventListener('dblclick', onDoubleClick, options);
    dom.addEventListener('pointerleave', onPointerLeave, options);
    dom.addEventListener('pointercancel', onPointerLeave, options);
  }

  private updatePinProjections(): void {
    if (!this.showPins) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const vec = new THREE.Vector3();
    const out: PinScreenPosition[] = [];

    for (const info of ANATOMY_STRUCTURES) {
      if (!info.pinPosition) continue;
      const grp = this.structureGroups.get(info.id);
      if (!grp || !grp.visible) continue;

      vec.set(...info.pinPosition).add(grp.position);

      if (!this.isPointInsideClippingHalfSpaces(vec)) continue;

      vec.project(this.camera);
      if (vec.z > 1 || vec.z < -1) continue;

      const x = (vec.x * 0.5 + 0.5) * width;
      const y = (-vec.y * 0.5 + 0.5) * height;
      const inBounds = x > 20 && x < width - 20 && y > 20 && y < height - 20;

      out.push({
        id: info.id,
        name: info.name,
        color: info.color,
        x,
        y,
        visible: inBounds
      });
    }

    this.callbacks.onPinsUpdate(out);
  }

  private handleResize(): void {
    if (this.disposed) return;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    const previousFit = this.widthFit();
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (!this.camAnim.active) {
      const target = this.controls.target;
      this.camera.position.sub(target).multiplyScalar(this.widthFit() / previousFit).add(target);
    }
    this.renderer.setSize(w, h);
    this.requestRender();
  }

  private requestRender = (): void => {
    if (!this.disposed && this.inView && !this.rafId) this.rafId = requestAnimationFrame(this.animate);
  };

  private animate = (): void => {
    this.rafId = 0;
    if (this.disposed || !this.inView) return;
    let moving = this.camAnim.active;

    // 1. Smoothly interpolate Exploded View & Layer Peel Y offsets
    const expDiff = this.targetExploded - this.currentExploded;
    if (Math.abs(expDiff) > 0.0008) {
      this.currentExploded += expDiff * 0.14;
      moving = true;
    } else if (this.currentExploded !== this.targetExploded) {
      this.currentExploded = this.targetExploded;
    }

    for (const info of ANATOMY_STRUCTURES) {
      const grp = this.structureGroups.get(info.id);
      if (!grp) continue;
      const liftY = grp.userData.peelLiftY ?? 0;
      const targetY = info.explodeOffsetY * this.currentExploded + liftY;
      const delta = targetY - grp.position.y;
      if (delta === 0) continue;
      if (Math.abs(delta) > 0.0008) {
        grp.position.y += delta * 0.22;
        moving = true;
      } else {
        grp.position.y = targetY;
      }
      this.sliceCapsDirty = true;
    }

    // Move soft ground contact shadow smoothly below hypodermis
    this.groundShadowMesh.position.y = -6.85 - 1.35 * this.currentExploded;

    // 2. Rebuild analytical slice caps only when slice or exploded state changed
    if (this.sliceCapsDirty) {
      this.rebuildAnalyticalSliceCaps();
      this.renderer.shadowMap.needsUpdate = true;
      this.sliceCapsDirty = false;
    }

    // 3. Smooth Camera Flight interpolation
    if (this.camAnim.active) {
      const now = performance.now();
      const rawT = Math.min(1, (now - this.camAnim.startTime) / this.camAnim.duration);
      // Cubic ease-out
      const ease = 1 - Math.pow(1 - rawT, 3);
      this.camera.position.lerpVectors(this.camAnim.fromPos, this.camAnim.toPos, ease);
      this.controls.target.lerpVectors(this.camAnim.fromTarget, this.camAnim.toTarget, ease);
      if (rawT >= 1) {
        this.camAnim.active = false;
      }
    }

    const orbitMoving = this.controls.update();
    this.renderer.render(this.scene, this.camera);

    if (this.showPins) {
      this.updatePinProjections();
    }
    if (moving || orbitMoving) this.requestRender();
  };

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.resizeObserver.disconnect();
    this.intersectionObserver?.disconnect();
    this.events.abort();
    this.controls.dispose();

    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
        geometries.add(obj.geometry);
        if (Array.isArray(obj.material)) obj.material.forEach((material) => materials.add(material));
        else materials.add(obj.material);
      }
      if (obj instanceof THREE.DirectionalLight) obj.shadow.dispose();
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    (this.groundShadowMesh.material as THREE.MeshBasicMaterial).map?.dispose();

    Object.values(this.textures).forEach((tex) => tex.dispose());
    this.envRT.dispose();
    this.pmremGenerator.dispose();
    this.renderer.forceContextLoss();
    this.renderer.dispose();

    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
