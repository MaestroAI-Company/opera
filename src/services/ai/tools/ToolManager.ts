import { ITool, ToolCall, ToolDefinition } from './ITool';
import { SearchTool } from './SearchTool';
import { FetchPagesTool } from './FetchPagesTool';

class ToolManagerService {
  private tools: Map<string, ITool> = new Map();

  constructor() {
    //register built-in tools
    this.register(new SearchTool());
    this.register(new FetchPagesTool());
  }

  //register a tool
  register(tool: ITool): void {
    this.tools.set(tool.definition.function.name, tool);
  }

  //get all tool definitions for ollama payload
  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => t.definition);
  }

  //execute a tool by name
  async execute(
    name: string,
    args: Record<string, any>,
    summarize?: (text: string) => Promise<string>
  ): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      console.warn(`[ToolManager] Attempted to execute unknown tool: ${name}`);
      return `Tool "${name}" not found.`;
    }
    
    console.log(`[ToolManager] Executing tool: ${name}`);
    console.log(`[ToolManager] Arguments:`, JSON.stringify(args, null, 2));
    
    try {
      const result = await tool.execute(args, summarize);
      console.log(`[ToolManager] Tool ${name} finished successfully.`);
      return result;
    } catch (e: any) {
      console.error(`[ToolManager] Tool ${name} failed:`, e);
      return `Tool error: ${e.message}`;
    }
  }
}

export const ToolManager = new ToolManagerService();
