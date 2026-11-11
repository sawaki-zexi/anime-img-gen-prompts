# Anime Prompt Atelier · 动漫灵感工坊

看配图，找到动漫风格提示词，带上原角色参考图，再交给可用的图像工具。

[公开画廊](https://anime-prompt-atelier.memorablestone1.chatgpt.site/) · [插件接入与当前下载](https://anime-prompt-atelier.memorablestone1.chatgpt.site/install/) · [版本信息](https://anime-prompt-atelier.memorablestone1.chatgpt.site/release.json)

当前源码收录用户提供的「日系粗蜡笔角色涂鸦」、「天然呆大眼 Q 版头像」、「20cm 二次元棉花娃娃」与「Q 版猫娘贴纸」四组原文及配图，前三条为全文，猫娘贴纸为用户逐字提供的英文标签串。四条在实际生成前都要求原角色参考图，缺少时先询问；仅检索或复制无需先交图。收录效果图不自动作为用户角色参考，不以示例人物代替用户角色。四条均为 `variables: {}`，没有附加槽位；天然呆头像条目的负面约束保留在原文正文中。

用户说明当前四张图均由 **GPT 使用参考图生成**，内容记录为 GPT 家族、作者声明；具体模型版本、种子、参数、生成日期和许可仍未提供，不猜测，也不把用户说明升级成独立验证。图片信息面板只呈现已知信息，完整溯源、许可与条件仍在内容数据和 MCP 中。前三条原文及已有六张 WebP 保持不变；新猫娘图保留整幅粉色背景、构图与解码像素。证据见 [既有原文/图像哈希](docs/validation/evidence/content-replacement-hashes.json) 与 [猫娘标签/图像哈希](docs/validation/evidence/chibi-catgirl-sticker-hashes.json)。此前七条助手种子及14张图保持移除，旧ID不可读取，也不保留为归档；[旧内容替换记录](docs/validation/content-replacement.md)、[Issue #4](docs/validation/issue-4-plugin.md) 和 [Issue #5](docs/validation/issue-5-release.md) 保留历史事实，不冒充本轮验证。

## 插件与参考图

普通用户不需要克隆内容仓库、安装 Node.js、启动本地服务或申请生图 API Key。既有 Git 分发渠道为：

```sh
codex plugin marketplace add sawaki-zexi/anime-img-gen-prompts --ref plugin-release
codex plugin add anime-prompt-atelier@anime-atelier-plugins
```

安装后开启新会话。组合指导已由插件 **0.2.0** 提供；本次内容更新复用该不可变发布包，无需重装。旧 **0.1.2** 包、八个文件与ZIP字节也保持不变，仍可用原参数读取内容。实际生图前按选中方式确认参考图，纯检索或复制可先交提示词。实际下载和客户端支持范围以接入页及发布记录为准，CLI 仍为实验、桌面端尚未验证；插件未进入官方公共目录。

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

先 `search_prompts({query:"重绘"})` 或 `search_prompts({query:"猫娘"})` 获取真实ID和修订，再 `get_prompt({id, expected_revision, include_examples:true})` 读取原文与能力，最后 `render_prompt({id, expected_revision, variables:{}})` 获取全文或标签原文。当前四条没有模板变量，不得臆造 `subject`。`model:"GPT"` 可筛出用户声明的 GPT 家族内容；`verified_only:true` 不会把这项声明当成已验证结果。

卡片提供真实短摘录，点击复制才读取完整正文。前三条提供「复制完整提示词」，猫娘贴纸只提供「复制标签」，不补造全文。支持两种角色输入时才显示切换。可扩展条目将常用表情和自定义内容放在一个「附加提示词（选填）」区域，当前四条不显示或接受扩展。网页与 Agent 共享 `render_prompt` 的可选 `format`、`input_mode`、`additions:{preset_ids,custom}`，不推造标签或在渲染后另行拼接。字段、贡献示例与错误码见 [用法与组合契约](docs/prompt-composition.md)。

检索按词表/别名、名称/关键词/简介、正文词项匹配；同维度OR、跨维度AND，同分稳定ID排序。默认5条、最多20条；查询最多256个Unicode字符。变量功能保留：最多32项、每项最多2000字符，且受声明限制。未声明变量、缺必填项、旧修订、过期游标、不兼容模型均有结构化失败。HTTP请求体默认128KiB；Host/Origin、频率、Retry-After、隐私日志和回退见 [发布说明](docs/release.md)。

使用官方SDK v2，支持现代协议和legacy结构化结果。旧协议可能使用 `{result:…}` 包装。工具本身不包含Skill发现，不等于所有宿主自动调用均通过。

## 内容维护与测试隔离

正式内容位于 `content/prompts/*.md`，配图与缩略图位于 `public/images/`，词表位于 `content/taxonomy.json`。提示词逐字保存，包括Markdown、空行和正文内的负面约束。不要为了变量功能改写用户原文。当前生成工具按用户说明写 `GPT`，具体模型为 `null`、参数为 `{}`、生成日期为 `created_at:null`；其他条目工具确实未知时才写“未提供”。不得用导入日期或文件mtime冒充生成日期。`updated_at` 只表示维护日期。

用户成组提供的配图注明“用户提供配图，未独立复验生成条件”；来源和许可未声明就如实记录。整图优先无损WebP并核对解码像素，缩略图等比缩放，不裁背景和构图，原PNG不修改。真实变量模板的当前版本仍须由记录的变量准确重现提示词；模板、图片和元信息共同进入SHA-256修订。

同一次构建生成完整 `generated/catalog.json`、检索用 `public/catalog.json` 和按需 `public/data/prompts/<id>.json`。画廊与MCP使用相同快照，不逐查询拉GitHub，不执行内容脚本。生成产物不手工编辑或提交。

`tests/fixtures/catalog-data.ts` 独立定义六类基础合成模板及三个组合能力夹具，使用Sharp几何像素，只在已登记清理的临时目录里构建。多用途、变量、分页、负面、透明图、归档、空库和1000条规模覆盖继续保留；不复制已移除的AI图片或完整提示词，不将测试内容放入正式目录。生产site与Chrome另行验证四条原文的全文/标签复制、GPT作者声明、简短图片信息、参考图操作说明、未知日期、像素哈希与旧内容移除。

公开更新、安装、回退、模型行为和平台权限须分别记录真实结果，自动测试不代替外部验收。规格见 [v0.7](docs/specs/anime-prompt-library-v1.md)，实施顺序见 [计划](docs/plans/v1-implementation.md)。
