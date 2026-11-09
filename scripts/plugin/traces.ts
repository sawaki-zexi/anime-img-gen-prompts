import { z } from 'zod';
import { getResultSchema, renderResultSchema, searchResultSchema, type Catalog } from '../../src/lib/schema.ts';

export const evaluationCaseSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/), kind: z.enum(['positive', 'negative', 'missing-variable', 'no-image-tool', 'no-match', 'unavailable', 'handoff-probe']),
  group: z.string().min(1), project: z.union([z.literal(0), z.literal(1)]), prompt: z.string().min(1), variable_text: z.string().optional(),
}).strict();
export type EvaluationCase = z.infer<typeof evaluationCaseSchema>;
type Event = Record<string, any>;

export function parseEvents(jsonl: string): Event[] {
  return jsonl.split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line));
}

function businessResult(call: Event): unknown {
  const result = call.result;
  if (!result) return undefined;
  const structured = result.structuredContent;
  if (structured) return structured.result ?? structured;
  for (const content of result.content ?? []) {
    if (content.type === 'text') {
      try { const value = JSON.parse(content.text); return value.result ?? value; } catch { /* A transport error may have only text. */ }
    }
  }
  return undefined;
}

/** Judge the runner's controlled fixture (native image_generation disabled). Prose is never evidence of tool use. */
export function assessTrace(events: Event[], scenario: EvaluationCase, catalog: Catalog) {
  const completed = events.filter(event => event.type === 'item.completed').map(event => event.item).filter(Boolean);
  const allCalls = completed.filter(item => item.type === 'mcp_tool_call');
  const calls = allCalls.filter(item => ['search_prompts', 'get_prompt', 'render_prompt'].includes(item.tool));
  const searchIds = new Map<string, string>(), detailRevisions = new Map<string, string>();
  const violations: string[] = [], retrievedIds: string[] = [], renderedPrompts: string[] = [], negativePrompts: string[] = [];
  const callSummary = [];
  let searchSuccesses = 0, renderSuccesses = 0;
  for (const call of calls) {
    const args = call.arguments ?? {}, result = businessResult(call);
    const schema = call.tool === 'search_prompts' ? searchResultSchema : call.tool === 'get_prompt' ? getResultSchema : renderResultSchema;
    const checked = schema.safeParse(result);
    if (!checked.success) {
      if (!call.error && call.result?.isError !== true) violations.push(`${call.tool}: 未取得符合契约的业务结果`);
      callSummary.push({ tool: call.tool, arguments: args, transport_error: call.error ?? null, ok: false }); continue;
    }
    const value = checked.data;
    if (value.catalog_revision !== catalog.catalog_revision) violations.push(`${call.tool}: 内容版本与评测快照不同`);
    if (args.id && !catalog.prompts.some(prompt => prompt.id === args.id)) violations.push(`${call.tool}: 使用了不存在的 ID ${args.id}`);
    if (call.tool === 'search_prompts' && value.ok) {
      const search = searchResultSchema.parse(value); if (!search.ok) continue;
      searchSuccesses++;
      for (const item of search.data.items) {
        const real = catalog.prompts.find(prompt => prompt.id === item.id);
        if (!real || real.prompt_revision !== item.prompt_revision) violations.push('搜索返回非当前真实条目');
        searchIds.set(item.id, item.prompt_revision);
      }
    } else if (call.tool === 'get_prompt' && value.ok) {
      const detail = getResultSchema.parse(value); if (!detail.ok) continue;
      if (searchIds.get(args.id) !== detail.data.prompt_revision) violations.push('未先从搜索读取真实候选再取详情');
      if (args.expected_revision !== detail.data.prompt_revision) violations.push('详情未固定搜索返回的修订号');
      if (detail.data.id !== args.id) violations.push('详情 ID 与请求不同');
      detailRevisions.set(detail.data.id, detail.data.prompt_revision); retrievedIds.push(detail.data.id);
    } else if (call.tool === 'render_prompt' && value.ok) {
      const rendered = renderResultSchema.parse(value); if (!rendered.ok) continue;
      if (detailRevisions.get(args.id) !== args.expected_revision || args.expected_revision !== rendered.data.prompt_revision) violations.push('未使用刚读取详情的修订渲染');
      if (scenario.variable_text && !Object.values(rendered.data.variables).some(value => value.includes(scenario.variable_text!))) violations.push('用户明确给出的变量文字未被保留');
      renderSuccesses++; renderedPrompts.push(rendered.data.prompt);
      if (rendered.data.negative_prompt) negativePrompts.push(rendered.data.negative_prompt);
    }
    callSummary.push({ tool: call.tool, arguments: args, ok: value.ok, ...(value.ok ? { catalog_revision: value.catalog_revision } : { error: value.error.code }) });
  }
  const imageCalls = allCalls.filter(call => call.tool === 'generate_image' && String(call.server).includes('image-handoff-probe'));
  const handoffMatches = imageCalls.some(call => {
    const result = businessResult(call) as { accepted_for_handoff_probe?: boolean } | undefined;
    const precedingRender = allCalls.slice(0, allCalls.indexOf(call)).some(item => item.tool === 'render_prompt' && (businessResult(item) as { data?: { prompt?: string } } | undefined)?.data?.prompt === call.arguments?.prompt);
    return !call.error && call.result?.isError !== true && result?.accepted_for_handoff_probe === true && precedingRender && renderedPrompts.includes(call.arguments?.prompt) && Object.keys(call.arguments).every(key => key === 'prompt');
  });
  const finalText = completed.filter(item => item.type === 'agent_message').map(item => item.text ?? '').join('\n');
  const textContainsRenderedPrompt = renderedPrompts.some(prompt => finalText.includes(prompt));
  const textContainsNegativePrompt = negativePrompts.every(prompt => finalText.includes(prompt));
  const activated = searchSuccesses > 0;
  if (scenario.kind === 'negative' && calls.length) violations.push('反向任务调用了动漫模板库');
  if (scenario.kind === 'missing-variable' && renderSuccesses) violations.push('缺少用户明确要求澄清的主角时生成了最终模板');
  if (scenario.kind === 'no-match' && (calls.filter(call => call.tool === 'search_prompts').length > 2 || retrievedIds.length || renderSuccesses)) violations.push('无匹配任务被替换成其他主题或超出一次放宽');
  if (scenario.kind === 'unavailable' && (retrievedIds.length || renderSuccesses)) violations.push('不可用服务声称成功读取或渲染');
  const requiresRender = ['positive', 'no-image-tool', 'handoff-probe'].includes(scenario.kind);
  const requiresVerbatim = ['positive', 'no-image-tool'].includes(scenario.kind);
  const structurePassed = violations.length === 0 && (!requiresRender || renderSuccesses > 0) && (scenario.kind !== 'handoff-probe' || handoffMatches) && (!requiresVerbatim || (textContainsRenderedPrompt && textContainsNegativePrompt));
  return { scenario: scenario.id, kind: scenario.kind, activated, retrieved_ids: [...new Set(retrievedIds)], rendered: renderSuccesses, trace_structure_passed: structurePassed, violations, handoff_matches_rendered: handoffMatches, final_contains_rendered_prompt: textContainsRenderedPrompt, final_contains_rendered_negative: textContainsNegativePrompt, calls: callSummary, manual_review: 'pending', final_text: finalText };
}
