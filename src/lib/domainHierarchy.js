import {readKV} from './appConfigKV.js';
export const domainHierarchyKey='domain_hierarchy';
export function applyDomainHierarchy(domains,hierarchy={}){
 const ids=new Set(domains.map(d=>d.id)),parents=hierarchy?.parents||{};
 return domains.map(d=>{let parent=parents[d.id]||null;const seen=new Set([d.id]);let cursor=parent;while(cursor){if(!ids.has(cursor)||seen.has(cursor)){parent=null;break;}seen.add(cursor);cursor=parents[cursor]||null;}return {...d,parent_domain_id:parent};});
}
export async function loadDomainHierarchy(db,domains){return applyDomainHierarchy(domains,await readKV(db,domainHierarchyKey));}
export function descendantDomainIds(domains,id){const ids=new Set([id]);let changed=true;while(changed){changed=false;for(const d of domains)if(d.parent_domain_id&&ids.has(d.parent_domain_id)&&!ids.has(d.id)){ids.add(d.id);changed=true;}}return ids;}
export function domainPath(domains,id){const byId=new Map(domains.map(d=>[d.id,d])),parts=[],seen=new Set();while(byId.has(id)&&!seen.has(id)){seen.add(id);const d=byId.get(id);parts.unshift(d.name);id=d.parent_domain_id;}return parts.join(' / ');}
