// Incremental, append-only IMA download. No credential or signed URL is persisted.
const fs=require('fs');
const path=require('path');
const C=require('./wiki_core');
const {withLock}=require('./locking');
const IMA_API_CANDIDATES = [
  path.join(__dirname, 'vendor', 'ima_api.cjs'),
  process.env.WIKI_IMA_API,
  path.join(process.env.USERPROFILE || '', '.codebuddy', 'skills', '腾讯ima', 'ima_api.cjs'),
  path.join(process.env.USERPROFILE || '', '.codex', 'skills', 'ima-skill', 'ima_api.cjs'),
].filter(Boolean);
const IMA_API_PATH = IMA_API_CANDIDATES.find(p => fs.existsSync(p));
if (!IMA_API_PATH) throw Error('找不到 ima_api.cjs：内置副本 scripts/vendor/ima_api.cjs 缺失，请重新安装本 skill；或设 WIKI_IMA_API 指向 ima_api.cjs');
const {imaApi} = require(IMA_API_PATH);
const ledgerFile=path.join(C.ROOT,'_health','sync-ledger.json');
const safeName=s=>s.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'');
async function api(endpoint,body){await new Promise(r=>setTimeout(r,1700));const r=JSON.parse(await imaApi('openapi/wiki/v1/'+endpoint,body,{baseUrl:'https://ima.qq.com',lastCheckFile:path.join(C.ROOT,'_health','ima-update-check')}));if(r.code!==0)throw Error(r.msg);return r.data;}
function choosePath(title,hash,files,dir=path.join(C.ROOT,'raw','ima_sync')){
  const same=files.find(f=>C.hash(f)===hash);if(same)return {file:same,reused:true};
  const name=safeName(title),ext=path.extname(name),stem=path.basename(name,ext);
  let f=path.join(dir,name);
  if(fs.existsSync(f))f=path.join(dir,stem+'__'+hash.slice(0,12)+ext);
  if(fs.existsSync(f)&&C.hash(f)!==hash)throw Error('Version filename collision');
  return {file:f,reused:false};
}
async function sync(){
 return withLock(C.ROOT,'sync',async()=>{
  const ledger=fs.existsSync(ledgerFile)?JSON.parse(fs.readFileSync(ledgerFile,'utf8')):{schemaVersion:1,entries:{}};
  let active=null;
  try{
    const kbName=process.env.WIKI_KB_NAME;if(!kbName)throw Error('未设置知识库名：请设置环境变量 WIKI_KB_NAME 为你的 IMA 知识库名称，名称须与 IMA App 内显示完全一致。\n  setx WIKI_KB_NAME "你的IMA知识库名"   ← 执行后需【关闭并重开终端】才生效，然后重跑本脚本');
    const bases=await api('search_knowledge_base',{query:kbName,cursor:'',limit:20});
    const matches=bases.info_list.filter(x=>x.kb_name===kbName);if(matches.length!==1)throw Error('Cannot uniquely locate '+kbName+'（请确认 IMA 里存在该名称的知识库且名称唯一）');
    const kb=matches[0].kb_id,folders=[{id:null,names:[]}],items=[];
    while(folders.length){const f=folders.shift();let cursor='';do{
      const d=await api('get_knowledge_list',{knowledge_base_id:kb,...(f.id?{folder_id:f.id}:{}),cursor,limit:50});
      for(const x of d.knowledge_list||[]){if(x.media_type===99)folders.push({id:x.media_id,names:[...f.names,x.title]});else items.push({...x,folder:f.names.join('/')})}
      cursor=d.next_cursor||'';if(d.is_end)break;if(!cursor)throw Error('Pagination ended without is_end');
    }while(cursor)}
    const files=C.walk(path.join(C.ROOT,'raw')).filter(f=>!f.split(path.sep).some(p=>p.startsWith('.'))&&!f.endsWith('.gitkeep'));
    const crypto=require('crypto');let added=0,reused=0,skipped=0,failedNow=0;
    // 单条目失败：记账 + 继续跑完本轮，不中断（下一轮 --resume 会重试失败条目）
    const recordFail=(x,e)=>{failedNow++;const old=ledger.entries[x.media_id]||{};
      ledger.entries[x.media_id]={...old,title:x.title,folder:x.folder,mediaType:x.media_type,result:'failed',error:e.message,failures:[...(old.failures||[]),{at:new Date().toISOString(),message:e.message}],checkedAt:new Date().toISOString()};
      C.writeJson(ledgerFile,ledger);
      console.log('失败（已记账并继续）: '+x.title+'  ← '+e.message);};
    for(const x of items){
      if(process.argv.includes('--resume')&&ledger.entries[x.media_id]?.result==='success'){skipped++;continue}
      active=x;
      try{
        const info=await api('get_media_info',{media_id:x.media_id});
        if(!info.url_info?.url)throw Error('请使用ima客户端查看原文：'+x.title);
        const response=await fetch(info.url_info.url,{headers:info.url_info.headers||{},signal:AbortSignal.timeout(60000)});
        if(!response.ok)throw Error('原文读取失败：'+x.title+' HTTP '+response.status);
        const bytes=Buffer.from(await response.arrayBuffer());if(!bytes.length)throw Error('Empty original: '+x.title);
        const hash=crypto.createHash('sha256').update(bytes).digest('hex');
        let title=x.title;
        if(x.media_type===2&&!/\.html?$/i.test(title))title+='.html';
        const picked=choosePath(title,hash,files);
        if(!picked.reused){fs.mkdirSync(path.dirname(picked.file),{recursive:true});fs.writeFileSync(picked.file,bytes,{flag:'wx'});files.push(picked.file);added++}else reused++;
        const previous=ledger.entries[x.media_id]||{versions:[]};previous.versions ||= [];
        if(previous.error){previous.failures ||= [];previous.failures.push({at:previous.checkedAt,message:previous.error});delete previous.error;}
        const localPath=C.posix(path.relative(C.ROOT,picked.file));
        if(!previous.versions.some(v=>v.sha256===hash))previous.versions.push({sha256:hash,localPath,downloadedAt:new Date().toISOString()});
        ledger.entries[x.media_id]={...previous,title:x.title,folder:x.folder,mediaType:x.media_type,currentHash:hash,localPath,result:'success',checkedAt:new Date().toISOString()};
        C.writeJson(ledgerFile,ledger);
        console.log((picked.reused?'unchanged/reused: ':'added: ')+x.title);
      }catch(e){recordFail(x,e);}finally{active=null;}
    }
    // Record partial runs, but never advance lastSuccessfulRun on a failed run.
    ledger.lastRun={at:new Date().toISOString(),status:failedNow?'partial_failure':'success',items:items.length,added,reused,skipped,failedNow};
    C.writeJson(ledgerFile,ledger);
    // 兜底：需要同步的条目全军覆没，多半是凭证失效/网络异常，属于真故障，不能静默放过
    if(failedNow>0&&added===0&&reused===0&&failedNow>=items.length-skipped){
      throw Error('本轮 '+failedNow+' 个条目全部失败，疑似 IMA 凭证失效或网络异常（不是单条目问题）。\n  请检查 ~/.config/ima/ 凭证与网络后重跑：node _health\\sync_ima.js --resume\n  明细见 _health\\sync-ledger.json');
    }
    if(failedNow>0)throw Error('本轮同步未全部成功：'+failedNow+' 个条目失败，已保留成功下载及失败台账。停止后续治理；修复原因后用 --resume 重试。');
    ledger.lastSuccessfulRun=new Date().toISOString();C.writeJson(ledgerFile,ledger);
    const failed=Object.values(ledger.entries).filter(e=>e&&e.result==='failed').length;
    console.log(JSON.stringify({items:items.length,added,reused,skipped,failed,failedNow}));
    console.log('同步完成：条目 '+items.length+' ｜ 新增 '+added+' ｜ 未变动 '+reused+
      (skipped?' ｜ --resume 跳过 '+skipped:'')+
      (failedNow?' ｜ 本轮失败 '+failedNow+'（已跳过，未中断）':'')+
      ' ｜ 台账中仍失败 '+failed+(failed?'（见 _health\\sync-ledger.json，用 --resume 重试）':''));
  }catch(e){if(active){const old=ledger.entries[active.media_id]||{};ledger.entries[active.media_id]={...old,title:active.title,folder:active.folder,result:'failed',error:e.message,failures:[...(old.failures||[]),{at:new Date().toISOString(),message:e.message}],checkedAt:new Date().toISOString()};C.writeJson(ledgerFile,ledger)}throw e}
 });
}
module.exports={choosePath,safeName};
if(require.main===module)sync().catch(e=>{console.error(e.message);process.exitCode=1});
