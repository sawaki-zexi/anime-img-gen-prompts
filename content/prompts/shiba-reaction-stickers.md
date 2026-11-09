---
id: shiba-reaction-stickers
title: 柴犬今天也很忙
summary: 开心、困惑、疲惫、坚定。红围巾柴犬的四种反应，以透明背景保存。
language: en
status: published
updated_at: '2026-11-09'
template_version: '1'
use_cases:
  - meme
  - sticker
styles:
  - chibi
keywords:
  - 柴犬
  - 表情
  - 透明
  - 反应
  - 狗
  - shiba
  - reaction
variables:
  character:
    label: 贴纸角色
    description: 用英文描述贴纸角色；默认值就是对应示例实际使用的输入。
    required: true
    max_length: 2000
    default: a round cream-colored shiba dog with tiny paws and a red bandana
model_compatibility: []
conditions:
  - 示例由本项目会话中的内置图像生成工具独立生成，底层模型、版本、种子与其他参数未提供。
  - 用途和画风描述来自实际提示词，不代表具体模型已通过兼容性验证。
  - 更改变量会生成新的画面，不保证复现同一角色、分镜或构图。
  - 保留实际生成图的透明通道；部分白色描边靠近画布边缘，未作重新切割。
source:
  author: sawaki-zexi（本项目内容制作会话）
  origin: 本仓库 2026-11-09 多用途画廊内容制作会话；每条独立生成，完整实际提示词随条目保存。
  text_license: 尚未指定独立许可；公开浏览不等同于授予再分发许可。
  image_license: 本项目会话生成的原始图像，尚未指定独立许可。
examples:
  - id: original-example
    image: images/shiba-reaction-stickers.webp
    thumbnail: images/shiba-reaction-stickers-thumb.webp
    alt: 透明底四格 Q 版柴犬贴纸，米色小狗系红色围巾，分别呈现开心、困惑、疲惫和坚定表情。
    width: 1254
    height: 1254
    effective_prompt: >-
      Use case: stylized-concept. Asset type: an anime reaction sticker sheet.
      Create four separate chibi stickers of the same a round cream-colored
      shiba dog with tiny paws and a red bandana, arranged in a balanced 2-by-2
      grid with wide transparent gutters. Top left: delighted, eyes sparkling,
      paws raised. Top right: confused, head tilted, one small
      question-mark-shaped decorative curl above the head. Bottom left:
      exhausted, lying flat with sleepy eyes. Bottom right: determined, tiny
      clenched paws and a proud smile. Use soft rounded shapes, crisp expressive
      linework, warm cel shading and a clean white die-cut border around each
      sticker. Each complete sticker must be isolated from the others with no
      shared shadow or touching edges. Square composition with a genuinely
      transparent background and alpha channel. No words, no captions, no logo,
      no watermark, no UI.
    variables:
      character: a round cream-colored shiba dog with tiny paws and a red bandana
    template_version: '1'
    generator: 内置图像生成工具
    model: null
    parameters:
      transparent_background: true
    created_at: '2026-11-09'
    provenance: >-
      2026-11-09 项目会话独立生成，生成工具原样接收本条记录的实际提示词。WebP
      仅重新编码，缩略图仅缩放与编码。请求并生成透明贴纸；导入时核验并保留 alpha，白色描边部分靠近画布边缘。底层模型、版本与种子未知。
related_ids: []
---
Use case: stylized-concept. Asset type: an anime reaction sticker sheet. Create four separate chibi stickers of the same {character}, arranged in a balanced 2-by-2 grid with wide transparent gutters. Top left: delighted, eyes sparkling, paws raised. Top right: confused, head tilted, one small question-mark-shaped decorative curl above the head. Bottom left: exhausted, lying flat with sleepy eyes. Bottom right: determined, tiny clenched paws and a proud smile. Use soft rounded shapes, crisp expressive linework, warm cel shading and a clean white die-cut border around each sticker. Each complete sticker must be isolated from the others with no shared shadow or touching edges. Square composition with a genuinely transparent background and alpha channel. No words, no captions, no logo, no watermark, no UI.
