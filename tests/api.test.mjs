import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../server/index.mjs';
import {volume,estimatedMax,dots,leaderboardStats,validateRecord,syncBatches} from '../shared/domain.mjs';
test('local calculations count only completed sets',()=>{assert.equal(volume({exercises:[{sets:[{weight:100,reps:5,done:true},{weight:100,reps:9,done:false}]}]}),500);assert.equal(estimatedMax(100,1),100);});
test('offline sync queues honor count and UTF-8 byte limits',()=>{const records=Array.from({length:201},(_,i)=>({id:String(i),data:'🏋'.repeat(60)}));const batches=syncBatches(records,1000);assert.deepEqual(batches.flat(),records);for(const batch of batches)assert.ok(Buffer.byteLength(JSON.stringify({mutations:batch}))<=1000);assert.deepEqual(syncBatches(Array.from({length:201},(_,id)=>({id}))).map(b=>b.length),[100,100,1]);assert.deepEqual(syncBatches([]),[[]]);});
test('rankings require real qualifying records and reject invalid dates',()=>{
 assert.equal(dots(500,80,'OPEN'),null);assert.equal(dots(500,20,'MALE'),null);assert.ok(dots(500,80,'MALE')>300);
 const w={startedAt:Date.now()-60000,finishedAt:Date.now(),exercises:[{id:'squat',name:'Squat',sets:[{weight:100,reps:5,done:true}]}]};const stats=leaderboardStats([w],{bodyWeight:80,unit:'kg',division:'MALE'});assert.equal(stats.volume,500);assert.equal(stats.dots,null);assert.equal(stats.prs,1);assert.equal(stats.streak,1);
 assert.throws(()=>validateRecord({id:'bad',type:'workout',baseVersion:0,mutationId:'test',data:{...w,finishedAt:w.startedAt-1}}),/Invalid workout/);
});
test('Google sign-in uses bound single-use state and verified server-side identity',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'engym-google-'));let exchanged=false;
 const server=createApp({dataDir:dir,google:{clientId:'test-client',clientSecret:'test-secret',publicURL:'http://localhost'},googleFetch:async(url,options)=>{if(url.includes('/token')){assert.ok(options.body.get('code_verifier').length>40);exchanged=true;return new Response(JSON.stringify({access_token:'test-access'}));}assert.equal(options.headers.Authorization,'Bearer test-access');return new Response(JSON.stringify({sub:'verified-subject',email:'verified@example.com',email_verified:true,name:'Google Athlete'}));}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 try{
  const start=await fetch(base+'/api/auth/google',{redirect:'manual'});assert.equal(start.status,302);const target=new URL(start.headers.get('location'));assert.equal(target.origin,'https://accounts.google.com');assert.equal(target.searchParams.get('code_challenge_method'),'S256');const state=target.searchParams.get('state');const cookie=start.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(base+'/api/auth/google/callback?state=wrong&code=test',{headers:{Cookie:cookie}})).status,400);
  const callback=await fetch(base+`/api/auth/google/callback?state=${state}&code=test`,{headers:{Cookie:cookie},redirect:'manual'});assert.equal(callback.status,302);assert.equal(exchanged,true);const session=callback.headers.getSetCookie().find(s=>s.startsWith('engym=')).split(';')[0];const me=await (await fetch(base+'/api/auth/me',{headers:{Cookie:session}})).json();assert.equal(me.user.name,'Google Athlete');assert.ok(!JSON.stringify(me).includes('test-access'));
  assert.equal((await fetch(base+`/api/auth/google/callback?state=${state}&code=test`,{headers:{Cookie:cookie},redirect:'manual'})).status,400);
 }finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
