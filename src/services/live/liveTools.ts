import type { ConsentAnswer, ConsentPrompt, ToolDefinition } from '../ai/tools/ITool';
import { ToolManager } from '../ai/tools/ToolManager';
import { WidgetManager } from '../widgets/WidgetManager';
import type { LiveToolCall } from './protocol';

export const SHOW_WIDGET = 'show_widget';

//widgets come as a tool since speech cannot carry blocks
function showWidgetDefinition(): ToolDefinition | null {
  const widgets = WidgetManager.getEnabledWidgets();
  if (widgets.length === 0) return null;
  const catalog = widgets
    .map((w) => `- ${w.id} (${w.name}): ${w.description}${w.aiDefinesTitle ? ' Needs a title.' : ''} Schema: ${w.schema}`)
    .join('\n');
  return {
    type: 'function',
    function: {
      name: SHOW_WIDGET,
      description: `Show a widget on the user's screen while you keep talking. Use it to show key facts at a glance.\nWidgets:\n${catalog}`,
      parameters: {
        type: 'object',
        properties: {
          widget: { type: 'string', enum: widgets.map((w) => w.id), description: 'Widget id' },
          title: { type: 'string', description: 'Title, only for widgets that need one' },
          data_json: { type: 'string', description: 'Widget data as strictly valid JSON matching its schema' },
        },
        required: ['widget', 'data_json'],
      },
    },
  };
}

export function liveToolDefinitions(canSeeImages: boolean): ToolDefinition[] {
  const widget = showWidgetDefinition();
  return [...ToolManager.getDefinitions(undefined, canSeeImages), ...(widget ? [widget] : [])];
}

//shown name of a running tool
export function liveToolName(name: string): string {
  const tool = ToolManager.getAllTools().find((t) => t.definition.function.name === name);
  return tool?.displayName ?? name;
}

//runs a call, widget is a markdown block
export async function runLiveTool(
  call: LiveToolCall,
  askConsent: (prompt: ConsentPrompt) => Promise<ConsentAnswer>,
): Promise<{ output: string; widget: string | null }> {
  if (call.name === SHOW_WIDGET) {
    const { widget, title, data_json } = call.args;
    if (!WidgetManager.getWidget(widget)) return { output: `Unknown widget "${widget}".`, widget: null };
    try {
      const data = JSON.parse(data_json);
      const titleAttr = title ? ` title="${String(title).replace(/"/g, "'")}"` : '';
      return {
        output: 'The widget is on screen.',
        widget: `\n\n\`\`\`widget id="${widget}"${titleAttr}\n${JSON.stringify(data)}\n\`\`\`\n\n`,
      };
    } catch {
      return { output: 'data_json is not valid JSON, the widget was not shown.', widget: null };
    }
  }
  const output = await ToolManager.execute(call.name, call.args, { askConsent });
  return { output, widget: ToolManager.buildWidgetBlock(call.name, call.args, output) };
}
