# 提示词用法、组合与内容贡献

当前源码的三条用户原文均为参考图全文，`variables: {}`，没有附加槽位。页面只提示「在生图工具中添加你的角色图片，再粘贴下面的提示词」，提供完整复制。本站不接收图片。新增能力由隔离测试内容验证，不把演示模板加入正式目录。

## 可选内容声明

内容仍采用 schema 1；新字段均为可选，读取旧快照不补默认字段、不改变其摘要。旧条目缺省使用全文、直接使用、无扩展。需要角色参考图的作者必须明确声明，不能从模型名称推断。

| 字段 | 写法与约束 |
| --- | --- |
| `body_format` | `text` 或 `tags`；省略时 Markdown 正文为全文。正文为标签时填 `tags` |
| `tag_template` | 全文条目另行维护的真实标签变体；不能从用途、关键词或正文自动提取 |
| `negative_template` | 正文对应的独立负面文本，保留其格式；正文内原有负面约束不搬出 |
| `tag_negative_template` | 双格式条目的标签负面文本；必须同时维护 `tag_template` |
| `input_modes` | `reference-image`、`text` 或 `direct`。参考图和文字可同时声明；`direct` 只能单独声明；不能重复 |
| `character_variable` | 文字方式指向的已声明变量名，界面显示「角色描述」。声明 `text` 时必填 |
| `customization` | 只有作者明确开放时才显示、接受附加提示词；包含 `allow_custom` 和 `presets` |

只维护全文：省略 `body_format` 与 `tag_template`。只维护标签：`body_format: tags`，Markdown 正文直接保存可用标签，不再声明 `tag_template`。双格式：全文在正文，标签在 `tag_template`。每种格式的负面文本独立维护，不互相回退；没有对应负面文本就不返回负面字段。变量可只用于某一种格式，构建时对所有实际维护的正文和负面文本检查声明，渲染时只要求当前格式及其负面所需的必填项。

只有参考图：`input_modes: [reference-image]`。只有文字：`input_modes: [text]` 并声明 `character_variable`。两者都支持：`input_modes: [reference-image, text]`，页面才提供「你有角色图吗？」。直接使用：`input_modes: [direct]`，提示「复制即可使用」。数组第一项为省略参数时的方式；省略格式时使用正文格式。模型适用性与角色输入方式分别判断，不能把某个提供方固定成图片或文字。

使用同一正文支持参考图和文字时，作者应给角色变量一个适用于参考图的默认值，例如“附图中的角色”，同时允许用户填入文字描述。其他实际需要的变量照常填写；服务不以已上传图片作为检索或渲染前置条件。若两种方式需要根本不同的正文，应维护独立的相关条目。

以下为结构示意，仅用于说明贡献格式，不是新的正式收录请求：

```yaml
body_format: text
tag_template: 'test-only portrait, {subject}, framed composition'
negative_template: 'Avoid a blurred frame.'
tag_negative_template: 'blur, test-only negative'
input_modes: [reference-image, text]
character_variable: subject
variables:
  subject:
    label: 角色描述
    description: 需要保留的角色外观
    required: true
    default: 附图中的成年角色
    max_length: 2000
customization:
  allow_custom: true
  presets:
    - id: happy
      label: 开心
      group: expression
      values:
        text: 'Give the character a happy smile.'
        tags: 'happy smile'
    - id: angry
      label: 生气
      group: expression
      values:
        text: 'Give the character an angry expression.'
        tags: 'angry expression'
    - id: blush
      label: 脸红
      values:
        text: 'Add rosy cheeks.'
        tags: 'blush'
```

预设 ID 在同一条目中唯一且稳定，最多 32 项。`group` 可选，同组最多选一项；网页选择新项会替换旧项，服务遇到同组多项会拒绝。`values` 只声明真实维护的格式，每项非空、最多 2,000 个 Unicode 字符。未维护某格式值的预设不能用于该格式。预设值按字面加入，不展开其中的花括号。不同组可以组合，不调用模型推断任意语义冲突。

