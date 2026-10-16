'use strict';
// COS signing helpers reused from local ima-skill/knowledge-base/scripts/cos-upload.cjs.
const crypto=require('node:crypto'),https=require('node:https');
function hmacSha1(key, data) {
  return crypto.createHmac('sha1', key).update(data).digest('hex');
}

function sha1(data) {
  return crypto.createHash('sha1').update(data).digest('hex');
}

// --- COS Authorization header (PUT Object) ---
// Reference: https://cloud.tencent.com/document/product/436/7778
function buildAuthorization({ secretId, secretKey, method, pathname, headers, startTime, expiredTime }) {
  const keyTime = `${startTime};${expiredTime}`;

  // 1. SignKey = HMAC-SHA1(SecretKey, KeyTime)
  const signKey = hmacSha1(secretKey, keyTime);

  // 2. HttpString = method\npathname\nparams\nheaders\n
  // For PUT, no query params; headers we sign: host, content-length
  const headerKeys = Object.keys(headers).sort();
  const httpHeaders = headerKeys.map((k) => `${k.toLowerCase()}=${encodeURIComponent(headers[k])}`).join('&');
  const httpString = `${method.toLowerCase()}\n${pathname}\n\n${httpHeaders}\n`;

  // 3. StringToSign = sha1\nKeyTime\nSHA1(HttpString)\n
  const stringToSign = `sha1\n${keyTime}\n${sha1(httpString)}\n`;

  // 4. Signature = HMAC-SHA1(SignKey, StringToSign)
  const signature = hmacSha1(signKey, stringToSign);

  // 5. Build Authorization
  const headerList = headerKeys.map((k) => k.toLowerCase()).join(';');
  return [
    `q-sign-algorithm=sha1`,
    `q-ak=${secretId}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    `q-header-list=${headerList}`,
    `q-url-param-list=`,
    `q-signature=${signature}`,
  ].join('&');
}


async function upload({bytes,credential:c,contentType,timeoutMs=300000}) {
  for(const k of ['secret_id','secret_key','token','bucket_name','region','cos_key'])
    if(typeof c?.[k]!=='string'||!c[k])throw Error('COS 临时凭证缺失：'+k);
  if(!/^[a-z0-9-]+-[0-9]+$/.test(c.bucket_name)||!/^[a-z0-9-]+$/.test(c.region))throw Error('COS 桶名或区域无效');
  const start=Number(c.start_time),end=Number(c.expired_time),now=Math.floor(Date.now()/1000);
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end<=now||start>=end)throw Error('COS 临时凭证时间无效或已过期');
  const hostname=c.bucket_name+'.cos.'+c.region+'.myqcloud.com';
  const key=c.cos_key.startsWith('/')?c.cos_key.slice(1):c.cos_key;
  if(!key||/[\r\n?#]/.test(key))throw Error('COS 对象键无效');
  const pathname='/'+key.split('/').map(encodeURIComponent).join('/');
  // COS V5 signs the raw object path; only the HTTP request path is encoded.
  const authorization=buildAuthorization({secretId:c.secret_id,secretKey:c.secret_key,method:'PUT',pathname:'/'+key,headers:{'content-length':String(bytes.length),host:hostname},startTime:String(start),expiredTime:String(end)});
  return new Promise((resolve,reject)=>{
    const req=https.request({hostname,port:443,path:pathname,method:'PUT',headers:{'Content-Type':contentType,'Content-Length':bytes.length,Authorization:authorization,'x-cos-security-token':c.token},timeout:timeoutMs},res=>{
      res.resume();res.on('error',reject);res.on('end',()=>{if(res.statusCode>=200&&res.statusCode<300)resolve({status:res.statusCode});else reject(Error('COS 上传失败，HTTP '+res.statusCode));});
    });
    req.on('timeout',()=>req.destroy(Error('COS 上传超时')));
    req.on('error',()=>reject(Error('COS 上传连接失败；未执行入库登记')));
    req.end(bytes);
  });
}
module.exports={upload,buildAuthorization};
