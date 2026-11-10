---
id: windchime-librarian-avatar
title: 风铃下的图书管理员
summary: 栗色短发、金丝圆眼镜与薄荷衬衫，适合读书账号的清透水彩头像。由薄荷头像模板渲染衍生，并附独立生成的新示例。
language: en
status: published
updated_at: '2026-11-10'
template_version: '1'
use_cases:
  - avatar
  - illustration
styles:
  - watercolor
keywords:
  - 头像
  - 图书管理员
  - 读书
  - 圆眼镜
  - 风铃
  - 水彩
  - librarian
  - avatar
variables:
  subject:
    label: 头像主体
    description: 用英文描述头像主体；默认值就是对应示例实际使用的输入。
    required: true
    max_length: 2000
    default: >-
      an adult anime librarian with a short chestnut bob, round gold-rimmed
      glasses and warm hazel eyes
model_compatibility: []
conditions:
  - 本条为 mint-watercolor-avatar 模板的图书管理员主体变体；模板结构沿用原条目，示例图片于2026-11-10独立生成，未复用旧图。
  - 示例由本项目会话中的内置图像生成工具独立生成，底层模型、版本、种子与其他参数未提供。
  - 用途和画风描述来自实际提示词，不代表具体模型已通过兼容性验证。
  - 更改变量会生成新的画面，不保证复现同一角色、分镜或构图。
source:
  author: sawaki-zexi（本项目内容制作会话）
  origin: >-
    2026-11-10 公开发布验收；从真实匿名 MCP 检索
    mint-watercolor-avatar、读取并渲染主体变量，将返回的完整正文原样交给内置图像生成工具。原模板与新生成图的来源分别记录，不宣称新的独立画风。
  text_license: 尚未指定独立许可；公开浏览不等同于授予再分发许可。
  image_license: 本项目会话生成的原始图像，尚未指定独立许可。
examples:
  - id: original-example
    image: images/windchime-librarian-avatar.webp
    thumbnail: images/windchime-librarian-avatar-thumb.webp
    alt: 水彩风成年图书管理员头像，栗色短发、金丝圆眼镜、榛色眼睛与薄荷色衬衫，旁边有书籍、绿叶和玻璃风铃。
    width: 1254
    height: 1254
    effective_prompt: >-
      Use case: stylized-concept. Asset type: a square anime avatar
      illustration. Create a hand-painted watercolor anime portrait of an adult
      anime librarian with a short chestnut bob, round gold-rimmed glasses and
      warm hazel eyes, wearing a loose mint-colored summer shirt. Frame the head
      and shoulders with the face clearly readable at small size. A few soft
      leaves and a hanging glass wind chime blur into a light paper background.
      Use delicate pencil linework, translucent watercolor washes, subtle paper
      grain, fresh pale aqua and warm sunlight. The expression is relaxed and
      curious. Keep a clean silhouette and gentle breathing room around the
      hair. One original character, 1:1 composition, no lettering, no logo, no
      watermark, no UI.
    variables:
      subject: >-
        an adult anime librarian with a short chestnut bob, round gold-rimmed
        glasses and warm hazel eyes
    template_version: '1'
    generator: 内置图像生成工具
    model: null
    parameters:
      transparent_background: false
    created_at: '2026-11-10'
    provenance: >-
      实际公开服务内容版本
      sha256:d419ce74d5f54b2e1d893cc02f31b42ecaff5daa9dda1b6151eec68169397831，原模板
      mint-watercolor-avatar、修订
      sha256:368aa838aeaac1fdc95e3713be5073d6ae5070a65ac287b39a3e55492e976d31。内置图像工具成功接收原样渲染正文，提示词
      SHA-256
      0f8d9e9554aaa1b9c0e50ec7e019cbf5afb9aa1cf760e85b9b3a634834e59a8c；PNG为本次独立输出。WebP仅编码，缩略图仅缩放与编码。已目视核对主体、眼镜、水彩风格与构图；底层模型、版本和种子未知。
related_ids:
  - mint-watercolor-avatar
---
Use case: stylized-concept. Asset type: a square anime avatar illustration. Create a hand-painted watercolor anime portrait of {subject}, wearing a loose mint-colored summer shirt. Frame the head and shoulders with the face clearly readable at small size. A few soft leaves and a hanging glass wind chime blur into a light paper background. Use delicate pencil linework, translucent watercolor washes, subtle paper grain, fresh pale aqua and warm sunlight. The expression is relaxed and curious. Keep a clean silhouette and gentle breathing room around the hair. One original character, 1:1 composition, no lettering, no logo, no watermark, no UI.