全文使用两个换行、标签使用逗号和空格作为附加项间隔；预设按作者声明顺序排列，自定义内容最后加入。自定义内容最多 2,000 个 Unicode 字符，保持换行、首尾空白、权重、`{braces}`、`$&` 和 Unicode；不翻译、重写或递归替换。完全空的附加请求是无操作。固定模板遇到非空附加项返回失败，不偷偷放开原有表情或其他约束。

示例、来源、图片、生成日期和模板修订继续按 README 的贡献规则维护。当前模板版本的示例必须由该正文和记录变量准确重现；未知生成日期为 `null`。原有用户正文和配图不能为演示这些能力而改写。

## 三工具请求

1. `search_prompts` 返回真实 `excerpt`、可选 `tag_excerpt` 和 `capabilities`，只含实际格式、输入方式与是否可扩展。摘录是正文的受限前缀，短正文同样截短；不包含默认变量、完整变体或预设正文，不能当最终提示词使用。
2. `get_prompt` 读取真实 ID 和当前修订，返回 `capabilities`、完整变体、变量和扩展声明。需要核对示例时再传 `include_examples:true`。
3. `render_prompt` 接受可选的新参数，网页和 MCP 使用同一个确定性组合函数。保持原有 `data.prompt`、可选 `negative_prompt` 等字段，并返回实际 `format` 与 `input_mode`。

下面的 ID 和预设仅为隔离测试示意，实际调用必须使用搜索和详情返回的 ID：

```json
{
  "id": "fixture-dual",
  "expected_revision": "从 get_prompt 返回的 prompt_revision",
  "variables": { "subject": "an adult traveler with blue hair" },
  "format": "tags",
  "input_mode": "text",
  "additions": {
    "preset_ids": ["happy", "blush"],
    "custom": "(wide eyes:1.25), {literal}, $&\n中文 😀"
  }
}
```

旧调用 `{id, expected_revision, variables:{}}` 继续有效。省略新参数按正文格式及第一种输入方式渲染，不自动增加扩展；`additions:{}`、空 `preset_ids` 和空字符串均可省略。所有请求对象拒绝未知字段。纯检索、复制和准备无需先交角色图；Agent 在实际生成之前按选中方式确认参考图，并把图片交给生成工具。渲染之后逐字交付或交接，不能另外拼接绕开声明。

| 错误码 | 含义 |
| --- | --- |
| `FORMAT_UNSUPPORTED` | 格式合法，但该条目没有维护该格式 |
| `INPUT_MODE_UNSUPPORTED` | 该条目不支持所选使用方式 |
| `ADDITIONS_UNSUPPORTED` | 固定模板收到非空附加请求 |
| `INVALID_ADDITIONS` | 未知/重复预设、同组冲突、缺对应格式值或未开放自定义 |
| `INVALID_INPUT` | 未知字段、未知枚举、附加内容超限或预设请求超过 32 项 |
| `MISSING_VARIABLES` / `INVALID_VARIABLES` | 所选格式与负面所需变量缺失或取值非法 |

这些失败保持 `ok:false`、`error.code/details/retryable:false`、MCP `isError:true`，不返回最终提示词。其他旧错误码、修订校验和请求体上限保持。

## 插件版本与验证边界

新的组合指导以源码插件 **0.2.0** 分发，服务元信息同为 0.2.0；已发布的 **0.1.2** 包、ZIP、冻结快照和历史报告保持原样。旧插件仍可按原三工具与参数读取服务，升级 Skill 后才能获得新的选择/组合指导；单纯内容更新仍无需重装。真实发布、安装、桌面端支持与模型自动调用须另外记录，协议测试和浏览器测试不能替代这些验收。

隔离夹具 `tests/fixtures/catalog-data.ts` 覆盖全文、标签、双格式、各角色输入方式、预设及自定义。检查包括真实现代/旧版 MCP、360 像素浏览器及键盘、完整复制与剪贴板回退、三条原文与图片哈希，以及千条数据首屏至多六图、初始零正文、一次复制读取一条正文。旧快照测试固定历史 digest 后验证不注入字段。完整本地检查为 `npm run check`，不调用模型或付费生图。
