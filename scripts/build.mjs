// Offline, dependency-free build. Named module IDs preserve the validated bundle.
import fs from 'node:fs/promises';
import {readFile,writeFile,mkdir,copyFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=new URL('../',import.meta.url);
process.chdir((await import('node:url')).fileURLToPath(root));
const release=JSON.parse(await readFile('release.json','utf8'));
let commit='working-tree';try{commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{}
const sha=b=>createHash('sha256').update(b).digest('hex');
async function copy(a,b){await mkdir(path.dirname(b),{recursive:true});await copyFile(a,b);}
async function tree(a,b){for(const e of await readdir(a,{withFileTypes:true})){if(e.isSymbolicLink())throw Error('Symlink rejected');if(e.isDirectory())await tree(a+'/'+e.name,b+'/'+e.name);else await copy(a+'/'+e.name,b+'/'+e.name);}}
for(const dir of ['computer','runtime']){await fs.rm('dist/'+dir,{recursive:true,force:true});await mkdir('dist/'+dir,{recursive:true});}
async function bundle(entry,virtual={}){
 const modules=new Map();
 async function visit(file){if(modules.has(file))return;if(!file.startsWith('packages/')||file.includes('..'))throw Error('Unsafe module path');let code=virtual[file]??await readFile(new URL(file,root),'utf8');modules.set(file,'');const deps=[];
 code=code.replace(/^import \{([^}]+)\} from ['"]([^'"]+)['"];\n/gm,(_,names,spec)=>{if(!spec.startsWith('.'))throw Error('External import');const target=path.posix.normalize(path.posix.join(path.posix.dirname(file),spec));deps.push(target);return `const {${names}} = require(${JSON.stringify(target)});\n`;});
 const exported=[];code=code.replace(/^export (const|class|function) (\w+)/gm,(_,kind,name)=>{exported.push(name);return `${kind} ${name}`;});if(/^import |^export /m.test(code))throw Error('Unsupported module '+file);modules.set(file,code+`\nObject.assign(exports,{${exported.join(',')}});`);for(const dep of deps)await visit(dep);}
 for(const file of entry)await visit(file);
 return `'use strict';(()=>{const modules={${[...modules].map(([file,code])=>`${JSON.stringify(file)}:(exports,require)=>{\n${code}\n}`).join(',')}};const cache=Object.create(null);function require(id){if(!cache[id]){const exports={};cache[id]=exports;modules[id](exports,require);}return cache[id];}${entry.map(file=>`require(${JSON.stringify(file)});`).join('')} })();\n`;
}
const worker=await bundle(['packages/basic-session/worker.js']);
const sample=await readFile(new URL('samples/basic/observatory.bas',root),'utf8');
const examples=JSON.parse(await readFile(new URL('samples/basic/examples.json',root),'utf8'));for(const example of examples)example.source=await readFile(new URL(`samples/basic/${example.id}.bas`,root),'utf8');
const js=await bundle(['packages/basic-session/app.js','packages/player/embed.js'],{'packages/basic-session/generated.js':`export const workerSource=${JSON.stringify(worker)};\nexport const sampleSource=${JSON.stringify(sample)};\nexport const examples=${JSON.stringify(examples)};\n`});

const c='dist/computer',r='dist/runtime';
for(const [a,name] of [['packages/basic-session/index.html','index.html'],['packages/basic-session/session.css','session.css'],['packages/player/player.css','player.css'],['packages/basic-session/manifest.json','manifest.json']])await copy(a,c+'/'+name);
await writeFile(c+'/session.js',js);
for(const e of examples)await copy('samples/basic/'+e.id+'.bas',c+'/examples/'+e.id+'.bas');
const chapters=JSON.parse(await readFile('docs/manual/chapters.json','utf8'));
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
await copy('docs/manual/manual.css',c+'/manual/manual.css');
for(const [i,ch]of chapters.entries()){
 const {title,body}=JSON.parse(await readFile('docs/manual/'+ch.id+'.json','utf8'));
 const nav=chapters.map(x=>`<a href="${x.id}.html"${x.id===ch.id?' aria-current="page"':''}>${escape(x.title)}</a>`).join('');
 await writeFile(c+'/manual/'+ch.id+'.html',`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self'; base-uri 'none'; form-action 'none'"><title>${escape(title)} · RetroRealm BASIC</title><link rel="stylesheet" href="manual.css"><body><a class="skip" href="#chapter">Skip to chapter</a><header><a href="index.html">RETROREALM BASIC / MANUAL</a><a href="../index.html">Open BASIC Computer →</a></header><div class="layout"><nav aria-label="Manual chapters">${nav}</nav><main id="chapter"><h1>${escape(title)}</h1>${body}<footer>RetroRealm BASIC ${release.version} · ${release.build} · Apache-2.0 · public beta${chapters[i+1]?`<p><a href="${chapters[i+1].id}.html">Next: ${escape(chapters[i+1].title)} →</a></p>`:''}<p><a href="about.html">Beta, privacy &amp; feedback</a></p></footer></main></div></body></html>`);
}
await copy('docs/about.html',c+'/manual/about.html');
for(const name of ['devices.js','machine.js','parser.js','profiles.js','program.js','session.js'])await copy('packages/basic/'+name,r+'/lib/'+name);
await copy('runtime-index.js',r+'/index.js');
await writeFile(r+'/package.json',JSON.stringify({name:'retrorealm-basic',version:release.version,type:'module',private:true,license:'Apache-2.0',exports:'./index.js',engines:{node:'>=22'}},null,2)+'\n');
await tree(c+'/manual',r+'/manual');await tree(c+'/examples',r+'/examples');
for(const f of (await readdir(r+'/manual')).filter(x=>x.endsWith('.html'))){const p=r+'/manual/'+f;await writeFile(p,(await readFile(p,'utf8')).replace('<a href="../index.html">Open BASIC Computer →</a>','<a href="../README.md">Runtime guide</a>'));}
for(const [dir,kind]of [[c,'COMPUTER'],[r,'RUNTIME']]){
 for(const f of ['LICENSE','NOTICE','THIRD-PARTY-NOTICES.md','CHANGELOG.md'])await copy(f,dir+'/'+f);
 await copy('docs/README-'+kind+'.md',dir+'/README.md');
 await writeFile(dir+'/BUILD.json',JSON.stringify({...release,sourceCommit:commit},null,2)+'\n');
}
async function inventory(dir,prefix=''){let files=[];for(const e of await readdir(dir,{withFileTypes:true})){const name=prefix+e.name;if(e.isDirectory())files.push(...await inventory(dir+'/'+e.name,name+'/'));else{const b=await readFile(dir+'/'+e.name);files.push({path:name,bytes:b.length,sha256:sha(b)});}}return files.sort((a,b)=>a.path.localeCompare(b.path));}
await writeFile('dist/manifest.json',JSON.stringify({...release,sourceCommit:commit,packages:{computer:await inventory(c),runtime:await inventory(r)}},null,2)+'\n');
console.log('Built standalone Computer and runtime '+release.version+' ('+release.build+')');
