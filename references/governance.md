# 八步治理详解

每周（建议周一上午）由 agent 定时任务或人工触发，严格按顺序执行；上一步失败即停。

> 路径口径：以下 `_health\xxx.js` 均相对**库根**。脚本部署在 `<库根>\_health\`（见 setup-guide.md 第 1.4 步），不要在 skill 目录里执行。
> 手动串联：`_health\run.ps1 refresh` 会依次跑第 2、4、5、6 步（不含同步）。

## 步骤

### 1. IMA 同步
`node _health\sync_ima.js`
- 拉取 IMA 知识库全部条目，原文下载到 `raw\ima_sync\`。
- 内置：运行锁（sync.lock）、台账（_health/sync-ledger.json）、SHA-256 去重、--resume 断点续传。
- 只增不改：同哈希复用；同名不同内容落带哈希后缀新版本；不覆盖不删除任何既有文件。
- 单条目失败不会中断整轮：记入台账后跳过该条、继续跑完剩余条目（结尾汇总本轮失败数）；`--resume` 用于重试失败条目与接续中断。
- 只要本轮有失败，整轮返回非零并停止后续治理；所有条目都失败时另提示检查凭证/网络。部分成功不会更新 lastSuccessfulRun。

### 2. 原料盘点
`node _health\classify_raw.js` → 得到 pending / compiled / duplicate / asset / ignored 分类，明细落 `_health\raw-status.json`。
- 对 pending 新原料先建**源摘要页**（front matter 必有 `raw_path` 指向真实原料），再合并概念/实体/对比页。
- 已存在页面只合并更新，不重复建页；图片作素材关联，不逐张生成知识页。

### 3. 编译与链接维护
- 链接一律 `[[真实路径|中文显示名]]`（多数工具不解析自定义 title 拼的路径）。
- 页面 title 与正文 `[[链接词]]` 一字不差，超长名进 aliases；title 含冒号加引号。
- front matter 分隔符只允许 `---`（无尾随空格/反斜杠）；四类页保留 type/title/status/updated；概念/实体/对比页必须有 sources；源摘要必须有 raw_path。
- 只动本次涉及的页面，不做全库重构。

### 4. 索引
`node _health\gen_index.js` 重写 index.md（不要手写）。

### 5. 健康检查
`node _health\validate_links.js` → 修断链、孤立页、front matter 缺失、索引失准；**报告自动写 `_health\健康检查_<日期>.md`**（同一天多次体检追加到文末，不覆盖）。stdout 同时输出完整 JSON。**错误清零才进下一步。**
注意：validate 只证明结构正确，不证明事实正确；过期 draft 必须复核，不能只改日期。

### 6. 生长图谱
`node _health\build_view.js` 重新生成 `_view\growth.html`：时间生长轴、溯源树、知识网络图；节点可点开全文并一键打开 raw 真实源文件。失败读报错修数据，不要跳过。
时间轴优先取页面 front matter 里的 `created`，缺失时才回退文件 mtime；raw/ 保留的是原始创作时间，拿它做时间轴会得到错误曲线。

### 7. 成品上传 IMA
- 成品上传使用内置 `node _health/upload_ima.js --file "成品绝对路径" --kb-id "实际知识库ID"`，可选 --folder-id。自动执行五步：preflight-check → check_repeated_names → create_media → cos-upload → add_knowledge；任何失败停止。
- add_knowledge 的 title 必须等于 file_name（含扩展名）；归入既有文件夹（IMA API 无建夹能力）；失败不标成功。
- **禁止逐页上传 wiki\ 知识页**（IMA 无删除/更新接口，逐页传=版本爆炸）；云端概览靠《知识库周报_YYYY-MM-DD.md》（新增页清单+变更摘要+遗留项）。

### 8. 项目治理与记账
- 扫 `projects\` 各页：核对页面里记录的路径仍存在、项目状态准确；过期页标 `deprecated`（不删）；确认新完成的项目有复盘页。
- `log.md` 追加 `## YYYY-MM-DD HH:MM ｜ 每周治理` + 明细（同步条数/新增版本数、编译页数、体检结果、图谱、上传内容或"本轮无上传"、项目治理结论、遗留项）。

## 数据契约
- `raw\` 只增不改；修订=新增带日期/哈希的版本文件。
- 知识页 status 仅 draft/stable/disputed/deprecated；stable 需 verified 审核依据（页码/章节记录）。
- 只读检查不为留痕改文件；不做虚假完成。
