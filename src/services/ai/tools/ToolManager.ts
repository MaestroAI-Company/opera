import { Platform } from 'react-native';
import { ITool, ToolContext, ToolDefinition, ToolPlatform, ToolWidget } from './ITool';
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
import { ReadImageTool } from './ReadImageTool';
import { CONSENT_WIDGET_ID } from './ToolConsent';
import ToolConsentCard from '../../../components/toolwidgets/ToolConsentCard';
import { PluginRegistry } from '../../plugins/PluginRegistry';
import type { McpTool } from '../../mcp/McpTool';

//card streamed while a tool waits
const consentWidget: ToolWidget<{ id: string }> = {
  name: 'Consent',
  //card draws its own frame
  hasBorder: false,
  build: () => null,
  component: ToolConsentCard,
};

//fenced block rendered by MarkdownText
function widgetFence(id: string, data: unknown): string {
  return `\n\n\`\`\`toolwidget id="${id}"\n${JSON.stringify(data)}\n\`\`\`\n\n`;
}

class ToolManagerService {
  private tools: Map<string, ITool> = new Map();
  //track mcp tools for cleanup
  private mcpToolNames: Set<string> = new Set();

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
    this.register(new ReadImageTool());
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

  //swap entire mcp tool set
  setMcpTools(tools: McpTool[]): void {
    for (const name of this.mcpToolNames) this.tools.delete(name);
    this.mcpToolNames.clear();
    for (const tool of tools) {
      this.register(tool);
      this.mcpToolNames.add(tool.definition.function.name);
    }
  }

  //get tools for ui
  getAllTools(): ITool[] {
    return Array.from(this.tools.values());
  }

  //built-in tools available on this platform
  getBuiltInTools(): ITool[] {
    return this.getAllTools()
      .filter(t => !this.mcpToolNames.has(t.definition.function.name))
      .filter(t => this.isSupportedOnPlatform(t));
  }

  //enabled and supported on this platform
  getEnabledTools(): ITool[] {
    return Array.from(this.tools.values())
      .filter(t => this.isSupportedOnPlatform(t))
      .filter(t => {
        const name = t.definition.function.name;
        const defaultEnabled = t.enabledByDefault ?? false;
        return PluginRegistry.isEnabled('tool', name, defaultEnabled);
      });
  }

  //enabled tools, filtered by names
  getDefinitions(only?: string[], canSeeImages = true): ToolDefinition[] {
    return this.getEnabledTools()
      .filter(t => !only || only.includes(t.definition.function.name))
      .filter(t => canSeeImages || !t.requiresVision)
      .map(t => t.definition);
  }

  //widget declared by the tool
  getWidget(name: string): ToolWidget | undefined {
    if (name === CONSENT_WIDGET_ID) return consentWidget;
    return this.tools.get(name)?.widget;
  }

  //markdown block or null without widget
  buildWidgetBlock(name: string, args: Record<string, any>, result: string): string | null {
    const tool = this.tools.get(name);
    if (!tool?.widget) return null;
    try {
      const data = tool.widget.build(args, result);
      if (!data) {
        if (__DEV__) console.log(`[ToolManager] ${name} produced no widget data`);
        return null;
      }
      return widgetFence(name, data);
    } catch (e) {
      console.warn(`[ToolManager] widget data failed for ${name}:`, e);
      return null;
    }
  }

  //card answering a pending consent
  buildConsentBlock(id: string): string {
    return widgetFence(CONSENT_WIDGET_ID, { id });
  }

  //execute a tool by name
  async execute(
    name: string,
    args: Record<string, any>,
    context: ToolContext = {}
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

    if (tool.consent && !PluginRegistry.isEnabled('consent', name, false)) {
      if (!context.askConsent) {
        return `Tool "${name}" needs the user's approval, which cannot be asked right now. Answer without it.`;
      }
      const answer = await context.askConsent({ tool: name, ...tool.consent });
      //stopped reply is not a refusal
      if (context.signal?.aborted) return `Tool "${name}" was cancelled.`;
      if (answer === 'deny') {
        await PluginRegistry.setEnabled('tool', name, false);
        return `The user declined tool "${name}" and it is now disabled. Do not call it again, answer without it.`;
      }
      await PluginRegistry.setEnabled('consent', name, true);
    }

    if (__DEV__) {
      //private data in args and result
      console.log(`[ToolManager] executing ${name}`);
    }

    const started = Date.now();
    try {
      const result = await tool.execute(args, context);
      if (__DEV__) console.log(`[ToolManager] ${name} done in ${Date.now() - started} ms`);
      return result;
    } catch (e: any) {
      console.error(`[ToolManager] Tool ${name} error after ${Date.now() - started} ms:`, e?.message || e);
      //explicit wording helps small models
      return `TOOL FAILED (${name}): ${e?.message || 'unknown error'}. The action did not happen. Tell the user it failed.`;
    }
  }
}

export const ToolManager = new ToolManagerService();

