# 插件安装与验证

已发布的 **0.1.2** 插件保持原包、ZIP和历史证据不变。当前源码插件 **0.2.0** 新增按实际格式、使用方式和附加项声明组合的 Skill 指导；旧包仍可按原三工具参数读取，新指导需安装新版本。仅内容更新仍无需重装。仅在选中参考图方式并实际生图前确认用户参考图；纯检索/复制可先交提示词，效果配图不替代用户角色。当前正式内容仍为三组用户原文与配图；实际发布/下载以 [画廊接入页](https://anime-prompt-atelier.memorablestone1.chatgpt.site/install/) 为准，新契约见 [用法与组合](prompt-composition.md)。尚未进入官方公共目录，历史安装证据不能代替新版本实测。

在已安装 Codex CLI 的电脑中运行：

```sh
codex plugin marketplace add sawaki-zexi/anime-img-gen-prompts --ref plugin-release
codex plugin add anime-prompt-atelier@anime-atelier-plugins
```

安装后开启新会话，在其他项目描述动漫创作目标即可。下载的 ZIP 是可移植插件产物，能否直接导入取决于客户端；CLI 使用以上经过验证的 marketplace 步骤。`plugin-release` 是长期分发分支，不随功能 PR 的分支清理而删除。

普通用户从已验证分发源安装后开启新会话。库的用途可以扩展，当前三条角色重绘模板在实际生成前需要原角色参考图；仅查找或复制无需先交图，效果配图不自动充当角色参考。不要求Node.js、Python、本地服务、内容仓库副本或生图API Key。插件不生图；有宿主工具时逐字交接渲染结果，无工具时交付完整提示词。

## 当前客户端状态

| 客户端 | 本插件实测状态 | 边界 |
| --- | --- | --- |
| Codex CLI 0.165.0 / Windows | 公开服务实验；0.1.1 远程 Git 安装、两项目发现和三工具连接通过；旧 0.1.0 安装无需重装即可查新增内容 | 生产两场景烟测通过；完整受控评测见 [Issue #4](validation/issue-4-plugin.md)。宿主仍拒绝命令读取 Skill，不能标记完整支持 |
| Codex 桌面端 | 尚未验证 | 不能用 CLI 结果替代桌面端干净安装与跨项目测试 |
| ChatGPT 网页、桌面、移动端 | 尚未验证，本插件未进入公共目录 | 不承诺本地 marketplace 在所有界面都能安装 |
| Codex IDE 扩展 | 官方当前不支持插件 | 如单独配置 MCP，仍不等于本插件 Skill 发现 |
| 其他标准 MCP 客户端 | 仅协议接入已验证 | Skill 分发与自动发现须分别实测 |

2026-11-10 核对的 [官方客户端支持说明](https://learn.chatgpt.com/docs/plugins) 表明支持的界面安装后可为新会话提供 Skill 与工具，CLI 安装后应启动新会话；本地 marketplace 的桌面发现可能还需重启。源码/本地 marketplace 分发与公共目录审核是两件事；[官方打包文档](https://developers.openai.com/plugins/build/plugins) 说明了二者的区别。

## 维护者：可复现的包与安装探针

以下命令用于开发和验证，不是普通用户安装步骤。先按 README 安装本项目依赖。

`plugin/config.json` 是身份、版本和连接名称的单一来源；`plugin/skills/anime-prompt-atelier/SKILL.md` 是短任务指令。服务 URL 和画廊 URL 必须显式传入，没有隐藏默认生产地址。构建时把简短的服务失败说明、实际画廊 URL 与“普通创作回退不得冒充库模板”写入 Skill 描述，正文入口使用同一地址；即使连接失败或正文无法读取，发现元信息仍提供回退入口。校验器分别检查描述与正文地址，安装探针也核对宿主实际返回的描述。构建生成：

```text
<out>/
  anime-prompt-atelier-<version>[-evaluation].zip
  build-report.json
  marketplace/
    .gitattributes
    .agents/plugins/marketplace.json
    plugins/anime-prompt-atelier/
      plugin.json
      mcp.json
      .codex-plugin/plugin.json
      .mcp.json
      skills/anime-prompt-atelier/{SKILL.md,agents/openai.yaml}
      assets/icon.svg
      build-info.json
```

ZIP 以插件根目录打包；marketplace 路径相对 marketplace 根目录。文件排序、ZIP 时间戳与字节固定，Skill 与 SVG 输入显式规范化为 LF，同一配置得到同一 SHA-256。生成的 marketplace 根包含 `.gitattributes`（`* -text`），复制发布时必须保留隐藏文件；真实 `core.autocrlf=true` Git 克隆已核对全部插件字节一致，不靠放宽哈希校验兼容换行转换。此属性文件位于 marketplace 根，ZIP 仍只有原八个审核文件。包内不包含提示词库正文、示例图、运行时、hooks、后台进程或密钥；内容由远程服务按需返回。输出目录必须尚不存在，脚本不会覆盖已有文件。

发布构建使用默认 release 模式：必须给出公开 HTTPS URL，拒绝回环、私网、保留示例域名、凭据、查询与片段；还会实际验证远程三工具、画廊及健康检查的内容修订一致，失败则不生成发布包。包的 `catalog_revision_at_build` 和 `release-preflight.json` 记录构建时的真实服务版本；后续查询仍使用远程当前内容。不要把测试包改名后发布。首次服务如何先上线、再生成 ZIP，以及同安装更新与回退步骤见 [发布说明](release.md)。

```powershell
# 仅在真实托管服务与画廊已经存在时；这两项由发布任务提供。
npm run plugin:build -- --mcp-url $env:ANIME_MCP_URL --gallery-url $env:ANIME_GALLERY_URL --out artifacts/release-candidate
```

明确的本地测试允许回环地址；该产物记录 `mode: evaluation`，ZIP 名称带 `-evaluation`，不能当作公开安装入口：

```powershell
npm run plugin:build -- --evaluation --mcp-url http://127.0.0.1:3333/mcp --gallery-url http://127.0.0.1:5173/ --out artifacts/plugin-evaluation
npm run plugin:validate -- --root artifacts/plugin-evaluation/marketplace/plugins/anime-prompt-atelier
npm run plugin:probe -- --package artifacts/plugin-evaluation --state artifacts/plugin-install-check
```

`plugin:validate` 离线使用仓库保存的官方 1.0.0 JSON Schema，检查所有文件引用、身份、传输、地址、依赖与隐式发现声明。固定的 [MCP Schema](https://agent-plugins.org/schemas/1.0.0/mcp.schema.json) 当前禁止 server `extensions`，而 OpenAI 打包文档介绍了其中的 `auth` 扩展；本包优先遵循实际 Schema，匿名连接只声明 URL，不发送认证头。兼容 `.mcp.json` 使用 Codex 的 `type: http`，可移植 `mcp.json` 使用 `type: streamable-http`，二者来自相同配置，不能只改文件名。

`plugin:probe` 使用现有 CLI，创建专用配置和两个项目，实际执行 `plugin marketplace add`、`plugin add`、`plugin list`，再由官方 app-server 的 `initialize`、`skills/list`、`fs/readFile` 核对用户级 Skill 的真实路径与正文哈希，并查询 `mcpServerStatus/list`。有可用服务时记录三个工具的真实发现；服务未运行时明确记录工具未连接。报告写入指定独立目录，不读取或复制用户认证，不改现有用户配置或插件缓存。子进程只使用专用 `CODEX_HOME`，移除父桌面聊天的工具路由和会话身份，保留权限限制。可用 `--codex <原生可执行文件或codex.js>` 指定已安装 CLI；不安装或升级 CLI。

真实验证过的本地 CLI 安装动作是将**生成产物的 marketplace 根目录**传给 `codex plugin marketplace add`，再执行 `codex plugin add anime-prompt-atelier@anime-atelier-plugins`；安装探针已代为运行这两个动作。这是维护者测试路径。公开 Git 分发计划使用 `plugin-release` 独立 ref；只有实际发布并验证后安装页才列出它，不要把内容仓库根目录当 marketplace。

官方 Skill 校验也已执行；Windows 中文环境使用 `python -X utf8 <skill-creator目录>/scripts/quick_validate.py <Skill目录>`，不修改用户 Python 设置。该工具验证格式，不能代替实际行为评测。[Skill 编写说明](https://developers.openai.com/plugins/build/skills)

## 维护者：两个项目的新会话评测

固定数据在 `evals/plugin-cases.json`：12 条未点名正向请求、6 条反向请求、缺变量/无图工具/无匹配/服务不可用 4 条回退，以及人物、风景、贴纸 3 条图像工具交接探针。交接探针只记录输入，没有实际生图，也不调用付费 API。

先选择一个**仓库之外、尚不存在**的独立目录，确保两个项目没有提示词仓库副本或项目级 Skill 配置：

```powershell
$pluginEvalDirectory = Join-Path $env:TEMP ('anime-plugin-eval-' + [guid]::NewGuid())
npm run plugin:eval -- --state $pluginEvalDirectory --prepare --gallery-url http://127.0.0.1:5173/
# 在生成的 installation/codex-home 中使用测试帐号认证。脚本不复制现有用户凭据。
npm run plugin:eval -- --state $pluginEvalDirectory --run --case p01-avatar
# 单条烟测核对后，在同一个已安装用户配置里运行全套；不会逐条重装。
npm run plugin:eval -- --state $pluginEvalDirectory --run
```

prepare 使用动态回环端口、记录一次安装及内容快照，退出时释放服务；run 恢复同一端口与内容快照。每条调用使用同一个隔离用户配置、两个不相关项目中的全新 `--ephemeral` 会话、`read-only` 权限与 `never` 审批，不指定或替换模型。所有模型会话均显式 `--disable image_generation`，形成受控的无原生生图 fixture；只有 handoff-probe case 会加入不生图的记录工具。原生生图不完整呈现在 CLI MCP JSONL 中，不能单凭缺少 MCP 图片事件判断它从未运行。报告记录这组实际能力，正向任务原文交付断言仅用于此受控 fixture。默认模型名称取自同配置的真实 CLI 输出 header，不从缓存或模型自述猜测。全部服务与子进程在结束和失败时释放；本脚本不改原有用户环境。

每次运行生成新 `runs/run-NNNN/`，保留 JSONL、stderr、实际默认模型 header、CLI/系统/插件/包/内容版本与报告。判定只看实际 `mcp_tool_call` 参数和返回值：搜索候选 → 真实 ID 详情 → 当前修订渲染；原话声称“已查库”不算证据。无图工具需完整原样交付渲染结果；交接探针需收到同一正文，不能发送不支持的负面或参数字段。stderr 的工具失败和 Skill 读取限制单列为宿主限制，结构通过不等于完整支持。语义、回退原因和来源准确性仍需人工阅读，报告默认 `manual_review: pending`。

服务不可用的探索运行中曾观察到宿主在工具发现前进行了 6 次 HTTP 503 初始化请求；这属于宿主连接层行为，不能当作 Agent 主动重试次数。Skill 的“最多一次可重试请求”约束模型主动重试，不通过放宽宿主权限、篡改请求计数或仅看结构通过来认定回退成功；最终回答仍须说明服务不可用并给出实际画廊入口。

门槛是至少 10/12 条正向未点名请求触发检索，所有检索路径均使用真实 ID；反向任务保持原目标，三用途组完成提示词交付/交接，失败回退准确。即使达到模型触发门槛，有未解决宿主限制的客户端仍标实验。干净环境公开安装、真实生图工具成功交接、官方目录与生产端点由 Issue #5 分别验收。

CI 的 `npm run check` 只验证结构、可复现包、引用、URL、契约和判定器，不依赖用户认证，不把模型评测标成自动通过。
