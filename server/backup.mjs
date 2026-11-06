import {DatabaseSync,backup} from 'node:sqlite';
import {mkdir,readdir,unlink,rename,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export async function snapshot({dataDir=process.env.DATA_DIR||path.resolve('data'),backupDir=process.env.BACKUP_DIR||path.join(dataDir,'backups'),retain=Number(process.env.BACKUP_RETAIN)||28}={}){
 await mkdir(backupDir,{recursive:true});const source=path.join(dataDir,'engym.sqlite');await stat(source);
 const db=new DatabaseSync(source,{readOnly:true});const filename=`engym-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`;const target=path.join(backupDir,filename),temporary=target+'.partial';
 try{await backup(db,temporary);const check=new DatabaseSync(temporary,{readOnly:true});try{if(check.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw Error('Snapshot integrity check failed');}finally{check.close();}await rename(temporary,target);}finally{db.close();}
 const files=(await readdir(backupDir)).filter(f=>/^engym-\d{4}-.*\.sqlite$/.test(f)).sort().reverse();for(const f of files.slice(Math.max(1,retain)))await unlink(path.join(backupDir,f));return target;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const run=async()=>{try{await snapshot();console.log('Automatic database snapshot verified.');}catch(e){console.error('Automatic snapshot failed:',e.message);process.exitCode=1;}};
 await run();if(!process.argv.includes('--once')){setInterval(run,Math.max(60,Number(process.env.BACKUP_INTERVAL_SECONDS)||21600)*1000);}
}
