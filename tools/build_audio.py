"""Compose original arcade music and cue sounds without borrowed samples."""
from pathlib import Path
import json
import subprocess
import wave
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
RATE = 22050
OUT = ROOT / 'assets/chog/audio'
ROSTER = json.loads((ROOT / 'chog-roster.json').read_text())['characters']


def frequency(note): return 440 * 2 ** ((note - 69) / 12)


def tone(note, duration, level=.24, mode='triangle'):
    t = np.arange(int(RATE * duration)) / RATE
    phase = t * frequency(note)
    signal = np.sin(2 * np.pi * phase) if mode == 'sine' else 2 / np.pi * np.arcsin(np.sin(2 * np.pi * phase))
    return signal * np.minimum(1, t / .008) * np.maximum(0, 1 - t / duration) ** 1.45 * level


def add(target, sound, start):
    at = int(start * RATE); count = min(len(sound), len(target) - at)
    if count > 0: target[at:at+count] += sound[:count]


def save(name, samples):
    OUT.mkdir(parents=True, exist_ok=True)
    samples = np.tanh(samples) * .85
    fade = min(220, len(samples) // 3)
    samples[:fade] *= np.linspace(0, 1, fade); samples[-fade:] *= np.linspace(1, 0, fade)
    temporary = OUT / (name + '.wav')
    with wave.open(str(temporary), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
        w.writeframes((samples * 32767).astype('<i2').tobytes())
    subprocess.run(['ffmpeg','-loglevel','error','-y','-i',str(temporary),'-c:a','libmp3lame','-q:a','3',str(OUT/(name+'.mp3'))],check=True)
    temporary.unlink()
    return len(samples) / RATE


def cue(name, notes, gap=.13, duration=.45):
    samples = np.zeros(int((gap * (len(notes)-1) + duration) * RATE))
    for i, n in enumerate(notes):
        add(samples, tone(n, duration, .29), i*gap)
        add(samples, tone(n+12, duration*.68, .10, 'sine'), i*gap)
    return save(name, samples)


def build():
    clips = {}
    notes = {'round_1':[60,67,72],'round_2':[62,69,74],'round_3':[64,71,76],
             'fight':[72,76,79,84],'ko':[67,60,48], 'draw':[60,62,60],
             'time_up':[76,76,69],'double_ko':[72,60,48,36]}
    for name, melody in notes.items():
        duration=cue(name,melody)
        clips[name]={'file':'assets/chog/audio/'+name+'.mp3','duration':duration,'text':name.replace('_',' ').upper()}
    for i, ch in enumerate(ROSTER):
        root=60+i%6
        for suffix, melody in [('select',[root,root+7]),('wins',[root,root+4,root+7,root+12]),('ultimate',[root-12,root,root+7,root+12,root+19])]:
            key='select_'+ch['source_kit_id'] if suffix=='select' else ch['source_kit_id']+'_wins'
            name=ch['id']+'-'+suffix
            duration=cue(name,melody,.09 if suffix=='ultimate' else .12,.47)
            if suffix!='ultimate': clips[key]={'file':'assets/chog/audio/'+name+'.mp3','duration':duration,'text':ch['display_name']+' '+suffix,'character':ch['id']}
    # Sixteen original bars at 118 BPM: pentatonic hook, bass and synthesized percussion.
    beat=60/118; samples=np.zeros(int(16*4*beat*RATE))
    melody=[72,None,76,79,81,79,76,None,74,76,79,None,76,74,72,None]
    roots=[48,53,55,50]; rng=np.random.default_rng(20261011)
    for bar in range(16):
        root=roots[(bar//2)%4]
        for step in range(8):
            at=(bar*4+step/2)*beat
            add(samples,tone(root+(12 if step%2 else 0),beat*.41,.19),at)
            n=melody[(bar%2)*8+step]
            if n is not None: add(samples,tone(n+(12 if bar>=12 else 0),beat*.42,.13),at)
            if step%2==0:
                t=np.arange(int(RATE*.17))/RATE
                add(samples,np.sin(2*np.pi*(44*t+34*.045*(1-np.exp(-t/.045))))*np.exp(-t*23)*.35,at)
            if step in [2,6]:
                t=np.arange(int(RATE*.13))/RATE
                add(samples,rng.uniform(-1,1,len(t))*np.exp(-t*32)*.11,at)
            t=np.arange(int(RATE*.045))/RATE
            add(samples,rng.uniform(-1,1,len(t))*np.exp(-t*95)*.027,at)
    music_duration=save('house-cup-groove',samples)
    manifest={'voice':'CHOG Arcade','type':'original synthesized earcons; no spoken voice','clips':clips}
    (OUT/'manifest.js').write_text('window.ANNOUNCER_MANIFEST = '+json.dumps(manifest,separators=(',',':'))+';\n')
    (OUT/'provenance.json').write_text(json.dumps({'generator':'tools/build_audio.py','borrowed_samples':0,'music':'House Cup Groove','music_duration':music_duration,'audio_files':len(list(OUT.glob('*.mp3')))},indent=2)+'\n')
    print('Original music and', len(clips), 'announcer cues; 12 ultimate stingers.')


if __name__=='__main__':
    # Compatibility entrypoint: preserve the upgraded spoken bank instead of
    # replacing it with this file's earlier prototype earcons.
    import sys
    python=Path.home()/'.cache/chog-tts/venv/bin/python'
    if not python.exists():raise SystemExit('Set up local voice generation as described in ASSET_REBUILD.md, then run build_voice.py and build_music.py.')
    for script in ['build_voice.py','build_music.py']:
        subprocess.run([str(python),str(ROOT/'tools'/script)],check=True)
