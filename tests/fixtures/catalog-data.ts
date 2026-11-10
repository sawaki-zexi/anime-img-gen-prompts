import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { authoredPromptSchema, catalogSchema, taxonomySchema } from '../../src/lib/schema.ts';
import { canonicalJson } from '../../src/lib/revision.ts';

// Test-only invented text and geometric pixels. No published prompt or user/assistant example is copied here.
export const fixtureTaxonomy = taxonomySchema.parse({
  use_cases: [
    ['avatar', '头像', ['profile picture', '头像设计']], ['character', '角色立绘', ['立绘', '角色设计', 'character sheet']],
    ['scenery', '场景', ['background', '背景', '环境', '风景']], ['wallpaper', '壁纸', ['桌面背景', '横幅', 'banner']],
    ['comic', '漫画', ['manga', '四格', '四格漫画']], ['meme', '表情包', ['reaction', '梗图', '反应图']],
    ['sticker', '贴纸', ['sticker sheet', '贴图']], ['illustration', '插画', ['人物插画', 'key visual']],
  ].map(([id, label, aliases]) => ({ id, label, aliases })),
  styles: [
    ['anime-key-visual', '动画主视觉', ['anime', '二次元', '日系', '动漫']], ['watercolor', '清透水彩', ['水彩', '手绘', '水彩画']],
    ['retro-cel', '复古赛璐璐', ['retro cel', '赛璐璐', '复古', 'cel animation']], ['manga-ink', '黑白漫画', ['manga ink', '黑白', '网点', '墨线']], ['chibi', '软萌 Q 版', ['Q版', 'Q 版', '软萌']],
  ].map(([id, label, aliases]) => ({ id, label, aliases })), models: [],
});
const definitions = [
  { id: 'fixture-avatar', title: '测试合成 · 薄荷头像', use_cases: ['avatar'], styles: ['watercolor'], keywords: ['薄荷', 'portrait'], body: 'TEST FIXTURE avatar of {subject}. hand-painted delicate pencil linework translucent watercolor. no logo watermark ui.' },
  { id: 'fixture-character', title: '测试合成 · 角色立绘', use_cases: ['character'], styles: ['retro-cel'], keywords: ['角色', 'retro'], body: 'TEST FIXTURE character sheet of {subject}. retro cel blocks. no logo watermark ui.' },
  { id: 'fixture-comic', title: '测试合成 · 四格漫画', use_cases: ['comic'], styles: ['manga-ink'], keywords: ['四格', 'comic'], body: 'TEST FIXTURE four comic panels about {subject}. ink squares. no logo watermark ui.' },
  { id: 'fixture-scenery', title: '测试合成 · 海边场景', use_cases: ['scenery', 'wallpaper'], styles: ['watercolor'], keywords: ['海边', 'coast'], body: 'TEST FIXTURE hand-painted watercolor scenery with {subject}. simple test shapes. no logo watermark ui.' },
  { id: 'fixture-sticker', title: '测试合成 · 透明贴纸', use_cases: ['meme', 'sticker'], styles: ['chibi'], keywords: ['reaction', 'sticker'], body: 'TEST FIXTURE reaction sticker of {subject}. transparent geometric square. no logo watermark ui.' },
  { id: 'fixture-wallpaper', title: '测试合成 · 晴空人物壁纸', use_cases: ['illustration', 'wallpaper'], styles: ['anime-key-visual'], keywords: ['晴空', '海边', 'cherry', 'clouds', '人物'], body: 'TEST FIXTURE anime wallpaper of {subject}. cherry clouds at 海边. no logo watermark ui.' },
];
const hash = (bytes: string | Buffer) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
export const fixtureImages = new Map<string, Buffer>();
export const fixtureRecords = await Promise.all(definitions.map(async (definition, index) => {
  const transparent = definition.id === 'fixture-sticker';
  const image = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 30 * index, g: 100, b: 180, alpha: transparent ? 0 : 1 } } })
    .composite([{ input: { create: { width: 24, height: 24, channels: 4, background: { r: 200, g: 40 + index * 20, b: 80, alpha: 1 } } }, left: 20, top: 20 }]).webp({ lossless: true }).toBuffer();
  const thumbnail = await sharp(image).resize(32, 32).webp({ lossless: true }).toBuffer();
  const imagePath = `images/${definition.id}.webp`, thumbPath = `images/${definition.id}-thumb.webp`;
  fixtureImages.set(imagePath, image); fixtureImages.set(thumbPath, thumbnail);
  const subject = 'synthetic adult test character';
  const authored = authoredPromptSchema.parse({
    id: definition.id, title: definition.title, summary: '隔离测试合成模板和几何像素；永不公开。', language: 'en', status: 'published', updated_at: '2000-01-01', template_version: '1',
    use_cases: definition.use_cases, styles: definition.styles, keywords: definition.keywords,
    variables: { subject: { label: definition.id === 'fixture-avatar' ? '头像主体' : '主角', description: '仅测试用变量', required: true, default: subject, max_length: 2000 } },
    model_compatibility: [], conditions: ['隔离测试合成数据，无实际生图含义。'],
    source: { author: '测试夹具', origin: 'TypeScript invented text and Sharp geometric pixels.', text_license: '测试合成', image_license: '测试合成' },
    examples: [{ id: 'synthetic-example', image: imagePath, thumbnail: thumbPath, alt: '测试合成几何色块', width: 64, height: 64, effective_prompt: definition.body.replace('{subject}', subject), variables: { subject }, template_version: '1', generator: 'Sharp测试几何像素', model: null, parameters: { synthetic: true }, created_at: '2000-01-01', provenance: '完全合成的隔离测试记录；不是实际生图或正式内容。' }], related_ids: [],
  });
  return { authored, template: definition.body };
}));
const site = 'http://localhost:5173';
const prompts = fixtureRecords.map(({ authored, template }) => {
  const assets = Object.fromEntries(authored.examples.flatMap(example => [example.image, example.thumbnail]).map(filename => [filename, hash(fixtureImages.get(filename)!)]));
  const body = { ...authored, template, examples: authored.examples.map(example => ({ ...example, image: `${site}/${example.image}`, thumbnail: `${site}/${example.thumbnail}` })), url: `${site}/prompts/${authored.id}/` };
  return { ...body, prompt_revision: hash(canonicalJson({ body, assets })) };
}).sort((a, b) => a.id.localeCompare(b.id, 'en'));
const payload = { schema_version: '1', site_url: site, base_path: '/', taxonomy: fixtureTaxonomy, prompts, archives: [] };
export const fixtureCatalog = catalogSchema.parse({ ...payload, catalog_revision: hash(canonicalJson(payload)) });
