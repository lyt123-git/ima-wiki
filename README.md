# ima-wiki

**WorkBuddy/CodeBuddy + 腾讯 IMA 自生长知识库技能**：把散落的资料（IMA 云端收藏、本地 PDF）自动消化成一个可溯源、自检、每周自转的本地 Markdown 知识库。

English: A skill that turns scattered materials (Tencent IMA cloud clippings, local PDFs) into a self-growing, link-validated Markdown knowledge base with a weekly 8-step governance pipeline.

## 它解决什么问题

| 收集时的痛点 | 本库的解法 |
|---|---|
| 资料散在 IMA/微信/本地，存了就不看 | 每周自动同步 → 编译成可检索的知识页 |
| 笔记链接到处断 | 结构体检脚本，错误清零才放行 |
| 云端和本地两套对不上 | raw 只增不改 + SHA-256 台账 + 版本链 |
| AI 改库改坏了没法回退 | 红线写入 AGENTS.md + 每次变更必记 log + 备份约定 |
| 定时任务不知道怎么编排 | 三个现成 prompt 模板，复制即用 |

## 安装

### 方式一：GitHub 地址一键安装（推荐）

可用 skills CLI 从本仓库拉取技能源码：

```bash
npx skills add lyt123-git/ima-wiki -g -y
```

不同 skills CLI 版本支持的目标智能体和安装选项可能不同。录制 WorkBuddy/CodeBuddy 安装过程建议使用下方 ZIP 手动安装，便于核对目录。

### 方式二：下载 zip 手动安装

