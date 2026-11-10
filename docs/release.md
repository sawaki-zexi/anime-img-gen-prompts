# 发布、更新与回退

发布配置在 `release/production.json`，保留已创建的 Site `appgprj_6af28af93d9081918cccb09ace648204`。期望来源为 `https://anime-prompt-atelier.memorablestone1.chatgpt.site`，MCP 路径为 `/api/mcp`，健康检查为 `/health`。配置中的地址是发布目标；实际可达性、公开权限、平台版本及预算结果以 [验收记录](validation/issue-5-release.md) 为准。

普通用户只访问公开画廊或安装发布插件，不需要源码仓库、Node.js、本地 MCP、认证密钥或后台进程。以下命令仅供维护者使用。

## 两阶段发布

首次服务尚未存在时，不能跳过生产 preflight 制造可安装的 ZIP。先发布服务候选，再对真实服务生成分发产物。

```powershell
npm ci
npm run check
npm run release:build -- --out artifacts/releases/service-v1
npm run release:verify -- --dir artifacts/releases/service-v1
```

每个输出目录必须是新目录。构建使用隔离临时工作区；全部内容校验、Astro 构建与 Worker 打包成功后才以一次目录重命名形成产物。失败构建清理自己的临时目录，不覆盖已有版本，不切换生产服务。输出包含：

```text
service-v1/
  dist/server/index.js                自包含 Worker ESM，default.fetch(Request)
  dist/server/bundle-report.json      实际资源与包大小
  dist/.openai/hosting.json           同一个真实 Site 身份，无 static/capabilities
  snapshot/catalog.json              此次不可变内容快照，不随查询拉取 GitHub
  release-manifest.json               入口、内容版本、资源摘要、分发状态
  build-receipt.json                  Worker 与 manifest 摘要、真实 preflight 状态
```

`dist/server/index.js` 内嵌全部 HTML、脚本、CSS、12 张真实 WebP、按需正文与 manifest，不依赖运行时文件系统或独立本地服务。Sites 的 source helper 保存与部署这份 `dist`，来源源码与部署包必须对应同一候选。`.openai/hosting.json` 不使用 `static`，也不声明会占用保留 `/mcp` 路径的私有平台 MCP capability。保留 Astro；不改用其他框架。

先由持有 Site 权限的维护者发布并设置公开访问，使用无 cookie、无认证的请求检查首页、`/health`、`/release.json` 和 `/api/mcp` 的三个真实工具。若平台不能提供该匿名端点，停止分发，记录平台限制并调整托管方案。构建成功和私有部署成功均不能替代匿名公开验收。

第一份候选的 `stage` 是 `service-candidate`，`plugin: null`；安装页没有假 ZIP 或 Git 安装源。服务公开验证后再运行：

```powershell
npm run plugin:build -- --mcp-url https://anime-prompt-atelier.memorablestone1.chatgpt.site/api/mcp --gallery-url https://anime-prompt-atelier.memorablestone1.chatgpt.site/ --out artifacts/releases/plugin-v1
npm run release:build -- --out artifacts/releases/distribution-v1 --plugin-dir artifacts/releases/plugin-v1
```

默认 release 插件构建会实际连接远程服务，完成工具发现、搜索、详情、渲染，并比较画廊与健康检查的内容版本；失败不产出发布包。包只记录构建时版本，不固定返回旧内容，始终查询同一个远程当前快照。第二次 release 构建重新 preflight，要求 ZIP、插件元信息、服务与本次内容快照一致，拒绝 evaluation 包。

`distribution-v1` 将真实 ZIP 内嵌在 `/downloads/`，安装页提供下载与校验信息。只有维护者已经把**生成的 marketplace 根目录**实际发布到独立长期 ref 并完成隔离安装验证后，才能增加 `--marketplace-ref plugin-release` 再构建分发候选。该参数是已完成 Git 分发的记录，不会替维护者创建分支或发布，也不能当作已验证安装的证明。届时普通用户最短 CLI 步骤为：

