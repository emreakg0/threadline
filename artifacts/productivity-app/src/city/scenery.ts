import type { Project, Task } from '../types';
import { building, hash } from './layout';
import { districtBlocks } from './composition';
export type V=[number,number,number];
export type Piece={p:V;s:V;color:string;rotation?:V;task?:Task};
export type GeometrySet={solid:Piece[];smooth:Piece[];round:Piece[];leaf:Piece[];roof:Piece[];glow:Piece[];glass:Piece[]};
export const geometrySet=():GeometrySet=>({solid:[],smooth:[],round:[],leaf:[],roof:[],glow:[],glass:[]});
export function put(list:Piece[],p:V,s:V,color:string,rotation?:V,task?:Task){list.push({p,s,color,rotation,task});}
const walls=['#426d86','#72998e','#af8d6b','#527d78','#aa7767','#4c6487'];
export function architecture(tasks:Task[],projects:Project[]):GeometrySet {
 const a=geometrySet();const map=new Map(projects.map(p=>[p.id,p]));
 for(const task of tasks){const project=map.get(task.project_id);if(!project)continue;
  const b=building(task,project),h=b.height,seed=hash(task.id),style=seed%4,done=task.status==='done',active=task.status==='in_progress';
  const wall=walls[seed%walls.length],trim='#9eafa9',dark='#304f61',warm=done?'#ffd08a':active?'#e8c78f':'#bfa675';
  const add=(list:Piece[],dx:number,y:number,dz:number,s:V,color:string,r?:V)=>put(list,[b.x+dx,y,b.z+dz],s,color,r,task);
  add(a.smooth,0,.16,0,[3.45,.32,3.45],'#b3bcb9');add(a.solid,0,.34,0,[2.9,.12,2.9],'#687d87');
  if(style===1){
   add(a.round,0,h/2+.4,0,[2.65,h,2.65],wall);
   for(let y=.85;y<h+.4;y+=.65){add(a.round,0,y,0,[2.73,.085,2.73],trim);for(let i=0;i<12;i++){const angle=i*Math.PI/6;add(a.glow,Math.sin(angle)*1.335,y+.23,Math.cos(angle)*1.335,[.32,.29,.035],(done||(seed+i+Math.floor(y))%5===0)?warm:'#344f60',[0,angle,0]);}}
   add(a.round,0,h+.48,0,[2.9,.22,2.9],dark);add(a.round,0,h+.64,0,[2.72,.09,2.72],b.color);add(a.round,0,h+.85,0,[1.7,.35,1.7],trim);
   add(a.roof,0,h+1.2,0,[1.8,.45,1.8],'#496e7c');
  }else{
   const width=style===2?2.65:2.35,depth=style===3?2.65:2.35;
   add(a.smooth,0,h/2+.4,0,[width,h,depth],wall);
   // Deep window reveals, recessed glazing, warm inset windows and continuous floor cornices.
   for(let floor=0;floor<Math.floor(h/.65);floor++){const y=.95+floor*.63;
    for(const side of [-1,1])for(let col=0;col<3;col++){const offset=(col-1)*.65,c=done||(seed+floor*3+col)%6===0?warm:'#345263';
     add(a.solid,offset,y,side*(depth/2+.015),[.47,.43,.065],dark);add(a.glow,offset,y,side*(depth/2+.055),[.33,.31,.02],c);add(a.solid,offset,y-.24,side*(depth/2+.1),[.52,.07,.18],trim);
     add(a.solid,side*(width/2+.015),y,offset,[.065,.43,.47],dark);add(a.glow,side*(width/2+.055),y,offset,[.02,.31,.33],c);
    }
    if(floor%2===0)add(a.solid,0,y-.34,0,[width+.16,.09,depth+.16],trim);
   }
   for(const x of [-1,1])for(const z of [-1,1])add(a.solid,x*width/2,h/2+.45,z*depth/2,[.12,h+.12,.12],trim);
   add(a.solid,0,h+.48,0,[width+.26,.23,depth+.26],dark);add(a.glow,0,h+.6,0,[width+.27,.035,depth+.27],done?b.color:'#668b98');
   if(style===0){
    add(a.solid,0,h+.97,0,[1.65,.9,1.65],wall);add(a.solid,0,h+1.45,0,[1.85,.12,1.85],trim);add(a.roof,0,h+1.75,0,[1.8,.6,1.8],dark,[0,Math.PI/4,0]);
    for(const x of [-.5,.5])add(a.glow,x,h+1, .85,[.27,.35,.03],warm);
   }else if(style===2){
    add(a.solid,.8,h+.9,0,[.7,1.3,1.65],wall);add(a.solid,.8,h+1.6,0,[.88,.12,1.8],trim);
    add(a.glass,-.55,h+.75,-.2,[.85,.08,1.25],'#358697',[-.28,0,0]);
    for(const z of [-.7,.7])add(a.solid,-.7,h+.74,z,[.48,.38,.35],'#638473');
   }else{
    add(a.roof,0,h+1.15,0,[2.7,1.15,2.85],'#4b697e',[0,Math.PI/4,0]);add(a.solid,.7,h+1.45,-.6,[.32,.9,.38],'#b0ac9c');
   }
  }
  // Street-level entrance, canopy, rooftop equipment and service vents.
  add(a.glass,0,.95,1.37,[.75,1.1,.06],'#397f89');add(a.glow,0,1.6,1.55,[1.25,.055,.45],done?'#ffd796':'#83b9b9');add(a.solid,0,1.68,1.5,[1.4,.1,.65],dark);
  add(a.solid,-.55,h+.7,-.5,[.5,.26,.65],'#96a5a2');for(let z=-.7;z<-.2;z+=.15)add(a.solid,-.55,h+.85,z,[.42,.03,.025],'#536d7b');
  if(!done){ // Restrained construction railings and a rooftop hoist, rather than a dark unfinished cube.
   for(const x of [-1,1])add(a.solid,x*1.48,h/2+.4,1.48,[.045,h+.4,.045],'#d2ae6e');
   for(let y=1.5;y<h+1;y+=1.25)add(a.solid,0,y,1.48,[3,.045,.045],'#c3a574');
   add(a.solid,-1,h+1.05,-.8,[.055,1.2,.055],'#d2ae6e');add(a.solid,-.4,h+1.6,-.8,[1.25,.055,.055],'#d2ae6e');
  }else{add(a.glow,0,.44,1.73,[2.5,.035,.04],'#f2ce8c');}
  if(task.priority==='high'){add(a.round,0,h+1.8,0,[.06,1.3,.06],trim);add(a.glow,0,h+2.5,0,[.12,.14,.12],b.color);}
 }
 return a;
}
export function environment(project:Project,tasks:Task[]):GeometrySet {
 const a=geometrySet();const occupied=new Set(tasks.map(t=>{const b=building(t,project);return `${b.x},${b.z}`;}));
 const add=(list:Piece[],x:number,y:number,z:number,s:V,c:string,r?:V)=>put(list,[x,y,z],s,c,r);
 function tree(x:number,z:number,seed:number){add(a.round,x,.65,z,[.13,1.1,.13],'#765e50');add(a.leaf,x,1.35,z,[.95,1.25,.95],seed%2?'#376852':'#4c7e63');add(a.leaf,x+.2,1.85,z,[.7,.8,.7],'#63956d');add(a.solid,x,.14,z,[1.2,.25,1.2],'#496665');}
 function lamp(x:number,z:number){add(a.round,x,1.12,z,[.055,2.2,.055],'#5e7785');add(a.solid,x+.2,2.2,z,[.5,.08,.18],'#bdc5b9');add(a.glow,x+.2,2.15,z,[.36,.04,.13],'#ffe1a4');add(a.glow,x,.09,z,[.17,.025,.17],'#9ab8b0');}
 for(const block of districtBlocks(project,tasks)){
  const {minX,maxX,minZ,maxZ}=block,cx=(minX+maxX)/2,cz=(minZ+maxZ)/2,w=maxX-minX,d=maxZ-minZ;
  add(a.solid,cx,-.6,cz,[w+.45,1.1,d+.45],'#263f53');add(a.solid,cx,-.04,cz,[w,.12,d],'#607c87');add(a.solid,cx,-.38,cz,[w+.5,.08,d+.5],'#527584');
  // Narrow local roads with curbs, lane dashes and zebra crossings at real intersections.
  for(let x=minX+4.5;x<maxX;x+=4.5){add(a.solid,x,.035,cz,[1.25,.035,d],'#344957');for(const side of [-1,1])add(a.solid,x+side*.69,.085,cz,[.12,.12,d],'#9bafab');
   for(let z=minZ+.5;z<maxZ;z+=1.2)add(a.solid,x,.065,z,[.045,.012,.4],'#b5ae8b');}
  for(let z=minZ+4.5;z<maxZ;z+=4.5){add(a.solid,cx,.045,z,[w,.035,1.25],'#344957');for(const side of [-1,1])add(a.solid,cx,.085,z+side*.69,[w,.12,.12],'#9bafab');
   for(let x=minX+.5;x<maxX;x+=1.2)add(a.solid,x,.07,z,[.4,.012,.045],'#b5ae8b');
   for(let x=minX+4.5;x<maxX;x+=4.5){add(a.solid,x,.075,z,[1.25,.025,1.25],'#344957');for(let i=0;i<4;i++)add(a.solid,x-.45+i*.3,.1,z+.95,[.14,.018,.4],'#d1d5c5');}
  }
  // Every empty lot is scenery, never an extra task building or a clickable object.
  let props=0;
  for(let x=minX+2.25;x<maxX;x+=4.5)for(let z=minZ+2.25;z<maxZ;z+=4.5){const seed=hash(`${project.id}:${x}:${z}`);
   if(occupied.has(`${x},${z}`))continue;
   add(a.solid,x,.09,z,[3.65,.12,3.65],seed%3?'#3e6957':'#a3aaa0');
   if(seed%3===0){ // A plaza with a low fountain and seating.
    add(a.round,x,.23,z,[1.6,.3,1.6],'#c2c7b7');add(a.round,x,.4,z,[1.3,.05,1.3],'#438f9a');add(a.glow,x,.43,z,[.2,.045,.2],'#9ed9d0');
    for(const side of [-1,1]){add(a.solid,x+side*1.25,.42,z,[.25,.12,1.3],'#ad9579');add(a.solid,x+side*1.4,.62,z,[.08,.35,1.3],'#526d76');}
    tree(x-.9,z-1.15,seed);
   }else{tree(x-.65,z-.65,seed);tree(x+.7,z+.5,seed+1);add(a.solid,x+.5,.28,z-1.15,[1.3,.15,.28],'#b9a183');add(a.solid,x+.5,.47,z-1.28,[1.3,.3,.08],'#5a7177');}
   if(props++%2===0)lamp(x+1.63,z+1.63);
   if(seed%4===0){ // Parked compact cars, kept on the road shoulder.
    const car=(seed>>>2)%2?'#c6a07d':'#82b5b1';add(a.solid,x+2.05,.32,z,[.52,.35,1.05],car);add(a.glass,x+2.05,.56,z,[.45,.22,.57],'#2e566c');for(const zz of [-.35,.35])add(a.round,x+2.05,.2,z+zz,[.62,.22,.22],'#243745',[0,0,Math.PI/2]);add(a.glow,x+2.05,.32,z+.55,[.38,.08,.03],'#ffe3a3');
   }
  }
  for(const side of [-1,1])for(let n=0;n<3;n++)add(a.glow,cx+side*w/2,.04,minZ+1+n*1.3,[.035,.06,.65],block.color);
 }
 return a;
}
