"""Bake CHOG speech locally with Kokoro-82M; no runtime TTS or paid API.

Install kokoro-onnx==0.6.1 and soundfile in a Python 3.12 venv. Models are
build dependencies in ~/.cache/chog-tts, never included in the game payload.
Model: https://huggingface.co/hexgrad/Kokoro-82M (Apache-2.0).
Runtime: https://github.com/thewh1teagle/kokoro-onnx (MIT).
"""
from pathlib import Path
import json,subprocess,hashlib,os
os.environ.setdefault('OMP_NUM_THREADS','4')
import soundfile as sf
from kokoro_onnx import Kokoro

ROOT=Path(__file__).resolve().parent.parent
CACHE=Path.home()/'.cache/chog-tts'
OUT=ROOT/'assets/chog/audio'
ROSTER=json.loads((ROOT/'chog-roster.json').read_text())['characters']
PERSONAS={
 'yot':('am_puck',1.08,'Crew, with me!'),
 'mamio':('af_sky',1.13,'Golden time!'),
 'benja':('am_eric',1.10,'Bring the rally!'),
 'toad':('am_michael',.97,'Stand your ground.'),
 'ping':('af_nova',1.16,'Patrol incoming!'),
 'novee':('af_jessica',1.12,'Deploy the bugs!'),
 'tonashiro':('am_echo',1.02,'Drones, online.'),
 'bigchog':('am_onyx',.96,'Big reply incoming!'),
 'rogue':('af_bella',1.12,'Make a mess!'),
 'tabsu':('am_liam',1.02,'Time for the bonk.'),
 'venty':('af_heart',1.14,'Special delivery!'),
 'cookie':('af_sarah',1.08,'Make some noise!')
}
def main():
 model=CACHE/'kokoro-v1.0.onnx';voices=CACHE/'voices-v1.0.bin'
 if not model.exists() or not voices.exists():raise SystemExit('Download model-files-v1.1 from kokoro-onnx into '+str(CACHE))
 engine=Kokoro(str(model),str(voices));clips={};produced=[]
 # Limit ONNX thread fan-out on shared workstations.
 import onnxruntime as ort
 options=ort.SessionOptions();options.intra_op_num_threads=4;options.inter_op_num_threads=1
 if hasattr(engine,'sess'):engine.sess=ort.InferenceSession(str(model),sess_options=options,providers=['CPUExecutionProvider'])
 def bake(filename,text,voice='am_fenrir',speed=1.09):
  wav=CACHE/(filename+'.wav');samples,rate=engine.create(text,voice=voice,speed=speed,lang='en-us')
  sf.write(wav,samples,rate)
  dest=OUT/(filename+'.mp3')
  subprocess.run(['ffmpeg','-y','-v','error','-i',str(wav),'-af','loudnorm=I=-19:TP=-2:LRA=7,afade=t=in:d=0.008','-ar','24000','-ac','1','-codec:a','libmp3lame','-b:a','64k',str(dest)],check=True)
  duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',str(dest)]))
  produced.append(dict(file=dest.relative_to(ROOT).as_posix(),text=text,voice=voice,speed=speed,duration=duration,sha256=hashlib.sha256(dest.read_bytes()).hexdigest()))
  print('Speech:',filename,round(duration,2),flush=True)
  return dict(file=dest.relative_to(ROOT).as_posix(),duration=duration,text=text)
 for key,text in {'round_1':'Round one!','round_2':'Round two!','round_3':'Final round!','fight':'Fight!','ko':'K.O.!','draw':'Draw!','time_up':'Time up!','double_ko':'Double K.O.!'}.items():clips[key]=bake(key,text)
 for c in ROSTER:
  cid=c['id'];kit=c['source_kit_id'];name=c['display_name']
  # Spelling for pronunciation is separate from visible CHOG names.
  spoken={'mamio':'Mam-ee-oh','benja':'Ben-jah','novee':'No-vee','tonashiro':'Tona-shee-ro','bigchog':'Big Chog','tabsu':'Tab-soo','venty':'Ven-tee','ping':'Ping, ping, ping, ping'}.get(cid,name)
  clips['select_'+kit]={**bake(cid+'-select',spoken+'!'),'text':name,'character':cid}
  clips[kit+'_wins']={**bake(cid+'-wins',spoken+' wins!'),'text':name+' wins!','character':cid}
  voice,speed,line=PERSONAS[cid];bake(cid+'-ultimate',line,voice,speed)
 manifest=dict(voice='CHOG House Cup Announcer',type='locally generated spoken VO / Kokoro-82M',clips=clips,ultimateText={c:settings[2] for c,settings in PERSONAS.items()})
 (OUT/'manifest.js').write_text('window.ANNOUNCER_MANIFEST = '+json.dumps(manifest,separators=(',',':'))+';\n')
 (OUT/'voice-production.json').write_text(json.dumps(dict(model='hexgrad/Kokoro-82M v1.0',modelLicense='Apache-2.0',generator='kokoro-onnx 0.6.1 / MIT',modelSHA256=hashlib.sha256(model.read_bytes()).hexdigest(),synthetic=True,fanGameInterpretation=True,clips=produced,limitations='TTS direction, not human actor performance; physical speaker listening still required.'),indent=2)+'\n')
 print('Produced',len(produced),'spoken cues',flush=True)
if __name__=='__main__':main()