test('account isolation, durable backup, retries, conflicts and explicit social visibility',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'engym-test-'));let server=createApp({dataDir:dir});await new Promise(r=>server.listen(0,'127.0.0.1',r));let base=`http://127.0.0.1:${server.address().port}`;
 const call=async(p,body,token,method=body?'POST':'GET')=>{const r=await fetch(base+p,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,...await r.json()};};
 try{
 const a=await call('/api/auth/register',{name:'Alice',handle:'alice',email:'alice@example.com',password:'correct-horse-1'});const b=await call('/api/auth/register',{name:'Bob',handle:'bobby',email:'bob@example.com',password:'correct-horse-2'});assert.equal(a.status,200);assert.equal(b.status,200);
 assert.equal((await call('/api/auth/login',{login:'alice',password:'wrong-password'})).status,401);
 const workout={name:'Test workout',notes:'Private training note',startedAt:Date.now()-60000,finishedAt:Date.now(),exercises:[{id:'squat',name:'Barbell Back Squat',sets:[{weight:100,reps:5,done:true}]}]};
 const consent={id:'profile',type:'profile',baseVersion:0,mutationId:'consent',data:{broadcast:true}};await call('/api/sync',{mutations:[consent]},a.token);
 const m={id:'workout-one',type:'workout',baseVersion:0,mutationId:'m1',data:workout};const first=await call('/api/sync',{mutations:[m]},a.token);assert.equal(first.results[0].version,1);
 const retry=await call('/api/sync',{mutations:[m]},a.token);assert.equal(retry.results[0].version,1);assert.equal(retry.records.length,2);
 assert.equal((await call('/api/sync',{mutations:[]},b.token)).records.length,0);
 const conflict=await call('/api/sync',{mutations:[{...m,mutationId:'m2',data:{...workout,name:'Stale'}}]},a.token);assert.equal(conflict.results[0].conflict,true);
 const invalid=await call('/api/sync',{mutations:[{...m,id:'invalid',mutationId:'m3',data:{...workout,exercises:[{name:'Bad',sets:[{weight:-1,reps:8,done:true}]}]}}]},a.token);assert.equal(invalid.status,400);
 assert.equal((await call('/api/feed',undefined,b.token)).posts.length,0);
 assert.equal((await call('/api/posts',{workoutId:m.id,title:'Workout',caption:'Private circle',visibility:'friends'},a.token)).status,200);
 assert.equal((await call('/api/feed',undefined,b.token)).posts.length,0);
 await call('/api/follow',{target:b.user.id,follow:true},a.token);
 let feed=await call('/api/feed',undefined,b.token);assert.equal(feed.posts.length,1);
 const post=feed.posts[0];assert.equal(post.workout.notes,undefined);assert.ok(!JSON.stringify(post).includes('Private training note'));
 await call('/api/sync',{mutations:[{...m,baseVersion:1,mutationId:'private-edit',data:{...workout,name:'Private later edit'}}]},a.token);assert.equal((await call('/api/feed',undefined,b.token)).posts[0].workout.name,'Test workout');
 await call('/api/kudos',{postId:post.id,liked:true},b.token);await call('/api/kudos',{postId:post.id,liked:true},b.token);await call('/api/comments',{postId:post.id,body:'Nice work!'},b.token);
 feed=await call('/api/feed',undefined,a.token);assert.equal(feed.posts[0].kudos,1);assert.equal(feed.posts[0].comments.length,1);
 const ranks=await call('/api/leaderboard',undefined,b.token);assert.equal(ranks.entries[0].volume,500);await call('/api/sync',{mutations:[{...consent,baseVersion:1,mutationId:'opt-out',data:{broadcast:false}}]},a.token);assert.equal((await call('/api/leaderboard',undefined,b.token)).entries.length,0);assert.equal((await call('/api/feed',undefined,b.token)).posts.length,1);
 await new Promise(r=>server.close(r));server=createApp({dataDir:dir});await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;
 assert.equal((await call('/api/sync',{mutations:[]},a.token)).records.find(r=>r.id===m.id).data.name,'Private later edit');
 const login=await call('/api/auth/login',{login:'alice',password:'correct-horse-1'});assert.equal(login.status,200);
 await call('/api/sync',{mutations:[{...m,baseVersion:2,mutationId:'delete',deleted:true,data:{}}]},a.token);assert.equal((await call('/api/sync',{mutations:[]},a.token)).records.find(r=>r.id===m.id).deleted,true);
 assert.equal((await call('/api/sync',{mutations:[]})).status,401);
 }finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
test('gym membership scopes rankings and profile photos stay validated and public',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'engym-gyms-'));const server=createApp({dataDir:dir});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const call=async(p,body,token)=>{const r=await fetch(base+p,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,...await r.json()};};
 try{
 const accounts=[];for(const handle of ['alice','bobby','carol'])accounts.push(await call('/api/auth/register',{name:handle,handle,email:handle+'@gym.test',password:'correct-horse-1'}));const [a,b,c]=accounts;
 assert.equal((await call('/api/gyms')).status,401);assert.deepEqual((await call('/api/gyms',undefined,a.token)).gyms,[]);
 const gym=await call('/api/gyms',{name:'Real Gym',location:'Cairo'},a.token);assert.equal(gym.status,200);assert.equal((await call('/api/gyms',{name:'real gym',location:'cairo'},b.token)).status,409);
 assert.equal((await call('/api/gyms/join',{gymId:'missing'},b.token)).status,404);await call('/api/gyms/join',{gymId:gym.id},b.token);const other=await call('/api/gyms',{name:'Other Gym',location:'Giza'},c.token);
 const avatar='data:image/jpeg;base64,/9j/AA==';for(const account of accounts){await call('/api/sync',{mutations:[{id:'profile',type:'profile',baseVersion:0,mutationId:'profile',data:{name:account.user.name,avatar,broadcast:true,privateNote:'secret'}}]},account.token);const w={name:'Real workout',startedAt:Date.now()-10000,finishedAt:Date.now(),exercises:[{id:'db-bench',name:'Dumbbell bench press',sets:[{weight:20,reps:10,done:true}]}]};await call('/api/sync',{mutations:[{id:'workout',type:'workout',baseVersion:0,mutationId:'w',data:w}]},account.token);await call('/api/posts',{workoutId:'workout',title:'My training',caption:'Done',visibility:'everyone'},account.token);}
 let ranks=await call('/api/leaderboard?scope=gym',undefined,a.token);assert.deepEqual(new Set(ranks.entries.map(u=>u.id)),new Set([a.user.id,b.user.id]));assert.equal(ranks.entries[0].avatar,avatar);assert.ok(!JSON.stringify(ranks).includes('secret'));
 assert.equal((await call('/api/leaderboard?scope=friends',undefined,a.token)).entries.length,1);await call('/api/follow',{target:c.user.id,follow:true},a.token);assert.equal((await call('/api/leaderboard?scope=friends',undefined,a.token)).entries.length,2);
 const feed=await call('/api/feed?scope=global',undefined,b.token);assert.equal(feed.posts[0].avatar,avatar);assert.ok(!JSON.stringify(feed).includes('secret'));assert.equal((await call('/api/users?q=alice',undefined,b.token)).users[0].avatar,avatar);
 const invalid=await call('/api/sync',{mutations:[{id:'profile',type:'profile',baseVersion:1,mutationId:'bad-avatar',data:{avatar:'javascript:alert(1)'}}]},a.token);assert.equal(invalid.status,400);
 await call('/api/gyms/join',{gymId:other.id},b.token);assert.equal((await call('/api/leaderboard?scope=gym',undefined,a.token)).entries.length,1);await call('/api/gyms/leave',{},a.token);assert.equal((await call('/api/gyms',undefined,a.token)).membership,null);assert.equal((await call('/api/leaderboard?scope=gym',undefined,a.token)).entries.length,0);
 }finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