```text
codex plugin marketplace add sawaki-zexi/anime-img-gen-prompts --ref plugin-release
codex plugin add anime-prompt-atelier@anime-atelier-plugins
```

安装后开启新会话。ZIP 导入方式依宿主而异，不承诺所有客户端接受相同格式。自有 Git marketplace 与官方公共目录是两种渠道；未获官方审核不标为上架。客户端仍按实际记录保留实验/未验证状态。

## 更新与受控切换

1. 在 `content/prompts/` 增加有真实来源的条目或修改现有内容，保留原 ID 和历史示例记录。衍生模板须明确关联原条目、图片复用事实与来源；默认变量必须重现记录中的实际提示词。
2. 为新版本构建新的 service candidate。比较旧、新 `catalog_revision`、模板数量与新增 ID；完成本地检查与候选 Worker 检查。合成数据只用于隔离验收，发布构建只读取正式内容目录。
3. 记录当前生产 Site version ID、旧产物目录及其 SHA-256。用 Sites 保存并部署新候选；等待平台终态，核对无认证 `/health` 与 `/release.json` 的 revision 和真实工具响应。
4. 原有插件指向固定 `/api/mcp`。保持同一已安装插件和用户配置，在新会话查询新增 ID；不重装插件。记录安装版本、原/新内容 revision、真实返回值和 Site version ID。仅在需要改 Skill 或连接配置时另行更新插件版本。
5. 同一旧游标遇到新版本必须返回 `INVALID_CURSOR`，旧模板修订必须返回 `REVISION_MISMATCH`；从第一页重新搜索并读取当前修订后重试，不悄悄混用版本。
6. 生产更新通过后，可用原插件版本重新构建对应新快照的 ZIP 和分发候选；同样记录构建时版本。不要把旧分发 manifest 冒充新快照。

代码中的 `createSnapshotStore` 是维护与测试的内存切换接口，没有公开 HTTP 写入端点。它先检查完整 Schema、内容摘要与站点来源，再替换活动快照的单一引用；失败保留旧快照。Node 进程启动也校验内容摘要；不自动运行内容脚本，不逐次查询仓库。

## 失败与回退

发布失败时保留当前可用版本；不要再次生成相同身份的 Site。若新版本已上线但健康、真实工具或静态页面验收失败：

1. 先用 `npm run release:verify -- --dir <旧产物目录>` 核对保留的 Worker、manifest 和快照摘要。使用此前记录的**旧 saved version ID 和对应原始 archive**，在同一个 Site 重新部署旧版本。若使用独立 Node 托管，停止新实例，从保留的旧 `snapshot/catalog.json` 启动旧配置，并由原有代理切回旧实例。
2. 等待平台部署成功；无认证读取 `/health`、首页 `<meta name="catalog-revision">`、`/release.json`，均须等于旧版本，再运行三工具 preflight。
3. 保持插件安装不变，重新搜索已知旧 ID 并渲染；保留坏候选的失败记录和摘要，不将其作为新用户安装入口。
4. 将公开安装页及分发 manifest 一起恢复为旧候选。不可缓存的动态响应立即反映服务版本；不带内容哈希的 HTML、图片与 JSON 使用 ETag 并要求重新验证，避免长期缓存旧内容。仅 `_astro/` 带哈希资源使用长期 immutable。

若远程暂不可用，用户仍可打开画廊复制正文。工具连接出现 `429 RATE_LIMITED` 时遵循 `Retry-After`；`503 UNAVAILABLE` 可重试一次，仍失败则说明原因并提供实际画廊入口。不可声称已经查到模板、已经更新、已经生成图片，也不能把普通创作回退冒充库内结果。静态详情与复制文档带版本，更新竞态会提示刷新。

## Node 运行配置与隐私

开发默认 `MCP_MODE=local`、`127.0.0.1:3333/mcp`。独立生产 Node 部署必须提供 `MCP_MODE=production`、完整 HTTPS `PUBLIC_ORIGIN`、同来源的 `MCP_CATALOG_FILE`，并通过可信代理终止 TLS。使用 `MCP_BIND_HOST=0.0.0.0` 只改变监听地址，不放宽 Host/Origin。Worker 使用发布时冻结的相同配置。

