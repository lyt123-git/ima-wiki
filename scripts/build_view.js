#!/usr/bin/env node
/**
 * 库生长图谱数据抽取器（确定性，无 AI 推断）
 *
 * 用途：把知识库的「生长过程」抽成一份结构化数据，内嵌进 _view/growth.html 供离线渲染。
 * 数据源：wiki 目录下所有 .md（front matter + wikilinks + 文件 mtime）
 *       + raw 目录下所有文件（原始文件清单，溯源树的根）
 *       + log.md（操作事件流）
 *       + _health/version-map.json（跨名修订版的人工映射）
 *       + WIKI_STAGING 指定的暂存区目录（可选，默认关闭。其中 .md 的正文会内嵌进 growth.html）
 *
 * 用法：
 *   node _health/build_view.js            # 抽取并生成 _view/growth.html
 *   node _health/build_view.js --json     # 只打印抽取结果 JSON（调试用）
 *   node _health/build_view.js --dry      # 抽取但不写任何文件
 *
 * ── 改动前必读的四条约定 ────────────────────────────────────────────
 * 1. 【生长时间优先取 created；历史 mtime 仅作为已标注的估算】raw/ 下文件保留的是原始创作时间
 *    （实测分散在 2025-09 ~ 2026-04），拿它做时间轴会得到完全错误的生长曲线。
 * 2. 【front matter 取值必须去引号，字段匹配用 [ \t]* 而不是 \s*】
 *    否则 author: 为空时会跨行吞掉下一行 year: 的值（已踩过一次）。
 * 3. 【提取 [[wikilinks]] 前必须先剥离反引号代码段】
 *    否则模板里的 `[[X]]` 语法示例会被当成真实链接，造成一堆假断链（已踩过一次）。
 * 4. 【raw/ 只读】本脚本只写 _view/，不改动任何原始文件、不删任何 wiki 页面。
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.env.WIKI_ROOT || path.resolve(__dirname, '..');
const WIKI = path.join(ROOT, 'wiki');
const RAW_DIR = path.join(ROOT, 'raw');
const LOG_FILE = path.join(ROOT, 'log.md');
const WIKI_DIRS = ['concepts', 'entities', 'sources', 'comparisons'];
const TEMPLATE = path.join(ROOT, '_health', 'view_template.html');
const OUT_FILE = path.join(ROOT, '_view', 'growth.html');
const VERSION_MAP = path.join(ROOT, '_health', 'version-map.json');

/**
 * 暂存区：尚未同步进 raw/ 的本地文档目录（修订版常先落在这里），仅参与版本链识别。
 * 【必须显式配置，默认关闭】历史上这里写死过一个作者本机路径，导致脚本去读与本库无关的
 * 目录，并把那些文件的正文和绝对路径一起内嵌进 growth.html（分享 HTML = 资料外泄）。
 * 多个目录用系统路径分隔符连接（Windows 为 ;，macOS/Linux 为 :）。
 */
const STAGING_DIRS = String(process.env.WIKI_STAGING || '')
  .split(path.delimiter)
  .map((s) => s.trim())
  .filter(Boolean);

/** 超过此间隔（分钟）视为新的一批编译，用于把连续时间轴切成「批次」 */
const BATCH_GAP_MINUTES = 20;

/** 单个文本文件超过此体积就不再内嵌正文（大文件仍可通过「打开原始文件」访问） */
const MAX_EMBED_BYTES = 300 * 1024;

/** front matter 里的语法示例占位符，不算真实链接 */
const PLACEHOLDERS = new Set([
  'X', 'A', 'B', 'Y', '链接', 'wikilinks', 'wikilink', '页面标题',
  '概念A', '实体X', '资料Y', 'A vs B',
]);

const TEXT_EXT = new Set(['.md', '.txt', '.markdown']);

// ────────────────────────────── 基础工具 ──────────────────────────────

function walk(dir, filter) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, filter));
    else if (!filter || filter(e.name, p)) out.push(p);
  }
  return out;
}

const isMd = (n) => n.endsWith('.md');
const isNotGitkeep = (n) => n !== '.gitkeep';

/** 相对 ROOT 的 POSIX 路径 */
function rel(p) {
  return path.relative(ROOT, p).split(path.sep).join('/');
}

