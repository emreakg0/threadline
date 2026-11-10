import { memo, useEffect, useLayoutEffect, useMemo, useRef, type ComponentRef } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { BoxGeometry, CylinderGeometry, IcosahedronGeometry, Color, Object3D, Vector2, Vector3, PCFSoftShadowMap, type InstancedMesh, type Mesh, type BufferGeometry, PMREMGenerator } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { Project, Task } from '../types';
import { building } from './layout';
import { cameraFrame, combineBounds, districtBlocks, type Bounds, type Vec3 } from './composition';
import { architecture, environment, type Piece, type GeometrySet } from './scenery';
const box=new BoxGeometry(1,1,1);
const rounded=new RoundedBoxGeometry(1,1,1,1,.06);
const cylinder=new CylinderGeometry(.5,.5,1,16);
const leaf=new IcosahedronGeometry(.5,1);
const roof=new CylinderGeometry(0,.71,1,4);
function Batch({pieces,geometry=box,lit=false,glass=false,onSelect}:{pieces:Piece[];geometry?:BufferGeometry;lit?:boolean;glass?:boolean;onSelect?:(t:Task)=>void}) {
 const ref=useRef<InstancedMesh>(null);const {invalidate,gl}=useThree();
 useLayoutEffect(()=>{
  if(!ref.current)return;const object=new Object3D();
  pieces.forEach((p,i)=>{object.position.set(...p.p);object.scale.set(...p.s);object.rotation.set(...(p.rotation??[0,0,0]));object.updateMatrix();ref.current!.setMatrixAt(i,object.matrix);ref.current!.setColorAt(i,new Color(p.color).multiplyScalar(lit?1.45:1));});
  ref.current.instanceMatrix.needsUpdate=true;if(ref.current.instanceColor)ref.current.instanceColor.needsUpdate=true;ref.current.computeBoundingSphere();gl.shadowMap.needsUpdate=true;invalidate();
 },[pieces,lit,invalidate,gl]);
 const click=(event:ThreeEvent<MouseEvent>)=>{const task=pieces[event.instanceId??-1]?.task;if(task&&event.delta<6){event.stopPropagation();onSelect?.(task);}};
 return pieces.length?<instancedMesh key={pieces.length} ref={ref} args={[geometry,undefined,pieces.length]} castShadow={!lit} receiveShadow={!lit} onClick={onSelect?click:undefined} >
  {lit?<meshBasicMaterial toneMapped={false}/>:<meshStandardMaterial roughness={glass ? .2 : .76} metalness={glass ? .6 : .12} envMapIntensity={.25}/>}
 </instancedMesh>:null;
}
function Batches({set,onSelect}:{set:GeometrySet;onSelect?:(t:Task)=>void}) {return <>
 <Batch pieces={set.solid} onSelect={onSelect}/><Batch pieces={set.smooth} geometry={rounded} onSelect={onSelect}/><Batch pieces={set.round} geometry={cylinder} onSelect={onSelect}/><Batch pieces={set.leaf} geometry={leaf} onSelect={onSelect}/><Batch pieces={set.roof} geometry={roof} onSelect={onSelect}/><Batch pieces={set.glow} lit onSelect={onSelect}/><Batch pieces={set.glass} glass onSelect={onSelect}/>
 </>;}
