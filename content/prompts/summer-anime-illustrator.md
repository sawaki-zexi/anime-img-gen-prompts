---
id: summer-anime-illustrator
title: 画师的夏日晴空
summary: 薰衣草色长发、海边屋顶与发光的积云。留出左侧天空，适合横幅与宽屏壁纸。
language: en
status: published
updated_at: '2026-11-09'
template_version: '1'
use_cases: [illustration, wallpaper]
styles: [anime-key-visual]
keywords: [夏日, 晴空, 海边, 成年角色, 人物, 横幅, summer, sky, seaside]
variables:
  subject:
    label: 主体描述
    description: 用英文描述主体的外貌、服装与动作；默认值就是示例图实际使用的成年画师。
    required: true
    max_length: 2000
    default: a clearly adult anime woman illustrator with long pale lavender hair, expressive blue eyes, wearing an elegant white and blue jacket with a small coral ribbon, holding a sketchbook
model_compatibility: []
conditions:
  - 示例由本次项目设计会话中的内置图像生成工具生成，底层模型与版本未提供。
  - 适合 3:1 横向构图；主体放在右侧，左侧约 45% 保留天空与云。
  - 更改主体会得到新的创作结果，不保证复现示例人物或画面。
source:
  author: sawaki-zexi（本项目设计会话）
  origin: 本仓库 2026-11-09 画廊主视觉设计会话，原始生成提示词随条目保存。
  text_license: 尚未指定独立许可；公开浏览不等同于授予再分发许可。
  image_license: 本项目会话生成的原始图像，尚未指定独立许可。
examples:
  - id: original-hero
    image: images/summer-anime-illustrator.webp
    thumbnail: images/summer-anime-illustrator-thumb.webp
    alt: 成年动漫女画师手持速写本，薰衣草色长发被海风轻轻吹起，身后是明亮蓝天、云和海边屋顶。
    width: 2172
    height: 724
    effective_prompt: >-
      Use case: stylized-concept. Asset type: a single wide hero illustration for a polished anime prompt gallery website. Create an original, beautiful contemporary Japanese anime key visual, landscape 3:1 composition. The right half features a clearly adult anime woman illustrator with long pale lavender hair, expressive blue eyes, wearing an elegant white and blue jacket with a small coral ribbon, holding a sketchbook. Behind her is a luminous summer sky with richly painted clouds, distant seaside rooftops and a few drifting cherry blossom petals. Keep the left 45 percent mostly open bright sky and subtle clouds so readable website text can be overlaid. Sophisticated crisp anime linework, carefully shaded hair, detailed fabric, expressive face, radiant cyan and periwinkle with cherry pink accents, premium illustration quality. No text, no logo, no watermark, no website elements, no UI, no rounded corners. This should feel like a high-quality anime art exhibition key visual, not geometric placeholder art.
    variables:
      subject: a clearly adult anime woman illustrator with long pale lavender hair, expressive blue eyes, wearing an elegant white and blue jacket with a small coral ribbon, holding a sketchbook
    template_version: '1'
    generator: 内置图像生成工具
    model: null
    parameters: {}
    created_at: '2026-11-09'
    provenance: 2026-11-09 项目会话中生成的原始画廊主视觉；本条目的 WebP 来自同一原图，缩略图仅做缩放和编码。底层模型、版本、种子与其他生成参数未知。
related_ids: []
---
Use case: stylized-concept. Asset type: a single wide hero illustration for a polished anime prompt gallery website. Create an original, beautiful contemporary Japanese anime key visual, landscape 3:1 composition. The right half features {subject}. Behind her is a luminous summer sky with richly painted clouds, distant seaside rooftops and a few drifting cherry blossom petals. Keep the left 45 percent mostly open bright sky and subtle clouds so readable website text can be overlaid. Sophisticated crisp anime linework, carefully shaded hair, detailed fabric, expressive face, radiant cyan and periwinkle with cherry pink accents, premium illustration quality. No text, no logo, no watermark, no website elements, no UI, no rounded corners. This should feel like a high-quality anime art exhibition key visual, not geometric placeholder art.
