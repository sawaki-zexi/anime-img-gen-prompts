# Anime Prompt Atelier · 动漫灵感工坊

看配图，找到动漫风格提示词，带上原角色参考图，再交给可用的图像工具。

[公开画廊](https://anime-prompt-atelier.memorablestone1.chatgpt.site/) · [插件接入与当前下载](https://anime-prompt-atelier.memorablestone1.chatgpt.site/install/) · [版本信息](https://anime-prompt-atelier.memorablestone1.chatgpt.site/release.json)

当前源码只收录用户提供的「日系粗蜡笔角色涂鸦」、「天然呆大眼 Q 版头像」和「20cm 二次元棉花娃娃」三组完整原文与配图。三条都要求原角色参考图，收录效果图不自动作为用户角色参考；缺少参考图时先询问，不以示例人物代替用户角色。三条均为 `variables: {}`，天然呆头像条目的负面约束保留在原文正文中。

生成工具、模型、版本、种子、生成日期和许可未提供，页面如实标记；用户提供配图的生成条件没有独立复验。此前助手添加的七条种子内容及14张图已从正式目录移除，旧ID不再公开读取，也不以归档方式保留。本轮证据见 [内容替换记录](docs/validation/content-replacement.md) 与 [原文/图像哈希](docs/validation/evidence/content-replacement-hashes.json)。历史记录仍保留在 [Issue #4](docs/validation/issue-4-plugin.md) 和 [Issue #5](docs/validation/issue-5-release.md)，不冒充本轮验证。

## 插件与参考图

普通用户不需要克隆内容仓库、安装 Node.js、启动本地服务或申请生图 API Key。既有 Git 分发渠道为：

```sh
codex plugin marketplace add sawaki-zexi/anime-img-gen-prompts --ref plugin-release
codex plugin add anime-prompt-atelier@anime-atelier-plugins
```

安装后开启新会话。已发布插件 **0.1.2** 保持原八文件与ZIP字节不变；本轮只增加远程内容，不改包或升级版本。实际生图前按选中模板的要求提供参考图，纯检索或复制仍可先交全文。实际下载、客户端支持范围与本轮发布结果以接入页和替换记录为准，未通过的客户端仍标实验或未验证；插件尚未进入官方公共目录。

有宿主图像工具时保留用户的角色输入和参考图，交接渲染后的完整原文；没有图像工具时交付提示词，不能声称已生成图片。MCP不上传参考图、不生图、不代理模型或保存用户密钥。

## 本地开发

使用 Node.js **>=24.15.0 <25** 和 npm，提交了完整锁文件。项目 `.npmrc` 不修改用户全局配置。

```sh
npm ci
npm run dev
# 另一个终端，需要MCP时才启动
npm run dev:mcp
```

画廊 [本地入口](http://127.0.0.1:5173/)；例如详情 `/prompts/rough-crayon-character-redraw/`。本地 MCP 为 `http://127.0.0.1:3333/mcp`，健康检查为 `/health`；生产目标为 [匿名远程 MCP](https://anime-prompt-atelier.memorablestone1.chatgpt.site/api/mcp)。

| 命令 | 用途 |
| --- | --- |
| `npm run content:build` | 校验元信息、引用、变量、图片与版本，生成同一快照 |
| `npm run build` | Astro静态画廊与按需正文 |
| `npm run check` | 锁文件、类型、unit/协议、真实生产静态与Chrome、隔离合成规模检查 |
| `npm run release:build -- --out <新目录>` | 不可变Worker候选；第二阶段提供已通过生产preflight的插件 |
| `npm run release:verify -- --dir <保留目录>` | 离线验证快照、Worker、manifest和Site身份 |
| `npm run plugin:build -- --mcp-url … --gallery-url … --out …` | 真实HTTPS preflight后生成ZIP/marketplace；本地测试须显式 `--evaluation` |
| `npm run plugin:validate -- --root …` | 严格包Schema、连接、引用和哈希校验 |
| `npm run plugin:probe -- --package … --state …` | 独立配置的安装与发现探针，不使用原有认证 |
| `npm run benchmark -- --seconds 3 --warmup 1` | 短烟测，不等于受控五分钟验收 |

构建使用进程环境中的 `SITE_URL`、`SITE_BASE_PATH`；运行配置见 `.env.example`，脚本不会自动读取 `.env`。Chrome检查使用已安装的Chrome/Chromium，可用 `CHROME_BIN` 指定；所有测试服务、临时目录与浏览器注册清理。

## 三工具契约

先 `search_prompts({query:"重绘"})` 获取真实ID和修订，再 `get_prompt({id, expected_revision, include_examples:true})` 读取原文与条件，最后 `render_prompt({id, expected_revision, variables:{}})` 获取完整原文。当前三条没有模板变量，不得臆造 `subject`。

检索按词表/别名、名称/关键词/简介、正文词项匹配；同维度OR、跨维度AND，同分稳定ID排序。默认5条、最多20条；查询最多256个Unicode字符。变量功能保留：最多32项、每项最多2000字符，且受声明限制。未声明变量、缺必填项、旧修订、过期游标、不兼容模型均有结构化失败。HTTP请求体默认128KiB；Host/Origin、频率、Retry-After、隐私日志和回退见 [发布说明](docs/release.md)。

使用官方SDK v2，支持现代协议和legacy结构化结果。旧协议可能使用 `{result:…}` 包装。工具本身不包含Skill发现，不等于所有宿主自动调用均通过。

## 内容维护与测试隔离

正式内容位于 `content/prompts/*.md`，配图与缩略图位于 `public/images/`，词表位于 `content/taxonomy.json`。提示词逐字保存，包括Markdown、空行和正文内的负面约束。不要为了变量功能改写用户原文。未知生成日期填 `created_at:null`，工具写“未提供”、模型为 `null`、参数为 `{}`；不得用导入日期或文件mtime冒充生成日期。`updated_at` 只表示维护日期。

用户成组提供的配图注明“用户提供配图，未独立复验生成条件”；来源和许可未声明就如实记录。整图优先无损WebP并核对解码像素，缩略图等比缩放，不裁背景和构图，原PNG不修改。真实变量模板的当前版本仍须由记录的变量准确重现提示词；模板、图片和元信息共同进入SHA-256修订。

同一次构建生成完整 `generated/catalog.json`、检索用 `public/catalog.json` 和按需 `public/data/prompts/<id>.json`。画廊与MCP使用相同快照，不逐查询拉GitHub，不执行内容脚本。生成产物不手工编辑或提交。

`tests/fixtures/catalog-data.ts` 独立定义六类测试合成模板与Sharp几何像素，只在已登记清理的临时目录里构建。多用途、变量、分页、负面、透明图、归档、空库和1000条规模覆盖继续保留；不复制已移除的AI图片或完整提示词，不将测试内容放入正式目录。生产site与Chrome另行验证真实三条原文、参考图说明、未知日期、像素哈希与旧内容移除。

公开更新、安装、回退、模型行为和平台权限须分别记录真实结果，自动测试不代替外部验收。规格见 [v0.5](docs/specs/anime-prompt-library-v1.md)，实施顺序见 [计划](docs/plans/v1-implementation.md)。
