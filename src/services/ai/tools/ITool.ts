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

//interface for all tools
export interface ITool {
  definition: ToolDefinition;
  displayName?: string;
  displayDescription?: string;
  promptInstructions?: string; // extra ai instructions, hidden from ui
  enabledByDefault?: boolean;
  execute(args: Record<string, any>, summarize?: (text: string) => Promise<string>): Promise<string>;
}
