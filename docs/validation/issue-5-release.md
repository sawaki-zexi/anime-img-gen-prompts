# Issue #5 发布验收记录

更新：2026-11-10。此记录区分实现、隔离验收和实际公开发布。不能用候选构建、单元测试或模型自述替代外部可达性、真实安装、目录审核或生图成功。

| 验收项 | 当前证据 | 尚需实际记录 |
| --- | --- | --- |
| 同快照画廊/MCP/分发 | 两阶段不可变构建，Worker 内嵌同一次生成的画廊、真实图片、按需正文、MCP 和版本 manifest；release 插件生产 preflight 比较画廊/健康/工具 revision | Site saved/deployed version、匿名公开 HTTPS 响应、第二阶段 ZIP/marketplace 实际安装 |
| 运行保护 | Host/Origin、128KiB 流式请求体、结构化输入限制、逐实例频率/容量限制及 Retry-After、no-store、白名单日志、503 失败/回退自动验证 | 平台实际公开路径与日志保留设置；isolate 限流不冒充跨地区全局配额 |
| 更新无需重装 | 同一个已连接标准 MCP 客户端在隔离夹具中读取新增 ID；坏摘要切换失败且保持原版本，恢复旧快照后旧内容可查 | 原有实际安装插件跨真实公开部署更新读取新增正式条目的记录；夹具不公开 |
| 千条画廊 | Chrome 1440×950、1000 唯一图片 URL、禁浏览器缓存：首屏 6 个不同图片请求，初始正文 0，复制一次后正文 1，翻页仍 5 卡 | 移动与键盘等原有检查继续列入全 check |
| 受控服务性能 | 20 并发官方 SDK、1000 隔离数据、15 秒预热/300 秒测量脚本和 Docker/GitHub workflow 已准备；cgroup 不符合2CPU2GiB即拒绝验收 | 真实 Linux 容器报告、工具 p95、零错误、Docker/cgroup 证据及运行链接 |
| 客户端与图像交接 | 既有 [Issue #4 实测](issue-4-plugin.md) 仍有效：CLI 实验、两项目发现和记录工具交接；没有把记录探针当生图 | 新生产入口下干净公开安装/两项目新会话结果；实际图像工具成功另记，未授权付费不执行 |
| 生产权限/预算 | 配置保留已有 Site ID 与期望来源，不注册第二个 Site、不自动开启计费；授权持有者使用原连接发布 | 公开访问模式、实际平台版本/URL、现有账户预算落实或平台限制 |

本地短烟测仅验证脚本可运行：Windows 10.0.26200、Node v24.15.0、AMD Ryzen 9 7945HX、32 个可见逻辑 CPU，20 个客户端、预热1秒后3.082秒，259 个样本，0 错误。该机没有有效 cgroup 限额，报告明确是 `not-an-acceptance-run`，**不计为 2CPU/2GiB/五分钟性能达标**。当前没有受控长测结果可填。

首份生产来源 service candidate 的内容 revision 为 `sha256:d419ce74d5f54b2e1d893cc02f31b42ecaff5daa9dda1b6151eec68169397831`，6 条正式内容。具体 Worker SHA 和 manifest SHA 位于该不可变目录的 `build-receipt.json`；源码未把临时机器路径当生产入口。

公开目标：画廊 `https://anime-prompt-atelier.memorablestone1.chatgpt.site/`、MCP `/api/mcp`、健康 `/health`、版本 `/release.json`。这组地址在实际部署和无 cookie 验证前只表示目标。第一阶段安装页无下载/marketplace 链接；第二阶段只接受通过真实生产 preflight 且与快照一致的 release 产物。客户端与官方目录仍保留实验/未验证/未上架状态。

实现和操作步骤见 [发布、更新与回退](../release.md)。外部发布证据补齐时应逐项更新本记录，附真实结果与未通过项，不把“工作流已准备”改写为“已通过”。
