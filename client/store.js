import {uid} from './domain.mjs';
let db;
export async function openStore(){if(db)return db;db=await new Promise((resolve,reject)=>{const r=indexedDB.open('engym',1);r.onupgradeneeded=()=>{r.result.createObjectStore('records',{keyPath:'id'});r.result.createObjectStore('meta');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});return db;}
function request(r){return new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function meta(key,value){await openStore();const tx=db.transaction('meta',value===undefined?'readonly':'readwrite');return request(value===undefined?tx.objectStore('meta').get(key):tx.objectStore('meta').put(value,key));}
export async function all(type){await openStore();const rows=await request(db.transaction('records').objectStore('records').getAll());return rows.filter(r=>!r.deleted&&(!type||r.type===type));}
export async function get(id){if(id===undefined||id===null||id==='')return undefined;await openStore();return request(db.transaction('records').objectStore('records').get(id));}
export async function saveGuarded(type,id,data,baseline,deleted=false){
 const captured=structuredClone(data);await openStore();return new Promise((resolve,reject)=>{
  const tx=db.transaction('records','readwrite'),s=tx.objectStore('records');let result;
  const read=s.get(id);read.onsuccess=()=>{const old=read.result;const current=old&&!old.deleted?JSON.stringify(old.data):null;
   if(current!==baseline){const original={id,type,data:captured,version:old?.version||0,mutationId:uid(),deleted};s.put({id:'conflict-'+uid(),type:'draft',version:0,dirty:false,deleted:false,data:{kind:'conflict',record:original,remote:old||{id,type,data:{},version:0,deleted:true}}});result={conflict:true,record:old};}
   else{const record={id,type,data:captured,version:old?.version||0,dirty:true,deleted,mutationId:uid(),updatedAt:Date.now()};s.put(record);result={conflict:false,record};}
  };tx.oncomplete=()=>{window.dispatchEvent(new Event('engym:save'));resolve(result);};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Local transaction aborted'));
 });
}
export async function save(type,id,data,deleted=false){await openStore();return new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite'),s=tx.objectStore('records'),r=s.get(id);r.onsuccess=()=>{const old=r.result;s.put({id,type,data,deleted,version:old?.version||0,dirty:true,mutationId:uid(),updatedAt:Date.now()});};tx.oncomplete=()=>{window.dispatchEvent(new Event('engym:save'));resolve(id);};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Local transaction aborted'));});}
export async function applySync(sent,response){await openStore();return new Promise((resolve,reject)=>{const tx=db.transaction(['records','meta'],'readwrite'),s=tx.objectStore('records');const req=s.getAll();req.onsuccess=()=>{const rows=new Map(req.result.map(r=>[r.id,r]));for(const result of response.results){const local=rows.get(result.id),original=sent.find(r=>r.mutationId===result.mutationId);if(!local||!original)continue;
 if(result.conflict){s.put({...original,id:'conflict-'+uid(),type:'draft',version:0,data:{kind:'conflict',record:original,remote:result.record},dirty:false,deleted:false});if(local.mutationId===result.mutationId){const remote=result.record||{id:result.id,type:local.type,data:{},version:0,deleted:true};s.put({...remote,dirty:false});rows.set(result.id,{...remote,dirty:false});}else{local.version=result.record?.version||0;local.mutationId=uid();s.put(local);}}
 else{local.version=result.version;if(local.mutationId===result.mutationId)local.dirty=false;else local.mutationId=uid();s.put(local);}}
 for(const remote of response.records){const local=rows.get(remote.id);if(!local||!local.dirty)s.put({...remote,dirty:false});}
 tx.objectStore('meta').put(Date.now(),'lastSync');};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Local transaction aborted'));});}
export async function dirty(){await openStore();return (await request(db.transaction('records').objectStore('records').getAll())).filter(r=>r.dirty);}
