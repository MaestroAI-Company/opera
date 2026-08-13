// tool call returned by ollama
export interface ToolCall {
  function: {
    name: string;
    arguments: Record<string, any>;
  };
}

//tool definition in ollama format
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description: string; enum?: string[]; items?: { type: string } }>;
      required: string[];
    };
  };
}

//platforms a tool can run on
export type ToolPlatform = 'ios' | 'android' | 'web' | 'desktop';

//interface for all tools
export interface ITool {
  definition: ToolDefinition;
  displayName?: string;
  displayDescription?: string;
  enabledByDefault?: boolean;
  //omit if supported on all platforms
  platforms?: ToolPlatform[];
  //request os permission on enable
  requestPermission?(): Promise<boolean>;
  execute(args: Record<string, any>, summarize?: (text: string, systemPrompt?: string) => Promise<string>): Promise<string>;
}
