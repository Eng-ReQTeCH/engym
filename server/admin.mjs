import {DatabaseSync,backup} from 'node:sqlite';
import {randomBytes,scryptSync} from 'node:crypto';
import path from 'node:path';
const dir=process.env.DATA_DIR||path.resolve('data');
const db=new DatabaseSync(path.join(dir,'engym.sqlite'));
const [command,target]=process.argv.slice(2);
try{
 if(command==='backup'&&target){await backup(db,path.resolve(target));console.log('SQLite backup written. Treat it as private account data.');}
 else if(command==='reset-password'&&target){let input='';for await(const chunk of process.stdin)input+=chunk;const password=input.trim();if(password.length<10||password.length>200)throw Error('Password must be 10–200 characters, supplied through stdin');const user=db.prepare('SELECT id FROM users WHERE handle=?').get(target);if(!user)throw Error('Handle not found');const salt=randomBytes(16).toString('hex');db.prepare('UPDATE users SET password=?,salt=? WHERE id=?').run(scryptSync(password,salt,64).toString('hex'),salt,user.id);db.prepare('DELETE FROM sessions WHERE userId=?').run(user.id);console.log('Password reset; all server sessions revoked.');}
 else if(['ban','unban'].includes(command)&&target){const user=db.prepare('SELECT id FROM users WHERE handle=?').get(target);if(!user)throw Error('Handle not found');db.prepare('UPDATE users SET disabled=? WHERE id=?').run(command==='ban'?1:0,user.id);if(command==='ban')db.prepare('DELETE FROM sessions WHERE userId=?').run(user.id);console.log('Account moderation updated.');}
 else if(command==='reports'){console.log(JSON.stringify(db.prepare('SELECT r.*,u.handle FROM reports r JOIN users u ON u.id=r.userId WHERE resolved=0 ORDER BY created').all(),null,2));}
 else if(command==='resolve-report'&&target){db.prepare('UPDATE reports SET resolved=1 WHERE id=?').run(target);console.log('Report resolved.');}
 else if(command==='remove-post'&&target){db.exec('BEGIN IMMEDIATE');try{db.prepare('DELETE FROM comments WHERE postId=?').run(target);db.prepare('DELETE FROM kudos WHERE postId=?').run(target);db.prepare('DELETE FROM posts WHERE id=?').run(target);db.prepare('UPDATE reports SET resolved=1 WHERE postId=?').run(target);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}console.log('Published post removed. Private workout is retained.');}
 else throw Error('Usage: node server/admin.mjs backup <file> OR reset-password <handle> (new password through stdin); reports; resolve-report <id>; remove-post <id>; ban/unban <handle>');
}finally{db.close();}
