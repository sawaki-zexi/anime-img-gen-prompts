import { catalogSchema, type RenderResult } from '../lib/schema.ts';
import { formatTemplate, promptCapabilities, renderPrompt, templateVariables } from '../lib/catalog.ts';
import { copyField } from '../lib/clipboard.ts';

const data = JSON.parse(document.querySelector('#detail-data')!.textContent!) as { catalog: unknown; id: string };
const catalog = catalogSchema.parse(data.catalog);
const prompt = catalog.prompts.find(item => item.id === data.id)!;
const capabilities = promptCapabilities(prompt);
const form = document.querySelector<HTMLFormElement>('#variables-form');
const field = document.querySelector<HTMLTextAreaElement>('#rendered-prompt, #original-prompt')!;
const negativeField = document.querySelector<HTMLTextAreaElement>('#rendered-negative');
const error = document.querySelector<HTMLElement>('#render-error')!;
const formatChoice = document.querySelector<HTMLSelectElement>('#prompt-format');
const custom = document.querySelector<HTMLTextAreaElement>('#custom-additions');
const clearAdditions = document.querySelector<HTMLButtonElement>('#clear-additions');
const presets = new Set<string>();
const copyButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-copy-format]')];
let format: 'text' | 'tags' = prompt.body_format ?? 'text';
const inputMode = () => (document.querySelector<HTMLInputElement>('[name=input-mode]:checked')?.value as 'reference-image' | 'text' | undefined) ?? capabilities.input_modes[0]!;
const usage = { 'reference-image': '在生图工具中添加你的角色图片，再粘贴下面的提示词。', text: '填写角色描述，再把下面的提示词粘贴到生图工具中。', direct: '复制即可使用。' };

function render(selectedFormat = format): RenderResult {
  const selectedTemplate = formatTemplate(prompt, selectedFormat);
  const active = templateVariables(selectedTemplate.template, selectedTemplate.negative);
  const variables = Object.fromEntries([...(form?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[data-variable]') ?? [])]
    .filter(control => active.has(control.name) && !(control.name === prompt.character_variable && inputMode() !== 'text' && prompt.variables[control.name]?.default !== undefined))
    .map(control => [control.name, control.value]));
  return renderPrompt(catalog, { id: prompt.id, expected_revision: prompt.prompt_revision, variables, format: selectedFormat, input_mode: inputMode(), additions: { preset_ids: [...presets], custom: custom?.value ?? '' } });
}

function update() {
  const mode = inputMode();
  const guide = document.querySelector<HTMLElement>('#usage-guide')!;
  guide.textContent = usage[mode]; guide.dataset.inputMode = mode;
  const selectedTemplate = formatTemplate(prompt, format);
  const active = templateVariables(selectedTemplate.template, selectedTemplate.negative);
  form?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[data-variable]').forEach(control => {
    control.closest<HTMLElement>('.variable-field')!.hidden = !active.has(control.name) || (control.name === prompt.character_variable && mode !== 'text' && prompt.variables[control.name]?.default !== undefined);
    control.removeAttribute('aria-invalid');
  });
  document.querySelectorAll<HTMLElement>('[data-preset-id]').forEach(control => {
    const preset = prompt.customization!.presets.find(item => item.id === control.dataset.presetId)!;
    control.hidden = preset.values[format] === undefined && !presets.has(preset.id);
    control.setAttribute('aria-pressed', String(presets.has(preset.id)));
  });
  if (clearAdditions) clearAdditions.hidden = !presets.size && !custom?.value;
  document.querySelectorAll<HTMLElement>('.copy-status').forEach(status => { status.textContent = ''; });
  form?.querySelectorAll<HTMLElement>('.field-error').forEach(control => { control.hidden = true; control.textContent = ''; });
  const result = render();
  for (const button of copyButtons) button.disabled = !render(button.dataset.copyFormat as 'text' | 'tags').ok;
  const negativeButton = document.querySelector<HTMLButtonElement>('#copy-rendered-negative');
  if (negativeButton) negativeButton.disabled = !result.ok;
  error.hidden = result.ok;
  field.value = result.ok ? result.data.prompt : '';
  if (negativeField) negativeField.value = result.ok ? result.data.negative_prompt ?? '' : '';
  const negativeSection = document.querySelector<HTMLElement>('#negative-section');
  if (negativeSection) negativeSection.hidden = result.ok && !result.data.negative_prompt;
  if (result.ok) return;
  const problems: Record<string, string> = { ...(result.error.details.invalid as Record<string, string> | undefined) };
  for (const name of (result.error.details.missing as string[] | undefined) ?? []) problems[name] = '请填写必填项';
  for (const issue of (result.error.details.issues as { path: (string | number)[]; message: string }[] | undefined) ?? []) {
    if (issue.path[0] === 'variables' && typeof issue.path[1] === 'string') problems[issue.path[1]] = issue.message;
  }
  for (const [name, reason] of Object.entries(problems)) {
    document.getElementById('variable-' + name)?.setAttribute('aria-invalid', 'true');
    const fieldError = document.getElementById('error-' + name);
    if (fieldError) { fieldError.hidden = false; fieldError.textContent = reason; }
  }
  error.textContent = [result.error.message, ...Object.entries(problems).map(([name, reason]) => (prompt.variables[name]?.label ?? name) + '：' + reason), ...((result.error.details.issues as { message: string }[] | undefined)?.map(issue => issue.message) ?? [])].join(' ');
}