const Architecture=memo(function Architecture({tasks,projects,onSelect}:{tasks:Task[];projects:Project[];onSelect:(t:Task)=>void}) {const set=useMemo(()=>architecture(tasks,projects),[tasks,projects]);return <Batches set={set} onSelect={onSelect}/>;});
const District=memo(function District({project,tasks}:{project:Project;tasks:Task[]}) {const layoutKey=tasks.map(t=>`${t.id}:${t.city_slot}`).join(',');const set=useMemo(()=>environment(project,tasks),[project.id,project.city_slot,layoutKey]);return <Batches set={set}/>;});
function CameraRig({bounds,selected,reset,reducedMotion}:{bounds:Bounds;selected:Bounds|null;reset:number;reducedMotion:boolean}) {
 const controls=useRef<ComponentRef<typeof OrbitControls>>(null);const moving=useRef(false),initialized=useRef(false);const {camera,invalidate,size}=useThree();
 const overview=useMemo(()=>cameraFrame(bounds,size.width/size.height),[bounds,size.width,size.height]);
 const frame=useMemo(()=>selected?cameraFrame(selected,size.width/size.height):overview,[selected,overview,size.width,size.height]);
 const destination=useRef(new Vector3()),look=useRef(new Vector3());
 useEffect(()=>{
  look.current.set(...frame.target);destination.current.set(...frame.position);
  if(reducedMotion||!initialized.current){camera.position.copy(destination.current);controls.current?.target.copy(look.current);controls.current?.update();moving.current=false;}else moving.current=true;
  initialized.current=true;invalidate();
 },[frame,reset,reducedMotion,camera,invalidate]);
 useFrame((_,dt)=>{if(!controls.current)return;
  if(moving.current){const alpha=1-Math.exp(-Math.min(dt,.1)*5);camera.position.lerp(destination.current,alpha);controls.current.target.lerp(look.current,alpha);controls.current.update();if(camera.position.distanceTo(destination.current)<.015){moving.current=false;camera.position.copy(destination.current);}else invalidate();}
  // Clamp the orbit target and move the camera with it, preserving the current viewing angle.
  const target=controls.current.target;const x=Math.max(bounds.minX+1,Math.min(bounds.maxX-1,target.x)),z=Math.max(bounds.minZ+1,Math.min(bounds.maxZ-1,target.z));
  if(!moving.current&&Math.abs(x-target.x)+Math.abs(z-target.z)>.001){camera.position.x+=x-target.x;camera.position.z+=z-target.z;target.x=x;target.z=z;controls.current.update();invalidate();}
 });
 return <OrbitControls ref={controls} makeDefault enableDamping={!reducedMotion} dampingFactor={.1} screenSpacePanning={false} minDistance={Math.max(5,frame.distance*.38)} maxDistance={overview.distance*1.65} minPolarAngle={.38} maxPolarAngle={1.3} rotateSpeed={.7} zoomSpeed={.75} panSpeed={.65} onStart={()=>{moving.current=false;}}/>;
}
/** Restrained bloom on desktop only. Render on demand; mobile keeps the inexpensive direct renderer. */
function Finish() {
 const {gl,scene,camera,size,invalidate}=useThree();const composer=useRef<EffectComposer|null>(null);
 useEffect(()=>{
  if(size.width<700)return;
  const pipeline=new EffectComposer(gl);pipeline.setPixelRatio(Math.min(gl.getPixelRatio(),1.25));pipeline.setSize(size.width,size.height);
  const passes=[new RenderPass(scene,camera),new UnrealBloomPass(new Vector2(size.width/2,size.height/2),.16,.45,.85),new OutputPass()];
  passes.forEach(pass=>pipeline.addPass(pass));composer.current=pipeline;invalidate();
  return ()=>{composer.current=null;passes.forEach(pass=>pass.dispose());pipeline.dispose();};
 },[gl,scene,camera,size.width,size.height,invalidate]);
 useFrame((_,dt)=>{if(composer.current)composer.current.render(dt);else gl.render(scene,camera);},1);return null;
}
function Reflections() {
 const {gl,scene,invalidate}=useThree();
 useEffect(()=>{const generator=new PMREMGenerator(gl),room=new RoomEnvironment();const target=generator.fromScene(room,.04);const previous=scene.environment;scene.environment=target.texture;invalidate();room.dispose();generator.dispose();return ()=>{scene.environment=previous;target.dispose();};},[gl,scene,invalidate]);
 return null;
}
function Lighting({bounds}:{bounds:Bounds}) {
 const center:Vec3=[(bounds.minX+bounds.maxX)/2,0,(bounds.minZ+bounds.maxZ)/2];const span=Math.max(bounds.maxX-bounds.minX,bounds.maxZ-bounds.minZ,18);
 const target=useMemo(()=>{const object=new Object3D();object.position.set(...center);return object;},[center[0],center[2]]);
 return <><primitive object={target}/><ambientLight intensity={.22}/><hemisphereLight args={['#b4d2ef','#3e5b53',.55]}/><directionalLight position={[center[0]+12,22,center[2]+10]} target={target} color="#ffe6c1" intensity={1.15} castShadow shadow-mapSize={[1024,1024]} shadow-camera-left={-span*.8} shadow-camera-right={span*.8} shadow-camera-top={span*.8} shadow-camera-bottom={-span*.8} shadow-camera-far={100} shadow-bias={-.0005} shadow-normalBias={.04} shadow-radius={3}/><directionalLight position={[center[0]-12,12,center[2]-8]} target={target} color="#79cbdc" intensity={.65}/></>;
}
function Pulse({task,project}:{task:Task;project:Project}) {
 const ref=useRef<Mesh>(null),time=useRef(0);const invalidate=useThree(s=>s.invalidate);const b=building(task,project);
 useFrame((_,dt)=>{if(!ref.current||time.current>1.4)return;time.current+=dt;ref.current.scale.setScalar(1+time.current*1.8);ref.current.visible=time.current<1.4;invalidate();});
 return <mesh ref={ref} position={[b.x,.43,b.z]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[1.7,1.75,48]}/><meshBasicMaterial color={b.color} transparent opacity={.4} depthWrite={false} toneMapped={false}/></mesh>;
}
export default function CityScene({projects,tasks,selected,onSelect,reset,pulse,reducedMotion,onContextLost,focusedProjectId}:{projects:Project[];tasks:Task[];selected:Task|null;onSelect:(t:Task)=>void;reset:number;pulse:Task|null;reducedMotion:boolean;onContextLost:()=>void;focusedProjectId:string}) {
 const project=projects.find(p=>p.id===(selected?.project_id??focusedProjectId))??projects[0];
 const visibleTasks=useMemo(()=>tasks.filter(t=>t.project_id===project?.id),[tasks,project?.id]);
 const visibleProjects=useMemo(()=>project?[project]:[],[project]);
 const layoutKey=visibleTasks.map(t=>`${t.id}:${t.city_slot}:${t.priority}`).join(',');
 const bounds=useMemo(()=>project?combineBounds(districtBlocks(project,visibleTasks)):{minX:-6.75,maxX:6.75,minZ:-6.75,maxZ:6.75,height:2},[project?.id,project?.city_slot,layoutKey]);
 const selectedBuilding=selected&&project&&selected.project_id===project.id?building(selected,project):null;
 const selectedBounds=useMemo<Bounds|null>(()=>selectedBuilding?{minX:selectedBuilding.x-3.5,maxX:selectedBuilding.x+3.5,minZ:selectedBuilding.z-3.5,maxZ:selectedBuilding.z+3.5,height:selectedBuilding.height+2.7}:null,[selectedBuilding?.x,selectedBuilding?.z,selectedBuilding?.height]);
 const pulseProject=pulse&&project?.id===pulse.project_id?project:null;
 return <Canvas frameloop="demand" shadows={{type:PCFSoftShadowMap}} dpr={[1,1.5]} camera={{position:[14,16,14],fov:38,near:.1,far:2500}} gl={{antialias:true,powerPreference:'high-performance'}} onCreated={({gl})=>{gl.shadowMap.autoUpdate=false;gl.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();onContextLost();},{once:true});}}>
 <color attach="background" args={['#23384f']}/><fog attach="fog" args={['#23384f',65,250]}/><Stars radius={200} depth={80} count={450} factor={1.3} fade speed={0}/>
 <Reflections/><Lighting bounds={bounds}/>{project&&<District project={project} tasks={visibleTasks}/>}<Architecture tasks={visibleTasks} projects={visibleProjects} onSelect={onSelect}/>
 <CameraRig bounds={bounds} selected={selectedBounds} reset={reset} reducedMotion={reducedMotion}/><Finish/>
 {selectedBuilding&&<mesh position={[selectedBuilding.x,.43,selectedBuilding.z]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[1.85,1.93,48]}/><meshBasicMaterial color="#c0ffe3" toneMapped={false}/></mesh>}
 {pulse&&pulseProject&&<Pulse key={pulse.id+':'+pulse.version} task={pulse} project={pulseProject}/>}
 </Canvas>;
}
