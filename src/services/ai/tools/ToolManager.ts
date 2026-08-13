import { Platform } from 'react-native';
import { ITool, ToolDefinition, ToolPlatform } from './ITool';
import { SearchTool } from './SearchTool';
import { FetchPagesTool } from './FetchPagesTool';
import { MathTool } from './MathTool';
import { ClipboardTool } from './ClipboardTool';
import { OpenAppTool } from './OpenAppTool';
import { SendMessageTool } from './SendMessageTool';
import { ContactsTool } from './ContactsTool';
import { CalendarTool } from './CalendarTool';
import { SystemSettingsTool } from './SystemSettingsTool';
import { AlarmTool } from './AlarmTool';
import { PluginRegistry } from '../../plugins/PluginRegistry';

class ToolManagerService {
  private tools: Map<string, ITool> = new Map();

  constructor() {
    //register built-in tools
    this.register(new SearchTool());
    this.register(new FetchPagesTool());
    this.register(new MathTool());
    this.register(new ClipboardTool());
    this.register(new OpenAppTool());
    this.register(new SendMessageTool());
    this.register(new ContactsTool());
    this.register(new CalendarTool());
    this.register(new SystemSettingsTool());
    this.register(new AlarmTool());
  }

  //register a tool
  register(tool: ITool): void {
    this.tools.set(tool.definition.function.name, tool);
  }

  //distinguish tauri desktop from browser web
  private getCurrentPlatform(): ToolPlatform {
    if (Platform.OS === 'ios' || Platform.OS === 'android') return Platform.OS;
    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
    return isTauri ? 'desktop' : 'web';
  }

  //omit tools unsupported on this platform
  private isSupportedOnPlatform(tool: ITool): boolean {
    return !tool.platforms || tool.platforms.includes(this.getCurrentPlatform());
  }

  //get tools for ui
  getAllTools(): ITool[] {
    return Array.from(this.tools.values()).filter(t => this.isSupportedOnPlatform(t));
  }

  //get enabled tools
  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values())
      .filter(t => this.isSupportedOnPlatform(t))
      .filter(t => {
        const name = t.definition.function.name;
        const defaultEnabled = t.enabledByDefault ?? false;
        return PluginRegistry.isEnabled('tool', name, defaultEnabled);
      })
      .map(t => t.definition);
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