function unquote(v) {
  const m = /^(["'])([\s\S]*)\1$/.exec(v.trim());
  return m ? m[2].trim() : v.trim();
}

/** 本地时间的 ISO-like 串（不用 toISOString，那是 UTC，会差 8 小时） */
function localIso(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

/** 生成可在浏览器里点开的 file:// 链接（盘符冒号保留，其余段按 URL 编码） */
function fileUrl(posixPath) {
  const parts = posixPath.split('/');
  const drive = parts.shift(); // 形如 'D:'
  return 'file:///' + drive + '/' + parts.map((s) => encodeURIComponent(s)).join('/');
}

// ──────────────────────── front matter 解析 ────────────────────────

/**
 * 容错点：个别页面的分隔符被误写成 `\---`（如 vega-eli-np.md、zhongkao-physics-generator.md），
 * 若严格只认 `---` 会导致整段 front matter 丢失 → title 为空 → 大量假断链 + 假孤立页。
 * 这里允许前导反斜杠，并用 malformed 标记出来，供健康检查提示人工修正源文件。
 */
function splitFrontMatter(raw) {
  const m = /^\\?---[ \t]*\r?\n([\s\S]*?)\r?\n\\?---[ \t]*\r?\n?/.exec(raw);
  if (!m) return { fm: '', body: raw, malformed: !!raw.startsWith('---') };
  return { fm: m[1], body: raw.slice(m[0].length), malformed: /\\[ \t]*\r?\n/.test(m[0]) || m[0].indexOf('\\---') >= 0 };
}

/** 单值字段：去引号 + [ \t]*（关键：不能用 \s*，会跨行吞掉下一个字段） */
function pick(fm, key) {
  const m = new RegExp('^' + key + ':[ \\t]*(.+)$', 'm').exec(fm);
  return m ? unquote(m[1]) : '';
}

/** 列表字段：支持内联 [a, b] 与多行 "- a" 两种写法 */
function pickList(fm, key) {
  const lines = fm.split(/\r?\n/);
  const head = new RegExp('^' + key + ':[ \\t]*');
  const idx = lines.findIndex((l) => head.test(l));
  if (idx < 0) return [];
  const inline = lines[idx].replace(head, '').trim();
  if (inline === '') {
    const out = [];
    for (let i = idx + 1; i < lines.length; i++) {
      const m = /^[ \t]*-[ \t]+(.+)$/.exec(lines[i]);
      if (!m) break;
      out.push(unquote(m[1]));
    }
    return out;
  }
  if (inline.startsWith('[')) {
    const inner = inline.replace(/^\[/, '').replace(/\]$/, '').trim();
    if (!inner) return [];
    return inner.split(',').map((s) => unquote(s)).filter(Boolean);
  }
  return [unquote(inline)].filter(Boolean);
}

/** 提取 wikilinks：先剥离反引号代码段，再抽 [[标题]] */
function extractLinks(body) {
  const stripped = body.replace(/`[^`\n]*`/g, '');
  const out = [];
  const re = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let m;
  while ((m = re.exec(stripped)) !== null) {
    const t = m[1].trim();
    if (t && !PLACEHOLDERS.has(t) && !out.includes(t)) out.push(t);
  }
  return out;
}

// ──────────────────────────── 1. wiki 页面 ────────────────────────────

const shared = require('./wiki_core');
const model = shared.load();
const pages = model.pages.map(p => ({...p, fmMalformed:!!p.error, rawPath:p.raw_path||'',
  rawMissing:false, entityKind:p.entity_kind||'', mtime:p.created?localIso(new Date(p.created)):localIso(fs.statSync(p.file).mtime),
  modified:p.modified||localIso(fs.statSync(p.file).mtime), bytes:Buffer.byteLength(p.raw)}));
pages.sort((a,b)=>a.mtime.localeCompare(b.mtime));
function resolveLink(t){return model.resolve(t).map(p=>p.id);}

// ──────────────────────────── 2. raw 原始文件 ────────────────────────────

function readDoc(fileAbs, scope) {
  const st = fs.statSync(fileAbs);
  const name = path.basename(fileAbs);
  const ext = path.extname(name).toLowerCase();
  const isText = TEXT_EXT.has(ext);
  const posix = fileAbs.split(path.sep).join('/');
  const d = {
    id: rel(fileAbs),
    name,
    scope,                                    // 'raw' | 'staging'
    kind: ext === '.pdf' ? 'pdf' : (isText ? 'md' : (ext === '.html' || ext === '.htm' ? 'html' : 'other')),
    ext,
    size: st.size,
    mtime: localIso(st.mtime),
    abs: fileUrl(posix),
    path: posix,
    pages: [],
    body: '',
    bodyTruncated: false,
  };
  if (isText && st.size <= MAX_EMBED_BYTES) {
    d.body = fs.readFileSync(fileAbs, 'utf8');
  } else if (isText) {
    d.bodyTruncated = true;
  }
  return d;
}

const raws = walk(RAW_DIR, isNotGitkeep).map((f) => readDoc(f, 'raw'));
const rawById = new Map(raws.map((r) => [r.id, r]));

// source 页 → raw 文件：建立溯源主干（双向）
for (const p of pages) {
  if (!p.rawPath) continue;
  const r = rawById.get(p.rawPath);
  if (r) {
    p.rawId = r.id;
    if (!r.pages.includes(p.id)) r.pages.push(p.id);
  } else {
    p.rawMissing = true;                      // raw_path 指向的文件不存在，前端给警示
  }
}

// 暂存区文档（仅用于版本链，不进溯源树）
const staging = [];
for (const dir of STAGING_DIRS) {
  if (!fs.existsSync(dir)) {
    console.warn('[warn] WIKI_STAGING 指定的暂存区目录不存在，已跳过：' + dir);
    continue;
  }
  for (const f of walk(dir, (n) => isMd(n))) {
    staging.push(Object.assign(readDoc(f, 'staging'), { id: 'staging:' + path.basename(f) }));
  }
}
if (STAGING_DIRS.length) {
  console.log('[info] 暂存区（WIKI_STAGING）' + STAGING_DIRS.length + ' 个目录，读取 ' +
    staging.length + ' 篇文档；其正文与绝对路径会内嵌进 growth.html，分享前请自行确认。');
}

// ──────────────────────────── 3. log.md 事件 ────────────────────────────

const events = [];
if (fs.existsSync(LOG_FILE)) {
  const text = fs.readFileSync(LOG_FILE, 'utf8');
  const lines = text.split(/\r?\n/);
  let cur = null;
  const buf = [];
  const flush = () => {
    if (!cur) return;
    // 明细：去掉 "- " 前缀与 **粗体** 标记，压成单句
    const detail = buf
      .map((l) => l.replace(/^-\s*/, '').replace(/\*\*/g, '').trim())
      .filter(Boolean)
      .join(' / ');
    cur.detail = detail.length > 400 ? detail.slice(0, 400) + '…' : detail;
    cur.lines = buf.slice();
    events.push(cur);
    cur = null;
    buf.length = 0;
  };
  for (const l of lines) {
    const m = /^##\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s*[｜|]\s*(.+?)\s*$/.exec(l);
    if (m) {
      flush();
      cur = { time: m[1] + 'T' + m[2] + ':00', action: m[3], kind: classifyAction(m[3]) };
    } else if (cur && l.trim()) {
      buf.push(l);
    }
  }
  flush();
}
// log.md 里存在时间乱序（10:35 排在 10:40 之后），必须排序后再用
events.sort((a, b) => a.time.localeCompare(b.time));

function classifyAction(a) {
  if (/初始化|搭建/.test(a)) return 'init';
  if (/编译/.test(a)) return 'compile';
  if (/同步/.test(a)) return 'sync';
  if (/治理|健康检查|体检/.test(a)) return 'govern';
  if (/配置/.test(a)) return 'config';
  return 'other';
}

// ──────────────────────────── 4. 生长时间轴 ────────────────────────────

/** 按分钟聚合的生长点（累计页数曲线） */
const buckets = new Map();
for (const p of pages) {
  const k = p.mtime.slice(0, 16); // 'YYYY-MM-DDTHH:mm'
  if (!buckets.has(k)) buckets.set(k, []);
  buckets.get(k).push(p.id);
}
const timeline = [...buckets.entries()]
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([time, ids], i, arr) => ({
    time,
    added: ids.length,
    total: arr.slice(0, i + 1).reduce((s, x) => s + x[1].length, 0),
    ids,
  }));

/** 批次切分：相邻页面 mtime 间隔超过阈值就断开 */
const batches = [];
{
  let cur = null;
  let prevMs = null;
  for (const b of timeline) {
    const ms = new Date(b.time.replace('T', ' ') + ':00').getTime();
    if (!cur || (prevMs !== null && ms - prevMs > BATCH_GAP_MINUTES * 60 * 1000)) {
      cur = { start: b.time, end: b.time, count: 0, ids: [] };
      batches.push(cur);
    }
    cur.end = b.time;
    cur.count += b.added;
    cur.ids.push(...b.ids);
    prevMs = ms;
  }
  // 每批标注该时段内发生的事件
  for (const bat of batches) {
    bat.events = events.filter((e) => e.time.slice(0, 16) >= bat.start && e.time.slice(0, 16) <= bat.end)
      .map((e) => e.action);
  }
}

// ──────────────────────────── 5. 版本链 ────────────────────────────

/** 归一化文档名：去扩展名、去修订后缀与空白，用于把「原版/修订版」归为同一族 */
function normalizeDocName(name) {
  let s = String(name).replace(/\.[^.]+$/, '');
  s = s.replace(/[（(]\s*\d{4}\s*[-–—]\s*\d{1,2}\s*[^）)]*[)）]/g, ''); // （2026-10 修订版）
  s = s.replace(/[（(]\s*(修订版|改写版|新版|最新版)\s*[)）]/g, '');
  s = s.replace(/[_\-\s]+(修订版|改写版|新版|最新版|final|new)\s*$/gi, '');
  s = s.replace(/[_\-\s]*v\d+(\.\d+)*\s*$/gi, '');
  s = s.replace(/\s+/g, '');
  return s.trim();
}

/** 人工维护的跨名修订映射（自动识别不了的那类，如「使用方法」→「详细使用手册」） */
let versionMap = {};
if (fs.existsSync(VERSION_MAP)) {
  try {
    versionMap = JSON.parse(fs.readFileSync(VERSION_MAP, 'utf8'));
  } catch (e) {
    console.warn('[warn] version-map.json 解析失败，忽略：' + e.message);
    versionMap = {};
  }
}

/** 候选文档 = raw 下的文本文件 + 暂存区 + wiki 源摘要页标题 */
const docCandidates = [
  ...raws.filter((r) => r.kind === 'md' || r.kind === 'html'),
  ...staging,
];

/** canonical 归并：把 versionMap 指定的别名族并到同一个 key 下 */
const aliasToCanon = new Map();
for (const [canon, aliases] of Object.entries(versionMap)) {
  if (canon.startsWith('_')) continue; // 下划线开头的是注释字段，不是映射
  const c = normalizeDocName(canon);
  aliasToCanon.set(c, c);
  for (const a of aliases) aliasToCanon.set(normalizeDocName(a), c);
}

const chainGroups = new Map();
const chainMeta = new Map();
for (const d of docCandidates) {
  const n = normalizeDocName(d.name);
  const canonBase = aliasToCanon.get(n) || n;
  // 同一份文档的 .md 与 .html 是「两种格式」而非「两个版本」——必须按扩展名拆开，
  // 否则「2026-09-30_粒子物理_纪要.md / .html」会被误报成一条修订链。
  const ext = (path.extname(d.name) || '').toLowerCase();
  const key = canonBase + '|' + ext;
  if (!chainGroups.has(key)) {
    chainGroups.set(key, []);
    chainMeta.set(key, { base: canonBase, ext });
  }
  chainGroups.get(key).push(d);
}

const chains = [];
for (const [key, items] of chainGroups.entries()) {
  if (items.length < 2) continue;
  const base = chainMeta.get(key).base;
  const sorted = items.slice().sort((a, b) => a.mtime.localeCompare(b.mtime) || a.size - b.size);
  chains.push({
    base,
    // 展示名取「最短的那个标题」，通常是原版
    label: sorted.slice().sort((a, b) => a.name.length - b.name.length)[0].name.replace(/\.[^.]+$/, ''),
    items: sorted.map((d, i) => ({
      id: d.id,
      title: d.name.replace(/\.[^.]+$/, ''),
      scope: d.scope,
      kind: d.kind,
      size: d.size,
      mtime: d.mtime,
      abs: d.abs,
      path: d.path,
      isRevision: i > 0,
      // 只有两版都是文本才可能做正文 diff
      body: (d.kind === 'md' || d.kind === 'html') && !d.bodyTruncated ? d.body : '',
      lines: (d.kind === 'md' || d.kind === 'html') && !d.bodyTruncated
        ? d.body.split(/\r?\n/).length : 0,
    })),
    // 该族里已被编译成 wiki 源摘要页的条目
    compiled: items.map((d) => d.id).filter((id) => rawById.has(id) && (rawById.get(id).pages || []).length > 0),
  });
}
chains.sort((a, b) => b.items.length - a.items.length || a.base.localeCompare(b.base));

/** 打了修订角标的文档 → 所属链，供前端给节点挂角标 */
const revBadge = {};
for (const c of chains) for (const it of c.items) revBadge[it.id] = c.base;

// ──────────────────────────── 6. 轻量健康校验 ────────────────────────────

const dangling = [];
for (const p of pages) {
  for (const t of p.links) if (!resolveLink(t).length && !/^(learning|raw|attachments)\//.test(t)) dangling.push({ from: p.id, target: t });
}
const orphans = pages.filter((p) => p.inIds.length === 0).map((p) => p.id);
const missingRaw = pages.filter((p) => p.rawMissing).map((p) => p.id + ' -> ' + p.rawPath);
const usedRaw = new Set(pages.filter((p) => p.rawId).map((p) => p.rawId));
const pendingRaw = require('./classify_raw').classify().filter(r=>r.state==='pending').map(r=>r.path);

// ──────────────────────────── 7. 组装 DATA ────────────────────────────

const counts = { concepts: 0, entities: 0, sources: 0, comparisons: 0 };
for (const p of pages) if (counts[p.kind] !== undefined) counts[p.kind]++;
counts.total = pages.length;

const DATA = {
  meta: {
    generatedAt: localIso(new Date()),
    root: ROOT,
    counts,
    totalRaw: raws.length,
    totalStaging: staging.length,
    batchGapMinutes: BATCH_GAP_MINUTES,
    firstPageAt: pages.length ? pages[0].mtime : null,
    lastPageAt: pages.length ? pages[pages.length - 1].mtime : null,
    health: {
      dangling: dangling.length,
      orphans: orphans.length,
      missingRaw: missingRaw.length,
      pendingRaw: pendingRaw.length,
      malformedFm: pages.filter((p) => p.fmMalformed).map((p) => p.id),
    },
  },
  pages: pages.map((p) => ({
    id: p.id, type: p.type, kind: p.kind, title: p.title, aliases: p.aliases, tags: p.tags,
    status: p.status, updated: p.updated, rawPath: p.rawPath, rawId: p.rawId || null,
    rawMissing: !!p.rawMissing, origin: p.origin, author: p.author, year: p.year,
    entityKind: p.entityKind, sources: p.sources, items: p.items,
    links: p.links, outIds: p.outIds, inIds: p.inIds,
    mtime: p.mtime, createdBasis:p.created_basis, modified:p.modified, bytes: p.bytes, body: p.body,
  })),
  raws: raws.map((r) => ({
    id: r.id, name: r.name, scope: r.scope, kind: r.kind, ext: r.ext, size: r.size,
    mtime: r.mtime, abs: r.abs, path: r.path, pages: r.pages,
    body: r.body, bodyTruncated: r.bodyTruncated,
  })),
  events,
  timeline,
  batches,
  chains,
  revBadge,
  index: { orphanIds: orphans, pendingRawIds: pendingRaw, dangling },
};

// ──────────────────────────── 8. 输出 ────────────────────────────

const ARGV = process.argv.slice(2);

if (ARGV.includes('--json')) {
  console.log(JSON.stringify(DATA, null, 1));
  process.exit(0);
}

if (ARGV.includes('--issues')) {
  console.log('断链 ' + dangling.length + ':');
  for (const d of dangling) console.log('  ' + d.from + ' -> [[' + d.target + ']]');
  console.log('孤立页 ' + orphans.length + ':');
  for (const o of orphans) console.log('  ' + o);
  console.log('raw_path 失效 ' + missingRaw.length + ':');
  for (const m2 of missingRaw) console.log('  ' + m2);
  console.log('未编译原料 ' + pendingRaw.length + ':');
  for (const r of pendingRaw) console.log('  ' + r);
  process.exit(0);
}

if (ARGV.includes('--dry')) {
  const brief = {
    counts: DATA.meta.counts, raws: DATA.meta.totalRaw, staging: DATA.meta.totalStaging,
    events: DATA.events.length, batches: DATA.batches.length, chains: DATA.chains.length,
    timeline: DATA.timeline.length, health: DATA.meta.health,
  };
  console.log('[dry] ' + JSON.stringify(brief));
  console.log('[dry] 批次: ' + DATA.batches.map((b) => b.start.slice(11) + '~' + b.end.slice(11) + ' +' + b.count).join(' | '));
  console.log('[dry] 版本链: ' + DATA.chains.map((c) => c.label + '(' + c.items.length + ')').join(' | '));
  process.exit(0);
}

if (!fs.existsSync(TEMPLATE)) {
  console.error('[error] 找不到模板文件：' + TEMPLATE);
  console.error('        请确认 _health/view_template.html 是否存在。');
  process.exit(1);
}

/**
 * 安全地把 JSON 塞进 <script>：
 *  - </script 会提前闭合脚本标签
 *  - <!-- 在脚本里会被当作注释起始
 *  - U+2028 / U+2029 是 JS 行终止符，会直接破坏字符串字面量
 * 注：\/ 与 \u003c 都是合法 JSON 转义，不会破坏解析。
 */
function jsonForScript(obj) {
  return JSON.stringify(obj)
    .replace(/<\/script/gi, '<\\/script')
    .replace(/<!--/g, '\\u003c!--')
    .replace(/-\u002d>/g, '-\\u002d>')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

const tpl = fs.readFileSync(TEMPLATE, 'utf8');
const MARK = '/*__WIKI_DATA__*/null';
// 必须恰好出现一次：若注释或别处也写了同样的字面量，String.replace 会替换错位置，
// 结果是把 700KB JSON 塞进注释、真正的赋值处仍是 null，页面显示「数据未加载」。
const occ = tpl.split(MARK).length - 1;
if (occ !== 1) {
  console.error('[error] 模板中数据占位符出现 ' + occ + ' 次，必须恰好 1 次：' + MARK);
  console.error('        请检查 view_template.html 是否在注释里也写了该字面量。');
  process.exit(1);
}

// 替换参数必须用「函数」形式：字符串形式下 JSON 里的 $`、$'、$& 等序列会被
// String.replace 解释为特殊替换模式（如 $` = 匹配处之前的模板原文），直接把
// JSON 撑破 → 页面「数据未加载」。函数返回值不做任何模式解释。（2026-10-08 踩坑）
const html = tpl.replace(MARK, () => jsonForScript(DATA));
fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, html, 'utf8');

console.log('[ok] 已生成 ' + OUT_FILE);
console.log('     页面 ' + counts.total + '（概念 ' + counts.concepts + ' / 实体 ' + counts.entities +
  ' / 源摘要 ' + counts.sources + ' / 对比 ' + counts.comparisons + '）');
console.log('     原料 ' + raws.length + ' ｜ 暂存区文档 ' + staging.length +
  ' ｜ 事件 ' + events.length + ' ｜ 批次 ' + batches.length + ' ｜ 版本链 ' + chains.length);
console.log('     健康：断链 ' + dangling.length + ' / 孤立 ' + orphans.length +
  ' / raw_path 失效 ' + missingRaw.length + ' / 未编译原料 ' + pendingRaw.length +
  ' / front matter 畸形 ' + DATA.meta.health.malformedFm.length);
for (const m2 of DATA.meta.health.malformedFm) console.log('       ! ' + m2);
console.log('     体积 ' + (Buffer.byteLength(html) / 1024).toFixed(1) + ' KB');
