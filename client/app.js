import {API_ORIGIN} from './config.js';

import {newFlow} from './flow.js';

import * as store from './store.js';

import {syncBatches} from './domain.mjs';

const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];

const page=document.body.dataset.page, fmt=n=>Number(n||0).toLocaleString(undefined,{maximumFractionDigits:1});

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const go=(p,query='')=>location.assign(`/${p}.html${query}`);

let profile={},profileBaseline=null,user=null;const serverURL=API_ORIGIN;let token=null,syncing=false,reachable=false;

let installPrompt;window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;});

let autoTimer;const safe=fn=>async(...args)=>{try{return await fn(...args);}catch(e){toast(e.message);}};

function on(s,event,fn){const e=typeof s==='string'?$(s):s;if(e)e.addEventListener(event,safe(fn));}

function toast(message){$('.engym-toast')?.remove();const e=document.createElement('div');e.className='engym-toast';e.role='status';e.textContent=message;document.body.append(e);setTimeout(()=>e.remove(),5000);}

function buttonText(re){return $$('button').filter(b=>re.test(b.textContent));}

function bindText(re,fn){buttonText(re).forEach(b=>on(b,'click',fn));}

function modal(title,html,setup){const d=document.createElement('dialog');d.innerHTML=`<h2>${esc(title)}</h2>${html}<div class="error" role="alert"></div><button type="button" data-close>Close</button>`;document.body.append(d);$('[data-close]',d).onclick=()=>d.close();d.addEventListener('close',()=>d.remove());d.showModal();setup?.(d);return d;}

function formModal(title,fields,submit,label='Save'){return modal(title,`<form>${fields}<button class="primary" type="submit">${esc(label)}</button></form>`,d=>{$('form',d).onsubmit=async e=>{e.preventDefault();const b=$('button[type=submit]',d);b.disabled=true;try{await submit(new FormData(e.target));d.close();}catch(e){$('.error',d).textContent=e.message;}finally{b.disabled=false;}};});}

