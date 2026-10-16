const fs=require('fs'),path=require('path'),C=require('./wiki_core');
function classify(root=C.ROOT){
  const {pages}=C.load(root),used=new Set(pages.map(p=>p.raw_path).filter(Boolean));
  const files=C.walk(path.join(root,'raw')),groups=new Map(),texts=new Map(),out=[];
  files.sort((a,b)=>Number(used.has(C.posix(path.relative(root,b))))-Number(used.has(C.posix(path.relative(root,a))))||a.localeCompare(b));
  for(const f of files){const rel=C.posix(path.relative(root,f)),ext=path.extname(f).toLowerCase();let state,reason;
    if(rel.split('/').some(s=>s.startsWith('.'))||ext==='.canvas'){state='ignored';reason='application configuration or canvas'}
    else {const h=C.hash(f),norm=ext==='.md'?fs.readFileSync(f,'utf8').replace(/<!--[\s\S]*?-->/g,'').replace(/\r\n/g,'\n').trim():null,prior=groups.get(h)||(norm?texts.get(norm):null);if(used.has(rel)){state='compiled';reason='source page exists'}else if(prior){state='duplicate';reason=prior}else if(['.png','.jpg','.jpeg','.webp'].includes(ext)){state='asset';reason='project media, not a standalone knowledge page'}else if(['.html','.htm'].includes(ext)){state='pending';reason='HTML content equivalence not verified; filename alone is not proof'}else{state='pending';reason='requires reading and compilation'}groups.set(h,prior||rel);if(norm)texts.set(norm,prior||rel)}
    out.push({path:rel,state,reason});
  }return out;
}
module.exports={classify};
const STATES=['pending','compiled','duplicate','asset','ignored'];
if(require.main===module){
  const data=classify();
  C.writeJson(path.join(C.ROOT,'_health','raw-status.json'),data);
  const counts=data.reduce((a,x)=>(a[x.state]=(a[x.state]||0)+1,a),{});
  console.log(JSON.stringify(counts));
  if(!data.length)console.log('原料盘点：raw\\ 下暂无原料。把资料丢进 raw\\ 任意子目录后再跑本脚本。');
  else console.log('原料盘点：共 '+data.length+' 个文件 ｜ '+
    STATES.filter(s=>counts[s]).map(s=>s+' '+counts[s]).join(' ｜ ')+
    (counts.pending?'\n  待编译（pending）'+counts.pending+' 个，按 governance.md 第 2 步建源摘要页。':''));
}