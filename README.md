# Anime Prompt Atelier · 动漫灵感工坊

看图片，找到动漫风格提示词，填入自己的主角，再复制到图像生成工具。

目前收录六条独立生成的真实样例，覆盖头像、角色立绘、场景、壁纸、漫画、插画、表情包与贴纸。每条的原始提示词、实际生成图、变量与已知生成条件共同保存在仓库中；未知的底层模型、版本和种子如实保留为未知。插件仍按真实客户端结果标记实验；公开托管与正式分发由 [Issue #5](https://github.com/sawaki-zexi/anime-img-gen-prompts/issues/5) 推进，实际状态见 [发布验收记录](docs/validation/issue-5-release.md)。

画廊的 `/install/` 是插件接入入口：第一阶段只提供画廊回退，生产服务验证后第二阶段才展示实际 ZIP 与已发布 marketplace 步骤。普通用户不需要克隆仓库、安装本地运行时或启动服务。真实客户端支持范围、维护者打包和两个项目评测见 [插件安装说明](docs/plugin-installation.md) 与 [实际验证记录](docs/validation/issue-4-plugin.md)。

## 本地运行

使用 Node.js **24.15 或更新的 24.x LTS** 与 npm。仓库提交了锁文件。

项目级 `.npmrc` 使用官方 npm registry，避免镜像同步滞后留下不完整的跨平台可选依赖；它不修改用户的全局设置。更新依赖后运行 `npm run lockfile:check`，确认各平台锁记录完整。此检查只依赖 Node，CI 会在 `npm ci` 前执行。

```sh
npm ci
npm run dev
```

打开 <http://127.0.0.1:5173/>。详情页为 `/prompts/summer-anime-illustrator/`。如端口被占用，可运行 `npm run dev -- --port 5174`；页面内链接和图片使用同源路径。

在另一个终端启动真实 Streamable HTTP MCP 服务：

```sh
npm run dev:mcp
```

工具端点为 `http://127.0.0.1:3333/mcp`，健康检查为 `http://127.0.0.1:3333/health`。这是开发用本地服务，默认仅监听回环地址，并校验 Host 和 Origin。生产 Worker 使用相同 Fetch 核心，路径为 `/api/mcp`；域名、运行限制和两阶段发布见 [发布说明](docs/release.md)。

常用命令：

| 命令 | 用途 |
| --- | --- |
| `npm run lockfile:check` | 在安装前检查锁文件中的版本、来源和完整性记录，正确保留 workspace/link 与 bundled 例外 |
| `npm run content:build` | 校验 Markdown、元信息、词表、变量、图片和生成记录，生成共享快照 |
| `npm run plugin:build -- --mcp-url … --gallery-url … --out …` | 用明确地址生成可移植插件 ZIP、Codex 兼容声明与 marketplace；发布模式验证真实 HTTPS 服务，测试须显式 `--evaluation` |
| `npm run plugin:validate -- --root …` | 离线验证包 Schema、引用、连接一致性与隐式发现策略 |
| `npm run plugin:probe -- --package … --state …` | 独立配置中实际安装并验证两项目 Skill 发现，不使用用户认证 |
| `npm run plugin:eval -- --state … --prepare/--run` | 准备一次隔离安装，随后按真实工具轨迹评测新会话；模型运行需显式 `--run` |
| `npm run dev` | 先构建内容，再启动画廊开发服务器 |
| `npm run dev:mcp` | 先构建内容，再启动 MCP |
| `npm run build` | 构建内容与静态站点到 `dist/` |
| `npm run release:build -- --out …` | 隔离构建同快照画廊、MCP、真实图片与版本 manifest，产生自包含 Worker；分发阶段须提供已验证 release 插件 |
| `npm run release:verify -- --dir …` | 离线复核保留产物的 Worker、manifest、内容摘要与同一 Site 身份 |
| `npm run benchmark -- --seconds 3 --warmup 1` | 短烟测；完整受控验收另用 Docker/性能工作流，常规 check 不运行五分钟压测 |
| `npm run preview` | 在 5173 端口预览已构建站点；先停止占用该端口的开发服务器 |
| `npm run start:mcp` | 从已经生成的快照启动 MCP，不重新构建内容 |
| `npm run typecheck` | Astro 与 TypeScript 类型检查 |
| `npm test` | 内容、共享规则和真实 MCP HTTP 客户端测试 |
| `npm run test:site` | 构建站点，验证静态页面、公开 JSON 与真实 MCP 的一致性 |
| `npm run test:browser` | 构建并用真实 Chrome/Chromium 验证手机、键盘、分享、分页、复制与归档 |
| `npm run check` | 执行全部检查；CI 使用同一入口 |

维护内容后重新执行内容构建，并重启 MCP 以加载新快照。网页开发服务器会读取更新后的构建产物。`.env.example` 说明可配置项；构建脚本直接读取进程环境变量，**不会自动加载 `.env` 文件**。

浏览器检查使用本机 Chrome/Chromium，不下载浏览器；可通过 `CHROME_BIN` 指定可执行文件。Windows 默认查找已安装的 Chrome，Linux 查找 `/usr/bin/google-chrome` 或 Chromium。CI 的 Ubuntu runner 已包含浏览器。验收使用临时独立内容与浏览器配置，后台窗口隐藏，服务只监听回环地址与临时端口；不会修改现有浏览器配置。

如需在另一个来源或子路径构建，把同一组 `SITE_URL` 与 `SITE_BASE_PATH` 环境变量传给构建过程。例如 PowerShell：

```powershell
$env:SITE_URL = 'https://example.com'
$env:SITE_BASE_PATH = '/anime-prompts/'
npm run build
```

`SITE_URL` 只包含协议与域名，路径单独放入 `SITE_BASE_PATH`。JSON 中的公开地址随配置生成，MCP 应使用这次构建产生的相同快照。修改端口可设置 `MCP_PORT`，例如 PowerShell 的 `$env:MCP_PORT = '3334'`。

## Agent 调用

服务提供三个只读工具，均有输入与输出 Schema：

1. `search_prompts({ query: "壁纸" })`：获取少量摘要和 `prompt_revision`。
2. `get_prompt({ id, expected_revision, include_examples: true })`：读取模板、变量、来源与实际示例。
3. `render_prompt({ id, expected_revision, variables: { subject: "an adult anime traveler holding a sketchbook" } })`：得到可交给生图工具的完整提示词。

`render_prompt` 必须带上刚读取的修订号。`variables: {}` 使用声明的默认值；显式传空的必填项会返回 `MISSING_VARIABLES`，未声明变量返回 `INVALID_VARIABLES`，旧修订返回 `REVISION_MISMATCH`。失败结果包含 `ok: false`、错误码与详细信息，且 MCP 结果标记 `isError: true`。服务不会生成图片。

成功结果包含 `ok: true`、`catalog_revision` 和 `data`。搜索默认每次 5 条、最多 20 条；详情默认不展开示例。查询上限为 256 个 Unicode 字符，变量最多 32 项、每项最多 2,000 个 Unicode 字符，HTTP 请求体上限为 128 KiB。实际变量还受各自声明的取值与长度限制。

画廊和 MCP 共用确定性关键词检索：用途、画风、模型词表及中英文别名优先，再匹配名称、关键词、简介与正文词项。空格分隔的多个关键词须同时匹配；同维度筛选是 OR，不同维度是 AND，同分按稳定 ID 排序。`model` 接受词表 ID 或别名，也允许查询尚无兼容性记录的模型；明确不兼容项被排除，未知项仍标记未知。`verified_only: true` 需要指定模型，且只返回该模型的已验证条目。当前六条没有具体模型验证记录，因此“仅已验证”不会产生结果。游标绑定完整查询、筛选、每页数量与内容版本，条件改变后应从第一页开始。

首页的用途与画风可多选，模型名称可填写；地址会保存关键词、各筛选维度、每页数量与分页游标，刷新、分享和浏览器前进后退均可恢复。卡片“复制原文”按需读取对应模板；详情提供默认值、实时变量校验、原文与填写后复制。若有独立负面模板，正向与负面分别展示和复制。剪贴板受限时会选择文本，供用户手动复制。

实现使用官方 TypeScript SDK v2，支持 2026-07-28 协议与 SDK 的 2025 协议兼容路径。v2 客户端可设置 `versionNegotiation: { mode: 'auto' }`。在旧协议路径上，SDK 会把联合输出 Schema 与结构化结果投影到 `{ result: ... }` 包装中；文本内容仍提供业务结果 JSON。自动化同时验证了两条传输路径。普通 MCP 连接不等于已安装能跨项目自动发现的任务 Skill；可安装插件的测试路径与实际支持状态见上方安装说明。

## 内容与结构

```text
content/
  taxonomy.json                    用途、画风、模型及中英文别名
  prompts/*.md                     每条独立的 YAML 元信息 + Markdown 正文
public/images/                     原图与实际缩略图
src/content/build.ts               校验、图片解码、稳定版本计算
src/lib/schema.ts                  共用数据及工具契约
src/lib/catalog.ts                 不依赖 Node 的确定性检索、读取、单次字面替换
src/pages/                         Astro 静态画廊与详情
src/server/                        共用工具/Fetch核心、Node与Worker适配、快照校验
scripts/build-release.ts            两阶段不可变发布构建
release/production.json             真实Site身份与目标来源；不含凭据
benchmarks/                        不公开的千条数据和受控五分钟压测
tests/                             内容边界、真实传输与静态产物一致性
```

由同一内容构建生成完整的 `generated/catalog.json`、仅供检索的 `public/catalog.json`，以及按条目读取的 `public/data/prompts/<id>.json`。首页只内嵌摘要和去重排序的正文词项，不下载全库可直接使用的模板或默认值；卡片复制、详情与大图均按需读取。静态画廊独立于 MCP 运行。产物不手工编辑、不提交，网页和 MCP 使用相同的 `catalog_revision`。内容快照与条目修订均使用 SHA-256，包含正文、元信息与图片字节，构建不写入当前时间。同样内容与站点配置会得到同样修订号。

模板使用 `{subject}` 形式的占位符，只做一次字面替换；用户填写的花括号、换行、语言与 `$` 字符都保留，不执行表达式或递归展开。草稿不公开；归档仅保留稳定详情链接、归档说明与已发布替代项，正文不进入索引或 MCP，也不保留旧的按需正文文件。只有已发布且具有可解码真实示例图的条目才可公开读取。正式内容目前没有归档历史，自动化使用明确标记的临时夹具验证归档行为。

新增条目时复制现有 Markdown 作为字段参考，分配稳定 ID，记录实际生成提示词、变量和来源。若更新模板，需要提高 `template_version` 并保留历史示例的原始生成提示词；当前版本的示例必须能由对应模板和变量准确还原。不要把设计预览图冒充成经过独立验证的多个示例。文本与图片各自的许可记录在 `source` 中，当前样例尚未指定独立许可。

新增用途、画风或模型时先在 `taxonomy.json` 添加稳定 ID、中文名称及别名，再在条目里引用。网页筛选项与 MCP facets 都从词表构建，不需要修改页面或工具契约。模型适用性必须引用模型词表，并按真实证据填写 `verified`、`declared`、`unknown` 或 `incompatible`，不能从生成工具名称推断底层模型支持。归档时设置 `status: archived`，可填 `archive_note`；`related_ids` 中的替代项必须为当前已发布条目。

基础流程对应 [Issue #2](https://github.com/sawaki-zexi/anime-img-gen-prompts/issues/2)，多用途画廊对应 [Issue #3](https://github.com/sawaki-zexi/anime-img-gen-prompts/issues/3)；完整产品约束见 [开发规格](docs/specs/anime-prompt-library-v1.md) 与 [实施拆分](docs/plans/v1-implementation.md)。

生产部署、同一安装读取更新、失败发布回退、日志隐私和受控性能步骤见 [发布、更新与回退](docs/release.md)。自动测试同时覆盖两代 MCP 协议、限流与失败、已连接客户端切换和坏快照回退、千条唯一图片 URL 的真实 Chrome 资源请求；实际公开安装、平台权限、生图成功和第三方目录状态分别记录，不由测试代替。