form?.addEventListener('input', update);
form?.addEventListener('change', update);
form?.addEventListener('reset', () => { setTimeout(update, 0); });
form?.addEventListener('submit', event => event.preventDefault());
document.querySelectorAll('[name=input-mode]').forEach(control => control.addEventListener('change', update));
formatChoice?.addEventListener('change', () => { format = formatChoice.value as 'text' | 'tags'; update(); });
custom?.addEventListener('input', update);
document.querySelectorAll<HTMLButtonElement>('[data-preset-id]').forEach(button => button.addEventListener('click', () => {
  const preset = prompt.customization!.presets.find(item => item.id === button.dataset.presetId)!;
  if (presets.has(preset.id)) presets.delete(preset.id);
  else {
    if (preset.group) for (const previous of prompt.customization!.presets.filter(item => item.group === preset.group)) presets.delete(previous.id);
    presets.add(preset.id);
  }
  update();
}));
clearAdditions?.addEventListener('click', () => { presets.clear(); if (custom) custom.value = ''; update(); });
for (const button of copyButtons) button.addEventListener('click', () => {
  format = button.dataset.copyFormat as 'text' | 'tags';
  if (formatChoice) formatChoice.value = format;
  update();
  if (!button.disabled) void copyField(field, button.parentElement!.querySelector<HTMLElement>('.copy-status')!);
});
for (const [buttonId, fieldId, statusId] of [
  ['#copy-original', '#original-prompt', '#original-copy-status'],
  ['#copy-rendered-negative', '#rendered-negative', '#negative-copy-status'],
  ['#copy-original-negative', '#original-negative', '#original-negative-copy-status'],
]) {
  const button = document.querySelector<HTMLButtonElement>(buttonId!);
  if (button?.hasAttribute('data-copy-format')) continue;
  button?.addEventListener('click', () => { if (!button.disabled) void copyField(document.querySelector<HTMLTextAreaElement>(fieldId!)!, document.querySelector<HTMLElement>(statusId!)!); });
}
document.querySelector<HTMLDetailsElement>('#more-examples')?.addEventListener('toggle', event => {
  if ((event.currentTarget as HTMLDetailsElement).open) document.querySelectorAll<HTMLImageElement>('[data-src]').forEach(image => { image.src = image.dataset.src!; delete image.dataset.src; });
});
update();
