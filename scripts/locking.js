const fs=require('fs'),path=require('path'),crypto=require('crypto');

/**
 * 运行锁：防止同一库的同步任务并发执行。
 * 锁文件位于 <库根>\_health\<name>.lock，内容为 {pid, token, started}。
 * 若持锁进程已确认退出（process.kill(pid,0) 抛 ESRCH），会把旧锁改名归档为
 * <name>.lock.stale-<时间戳>-<token> 后重新加锁——不删除旧记录，便于事后追溯。
 */
function acquire(root,name){
 const dir=path.join(root,'_health'),file=path.join(dir,name+'.lock');fs.mkdirSync(dir,{recursive:true});
 const token=crypto.randomUUID();let fd;
 try{fd=fs.openSync(file,'wx')}catch(e){
  if(e.code!=='EEXIST')throw e;
  let owner;
  try{owner=JSON.parse(fs.readFileSync(file,'utf8'))}
  catch{throw Error('锁文件已存在但内容非法：'+file+'\n  请确认没有任务在运行后，把该文件改名归档（或删除）再重试。')}
  if(!Number.isInteger(owner.pid)||owner.pid<=0)throw Error('锁文件内容非法（pid 缺失）：'+file+'\n  请确认没有任务在运行后，把该文件改名归档（或删除）再重试。');
  try{
    process.kill(owner.pid,0);
    throw Error('已有同名任务在运行（'+name+'，PID '+owner.pid+'，开始于 '+owner.started+'）。\n'+
      '  请等它跑完再重试。若你确认该进程已结束而锁没释放，删除 '+file+' 后重试。');
  }catch(err){if(err.code!=='ESRCH')throw err}
  // 已确认持锁进程死亡：把旧锁改名归档，不直接删除，便于追溯。
  fs.renameSync(file,file+'.stale-'+Date.now()+'-'+token);fd=fs.openSync(file,'wx');
 }
 fs.writeFileSync(fd,JSON.stringify({pid:process.pid,token,started:new Date().toISOString()}));
 return ()=>{fs.closeSync(fd);if(fs.existsSync(file)){const owner=JSON.parse(fs.readFileSync(file,'utf8'));if(owner.token===token)fs.unlinkSync(file)}};
}
async function withLock(root,name,fn){const release=acquire(root,name);try{return await fn()}finally{release()}}
module.exports={acquire,withLock};
