# 新库目录骨架

在库根（如 `D:\my-wiki`）创建以下结构：

```
<库根>\
├─ AGENTS.md                 ← 复制 AGENTS.template.md 改占位符（AI 工作手册/红线）
├─ log.md                    ← 空文件，流水台账（每次实际变更追加）
├─ 首页.md                   ← 总入口（agent 任务里生成，或先放占位）
├─ index.md                  ← gen_index.js 自动生成，不手写
├─ raw\                      ← 原料区（只增不改）
│  └─ ima_sync\              ← IMA 同步落地目录
├─ wiki\                     ← 知识区（编译产物）
│  ├─ concepts\  entities\  sources\  comparisons\
├─ projects\                 ← 项目复盘与踩坑
├─ attachments\              ← 图片等素材
├─ templates\                ← 项目复盘/学习单元模板
├─ memory\                   ← （可选）跨项目 agent 记忆；不参与编译/体检/索引
├─ _health\                  ← 本 skill scripts\ 全部文件复制到这里 + node_modules
│  ├─ sync-ledger.json       （sync 自动生成）
│  ├─ raw-status.json        （classify_raw 自动生成）
│  └─ 健康检查_<日期>.md     （validate 自动生成，追加式）
└─ _view\                    ← build_view.js 生成 growth.html（可选）
```

## 分区规则
- raw 只增不改；wiki 只由治理编译产生；projects 放复盘（大文件留原目录、页面记路径）。
- memory\ 页面不用 [[双向链接]]，不参与编译/体检/索引。
- 每个区只有一条合法入口路径，防杂乱。

## 编辑器建议
- 用支持 Markdown 双链与全文检索的编辑器打开整个库根。
