import { useEffect, useMemo } from 'react';
import { Html } from '@react-three/drei';
import { DoubleSide, type BufferGeometry } from 'three';
import type { ModelProps } from '../../three/types';
import { useSelection } from '../../three/selection';
import { teethText } from '../../content/ru/teeth-model';
import { crown, root, TYPES, DIMENSIONS, type ToothKind } from './geometry';

function Tooth({ kind, state, x }: {kind: ToothKind; state: ModelProps['state']; x: number}) {
  const { selected, select, hovered, hover, isolate } = useSelection();
  const cut=state.cutaway;
  const g=useMemo(()=> {
    const roots=DIMENSIONS[kind].roots;
    return {
      enamel:crown(kind,1,cut), dentin:crown(kind,0.88,cut), pulp:crown(kind,0.38,cut),
      cement:roots.map((_,i)=>root(kind,i,1,cut)),
      rootDentin:roots.map((_,i)=>root(kind,i,0.91,cut)),
      canals:roots.map((_,i)=>root(kind,i,0.17,cut)),
    };
  },[kind,cut]);
  useEffect(()=>()=>Object.values(g).flat().forEach(v=>v.dispose()),[g]);
  if(isolate && selected && selected!==kind) return null;
  const active=selected===kind || hovered===kind;
  const spread=state.modes.explode ? 1 : 0;
  function mesh(geo: BufferGeometry, color: string, depth: number, gloss=false) {
    return <mesh geometry={geo} position={[0,0,cut ? depth + spread*depth*80 : 0]}>
      <meshPhysicalMaterial color={color} side={DoubleSide} roughness={gloss?0.23:0.56}
        clearcoat={gloss?0.85:0.15} clearcoatRoughness={0.22}
        emissive={active?'#66502b':'#000000'} emissiveIntensity={0.13} />
    </mesh>;
  }
  return <group position={[x,0.25,0]} onClick={e=>{e.stopPropagation();select(selected===kind?null:kind);}}
    onPointerOver={e=>{e.stopPropagation();hover(kind);}} onPointerOut={()=>hover(null)}>
    {mesh(g.enamel,'#fff7df',0,true)}
    {(cut || spread>0) && <>
      {mesh(g.dentin,'#eac786',0.004)}
      {mesh(g.pulp,'#c95d68',0.009)}
    </>}
    {g.cement.map((geo,i)=><group key={i}>
      {mesh(geo,'#d9bd88',0)}
      {cut && mesh(g.rootDentin[i],'#efd294',0.004)}
      {cut && mesh(g.canals[i],'#c74d5e',0.009)}
    </group>)}
    {(state.labels || active) && <Html center position={[0,1.8,0]} style={{pointerEvents:'none',whiteSpace:'nowrap'}}>
      <span style={{background:'var(--color-stone, #faf7f0)',color:'#352e27',border:'1px solid #d9cebd',borderRadius:20,padding:'5px 10px',fontSize:12}}>{teethText[kind]}</span>
    </Html>}
  </group>;
}

export default function TeethModel({state}: ModelProps) {
  return <group rotation={[0.10,-0.12,0]}>
    {TYPES.map((kind,i)=><Tooth key={kind} kind={kind} state={state} x={(i-1.5)*1.75} />)}
    {state.cutaway && state.labels && <Html center position={[0,-2,0]} style={{pointerEvents:'none',width:300,textAlign:'center'}}>
      <div style={{display:'flex',gap:12,justifyContent:'center',fontSize:11,color:'#574938',background:'#faf7f0',padding:8,borderRadius:12}}>
        {(['enamel','dentin','pulp','cementum'] as const).map((id,i)=><span key={id}><b style={{color:['#c2af81','#bb913d','#c74d5e','#a38858'][i]}}>● </b>{teethText[id]}</span>)}
      </div>
    </Html>}
  </group>;
}
