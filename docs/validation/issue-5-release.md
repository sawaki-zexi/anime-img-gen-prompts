# Issue #5 发布验收记录

> 历史七条种子内容与插件0.1.1的验收记录：下列数字和证据按当时事实保留。当前内容已按用户要求改为用户提供原文与配图，见 [本轮内容替换记录](content-replacement.md)；本文不代表当前快照或0.1.2已通过同样验收。

更新：2026-11-10。公开实验版已经上线；插件 0.1.1，七条正式内容。桌面端干净安装与跨项目验收仍未完成，因此目前不能声明规格 v0.4 的全部发布门槛均已满足。客户端标记保持实验或未验证，官方公共目录未上架。

## 生产入口与版本

- [公开画廊](https://anime-prompt-atelier.memorablestone1.chatgpt.site/) · [插件接入与下载](https://anime-prompt-atelier.memorablestone1.chatgpt.site/install/)。
- [匿名 Streamable HTTP MCP](https://anime-prompt-atelier.memorablestone1.chatgpt.site/api/mcp) · [健康检查](https://anime-prompt-atelier.memorablestone1.chatgpt.site/health) · [版本与资源摘要](https://anime-prompt-atelier.memorablestone1.chatgpt.site/release.json)。
- 当前内容 revision：`sha256:3659a777dc61c781dc5be27ed089775b64ee48ddd534ef3fb0cb792d0163310c`，正式条目 7；未发布千条夹具。
- 插件 0.1.1 ZIP：8114 字节，SHA-256 `2ad6726d589a6a85a39fece7f7598a40bb82e7831daed7fb3c465a5b0e1cdb32`。匿名下载 200，字节摘要与 manifest、生成 marketplace 和实际安装缓存一致。
- 长期分发分支 `plugin-release`，插件内容提交 `684871bf66025ab411142d9aafbeca8de33ba768`。此分支是发布渠道，不作为功能分支清理。

所有公开验证都未发送 cookie 或 Authorization，未启动本地内容服务。Sites 未启用平台内置 MCP capability；本库使用普通公开 HTTP 路径 `/api/mcp`，没有生成另一个平台私有插件。

## 实际验收

| 范围 | 结果与证据 | 边界 |
| --- | --- | --- |
| 同快照发布 | 画廊、健康、两代协议 search/get/render、分发 manifest 与 ZIP 构建记录均为当前 revision；[端点](evidence/issue-5-public-endpoint.json)、[下载](evidence/issue-5-download.json)、[平台发布](evidence/issue-5-site-publication.json) | 构建与实际部署分别留证，未以期望 URL 代替访问 |
| 运行保护 | 真实外来源请求 403、131073 字节请求 413、动态响应 no-store；单元覆盖限流/错位窗口 Retry-After/容量/503/敏感信息不入日志 | 限流逐实例或 isolate；平台保留期限未由连接显示 |
| 公开 Git 安装 | CLI 0.165.0，0.1.1 在新用户配置中从真实 Git 分支安装；两个无关项目均发现用户级 Skill，宿主读取正文，连接三个远程工具，八个文件逐字节匹配；[安装记录](evidence/issue-5-production-install.json) | 未复制内容仓库、未运行本地服务；不以工具发现证明完整自动调用 |
| 无需重装与回退 | 同一 0.1.0 安装先无新 ID，更新后检索/读取/默认渲染新 ID，实际回退旧 Site version 后消失，恢复新版后重新出现；八文件及配置哈希全程相同；[四阶段记录](evidence/issue-5-installed-update.json) | 这是实际公开部署测试；内存 fixture 另由自动化覆盖，二者不混用 |
| 新会话实际创作 | 原 0.1.0 安装、两个无关项目的新会话，未点名库的头像/壁纸请求均 search→get→render，保留用户变量并原样交付正文；头像实际选中新增 ID；[模型烟测](evidence/issue-5-production-model-smoke.json) | 2/2 生产烟测，不替代 [Issue #4 全组评测](issue-4-plugin.md)；Skill 命令读取仍被宿主策略拒绝，保持实验 |
| 实际生图交接 | 从真实公开 MCP 渲染 mint-watercolor-avatar，将返回正文原样交给内置 image_gen，工具成功生成新 PNG；[完整输入与图像摘要](evidence/issue-5-image-handoff.json) | 未调用付费 API 或批量生成；底层模型、版本与种子未知 |
| 真实图文更新 | 新条目 windchime-librarian-avatar 明确为主体变体，独立生成新图，没有复用旧图；默认值精确重现实际工具输入 | 不把变体宣称为新的独立画风 |
| 浏览器 | 真实公开首页 1280px、接入/新详情 360px：图片加载、有效下载/命令、无页面横溢或运行异常；展开生成记录后来源卡宽度/内容宽度均 324px；[实测](evidence/issue-5-browser.json) | 本地/CI 另有键盘、分享、分页、复制及归档检查 |
| 千条资源请求 | 1000 唯一图片 URL、禁浏览器缓存：首屏 6 个图片、0 正文，复制一次后 1 正文，每页 5 卡 | fixture 明确复用真实像素，只用于隔离验收，不进入正式内容 |
| 千条并发性能 | 2 CPU/2 GiB、20 并发、预热 15 秒后连续 300.121 秒，24570 次、0 错误，服务处理 p95 34.019ms；[最终报告](evidence/issue-5-performance-final.json) | 受控 Node 同 Fetch 运行时测试；不代表托管生产硬件或公网延迟 |
| 桌面端/目录 | 桌面端尚未实际安装验证；官方目录未提交、未上架 | 不用 CLI、协议连接或源码存在冒充通过 |

## 受控性能环境

[实际 GitHub 运行](https://github.com/sawaki-zexi/anime-img-gen-prompts/actions/runs/42754071926)，源码 `38e19f66b2497ec80eab03994377095ab7ccc658`。Linux x64、Node v24.22.2，宿主可见 4 个逻辑 CPU，但容器实际 `cpu.max=200000 100000`、`memory.max=2147483648`；Docker NanoCpus=2000000000、Memory/MemorySwap=2147483648、network=none。服务与 20 个官方 SDK 客户端在同一 Node 进程、同一资源限制内，峰值 RSS 281329664 字节。

| 工具 | 样本 | 服务处理 p95/ms |
| --- | ---: | ---: |
| search_prompts | 8194 | 35.572 |
| get_prompt | 8190 | 0.779 |
| render_prompt | 8186 | 0.689 |
| 合计 | 24570 | 34.019 |

计时从 Fetch handler 入口（Node 已缓冲受限请求体）到响应构造结束，含策略、解析、校验及核心处理，不含网络传输或客户端校验。单机端到端 p95 452.888ms 单独保留，未冒充 34.019ms。压测显式提高限流阈值以测处理性能；生产默认限制见发布说明。受控报告的 schema、SDK 版本、fixture 来源、每个工具分布及错误计数均保留。

本机 Windows Docker daemon 未能就绪，已停止本次自行启动的进程，没有变更系统/WSL 配置；没有用 32 CPU 宿主的 3 秒烟测充当验收。较早六条来源的受控运行也通过，独立保存在 [首轮报告](evidence/issue-5-performance.json)，最终结论使用上面的七条来源报告。之后的改动仅为文档、浏览器验收助手和来源卡换行，服务/检索及压测实现未变。

## 实际平台版本与回退

- Site ID：`appgprj_6af28af93d9081918cccb09ace648204`，访问模式 public，使用原有已连接账户及平台额度，未创建额外付费账户或启用付费升级。
- 当前保存版本 4：`appgprj_6af28af93d9081918cccb09ace648204~appgver_3a53d9ce1b448191bc6bbfd6ce7d07c7`，部署 `appgdep_6af29c424e9c8191986a7207b81c5a6a` 已 succeeded。
- 平台源码提交 `137e9f539a778ccb935036966a557354c3128a53` 保存自包含 Worker，与 GitHub 实现 `a16cccb9e9b56276acf2a50fa6ea25068f695363` 的冻结产物一致；Worker SHA-256 `1d856c5b1ffface89f6dbef3643d439c441b6a0664f96be91b7a1fb1c099aea9`。
- 实测回退目标为保留版本 2：`appgprj_6af28af93d9081918cccb09ace648204~appgver_ff12faf856788191a33b898a24ac8002`，六条 revision `sha256:d419ce74d5f54b2e1d893cc02f31b42ecaff5daa9dda1b6151eec68169397831`。

保存版本、原始 archive、源码提交与摘要分别记录，不重新生成 Site。完整的更新、回退与恢复 deployment ID 见平台发布 JSON。`release:verify` 离线核对冻结 Worker/manifest/快照，线上则核对无认证健康、画廊、真实工具与下载。无公开内容写入接口。

应用日志只保留规定字段，不持久化客户端地址、提示词、变量、正文或认证。平台具体额度、日志保留期限与生产 isolate 资源并未由本连接提供，未标为已配置或等同于压测资源。实测生产响应记录的 `app;dur=0.000` 不作为精确 CPU 或公网耗时结论；受控 Node 报告单独计时。

## 自动化与剩余门槛

七条正式内容通过 67 项检查（62 单元/契约、1 静态一致性、4 真实 Chrome），类型检查零错误、警告和提示。Git marketplace 的换行回归使用真实 `core.autocrlf=true` 克隆：保留生成的 `.gitattributes` 时八文件字节/哈希相同，移除保护后明确复现失败，没有放宽校验。

浏览器助手等待本次目标文档及模块就绪，启动只等待一次且最多 30 秒，错误保留诊断并清理；没有通过自动重试断言掩盖失败。Windows 本机动态端口范围 1024–15000 涵盖 Fetch 禁端口，MCP 测试只在操作系统分配到已知禁端口时有界重新申请，实际工具调用和断言不重试。

[PR #9 当前检查](https://github.com/sawaki-zexi/anime-img-gen-prompts/pull/9/checks)须对应最终提交；旧 head 的失败与通过均保留，不将缺失、失败或尚未运行的检查标为成功。桌面端干净安装与跨项目验收仍是未完成的规格门槛，官方目录状态也保持未上架。相关操作说明见 [发布与回退](../release.md)。
