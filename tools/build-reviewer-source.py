"""Prepare a reviewer source snapshot; never copy credentials, databases or old Git history."""
from pathlib import Path
import json,shutil,hashlib
ROOT=Path(__file__).resolve().parent.parent
DOC=ROOT.parents[1]/'docs/chog-clash'
if not DOC.exists():DOC=ROOT/'docs'
OUT=ROOT/'server/deployment/reviewer-source'
if (OUT/'.git').exists():raise RuntimeError('Reviewer checkout already initialized; update it explicitly')
manifest=json.loads((ROOT/'files.json').read_text());names={row['file'] for row in manifest['list']}
names.update(['files.json','.gitignore','.monskills','LICENSE','LICENSE-ASSETS.md','THIRD_PARTY_NOTICES.md','COMIC_DESIGN.md'])
for pattern in ['tools/*','server/*.mjs','server/index.ts','server/package*.json','server/.env.example','server/test/*.mjs','server/tools/*.mjs','contracts/src/*.sol','contracts/test/*.sol','contracts/foundry.toml','assets/chog/source-art/*','assets/chog/*provenance*.json','validation/final/**/*.json','validation/testnet/acceptance.json','validation/testnet/paid-duel-acceptance.json','validation/testnet/paid-duel-explorer.json','validation/online/test-summary.json','validation/funding/browser.json','validation/audit/landing-baseline.json','validation/comic*.png','validation/landing.json','validation/runtime.json','validation/layout.json']:
 names.update(str(p.relative_to(ROOT)) for p in ROOT.glob(pattern) if p.is_file())
names={name for name in names if '__pycache__' not in name and not name.endswith('.pyc')}
secrets=[]
env=ROOT/'server/.env'
if env.exists():
 for line in env.read_text().splitlines():
  if '=' not in line or line.lstrip().startswith('#'):continue
  key,value=line.split('=',1);value=value.strip().strip('"\'')
  if value and ('PRIVATE_KEY' in key or 'API_KEY' in key or key=='MONAD_TESTNET_RPC_URL') and len(value)>=20:
   secrets.append(value.encode())
   if value.startswith('0x'):secrets.append(value[2:].encode())
if OUT.exists():shutil.rmtree(OUT)
OUT.mkdir(parents=True)
for name in sorted(names):
 p=ROOT/name
 if not p.is_file() or p.is_symlink():raise RuntimeError('Invalid regular source path '+name)
 if any(part in ['node_modules','deployment','data','.git','.vercel','out','cache'] for part in p.relative_to(ROOT).parts):raise RuntimeError('Private/generated directory selected '+name)
 data=p.read_bytes()
 if any(secret in data for secret in secrets):raise RuntimeError('Private value found in selected source '+name)
 target=OUT/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
 if target.suffix=='.md':target.write_text(target.read_text().replace('../../docs/chog-clash/','docs/'))
(OUT/'docs').mkdir()
for name in ['SUBMISSION_PACKAGE_2026-10-14.md','ONLINE_VALIDATION.json','LORE_RESEARCH.md','LORE_RESEARCH.json']:
 p=DOC/name
 if p.exists():
  data=p.read_text().replace('../../game/chog-clash/','../')
  (OUT/'docs'/name).write_text(data)
(OUT/'README.md').write_text('''# CHOG Clash

A browser fighting game for the CHOG community, with free matchmaking, optional paid duels and sponsor-funded tournaments settled on Monad.

**[Play the live demo](https://chog-clash-two.vercel.app)** · [Submission write-up](docs/SUBMISSION_PACKAGE_2026-10-14.md) · [Acceptance evidence](docs/ONLINE_VALIDATION.json)

## Play

Choose one of 12 CHOG fighters. Invite a friend or use Quick Match for free; no wallet is needed. CPU and Training modes are also available. Keyboard: A/D movement, W jump, Space basic, I/O skills, P ultimate. Mobile has touch controls.

Paid duels use two distinct SIWE wallets: 1 AUSD testnet entry each, winner 1.90 and platform 0.10 (5%). Pairing does not charge an entry. House Cup has four free entrants, a 100 AUSD testnet sponsor pool and 70/30 prizes with zero Cup fee. Cancellation, Void and expiry refund applicable deposits in full. Test tokens have no monetary value; MON network fees are separate.

Combat runs on an authoritative server. Monad escrows validate funding, eligible signed results and fixed payouts. Server/result-signer honesty remains a trust assumption; replay hashes support auditing and do not prove honest gameplay.

## Run locally

Node 24+ is required. From this checkout:

```bash
npm --prefix server ci
npm --prefix server start
```

Open http://localhost:5174/play.html. Free PvP, Practice Cup, CPU and Training work without keys. Copy server/.env.example to server/.env only when configuring your own verified testnet service. Never commit keys. The project runs one backend instance with persistent SQLite; it does not claim distributed matchmaking.

## Contracts and tests

Install Foundry (forge/anvil), then:

```bash
npm --prefix server run build:contracts
npm --prefix server test
npm --prefix server run test:contracts
```

43 Node tests and 38 Solidity tests passed. The Node suite deploys real local-EVM fixtures and tests invitation/queue, payout/fee, cancellation, failed transfers, missing hashes, retry, restart Void and direct-wallet cancellation. Four Solidity fuzz tests each run 256 cases.

[Paid escrow source](https://testnet.monadscan.com/address/0xB15097FcB9DE04A2CEb844f1a9C88929E3d8cAd7#code) · [Cup escrow source](https://testnet.monadscan.com/address/0xeEe983581d5f747eC31Cda37C2645F65af31CB5E#code)

Actual Monad testnet receipts and token transfers prove paid winner/platform payments, Cup 70/30 and refunds. The public Vercel/Railway demo passed browser/payment/mobile acceptance. Network proxy tests completed ten bot matches near 100 ms RTT and one near 200 ms, with uniform jitter ±15 ms per direction and 1% input/snapshot message loss. Both clients and deterministic replay agreed. This is application-message loss, not TCP packet loss or a physical WAN test.

Physical devices, device frame benchmarks and four-human Cup feedback are still unverified. Simulated wallets and Forfeit-based settlement tests do not establish adoption, engagement or sponsor ROI.

## Source and attribution

This repository is a reviewer snapshot of the CHOG Clash working source. It does not reproduce the original working repository's entire history. The combat engine adapts [Aether Clash by Bang Tutorial](https://github.com/bangtutorial/aether-clash), original commit 1ac9751f86569b6b8c177994d5074a0d85faf94d, under MIT. The original copyright is retained in [LICENSE](LICENSE).

CHOG references and their owners' rights, generated art, local rigs/music and synthetic announcer cues are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [LICENSE-ASSETS.md](LICENSE-ASSETS.md). This is a community fan adaptation and does not claim official CHOG affiliation. Existing engine code is attributed separately from the CHOG presentation, multiplayer backend, escrows and product flows built for this project.

Credentials, session tokens, player databases, dependency installs and private deployment packets are excluded. Build artifacts can be regenerated. Runtime assets and original generated-art inputs are included.
''')
report={'status':'PASS_SOURCE_PACKET','files':len(list(OUT.rglob('*'))),'selectedFiles':len(names),'privateValueScanCount':len(secrets),'credentialsIncluded':False,'databasesIncluded':False,'oldGitHistoryIncluded':False,'output':str(OUT.relative_to(ROOT))}
(ROOT/'validation/final/reviewer-source.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
