# 搭建指南（从零到自转）

## 0. 前置条件
| 组件 | 要求 | 用途 |
|---|---|---|
| Node.js | ≥18 | 全部脚本（系统安装即可） |
| IMA OpenAPI 凭证 | Client ID + API Key | 云端接口认证（https://ima.qq.com/agent-interface 领取） |
| WorkBuddy/CodeBuddy | 可运行定时任务 | 每周治理/提醒自动化 |
| IMA 账号 | 已建好云端知识库 | 记下知识库名与 kb_id |

> 本 skill 已内置 IMA 接口脚本（`scripts/vendor/ima_api.cjs`），**不再需要安装腾讯 IMA 技能**。

## 1. 建库（约 5 分钟）
1. 选库根目录（推荐 D 盘，如 `D:\my-wiki`）。
2. 复制 `assets/vault-skeleton/STRUCTURE.md` 里的目录树创建空目录：
   `raw\ima_sync\`、`wiki\concepts|entities|sources|comparisons\`、`projects\`、`attachments\`、`templates\`、`_health\`、`_view\`（可选再加 `memory\`）。
3. 复制 `AGENTS.template.md` → 库根 `AGENTS.md`，把尖括号占位符替换成实际值。
4. 把本 skill `scripts\` 全部内容复制到 `<库根>\_health\`。

## 2. 配置（约 5 分钟）
```
cd <库根>\_health && npm install     # 唯一依赖 yaml
```
- IMA 连接已内置接口脚本（`scripts/vendor/ima_api.cjs`），需要你填的只有**凭证**：
  1. 打开 https://ima.qq.com/agent-interface 获取 **Client ID** 和 **API Key**。
  2. 存放（二选一）：`~/.config/ima/client_id` 与 `~/.config/ima/api_key` 两个文件（推荐）；或环境变量 `IMA_CLIENT_ID` / `IMA_API_KEY`。
  3. 凭证只作为请求头发往 ima.qq.com，不落日志、不发往其他域名。
- **装完先体检**：在 `<库根>\_health\` 下运行 `node setup_check.js`——它会检查 Node、脚本内部依赖完整性、内置接口脚本、凭证、知识库名、库根，缺什么当场给出照抄即可的补齐命令，全部 [OK] 才继续。
- **你的知识库名**：设 `WIKI_KB_NAME` 为你 IMA 云端知识库的准确名称（同步脚本按名称唯一定位知识库）。
- 库根不在默认位置：设 `WIKI_ROOT`。Node 非默认路径：设 `WIKI_NODE`。
- （可选）`WIKI_STAGING`：把"已落到本机、还没同步进 raw\ 的修订版"所在目录纳入版本链，多个目录用 `;`（Win）/`:`（macOS·Linux）分隔。**默认关闭**；开启后这些目录下 `.md` 的正文与绝对路径会内嵌进 `_view\growth.html`，分享前请自行确认。
- ⚠️ 用 `setx` 设的任何环境变量，**都要关闭并重开终端才生效**——设完立刻重跑体检会仍显示 [MISS]，这是正常的。
- 把你的知识库名与 kb_id 写进 AGENTS.md（治理任务 prompt 里要用）。

## 3. 首次同步
```
node _health\sync_ima.js
```
IMA 全部条目原文落地 `raw\ima_sync\`。核对 `_health\sync-ledger.json`：个别条目失败会记账跳过并跑完本轮，按报错处理后用 `--resume` 重试即可；若本轮全军覆没，脚本会直接报错（凭证/网络问题）。

## 4. 首次编译
按 governance.md 第 2-3 步：classify_raw 盘点 → 对 pending 逐个建源摘要页 → 合并概念/实体/对比页。首库建议从 10 个以内高价值原料开始，别贪多。

## 5. 收尾三件套
```
node _health\gen_index.js
node _health\validate_links.js     # 错误清零
node _health\build_view.js         # 生成 _view\growth.html
```
用 Markdown 编辑器打开库根，检查页面链接与 front matter。

## 6. 自动化（推荐，装完每周自转）
现成 prompt 在 `references/automation-prompts.md`：
1. **每周八步治理** → 建成每周一定时任务，cwd 指库根
2. 验证：任务建成后手动触发一次，确认八步跑通并写入 log.md。

## 7. 备份约定
- 大变更前手动备份：整库拷到 `<盘>:\wiki-backups\<日期>-<主题>\`（含 AGENTS.md、原料、知识页、_health）。
- 原料哈希核对：备份里的 raw-hashes.json。
- 同盘备份只防误改，不防整盘损坏；重要资料另做异地/云端副本。

## 8. 验收清单
- [ ] `setup_check.js` 全项 [OK]
- [ ] sync-ledger.json 无 failed
- [ ] validate_links.js 错误 0，且已生成 `_health\健康检查_<日期>.md`
- [ ] index.md 与实际页面一致
- [ ] growth.html 在浏览器正常渲染
- [ ] 页面链接跳转正常
- [ ] AGENTS.md 里的 kb_id/路径正确
- [ ] log.md 已记录本次搭建

## 1.0.2 验收补充
安装后在 _health 运行 setup_check.js；缺 yaml 或上传模块必须失败。云端上传改用 upload_ima.js，命令见 README 的 1.0.2 节。首次同步有任何失败则停止治理，修复后 --resume。
