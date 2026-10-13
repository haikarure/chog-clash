"""Seed/check a hosted Practice Cup across an externally performed deployment restart.

Run seed, restart/redeploy the target service, then run check. Bearer state stays in
the ignored private deployment directory; public evidence contains no credentials.
"""
import argparse,json,os,hashlib
from pathlib import Path
from datetime import datetime,timezone
from urllib.request import Request,urlopen

ROOT=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser()
parser.add_argument('phase',choices=['seed','check'])
parser.add_argument('--base',required=True)
args=parser.parse_args()
assert args.base.startswith('https://') and args.base.count('/')==2,'Use an HTTPS origin'
private=ROOT/'server/deployment/hosted-persistence.json'
out=ROOT/'validation/railway/persistence.json'

def request(route,token=None,body=None):
 headers={'Content-Type':'application/json'}
 if token:headers['Authorization']='Bearer '+token
 req=Request(args.base+'/api'+route,headers=headers,data=None if body is None else json.dumps(body).encode())
 with urlopen(req,timeout=30) as response:return json.load(response)

if args.phase=='seed':
 host=request('/session');player=request('/session')
 cup=request('/cups',host['token'],{'name':'Railway persistence acceptance','mode':'practice'})
 request('/cups/'+cup['id']+'/check-in',player['token'],{'invite':cup['participants'][0]['invite'],'nickname':'Persistence player','chog':'yot'})
 cup=request('/cups/'+cup['id'],host['token'])
 assert cup['host'] and cup['state']=='Draft' and cup['participants'][0]['checked']
 private.parent.mkdir(parents=True,exist_ok=True)
 fd=os.open(private,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
 with os.fdopen(fd,'w') as file:json.dump({'base':args.base,'hostToken':host['token'],'playerToken':player['token'],'cup':cup},file)
 private.chmod(0o600)
 report={'status':'SEEDED_WAITING_FOR_RESTART','seededAt':datetime.now(timezone.utc).isoformat(),'baseUrl':args.base,
  'cupIdSha256':hashlib.sha256(cup['id'].encode()).hexdigest(),'credentialsIncluded':False}
else:
 state=json.loads(private.read_text());assert state['base']==args.base
 old=state['cup'];cup=request('/cups/'+old['id'],state['hostToken'])
 assert cup['host'] and cup['state']=='Draft'
 assert all(cup[k]==old[k] for k in ['id','name','created','participants','pool','mode'])
 player=request('/cups/'+old['id'],state['playerToken']);assert player['participants'][0]['isYou']
 public=request('/cups/'+old['id']);assert not public['host'] and all('invite' not in p for p in public['participants'])
 cancelled=request('/cups/'+old['id']+'/cancel-practice',state['hostToken'],{})
 assert cancelled['state']=='Cancelled'
 report=json.loads(out.read_text());report.update(status='PASS',verifiedAt=datetime.now(timezone.utc).isoformat(),
  checks={'hostSessionSurvives':True,'participantSessionSurvives':True,'draftAndInviteTokensSurvive':True,
   'checkInSurvives':True,'anonymousReportHidesInvites':True,'hostCanCancelAfterRestart':True})
out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
