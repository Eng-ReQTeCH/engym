import { readFile, writeFile, mkdir, readdir, copyFile } from 'node:fs/promises';

import { existsSync } from 'node:fs';

import { createHash } from 'node:crypto';

import { execFileSync } from 'node:child_process';

import vm from 'node:vm';

import {writeIcons} from './icons.mjs';

const routes={welcome:'welcome_to_ironpulse',signup:'sign_up_athlete_account_creation',login:'login_athlete_credentials',goals:'onboarding_training_goals_focus',experience:'onboarding_experience_level',baseline:'onboarding_baseline_1rms',workout:'active_workout_logger',routines:'workout_routine_planner',analytics:'progress_analytics',exercises:'exercise_library_history',detail:'exercise_detail_form_guide',feed:'friends_community_feed',leaderboard:'leaderboard_rankings',checkin:'post_workout_check_in',summary:'workout_summary_shareable_recap'};

await mkdir('dist/exercise-images',{recursive:true});

for(const equipment of ['dumbbell','machine','treadmill']){const drawing=equipment==='dumbbell'?'<path d="M90 110v80m30-95v110m0-55h160m0-55v110m30-95v80"/>':equipment==='treadmill'?'<path d="M65 220h245l-35-35H95zm185-35V65h-70m55 30h55"/>':'<path d="M95 245V55h170v190M115 75h130m-115 0v80h100V75m-80 115h90m-45-35v90m-40 0h80"/>';await writeFile('dist/exercise-images/'+equipment+'.svg','<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" rx="24" fill="#1e2024"/><g fill="none" stroke="#c3f400" stroke-width="12" stroke-linejoin="round">'+drawing+'</g></svg>');}

await mkdir('dist/assets',{recursive:true});await mkdir('assets/vendor',{recursive:true});

const downloads=new Map();

async function localize(url){

 url=url.replaceAll('&amp;','&');if(downloads.has(url))return downloads.get(url);

 const task=(async()=>{const id=createHash('sha256').update(url).digest('hex').slice(0,20);const isCSS=url.includes('fonts.googleapis.com');let ext=isCSS?'.css':url.includes('fonts.gstatic.com')?'.woff2':'.jpg';let cache=`assets/vendor/${id}${ext}`;

 if(!existsSync(cache)){const r=await fetch(url,{signal:AbortSignal.timeout(25000),headers:{'User-Agent':'Mozilla/5.0'}});if(!r.ok)throw Error(`Asset download ${r.status}: ${url}`);let data=Buffer.from(await r.arrayBuffer());if(isCSS){let css=data.toString();for(const m of [...css.matchAll(/url\((https:[^)]+)\)/g)])css=css.replace(m[1],await localize(m[1]));data=Buffer.from(css);}await writeFile(cache,data);}

 const bytes=await readFile(cache);if(!isCSS&&bytes.subarray(0,100).toString().includes('<!doctype html>'))return '/icon.svg';

 await copyFile(cache,`dist/assets/${id}${ext}`);return `/assets/${id}${ext}`;})();downloads.set(url,task);return task;

}

let firstConfig;const pages=[];

