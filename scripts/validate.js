const fs=require('fs'),path=require('path'),C=require('./wiki_core');
function validate(root=C.ROOT){
  const {pages,resolve}=C.load(root),errors=[],warnings=[],add=(kind,page,detail)=>errors.push({kind,page,detail});
  const counts=Object.fromEntries(C.DIRS.map(k=>[k,pages.filter(p=>p.kind===k).length]));counts.total=pages.length;
  const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s))&&!isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
  for(const p of pages){
    if(p.error)add('frontMatter',p.id,p.error);
    for(const field of ['title','type','status','updated'])if(!p.meta[field])add('missingField',p.id,field);
    if(!['draft','stable','disputed','deprecated'].includes(p.status))add('invalidStatus',p.id,p.status);
    if(p.type!==({concepts:'concept',entities:'entity',sources:'source',comparisons:'comparison'})[p.kind])add('invalidType',p.id,p.type);
    if(!validDate(p.updated))add('invalidDate',p.id,String(p.updated));
    if(p.status==='draft'&&validDate(p.updated)&&(Date.parse(C.today())-Date.parse(p.updated))/86400000>30)warnings.push({kind:'overdueDraft',page:p.id,detail:p.updated});
    if(p.status==='stable'&&p.review_status!=='verified')add('unverifiedStable',p.id,'stable requires review_status: verified');
    if(p.type==='source'){
      const file=path.resolve(root,p.raw_path||'');
      if(!p.raw_path||!file.startsWith(path.resolve(root,'raw')+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())add('missingRaw',p.id,p.raw_path);
    }else if(!p.sources.length)add('missingSources',p.id,'sources is empty');
    for(const s of [...p.sources,...p.items])if(resolve(s,p).length!==1)add('invalidReference',p.id,s);
    for(const s of p.links){
      if(/^(learning|raw|attachments)\//.test(s)){const t=s.split('#')[0];if(!fs.existsSync(path.join(root,t))&&!fs.existsSync(path.join(root,t+'.md')))add('dangling',p.id,s);continue}
      const hits=resolve(s,p);if(hits.length!==1)add(hits.length?'ambiguousLink':'dangling',p.id,s);
    }
    if(!p.inIds.length)warnings.push({kind:'orphan',page:p.id});
  }
  const titles=new Map();for(const p of pages){if(titles.has(p.title))add('duplicateTitle',p.id,p.title);titles.set(p.title,p)}
  const indexFile=path.join(root,'index.md');
  if(!fs.existsSync(indexFile))add('indexMissing','index.md','missing');
  else{
    const text=fs.readFileSync(indexFile,'utf8'),m=/页面总数：\s*(\d+)\s*（概念\s*(\d+)\s*\/\s*实体\s*(\d+)\s*\/\s*源摘要\s*(\d+)\s*\/\s*对比\s*(\d+)）/.exec(text);
    if(!m||['total',...C.DIRS].some((k,i)=>counts[k]!==Number(m[i+1])))add('indexCount','index.md','count mismatch');
    const seen=new Set();for(const l of C.links(text)){const hits=resolve(l);if(hits.length!==1)add('indexLink','index.md',l);else{if(seen.has(hits[0].id))add('indexDuplicate','index.md',l);seen.add(hits[0].id)}}
    for(const p of pages)if(!seen.has(p.id))add('indexOmission',p.id,'not listed');
  }
  return {checkedAt:new Date().toISOString(),counts,errors,warnings,contentReview:{coverage:'Only explicitly recorded reviewed claims; not automated semantic proof',uncheckedPages:pages.filter(p=>p.review_status!=='verified').length},status:errors.length?'failed':'structure_passed'};
}
/** 体检报告落盘：_health\健康检查_<日期>.md（同一天多次体检追加到文末，不覆盖） */
function reportFile(root){
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date());
  return path.join(root,'_health','健康检查_'+day+'.md');
}
function writeReport(root,r){
  const stamp=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date()).replace(',',' ');
  const lines=['','## '+stamp+' ｜ 结构体检',''];
  lines.push('- 结论：'+(r.errors.length?'**failed**（错误 '+r.errors.length+'）':'structure_passed'));
  lines.push('- 页面：'+r.counts.total+'（概念 '+r.counts.concepts+' / 实体 '+r.counts.entities+' / 源摘要 '+r.counts.sources+' / 对比 '+r.counts.comparisons+'）');
  lines.push('- 错误 '+r.errors.length+' ｜ 警告 '+r.warnings.length+' ｜ 未核实页 '+r.contentReview.uncheckedPages);
  if(r.errors.length){lines.push('','### 错误','');for(const e of r.errors)lines.push('- `'+e.kind+'` '+e.page+' — '+e.detail)}
  if(r.warnings.length){lines.push('','### 警告','');for(const w of r.warnings)lines.push('- `'+w.kind+'` '+w.page+(w.detail!==undefined?' — '+w.detail:''))}
  lines.push('');
  const file=reportFile(root);fs.mkdirSync(path.dirname(file),{recursive:true});
  if(!fs.existsSync(file))fs.writeFileSync(file,'# 结构体检报告\n\n> 由 validate_links.js 自动生成，追加式；同一天多次体检在文末新增一节。\n','utf8');
  fs.appendFileSync(file,lines.join('\n')+'\n','utf8');
  return file;
}
function main(){
  const r=validate();
  console.log(JSON.stringify(r,null,2));
  try{console.error('报告已写入：'+writeReport(C.ROOT,r))}
  catch(e){console.error('[warn] 报告写入失败（不影响体检结论）：'+e.message)}
  process.exitCode=r.errors.length?1:0;
}
module.exports={validate,writeReport,main};if(require.main===module)main();
