# 用户指定内容替换记录

2026-11-10，依据规格0.5和用户明确要求，将此前助手添加的七条种子内容全部移出正式目录，改为用户提供的原文与配图；用户随后明确追加20cm棉花娃娃条目，当前共三条。本记录单独保存本轮事实，不改写历史 Issue #4、Issue #5、旧发行快照或历史验收报告。

当前仅收录以下三条：

| ID | 标题 | 原文 SHA-256 |
| --- | --- | --- |
| `rough-crayon-character-redraw` | 日系粗蜡笔角色涂鸦 | `4c598d1565c7f25ecee154546af76d07501b9eadfedc1f6faad5dc82f89c3820` |
| `vacant-chibi-avatar-redraw` | 天然呆大眼 Q 版头像 | `3073a2f51b981ce5140338475f468cbfaa153099e2bc09eb8dc08928fdfab109` |
| `cotton-doll-20cm-character-redraw` | 20cm 二次元棉花娃娃 | `296b291410828a16903d6a366d044c00561dfb659407ed47fb48c1718a7f059c` |

原文包括Markdown、空行和天然呆头像条目正文内的负面约束，未拆分或改写，`variables: {}`。内容导入和图片编码本身没有调用生图工具或模型，也没有触发付费API。前两张源PNG为1254×1254，对应缩略图480×480；新增棉花娃娃源PNG为1086×1448，对应等比缩略图360×480，保持完整竖图构图，未裁切为方图。三张整图均采用无损WebP，与源PNG解码的RGBA像素逐字节相同。原PNG前后字节相同，没有修改、移动或删除。公开 [哈希记录](evidence/content-replacement-hashes.json) 不含个人绝对路径。

来源记为用户提供，provenance 明确“用户提供配图，未独立复验生成条件”。生成工具未提供、模型为null、参数为空、生成日期为null，许可未声明。维护日期不代表生成日期。Schema只增加日期null兼容，不添加默认字段或改写旧快照中的已知日期字符串。

选中的模板要求参考图时（当前三条均要求），实际生成或重绘图片前必须取得用户参考图，缺少时先询问；未要求参考图的模板不增加此前提。仅检索、复制或准备提示词仍可先交全文，并说明选中模板要求的附图条件。收录效果配图不自动作为用户角色参考，不用示例人物替换用户角色。此要求出现在三条summary/conditions、网页和Skill描述/流程中；未增加参考图上传API。已发布0.1.2插件的八文件和ZIP保持原字节，本轮仅更新远程内容，复用不可变插件；历史发行与冻结产物保留。

已从正式目录删除以下ID各自的 `.md`、整图和缩略图：

- `summer-anime-illustrator`
- `mint-watercolor-avatar`
- `stargazer-character-sheet`
- `seaside-watercolor-station`
- `sleepy-cat-four-panel`
- `shiba-reaction-stickers`
- `windchime-librarian-avatar`

当前 `content/prompts/` 仅3个文件，`public/images/` 仅6个文件。新构建不保留旧JSON、旧详情或旧资产；旧ID在当前MCP中返回NOT_FOUND，不以归档继续展示。hero直接使用当前第一条配图，图注及卡片称“收录配图”，未知日期明确标记“生成日期未提供”。

测试与正式内容已解耦：`tests/fixtures/catalog-data.ts` 只包含六类新编写的测试合成模板和Sharp生成的几何像素，没有复制旧AI图片或完整旧提示词。多用途、变量、分页、模型适用性、负面、透明图、归档、空库、现代/legacy协议与错误断言继续保留；所有测试文件只在已登记清理的临时目录生成。生产site另验证真实三条一致性，Chrome另验证完整原文复制、参考图说明、未知日期和无旧内容。1000条浏览器数据仍是隔离合成数据，图片URL唯一并禁缓存。

第三条新增后的最终 `npm run check` 已通过 **69项：63 unit/契约/内容边界、1真实生产内容的静态与MCP一致性、5真实Chrome**，类型检查零错误、警告和提示。五项Chrome包括三条原文的360像素复制、未知日期/参考图说明、手机与桌面的完整配图contain及无横向溢出，以及独立合成数据的键盘、多页、变量、负面、归档、空库和千条资源验收。千条首屏为6个不同图片请求、0个正文，复制后正文请求1，每页5卡。旧冻结 `service-candidate-2` 的离线验证属于前次替换阶段的保留结果，本次没有修改冻结产物或重写其记录。