const field=(name,label,value='',type='text',extra='')=>`<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;

const listEmpty=text=>`<p class="engym-empty">${esc(text)}</p>`;

async function api(path,body,method=body?'POST':'GET'){if(!navigator.onLine)throw Error('You are offline. Your workouts are saved on this device.');const r=await fetch(serverURL+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},credentials:'include',body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)});const data=await r.json();if(!r.ok)throw Error(data.error||`Server error ${r.status}`);return data;}

async function saveProfile(){const result=await store.saveGuarded('profile','profile',profile,profileBaseline);if(result.conflict){profile=result.record?.data||{};profileBaseline=result.record&&!result.record.deleted?JSON.stringify(profile):null;throw Error('Profile changed on another device. Your edits are saved in profile conflict copies.');}profileBaseline=JSON.stringify(result.record.data);}

function syncStatus(text){$$('header span').filter(s=>/^(SYNCED|OFFLINE|LOCAL ONLY|BACKED UP|SIGN IN|PENDING|SYNCING…|SERVER OFFLINE|LIVE)$/.test(s.textContent.trim())).forEach(s=>s.textContent=text);}

let syncPromise;function sync(){if(syncPromise)return syncPromise;syncPromise=runSync().finally(()=>{syncPromise=null;});return syncPromise;}

async function runSync(){syncing=true;try{await api('/api/health');reachable=true;const identity=await api('/api/auth/me');user=identity.user;await store.meta('account',user);if(!user){syncStatus('LOCAL ONLY');return;}const owner=await store.meta('owner');if(owner&&owner!==user.id)throw Error('This device is linked to a different account. Sign in with the original account to protect its workouts.');await store.meta('owner',user.id);syncStatus('SYNCING…');const pending=await store.dirty();for(const batch of syncBatches(pending)){const response=await api('/api/sync',{mutations:batch.map(r=>({id:r.id,type:r.type,data:r.data,deleted:r.deleted,baseVersion:r.version,mutationId:r.mutationId}))});await store.applySync(batch,response);}const restored=await store.get('profile');if(restored&&!restored.deleted){for(const key of Object.keys(profile))delete profile[key];Object.assign(profile,restored.data);profileBaseline=JSON.stringify(restored.data);}syncStatus((await store.dirty()).length?'PENDING':'BACKED UP');window.dispatchEvent(new Event('engym:synced'));}catch(e){reachable=false;syncStatus(user?'SERVER OFFLINE':'LOCAL ONLY');}finally{syncing=false;}}

async function authenticate(mode,data){const existingOwner=await store.meta('owner');const result=await api('/api/auth/'+mode,data);if(existingOwner&&existingOwner!==result.user.id){await api('/api/auth/logout',{});throw Error('This device is linked to another account. Use the original account to keep its workouts private.');}token=result.token;user=result.user;await store.meta('account',user);await store.meta('owner',user.id);await sync();if(!profile.name){profile.name=user.name;profile.handle=user.handle;await saveProfile();await sync();}}

async function settings(){const conflicts=(await store.all('draft')).filter(r=>r.data.kind==='conflict');const unfinished=(await store.all('workout')).find(r=>!r.data.finishedAt);modal('Your profile',`<p>${esc(user?`${user.name} · @${user.handle}`:'Guest · records stay on this device')}</p><div class="row"><button data-nav="routines">Routines</button><button data-nav="feed">Community</button><button data-nav="leaderboard">Rankings</button><button data-nav="analytics">History</button></div><p>Your workouts save on this device first. When signed in, backup and restore happen automatically whenever Engym is open and online.</p><p>Last backup: ${esc((await store.meta('lastSync'))?new Date(await store.meta('lastSync')).toLocaleString():'Waiting for your first connection')}. ${conflicts.length?conflicts.length+' edits need review.':''}</p><div class="row"><button data-profile>Edit profile</button>${user?'<button data-password>Change password</button><button data-blocked>Blocked athletes</button>':''}<button data-account>${user?'Sign out':'Sign in / create account'}</button></div><p>Engym 1.0 · ${navigator.serviceWorker?.controller?'Ready for offline training':'Offline setup finishes after your first online visit'}.</p><button data-install>Install Engym</button><div data-conflicts></div>${unfinished?'<button data-discard>Discard active workout</button>':''}<p>Workouts are private. Only sessions you publish appear in feeds or rankings. Friends posts are visible to athletes you follow. Backups stay private in your Engym account.</p>`,d=>{

 on($('[data-install]',d),'click',async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;}else modal('Install Engym','<p>On iPhone: open in Safari, tap Share, then Add to Home Screen. On Android or desktop: open the browser menu and choose Install app or Add to Home Screen. Visit online first so offline assets can download.</p>');});

 $$('[data-nav]',d).forEach(b=>b.onclick=()=>go(b.dataset.nav));

 on($('[data-profile]',d),'click',()=>formModal('Profile',`${profile.avatar?`<img class="profile-preview" src="${esc(profile.avatar)}" alt="Your profile photo">`:''}<label>Profile photo<input name="avatar" type="file" accept="image/*"></label><label><input name="removeAvatar" type="checkbox"> Remove current photo</label>`+field('name','Name',profile.name,'text','maxlength="80" required')+field('weight','Body weight',profile.bodyWeight||'','number','min="1" max="1000" step="0.1"')+`<p>Join your gym from Community or Rankings.</p><label><input type="checkbox" name="broadcast" ${profile.broadcast?'checked':''}> Include my published workouts in leaderboards</label><label>Units<select name="unit"><option value="lbs">LBS</option><option value="kg" ${profile.unit==='kg'?'selected':''}>KG</option></select></label>`,async f=>{let avatar=f.get('removeAvatar')?null:profile.avatar;const file=f.get('avatar');if(file?.size){if(!file.type.startsWith('image/'))throw Error('Choose an image file');const bitmap=await createImageBitmap(file);const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const size=Math.min(bitmap.width,bitmap.height);canvas.getContext('2d').drawImage(bitmap,(bitmap.width-size)/2,(bitmap.height-size)/2,size,size,0,0,256,256);bitmap.close();avatar=canvas.toDataURL('image/jpeg',0.75);if(avatar.length>100000)avatar=canvas.toDataURL('image/jpeg',0.4);if(avatar.length>100000)throw Error('Please choose a smaller photo');}profile={...profile,avatar,name:f.get('name').trim(),bodyWeight:f.get('unit')!==unit()&&Number(f.get('weight'))===Number(profile.bodyWeight)?Number(f.get('weight'))*(f.get('unit')==='kg'?1/2.2046226218:2.2046226218):Number(f.get('weight')),unit:f.get('unit'),broadcast:f.get('broadcast')==='on'};await saveProfile();await sync();location.reload();}));

 on($('[data-password]',d),'click',()=>formModal('Change password',field('current','Current password','','password','required autocomplete="current-password"')+field('password','New password','','password','required minlength="10" maxlength="200" autocomplete="new-password"'),async f=>{await api('/api/auth/password',{current:f.get('current'),password:f.get('password')});toast('Password changed. Other devices are signed out.');}));

 on($('[data-blocked]',d),'click',async()=>{const {users}=await api('/api/blocks');modal('Blocked athletes',users.map(u=>`<p>${esc(u.name)} (@${esc(u.handle)}) <button data-unblock="${u.id}">Unblock</button></p>`).join('')||'<p>No blocked athletes.</p>',box=>{$$('[data-unblock]',box).forEach(b=>on(b,'click',async()=>{await api('/api/blocks',{target:b.dataset.unblock,block:false});b.closest('p').remove();}));});});

 on($('[data-account]',d),'click',async()=>{if(user){await api('/api/auth/logout',{});user=null;token=null;await store.meta('account',null);toast('Signed out. Local records retained.');d.close();}else go('login');});

 on($('[data-discard]',d),'click',async()=>{if(!confirm('Discard this unfinished workout and its sets? Completed sessions are retained.'))return;await store.save('workout',unfinished.id,unfinished.data,true);await store.meta('activeWorkout',null);go('routines');});

 const c=$('[data-conflicts]',d);c.innerHTML=conflicts.map(r=>`<div class="engym-record"><p>Conflicting ${esc(r.data.record.type)} · ${esc(r.data.record.data.name||r.data.record.id)}</p><button data-keep="${r.id}">Restore local version</button><button data-dismiss="${r.id}">Keep server version</button></div>`).join('');

 $$('[data-keep]',c).forEach(b=>on(b,'click',async()=>{const r=conflicts.find(r=>r.id===b.dataset.keep);const original=r.data.record;await store.save(original.type,original.id,original.data,original.deleted);await store.save('draft',r.id,r.data,true);toast('Local version queued for backup');d.close();}));

 $$('[data-dismiss]',c).forEach(b=>on(b,'click',async()=>{const r=conflicts.find(r=>r.id===b.dataset.dismiss);await store.save('draft',r.id,r.data,true);d.close();}));

 });}

async function initAuth(){

 if(page==='welcome'){replaceText($('main'),/Mean Velocity/g,'Offline capture');replaceText($('main'),/0\.58/g,'READY');replaceText($('main'),/m\/s/g,'LOCAL');replaceText($('main'),/RPE 8\.5/g,'LOG SETS');replaceText($('main'),/Barbell telemetry, real-time RPE velocity profiling, and high-stakes athletic leaderboards built for raw power\./g,'Track workouts offline, back up to your server, and connect with your training community.');on('#btn-signup','click',()=>go('signup'));on('#btn-login','click',()=>go('login'));on('#btn-guest','click',()=>go(profile.onboarded?'routines':'goals'));if(profile.onboarded&&location.pathname==='/')go('routines');}

 if(page==='signup'){profile.division=profile.division||'MALE';profile.unit=profile.unit||'lbs';

  $$('input').forEach(i=>{i.value='';i.required=true;});const form=$('#signupForm');const consent=$('#privacyConsentRow');if(consent){consent.tabIndex=0;consent.setAttribute('role','checkbox');consent.setAttribute('aria-checked','false');$('#consentToggle').style.opacity='0.3';on(consent,'click',()=>{profile.broadcast=consent.getAttribute('aria-checked')!=='true';consent.setAttribute('aria-checked',String(profile.broadcast));$('#consentToggle').style.opacity=profile.broadcast?'1':'0.3';});}$('#passwordInput').minLength=10;$('#handleInput').pattern='[a-zA-Z0-9_]{3,30}';const weight=$('input[type=number]');weight.value='';weight.min=1;weight.max=1000;

  on('#togglePasswordBtn','click',()=>$('#passwordInput').type=$('#passwordInput').type==='password'?'text':'password');

  $$('.division-btn').forEach(b=>on(b,'click',()=>{profile.division=b.textContent.trim();b.style.outline='1px solid #c3f400';}));

  const signupUnit=next=>{if(unit()!==next&&weight.value)weight.value=Number((Number(weight.value)*(next==='kg'?1/2.2046226218:2.2046226218)).toFixed(2));profile.unit=next;for(const [id,u]of [['unitLbs','lbs'],['unitKg','kg']]){$('#'+id).classList.toggle('bg-surface-container-high',u===next);$('#'+id).setAttribute('aria-pressed',String(u===next));}};on('#unitLbs','click',()=>signupUnit('lbs'));on('#unitKg','click',()=>signupUnit('kg'));

  replaceText($('main'),/AVAILABLE/g,'CHECK ON SAVE');const strength=()=>{const value=$('#passwordInput').value;$('#strengthLabel').textContent=value.length>=10?'LENGTH: VALID':'10+ CHARACTERS REQUIRED';const meter=$('#passwordInput').parentElement.nextElementSibling;if(meter)$$('div',meter).forEach((bar,i)=>bar.style.opacity=value.length>i*5?'1':'0.2');};on('#passwordInput','input',strength);strength();replaceText($('main'),/1 NUMERIC/g,'NUMERIC OPTIONAL');replaceText($('main'),/1 SYMBOL/g,'SYMBOL OPTIONAL');const divisionButtons=$$('.division-btn');divisionButtons.forEach(b=>on(b,'click',()=>{divisionButtons.forEach(x=>{const selected=x===b;x.classList.toggle('bg-surface-container-high',selected);x.classList.toggle('text-primary-fixed',selected);x.classList.toggle('bg-surface-container',!selected);x.classList.toggle('text-on-surface-variant',!selected);x.style.outline='';x.setAttribute('aria-pressed',String(selected));});}));

  on(form,'submit',async e=>{e.preventDefault();const inputs=$$('input',form);const data={name:inputs[0].value,handle:$('#handleInput').value,email:$('input[type=email]').value,password:$('#passwordInput').value};await authenticate('register',data);profile.unitChosen=true;profile.bodyWeight=Number(weight.value);await saveProfile();go('goals');});

  $$('a').filter(a=>/LOG IN|ACCESS ID/.test(a.textContent)).forEach(a=>a.href='/login.html');

 }

 if(page==='login'){replaceText($('main'),/ENGYM CLOUD NODE 04/g,'YOUR BACKUP SERVER');replaceText($('main'),/LATENCY 14MS/g,'CONNECT TO SIGN IN');replaceText($('main'),/SECURE/g,location.protocol==='https:'?'HTTPS':'LOCAL');replaceText($('main'),/sync offline sensor sets/g,'back up offline workout records');$('#athlete-id').placeholder='Handle or email';const quick=buttonText(/fitness_center/).find(b=>b.textContent.includes('Local athlete')||b.textContent.includes(profile.handle||'Local athlete'));if(quick&&!profile.handle)quick.remove();if(quick&&profile.handle)on(quick,'click',()=>{$('#athlete-id').value=profile.handle||'';$('#athlete-id').focus();});$('#athlete-id').value='';$('#passcode').value='';$('#passcode').minLength=10;on('#toggle-password','click',()=>$('#passcode').type=$('#passcode').type==='password'?'text':'password');on('#auth-submit','click',async()=>{await authenticate('login',{login:$('#athlete-id').value,password:$('#passcode').value});const restored=await store.get('profile');if(restored){profile=restored.data;profileBaseline=JSON.stringify(profile);}go('routines');});bindText(/REGISTER|INITIALIZE ATHLETE/,()=>go('signup'));bindText(/FORGOT PASSCODE/,()=>modal('Account recovery','<p>Ask your server administrator to reset your account credentials using the documented recovery command. Your device records remain available offline.</p>'));}

 buttonText(/GOOGLE|^Google$/i).forEach(button=>button.remove());
 if(page==='login'&&new URLSearchParams(location.search).get('oauth')){const identity=await api('/api/auth/me');if(!identity.user)throw Error('Google sign-in session was not available.');const owner=await store.meta('owner');if(owner&&owner!==identity.user.id)throw Error('Sign in with this device’s original account to keep its workouts private.');user=identity.user;await store.meta('account',user);await store.meta('owner',user.id);if(!profile.name){profile.name=user.name;profile.handle=user.handle;await saveProfile();}await sync();const restored=await store.get('profile');if(restored){profile=restored.data;profileBaseline=JSON.stringify(profile);}go(profile.onboarded?'routines':'goals');}



 $$('a').filter(a=>/Terms|Privacy|Biometric/.test(a.textContent)).forEach(a=>on(a,'click',e=>{e.preventDefault();modal('Engym data policy','<p>Engym stores your workout and profile data on your device. Signed-in records are backed up automatically to Engym. Social posts are visible only after explicit publication. Your server administrator controls retention and access.</p>');}));

 const back={signup:'welcome',login:'welcome',goals:'welcome',experience:'goals',baseline:'experience'}[page];if(back)$$('button[aria-label^="Go back"]').forEach(b=>on(b,'click',()=>go(back)));

}

const unit=()=>profile.unit||'lbs',displayWeight=n=>unit()==='kg'?n/2.2046226218:n,toLbs=n=>unit()==='kg'?n*2.2046226218:n;

function replaceText(root,re,replacement){const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);for(const n of nodes)if(re.test(n.textContent))n.textContent=n.textContent.replace(re,replacement);}

async function init(){await store.openStore();const profileRecord=await store.get('profile');profile=profileRecord?.data||{};profileBaseline=profileRecord&&!profileRecord.deleted?JSON.stringify(profile):null;await store.meta('server',null);user=await store.meta('account')||null;

 $$('a[data-path]').forEach(a=>{a.href=`/${a.dataset.path==='library'?'exercises':a.dataset.path}.html`;if(a.dataset.path==='workout')a.href='/workout.html';});

 $$('header button').filter(b=>$('img',b)).forEach(b=>{b.setAttribute('aria-label','Profile & help');on(b,'click',settings);});$$('img[alt*="ENGYM"], img[alt*="Logo"], img[alt*="IronPulse"]').filter(img=>!img.closest('button')).forEach(img=>{img.style.cursor='pointer';img.tabIndex=0;img.setAttribute('role','button');img.setAttribute('aria-label','Profile & help');on(img,'click',settings);on(img,'keydown',e=>{if(e.key==='Enter')settings();});});

 $$('header img').forEach(img=>{const isProfile=!!img.closest('button');img.src=isProfile?(profile.avatar||'/icon.svg'):'/icon.svg';img.alt=isProfile?'Your profile':'Engym';img.removeAttribute('data-alt');});

 // Profile identity never inherits the example athlete credentials.

 if(!['feed','leaderboard'].includes(page))$$('span,p').filter(e=>e.children.length===0&&/@vance_power|Alex Vance|Metroflex Austin/.test(e.textContent)).forEach(e=>e.textContent=profile.handle?'@'+profile.handle:profile.name||'Local athlete');

 replaceText(document.body,/14,820 ACTIVE ATHLETES LOGGING LIVE/g,'YOUR SERVER · YOUR TRAINING DATA');replaceText(document.body,/10M\+ LBS MOVED/g,'YOUR WORKOUTS · SAVED LOCALLY');replaceText(document.body,/8\+ CHARS/g,'10+ CHARS');

 const handled=await newFlow({page,store,profile,saveProfile,go,settings,unit,displayWeight,toLbs,esc,api,sync});if(!handled)await initAuth();

 if(page==='analytics'){const root=$('main');$$('h2,span',root).filter(e=>/Estimated 1RM|Hall of Fame|1RM Telemetry/.test(e.textContent)&&e.children.length===0).forEach(e=>{let box=e.closest('.bg-surface-container-low');if(box)box.remove();});}

 $$('button').filter(b=>/DOTS|PRs Broken/.test(b.textContent)).forEach(b=>b.remove());

 replaceText(document.body,/1RM RATIO INITIALIZATION/g,'PROFILE PREFERENCES');replaceText(document.body,/INITIALIZE & CONFIGURE 1RMS/g,'CREATE ATHLETE ID');

 if(page==='feed'&&$('main')._streakReminder)$('main').prepend($('main')._streakReminder);

 document.body.dataset.ready='true';syncStatus('LOCAL ONLY');window.addEventListener('engym:save',()=>{clearTimeout(autoTimer);autoTimer=setTimeout(sync,1200);});window.addEventListener('online',sync);window.addEventListener('focus',sync);setInterval(sync,30000);sync();if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(e=>toast('Offline setup failed: '+e.message));navigator.storage?.persist?.().catch(()=>{});

}

init().catch(e=>{console.error(e);toast('Unable to open Engym: '+e.message);});