for(const [route,folder]of Object.entries(routes)){

 let html=await readFile(`ui/${folder}/code.html`,'utf8');const config=html.match(/<script id="tailwind-config">([\s\S]*?)<\/script>/)?.[1];if(!firstConfig)firstConfig=config;

 if(['login','signup'].includes(route))html=html.replace(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*?Google(?:(?!<\/button>)[\s\S])*?<\/button>/gi,'').replace(/<!--(?:(?!-->)[\s\S])*?Google(?:(?!-->)[\s\S])*?-->/gi,'').replace(/OR REGISTER WITH EMAIL/g,'REGISTER WITH EMAIL');
 if(!['welcome','login','signup'].includes(route))html=html.replace(/(<main\b[^>]*>)[\s\S]*?<\/main>/,'$1</main>');

 html=html.replace(/<header\b[\s\S]*?<\/header>/g,header=>header.replace(/(<img\b[^>]*\bsrc=")[^"]*(")/g,'$1/icon.svg$2'));

 if(['login','signup'].includes(route))html=html.replace(/(<input\b[^>]*\bvalue=")[^"]*(")/g,'$1$2').replace(/@vance_power or alex.vance@velocity.fit/g,'Handle or email').replace(/e.g. Alex Vance/g,'Your name').replace(/alex.vance@velocity.fit/g,'').replace(/14,820 ACTIVE ATHLETES LOGGING LIVE/g,'YOUR WORKOUTS · SAVED LOCALLY');

 html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/\sonclick="[^"]*"/g,'').replace(/<link[^>]*rel="preconnect"[^>]*>/g,'');

 for(const m of [...html.matchAll(/(?:src|href)="(https:[^"]+)"/g)])html=html.replaceAll(m[1],await localize(m[1]));



 html=html.replace(/<title>[\s\S]*?<\/title>/,'');html=html.replace('</head>',`<title>Engym · ${route}</title><link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#111317"><link rel="apple-touch-icon" href="/icon-180.png"><link rel="icon" href="/icon.svg"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/app.css"><script type="module" src="/app.js"></script></head>`).replace('<body ',`<body data-page="${route}" `);

 await writeFile(`dist/${route}.html`,html);pages.push(`/${route}.html`);

}

const context={tailwind:{}};vm.runInNewContext(firstConfig,context);const config=context.tailwind.config;config.content=['./dist/*.html','./client/**/*.js'];config.safelist=['hidden','bg-primary-container','text-on-primary-fixed','text-primary-container','bg-surface-container-high','bg-surface-container','bg-surface-container-low'];

await writeFile('tailwind.config.cjs',`module.exports=${JSON.stringify(config)}`);

await writeFile('scripts/input.css','@tailwind base;\n@tailwind components;\n@tailwind utilities;');

execFileSync(process.execPath,['node_modules/tailwindcss/lib/cli.js','-c','tailwind.config.cjs','-i','scripts/input.css','-o','dist/styles.css','--minify'],{stdio:'inherit'});

for(const file of await readdir('client'))await copyFile(`client/${file}`,`dist/${file}`);

for(const file of await readdir('assets/vendor'))await copyFile(`assets/vendor/${file}`,`dist/assets/${file}`);

await mkdir('dist/exercise-media',{recursive:true});for(const file of await readdir('assets/exercise-media'))if(file.endsWith('.webp')&&file!=='sample.webp')await copyFile('assets/exercise-media/'+file,'dist/exercise-media/'+file);

await copyFile('shared/domain.mjs','dist/domain.mjs');

await copyFile('node_modules/qrcode-generator/dist/qrcode.mjs','dist/qr.mjs');

await writeFile('dist/index.html',await readFile('dist/welcome.html'));

await writeFile('dist/icon.svg','<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="100" fill="#111317"/><path d="M120 110h280v70H200v45h160v65H200v45h200v70H120z" fill="#c3f400"/></svg>');

await writeIcons();

await writeFile('dist/manifest.webmanifest',JSON.stringify({id:'/',name:'Engym',short_name:'Engym',start_url:'/feed.html',display:'standalone',background_color:'#111317',theme_color:'#111317',icons:[{src:'/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}]}));

const files=['/','/index.html',...pages,'/app.js','/flow.js','/community.js','/config.js','/workout.js','/journal.js','/custom.js','/media.js',...(await readdir('dist/exercise-media')).filter(x=>x.endsWith('.webp')).map(x=>'/exercise-media/'+x),'/exercise-images/dumbbell.svg','/exercise-images/machine.svg','/exercise-images/treadmill.svg','/store.js','/domain.mjs','/qr.mjs','/styles.css','/app.css','/manifest.webmanifest','/icon.svg','/icon-180.png','/icon-192.png','/icon-512.png',...(await readdir('dist/assets')).map(x=>'/assets/'+x)];

const version=createHash('sha256');for(const f of files)version.update(await readFile('dist'+(f==='/'?'/index.html':f)));

await writeFile('dist/sw.js',`const CACHE='engym-${version.digest('hex').slice(0,12)}';const FILES=${JSON.stringify(files)};

self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));

self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('engym-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));

self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).pathname.startsWith('/api/')||new URL(e.request.url).origin!==self.location.origin)return;e.respondWith(caches.open(CACHE).then(async c=>{const hit=await c.match(e.request,{ignoreSearch:true});return hit||fetch(e.request)}));});`);

console.log(`Built ${pages.length} screens and ${downloads.size} offline assets.`);