| 配置 | 默认/约束 |
| --- | --- |
| `MCP_PATH` | local `/mcp`，production `/api/mcp` |
| `MCP_MAX_BODY_BYTES` | 131072，最大 1 MiB；有无 Content-Length 都受限 |
| `MCP_RATE_LIMIT` | 每个客户端每个窗口 120 请求 |
| `MCP_GLOBAL_RATE_LIMIT` | 每个服务实例每个窗口 2400 请求 |
| `MCP_RATE_WINDOW_MS` | 60000 |
| `MCP_MAX_CLIENTS` | 最多 4096 个临时计数桶；容量耗尽返回 429 |

计数只存在内存并随窗口过期；Node 只用 socket 地址，不信任来访者伪造的 Forwarded/X-Forwarded-For；Worker 只用平台提供的 CF-Connecting-IP。原始地址不进入日志、不持久化。Worker 限流是**每 isolate 的保护**，不能当作跨地区全局配额；如实际负载需要更严格聚合限制，须另行配置托管平台能力并实测。

日志字段固定为 `request_id`、受控 `tool` 名称、`elapsed_ms`、`result_count`、`error_code`、`http_status`、`service_version`、`catalog_revision`。不记录 IP、URL 查询、变量、提示词、请求/响应正文、认证或堆栈。工具仍返回既有结构化业务失败；传输层清楚区分 403、413、429、503，后两者提供 Retry-After。配置错误直接停止启动或构建，不悄悄降级为开发服务。

## 规模验收

```powershell
# 仅短烟测，不等于目标资源验收
npm run benchmark -- --seconds 3 --warmup 1 --out artifacts/benchmark/smoke.json
# 有可用 Docker daemon 时，完整受控验收
docker build -f benchmarks/Dockerfile -t anime-prompt-benchmark .
docker run --rm --cpus=2 --memory=2g --memory-swap=2g --network=none --volume ${PWD}/artifacts/performance:/results anime-prompt-benchmark
```

先创建输出目录。完整验收要求 cgroup 实际 `cpu.max` 为 2 CPU、`memory.max` 为 2147483648；不满足即退出，不能把宿主配置当成受控资源。测试在同一个 Node 进程与同一容器里运行真实 HTTP 服务和 20 个官方 SDK 客户端，这两部分共同占用 2 CPU/2 GiB，报告如实披露。1000 条隔离合成记录只在进程内，不进入公开画廊；预热 15 秒后连续测量至少 300 秒。报告保存资源、Node/服务/协议/内容版本、时长、各工具样本与 p50/p95、错误、端到端耗时及精确计时定义。

当前计时是 Fetch handler 入口（Node 已缓冲受限请求体）至 SDK/核心处理与响应构造完成，包含策略、JSON 解析、Schema 校验和检索/详情/渲染，不含请求体/响应网络传输和客户端校验。各工具都必须有样本、p95 均不超过 300ms、错误为零。短时或未验证资源的运行显式写 `not-an-acceptance-run`。

本机 Docker daemon 不可用时，在现有 GitHub Linux runner 执行 `.github/workflows/performance.yml`：手动 dispatch，或显式修改 `benchmarks/run-request.json` 后推到 `main`/`codex/**`。普通代码变更不会运行 5 分钟压测。工作流记录 Docker image/container inspect 和 cgroup，上传独立 JSON artifact；[upload-artifact v7.0.2](https://github.com/actions/upload-artifact/releases/tag/v7.0.2) 已按官方版本核对。实际报告由维护者下载并纳入验收，不能把工作流存在当作已经通过。

`npm run check` 包含 1000 条真实 Chrome 验收：每个 fixture 图片 URL 唯一，关闭浏览器缓存，HTTP fixture 将它们映射到复用资产并计数，因此不会因共用 URL 掩盖全量图片回归。首屏图片与卡片页大小相关；正文按需请求。所有 fixture 服务、浏览器与进程在成功和失败时清理。
