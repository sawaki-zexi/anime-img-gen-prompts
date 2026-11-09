import { animate } from 'motion/mini';
import { catalogSchema } from '../lib/schema.ts';
import { renderPrompt } from '../lib/catalog.ts';

const data = JSON.parse(document.querySelector('#detail-data')!.textContent!) as { catalog: unknown; id: string };
const catalog = catalogSchema.parse(data.catalog);
const prompt = catalog.prompts.find(item => item.id === data.id)!;
const form = document.querySelector<HTMLFormElement>('#variables-form')!;
const renderedField = document.querySelector<HTMLTextAreaElement>('#rendered-prompt')!;
const originalField = document.querySelector<HTMLTextAreaElement>('#original-prompt')!;
const error = document.querySelector<HTMLElement>('#render-error')!;
const copyButton = document.querySelector<HTMLButtonElement>('#copy-rendered')!;
const renderStatus = document.querySelector<HTMLElement>('#render-copy-status')!;

function update() {
  const variables = Object.fromEntries(new FormData(form).entries());
  const result = renderPrompt(catalog, { id: prompt.id, expected_revision: prompt.prompt_revision, variables });
  copyButton.disabled = !result.ok;
  error.hidden = result.ok;
  renderStatus.textContent = '';
  form.querySelectorAll<HTMLTextAreaElement>('[data-variable]').forEach(field => field.removeAttribute('aria-invalid'));
  if (result.ok) {
    renderedField.value = result.data.prompt;
  } else {
    renderedField.value = '';
    const missing = result.error.details.missing as string[] | undefined;
    const invalid = result.error.details.invalid as Record<string, string> | undefined;
    const fields = missing ?? Object.keys(invalid ?? {});
    fields.forEach(name => document.getElementById(`variable-${name}`)?.setAttribute('aria-invalid', 'true'));
    error.textContent = `${result.error.message}${fields.length ? `（${fields.map(name => prompt.variables[name]?.label ?? name).join('、')}）` : ''}`;
  }
}

async function copy(field: HTMLTextAreaElement, status: HTMLElement) {
  try {
    await navigator.clipboard.writeText(field.value);
    status.textContent = '已复制，去创作吧 ✦';
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) animate(status, { opacity: [0, 1] }, { duration: 0.15 });
  } catch {
    field.focus();
    field.select();
    status.textContent = '文本已选中，请使用系统复制操作。';
  }
}

form.addEventListener('input', update);
form.addEventListener('reset', () => { queueMicrotask(update); });
form.addEventListener('submit', event => event.preventDefault());
copyButton.addEventListener('click', () => { if (!copyButton.disabled) void copy(renderedField, renderStatus); });
document.querySelector('#copy-original')!.addEventListener('click', () => { void copy(originalField, document.querySelector<HTMLElement>('#original-copy-status')!); });
update();
