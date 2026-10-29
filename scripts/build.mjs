import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import {build} from 'esbuild';
const root = path.resolve(import.meta.dirname, '..'), src = path.join(root, 'extension'), out = path.join(root, 'dist', 'dialog-notes');
await fs.rm(out, {recursive: true, force: true});
await fs.mkdir(out, {recursive: true});
await fs.copyFile(path.join(root, 'LICENSE'), path.join(out, 'LICENSE'));
const css = await fs.readFile(path.join(src, 'ui.css'), 'utf8');
const appCss = css.replaceAll(':host(.dark)', ':root.dark').replaceAll(':host', ':root') + `
body{margin:0;background:#f6f7f2;color:var(--ink);font:14px/1.6 system-ui,"Microsoft YaHei",sans-serif}#app{max-width:1240px;margin:auto;padding:36px}h1{font-size:30px;letter-spacing:-1px;margin:7px 0}a{color:var(--accent)}.intro{color:var(--muted);margin:8px 0 20px}.app-head{display:flex;justify-content:space-between;align-items:center;gap:24px;margin-bottom:20px}.status{padding:12px 0;color:var(--muted);font-size:12px}.workspace{display:grid;grid-template-columns:260px 1fr;border:1px solid var(--line);border-radius:20px;overflow:hidden;background:var(--bg);min-height:480px}.library-nav{padding:20px;border-right:1px solid var(--line);background:#f0f3ed}.conversation-link{display:flex;flex-direction:column;gap:4px;width:100%;text-align:left;margin:6px 0;padding:12px}.conversation-link[aria-current=true]{border-color:var(--accent);background:var(--soft)}.library-detail{padding:28px;min-width:0}.note-card{padding:22px;margin:24px 0;background:var(--soft);border-radius:12px}.app-footer{margin-top:24px;font-size:12px;color:var(--muted)}.popup{width:350px}.popup #app{padding:24px}.popup h1{font-size:24px}.popup .stack{margin:20px 0}.privacy{max-width:800px;margin:40px auto;padding:24px}.privacy h2{margin-top:24px}.privacy p{margin:12px 0}.import-modal{width:min(950px,100%)}.import-rows{max-height:55vh;overflow:auto}.diff-columns{display:grid;grid-template-columns:1fr 1fr;gap:16px}.diff-columns pre{white-space:pre-wrap;max-height:240px;overflow:auto;font-size:12px;background:var(--soft);padding:12px}details{margin-top:8px}summary{cursor:pointer}@media(max-width:750px){#app{padding:18px}.app-head{display:block}.workspace{grid-template-columns:1fr}.library-nav{border-right:0;max-height:220px;overflow:auto}.library-detail{padding:18px}.diff-columns{grid-template-columns:1fr}}
`;
for (const name of await fs.readdir(src)) { if ((await fs.stat(path.join(src, name))).isFile()) await fs.copyFile(path.join(src, name), path.join(out, name)); }
await fs.writeFile(path.join(out, 'styles.js'), `globalThis.DNStyles = ${JSON.stringify(css)};\n`);
await fs.writeFile(path.join(out, 'app.css'), appCss);
await build({entryPoints:[path.join(root,'editor/rich-editor.js')],bundle:true,outfile:path.join(out,'editor.bundle.js'),format:'iife',platform:'browser',target:'chrome120',minify:true,legalComments:'eof'});
const licenseNames=['prosemirror-state','prosemirror-view','prosemirror-model','prosemirror-markdown','prosemirror-inputrules','prosemirror-keymap','prosemirror-commands','prosemirror-history','prosemirror-schema-list','prosemirror-transform','orderedmap','rope-sequence','w3c-keyname','markdown-it','uc.micro','linkify-it','mdurl','punycode.js','entities','argparse'];
let notices='';
for(const name of licenseNames){const dir=path.join(root,'node_modules',name);const files=await fs.readdir(dir);const file=files.find(f=>/^license(?:[.-]|$)/i.test(f));if(file)notices+=`\n## ${name}\n`+await fs.readFile(path.join(dir,file),'utf8');}
await fs.writeFile(path.join(out,'THIRD-PARTY-LICENSES.txt'),notices);
// Original notebook icon, generated deterministically without image dependencies.
function crc32(buf) { let crc = -1; for (const b of buf) { crc ^= b; for (let k=0;k<8;k++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (crc ^ -1) >>> 0; }
function chunk(type, data) { const t=Buffer.from(type), len=Buffer.alloc(4), crc=Buffer.alloc(4); len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([t,data]))); return Buffer.concat([len,t,data,crc]); }
function icon(size) {
  const raw=Buffer.alloc((size*4+1)*size);
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const px=(x+.5)/size*128, py=(y+.5)/size*128;
    let color=[38,101,78,255];
    if(Math.hypot(Math.max(24-px,0,px-104),Math.max(24-py,0,py-104))>24) color=[0,0,0,0];
    if(px>=35&&px<=94&&py>=26&&py<=103) color=[246,247,234,255];
    if(px>=43&&px<=47&&py>=26&&py<=103) color=[38,101,78,255];
    if(px>=57&&px<=82&&((py>=44&&py<=48)||(py>=61&&py<=65)||(py>=78&&py<=82))) color=[38,101,78,255];
    const off=y*(size*4+1)+1+x*4; raw.set(color,off);
  }
  const header=Buffer.alloc(13); header.writeUInt32BE(size,0); header.writeUInt32BE(size,4); header[8]=8; header[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
await fs.mkdir(path.join(out,'icons'),{recursive:true});
for(const size of [16,32,48,128]) await fs.writeFile(path.join(out,'icons',size+'.png'),icon(size));
console.log(`Built ${out}`);
