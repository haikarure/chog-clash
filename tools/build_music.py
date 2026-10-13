"""Compose stereo House Cup cues and five ambience loops without borrowed samples."""
from pathlib import Path
import json,subprocess
import numpy as np
import soundfile as sf

ROOT=Path(__file__).resolve().parent.parent;OUT=ROOT/'assets/chog/audio';RATE=32000
def synth(note,length,level=.1):
 t=np.arange(int(length*RATE))/RATE;f=440*2**((note-69)/12)
 return (np.sin(t*f*2*np.pi)+.22*np.sin(t*f*4*np.pi))*np.minimum(1,t/.008)*np.exp(-t*5/length)*level
def add(mix,sound,at,pan=0):
 index=int(at*RATE);n=min(len(sound),len(mix)-index)
 if n>0:mix[index:index+n,0]+=sound[:n]*np.sqrt((1-pan)/2);mix[index:index+n,1]+=sound[:n]*np.sqrt((1+pan)/2)
def save(name,data,loudness=-21):
 tmp=OUT/(name+'.wav');sf.write(tmp,np.tanh(data)*.8,RATE)
 subprocess.run(['ffmpeg','-y','-v','error','-i',str(tmp),'-af',f'loudnorm=I={loudness}:TP=-2:LRA=8','-ar','32000','-codec:a','libmp3lame','-b:a','96k',str(OUT/(name+'.mp3'))],check=True);tmp.unlink()
def build():
 beat=60/118;rng=np.random.default_rng(20261012);melody=[72,76,79,81,79,76,74,72,74,76,79,76,74,72,69,72];tracks=[]
 for name,energy,transpose in [('house-cup-groove',.5,0),('house-cup-battle',.85,0),('house-cup-final',1,2)]:
  bars=32;mix=np.zeros((int(bars*4*beat*RATE),2));roots=[48,53,55,50]
  for bar in range(bars):
   root=roots[(bar//2)%4]+transpose;section=(bar//8)%4
   for step in range(8):
    at=(bar*4+step*.5)*beat;add(mix,synth(root+(12 if step%2 else 0),beat*.46,.16),at,-.2)
    if section!=2 or step%2==0:add(mix,synth(melody[(bar%2)*8+step]+transpose+(12 if section==3 else 0),beat*.7,.10*energy),at,.35 if step%2 else -.35)
    if step%2==0:
     t=np.arange(int(RATE*.17))/RATE;kick=np.sin(2*np.pi*(44*t+1.5*(1-np.exp(-t/.045))))*np.exp(-t*25)*.4*energy;add(mix,kick,at)
    if step in [2,6]:
     t=np.arange(int(RATE*.13))/RATE;snare=rng.uniform(-1,1,len(t))*np.exp(-t*35)*.13*energy;add(mix,snare,at,.1)
    t=np.arange(int(RATE*.04))/RATE;hat=rng.uniform(-1,1,len(t))*np.exp(-t*100)*.025*energy;add(mix,hat,at,-.4 if step%2 else .4)
   if bar%4==3: add(mix,synth(root+24,beat*.4,.05),((bar+1)*4-.25)*beat,.55)
  save(name,mix);tracks.append(name)
 # Sparse environmental beds; these support the arena rather than carrying combat cues.
 for stage,seed,mode in [('rayj-house',1,'room'),('cwo-alley',2,'wind'),('house-cup',3,'crowd'),('neon-street',4,'city'),('cwo-rally',5,'crowd')]:
  random=np.random.default_rng(seed);n=RATE*16;t=np.arange(n)/RATE;mix=np.zeros((n,2))
  for channel in range(2):
   noise=random.uniform(-1,1,n);smooth=np.convolve(noise,np.ones(45)/45,mode='same');mix[:,channel]=smooth*.10
  if mode=='room':mix+=np.sin(2*np.pi*60*t)[:,None]*.004
  elif mode=='city':mix+=np.sin(2*np.pi*(110*t+.025*np.sin(t*.5)))[:,None]*.006
  elif mode=='crowd':
   for i in range(8):add(mix,synth(43+i%5,.8,.017),i*1.8,(-1)**i*.5)
  # Symmetric envelope makes the short bed quiet at the loop boundary.
  fade=np.minimum(1,np.minimum(t/.3,(16-t)/.3));mix*=fade[:,None];save('ambience-'+stage,mix,-34);tracks.append('ambience-'+stage)
 (OUT/'music-production.json').write_text(json.dumps(dict(generator='tools/build_music.py',borrowedSamples=0,channels=2,sampleRate=RATE,bpm=118,musicBars=32,tracks=tracks),indent=2)+'\n')
 print('Built',len(tracks),'stereo score/ambience loops')
if __name__=='__main__':build()
