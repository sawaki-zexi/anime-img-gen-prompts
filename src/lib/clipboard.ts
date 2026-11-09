import { animate } from 'motion/mini';

export async function copyField(field: HTMLTextAreaElement, status: HTMLElement) {
  try {
    await navigator.clipboard.writeText(field.value);
    status.textContent = '已复制，去创作吧 ✦';
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) animate(status, { opacity: [0, 1] }, { duration: 0.15 });
  } catch {
    field.hidden = false;
    field.focus();
    field.select();
    status.textContent = '文本已选中，请使用系统复制操作。';
  }
}
