import json,urllib.request,concurrent.futures
from pathlib import Path
source={e['id']:e for e in json.loads(Path('assets/exercise-media/source.json').read_text())}
ids=['Dumbbell_Bench_Press','Incline_Dumbbell_Press','Dumbbell_Flyes','Dumbbell_Shoulder_Press','Side_Lateral_Raise','One-Arm_Dumbbell_Row','Stiff-Legged_Dumbbell_Deadlift','Dumbbell_Squat','Dumbbell_Lunges','Dumbbell_Bicep_Curl','Hammer_Curls','Standing_Dumbbell_Triceps_Extension','Machine_Bench_Press','Butterfly','Wide-Grip_Lat_Pulldown','Seated_Cable_Rows','Machine_Shoulder_Military_Press','Leg_Press','Leg_Extensions','Seated_Leg_Curl','Standing_Calf_Raises','Thigh_Abductor','Standing_Biceps_Cable_Curl','Triceps_Pushdown','Face_Pull','Pullups','Running_Treadmill']
keys=['db-bench','db-incline','db-fly','db-shoulder','db-lateral','db-row','db-rdl','goblet','db-lunge','db-curl','hammer','db-triceps','chest-machine','pec-deck','lat-pulldown','seated-row','shoulder-machine','leg-press','leg-extension','leg-curl','calf-machine','hip-abductor','cable-curl','cable-pushdown','cable-facepull','assisted-pullup','treadmill']
# Source has an unassisted pull-up, so use its actual movement name rather than claiming an assisted-machine photo.
rows=[];downloads=[]
for key,sid in zip(keys,ids):
 e=source[sid];paths=[]
 for i,url in enumerate(e['images']):
  name=f'{key}-{i}.jpg';paths.append('/exercise-media/'+name);downloads.append((url,name))
 rows.append({'id':key,'sourceId':sid,'sourceName':e['name'],'name':e['name'] if key in ['goblet','assisted-pullup'] else None,'primaryMuscles':e['primaryMuscles'],'secondaryMuscles':e['secondaryMuscles'],'instructions':e['instructions'],'images':paths})
def download(item):
 url,name=item;urllib.request.urlretrieve('https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'+url,'assets/exercise-media/'+name)
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:list(pool.map(download,downloads))
Path('client/media.js').write_text('export const exerciseMedia='+json.dumps(rows)+';\n',encoding='utf8')
Path('assets/exercise-media/ATTRIBUTION.md').write_text('Exercise images, instructions and muscle metadata: https://github.com/yuhonas/free-exercise-db (public domain/Unlicense dataset). Exact source IDs are recorded in client/media.js. Goblet/assisted entries relabeled to the actual source movement; no inaccurate machine image substitution.\n')
print('Downloaded',len(downloads),'exercise photos')
