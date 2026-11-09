# Anime Prompt Atelier · 动漫灵感工坊

看图片，找到动漫风格提示词，填入自己的主角，再复制到图像生成工具。

目前有一条完整、可运行的真实样例：**画师的夏日晴空**。它的原始提示词、实际生成图、变量与已知生成条件共同保存在仓库中；未知的底层模型、版本和参数如实保留为未知。后续的多用途内容、插件安装和公开托管分别由 [Issue #3](https://github.com/sawaki-zexi/anime-img-gen-prompts/issues/3)、[Issue #4](https://github.com/sawaki-zexi/anime-img-gen-prompts/issues/4)、[Issue #5](https://github.com/sawaki-zexi/anime-img-gen-prompts/issues/5) 推进。

## 本地运行

使用 Node.js **24.15 或更新的 24.x LTS** 与 npm。仓库提交了锁文件。

```sh
npm ci
npm run dev
```

打开 <http://127.0.0.1:5173/>。详情页为 `/prompts/summer-anime-illustrator/`。如端口被占用，可运行 `npm run dev -- --port 5174`；页面内链接和图片使用同源路径。

在另一个终端启动真实 Streamable HTTP MCP 服务：

```sh
npm run dev:mcp
```

工具端点为 `http://127.0.0.1:3333/mcp`，健康检查为 `http://127.0.0.1:3333/health`。这是开发用本地服务，默认仅监听回环地址，并校验 Host 和 Origin。公开 HTTPS 托管及部署配置属于后续发布任务。

常用命令：

| 命令 | 用途 |
| --- | --- |
| `npm run content:build` | 校验 Markdown、元信息、词表、变量、图片和生成记录，生成共享快照 |
| `npm run dev` | 先构建内容，再启动画廊开发服务器 |
| `npm run dev:mcp` | 先构建内容，再启动 MCP |
| `npm run build` | 构建内容与静态站点到 `dist/` |
| `npm run preview` | 在 5173 端口预览已构建站点；先停止占用该端口的开发服务器 |
| `npm run start:mcp` | 从已经生成的快照启动 MCP，不重新构建内容 |
| `npm run typecheck` | Astro 与 TypeScript 类型检查 |
| `npm test` | 内容、共享规则和真实 MCP HTTP 客户端测试 |
| `npm run test:site` | 构建站点，验证静态页面、公开 JSON 与真实 MCP 的一致性 |
| `npm run check` | 执行全部检查；CI 使用同一入口 |

维护内容后重新执行内容构建，并重启 MCP 以加载新快照。网页开发服务器会读取更新后的构建产物。`.env.example` 说明可配置项；构建脚本直接读取进程环境变量，**不会自动加载 `.env` 文件**。

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

实现使用官方 TypeScript SDK v2，支持 2026-07-28 协议与 SDK 的 2025 协议兼容路径。v2 客户端可设置 `versionNegotiation: { mode: 'auto' }`。在旧协议路径上，SDK 会把联合输出 Schema 与结构化结果投影到 `{ result: ... }` 包装中；文本内容仍提供业务结果 JSON。自动化同时验证了两条传输路径。普通 MCP 连接不等于已安装能跨项目自动发现的任务 Skill；插件接入会在后续任务提供。

## 内容与结构

```text
content/
  taxonomy.json                    用途、画风及中英文别名
  prompts/*.md                     每条独立的 YAML 元信息 + Markdown 正文
public/images/                     原图与实际缩略图
src/content/build.ts               校验、图片解码、稳定版本计算
src/lib/schema.ts                  共用数据及工具契约
src/lib/catalog.ts                 不依赖 Node 的确定性检索、读取、单次字面替换
src/pages/                         Astro 静态画廊与详情
src/server/                        Node Streamable HTTP MCP
tests/                             内容边界、真实传输与静态产物一致性
```

由同一内容构建生成 `generated/catalog.json` 与 `public/catalog.json`；后者会进入静态站点。产物不手工编辑、不提交，网页和 MCP 共同读取此快照。内容快照与条目修订均使用 SHA-256，包含正文、元信息与图片字节，构建不写入当前时间。同样内容与站点配置会得到同样修订号。

模板使用 `{subject}` 形式的占位符，只做一次字面替换；用户填写的花括号、换行、语言与 `$` 字符都保留，不执行表达式或递归展开。草稿与归档记录不进入公开快照。只有已发布且具有可解码真实示例图的条目才可公开读取。

新增条目时复制现有 Markdown 作为字段参考，分配稳定 ID，记录实际生成提示词、变量和来源。若更新模板，需要提高 `template_version` 并保留历史示例的原始生成提示词；当前版本的示例必须能由对应模板和变量准确还原。不要把设计预览图冒充成经过独立验证的多个示例。文本与图片各自的许可记录在 `source` 中，当前样例尚未指定独立许可。

本任务对应 [Issue #2](https://github.com/sawaki-zexi/anime-img-gen-prompts/issues/2)；完整产品约束见 [开发规格](docs/specs/anime-prompt-library-v1.md) 与 [实施拆分](docs/plans/v1-implementation.md)。
