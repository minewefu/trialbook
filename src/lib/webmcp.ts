/**
 * Trialbook's WebMCP layer.
 *
 * One registry feeds three consumers:
 *   1. the browser agent (ChatGPT's built-in browser, or Chrome with WebMCP enabled), through
 *      document.modelContext.registerTool();
 *   2. the in-app Tools panel, so anyone can run a tool without an agent;
 *   3. the Activity log, which records every invocation with its source.
 *
 * Every tool in the app is registered through registerTool() below. Nothing calls the browser
 * API directly anywhere else.
 */

export type JsonSchema = Record<string, unknown>;
export type ToolGroup = 'global' | 'experiment';
export type ToolAnnotations = { readOnlyHint?: boolean; untrustedContentHint?: boolean };
export type ToolSource = 'agent' | 'panel';

export type ToolDef = {
  /** 1–128 chars, letters, digits, underscore, hyphen, period. snake_case verbs by convention. */
  name: string;
  /** Under 500 characters, phrased positively: what the tool does and when to use it. */
  description: string;
  /** JSON Schema for the input object. Always `type: "object"` with `additionalProperties: false`. */
  inputSchema: JsonSchema;
  annotations?: ToolAnnotations;
  /** Example input pre-filled in the Tools panel's Run box. */
  example?: Record<string, unknown>;
  execute: (input: any, opts?: { signal?: AbortSignal }) => Promise<unknown> | unknown;
};

export type ToolEntry = {
  def: ToolDef;
  group: ToolGroup;
  controller: AbortController;
  /** True once the browser accepted the registration. False in browsers without WebMCP. */
  inBrowser: boolean;
};

export type ActivityItem = {
  id: number;
  ts: number;
  tool: string;
  source: ToolSource;
  input: unknown;
  result: unknown;
  ok: boolean;
  ms: number;
};

const NAME_RE = /^[A-Za-z0-9_.-]{1,128}$/;
/** Chrome's tool-security guidance recommends keeping each tool output around 1.5K characters. */
const MAX_RESULT_CHARS = 1400;
const MAX_ACTIVITY = 200;

const registry = new Map<string, ToolEntry>();
const activity: ActivityItem[] = [];
const listeners = new Set<() => void>();
let version = 0;
let nextActivityId = 1;

function notify(): void {
  version += 1;
  for (const listener of listeners) listener();
}

/** Subscribe to registry and activity changes. Returns an unsubscribe function. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Monotonic counter that changes whenever the registry or the activity log changes. */
export function getVersion(): number {
  return version;
}

export function getModelContext(): ModelContext | null {
  return document.modelContext ?? navigator.modelContext ?? null;
}

export function hasWebMCP(): boolean {
  return typeof getModelContext()?.registerTool === 'function';
}

export function listTools(): ToolEntry[] {
  return [...registry.values()];
}

export function getTool(name: string): ToolEntry | undefined {
  return registry.get(name);
}

export function browserToolCount(): number {
  let count = 0;
  for (const entry of registry.values()) if (entry.inBrowser) count += 1;
  return count;
}

export function getActivity(): ActivityItem[] {
  return activity;
}

function clampResult(result: unknown): unknown {
  if (result === undefined) return { ok: true };
  let text: string;
  try {
    text = JSON.stringify(result);
  } catch {
    return { ok: false, error: 'The tool returned a value that cannot be serialised to JSON.' };
  }
  if (text.length <= MAX_RESULT_CHARS) return result;
  return {
    truncated: true,
    hint: 'The full result was too large for one response. Ask for a smaller page (page and limit) or a summary.',
    preview: text.slice(0, 1000),
  };
}

async function invoke(
  entry: ToolEntry,
  input: unknown,
  opts: { signal?: AbortSignal } | undefined,
  source: ToolSource,
): Promise<unknown> {
  const started = performance.now();
  let result: unknown;
  let ok = true;
  try {
    result = clampResult(await entry.def.execute(input ?? {}, opts));
  } catch (err) {
    ok = false;
    result = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      hint: 'Check the input against the tool schema and try again.',
    };
  }
  activity.unshift({
    id: nextActivityId++,
    ts: Date.now(),
    tool: entry.def.name,
    source,
    input,
    result,
    ok,
    ms: Math.round(performance.now() - started),
  });
  if (activity.length > MAX_ACTIVITY) activity.length = MAX_ACTIVITY;
  notify();
  return result;
}

/**
 * Register a tool with the browser (when WebMCP is available) and with the local registry
 * (always). Re-registering an existing name replaces it.
 */
export async function registerTool(def: ToolDef, group: ToolGroup = 'global'): Promise<void> {
  if (!NAME_RE.test(def.name)) throw new Error(`Invalid tool name "${def.name}"`);
  if (def.description.length > 500) console.warn(`[webmcp] ${def.name}: description is over 500 characters`);
  if (registry.has(def.name)) await unregisterTool(def.name);

  const controller = new AbortController();
  const entry: ToolEntry = { def, group, controller, inBrowser: false };
  registry.set(def.name, entry);

  const mc = getModelContext();
  if (mc && typeof mc.registerTool === 'function') {
    const descriptor: ModelContextToolDescriptor = {
      name: def.name,
      description: def.description,
      inputSchema: def.inputSchema,
      annotations: def.annotations,
      execute: (input: unknown, opts?: { signal?: AbortSignal }) => invoke(entry, input, opts, 'agent'),
    };
    try {
      await mc.registerTool(descriptor, { signal: controller.signal });
      entry.inBrowser = true;
    } catch (err) {
      console.warn(`[webmcp] registerTool(${def.name}) failed`, err);
    }
  }
  notify();
}

export async function unregisterTool(name: string): Promise<void> {
  const entry = registry.get(name);
  if (!entry) return;
  registry.delete(name);
  const mc = getModelContext();
  if (entry.inBrowser && mc) {
    try {
      if (typeof mc.unregisterTool === 'function') await mc.unregisterTool(name);
      else entry.controller.abort();
    } catch (err) {
      console.warn(`[webmcp] unregisterTool(${name}) failed`, err);
    }
  }
  notify();
}

/** Replace every tool in a group. Used when the open experiment changes. */
export async function swapGroup(group: ToolGroup, defs: ToolDef[]): Promise<void> {
  for (const [name, entry] of [...registry]) if (entry.group === group) await unregisterTool(name);
  for (const def of defs) await registerTool(def, group);
}

/** Run a tool from the in-app Tools panel. Same code path the browser agent uses. */
export async function runTool(name: string, input: unknown): Promise<unknown> {
  const entry = registry.get(name);
  if (!entry) throw new Error(`Unknown tool "${name}"`);
  return invoke(entry, input, undefined, 'panel');
}
