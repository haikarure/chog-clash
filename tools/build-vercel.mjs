/* Build a public-only Vercel Build Output API v3 packet. No source tree upload. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const root=path.resolve(import.meta.dirname,'..');
const args=process.argv.slice(2);
let backend=null;
if(args.length){
 if(args.length!==2||args[0]!=='--backend')throw Error('Usage: node tools/build-vercel.mjs [--backend https://public-backend.example]');
 const url=new URL(args[1]);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Backend must be a public HTTPS origin without credentials or a path');
 backend=url.origin;
}

const manifest=JSON.parse(fs.readFileSync(path.join(root,'files.json'),'utf8'));
const cacheText=fs.readFileSync(path.join(root,'precache.js'),'utf8');
const cache=JSON.parse(cacheText.slice(cacheText.indexOf('=')+1).trim().replace(/;$/,''));
const allow=name=>!name.split('/').some(p=>p==='..'||p.startsWith('.'))&&(
 /^[A-Za-z0-9_-]+\.(?:html|css|js)$/.test(name)||
 /^(?:assets\/chog\/|online\/)/.test(name)||
 ['LICENSE','THIRD_PARTY_NOTICES.md'].includes(name)
);
const names=new Set();
for(const entry of manifest.list){
 if(!allow(entry.file)||/\/(?:source-art|node_modules)\//.test(entry.file))throw Error('Frontend manifest contains a non-public path');
 const file=path.join(root,entry.file);
 if(!fs.statSync(file).isFile()||fs.realpathSync(file)!==file)throw Error('Public files must be regular files inside the game directory');
 if(fs.statSync(file).size!==entry.bytes)throw Error('Rebuild files.json before packaging');
 if(names.has(entry.file))throw Error('Frontend manifest contains duplicate paths');
 names.add(entry.file);
}
for(const [name,bytes,digest] of cache.files){
 if(!names.has(name))throw Error('Precache file is missing from the public manifest');
 const data=fs.readFileSync(path.join(root,name));
 if(data.length!==bytes||createHash('sha1').update(data).digest('hex').slice(0,12)!==digest)throw Error('Runtime hashes changed; rebuild the cache before packaging');
}

const output=path.join(root,'.vercel/output'),staticRoot=path.join(output,'static');
fs.rmSync(output,{recursive:true,force:true});fs.mkdirSync(staticRoot,{recursive:true});
for(const name of names){const target=path.join(staticRoot,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,name),target);}
const routes=[
 {src:'/(.*)',headers:{'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'},continue:true},
 {src:'/(?:server|contracts|data|node_modules)(?:/.*)?',status:404},
 {src:'/(?:.*?/)?\\.[^/]*(?:/.*)?',status:404},
 {src:'/(.*\\.(?:html|m?js|css|json))',headers:{'Cache-Control':'no-cache'},continue:true},
];
if(backend){
 routes.push({src:'/api/(.*)',dest:backend+'/api/$1'});
 routes.push({src:'/matchmake/(.*)',dest:backend+'/matchmake/$1'});
}
routes.push({handle:'filesystem'});
// Colyseus uses /processId/roomId. Forward that route only after public files.
if(backend)routes.push({src:'/([A-Za-z0-9_-]+)/([A-Za-z0-9_-]+)',dest:backend+'/$1/$2'});
routes.push({src:'/(.*)',status:404});
const configuration={version:3,routes};
fs.writeFileSync(path.join(output,'config.json'),JSON.stringify(configuration,null,2)+'\n');
const report={status:'PASS_PACKAGE_ONLY',createdAt:new Date().toISOString(),format:'Vercel Build Output API v3',files:names.size,runtimeFiles:cache.files.length,runtimeVersion:cache.version,bytes:manifest.bytes,backendOrigin:backend,privateFilesIncluded:false,deploymentPerformed:false,onlineProxyVerified:false,accountSelection:'Required before linking/deploying; do not infer a scope from the current login'};
const validation=path.join(root,'validation/vercel');fs.mkdirSync(validation,{recursive:true});
fs.writeFileSync(path.join(validation,'package.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
