"""Assemble an actual-browser demo with native FFmpeg and the game's own music."""
from pathlib import Path
import json,subprocess
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'validation/final/submission'
live=json.loads((ROOT/'validation/final/public-paid/report.json').read_text())
readonly=json.loads((OUT/'capture.json').read_text())
combat=json.loads((OUT/'combat-capture.json').read_text())
font=ROOT/'assets/chog/landing/fonts/Barlow-Bold.ttf';headline=ROOT/'assets/chog/landing/fonts/Bangers-Regular.ttf'
parts=[]
def run(args):subprocess.run(args,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
def clip(index,label,duration,source=None,start=0,still=False,card=False):
 target=OUT/f'part-{index:02}.mp4';caption=OUT/f'caption-{index:02}.txt';caption.write_text(label)
 common=['ffmpeg','-y','-hide_banner','-loglevel','error']
 if card:common+=['-f','lavfi','-i',f'color=c=0xf8f0dd:s=1280x720:r=30:d={duration}']
 elif still:common+=['-loop','1','-i',str(source)]
 else:common+=['-ss',str(start),'-i',str(source)]
 if card:
  title=OUT/f'title-{index:02}.txt';title.write_text('CHOG CLASH' if index==0 else 'PLAY THE HOUSE CUP')
  filter=f'drawtext=fontfile={headline}:textfile={title}:fontsize=92:fontcolor=0x24182e:x=(w-text_w)/2:y=175,drawtext=fontfile={font}:textfile={caption}:fontsize=28:fontcolor=0x24182e:x=(w-text_w)/2:y=320:line_spacing=18'
 else:
  filter=f'scale=1280:640:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:0:color=0xf8f0dd,setsar=1,drawbox=x=0:y=640:w=iw:h=80:color=0x24182e:t=fill,drawtext=fontfile={font}:textfile={caption}:fontsize=24:fontcolor=white:x=30:y=650,drawtext=fontfile={font}:text=Monad testnet tokens | Automated demo clients:fontsize=18:fontcolor=0xffe13b:x=30:y=684'
 run(common+['-t',str(duration),'-vf',filter,'-r','30','-an','-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p','-threads','2',str(target)])
 parts.append(target);print('Rendered',index,label.splitlines()[0],flush=True)
clip(0,'Community fighting. Settlement on Monad.\n12 CHOG | Free matchmaking | Optional paid duels',12,card=True)
clip(1,'A browser arcade for the CHOG community.',12,readonly['videoPath'],1.5)
clip(2,'Free invite PvP: Mamio transforms, Toad summons, touch controls.',15,combat['videoPath'],combat['fightStartSeconds'])
clip(3,'Paid invite: each wallet funds exactly 1 AUSD testnet.',20,live['videoPath'],31)
clip(4,'Paid match. This automated opponent surrenders: Forfeit.',13,live['videoPath'],60)
clip(5,'Verified token transfers: winner 1.90 | platform 0.10 AUSD.',10,readonly['videoPath'],19.3)
clip(6,'Paid queue pairs distinct wallets before either entry is charged.',6,live['videoPath'],74)
clip(7,'Cancelled entry refunded in full. No platform fee.',6,ROOT/'validation/final/public-paid/paid-refund-844x390.png',still=True)
clip(8,'House Cup: four wallets, two semifinals, one final.',8,readonly['videoPath'],30.5)
clip(9,'Sponsor funds 100 AUSD testnet. Verified prizes: 70 / 30.',8,readonly['videoPath'],38.7)
clip(10,'chog-clash-two.vercel.app\nVerified escrow source and actual testnet receipts.\nGameplay is determined by the server and result signer.',10,card=True)
listing=OUT/'concat.txt';listing.write_text(''.join("file '"+str(p)+"'\n" for p in parts))
silent=OUT/'demo-silent.mp4';run(['ffmpeg','-y','-hide_banner','-loglevel','error','-f','concat','-safe','0','-i',str(listing),'-c','copy',str(silent)])
video=OUT/'chog-clash-demo.mp4';run(['ffmpeg','-y','-hide_banner','-loglevel','error','-i',str(silent),'-stream_loop','-1','-i',str(ROOT/'assets/chog/audio/house-cup-groove.mp3'),'-map','0:v','-map','1:a','-c:v','copy','-c:a','aac','-b:a','128k','-af','volume=0.12,afade=t=in:st=0:d=1,afade=t=out:st=118:d=2','-t','120','-movflags','+faststart',str(video)])
meta=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(video)]))
assert 119.5<=float(meta['format']['duration'])<=120.5
assert any(s['codec_name']=='h264' and s['width']==1280 and s['height']==720 for s in meta['streams'])
report={'status':'PASS','durationSeconds':float(meta['format']['duration']),'resolution':'1280x720','bytes':video.stat().st_size,'path':str(video.relative_to(ROOT)),'source':'Actual deployed-browser fight/payment recording plus public read-only ledger/Cup capture and actual refund screenshot','audio':'Original House Cup Groove composed for this project','claims':'Automated clients and Forfeit demo; Monad testnet tokens have no monetary value; gameplay trusts server/signer'}
(OUT/'video.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
