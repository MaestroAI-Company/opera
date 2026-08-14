import { Platform } from 'react-native';
import { ITool, ToolDefinition, ToolPlatform, ToolSource, ToolWidget } from './ITool';
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
    return Array.from(this.tools.values());
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

  //widget declared by the tool
  getWidget(name: string): ToolWidget | undefined {
    return this.tools.get(name)?.widget;
  }

  //markdown block or null without widget
  buildWidgetBlock(name: string, args: Record<string, any>, result: string): string | null {
    const tool = this.tools.get(name);
    if (!tool?.widget) return null;
    try {
      const data = tool.widget.build(args, result);
      if (!data) {
        if (__DEV__) console.log(`[ToolManager] ${name} produced no widget data, keeping the bubble`);
        return null;
      }
      return `\n\n\`\`\`toolwidget id="${name}"\n${JSON.stringify(data)}\n\`\`\`\n\n`;
    } catch (e) {
      console.warn(`[ToolManager] widget data failed for ${name}:`, e);
      return null;
    }
  }

  //execute a tool by name
  async execute(
    name: string,
    args: Record<string, any>,
    summarize?: (text: string) => Promise<string>,
    recordSource?: (source: ToolSource) => void
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

    if (__DEV__) {
      //private data in args and result
      console.log(`[ToolManager] executing ${name}`);
    }

    try {
      return await tool.execute(args, summarize, recordSource);
    } catch (e: any) {
      console.error(`[ToolManager] Tool ${name} error:`, e?.message || e);
      return `Tool error: ${e?.message || 'unknown error'}`;
    }
  }
}

export const ToolManager = new ToolManagerService();

