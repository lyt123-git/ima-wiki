# 实战踩坑总表

## Windows / PowerShell
- PS 5.1 读无 BOM 文件按 ANSI/GBK 解析：**含中文的 .ps1 必须存 UTF-8 with BOM（utf-8-sig）**，否则中文语法错。
- PS 5.1 命令行拼 JSON 会破坏引号/转 GBK：调 IMA API 一律写**单进程 Node 脚本**，返回 JSON 字符串需 JSON.parse。
- cmd/findstr 处理中文不可靠：校验文件内容用 Python/Node 读。
- cmd 启动器（.bat/.cmd）按 OEM 码页解析：**保持 ASCII-only**，引用含中文文件名的脚本会失败——脚本文件名用 ASCII。
- 外层 shell 调 PS 时 `$` 可能被剥掉：复杂逻辑写成脚本文件执行，不走 -Command 内联。

## Node / 脚本
- node 用系统安装版；脚本路径尽量相对化（`__dirname`/`Split-Path $PSScriptRoot`），库根走 `WIKI_ROOT` 环境变量。
- 脚本约定：台账落 `_health\`、写 JSON 用临时文件+rename 防半写；结构性错误（凭证/知识库名/分页异常）失败即停，**单条目下载失败只记账并跳过**（跑完本轮，`--resume` 重试）；本轮全失败=真故障，报错退出。
- build_view 注入数据必须用函数替换：`tpl.replace(MARK, () => json)`——字符串替换参数里 JSON 的 `$\`、$'`、`$&` 会被解释成特殊替换模式，把数据撑破（表现为图谱"数据未加载"）。

## IMA API
- 无删除/重命名/移动/建夹接口；新旧版本共存是正常版本链，不是脏数据。
- add_knowledge 的 title 必须等于 file_name（含扩展名）。
- 限流：批处理加间隔约 1.7s/请求；失败条目缺 versions 数组会让 --resume 报错，需初始化补上。
- get_knowledge_list 返回 `knowledge_list`，条目名是 `title`；search 接口是 `info_list`——两套字段名。

## Markdown 库内容
- 页面 title 与正文 `[[链接词]]` 一字不差，超长名进 aliases；否则大批假断链。
- title 含冒号必须加引号；front matter 分隔符只允许 `---`（无尾随空格/反斜杠）——曾造成 20 处假断链、2 个孤立页。
- 链接用真实库根路径+中文显示名；不要用自定义 title 拼路径（多数工具不解析）。
- 生长时间轴优先取页面 front matter 的 `created`，缺失才回退文件 mtime；raw/ 保留原始创作时间，用它画曲线必错。
- YAML 用解析器（如 js-yaml/yaml 包），别手写正则——裸冒号 title 会被漏判。

## 多 agent 协作
- 多个 agent 同时写库：接手前先读 log.md 末尾确认对方进度；同一份 AGENTS.md 为准。
- 自动任务实际触发时间可能比 rrule 名义时间早 2~3 分钟（调度器对齐），无害。
- 桌面应用可能重写自己的 config 文件：写入的配置改动要复查是否被应用还原。
