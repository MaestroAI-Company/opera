import { ITool, ToolCall, ToolDefinition } from './ITool';
import { SearchTool } from './SearchTool';
import { FetchPagesTool } from './FetchPagesTool';
import { MathTool } from './MathTool';
import { PluginRegistry } from '../../plugins/PluginRegistry';

class ToolManagerService {
  private tools: Map<string, ITool> = new Map();

  constructor() {
    //register built-in tools
    this.register(new SearchTool());
    this.register(new FetchPagesTool());
    this.register(new MathTool());
  }

  //register a tool
  register(tool: ITool): void {
    this.tools.set(tool.definition.function.name, tool);
  }

  //get tools for ui
  getAllTools(): ITool[] {
    return Array.from(this.tools.values());
  }

  //get enabled tools
  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values())
      .filter(t => {
        const name = t.definition.function.name;
        const defaultEnabled = t.enabledByDefault ?? false;
        return PluginRegistry.isEnabled('tool', name, defaultEnabled);
      })
      .map(t => {
        if (!t.promptInstructions) return t.definition;
        return {
          ...t.definition,
          function: {
            ...t.definition.function,
            description: `${t.definition.function.description}\n\nIMPORTANT: ${t.promptInstructions}`,
          },
        };
      });
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

    //check tool status
    const defaultEnabled = tool.enabledByDefault ?? false;
    if (!PluginRegistry.isEnabled('tool', name, defaultEnabled)) {
      return `Tool "${name}" is disabled.`;
    }

    try {
      const result = await tool.execute(args, summarize);
      return result;
    } catch (e: any) {
      console.error(`[ToolManager] Tool ${name} failed:`, e);
      return `Tool error: ${e.message}`;
    }
  }
}

export const ToolManager = new ToolManagerService();

