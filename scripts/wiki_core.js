// Shared parsing and resolution for the index, validator and growth map.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
let YAML;
try {
  YAML = require('yaml');
} catch (e) {
  throw new Error(
    '缺少依赖 yaml：请先在脚本所在目录（本库的 _health\\）执行 npm install 后重试。\n' +
    '  cd <库根>\\_health && npm install\n' +
    '（本 skill 只有 yaml 这一个依赖。原始错误：' + e.message + '）'
  );
}
const ROOT = process.env.WIKI_ROOT || path.resolve(__dirname, '..');
const DIRS = ['concepts', 'entities', 'sources', 'comparisons'];
const posix = p => p.split(path.sep).join('/');
const today = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Shanghai'}).format(new Date());
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(path.join(dir,e.name)) : [path.join(dir,e.name)]);
}
function parse(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!m) return {meta:{},body:text,error:'missing front matter'};
  try { return {meta:YAML.parse(m[1]) || {},body:text.slice(m[0].length),error:null}; }
  catch(e) { return {meta:{},body:text.slice(m[0].length),error:e.message}; }
}
const list = x => Array.isArray(x) ? x.map(String) : x ? [String(x)] : [];
const stripCode = s => s.replace(/^\s*```[^\n]*\n[\s\S]*?^\s*```\s*$/gm,'').replace(/`[^`\n]*`/g,'');
const links = body => [...stripCode(body).matchAll(/\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g)].map(m=>m[1].trim()).filter(t=>!['wikilinks','X','A','B','Y','链接'].includes(t));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function load(root=ROOT) {
  const pages = DIRS.flatMap(kind=>walk(path.join(root,'wiki',kind)).filter(f=>f.endsWith('.md')).map(file=>{
    const raw=fs.readFileSync(file,'utf8'), p=parse(raw), id=posix(path.relative(path.join(root,'wiki'),file));
    return {...p.meta,id,file,kind,meta:p.meta,body:p.body,error:p.error,raw,aliases:list(p.meta.aliases),sources:list(p.meta.sources),items:list(p.meta.items),links:links(p.body)};
  }));
  const index=new Map();
  const add=(k,p)=>{if(k){const a=index.get(k)||[];if(!a.includes(p))a.push(p);index.set(k,a)}};
  for(const p of pages) for(const k of [p.id,p.id.replace(/\.md$/,''),'wiki/'+p.id,'wiki/'+p.id.replace(/\.md$/,''),path.basename(p.id,'.md'),p.title,...p.aliases])add(k,p);
  function resolve(target,from) {
    let t=String(target).replace(/^\[\[|\]\]$/g,'').split('|')[0].split('#')[0].trim().replace(/\\/g,'/');
    if(!t)return from?[from]:[];
    if(index.has(t))return index.get(t);
    if(from){const rel=path.posix.normalize(path.posix.join(path.posix.dirname(from.id),t));if(index.has(rel))return index.get(rel)}
    return [];
  }
  for(const p of pages)p.outIds=[...new Set([...p.links,...p.sources,...p.items].flatMap(t=>resolve(t,p).map(q=>q.id)).filter(id=>id!==p.id))];
  for(const p of pages)p.inIds=pages.filter(q=>q.outIds.includes(p.id)).map(q=>q.id);
  return {pages,resolve};
}
function save(file,meta,body) { fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,'---\n'+YAML.stringify(meta,{lineWidth:0}).trimEnd()+'\n---\n'+body,'utf8'); }
function writeJson(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n');fs.renameSync(tmp,file)}
module.exports={ROOT,DIRS,posix,today,walk,parse,list,stripCode,links,hash,load,save,writeJson};
