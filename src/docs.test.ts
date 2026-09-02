import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EXPERIMENT_ORDER, EXPERIMENTS } from './sims';
import { experimentTools } from './tools/experiment';
import { GLOBAL_TOOLS } from './tools/global';
import type { ToolDef } from './lib/webmcp';

const DOC_PATH = 'docs/tools.md';

function hints(def: ToolDef): string {
  const out: string[] = [];
  if (def.annotations?.readOnlyHint) out.push('read-only');
  else out.push('makes changes');
  if (def.annotations?.untrustedContentHint) out.push('returns people\'s text (untrustedContentHint)');
  return out.join(', ');
}

function renderTool(def: ToolDef): string {
  return [
    `### \`${def.name}\``,
    '',
    `*${hints(def)}*`,
    '',
    def.description,
    '',
    '```json',
    JSON.stringify(def.inputSchema, null, 2),
    '```',
    '',
  ].join('\n');
}

/** The tools reference is generated from the tool definitions themselves so it can never drift. */
export function renderToolsDoc(): string {
  const lines: string[] = [
    '# Trialbook tools reference',
    '',
    'Generated from the tool definitions by `src/docs.test.ts`. Regenerate with `UPDATE_DOCS=1 npm test`.',
    '',
    'Every tool is registered with `document.modelContext.registerTool` through `src/lib/webmcp.ts`.',
    'Lab-wide tools are always registered. Experiment tools are registered when an experiment opens and',
    'replaced when another one opens; their schemas describe that experiment, and their handlers always act',
    'on whichever experiment is open. Outputs are kept under about 1.4K characters; larger sets are paged.',
    '',
    `## Lab-wide tools (${GLOBAL_TOOLS.length})`,
    '',
  ];
  for (const def of GLOBAL_TOOLS) lines.push(renderTool(def));
  for (const meta of EXPERIMENT_ORDER) {
    const experiment = EXPERIMENTS[meta.id];
    if (!experiment) continue;
    const tools = experimentTools(experiment);
    lines.push(`## ${experiment.title} tools (${tools.length})`, '', experiment.summary, '');
    for (const def of tools) lines.push(renderTool(def));
  }
  return lines.join('\n');
}

describe('docs/tools.md', () => {
  it('matches the registered tool definitions (set UPDATE_DOCS=1 to regenerate)', () => {
    const expected = renderToolsDoc();
    if (process.env.UPDATE_DOCS || !existsSync(DOC_PATH)) writeFileSync(DOC_PATH, expected);
    const actual = readFileSync(DOC_PATH, 'utf8').replace(/\r\n/g, '\n');
    expect(actual).toBe(expected);
  });
});
