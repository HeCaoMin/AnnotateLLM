import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const git=(args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','ignore']});
const files=[...new Set(git(['ls-files','--cached','--others','--exclude-standard','-z']).split('\0').filter(Boolean))];
const allowed=/^(?:\.gitignore|LICENSE|README(?:_EN|_KR)?\.md|CHANGELOG\.md|package(?:-lock)?\.json|\.github\/workflows\/[\w-]+\.ya?ml|(?:extension|editor|scripts|tests)\/[\w.-]+\.(?:m?js|json|html|css|ps1)|docs\/(?:FORMAT|RELEASE|PUBLISHING|PRIVACY|TEST-REPORT)\.md|docs\/assets\/[\w-]+\.(?:svg|png))$/;
const sensitive=[/-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/,/\bgh[pousr]_[A-Za-z0-9]{20,}/,/\bgithub_pat_[A-Za-z0-9_]{20,}/,/\bsk-[A-Za-z0-9_-]{20,}/,/\bAKIA[A-Z0-9]{16}\b/,/[A-Z]:[\\/]Users[\\/][^\s/'"\\]+/i,/\/Users\/[^\s/'"]+/,/https:\/\/chatgpt\.com\/c\/[0-9a-f]{8}-[0-9a-f-]{27,}/i];
const problems=[];
for(const file of files){
 if(!allowed.test(file))problems.push(`${file}: outside public allowlist`);
 if(/\.(?:png)$/.test(file))continue;
 const texts=[];if(fs.existsSync(file))texts.push(fs.readFileSync(file,'utf8'));
 try{texts.push(git(['show',':'+file]));}catch{}
 if(texts.some(t=>sensitive.some(p=>p.test(t))))problems.push(`${file}: potential private data (value suppressed)`);
}
const pkg=JSON.parse(fs.readFileSync('package.json'));const lock=JSON.parse(fs.readFileSync('package-lock.json'));const manifest=JSON.parse(fs.readFileSync('extension/manifest.json'));
if([lock.version,lock.packages[''].version,manifest.version].some(v=>v!==pkg.version))problems.push('Version mismatch');
for(const file of ['README.md','README_EN.md','README_KR.md','extension/privacy.html','extension/privacy-locales.js']){
 const s=fs.readFileSync(file,'utf8');if(!s.includes(pkg.version))problems.push(`${file}: version missing`);
 if(file.startsWith('README'))for(const match of s.matchAll(/(?:src="|\]\()((?:docs\/|README|LICENSE)[^"\s)#]*)/g))if(!fs.existsSync(match[1]))problems.push(`${file}: broken local link ${match[1]}`);
}
if(problems.length){console.error(problems.join('\n'));process.exit(1);}
console.log(`Publication check passed: ${files.length} paths; manual image and diff review still required.`);
