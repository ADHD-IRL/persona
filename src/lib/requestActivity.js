let snapshot=[];const listeners=new Set();let next=0;
export const subscribeRequests=listener=>{listeners.add(listener);return()=>listeners.delete(listener);};
export const getRequests=()=>snapshot;
function publish(){for(const listener of listeners)listener();}
export function beginRequest(method='GET'){
 const id=++next;const request={id,label:method==='GET'?'Loading saved information':'Saving or processing your request',startedAt:Date.now()};snapshot=[...snapshot,request];publish();let finished=false;
 return ()=>{if(finished)return;finished=true;snapshot=snapshot.filter(item=>item.id!==id);publish();};
}
