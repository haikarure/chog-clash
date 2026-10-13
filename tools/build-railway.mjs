/* Package the public runtime and backend only; credentials and databases stay local. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const root=path.resolve(import.meta.dirname,'..');
const output=path.join(root,'server/deployment/railway');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'files.json'),'utf8'));
const precache=fs.readFileSync(path.join(root,'precache.js'),'utf8');
const cache=JSON.parse(precache.slice(precache.indexOf('=')+1).trim().replace(/;$/,''));
const names=new Set();
for(const {file,bytes} of manifest.list){
 const allowed=!file.split('/').some(part=>part.startsWith('.')||part==='..')&&(
  /^[A-Za-z0-9_-]+\.(?:html|css|js)$/.test(file)||
  /^(?:assets\/chog\/|online\/)/.test(file)||
  ['LICENSE','THIRD_PARTY_NOTICES.md'].includes(file)
 );
 if(!allowed||/\/(?:source-art|node_modules)\//.test(file))throw Error('Non-public frontend file in manifest');
 const source=path.join(root,file);
 if(fs.realpathSync(source)!==source||!fs.statSync(source).isFile()||fs.statSync(source).size!==bytes||names.has(file))throw Error('Invalid public file; rebuild the manifest');
 names.add(file);
}
for(const [file,bytes,digest] of cache.files){
 const data=fs.readFileSync(path.join(root,file));
 if(!names.has(file)||data.length!==bytes||createHash('sha1').update(data).digest('hex').slice(0,12)!==digest)throw Error('Runtime hashes changed; rebuild the cache');
}
const backend=['index.ts','app.mjs','auth.mjs','chain.mjs','paid-duels.mjs','funding-recovery.mjs','room.mjs','store.mjs','package.json','package-lock.json'];
for(const file of backend){
 const source=path.join(root,'server',file);
 if(fs.realpathSync(source)!==source||!fs.statSync(source).isFile())throw Error('Backend source must be a regular file');
 names.add('server/'+file);
}
const settlementArtifacts=process.argv.includes('--settlement-artifacts');
if(settlementArtifacts){
 for(const contract of ['HouseCupEscrow','PaidDuelEscrow']){
  const file=`contracts/out/${contract}.sol/${contract}.json`,source=path.join(root,file);
  if(fs.realpathSync(source)!==source||!fs.statSync(source).isFile())throw Error('Compile both escrows before packaging');
  const artifact=JSON.parse(fs.readFileSync(source));
  if(!Array.isArray(artifact.abi)||!artifact.deployedBytecode?.object)throw Error('Invalid settlement artifact');
  names.add(file);
 }
}
fs.rmSync(output,{recursive:true,force:true});fs.mkdirSync(output,{recursive:true});
for(const file of names){const target=path.join(output,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,file),target);}
fs.writeFileSync(path.join(output,'Dockerfile'),`FROM node:24-bookworm-slim
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY . /app
ENV NODE_ENV=production HOST=0.0.0.0 DATABASE_PATH=/data/house-cup.sqlite ENABLE_TESTNET_PRIZES=0
EXPOSE 8080
CMD ["node", "--experimental-strip-types", "index.ts"]
`);
fs.writeFileSync(path.join(output,'.dockerignore'),'node_modules\n**/node_modules\n.env\n**/.env*\n**/*.sqlite*\n.git\n');
// Railway's live API rejects legacy railway.json configuration. Configure the
// linked service explicitly; Dockerfile discovery supplies the image build.
const report={status:'PASS_PACKAGE_ONLY',createdAt:new Date().toISOString(),files:names.size+2,runtimeFiles:cache.files.length,runtimeVersion:cache.version,
 privateFilesIncluded:false,existingDatabaseIncluded:false,signingKeysIncluded:false,prizesEnabled:false,settlementArtifactsIncluded:settlementArtifacts,
 databasePath:'/data/house-cup.sqlite',requiredVolumeMount:'/data',replicas:1,serviceSettingsRequireConfiguration:true,
 output:'server/deployment/railway',deploymentPerformed:false};
const validation=path.join(root,'validation/railway');fs.mkdirSync(validation,{recursive:true});
fs.writeFileSync(path.join(validation,'package.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
