# IMA 知识库 API 用法与坑位

## 基础调用
- 接口脚本**已内置**（`scripts/vendor/ima_api.cjs`，随本 skill 分发，凭证自读），**不需要另装「腾讯 ima」技能**。
  `sync_ima.js` 按以下顺序自动定位（第一个存在的胜出）：内置 `vendor/ima_api.cjs` → `WIKI_IMA_API` → `~/.codebuddy/skills/腾讯ima/ima_api.cjs` → `~/.codex/skills/ima-skill/ima_api.cjs`。
  手工调用时同样引入：`const {imaApi} = require('<ima_api.cjs 路径>');`
- `imaApi(apiPath, body)` 返回 **JSON 字符串**，必须自己 `JSON.parse`。
- 列表接口返回字段是 `knowledge_list`（条目名是 `title`）；游标翻页看 `is_end` + `next_cursor`；子目录用 `folder_id`。
- 取原文：`get_media_info` → `url_info.url` + `url_info.headers`，Node fetch 下载（超时 60s，校验非空）。

## 上传五步（每次上传必须完整走）
1. **preflight-check**：凭证与前置检查
2. **check_repeated_names**：重名检查（同名的旧版本会共存，这是正常版本链不是脏数据）
3. **create_media**：创建媒体条目（MediaType：1=PDF 3=Word 4=PPT 5=Excel 7=Markdown 9=图片 11=笔记 13=TXT 99=文件夹）
4. **cos-upload**：上传文件本体
5. **add_knowledge**：入库登记；**title 必须等于 file_name（含扩展名）**

## 平台限制（决定了库的设计）
- **无删除、无重命名、无移动接口** → 同一文档新旧版本长期共存；修订一律发带日期的新文件；改名式修订登记 version-map。
- **无建文件夹接口** → 只能上传到既有文件夹，不得臆造新目录。
- **单文件上传** → 知识库逐页上传=版本爆炸；用《周报》做云端概览。
- 限流：批处理加间隔（约 1.7s/请求）与失败台账；失败条目缺 versions 数组会造成续传报错，需初始化。

## 已知坑
- PowerShell 拼调用会破坏 JSON/转 GBK：一律写**单进程 Node 脚本**。
- 带跟踪参数的动态网页每次下载字节不同：按同源格式保留版本，不宣称是正文更新。
- 旧文件被人加过来源注释导致哈希不同：保留两份原始文件，以去注释正文比较判重，不覆盖事实源。


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
