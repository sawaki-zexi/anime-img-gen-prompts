---
id: stargazer-character-sheet
title: 巡星旅人的立绘
summary: 披着午夜蓝斗篷的成年巡星旅人。复古赛璐璐阴影与完整站姿，适合角色立绘。
language: en
status: published
updated_at: '2026-11-09'
template_version: '1'
use_cases:
  - character
  - illustration
styles:
  - retro-cel
keywords:
  - 立绘
  - 旅人
  - 星盘
  - 人物
  - 1990s
  - traveler
variables:
  subject:
    label: 角色设定
    description: 用英文描述角色设定；默认值就是对应示例实际使用的输入。
    required: true
    max_length: 2000
    default: >-
      an adult androgynous traveler with short silver hair, a midnight-blue
      cape, practical boots and a brass star compass
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
    image: images/stargazer-character-sheet.webp
    thumbnail: images/stargazer-character-sheet-thumb.webp
    alt: 银发成年旅人穿深蓝斗篷与旅行靴，手持黄铜星盘，完整站立在暖象牙色背景前。
    width: 1024
    height: 1536
    effective_prompt: >-
      Use case: stylized-concept. Asset type: a full-body anime character
      illustration. Design an adult androgynous traveler with short silver hair,
      a midnight-blue cape, practical boots and a brass star compass. Show one
      complete standing figure from head to toe in a relaxed three-quarter pose,
      with both feet and the cape fully inside the frame. Use a retro 1990s
      cel-animation look: precise dark contours, broad flat colors, two-tone cel
      shadows, subtle painted highlights and expressive facial design. Clothing
      and accessories should feel coherent and practical for a wandering star
      observer. Use a quiet warm ivory backdrop with a small grounding shadow.
      Vertical 2:3 composition, no turnaround grid, no extra characters, no
      written labels, no logo, no watermark.
    variables:
      subject: >-
        an adult androgynous traveler with short silver hair, a midnight-blue
        cape, practical boots and a brass star compass
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
Use case: stylized-concept. Asset type: a full-body anime character illustration. Design {subject}. Show one complete standing figure from head to toe in a relaxed three-quarter pose, with both feet and the cape fully inside the frame. Use a retro 1990s cel-animation look: precise dark contours, broad flat colors, two-tone cel shadows, subtle painted highlights and expressive facial design. Clothing and accessories should feel coherent and practical for a wandering star observer. Use a quiet warm ivory backdrop with a small grounding shadow. Vertical 2:3 composition, no turnaround grid, no extra characters, no written labels, no logo, no watermark.
