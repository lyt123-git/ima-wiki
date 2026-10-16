# 定时任务 Prompt 模板

唯一自动化任务：每周治理。建议建在 WorkBuddy/CodeBuddy 的自动化里，cwd 指向库根。占位符 `<库根>`、`<kb_id>` 按实际替换。

## 1. 每周八步治理（核心，每周一上午）

```
【每周一次】<库根> 自生长知识库流水线（本地 Markdown 主库 + IMA 云端通道）。严格按 <库根>\AGENTS.md 执行，遵守其全部红线（raw/ 只读、不删页、不编造、不虚假完成、每次操作必写 log.md）。

开工先读 <库根>\AGENTS.md 全文与 <库根>\log.md 末尾，然后依次完成 8 步：

1. IMA 同步：跑 node <库根>\_health\sync_ima.js。该脚本已封装 ima 技能（ima_api.cjs）：自动定位知识库、翻页拉全量条目、下载原文到 <库根>\raw\ima_sync\，内置运行锁、sync-ledger.json 台账、SHA-256 去重与 --resume 断点续传。只增不改：同哈希复用，同名不同内容落带哈希后缀的新版本，不覆盖、不删除任何既有文件。单条目失败会记账并继续收集本轮结果，但只要本轮有失败，最终非零退出，停止后续治理，使用 `--resume` 重试；全部失败时同样报错退出。

2. 本地资料盘点：跑 node <库根>\_health\classify_raw.js 确认 pending/compiled/duplicate 分类；对 pending 新原料先建源摘要页（raw_path 指向真实原料），再合并概念/实体/对比页。已存在页面只合并更新，不重复建页。

3. 编译与链接维护：链接一律用真实库根路径 + 中文显示名；页面 title 必须与正文 [[链接词]] 一字不差，超长名放 aliases；title 含冒号必须加引号；front matter 分隔符必须是 ---（无尾随空格/反斜杠）；四类页保留 type/title/status/updated，概念/实体/对比页必须有 sources，源摘要必须有 raw_path。只动本次涉及的页面，不做全库重构。

4. 更新索引：跑 node <库根>\_health\gen_index.js 重写 index.md（不要手写）。

5. 健康检查：跑 node <库根>\_health\validate_links.js；修断链、孤立页、front matter 缺失、索引失准；报告写到 _health\健康检查_<日期>.md（新文件）。错误必须清零才进入下一步。

6. 刷新生长图谱：node <库根>\_health\build_view.js 重新生成 _view/growth.html。失败时读报错定位数据问题并修复，不要跳过。

7. 成品上传 IMA：本周新增的定稿纪要/项目复盘/学习单元定稿等成品 md，用内置 `node <库根>/_health/upload_ima.js --file "成品绝对路径" --kb-id "已核定的真实知识库ID"` 走五步上传（preflight-check → check_repeated_names → create_media → cos-upload → add_knowledge），可选 `--folder-id`，任一失败停止后续步骤，title 必须等于 file_name（含扩展名）；失败不标成功；没有成品就明确记录"本轮无上传"。禁止逐页上传 wiki/ 知识页——改为生成《知识库周报_YYYY-MM-DD.md》上传，作为云端概览。

8. 项目治理与记账：扫 <库根>\projects\ 各页，核对页面记录的路径仍存在、项目状态准确，过期页标 deprecated 不删；确认新完成的项目有复盘页。最后在 log.md 追加 `## YYYY-MM-DD HH:MM ｜ 每周治理` + 明细（同步条数/新增版本数、编译页数、体检结果、图谱、上传内容或"本轮无上传"、项目治理结论、遗留项）。
```
