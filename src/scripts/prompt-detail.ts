import { catalogSchema } from '../lib/schema.ts';
import { renderPrompt } from '../lib/catalog.ts';
import { copyField } from '../lib/clipboard.ts';

const data = JSON.parse(document.querySelector('#detail-data')!.textContent!) as { catalog: unknown; id: string };
const catalog = catalogSchema.parse(data.catalog);
const prompt = catalog.prompts.find(item => item.id === data.id)!;
const form = document.querySelector<HTMLFormElement>('#variables-form')!;
const renderedField = document.querySelector<HTMLTextAreaElement>('#rendered-prompt')!;
const negativeField = document.querySelector<HTMLTextAreaElement>('#rendered-negative');
const error = document.querySelector<HTMLElement>('#render-error')!;
const copyButton = document.querySelector<HTMLButtonElement>('#copy-rendered')!;
const negativeButton = document.querySelector<HTMLButtonElement>('#copy-rendered-negative');

function update() {
  const variables = Object.fromEntries(new FormData(form).entries());
  const result = renderPrompt(catalog, { id: prompt.id, expected_revision: prompt.prompt_revision, variables });
  copyButton.disabled = !result.ok;
  if (negativeButton) negativeButton.disabled = !result.ok;
  error.hidden = result.ok;
  document.querySelectorAll<HTMLElement>('.copy-status').forEach(status => { status.textContent = ''; });
  form.querySelectorAll<HTMLElement>('[data-variable]').forEach(field => field.removeAttribute('aria-invalid'));
  form.querySelectorAll<HTMLElement>('.field-error').forEach(field => { field.hidden = true; field.textContent = ''; });
  if (result.ok) {
    renderedField.value = result.data.prompt;
    if (negativeField) negativeField.value = result.data.negative_prompt ?? '';
    return;
  }
  renderedField.value = '';
  if (negativeField) negativeField.value = '';
  const problems: Record<string, string> = { ...(result.error.details.invalid as Record<string, string> | undefined) };
  for (const name of (result.error.details.missing as string[] | undefined) ?? []) problems[name] = '请填写必填项';
  for (const issue of (result.error.details.issues as { path: (string | number)[]; message: string }[] | undefined) ?? []) {
    if (issue.path[0] === 'variables' && typeof issue.path[1] === 'string') problems[issue.path[1]] = issue.message;
  }
  for (const [name, reason] of Object.entries(problems)) {
    document.getElementById(`variable-${name}`)?.setAttribute('aria-invalid', 'true');
    const fieldError = document.getElementById(`error-${name}`);
    if (fieldError) { fieldError.hidden = false; fieldError.textContent = reason; }
  }
  const descriptions = Object.entries(problems).map(([name, reason]) => `${prompt.variables[name]?.label ?? name}：${reason}`);
  error.textContent = [result.error.message, ...descriptions].join(' ');
}

form.addEventListener('input', update);
form.addEventListener('change', update);
// The reset event fires before the browser restores each control's default value.
form.addEventListener('reset', () => { setTimeout(update, 0); });
form.addEventListener('submit', event => event.preventDefault());
for (const [button, field, status] of [
  ['#copy-rendered', '#rendered-prompt', '#render-copy-status'],
  ['#copy-original', '#original-prompt', '#original-copy-status'],
  ['#copy-rendered-negative', '#rendered-negative', '#negative-copy-status'],
  ['#copy-original-negative', '#original-negative', '#original-negative-copy-status'],
]) {
  const control = document.querySelector<HTMLButtonElement>(button!);
  control?.addEventListener('click', () => {
    if (!control.disabled) void copyField(document.querySelector<HTMLTextAreaElement>(field!)!, document.querySelector<HTMLElement>(status!)!);
  });
}
document.querySelector<HTMLDetailsElement>('#more-examples')?.addEventListener('toggle', event => {
  if ((event.currentTarget as HTMLDetailsElement).open) {
    document.querySelectorAll<HTMLImageElement>('[data-src]').forEach(image => { image.src = image.dataset.src!; delete image.dataset.src; });
  }
});
update();
