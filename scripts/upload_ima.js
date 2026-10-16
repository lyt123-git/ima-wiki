#!/usr/bin/env node
'use strict';
// Explicit single-file upload. No implicit cloud target and no credential logging.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {imaApi}=require('./vendor/ima_api.cjs');
const {upload}=require('./cos-upload.cjs');
const {withLock}=require('./locking');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

function preflight(file){
  const r=spawnSync(process.execPath,[path.join(__dirname,'preflight-check.cjs'),'--file',file],{encoding:'utf8'});
  let result;try{result=JSON.parse(r.stdout)}catch{throw Error('文件预检无法完成')}
  if(r.status!==0||result.pass!==true)throw Error(result.reason||'文件预检未通过');
  return result;
}

async function api(name,body){
  let r;try{r=JSON.parse(await imaApi('openapi/wiki/v1/'+name,body,{baseUrl:'https://ima.qq.com'}))}
  catch{throw Error(name+' 请求失败或返回无效数据，请检查网络、凭证及接口状态')}
  if(r.code!==0)throw Error(name+'：'+(r.msg||'接口业务失败'));
  if(!r.data||typeof r.data!=='object')throw Error(name+' 返回缺少 data');
  return r.data;
}

async function uploadFile({file,kbId,folderId,preflightOnly=false}){
  if(typeof file!=='string'||!file)throw Error('缺少 --file');
  const absolute=path.resolve(file);
  const root=path.resolve(process.env.WIKI_ROOT||path.join(__dirname,'..'));
  // This skill publishes deliverables, never individual compiled knowledge pages.
  const real=fs.realpathSync(absolute),wiki=path.resolve(root,'wiki');
  const inWiki=p=>{const rel=path.relative(wiki,p);return !rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel)};
  if(inWiki(absolute)||inWiki(real))throw Error('禁止逐页上传 wiki 知识页，请生成周报或成品后上传');
  const p=preflight(absolute);
  if(preflightOnly)return {status:'preflight_passed',...p};
  if(typeof kbId!=='string'||!kbId.trim())throw Error('缺少 --kb-id：必须明确指定 IMA 目标知识库 ID');
  if(folderId!==undefined&&(typeof folderId!=='string'||!folderId.trim()))throw Error('folder-id 不能为空');
  return withLock(root,'upload',async()=>{
    const bytes=fs.readFileSync(absolute),sha256=digest(bytes);
    if(bytes.length!==p.file_size||!bytes.length)throw Error('文件为空或在预检后发生变化，请重新执行');
    const target={knowledge_base_id:kbId,...(folderId?{folder_id:folderId}:{})};
    const check=await api('check_repeated_names',{...target,params:[{name:p.file_name,media_type:p.media_type}]});
    if(!Array.isArray(check.results)||check.results.length!==1||check.results[0].name!==p.file_name||typeof check.results[0].is_repeated!=='boolean')throw Error('重名检查结果缺失或不匹配，已停止上传');
    if(check.results[0].is_repeated)throw Error('目标已有同名文件。已停止；如需保留副本，请另存带时间戳的新文件后重新上传');
    const media=await api('create_media',{knowledge_base_id:kbId,file_name:p.file_name,file_ext:p.file_ext,file_size:p.file_size,content_type:p.content_type});
    if(typeof media.media_id!=='string'||!media.media_id||!media.cos_credential)throw Error('创建媒体返回不完整，已停止');
    // Credentials stay in memory and are sent only to the generated COS host.
    await upload({bytes,credential:media.cos_credential,contentType:p.content_type});
    await api('add_knowledge',{...target,media_type:p.media_type,media_id:media.media_id,title:p.file_name,file_info:{cos_key:media.cos_credential.cos_key,file_size:p.file_size,file_name:p.file_name}});
    return {status:'uploaded',file_name:p.file_name,file_size:p.file_size,sha256,knowledge_base_id:kbId,media_id:media.media_id};
  });
}

function parseArgs(argv){
  const opts={};
  for(let i=0;i<argv.length;i++){
    const k=argv[i];
    if(k==='--preflight-only'){opts.preflightOnly=true;continue}
    const name={'--file':'file','--kb-id':'kbId','--folder-id':'folderId'}[k];
    if(!name||!argv[i+1]||argv[i+1].startsWith('--'))throw Error('参数错误：'+k);
    opts[name]=argv[++i];
  }
  return opts;
}
if(require.main===module)uploadFile(parseArgsSafe()).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1});
function parseArgsSafe(){try{return parseArgs(process.argv.slice(2))}catch(e){console.error(e.message);process.exit(1)}}
module.exports={uploadFile,parseArgs,preflight};
