import { BufferGeometry, Float32BufferAttribute } from 'three';

export type ToothKind = 'incisor' | 'canine' | 'premolar' | 'molar';
export const TYPES: ToothKind[] = ['incisor', 'canine', 'premolar', 'molar'];
export const DIMENSIONS = {
  incisor: { w: 0.45, d: 0.29, h: 1.12, roots: [[0, 0, 1.52]] },
  canine: { w: 0.40, d: 0.36, h: 1.25, roots: [[0, 0, 1.94]] },
  premolar: { w: 0.44, d: 0.49, h: 0.94, roots: [[-0.16, 0, 1.44], [0.19, 0, 1.35]] },
  molar: { w: 0.65, d: 0.57, h: 0.90, roots: [[-0.29, -0.21, 1.45], [0.29, -0.21, 1.30], [0, 0.32, 1.60]] },
} satisfies Record<ToothKind, { w: number; d: number; h: number; roots: number[][] }>;

/** Educational upper permanent teeth. Units are illustrative, not patient-specific. */
export function crownHeight(kind: ToothKind, x: number, z: number): number {
  const g = (a: number, b: number, s: number) => Math.exp(-((x-a)**2 + (z-b)**2) / s);
  if (kind === 'incisor') return 0.92 + 0.07 * (1-z*z) + 0.018*Math.cos(x*9);
  if (kind === 'canine') return 0.73 + 0.37*g(0, 0, 0.30) - 0.06*x;
  if (kind === 'premolar') return 0.71 + 0.29*g(0, -0.50, 0.20) + 0.24*g(0, 0.50, 0.23) - 0.045*g(0, 0, 0.05);
  return 0.68 + 0.25*g(-0.48,-0.46,0.16) + 0.23*g(0.46,-0.43,0.17)
    + 0.29*g(-0.44,0.45,0.19) + 0.24*g(0.46,0.47,0.17)
    - 0.045*Math.exp(-x*x/0.009)*Math.exp(-z*z/0.65)
    - 0.035*Math.exp(-z*z/0.009)*Math.exp(-x*x/0.65);
}

/** Ring surface with explicitly filled longitudinal cut faces; no renderer clipping. */
function surface(sample: (t: number, a: number) => number[], cut: boolean, rings = 96, sectors = 128): BufferGeometry {
  const p: number[] = [], idx: number[] = [];
  for (let i=0;i<=rings;i++) for(let j=0;j<=sectors;j++) {
    p.push(...sample(i/rings, (cut ? Math.PI : Math.PI*2)*j/sectors));
  }
  for(let i=0;i<rings;i++) for(let j=0;j<sectors;j++) {
    const a=i*(sectors+1)+j, b=a+sectors+1;
    idx.push(a,b,a+1,b,b+1,a+1);
  }
  if(cut) {
    // Both boundaries are coplanar (z=0). Connect them into a sealed cut face.
    for(let i=0;i<rings;i++) {
      const a=i*(sectors+1), b=a+sectors, c=a+sectors+1, d=c+sectors;
      idx.push(a,b,c,b,d,c);
    }
  }
  const geo=new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(p,3));
  geo.setIndex(idx); geo.computeVertexNormals(); geo.computeBoundingSphere();
  return geo;
}

export function crown(kind: ToothKind, scale=1, cut=false): BufferGeometry {
  const {w,d,h}=DIMENSIONS[kind];
  return surface((t,a)=> {
    // Cervical constriction, convex axial walls, rounded shoulder, sculpted occlusal table.
    const top=t>0.62;
    const r=top ? Math.cos((t-0.62)/0.38*Math.PI/2) : 0.69+0.31*Math.sin(t/0.62*Math.PI/2);
    const ca=Math.cos(a), sa=-Math.sin(a);
    const power=kind==='molar' ? 0.66 : kind==='incisor' ? 0.72 : 0.9;
    const x=Math.sign(ca)*Math.abs(ca)**power*r;
    const z=Math.sign(sa)*Math.abs(sa)**power*r;
    const relief=0.003*Math.sin(a*30)*Math.sin(t*Math.PI)*Math.sin(t*65);
    const y=top ? h*crownHeight(kind,x,z) : h*(0.02+0.68*Math.sin(t/0.62*Math.PI/2));
    return [x*w*scale*(1+relief),y*scale, z*d*scale];
  },cut);
}

export function root(kind: ToothKind, index: number, scale=1, cut=false): BufferGeometry {
  const {w,d,roots}=DIMENSIONS[kind]; const [dx,dz,length]=roots[index];
  return surface((t,a)=> {
    const r=(0.012+0.988*(1-t)**0.72)*scale;
    const base=roots.length===1 ? 0.66 : 0.30;
    const x=dx*(0.35+t*1.7)+0.065*t*t;
    const z=dz*(0.35+t*1.5);
    return [x+Math.cos(a)*w*base*r,-length*t,-Math.sin(a)*d*base*r+z];
  },cut,80,80);
}