本次第三条新增还将卡片预览统一为正方形框内contain，详情按原生比例contain显示，手机与桌面均保留完整配图；hero仍是装饰背景。生产测试按各条证据中的实际宽高与缩略图宽高验证，不假定1254正方形或固定顺序，并检验棉花娃娃/毛绒娃娃/plush doll/cotton doll/20cm检索。

2026-11-10已在原公开站点完成实际发布，保持同一个Site和公开访问范围。[发布记录](evidence/content-replacement-publication.json)区分服务候选v6与正式分发v7：两者内容均为`sha256:9f3651c5d185e417a07cd0ff13b3c7151474ce0e6f25d948ad3f891e81db3530`，都来自代码提交`f3ccd29c2743e448c2eedafc7b0da6ad0ff2ddf8`。v7的托管源码提交为`c1c00d3ef825a47449fb322d40a0ee63383a293d`，实际部署状态为succeeded。此公开部署与PR合并分别记录，PR #9仍未合并。

[匿名HTTPS实测](evidence/content-replacement-live.json)通过legacy与2026-07-28两代协议的三个工具：正式集只有三条，读取及渲染原文逐字相同，未知日期为null，七个旧ID返回NOT_FOUND、28个旧页面/正文/图片地址返回404，三张公开整图与源PNG解码像素相同。v7[下载实测](evidence/content-replacement-download.json)确认在线manifest逐字段等于离线验证的正式分发产物，内容仍为相同三条；0.1.2 ZIP实际GET200且SHA为`4c144a36f9e81be4be1f82bca19a9404e233f88e100e9896567a8b3456400907`。包仍如实记录其旧构建内容版本91f4117a…，不将旧构建元信息冒充新快照；新发布只更新远程内容及网页，不重写已发同版本插件。

[公开Chrome记录](evidence/content-replacement-browser.json)验证1280与360像素页面、三个详情、三条完整原文的真实剪贴板复制、未知日期与参考立绘说明，展开来源后无横向溢出，控制台无错误。已检查实际桌面画廊及手机娃娃详情截图，头像、头饰、坐姿和脚部完整显示。卡片与详情使用contain，首页hero继续作为装饰背景裁切。

0.1.2已通过远程Git从`plugin-release`分支提交`44dead5160451786fecbf612c9a622c95185cd4a`实际安装；[干净安装记录](evidence/content-replacement-install-012.json)是在添加第三条之前收集，两个无关项目均发现同一用户级Skill、宿主实际读取技能正文并连接三个工具，八文件匹配发布摘要，没有本地内容仓库或服务。随后使用已有[0.1.1安装](evidence/content-replacement-existing-011.json)和[0.1.2安装](evidence/content-replacement-existing-012.json)的原连接配置，均实际检索、读取和渲染到当前三条原文，配置及全部八个已装文件前后不变，未重装。后一组是标准MCP调用证据，不冒充新的宿主模型评测。

[两会话CLI文本烟测](evidence/content-replacement-smoke-012.json)同样发生在第三条添加前，默认模型为gpt-6.1-sol：纯提示词请求自行检索并完整交付天然呆头像原文，没有要求先上传参考图；实际重绘但缺参考图的请求正确询问立绘、未捏造角色或已生成图片，但该会话的技能正文读取遭宿主自动审批拒绝，库内流程未完成。临时认证副本已移除，原认证和配置未变。没有调用生图工具。这两例不代替12例完整评测，也不验证棉花娃娃自动触发或桌面端完整创作；CLI仍标实验，桌面端尚未验证，未提交官方目录。

[本轮受控长测](https://github.com/sawaki-zexi/anime-img-gen-prompts/actions/runs/42788140621)对应代码提交f3ccd29…，独立[报告](evidence/content-replacement-performance.json)使用三条来源扩展的1000条合成数据，未公开这些合成内容。Linux Node24.22.2、Docker实际cgroup为2 CPU/2 GiB，20并发、15秒预热、连续300.510秒，18595调用、0错误；服务处理p95为45.503ms，搜索p95为47.037ms。客户端与服务端同进程、同资源预算，单机端到端p95另记599.273ms，不能将两种计时混用。旧两条/七条报告继续保留为历史，不能替代本轮数据。

本机首次发布打包在原Node24.15.0的Astro子进程以3221226505退出，未留下可发布输出；改用应用已有Node24.22.1后，两份不可变产物均构建并离线验证通过，未改系统配置。真实0.1.2旧包复用的最高层分发构建也通过：严格校验端点、版本、ZIP与八文件摘要，旧build-info与自身report相符，当前HTTPS preflight与本次三条快照相符。
