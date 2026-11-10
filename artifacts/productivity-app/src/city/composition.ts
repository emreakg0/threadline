import type { Project, Task } from '../types';
import { building, neighborhood } from './layout';
export type Vec3 = [number, number, number];
export type Bounds = { minX:number; maxX:number; minZ:number; maxZ:number; height:number; minY?:number };
export type DistrictBlock = Bounds & { page:number; color:string };
/** Keep one decorative lot around occupied lots; expanding never relocates a task. */
export function districtBlocks(project:Project, tasks:Task[]):DistrictBlock[] {
 const pages=new Set(tasks.length?tasks.map(t=>Math.floor(t.city_slot/256)):[0]);
 return [...pages].map(page=>{
  const lots=tasks.filter(t=>Math.floor(t.city_slot/256)===page).map(t=>building(t,project));
  const area=neighborhood(project,page);
  return {page,color:area.color,minX:(lots.length?Math.min(...lots.map(b=>b.x)):area.x)-6.75,maxX:(lots.length?Math.max(...lots.map(b=>b.x)):area.x)+6.75,minZ:(lots.length?Math.min(...lots.map(b=>b.z)):area.z)-6.75,maxZ:(lots.length?Math.max(...lots.map(b=>b.z)):area.z)+6.75,minY:-1.15,height:Math.max(2.25,...lots.map(b=>b.height+2.7))};
 });
}
export function combineBounds(blocks:Bounds[]):Bounds {
 return {minX:Math.min(...blocks.map(b=>b.minX))-.25,maxX:Math.max(...blocks.map(b=>b.maxX))+.25,minZ:Math.min(...blocks.map(b=>b.minZ))-.25,maxZ:Math.max(...blocks.map(b=>b.maxZ))+.25,minY:Math.min(...blocks.map(b=>b.minY??0)),height:Math.max(...blocks.map(b=>b.height))};
}
/** Fit all eight corners against both perspective frustum axes, including near-side depth. */
export function cameraFrame(bounds:Bounds, aspect:number, fov=38):{target:Vec3;position:Vec3;distance:number} {
 const target:Vec3=[(bounds.minX+bounds.maxX)/2,bounds.height*.38,(bounds.minZ+bounds.maxZ)/2];
 const direction=[1,1.05,1];const length=Math.hypot(...direction);const d=direction.map(n=>n/length);
 const right=[Math.SQRT1_2,0,-Math.SQRT1_2];const up=[-d[1]*Math.SQRT1_2,Math.SQRT2*d[0],-d[1]*Math.SQRT1_2];
 const tanV=Math.tan(fov*Math.PI/360),tanH=tanV*Math.max(.3,aspect);
 let distance=8;
 for(const x of [bounds.minX,bounds.maxX])for(const y of [bounds.minY??0,bounds.height])for(const z of [bounds.minZ,bounds.maxZ]){
  const c=[x-target[0],y-target[1],z-target[2]];const dot=(v:number[])=>c.reduce((sum,n,i)=>sum+n*v[i],0);
  distance=Math.max(distance,dot(d)+Math.abs(dot(right))/tanH,dot(d)+Math.abs(dot(up))/tanV);
 }
 distance*=1.08;
 return {target,position:[target[0]+d[0]*distance,target[1]+d[1]*distance,target[2]+d[2]*distance],distance};
}
