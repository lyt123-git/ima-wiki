# 使用手册（日常怎么用）

## 日常操作
| 想做什么 | 怎么做 |
|---|---|
| 看库 | 用 Markdown 编辑器打开库根；建议做一个工作台首页作总入口 |
| 投喂本地资料 | PDF/文章直接丢 `raw\` 任意子目录（只增不改） |
| 投喂云端资料 | 存进 IMA 知识库，下次治理自动同步 |
| 手动同步 | `node _health\sync_ima.js` 或做成 cmd 双击入口 |
| 查资料 | Ctrl+O 快速打开、Ctrl+Shift+F 全库搜索、右侧反向链接 |
| 手动体检 | `node _health\validate_links.js`，报告自动写到 `_health\健康检查_<日期>.md`（同一天多次体检追加，不覆盖） |
| 看库怎么长的 | 浏览器打开 `_view\growth.html` |

## 资料怎么变成知识
```
raw\ 原料（只增不改）
  → 源摘要页（raw_path 指向原文，记阅读覆盖范围，未核实保持 draft）
  → 概念页 / 实体页 / 对比页（sources 指向源摘要）
  → index.md 索引 + growth.html 图谱
```
- 区分"库中没有 / 已存未编译 / 摘要已核对"；不要把摘要遗漏说成原文没有。
- 重要公式、数据、命令回 raw 原文页码核对后才可 stable。

## 成果回流 IMA
- 说"任务完成"后，agent 整理定稿纪要（成果入口/工具版本/踩坑/验证），走五步上传。
- 成品默认上传；`wiki\` 知识页不逐页传（版本爆炸），用《周报》做云端概览。
- 本地是可编辑主版本；IMA 是云端/手机查阅与阶段定稿。

## 和 AI 任务的配合约定
- agent 接手前先读 `AGENTS.md` 与 `log.md` 末尾（规范+上次进度）。
- 多 agent 共用时：同一份规则、同一本台账，接手先看对方进度。
- 每次实际变更必写 log.md；只读检查不改文件。

## 常见问题
| 现象 | 处理 |
|---|---|
| `Cannot find module 'yaml'` | 还没装依赖。`cd <库根>\_health && npm install`（唯一依赖） |
| `Cannot find module './locking'`（或 `./index_builder`、`./validate`） | 发行包缺文件。从仓库 `scripts\` 补齐同名文件后重跑，或重新下载完整包 |
| 同步报"已有同名任务在运行" | 上一轮同步还在跑，等它结束；确认该进程已死而锁没释放，删 `_health\sync.lock` 后重试 |
| 同步报"未设置知识库名" | `setx WIKI_KB_NAME "你的IMA知识库名"`，然后**关闭并重开终端** |
| 用 `setx` 设完却还报 [MISS] | setx 只对新终端生效，重开一个终端再跑 |
| 同步失败 | 看 sync-ledger.json 的 error 字段；个别条目失败会自动跳过并跑完本轮，处理后 `--resume` 重试。只要本轮有失败即非零退出，停止后续治理；全失败时另提示检查凭证/网络 |
| 大批假断链 | 九成是 title 与链接词不一致或 front matter 分隔符非法，先查这两处 |
| 图谱"数据未加载" | build_view 注入数据用函数替换（tpl.replace(MARK, () => json)），别用字符串替换参数 |
| 图谱里出现本库之外的文件 | 检查 `WIKI_STAGING` 是否指向了不该纳入的目录（其正文会被内嵌进 growth.html） |
| 页面链接点不动 | 链接里用了自定义 title 而非真实路径；改成 [[真实路径\|显示名]] |

## 上传成品（1.0.2）
使用 `node _health/upload_ima.js --file "成品绝对路径" --kb-id "实际知识库ID"`，先加 `--preflight-only` 可仅本地预检。重名、预检、COS 或登记失败均非零退出。
