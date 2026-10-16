---
name: ima-wiki
description: WorkBuddy/CodeBuddy + 腾讯IMA 自生长知识库：搭建本地 Markdown 知识库、每周八步治理（IMA 同步→原料盘点→编译→索引→体检→生长图谱→成品上传周报→项目治理与记账）、IMA 五步上传。触发词：知识库治理、自生长知识库、IMA 同步、搭建知识库、知识库体检、上传 IMA。
---

# ima-wiki：WorkBuddy + IMA 自生长知识库

把散落的资料（IMA 云端收藏、本地 PDF）自动消化成一个本地 Markdown 知识库：原料只增不改、知识页可溯源、链接不断、每周自检、成品回流云端。

## 什么时候用
- 用户要"搭建/初始化一个自生长知识库"
- 用户说"知识库治理 / 跑一遍治理 / 同步 IMA / 知识库体检"
- 用户问"PDF 怎么入库 / 资料怎么编译 / 怎么上传 IMA"

## 快速开始（新库）
1. 复制 `assets/vault-skeleton/STRUCTURE.md` 里的目录树与 `AGENTS.template.md` 到库根，按用户实际路径填好占位符（推荐 D 盘）。
2. 把本 skill `scripts/` 的**全部内容**复制到 `<库根>\_health\`，然后在该目录执行 `npm install`（唯一依赖 yaml）。
   > 注意：脚本要复制到库里跑，不要留在 skill 目录执行——库根就是 `WIKI_ROOT` 的默认值（脚本上级目录）。
3. 在 `<库根>\_health\` 下运行 `node setup_check.js`——它会检查 Node、脚本依赖完整性、IMA 接口脚本、凭证、知识库名与库根，缺什么按提示填什么。
   - 凭证获取：https://ima.qq.com/agent-interface 领取 Client ID + API Key，存 `~/.config/ima/`（client_id、api_key 两个文件）或设 `IMA_CLIENT_ID`/`IMA_API_KEY` 环境变量。
4. 首次同步：`node _health\sync_ima.js`（把 IMA 全部条目原文下载到 `raw\ima_sync\`，只增不改；需要 `WIKI_KB_NAME`）。
5. 编译：按 `references/governance.md` 第 2-3 步把 pending 原料整理成知识页。
6. 收尾：`_health\gen_index.js → _health\validate_links.js（错误清零）→ _health\build_view.js`（详见 governance.md 八步）。

## 环境变量
| 变量 | 默认 | 说明 |
|---|---|---|
| WIKI_ROOT | 脚本上级目录 | 库根目录 |
| WIKI_IMA_API | 内置 vendor/ima_api.cjs | IMA API 封装脚本路径（一般不用设，仅外部覆盖时用） |
| WIKI_KB_NAME | （必填） | IMA 云端知识库名称（同步时唯一定位） |
| WIKI_STAGING | 空（关闭） | 可选：暂存区目录（尚未同步进 raw\ 的修订版），多个用 `;`（Win）/`:`（macOS·Linux）分隔。⚠️ 开启后这些目录下 `.md` 的正文与绝对路径会内嵌进 `_view\growth.html` |
| WIKI_NODE | 系统 PATH 中的 node | Node 路径（可选） |
| IMA_CLIENT_ID / IMA_API_KEY | ~/.config/ima/ 凭证文件 | IMA OpenAPI 凭证（也可用 IMA_OPENAPI_CLIENTID/IMA_OPENAPI_APIKEY） |

> 用 `setx` 设环境变量后需**关闭并重开终端**才生效。

## 自动化（可选但推荐）
`references/automation-prompts.md` 里有现成的每周治理定时任务 prompt（唯一自动化）。装好后库每周自转。

## 红线（违反即事故）
- `raw\` 只增不改：新版本落带哈希后缀的新文件，不覆盖不删除。
- 知识页 title 必须与正文 `[[链接词]]` 一字不差；title 含冒号加引号；front matter 分隔符只允许 `---`。
- 上传 IMA 走五步门（preflight → 重名检查 → create_media → cos-upload → add_knowledge），失败不标成功；`wiki\` 知识页禁止逐页上传（IMA 无删除/更新接口，会版本爆炸），概览靠《周报》。
- 每次实际变更追加 `log.md`；不做虚假完成；只读检查不为留痕而改文件。

## 深入阅读
- `references/setup-guide.md`：搭建指南（从零到自转，含验收清单）
- `references/usage-manual.md`：使用手册（日常操作/口令/常见问题）
- `references/governance.md`：八步治理详解 + 数据契约
- `references/ima-api.md`：IMA API 用法、坑位、五步上传
- `references/pitfalls.md`：实战踩坑总表
- `references/automation-prompts.md`：定时任务 prompt 模板
- `assets/vault-skeleton/`：新库骨架


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
