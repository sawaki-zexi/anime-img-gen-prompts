# Issue #4 插件验证记录

更新：2026-11-10。以下记录 Issue #4 交付时的插件 **0.1.0 本地实验**；当时尚无生产发布或官方目录上架。后续公开 0.1.1、真实更新及生图交接见 [Issue #5 发布记录](issue-5-release.md)。安装、协议、模型选择和实际生图分别记录。

| 层次 | 实际结果 |
| --- | --- |
| Skill 格式 | 官方 skill-creator `quick_validate.py` 的 UTF-8 校验通过；自动选择启用 |
| 包 | 官方 1.0.0 Schema、引用、地址、依赖、哈希校验通过；真实 LF/CRLF 源码副本构建出相同 ZIP，Windows 原生 ZIP 读取通过 |
| CLI 安装 | Windows 10.0.26200 / Codex CLI 0.165.0，专用配置中真实 marketplace add、plugin add、plugin list、缓存检查通过 |
| 两项目发现 | 一次用户级安装；仓库外的短片笔记、家庭预算项目均发现同一 Skill，`scope=user`、`enabled=true`、无发现错误 |
| 正文与连接 | app-server `fs/readFile` 的正文哈希与缓存一致；真实 Streamable HTTP 发现 search/get/render 三工具；最终规范化包另做隔离安装与连接复验，通过 |
| 自动化 | `npm run check` 通过 57 项（53 单元/契约/资源失败回归、1 静态一致性、3 真实 Chrome），类型检查零错误、警告和提示；[PR 检查](https://github.com/sawaki-zexi/anime-img-gen-prompts/pull/8/checks) |
| 页面 | 1280px 桌面、360px 手机、键盘进入/返回、明暗主题持久化通过，无横向溢出或运行时异常 |
| 宿主限制 | 模型会话中的命令读取 Skill 被自动策略拒绝，返回 `blocked by policy`；app-server 读取成功。未放宽只读权限，客户端仍标实验 |
| 公开发布 | 桌面端干净安装、生产地址、公开分发、官方目录与真实生图交接属于 [Issue #5](https://github.com/sawaki-zexi/anime-img-gen-prompts/issues/5)，本记录不替代这些验收 |

## 两项目的真实模型评测

固定请求见 [25 条评测数据](../../evals/plugin-cases.json)。最终一组使用同一次隔离安装，25 个不同的新会话分布在两个无关项目；CLI 均正常退出。实际默认模型为 **gpt-6.1-sol**，取自同配置的 CLI header，未指定或替换模型。内容版本为 `sha256:4b6686cfc70c5d39bb168182e8d90d6f7f42369fca7c3fc1437fe4b598f3d1a9`。

所有模型会话显式 `--disable image_generation`；普通场景没有生图工具，三个交接场景仅增加记录工具。该组没有生成图片。原始 JSONL、stderr、header 和人工核对记录保留在独立测试目录，未写入仓库或插件包。

| 场景 | 人工核对结果 |
| --- | --- |
| 12 条未点名正向请求 | **11/12 调用检索，10/12 完成真实详情、当前修订渲染和完整正文交付**，达到规格至少 10/12 触发的门槛；实际读取的 ID 全部存在，用户明确给出的变量文字保留 |
| 两条未完成库内交付 | `p04-character` 的两次关键词检索为空，明确交付非库内创作；`p07-wallpaper` 未触发检索。二者不计为完整流程通过，未伪造库内来源 |
| 6 条反向请求 | **6/6 未调用模板库**；代码、普通问答、写实摄影、原样返回、局部替换和其他画风均保持原目标 |
| 缺关键变量 | 先询问用户指定的主角信息，没有代选人物或渲染最终模板 |
| 无生图工具 | 完整原样交付渲染正文及真实来源，没有声称图片已生成 |
| 无匹配 | 返回零结果，不替换水下机甲城市主题，也不虚构来源 |
| 服务不可用 | 明确无法核实模板，给出配置中的画廊入口；额外备用提示词明确标为非库内模板。修复后单项及整组均复验通过 |
| 人物、场景、贴纸交接 | **3/3 真实记录工具接收成功**，输入与先前渲染正文完全一致，仅发送支持的 `prompt` 字段；最终说明 `image_generated: false`，未声称实际生图 |

实际读取覆盖全部六个公开 ID：`mint-watercolor-avatar`、`stargazer-character-sheet`、`seaside-watercolor-station`、`summer-anime-illustrator`、`sleepy-cat-four-panel`、`shiba-reaction-stickers`。这组结果证明本地受控环境中的可观察行为，不能保证未来每个请求必定触发。

故障场景观测到六次 HTTP 503，均发生在宿主 MCP 初始化阶段；模型没有可用库工具，不能将这些连接尝试统计为 Agent 主动重试。模型的工具链结构检查与人工语义核对分开记录，结构通过不自动代表完整客户端支持。

## 产物和验证边界

最终规范化测试 ZIP SHA-256 为 `9df8372befb8488acbffa59b427066c34a8fbd63e7c860db0ab8778b474da1be`。模型评测包为 `a69446df7ef5a238a879e2aabd87de9dc446e1afe1dda3c043d448bec754892e`；其 Skill、依赖、两种 manifest 和两种 MCP 配置与最终包逐字节相同，仅 SVG 换行及派生构建哈希不同。实际评测的 Skill SHA-256 为 `ab487391871fae022b59803b3ca187dd0cb37222e8933e5aa4dacbc1a8fa6f23`。换行规范化后另行验证了真实安装、正文读取及三个工具发现。

早期未关闭原生生图的探索运行曾产生三张测试图，保留在仓库外且未发布，不计入上述受控评测，也不作为精确交接的证明。CLI MCP JSONL 不完整呈现原生生图调用，因此不能仅凭没有 MCP 图片事件就断言未生图。

评测进程使用专用配置；原有用户配置和认证文件的前后哈希一致，测试所需的临时认证已移除。仓库脚本本身不读取或复制用户认证。可复现步骤与客户端支持边界见 [安装与评测说明](../plugin-installation.md)。
