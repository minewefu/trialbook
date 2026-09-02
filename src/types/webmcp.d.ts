// Minimal ambient types for the WebMCP imperative API (W3C Web Machine Learning CG draft).
// Kept local on purpose: the API is experimental and shipped as a subset in some browsers,
// so every member that might be missing is optional and feature-detected at runtime.
export {};

declare global {
  interface ModelContextToolAnnotations {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
  }

  interface ModelContextToolDescriptor {
    name: string;
    description: string;
    inputSchema?: Record<string, unknown>;
    annotations?: ModelContextToolAnnotations;
    execute: (input: any, options?: { signal?: AbortSignal }) => Promise<unknown> | unknown;
  }

  interface ModelContextRegisteredTool {
    name: string;
    description: string;
    inputSchema?: unknown;
    annotations?: ModelContextToolAnnotations;
    origin?: string;
  }

  interface ModelContext {
    registerTool(
      tool: ModelContextToolDescriptor,
      options?: { signal?: AbortSignal; exposedTo?: string[] },
    ): Promise<void>;
    unregisterTool?(name: string): Promise<void> | void;
    getTools?(options?: { fromOrigins?: string[] }): Promise<ModelContextRegisteredTool[]>;
    executeTool?(
      tool: ModelContextRegisteredTool,
      input: string,
      options?: { signal?: AbortSignal },
    ): Promise<string | null>;
    addEventListener?(type: 'toolchange', listener: (event: Event) => void): void;
  }

  interface Document {
    readonly modelContext?: ModelContext;
  }

  interface Navigator {
    readonly modelContext?: ModelContext;
  }
}
