---
id: mint-watercolor-avatar
title: 风铃与薄荷汽水
summary: 薄荷色衬衫与风铃，透明水彩晕染一张轻松的少年感成年角色头像。
language: en
status: published
updated_at: '2026-11-09'
template_version: '1'
use_cases:
  - avatar
  - illustration
styles:
  - watercolor
keywords:
  - 头像
  - 男性
  - 风铃
  - 薄荷
  - 人物
  - avatar
  - mint
variables:
  subject:
    label: 头像主体
    description: 用英文描述头像主体；默认值就是对应示例实际使用的输入。
    required: true
    max_length: 2000
    default: >-
      an adult anime boy with tousled ink-blue hair, amber eyes and a small
      silver ear cuff
model_compatibility: []
conditions:
  - 示例由本项目会话中的内置图像生成工具独立生成，底层模型、版本、种子与其他参数未提供。
  - 用途和画风描述来自实际提示词，不代表具体模型已通过兼容性验证。
  - 更改变量会生成新的画面，不保证复现同一角色、分镜或构图。
source:
  author: sawaki-zexi（本项目内容制作会话）
  origin: 本仓库 2026-11-09 多用途画廊内容制作会话；每条独立生成，完整实际提示词随条目保存。
  text_license: 尚未指定独立许可；公开浏览不等同于授予再分发许可。
  image_license: 本项目会话生成的原始图像，尚未指定独立许可。
examples:
  - id: original-example
    image: images/mint-watercolor-avatar.webp
    thumbnail: images/mint-watercolor-avatar-thumb.webp
    alt: 水彩风成年动漫男性头像，蓝黑短发、琥珀色眼睛、薄荷色衬衫，背景有绿叶与玻璃风铃。
    width: 1254
    height: 1254
    effective_prompt: >-
      Use case: stylized-concept. Asset type: a square anime avatar
      illustration. Create a hand-painted watercolor anime portrait of an adult
      anime boy with tousled ink-blue hair, amber eyes and a small silver ear
      cuff, wearing a loose mint-colored summer shirt. Frame the head and
      shoulders with the face clearly readable at small size. A few soft leaves
      and a hanging glass wind chime blur into a light paper background. Use
      delicate pencil linework, translucent watercolor washes, subtle paper
      grain, fresh pale aqua and warm sunlight. The expression is relaxed and
      curious. Keep a clean silhouette and gentle breathing room around the
      hair. One original character, 1:1 composition, no lettering, no logo, no
      watermark, no UI.
    variables:
      subject: >-
        an adult anime boy with tousled ink-blue hair, amber eyes and a small
        silver ear cuff
    template_version: '1'
    generator: 内置图像生成工具
    model: null
    parameters:
      transparent_background: false
    created_at: '2026-11-09'
    provenance: >-
      2026-11-09 项目会话独立生成，生成工具原样接收本条记录的实际提示词。WebP
      仅重新编码，缩略图仅缩放与编码。已核对主体、风格与构图，对应计划内原样调用的实际提示词。底层模型、版本与种子未知。
related_ids: []
---
Use case: stylized-concept. Asset type: a square anime avatar illustration. Create a hand-painted watercolor anime portrait of {subject}, wearing a loose mint-colored summer shirt. Frame the head and shoulders with the face clearly readable at small size. A few soft leaves and a hanging glass wind chime blur into a light paper background. Use delicate pencil linework, translucent watercolor washes, subtle paper grain, fresh pale aqua and warm sunlight. The expression is relaxed and curious. Keep a clean silhouette and gentle breathing room around the hair. One original character, 1:1 composition, no lettering, no logo, no watermark, no UI.
