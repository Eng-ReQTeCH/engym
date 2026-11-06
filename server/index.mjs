import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRecord, volume,leaderboardStats } from '../shared/domain.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=s=>createHash('sha256').update(s).digest('hex');
const publishedWorkout=w=>({name:String(w.name||'Workout'),startedAt:w.startedAt,finishedAt:w.finishedAt,prCount:Number(w.prCount)||0,exercises:w.exercises.map(e=>({id:e.id,name:e.name,mode:e.mode,sets:e.sets.map(s=>({weight:s.weight,reps:s.reps,done:s.done,minutes:s.minutes,speed:s.speed,speedUnit:s.speedUnit}))}))});
export function createApp({dataDir=process.env.DATA_DIR||path.join(root,'data'),allowedOrigin=process.env.ALLOWED_ORIGIN||'',google={clientId:process.env.GOOGLE_CLIENT_ID,clientSecret:process.env.GOOGLE_CLIENT_SECRET,publicURL:process.env.PUBLIC_URL},googleFetch=fetch,publicURL=process.env.PUBLIC_URL||'',trustProxy=process.env.TRUST_PROXY==='true'}={}) {
 mkdirSync(dataDir,{recursive:true});const db=new DatabaseSync(path.join(dataDir,'engym.sqlite'));
 db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,handle TEXT UNIQUE COLLATE NOCASE,email TEXT UNIQUE COLLATE NOCASE,name TEXT,password TEXT,salt TEXT);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,userId TEXT,expires INTEGER);
 CREATE TABLE IF NOT EXISTS records(userId TEXT,id TEXT,type TEXT,data TEXT,version INTEGER,deleted INTEGER,seq INTEGER PRIMARY KEY AUTOINCREMENT,UNIQUE(userId,id));
 CREATE TABLE IF NOT EXISTS receipts(userId TEXT,mutationId TEXT,result TEXT,PRIMARY KEY(userId,mutationId));
 CREATE TABLE IF NOT EXISTS revisions(userId TEXT,id TEXT,version INTEGER,data TEXT,deleted INTEGER,created INTEGER,PRIMARY KEY(userId,id,version));
 CREATE TABLE IF NOT EXISTS posts(id TEXT PRIMARY KEY,userId TEXT,workoutId TEXT,title TEXT,caption TEXT,visibility TEXT,created INTEGER,UNIQUE(userId,workoutId));
 CREATE TABLE IF NOT EXISTS gyms(id TEXT PRIMARY KEY,name TEXT,location TEXT,creatorId TEXT,created INTEGER);
 CREATE TABLE IF NOT EXISTS gym_members(userId TEXT PRIMARY KEY,gymId TEXT,joined INTEGER,FOREIGN KEY(gymId) REFERENCES gyms(id));
 CREATE TABLE IF NOT EXISTS blocks(userId TEXT,target TEXT,PRIMARY KEY(userId,target));
 CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,userId TEXT,postId TEXT,reason TEXT,created INTEGER,resolved INTEGER DEFAULT 0);
 CREATE TABLE IF NOT EXISTS follows(userId TEXT,target TEXT,PRIMARY KEY(userId,target));
 CREATE TABLE IF NOT EXISTS kudos(userId TEXT,postId TEXT,PRIMARY KEY(userId,postId));
 CREATE TABLE IF NOT EXISTS comments(id TEXT PRIMARY KEY,userId TEXT,postId TEXT,body TEXT,created INTEGER);`);
 if(!db.prepare('PRAGMA table_info(users)').all().some(c=>c.name==='googleId'))db.exec('ALTER TABLE users ADD COLUMN googleId TEXT; CREATE UNIQUE INDEX IF NOT EXISTS users_google ON users(googleId) WHERE googleId IS NOT NULL');
 if(!db.prepare('PRAGMA table_info(users)').all().some(c=>c.name==='disabled'))db.exec('ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0');
 db.exec('CREATE TABLE IF NOT EXISTS oauth_states(state TEXT PRIMARY KEY,verifier TEXT,expires INTEGER)');
 if(!db.prepare('PRAGMA table_info(posts)').all().some(c=>c.name==='media'))db.exec("ALTER TABLE posts ADD COLUMN media TEXT NOT NULL DEFAULT '{}'");
 if(!db.prepare('PRAGMA table_info(posts)').all().some(c=>c.name==='snapshot'))db.exec('ALTER TABLE posts ADD COLUMN snapshot TEXT');
 for(const post of db.prepare('SELECT * FROM posts WHERE snapshot IS NULL').all()){const record=db.prepare('SELECT data FROM records WHERE userId=? AND id=?').get(post.userId,post.workoutId);if(record){const w=JSON.parse(record.data);if(w.exercises)db.prepare('UPDATE posts SET snapshot=? WHERE id=?').run(JSON.stringify(publishedWorkout(w)),post.id);}}
 db.exec('CREATE INDEX IF NOT EXISTS posts_created ON posts(created DESC); CREATE INDEX IF NOT EXISTS posts_user ON posts(userId); CREATE INDEX IF NOT EXISTS records_owner_type ON records(userId,type); CREATE INDEX IF NOT EXISTS comments_post ON comments(postId,created); CREATE INDEX IF NOT EXISTS gym_members_gym ON gym_members(gymId);');
 const rates=new Map();
 const limit=(key,max,windowMs)=>{const now=Date.now();if(rates.size>10000)for(const [k,v]of rates)if(v.until<now)rates.delete(k);const rate=rates.get(key);if(!rate||rate.until<now){if(rates.size>=20000)return false;rates.set(key,{n:1,until:now+windowMs});return true;}return ++rate.n<=max;};
 const cleanup=setInterval(()=>{const now=Date.now();db.prepare('DELETE FROM sessions WHERE expires<?').run(now);db.prepare('DELETE FROM oauth_states WHERE expires<?').run(now);for(const [k,v]of rates)if(v.until<now)rates.delete(k);},60000);cleanup.unref();

 const run=(q,...p)=>db.prepare(q).run(...p),get=(q,...p)=>db.prepare(q).get(...p),all=(q,...p)=>db.prepare(q).all(...p);
 const publicUser=u=>{const profile=decode(get("SELECT * FROM records WHERE userId=? AND id='profile' AND type='profile' AND deleted=0",u.id))?.data||{};return {id:u.id,name:profile.name||u.name,handle:u.handle,avatar:profile.avatar||null};};
 function session(req){const token=req.headers.authorization?.replace(/^Bearer /,'')||req.headers.cookie?.match(/(?:^|; )engym=([^;]+)/)?.[1];return token&&get('SELECT u.* FROM sessions s JOIN users u ON u.id=s.userId WHERE token=? AND expires>? AND u.disabled=0',hash(token),Date.now());}
 const decode=r=>r&&({...r,data:JSON.parse(r.data),deleted:!!r.deleted});
 const blocked=(a,b)=>!!get('SELECT 1 FROM blocks WHERE (userId=? AND target=?) OR (userId=? AND target=?)',a,b,b,a);
 function visible(p,u){return p&&!get('SELECT 1 FROM users WHERE id=? AND disabled=1',p.userId)&&!blocked(p.userId,u.id)&&(p.userId===u.id||p.visibility==='everyone'||!!get('SELECT 1 FROM follows WHERE userId=? AND target=?',p.userId,u.id));}
 const server=http.createServer(async(req,res)=>{
  const origin=req.headers.origin;const hostOrigin=publicURL?new URL(publicURL).origin:`${req.socket.encrypted||trustProxy&&req.headers['x-forwarded-proto']==='https'?'https':'http'}://${req.headers.host}`;
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');res.setHeader('Permissions-Policy','camera=(self), microphone=(), geolocation=()');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://engym.minaghali.xyz; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");if(publicURL.startsWith('https:'))res.setHeader('Strict-Transport-Security','max-age=31536000');
  if(origin&&(origin===allowedOrigin||origin===hostOrigin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Credentials','true');}
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS'});return res.end();}
  const send=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  try {
   const url=new URL(req.url,'http://localhost');const p=url.pathname;
   if(!p.startsWith('/api/')){
    if(!['GET','HEAD'].includes(req.method))return send(405,{error:'Method not allowed'});
    const rel=decodeURIComponent(p==='/'?'/index.html':p);const f=path.resolve(root,'dist','.'+rel);
    if(!f.startsWith(path.join(root,'dist')+path.sep)||!existsSync(f)||!statSync(f).isFile())return send(404,{error:'Not found'});
    const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2'};
    res.writeHead(200,{'Content-Type':mime[path.extname(f)]||'application/octet-stream','Cache-Control':'no-cache','Service-Worker-Allowed':'/'});return res.end(req.method==='HEAD'?undefined:readFileSync(f));
   }
   if(origin&&origin!==hostOrigin&&origin!==allowedOrigin)return send(403,{error:'Origin not allowed'});
   const clientIP=trustProxy?String(req.headers['cf-connecting-ip']||req.socket.remoteAddress):req.socket.remoteAddress;
   if(!limit('api:'+clientIP,300,60000)){res.setHeader('Retry-After','60');return send(429,{error:'Please slow down and try again in a minute.'});}
   let body={};if(['POST','PUT'].includes(req.method)){if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{error:'Use application/json'});let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>5e6)return send(413,{error:'Request too large'});chunks.push(chunk);}try{body=JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{return send(400,{error:'Invalid JSON'});}}
   if(!body||typeof body!=='object'||Array.isArray(body))return send(400,{error:'Invalid JSON object'});
   if(p==='/api/health')return send(200,{ok:true,version:1});
   const googleEnabled=!!(google.clientId&&google.clientSecret&&google.publicURL);
   if(p==='/api/auth/providers')return send(200,{google:googleEnabled});
   if(p==='/api/auth/google'&&req.method==='GET'){
    if(!googleEnabled)return send(503,{error:'Google sign-in is not configured on this server'});
    const publicURL=new URL(google.publicURL);if(publicURL.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(publicURL.hostname))return send(503,{error:'Google sign-in requires an HTTPS public URL'});
    run('DELETE FROM oauth_states WHERE expires<?',Date.now());if(get('SELECT count(*) n FROM oauth_states').n>1000)return send(429,{error:'Try Google sign-in later'});
    const state=randomBytes(32).toString('hex'),verifier=randomBytes(32).toString('base64url');run('INSERT INTO oauth_states VALUES(?,?,?)',hash(state),verifier,Date.now()+600000);
    res.setHeader('Set-Cookie',`engym_oauth=${state}; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=600${publicURL.protocol==='https:'?'; Secure':''}`);
    const target=new URL('https://accounts.google.com/o/oauth2/v2/auth');target.search=new URLSearchParams({client_id:google.clientId,redirect_uri:publicURL.origin+'/api/auth/google/callback',response_type:'code',scope:'openid email profile',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();res.writeHead(302,{Location:target.href,'Cache-Control':'no-store'});return res.end();
   }
   if(p==='/api/auth/google/callback'&&req.method==='GET'){
    if(!googleEnabled)return send(503,{error:'Google sign-in is not configured'});
    const state=url.searchParams.get('state')||'',cookie=req.headers.cookie?.match(/(?:^|; )engym_oauth=([^;]+)/)?.[1];const pending=get('SELECT * FROM oauth_states WHERE state=? AND expires>?',hash(state),Date.now());if(!state||state!==cookie||!pending)return send(400,{error:'Invalid or expired sign-in state. Start Google sign-in again.'});run('DELETE FROM oauth_states WHERE state=?',hash(state));
    const publicURL=new URL(google.publicURL);const tokenResponse=await googleFetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code:url.searchParams.get('code')||'',client_id:google.clientId,client_secret:google.clientSecret,redirect_uri:publicURL.origin+'/api/auth/google/callback',grant_type:'authorization_code',code_verifier:pending.verifier}),signal:AbortSignal.timeout(12000)});const tokens=await tokenResponse.json();if(!tokenResponse.ok||!tokens.access_token)return send(401,{error:'Google sign-in did not complete. Try again.'});
    const infoResponse=await googleFetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+tokens.access_token},signal:AbortSignal.timeout(12000)});const info=await infoResponse.json();if(!infoResponse.ok||!info.email_verified||typeof info.sub!=='string'||typeof info.email!=='string')return send(401,{error:'Google account must have a verified email'});
    let account=get('SELECT * FROM users WHERE googleId=?',info.sub);if(!account){if(get('SELECT id FROM users WHERE email=?',info.email))return send(409,{error:'This email already has an athlete ID. Sign in with its password; Google accounts are not linked automatically.'});const salt=randomBytes(16).toString('hex');run('INSERT INTO users(id,handle,email,name,password,salt,googleId) VALUES(?,?,?,?,?,?,?)',crypto.randomUUID(),'g_'+hash(info.sub).slice(0,16),info.email.toLowerCase(),String(info.name||'Athlete').slice(0,80),scryptSync(randomBytes(32).toString('hex'),salt,64).toString('hex'),salt,info.sub);account=get('SELECT * FROM users WHERE googleId=?',info.sub);}
    if(account.disabled)return send(403,{error:'This account is unavailable'});const token=randomBytes(32).toString('hex');run('INSERT INTO sessions VALUES(?,?,?)',hash(token),account.id,Date.now()+30*86400000);res.setHeader('Set-Cookie',[`engym=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${publicURL.protocol==='https:'?'; Secure':''}`,'engym_oauth=; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=0']);res.writeHead(302,{Location:publicURL.origin+'/login.html?oauth=1','Cache-Control':'no-store'});return res.end();
   }
   if(['/api/auth/register','/api/auth/login'].includes(p)&&req.method==='POST'){
    if(!limit('auth:'+clientIP,40,900000)){res.setHeader('Retry-After','900');return send(429,{error:'Too many attempts. Try again in 15 minutes.'});}
    if(typeof body.password!=='string'||body.password.length<10||body.password.length>200)return send(400,{error:'Use a password of 10–200 characters'});
    let user;
    if(p.endsWith('register')){
     if(!/^[a-zA-Z0-9_]{3,30}$/.test(body.handle||'')||!/^\S+@\S+\.\S+$/.test(body.email||'')||typeof body.name!=='string'||!body.name.trim()||body.name.length>80)return send(400,{error:'Enter name, valid email and a 3–30 character handle'});
     const salt=randomBytes(16).toString('hex'),id=crypto.randomUUID();
     try{run('INSERT INTO users(id,handle,email,name,password,salt) VALUES(?,?,?,?,?,?)',id,body.handle,body.email.toLowerCase(),body.name.trim(),scryptSync(body.password,salt,64).toString('hex'),salt);}catch{return send(409,{error:'Email or handle is already registered'});}user=get('SELECT * FROM users WHERE id=?',id);
    }else{user=get('SELECT * FROM users WHERE handle=? OR email=?',String(body.login||'').replace(/^@/,''),String(body.login||''));const salt=user?.salt||'dummy';const digest=scryptSync(body.password,salt,64);if(!user||user.disabled||!timingSafeEqual(digest,Buffer.from(user.password,'hex')))return send(401,{error:'Invalid credentials'});}
    const token=randomBytes(32).toString('hex');run('INSERT INTO sessions VALUES(?,?,?)',hash(token),user.id,Date.now()+30*86400000);
    const secure=publicURL.startsWith('https:')||req.socket.encrypted||trustProxy&&req.headers['x-forwarded-proto']==='https';res.setHeader('Set-Cookie',`engym=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure?'; Secure':''}`);return send(200,{user:publicUser(user),token});
   }
   const user=session(req);if(p==='/api/auth/me'&&!user)return send(200,{user:null});if(!user)return send(401,{error:'Sign in to your server account'});
   if(p==='/api/auth/me')return send(200,{user:publicUser(user)});
   if(p==='/api/auth/logout'&&req.method==='POST'){const token=req.headers.authorization?.replace(/^Bearer /,'')||req.headers.cookie?.match(/engym=([^;]+)/)?.[1];run('DELETE FROM sessions WHERE token=?',hash(token||''));res.setHeader('Set-Cookie','engym=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');return send(200,{ok:true});}
   if(p==='/api/auth/password'&&req.method==='POST'){if(!limit('password:'+user.id,10,900000))return send(429,{error:'Try again later'});if(user.googleId)return send(400,{error:'Manage your password in your Google account'});if(typeof body.current!=='string'||body.current.length>200||typeof body.password!=='string'||body.password.length<10||body.password.length>200)return send(400,{error:'Use a password of 10-200 characters'});if(!timingSafeEqual(scryptSync(body.current,user.salt,64),Buffer.from(user.password,'hex')))return send(401,{error:'Current password is incorrect'});const salt=randomBytes(16).toString('hex');run('UPDATE users SET salt=?,password=? WHERE id=?',salt,scryptSync(body.password,salt,64).toString('hex'),user.id);const current=req.headers.authorization?.replace(/^Bearer /,'')||req.headers.cookie?.match(/(?:^|; )engym=([^;]+)/)?.[1]||'';run('DELETE FROM sessions WHERE userId=? AND token<>?',user.id,hash(current));return send(200,{ok:true});}
   if(p==='/api/blocks'&&req.method==='GET')return send(200,{users:all('SELECT u.id,u.name,u.handle FROM blocks b JOIN users u ON u.id=b.target WHERE b.userId=?',user.id).map(publicUser)});
   if(p==='/api/blocks'&&req.method==='POST'){if(body.target===user.id||!get('SELECT id FROM users WHERE id=?',body.target))return send(400,{error:'Invalid athlete'});if(body.block){run('INSERT OR IGNORE INTO blocks VALUES(?,?)',user.id,body.target);run('DELETE FROM follows WHERE (userId=? AND target=?) OR (userId=? AND target=?)',user.id,body.target,body.target,user.id);}else run('DELETE FROM blocks WHERE userId=? AND target=?',user.id,body.target);return send(200,{ok:true});}
   if(p==='/api/reports'&&req.method==='POST'){if(!visible(get('SELECT * FROM posts WHERE id=?',body.postId),user))return send(404,{error:'Post not found'});if(typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>1000)return send(400,{error:'Describe the issue in 1-1000 characters'});if(!get('SELECT 1 FROM reports WHERE userId=? AND postId=? AND resolved=0',user.id,body.postId))run('INSERT INTO reports(id,userId,postId,reason,created) VALUES(?,?,?,?,?)',crypto.randomUUID(),user.id,body.postId,body.reason.trim(),Date.now());return send(200,{ok:true});}
   if(p==='/api/sync'&&req.method==='POST'){
    if(!Array.isArray(body.mutations)||body.mutations.length>100)return send(400,{error:'Invalid mutations'});
    body.mutations.forEach(validateRecord);const results=[];db.exec('BEGIN IMMEDIATE');try{
     for(const m of body.mutations){const receipt=get('SELECT result FROM receipts WHERE userId=? AND mutationId=?',user.id,m.mutationId);if(receipt){results.push(JSON.parse(receipt.result));continue;}
      const old=get('SELECT * FROM records WHERE userId=? AND id=?',user.id,m.id);let result;
      if((old?.version||0)!==m.baseVersion)result={id:m.id,mutationId:m.mutationId,conflict:true,record:decode(old)||{id:m.id,type:m.type,data:{},version:0,deleted:true}};
      else{const version=(old?.version||0)+1;const data=JSON.stringify(m.data||{});if(m.type==='workout'&&m.deleted){const post=get('SELECT id FROM posts WHERE userId=? AND workoutId=?',user.id,m.id);if(post){run('DELETE FROM comments WHERE postId=?',post.id);run('DELETE FROM kudos WHERE postId=?',post.id);run('UPDATE reports SET resolved=1 WHERE postId=?',post.id);run('DELETE FROM posts WHERE id=?',post.id);}}run('INSERT INTO records(userId,id,type,data,version,deleted) VALUES(?,?,?,?,?,?) ON CONFLICT(userId,id) DO UPDATE SET data=excluded.data,version=excluded.version,deleted=excluded.deleted,type=excluded.type',user.id,m.id,m.type,data,version,m.deleted?1:0);run('INSERT INTO revisions VALUES(?,?,?,?,?,?)',user.id,m.id,version,data,m.deleted?1:0,Date.now());result={id:m.id,mutationId:m.mutationId,version};}
      run('INSERT INTO receipts VALUES(?,?,?)',user.id,m.mutationId,JSON.stringify(result));results.push(result);
     }db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
    return send(200,{results,records:all('SELECT id,type,data,version,deleted FROM records WHERE userId=?',user.id).map(decode)});
   }
   if(p==='/api/gyms'&&req.method==='GET'){const q=String(url.searchParams.get('q')||'').slice(0,80);return send(200,{membership:get('SELECT g.* FROM gyms g JOIN gym_members m ON m.gymId=g.id WHERE m.userId=?',user.id)||null,gyms:all('SELECT g.*,count(m.userId) members FROM gyms g LEFT JOIN gym_members m ON m.gymId=g.id WHERE g.name LIKE ? OR g.location LIKE ? GROUP BY g.id ORDER BY g.name LIMIT 50',`%${q}%`,`%${q}%`).map(({creatorId,...g})=>g)});}
   if(p==='/api/gyms'&&req.method==='POST'){const name=typeof body.name==='string'?body.name.trim():'',location=typeof body.location==='string'?body.location.trim():'';if(!name||name.length>80||location.length>120)return send(400,{error:'Use a gym name up to 80 characters and location up to 120 characters'});if(get('SELECT id FROM gyms WHERE lower(name)=lower(?) AND lower(location)=lower(?)',name,location))return send(409,{error:'This gym already exists. Search and join it.'});const id=crypto.randomUUID();run('INSERT INTO gyms VALUES(?,?,?,?,?)',id,name,location,user.id,Date.now());run('INSERT INTO gym_members VALUES(?,?,?) ON CONFLICT(userId) DO UPDATE SET gymId=excluded.gymId,joined=excluded.joined',user.id,id,Date.now());return send(200,{id});}
   if(p==='/api/gyms/join'&&req.method==='POST'){if(!get('SELECT id FROM gyms WHERE id=?',body.gymId))return send(404,{error:'Gym not found'});run('INSERT INTO gym_members VALUES(?,?,?) ON CONFLICT(userId) DO UPDATE SET gymId=excluded.gymId,joined=excluded.joined',user.id,body.gymId,Date.now());return send(200,{ok:true});}
   if(p==='/api/gyms/leave'&&req.method==='POST'){run('DELETE FROM gym_members WHERE userId=?',user.id);return send(200,{ok:true});}
   if(p==='/api/users'){const q=String(url.searchParams.get('q')||'').slice(0,50);return send(200,{users:all('SELECT id,name,handle FROM users WHERE disabled=0 AND handle LIKE ? LIMIT 30',`%${q}%`).filter(u=>!blocked(user.id,u.id)).map(u=>({...publicUser(u),following:!!get('SELECT 1 FROM follows WHERE userId=? AND target=?',user.id,u.id)}))});}
   if(p==='/api/follow'&&req.method==='POST'){if(body.target===user.id||blocked(user.id,body.target)||!get('SELECT id FROM users WHERE id=? AND disabled=0',body.target))return send(400,{error:'Invalid athlete'});if(body.follow)run('INSERT OR IGNORE INTO follows VALUES(?,?)',user.id,body.target);else run('DELETE FROM follows WHERE userId=? AND target=?',user.id,body.target);return send(200,{ok:true});}
   if(p==='/api/posts'&&req.method==='POST'){
    const workout=decode(get("SELECT * FROM records WHERE userId=? AND id=? AND type='workout' AND deleted=0",user.id,body.workoutId));
    if(!workout?.data.finishedAt)return send(400,{error:'Finish and back up a workout before posting'});
    if(typeof body.title!=='string'||!body.title.trim()||body.title.length>120||typeof body.caption!=='string'||body.caption.length>4000||!['friends','everyone'].includes(body.visibility))return send(400,{error:'Invalid post'});
    const photos=body.photos||[];if(!Array.isArray(photos)||photos.length>3||photos.some(p=>typeof p!=='string'||p.length>150000||!/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/=]+$/.test(p)))return send(400,{error:'Use up to three JPEG photos under 110 KB each'});
    const media=JSON.stringify({photos,showPr:body.showPr!==false,critique:!!body.critique,rpe:Number(body.rpe)||null,mood:String(body.mood||'').slice(0,50)});
    const id=crypto.randomUUID();run('INSERT INTO posts(id,userId,workoutId,title,caption,visibility,created,media,snapshot) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(userId,workoutId) DO UPDATE SET title=excluded.title,caption=excluded.caption,visibility=excluded.visibility,media=excluded.media,snapshot=excluded.snapshot',id,user.id,body.workoutId,body.title,body.caption,body.visibility,Date.now(),media,JSON.stringify(publishedWorkout(workout.data)));return send(200,{ok:true});
   }
   if(p==='/api/feed'){
    const posts=all('SELECT p.*,u.name,u.handle FROM posts p JOIN users u ON u.id=p.userId WHERE u.disabled=0 ORDER BY created DESC LIMIT 200').filter(p=>visible(p,user)).filter(p=>url.searchParams.get('scope')!=='friends'||p.userId===user.id||get('SELECT 1 FROM follows WHERE userId=? AND target=?',user.id,p.userId)).slice(0,50);
    return send(200,{posts:posts.map(p=>{const workout=p.snapshot?JSON.parse(p.snapshot):null;return {...p,...publicUser({id:p.userId,name:p.name,handle:p.handle}),id:p.id,media:JSON.parse(p.media),workout,volume:volume(workout),kudos:get('SELECT count(*) n FROM kudos WHERE postId=?',p.id).n,kudoed:!!get('SELECT 1 FROM kudos WHERE postId=? AND userId=?',p.id,user.id),comments:all('SELECT c.*,u.handle,u.name FROM comments c JOIN users u ON u.id=c.userId WHERE postId=? ORDER BY created LIMIT 100',p.id).filter(c=>!blocked(c.userId,user.id)).map(c=>({...c,avatar:publicUser({id:c.userId,name:c.name,handle:c.handle}).avatar}))};})});
   }
   if(p==='/api/kudos'&&req.method==='POST'){if(!visible(get('SELECT * FROM posts WHERE id=?',body.postId),user))return send(404,{error:'Post not found'});if(body.liked)run('INSERT OR IGNORE INTO kudos VALUES(?,?)',user.id,body.postId);else run('DELETE FROM kudos WHERE userId=? AND postId=?',user.id,body.postId);return send(200,{ok:true});}
   if(p==='/api/comments'&&req.method==='POST'){if(!visible(get('SELECT * FROM posts WHERE id=?',body.postId),user))return send(404,{error:'Post not found'});if(typeof body.body!=='string'||!body.body.trim()||body.body.length>1000)return send(400,{error:'Comment must be 1–1000 characters'});run('INSERT INTO comments VALUES(?,?,?,?,?)',crypto.randomUUID(),user.id,body.postId,body.body.trim(),Date.now());return send(200,{ok:true});}
   if(p==='/api/posts'&&req.method==='DELETE'){const id=url.searchParams.get('id');if(get('SELECT id FROM posts WHERE id=? AND userId=?',id,user.id)){db.exec('BEGIN IMMEDIATE');try{run('DELETE FROM comments WHERE postId=?',id);run('DELETE FROM kudos WHERE postId=?',id);run('DELETE FROM posts WHERE id=? AND userId=?',id,user.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}return send(200,{ok:true});}
   if(p==='/api/leaderboard'){
    const since=Number(url.searchParams.get('since'))||0,scope=url.searchParams.get('scope');const users=all('SELECT id,name,handle FROM users WHERE disabled=0');const entries=users.filter(u=>!blocked(user.id,u.id)).filter(u=>scope!=='friends'||u.id===user.id||get('SELECT 1 FROM follows WHERE userId=? AND target=?',user.id,u.id)).map(u=>{
     const workouts=all('SELECT * FROM posts WHERE userId=?',u.id).filter(p=>visible(p,user)&&p.snapshot).map(p=>JSON.parse(p.snapshot)).filter(w=>w.finishedAt>=since);
     const profile=decode(get("SELECT * FROM records WHERE userId=? AND type='profile' AND id='profile' AND deleted=0",u.id))?.data||{};
     return {...publicUser(u),...leaderboardStats(workouts,profile),gymId:get('SELECT gymId FROM gym_members WHERE userId=?',u.id)?.gymId,rankingOptIn:profile.broadcast===true};}).filter(u=>u.sessions>0&&u.rankingOptIn);const metric=['volume','dots','prs','streak'].includes(url.searchParams.get('metric'))?url.searchParams.get('metric'):'volume';const myGym=get('SELECT gymId FROM gym_members WHERE userId=?',user.id)?.gymId;return send(200,{entries:entries.filter(u=>(scope!=='gym'||myGym&&u.gymId===myGym)&&(metric!=='dots'||u.dots!==null)).sort((a,b)=>b[metric]-a[metric])});
   }
   return send(404,{error:'Not found'});
  }catch(e){console.error(e.message);if(!res.headersSent)send(400,{error:e.message.includes('Invalid')?e.message:'Request could not be processed'});else res.end();}
 });server.requestTimeout=20000;server.headersTimeout=15000;server.keepAliveTimeout=5000;server.on('close',()=>{clearInterval(cleanup);db.close();});return server;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const server=createApp();server.listen(Number(process.env.PORT)||8080,'0.0.0.0',()=>console.log(`Engym: http://localhost:${server.address().port}`));for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),15000).unref();});}