1. 下载已验收的 [ima-wiki-1.0.3.zip](https://github.com/lyt123-git/ima-wiki/raw/refs/heads/main/dist/ima-wiki-1.0.3.zip)，**解压到 skills 目录本身**：
   - WorkBuddy：`%USERPROFILE%\.workbuddy\skills\`
   - CodeBuddy：`%USERPROFILE%\.codebuddy\skills\`

   压缩包里已含一层 `ima-wiki\` 目录，所以解压后应当是
   `...\skills\ima-wiki\SKILL.md`。
   ⚠️ 若你先把 `skills\ima-wiki\` 建好再往里解压，会得到多套一层的
   `...\skills\ima-wiki\ima-wiki\SKILL.md`，技能不会被识别——把里层目录上移一级即可。

### 安装后配置（必做）

1. IMA 接口脚本已内置（`scripts/vendor/ima_api.cjs`），无需另装「腾讯 ima」技能
2. 填凭证：到 https://ima.qq.com/agent-interface 领取 Client ID + API Key，存入 `~/.config/ima/`（client_id、api_key 两个文件）或设 `IMA_CLIENT_ID`/`IMA_API_KEY` 环境变量
3. 体检：在 skill 的 `scripts\` 下运行 `node setup_check.js`（**建库后**改到 `<库根>\_health\` 下运行）——Node、脚本依赖完整性、凭证、知识库名、库根逐项检查，缺什么给照抄即可的补齐命令
4. 按 `references/setup-guide.md` 搭建（约 15 分钟：建库 → npm install → 首次同步 → 首次编译 → 自动化）

## 目录

```
SKILL.md                    技能入口（触发词/快速开始/红线）
README.md                   本文件
references/
  setup-guide.md            搭建指南（从零到自转）
  usage-manual.md           使用手册（日常操作/口令/常见问题）
  governance.md             八步治理详解 + 数据契约
  ima-api.md                IMA API 用法与坑位 + 五步上传
  automation-prompts.md     定时任务 prompt 模板
  pitfalls.md               实战踩坑总表
scripts/                    治理脚本（复制到 <库根>\_health\ 后 npm install 即用）
  setup_check.js            安装体检（Node/依赖完整性/凭证/知识库名/库根）
  sync_ima.js               IMA 全量同步（锁/台账/去重/续传）
  locking.js                运行锁（sync 防并发）
  classify_raw.js           原料分类
  gen_index.js              索引生成
  index_builder.js          索引生成实现
  validate_links.js         结构体检入口
  validate.js               结构体检实现（并写 _health\健康检查_<日期>.md）
  build_view.js             生长图谱
  run.ps1                   手动入口（check/refresh/sync）
  wiki_core.js              共享解析库
  vendor/ima_api.cjs        内置 IMA 接口脚本（独立副本，凭证自读）
assets/vault-skeleton/      新库骨架（目录结构 + AGENTS.md 模板）
```

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `WIKI_ROOT` | 脚本上级目录 | 库根目录 |
| `WIKI_IMA_API` | 内置 vendor/ima_api.cjs | IMA API 封装脚本（一般不用设） |
| `WIKI_KB_NAME` | （必填） | IMA 云端知识库名称（同步时唯一定位） |
| `WIKI_STAGING` | 空（关闭） | **可选**：暂存区目录，用于把「已落到本机、还没同步进 raw\ 的修订版」纳入版本链。多个目录用 `;`（Win）/`:`（macOS·Linux）分隔。⚠️ 开启后，这些目录下 `.md` 的**正文与绝对路径会被内嵌进 `_view\growth.html`**，分享该 HTML 前请自行确认 |
| `WIKI_NODE` | 系统 PATH 中的 node | Node 路径（可选） |
| `IMA_CLIENT_ID` / `IMA_API_KEY` | `~/.config/ima/` 凭证文件 | IMA OpenAPI 凭证（也可用 IMA_OPENAPI_CLIENTID/IMA_OPENAPI_APIKEY） |

> 用 `setx` 设环境变量后，**必须关闭并重开终端**才生效。

## 设计原则

1. **raw 只增不改**：原料是不可篡改的事实源，修订=新增版本
2. **知识页必须可溯源**：每个知识页通过 sources/raw_path 链回真实原料
3. **IMA 双向但不对称**：下行自动同步，上行只传成品且走五步门；知识页永不上传（IMA 无删除/更新接口）
4. **错误清零才放行**：体检不过，治理链停止
5. **一切留痕**：log.md 是唯一可信历史

## 更新日志

### v1.0.1
**修复（安装即崩类）**
- 补齐 3 个被脚本 require 但从未随包发布的文件：`scripts/locking.js`（`sync_ima.js` 依赖）、`scripts/index_builder.js`（`gen_index.js` 依赖）、`scripts/validate.js`（`validate_links.js` 依赖）。此前 v1.0.0 装完第一步同步就会 `Cannot find module`。
- `setup_check.js` 新增**脚本内部依赖完整性扫描**，以后再缺文件会在体检阶段就报错，而不是跑到一半才崩。

**修复（安全与可移植性）**
- `build_view.js` 移除硬编码的本机路径 `STAGING_DIRS = ['D:/知识库']`，改为环境变量 `WIKI_STAGING` 显式开启（默认关闭）。此前它会静默读取该目录下所有 Markdown，并把**正文和绝对路径内嵌进 `_view\growth.html`**，分享即外泄。
- 开启暂存区时会在控制台明确提示"正文与绝对路径会内嵌进 growth.html"；配置的目录不存在时给出 warning。

**修复（文档与实现一致）**
- `validate_links.js` 现在真的会写 `_health\健康检查_<日期>.md`（追加式），此前 4 处文档承诺了这份报告但脚本从不生成。
- `governance.md` 中所有 `node scripts/xxx.js` 路径改为库内实际路径 `_health\xxx.js`，并修掉不存在的 `_view\refresh.bat` 引用。
- 统一"八步治理"口径：以 `governance.md` 为准，`automation-prompts.md` / `SKILL.md` / `AGENTS.template.md` 全部对齐。
- `ima-api.md` 更正为"IMA 接口已内置"，与 README/SKILL 一致。
- `STRUCTURE.md` 去掉重复的 `_view\` 行、补上 `memory\`。
- README 安装方式一补上真实仓库名，解压说明写清目录层级，并修正"暂不开源"的过期表述。

**修复（健壮性）**
- `sync_ima.js` 单条目下载失败不再中断整轮：记账后跳过该条、继续跑完剩余条目，结尾汇总本轮失败数；`--resume` 重试失败条目。此前第 3 条坏数据会让后面几十条全部拿不到。
- 加一道兜底：本轮**所有**待同步条目都失败时判定为凭证失效/网络异常，脚本报错退出（exit 1），不会伪装成"同步成功"。

**改进（报错可读性）**
- 缺依赖时不再只抛英文栈：`wiki_core.js` 给出 `cd <库根>\_health && npm install` 的中文指引。
- 运行锁冲突改为中文，并说明"确认进程已结束后删除 `_health\sync.lock`"。
- `sync_ima.js` 输出增加 `skipped` / `failed` / `failedNow`，`--resume` 不再看起来像"什么都没干"。
- `classify_raw.js` 空库不再只输出 `{}`。
- `setx` 相关提示统一补上"需关闭并重开终端才生效"。
- `setup_check.js` 增加库根检查（在 skill 目录直接跑时给 [INFO] 而不是误报失败）。

### v1.0.0
首个发布版本。

## 许可

MIT License（见 `LICENSE`）。


## 1.0.2 修复：独立上传入口与失败停止

把 scripts 全部文件复制到库根的 _health 后，在库根终端执行：

```powershell
# 只做本地预检；不调用 IMA
node _health/upload_ima.js --file "D:/成品/知识库周报.md" --preflight-only

# 实际上传：kb-id 使用 IMA 查询返回的目标知识库真实 ID
node _health/upload_ima.js --file "D:/成品/知识库周报.md" --kb-id "实际知识库ID"

# 指定已存在的目标文件夹（可选）
node _health/upload_ima.js --file "D:/成品/知识库周报.md" --kb-id "实际知识库ID" --folder-id "实际文件夹ID"
```

- upload_ima.js 已串联：原始文件预检 → 重名检查 → create_media → COS PUT → add_knowledge。无需另装腾讯 IMA 技能。
- 必须明确传入 --kb-id；不会猜测目标库。可用内置 vendor/ima_api.cjs 调用 openapi/wiki/v1/search_knowledge_base（query 为用户指定库名，检查所有分页及名称唯一性）取得 ID。
- 同名则停止；如用户决定保留副本，先另存带时间戳的新文件再重新上传。脚本不覆盖、不自动改名。
- 仅上传成品；拒绝当前库 wiki 目录下的知识页。已有原料不改动，上传保持文件原始字节。
- COS 临时凭证仅在内存中使用，未经命令行或日志传递。仅 COS 成功后才登记入库，入库 code=0 后才输出 status=uploaded。
- 成功回执输出到终端（文件名、大小、SHA-256、目标库与媒体 ID）；可由调用方保存到项目记录。失败会非零退出；不自动重试写入，以免重复创建。
- 同步单条目失败仍会记录并继续收集本轮结果，但整轮返回非零，后续治理必须停止。--resume 可跳过成功项、重试失败项；部分失败不更新 lastSuccessfulRun。
- setup_check.js 现在实际加载 yaml 并核查上传模块，缺失时返回非零。安装后须在 _health 执行 npm ci（有 package-lock 时）或 npm install。

上传预检和 COS 签名辅助源自本机 ima-skill；签名路径按腾讯 COS Node SDK getAuth 的原始对象路径规则实现：
https://github.com/tencentyun/cos-nodejs-sdk-v5/blob/master/sdk/util.js
https://cloud.tencent.com/document/product/436/7778

## 1.0.3 浏览器验收修复
无实体页的新库，溯源树自动选择已有的概念或源摘要；空类型或过滤结果仍保留起点切换按钮，避免无法切换。已在独立本地测试库用真实浏览器验证。

## 当前仓库与安装包

源码和 `scripts/package.json` 版本均为 **1.0.3**。原始已验收安装包保存在 `dist/ima-wiki-1.0.3.zip`；仓库 README 的下载说明已更新，包内源码保持验收版本。

安装包 SHA-256：`958692e5dcc40030f780218b955eda959dfbada23ef12902af80d6ef8d5f46a2`。

每周治理提示词位于 `references/automation-prompts.md`。安装技能不会自动创建 WorkBuddy 定时任务，需另行配置；不要把模板存在等同于定时触发已验证。
