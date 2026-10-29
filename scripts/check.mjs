import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
for(const dir of ['extension','editor','scripts']) for(const name of await fs.readdir(path.join(root,dir))) {
  if(!/\.m?js$/.test(name)) continue;
  const result=spawnSync(process.execPath,['--check',path.join(root,dir,name)],{encoding:'utf8'});
  if(result.status){console.error(result.stderr);process.exit(1);}
}
const m=JSON.parse(await fs.readFile(path.join(root,'extension/manifest.json'),'utf8'));
const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
if(m.version!==pkg.version||!/^\d+\.\d+\.\d+$/.test(m.version)||m.manifest_version!==3||m.permissions.join()!=='storage'||m.host_permissions.join()!=='https://chatgpt.com/*'||m.content_scripts[0].matches.join()!=='https://chatgpt.com/*') throw Error('Manifest scope or version mismatch');
console.log('Syntax and manifest checks passed');
if(!m.content_scripts.every(s=>s.matches.join()==='https://chatgpt.com/*')||!m.content_scripts.some(s=>s.run_at==='document_start'&&s.js.includes('keyboard-guard.js'))) throw Error('Keyboard isolation must start early and remain limited to ChatGPT');
