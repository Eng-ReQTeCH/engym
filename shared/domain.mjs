export const TYPES = ['profile','routine','exercise','workout','draft','favorite'];
export const uid = () => crypto.randomUUID();
export function syncBatches(records,maxBytes=4000000){
 const batches=[[]];let bytes=32;const encoder=new TextEncoder();
 for(const record of records){const size=encoder.encode(JSON.stringify(record)).length+1;if(size+32>maxBytes)throw Error('A local record exceeds the sync request limit');let batch=batches.at(-1);if(batch.length>=100||bytes+size>maxBytes){batch=[];batches.push(batch);bytes=32;}batch.push(record);bytes+=size;}
 return batches;
}
export function volume(workout) { return (workout?.exercises || []).reduce((n,e)=>n+e.sets.filter(s=>s.done).reduce((v,s)=>v+Number(s.weight)*Number(s.reps),0),0); }
export function estimatedMax(weight,reps) { return reps===1 ? weight : weight*(1+reps/30); }
export function dots(totalKg,bodyKg,division){
 const male=division==='MALE',female=division==='FEMALE';if(!male&&!female)return null;
 if(bodyKg<40||bodyKg>(male?210:150)||!(totalKg>0))return null;
 const [a,b,c,d,e]=male?[-307.75076,24.0900756,-0.1918759221,0.0007391293,-0.000001093]:[-57.96288,13.6175032,-0.1126655495,0.0005158568,-0.0000010706];return totalKg*500/(a+b*bodyKg+c*bodyKg**2+d*bodyKg**3+e*bodyKg**4);
}
export function leaderboardStats(workouts,profile={}){
 const ordered=[...workouts].sort((a,b)=>a.finishedAt-b.finishedAt),best=new Map();let prs=0;
 for(const w of ordered)for(const ex of w.exercises){const max=Math.max(0,...ex.sets.filter(s=>s.done).map(s=>estimatedMax(s.weight,s.reps)));if(max>(best.get(ex.id)||0)){prs++;best.set(ex.id,max);}}
 const dates=new Set(ordered.map(w=>new Date(w.finishedAt).toISOString().slice(0,10)));let streak=0,maxStreak=0,previous=0;for(const day of [...dates].sort()){const stamp=Date.parse(day);streak=stamp-previous===86400000?streak+1:1;maxStreak=Math.max(maxStreak,streak);previous=stamp;}
 const singles=['squat','bench','deadlift'].map(id=>Math.max(0,...ordered.flatMap(w=>w.exercises.filter(e=>e.id===id).flatMap(e=>e.sets.filter(s=>s.done&&s.reps===1).map(s=>s.weight)))));
 const bodyKg=profile.unit==='kg'?Number(profile.bodyWeight):Number(profile.bodyWeight)/2.2046226218;
 return {volume:ordered.reduce((n,w)=>n+volume(w),0),sessions:ordered.length,prs,streak:maxStreak,dots:singles.every(x=>x>0)?dots(singles.reduce((a,b)=>a+b,0)/2.2046226218,bodyKg,profile.division):null};
}
export function validateRecord(r) {
  if (!r || typeof r.id!=='string' || !/^[\w-]{1,100}$/.test(r.id) || !TYPES.includes(r.type) || !Number.isInteger(r.baseVersion) || r.baseVersion<0 || typeof r.mutationId!=='string' || r.mutationId.length>100) throw Error('Invalid record envelope');
  if (!r.deleted && (!r.data || typeof r.data!=='object' || Array.isArray(r.data))) throw Error('Invalid record data');
  if (JSON.stringify(r.data||{}).length>500000) throw Error('Record too large');
  if((r.id==='profile')!==(r.type==='profile'))throw Error('Invalid profile record ID');
  if(!r.deleted&&r.type==='routine'){
    if(typeof r.data.name!=='string'||!r.data.name.trim()||r.data.name.length>100||!Array.isArray(r.data.exercises)||r.data.exercises.length<1||r.data.exercises.length>100||r.data.exercises.some(id=>typeof id!=='string'||!/^[-\w]{1,100}$/.test(id)))throw Error('Invalid routine');
    if(r.data.restSeconds!==undefined&&(!Number.isInteger(r.data.restSeconds)||r.data.restSeconds<0||r.data.restSeconds>1800))throw Error('Invalid rest duration');
    for(const t of Object.values(r.data.targets||{})){if(t.sets!==undefined&&(!Number.isInteger(t.sets)||t.sets<1||t.sets>30)||t.reps!==undefined&&(!Number.isInteger(t.reps)||t.reps<1||t.reps>1000)||t.minutes!==undefined&&(!Number.isFinite(t.minutes)||t.minutes<=0||t.minutes>1440)||t.speed!==undefined&&(!Number.isFinite(t.speed)||t.speed<0||t.speed>100))throw Error('Invalid exercise targets');}
  }
  if(!r.deleted&&r.type==='exercise'&&(typeof r.data.name!=='string'||!r.data.name.trim()||r.data.name.length>100))throw Error('Invalid exercise name');
  if(r.type==='profile'&&!r.deleted){if(r.data.name!==undefined&&(typeof r.data.name!=='string'||r.data.name.length>80))throw Error('Invalid profile name');if(r.data.avatar!=null&&(typeof r.data.avatar!=='string'||r.data.avatar.length>100000||!/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/=]+$/.test(r.data.avatar)))throw Error('Invalid profile photo');}
  if(r.type==='workout'&&!r.deleted) {
    if(!Array.isArray(r.data.exercises)||r.data.exercises.length>100||!Number.isFinite(r.data.startedAt)||r.data.startedAt<0||r.data.startedAt>Date.now()+300000||r.data.finishedAt&&(!Number.isFinite(r.data.finishedAt)||r.data.finishedAt<r.data.startedAt||r.data.finishedAt>Date.now()+300000))throw Error('Invalid workout');
    if(r.data.difficulty!==undefined&&(!Number.isInteger(r.data.difficulty)||r.data.difficulty<1||r.data.difficulty>10))throw Error('Invalid difficulty');
    for(const e of r.data.exercises) {if(typeof e.id!=='string'||!/^[-\w]{1,100}$/.test(e.id)||typeof e.name!=='string'||e.name.length>100||!Array.isArray(e.sets)||e.sets.length>100)throw Error('Invalid exercise');for(const s of e.sets)if(!Number.isFinite(s.weight)||s.weight<0||s.weight>3000||!Number.isInteger(s.reps)||s.reps<0||s.reps>1000||typeof s.done!=='boolean')throw Error('Invalid set');if(e.mode==='cardio')for(const s of e.sets)if(s.done&&(!Number.isFinite(s.minutes)||s.minutes<=0||s.minutes>1440||!Number.isFinite(s.speed)||s.speed<0||s.speed>100||!['km/h','mph'].includes(s.speedUnit)))throw Error('Invalid treadmill set');}
  }
}
export const catalog = [
 ['squat','Barbell Back Squat','quads','barbell'],['incline-db','Incline DB Press','chest','dumbbell'],['deadlift','Conventional Deadlift','posterior','barbell'],['rdl','Romanian Deadlift','hamstrings','barbell'],['lateral','Lateral Raises','shoulders','dumbbell'],['bench','Barbell Bench Press','chest','barbell'],['incline','Incline Barbell Bench','chest','barbell'],['ohp','Overhead Press','shoulders','barbell'],['row','Barbell Row','back','barbell'],['pullup','Pull-Up','back','bodyweight'],['curl','Dumbbell Curl','arms','dumbbell'],['pushdown','Triceps Pushdown','arms','cable']
].map(([id,name,muscle,equipment])=>({id,name,muscle,equipment}));
export const routines = [];
export const commonExercises = [
['db-bench','Dumbbell Bench Press','chest','dumbbell'],['db-incline','Incline Dumbbell Press','chest','dumbbell'],['db-fly','Dumbbell Fly','chest','dumbbell'],['db-shoulder','Dumbbell Shoulder Press','shoulders','dumbbell'],['db-lateral','Dumbbell Lateral Raise','shoulders','dumbbell'],['db-row','Single Arm Dumbbell Row','back','dumbbell'],['db-rdl','Dumbbell Romanian Deadlift','hamstrings','dumbbell'],['goblet','Goblet Squat','legs','dumbbell'],['db-lunge','Dumbbell Lunge','legs','dumbbell'],['db-curl','Dumbbell Curl','arms','dumbbell'],['hammer','Hammer Curl','arms','dumbbell'],['db-triceps','Dumbbell Triceps Extension','arms','dumbbell'],['chest-machine','Chest Press Machine','chest','machine'],['pec-deck','Pec Deck','chest','machine'],['lat-pulldown','Lat Pulldown','back','machine'],['seated-row','Seated Cable Row','back','machine'],['shoulder-machine','Shoulder Press Machine','shoulders','machine'],['leg-press','Leg Press','legs','machine'],['leg-extension','Leg Extension','legs','machine'],['leg-curl','Seated Leg Curl','hamstrings','machine'],['calf-machine','Calf Raise Machine','legs','machine'],['hip-abductor','Hip Abductor','legs','machine'],['cable-curl','Cable Curl','arms','machine'],['cable-pushdown','Cable Triceps Pushdown','arms','machine'],['cable-facepull','Cable Face Pull','shoulders','machine'],['assisted-pullup','Assisted Pull-Up','back','machine'],['treadmill','Treadmill','cardio','treadmill']
].map(([id,name,muscle,equipment])=>({id,name,muscle,equipment,mode:equipment==='treadmill'?'cardio':'strength'}));
catalog.push(...commonExercises);
