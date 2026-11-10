import assert from 'node:assert/strict';
import { building, neighborhood, spiral } from './layout';
import type { Project, Task } from '../types';
const project:Project={id:'project-a',name:'First',color:'#79efc4',city_slot:0};
const task:Task={id:'task-a',title:'A task',description:'',project_id:project.id,status:'todo',priority:'medium',due_date:null,version:1,city_slot:10};
assert.deepEqual(building(task,project),building(JSON.parse(JSON.stringify(task)),{...project}));
const start=building(task,project);
for(const change of [{title:'Renamed'},{status:'done'},{priority:'high'},{version:8}]){const next=building({...task,...change},project);assert.equal(next.x,start.x);assert.equal(next.z,start.z);}
assert.ok(building({...task,priority:'high'},project).height>building({...task,priority:'low'},project).height);
assert.equal(new Set(Array.from({length:10000},(_,i)=>spiral(i).join(','))).size,10000);
const lots=new Set<string>();
for(let p=0;p<6;p++)for(let t=0;t<600;t++){const lot=building({...task,city_slot:t},{...project,city_slot:p});const key=[lot.x,lot.z].join(',');assert.equal(lots.has(key),false,'Buildings overlap across district expansion');lots.add(key);}
assert.notDeepEqual(neighborhood(project),neighborhood({...project,city_slot:1}));
console.log('PASS: refresh-stable placement, status/priority edits preserve coordinates, priority heights, unique lots and large-project expansion');

const { districtBlocks, combineBounds, cameraFrame } = await import('./composition');
const { PerspectiveCamera, Vector3 } = await import('three');
for(const count of [0,1,5,20]) {
 const tasks=Array.from({length:count},(_,i)=>({...task,id:'framing-'+i,city_slot:i}));
 const bounds=combineBounds(districtBlocks(project,tasks));
 for(const aspect of [2.07,.875]) {
  const frame=cameraFrame(bounds,aspect);const camera=new PerspectiveCamera(38,aspect,.1,2500);camera.position.set(...frame.position);camera.lookAt(...frame.target);camera.updateMatrixWorld();
  for(const x of [bounds.minX,bounds.maxX])for(const y of [bounds.minY??0,bounds.height])for(const z of [bounds.minZ,bounds.maxZ]){const corner=new Vector3(x,y,z).project(camera);assert.ok(Math.abs(corner.x)<=1&&Math.abs(corner.y)<=1&&corner.z<1,`${count} tasks fit the ${aspect} camera frustum`);}
 }
 assert.ok(bounds.maxX-bounds.minX<40,'Small cities must not get enormous empty platforms');
}
const sparse=combineBounds(districtBlocks(project,[{...task,city_slot:255}]));assert.equal(sparse.maxX-sparse.minX,14,'One remaining task still gets a compact environment');
console.log('PASS: 0/1/5/20-task desktop/mobile camera fitting, compact empty/sparse cities');
const { architecture, environment } = await import('./scenery');
const fixtureTasks=Array.from({length:20},(_,i)=>({...task,id:'architecture-'+i,city_slot:i}));
const scenery=environment(project,fixtureTasks);
assert.ok(Object.values(scenery).flat().every(part=>!part.task),'Decorative props must not masquerade as task buildings');
const architectureParts=Object.values(architecture(fixtureTasks,[project])).flat();
assert.equal(new Set(architectureParts.map(part=>part.task?.id)).size,fixtureTasks.length);
assert.ok(architectureParts.every(part=>fixtureTasks.some(t=>t.id===part.task?.id)));
assert.deepEqual(environment(project,fixtureTasks),environment(project,fixtureTasks),'Scenery is deterministic');
console.log('PASS: scenery is deterministic and noninteractive; architecture maps only to real tasks');

// Frame the actual platform underside and tallest rooftop accents, not only ground-level lots.
for(const count of [0,1,5,20]) {
 const tasks=Array.from({length:count},(_,i)=>({...task,id:'roof-'+i,city_slot:i,priority:'high' as const}));
 const bounds=combineBounds(districtBlocks(project,tasks));
 const pieces=[...Object.values(architecture(tasks,[project])).flat(),...Object.values(environment(project,tasks)).flat()];
 for(const part of pieces) {
  assert.ok(part.p[1]-part.s[1]/2>=(bounds.minY??0)-.001,'Platform underside fits bounds');
  assert.ok(part.p[1]+part.s[1]/2<=bounds.height+.001,'Rooftop accents and lamps fit bounds');
 }
 for(const aspect of [.5,.875,2.07,3]) {
  const frame=cameraFrame(bounds,aspect);const camera=new PerspectiveCamera(38,aspect,.1,2500);camera.position.set(...frame.position);camera.lookAt(...frame.target);camera.updateMatrixWorld();
  for(const x of [bounds.minX,bounds.maxX])for(const y of [bounds.minY??0,bounds.height])for(const z of [bounds.minZ,bounds.maxZ]) {
   const corner=new Vector3(x,y,z).project(camera);assert.ok(Math.abs(corner.x)<=1&&Math.abs(corner.y)<=1&&corner.z>=-1&&corner.z<=1);
  }
 }
}
console.log('PASS: platform underside, lamps and high-priority rooftops fit portrait through ultrawide cameras');
