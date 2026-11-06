import json,urllib.request,concurrent.futures
from pathlib import Path
if not Path('assets/exercise-media/repdb.json').exists():
 urllib.request.urlretrieve('https://raw.githubusercontent.com/RepDB/exercise-dataset/main/exercises.json','assets/exercise-media/repdb.json')
source={e['id']:e for e in json.loads(Path('assets/exercise-media/repdb.json').read_text(encoding='utf8'))['exercises']}
keys=['db-bench','db-incline','db-fly','db-shoulder','db-lateral','db-row','db-rdl','goblet','db-lunge','db-curl','hammer','db-triceps','chest-machine','pec-deck','lat-pulldown','seated-row','shoulder-machine','leg-press','leg-extension','leg-curl','calf-machine','hip-abductor','cable-curl','cable-pushdown','cable-facepull','assisted-pullup','treadmill']
ids=['db-bench-press','incline-db-press','db-fly','dumbbell-shoulder-press','lateral-raise','single-arm-db-row','dumbbell-romanian-deadlift','db-goblet-squat','db-lunge','bicep-curl','hammer-curl','dumbbell-tricep-extension','chest-press-machine','pec-deck','lat-pulldown','seated-cable-row','machine-shoulder-press','leg-press','leg-extension','seated-leg-curl','machine-calf-raise','hip-abduction','cable-curl','tricep-pushdown','face-pull','assisted-pull-ups','treadmill-running']
keys += ['squat','bench','deadlift','ohp','row','rdl','incline','pullup','incline-db','lateral','curl','pushdown']
ids += ['squat','bench-press','deadlift','ohp','barbell-row','romanian-deadlift','incline-bench-press','pull-up','incline-db-press','lateral-raise','bicep-curl','tricep-pushdown']
rows=[];jobs=[]
for key,sid in zip(keys,ids):
 e=source[sid];paths=[]
 for i,path in enumerate(e['images']['flat'].values()):
  name=key+'-'+str(i)+'.webp';paths.append('/exercise-media/'+name);jobs.append((path,name))
 rows.append(dict(id=key,sourceId=sid,sourceName=e['name_en'],primaryMuscles=[m.replace('_',' ') for m in e['primary_muscles']],secondaryMuscles=[m.replace('_',' ') for m in e.get('secondary_muscles',[])],instructions=e['instructions_en'],images=paths))
def fetch(job):
 path,name=job
 if Path('assets/exercise-media/'+name).exists():return
 urllib.request.urlretrieve('https://raw.githubusercontent.com/RepDB/exercise-dataset/main/'+path,'assets/exercise-media/'+name)
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:list(pool.map(fetch,jobs))
Path('client/media.js').write_text('export const exerciseMedia='+json.dumps(rows)+';\n',encoding='utf8')
urllib.request.urlretrieve('https://raw.githubusercontent.com/RepDB/exercise-dataset/main/LICENSE-DATA.md','assets/exercise-media/REPDB-LICENSE.md')
Path('assets/exercise-media/ATTRIBUTION.md').write_text('Exercise data by RepDB (https://repdb.co). Square 512px free-tier illustrations and exercise metadata integrated in Engym under REPDB-LICENSE.md. No premium samples used. Not licensed for redistribution as a standalone dataset.\n',encoding='utf8')
print('Bundled',len(jobs),'square illustrations across',len(rows),'movements')

