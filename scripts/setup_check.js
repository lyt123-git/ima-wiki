// 安装体检：安装/更新本 skill 后先跑一遍，缺什么按提示补什么。
// 用法：node setup_check.js   （全部 [OK] 才算就绪）
const fs = require('fs');
const os = require('os');
const path = require('path');

const homedir = os.homedir();
let fail = 0;
const ok = (m) => console.log('[OK]   ' + m);
const info = (m) => console.log('[INFO] ' + m);
const miss = (m) => { console.log('[MISS] ' + m); fail = 1; };
const fileHasText = (p) => { try { return !!fs.readFileSync(p, 'utf8').trim(); } catch { return false; } };

// 1. Node.js
const major = parseInt(process.versions.node.split('.')[0], 10);
if (major >= 18) ok('Node.js ' + process.versions.node);
else miss('Node.js 版本过旧（' + process.versions.node + '，需 >=18）：到 https://nodejs.org 安装后重试');

// 2. 内置 IMA 接口脚本
const vendor = path.join(__dirname, 'vendor', 'ima_api.cjs');
if (fs.existsSync(vendor)) ok('IMA 接口脚本（内置 scripts/vendor/ima_api.cjs）');
else miss('内置接口脚本缺失：scripts/vendor/ima_api.cjs 不存在，请重新解压/安装本 skill');

// Check runtime dependency by loading it, not just matching local require paths.
try {
  const yaml = require('yaml');
  if (typeof yaml.parse !== 'function' || yaml.parse('ready: true').ready !== true) throw Error('yaml 无法使用');
  ok('运行依赖 yaml 可加载');
} catch (e) {
  miss('运行依赖 yaml 缺失或无法加载：请在 _health 目录执行 npm install 后重试。');
}
for (const name of ['upload_ima.js', 'preflight-check.cjs', 'cos-upload.cjs']) {
  if (!fs.existsSync(path.join(__dirname, name))) miss('上传模块缺失：' + name);
}

// 3. 脚本内部依赖完整性（历史发行包曾漏发 locking.js / index_builder.js / validate.js）
const missingDeps = [];
const scanned = new Set();
function scanDeps(file) {
  const abs = path.resolve(file);
  if (scanned.has(abs) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) return;
  scanned.add(abs);
  let src = '';
  try { src = fs.readFileSync(abs, 'utf8'); } catch { return; }
  for (const m of src.matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
    const base = path.resolve(path.dirname(abs), m[1]);
    const hit = [base, base + '.js', base + '.cjs', path.join(base, 'index.js')].find((p) => fs.existsSync(p));
    if (!hit) missingDeps.push(m[1] + '   ← 被 ' + path.basename(abs) + ' 引用');
    else scanDeps(hit);
  }
}
for (const f of fs.readdirSync(__dirname)) {
  if (/\.(?:js|cjs)$/.test(f)) scanDeps(path.join(__dirname, f));
}
if (missingDeps.length === 0) ok('脚本内部依赖完整（' + scanned.size + ' 个模块）');
else {
  miss('脚本缺少被引用的文件，发行包不完整：');
  console.log(missingDeps.map((d) => '         ' + d).join('\n'));
  console.log('       处理：重新解压/安装本 skill；或从仓库 scripts\\ 目录补齐上述文件。');
}

// 4. IMA 凭证（Client ID + API Key）
const cfgHas = (name) => fileHasText(path.join(homedir, '.config', 'ima', name));
const hasClientId = !!(process.env.IMA_CLIENT_ID || process.env.IMA_OPENAPI_CLIENTID) || cfgHas('client_id');
const hasApiKey = !!(process.env.IMA_API_KEY || process.env.IMA_OPENAPI_APIKEY) || cfgHas('api_key');
if (hasClientId && hasApiKey) ok('IMA 凭证（clientId + apiKey）');
else {
  miss('IMA 凭证缺失（clientId / apiKey 至少一项未配置），按下面两步补齐：');
  console.log([
    '       第 1 步：打开 https://ima.qq.com/agent-interface 获取 Client ID 和 API Key',
    '       第 2 步：任选一种方式保存——',
    '         方式A（推荐，PowerShell 执行）：',
    '           New-Item -ItemType Directory -Force "$HOME\\.config\\ima" | Out-Null',
    '           Set-Content -Encoding ASCII "$HOME\\.config\\ima\\client_id" "你的client_id"',
    '           Set-Content -Encoding ASCII "$HOME\\.config\\ima\\api_key" "你的api_key"',
    '         方式B（用户级环境变量）：',
    '           setx IMA_CLIENT_ID "你的client_id"',
    '           setx IMA_API_KEY "你的api_key"',
    '       （凭证只作为请求头发往 ima.qq.com，不落日志、不发往其他域名）',
  ].join('\n'));
}

// 5. 知识库名
if (process.env.WIKI_KB_NAME && process.env.WIKI_KB_NAME.trim()) {
  ok('WIKI_KB_NAME=' + process.env.WIKI_KB_NAME.trim());
} else {
  miss('未设 WIKI_KB_NAME：执行 setx WIKI_KB_NAME "你的IMA知识库名"（名称须与 IMA App 内显示完全一致且唯一）');
  console.log('       注意：setx 只对新开的终端生效——执行后请【关闭并重开终端】再重跑本脚本。');
}

// 6. 库根（脚本应位于 <库根>\_health\ 下；库在别处时用 WIKI_ROOT 指定）
const root = process.env.WIKI_ROOT || path.resolve(__dirname, '..');
const hasRaw = fs.existsSync(path.join(root, 'raw'));
const hasWiki = fs.existsSync(path.join(root, 'wiki'));
if (hasRaw || hasWiki) {
  ok('库根 ' + root);
} else if (fs.existsSync(path.join(root, 'SKILL.md'))) {
  info('当前在 skill 目录（尚未建库）：' + root);
  console.log('       建库后请把 scripts\\ 内容复制到 <库根>\\_health\\，再到那里运行本脚本。');
} else {
  miss('库根下没有 raw\\ 或 wiki\\：' + root);
  console.log('       若知识库在别的位置，请设 setx WIKI_ROOT "D:\\你的库根"，然后【重开终端】。');
}

console.log('');
if (fail) {
  console.log('结论：配置未就绪。按上面 [MISS] 项的提示补齐后，重跑 node setup_check.js。');
  process.exitCode = 1;
} else {
  console.log('结论：配置就绪。下一步：node sync_ima.js（首次同步，把 IMA 条目原文下载到 raw\\ima_sync\\）。');
}
