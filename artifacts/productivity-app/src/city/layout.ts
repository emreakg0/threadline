import type { Project, Task } from '../types';
export function hash(value: string) { let h=2166136261; for(const c of value) h=Math.imul(h^c.charCodeAt(0),16777619); return h>>>0; }
// Square spiral maps each persistent integer slot to a unique city block.
export function spiral(n:number):[number,number] {
 if(n===0)return [0,0];
 const k=Math.ceil((Math.sqrt(n+1)-1)/2), side=2*k, d=(2*k+1)**2-1-n;
 if(d<side)return [k-d,-k];if(d<2*side)return [-k,-k+d-side];if(d<3*side)return [-k+d-2*side,k];return [k,k-d+3*side];
}
export const palette=['#8df2c7','#6bdcff','#b8a2fa','#ffc48d','#76dbc9','#ed9ec2'];
export function neighborhood(project:Project,page=0){const pair=(project.city_slot+page-1)*(project.city_slot+page)/2+page-1;const [x,z]=spiral(page===0?project.city_slot*2:pair*2+1);return {x:x*92,z:z*92,color:palette[hash(project.id)%palette.length]};}
export function building(task:Task,project:Project){const area=neighborhood(project,Math.floor(task.city_slot/256));const [x,z]=spiral(task.city_slot%256);return {x:area.x+x*4.5,z:area.z+z*4.5, height:({low:2.4,medium:4.3,high:7.2}[task.priority]??4.3)+(hash(task.id)%12)/10,style:hash(task.id)%3,color:area.color};}
