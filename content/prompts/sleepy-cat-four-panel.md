---
id: sleepy-cat-four-panel
title: 猫猫的迟到早晨
summary: 同一只围着小围巾的白猫，四格讲完一场困倦的早晨。黑白墨线、网点与动作表情。
language: en
status: published
updated_at: '2026-11-09'
template_version: '1'
use_cases:
  - comic
  - illustration
styles:
  - manga-ink
keywords:
  - 猫
  - 四格
  - 日常
  - 黑白
  - 睡眠
  - cat
  - morning
variables:
  character:
    label: 漫画主角
    description: 用英文描述漫画主角；默认值就是对应示例实际使用的输入。
    required: true
    max_length: 2000
    default: a round white cat with a small dark scarf and expressive dot eyes
model_compatibility: []
conditions:
  - 示例由本项目会话中的内置图像生成工具独立生成，底层模型、版本、种子与其他参数未提供。
  - 用途和画风描述来自实际提示词，不代表具体模型已通过兼容性验证。
  - 更改变量会生成新的画面，不保证复现同一角色、分镜或构图。
  - 实际示例包含 Z 字睡眠拟声符号；原始提示词的无文字要求并非绝对保证。
source:
  author: sawaki-zexi（本项目内容制作会话）
  origin: 本仓库 2026-11-09 多用途画廊内容制作会话；每条独立生成，完整实际提示词随条目保存。
  text_license: 尚未指定独立许可；公开浏览不等同于授予再分发许可。
  image_license: 本项目会话生成的原始图像，尚未指定独立许可。
examples:
  - id: original-example
    image: images/sleepy-cat-four-panel.webp
    thumbnail: images/sleepy-cat-four-panel-thumb.webp
    alt: 四格黑白日常漫画，白猫从被窝惊醒、裹着毯子奔向早餐，又在碗边睡着。
    width: 1230
    height: 1278
    effective_prompt: >-
      Use case: illustration-story. Asset type: a four-panel everyday manga
      page. The same a round white cat with a small dark scarf and expressive
      dot eyes appears consistently in all four panels. Arrange four equal
      panels in a clean 2-by-2 grid with thin black borders and generous white
      gutters. Panel 1: the character sleeps under a blanket beside an alarm
      clock. Panel 2: the character suddenly wakes with a surprised face. Panel
      3: the character hurries toward a breakfast bowl while still wrapped in
      the blanket. Panel 4: the character falls asleep again beside the bowl in
      a cozy comic ending. Use charming black-and-white manga ink, simple
      expressive silhouettes, light screentone and a few motion lines. Keep all
      characters and props fully inside their panels. No dialogue, no speech
      bubbles, no captions, no readable text, no logo, no watermark.
    variables:
      character: a round white cat with a small dark scarf and expressive dot eyes
    template_version: '1'
    generator: 内置图像生成工具
    model: null
    parameters:
      transparent_background: false
    created_at: '2026-11-09'
    provenance: >-
      2026-11-09 项目会话独立生成，生成工具原样接收本条记录的实际提示词。WebP 仅重新编码，缩略图仅缩放与编码。真实结果含 Z
      字睡眠拟声符号；提示词的无文字约束不构成绝对保证。底层模型、版本与种子未知。
related_ids: []
---
Use case: illustration-story. Asset type: a four-panel everyday manga page. The same {character} appears consistently in all four panels. Arrange four equal panels in a clean 2-by-2 grid with thin black borders and generous white gutters. Panel 1: the character sleeps under a blanket beside an alarm clock. Panel 2: the character suddenly wakes with a surprised face. Panel 3: the character hurries toward a breakfast bowl while still wrapped in the blanket. Panel 4: the character falls asleep again beside the bowl in a cozy comic ending. Use charming black-and-white manga ink, simple expressive silhouettes, light screentone and a few motion lines. Keep all characters and props fully inside their panels. No dialogue, no speech bubbles, no captions, no readable text, no logo, no watermark.
