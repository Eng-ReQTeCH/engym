import {createCustomExercise} from './custom.js';
import {workoutJournal} from './journal.js';
import {activeWorkout} from './workout.js';

import {community} from './community.js';

import {exerciseMedia} from './media.js';

import {catalog,commonExercises} from './domain.mjs';

export async function newFlow(c){

 const {page,store,profile,saveProfile,go,unit,displayWeight,toLbs,esc}=c;

 const main=document.querySelector('main');

 if(location.pathname==='/'||location.pathname==='/index.html'){go('feed');return true;}

 const nav=document.querySelector('nav');if(nav)nav.innerHTML='<div class="flex justify-around items-center h-20">'+[['feed','Community'],['routines','Workout'],['exercises','Library'],['leaderboard','Ranks'],['analytics','Journal']].map(([p,n])=>`<a class="font-label-sm text-label-sm p-2 nav-destination ${p===page?'text-primary-container':''}" href="/${p}.html"><span class="material-symbols-outlined">${({feed:"groups",routines:"fitness_center",exercises:"exercise",leaderboard:"leaderboard",analytics:"book"})[p]}</span><span>${n}</span></a>`).join('')+'</div>';

 const paint=html=>{main.innerHTML=`<div class="flow-screen">${html}${['routines','exercises'].includes(page)?'<p class="media-credits"><a href="https://repdb.co" target="_blank" rel="noopener noreferrer">Exercise data by RepDB (repdb.co)</a></p>':''}</div>`;};

 const btn=(label,id)=>`<button class="flow-primary" id="${id}">${label}</button>`;

 const bind=(id,fn)=>document.getElementById(id)?.addEventListener('click',async event=>{const button=event.currentTarget;if(button.disabled)return;button.disabled=true;try{await fn();}catch(e){alert(e.message);}finally{button.disabled=false;}});

 const picture=e=>exerciseMedia.find(m=>m.id===e.id)?.images[0]||'/icon.svg';

 const exercises=[...[...commonExercises,...catalog.filter(e=>!commonExercises.some(c=>c.id===e.id))].map(e=>{const media=exerciseMedia.find(m=>m.id===e.id);return {...e,...media,name:media?.sourceName||e.name,muscle:media?.primaryMuscles.join(', ')||e.muscle};}),...(await store.all('exercise')).map(r=>({...r.data,id:r.id}))];

 const libraryExercises=exercises.filter((e,i)=>exercises.findIndex(x=>(x.sourceId||x.id)===(e.sourceId||e.id))===i);
 if(page==='feed'){const workouts=(await store.all('workout')).filter(r=>r.data.finishedAt);const days=new Set(workouts.map(r=>new Date(r.data.finishedAt).toLocaleDateString()));let streak=0;const date=new Date();if(!days.has(date.toLocaleDateString()))date.setDate(date.getDate()-1);while(days.has(date.toLocaleDateString())){streak++;date.setDate(date.getDate()-1);}const reminder=document.createElement('aside');reminder.className='streak-reminder';reminder.innerHTML=`<span class="material-symbols-outlined">local_fire_department</span><div><strong>${streak} day training streak</strong><p>${days.has(new Date().toLocaleDateString())?'Workout saved today. Keep showing up.':'Make time for your next workout.'}</p></div><a href="/routines.html">Train</a>`;main._streakReminder=reminder;}

 if(page==='signup')return false;

 if(['goals','experience','baseline'].includes(page)){if(profile.unitChosen){profile.onboarded=true;await saveProfile();go('routines');return true;}paint('<h1>Your preferred units</h1><p>Choose once. You can switch units for an individual machine while logging.</p><select id="units"><option value="kg">Kilograms · km/h</option><option value="lbs">Pounds · mph</option></select>'+btn('Create my first routine','continue'));bind('continue',async()=>{profile.unit=document.getElementById('units').value;profile.unitChosen=true;profile.onboarded=true;await saveProfile();go('routines');});return true;}

 if(page==='routines'){

 const unfinished=(await store.all('workout')).find(w=>!w.data.finishedAt);const history=(await store.all('workout')).filter(w=>w.data.finishedAt).sort((a,b)=>b.data.finishedAt-a.data.finishedAt);

 const rows=(await store.all('routine')).filter(r=>!['ppl','upper','full'].includes(r.id));

 paint('<div class="workout-banner"><span class="material-symbols-outlined">fitness_center</span><h1>Your workouts</h1><p>Your plan. Your pace. Saved on your device.</p></div>'+(unfinished?'<a class="resume-workout" href="/workout.html"><span class="material-symbols-outlined">play_circle</span> Resume '+esc(unfinished.data.name)+'</a>':'')+btn(rows.length?'Create routine':'Create your first routine','create')+rows.map(r=>`<article class="flow-card"><h2>${esc(r.data.name)}</h2><p>${r.data.exercises.length} exercises</p>${btn('Start workout','start-'+r.id)}<button class="engym-action" id="edit-${r.id}">Edit routine</button><button class="engym-action" id="delete-${r.id}">Delete routine</button></article>`).join(''));

 bind('create',()=>go('routines','?create=1'));for(const r of rows){bind('delete-'+r.id,async()=>{if(!confirm('Delete this routine? Your workout history stays saved.'))return;await store.save('routine',r.id,r.data,true);go('routines');});bind('edit-'+r.id,()=>go('routines','?edit='+r.id));bind('start-'+r.id,async()=>{const existing=(await store.all('workout')).find(w=>!w.data.finishedAt);if(existing){go('workout');return;}const id=crypto.randomUUID();const data={name:r.data.name,routineId:r.id,startedAt:Date.now(),restUntil:0,restSeconds:r.data.restSeconds??90,exercises:r.data.exercises.map(id=>{const e=exercises.find(e=>e.id===id)||{id,name:id};const target=r.data.targets?.[id]||{};const previous=history.flatMap(w=>w.data.exercises).find(ex=>ex.id===id&&ex.sets.some(s=>s.done));return {id:e.id,name:e.name,mode:e.mode,equipment:e.equipment,previous:previous?.sets.filter(s=>s.done)||[],sets:Array.from({length:target.sets||3},(_,index)=>({weight:previous?.sets.filter(s=>s.done)[index]?.weight||previous?.sets.find(s=>s.done)?.weight||0,reps:target.reps||10,minutes:target.minutes||10,speed:target.speed||5,speedUnit:r.data.speedUnit|| (unit()==='kg'?'km/h':'mph'),done:false}))};})};await store.save('workout',id,data);go('workout');});}

 const query=new URLSearchParams(location.search);if(query.has('create')||query.has('edit')){

 const old=query.has('edit')?await store.get(query.get('edit')):null;const r=old?.data||(await store.meta('routine-builder-draft'))||{name:'',exercises:[],targets:{},restSeconds:90,speedUnit:unit()==='kg'?'km/h':'mph'};const baseline=old?JSON.stringify(old.data):null;const selected=new Set(r.exercises);

 paint('<h1>'+ (old?'Edit routine':'Create routine')+'</h1><label>Workout name<input id="name" placeholder="My push workout" value="'+esc(r.name)+'"></label><label>Rest between sets (seconds)<input id="rest" type="number" min="0" max="1800" value="'+r.restSeconds+'"></label><h2>Your exercise order</h2><p class="builder-hint">Drag the grip to reorder. Tap an exercise to configure sets.</p><div id="selected-movements"></div><h2>Add exercises</h2><button class="engym-action" id="custom-exercise">Add custom exercise</button><input id="search" placeholder="Find an exercise or muscle"><div id="movements"></div>'+btn('Save routine','save'));

 const stash=()=>{if(!old)store.meta('routine-builder-draft',{...r,name:document.getElementById('name').value,restSeconds:Number(document.getElementById('rest').value),exercises:[...selected]});};document.getElementById('name').oninput=stash;document.getElementById('rest').oninput=stash;

 const render=()=>{

 const ordered=[...selected];document.getElementById('selected-movements').innerHTML=ordered.map((id,index)=>{const e=exercises.find(e=>e.id===id)||{id,name:id};const t=r.targets?.[id]||{};return `<article class="selected-exercise" data-order="${id}" draggable="true"><button type="button" class="drag-grip" aria-label="Drag ${esc(e.name)} to reorder"><span class="material-symbols-outlined">drag_indicator</span></button><img src="${picture(e)}" alt="${esc(e.name)}"><details><summary>${index+1}. ${esc(e.name)}<small>${t.sets||3} sets · ${e.mode==='cardio'?(t.minutes||10)+' min':(t.reps||10)+' reps'}</small></summary><div class="target-fields"><label>Sets<input data-target="${id}" data-key="sets" type="number" min="1" max="30" value="${t.sets||3}"></label>${e.mode==='cardio'?`<label>Minutes<input data-target="${id}" data-key="minutes" type="number" min="1" value="${t.minutes||10}"></label><label>Speed (${esc(r.speedUnit|| (unit()==='kg'?'km/h':'mph'))})<input data-target="${id}" data-key="speed" type="number" min="0.1" step="0.1" value="${t.speed||5}"></label>`:`<label>Reps<input data-target="${id}" data-key="reps" type="number" min="1" max="1000" value="${t.reps||10}"></label>`}</div></details><div class="order-actions"><button data-up="${id}" aria-label="Move ${esc(e.name)} up">↑</button><button data-down="${id}" aria-label="Move ${esc(e.name)} down">↓</button><button data-remove="${id}" aria-label="Remove ${esc(e.name)}">×</button></div></article>`;}).join('')||'<p class="empty-builder">Add your first movement below.</p>';

 const reorder=(from,to)=>{if(to<0||to>=ordered.length||from===to)return;const next=[...ordered];const [item]=next.splice(from,1);next.splice(to,0,item);selected.clear();next.forEach(id=>selected.add(id));stash();render();};

 document.querySelectorAll('[data-order]').forEach(card=>{card.ondragstart=e=>{e.dataTransfer.setData('text/plain',card.dataset.order);card.classList.add('dragging');};card.ondragover=e=>e.preventDefault();card.ondrop=e=>{e.preventDefault();reorder(ordered.indexOf(e.dataTransfer.getData('text/plain')),ordered.indexOf(card.dataset.order));};const grip=card.querySelector('.drag-grip');grip.onpointerdown=e=>{e.preventDefault();grip.setPointerCapture(e.pointerId);card.classList.add('dragging');};grip.onpointermove=e=>{if(card.classList.contains('dragging')){if(e.clientY>innerHeight-110)window.scrollBy(0,12);if(e.clientY<100)window.scrollBy(0,-12);}};grip.onpointercancel=()=>card.classList.remove('dragging');grip.onpointerup=e=>{card.classList.remove('dragging');const target=document.elementsFromPoint(e.clientX,e.clientY).map(el=>el.closest('[data-order]')).find(el=>el&&el!==card);if(target)reorder(ordered.indexOf(card.dataset.order),ordered.indexOf(target.dataset.order));};});

 for(const action of ['up','down','remove'])document.querySelectorAll('[data-'+action+']').forEach(button=>button.onclick=()=>{const id=button.dataset[action];if(action==='remove'){selected.delete(id);stash();render();}else reorder(ordered.indexOf(id),ordered.indexOf(id)+(action==='up'?-1:1));});

 const query=document.getElementById('search').value.toLowerCase();document.getElementById('movements').innerHTML=libraryExercises.filter(e=>!selected.has(e.id)&&![...selected].some(id=>exercises.find(x=>x.id===id)?.sourceId&&exercises.find(x=>x.id===id)?.sourceId===e.sourceId)&&(e.name+' '+e.muscle).toLowerCase().includes(query)).map(e=>`<button class="exercise-picker" data-add="${e.id}"><img loading="lazy" src="${picture(e)}" alt="${esc(e.name)}"><span><strong>${esc(e.name)}</strong><small>${esc(e.muscle)}</small></span><span class="material-symbols-outlined">add_circle</span></button>`).join('');document.querySelectorAll('[data-add]').forEach(button=>button.onclick=()=>{selected.add(button.dataset.add);stash();render();});document.querySelectorAll('[data-target]').forEach(input=>input.onchange=()=>{r.targets??={};r.targets[input.dataset.target]??={};r.targets[input.dataset.target][input.dataset.key]=Number(input.value);stash();});};document.getElementById('search').oninput=render;bind('custom-exercise',()=>createCustomExercise(c,async e=>{exercises.push(e);libraryExercises.push(e);selected.add(e.id);stash();render();}));render();bind('save',async()=>{const name=document.getElementById('name').value.trim();if(!name||name.length>100||!selected.size)throw Error('Name your workout and choose exercises.');const rest=Number(document.getElementById('rest').value);if(!Number.isInteger(rest)||rest<0||rest>1800)throw Error('Rest must be between 0 and 1800 seconds');for(const t of Object.values(r.targets||{})){if(t.sets!==undefined&&(!Number.isInteger(t.sets)||t.sets<1||t.sets>30))throw Error('Use 1–30 whole sets');if(t.reps!==undefined&&(!Number.isInteger(t.reps)||t.reps<1||t.reps>1000))throw Error('Use whole positive reps');if(t.minutes!==undefined&&(!Number.isFinite(t.minutes)||t.minutes<=0||t.minutes>1440)||t.speed!==undefined&&(!Number.isFinite(t.speed)||t.speed<0||t.speed>100))throw Error('Enter valid treadmill targets');}const result=await store.saveGuarded('routine',old?.id||crypto.randomUUID(),{...r,name,exercises:[...selected],restSeconds:rest,speedUnit:r.speedUnit|| (unit()==='kg'?'km/h':'mph')},baseline);if(result.conflict)throw Error('Remote edits were preserved. Reload to review the current routine.');if(!old)await store.meta('routine-builder-draft',null);go('routines');});

 }return true;}

 if(page==='workout'){await activeWorkout(c,picture);return true;}

 if(page==='summary'){await workoutJournal(c);return true;}
 if(page==='analytics'){const rows=(await store.all('workout')).filter(r=>r.data.finishedAt).sort((a,b)=>b.data.finishedAt-a.data.finishedAt);paint('<h1>Your workout journal</h1><p>Photos, notes and sessions saved on your device.</p>'+(rows.length?'':'<p class="engym-empty">Your story starts with your first workout.</p><a class="engym-action" href="/routines.html">Start training</a>')+rows.map(r=>`<a class="flow-card" href="/summary.html?id=${r.id}">${r.data.photo?`<img class="flow-hero" src="${r.data.photo}" alt="Your workout photo">`:''}<h2>${esc(r.data.name)}</h2><p>${new Date(r.data.finishedAt).toLocaleDateString()}</p><p>${esc(r.data.notes||'')}</p><p>${r.data.difficulty?'Difficulty '+r.data.difficulty+'/10':''}</p></a>`).join(''));return true;}

 if(page==='detail'){const e=exercises.find(e=>e.id===new URLSearchParams(location.search).get('id'));paint(`<h1>${esc(e?.name||'Exercise')}</h1>${e?`<img class="flow-hero" src="${picture(e)}" alt="Equipment illustration"><p>${esc(e.muscle)} · ${esc(e.equipment)}</p>`:''}<a class="engym-action" href="/exercises.html">Back to library</a>`);return true;}

 if(page==='exercises'){paint('<h1>Exercise library</h1><button class="engym-action" id="custom-exercise">Add custom exercise</button><label>Find a movement<input id="library-search" placeholder="Exercise, muscle or equipment" type="search"></label>'+libraryExercises.map(e=>`<article class="flow-exercise"><img src="${picture(e)}" alt="${esc(e.equipment)} illustration"><div><h2>${esc(e.name)}</h2><p>Primary: ${esc(e.muscle)}</p><p>Secondary: ${esc(e.secondaryMuscles?.join(', ')||'—')}</p><details><summary>Movement guide</summary>${e.images?.slice(1).map(src=>`<img src="${src}" alt="${esc(e.name)} end position">`).join('')||''}<ol>${e.instructions?.map(text=>`<li>${esc(text)}</li>`).join('')||''}</ol></details></div></article>`).join(''));bind('custom-exercise',()=>createCustomExercise(c,()=>go('exercises')));document.getElementById('library-search').oninput=event=>{document.querySelectorAll('.flow-exercise').forEach(card=>card.hidden=!card.textContent.toLowerCase().includes(event.target.value.toLowerCase()));};return true;}

 if(await community(c))return true;

 return false;

}

