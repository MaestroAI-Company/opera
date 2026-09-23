import React from 'react';
import { PluginRegistry } from '../plugins/PluginRegistry';

export interface IWidget<T = any> {
  id: string;
  name: string; // widget display name
  hasBorder: boolean; // toggle container border
  aiDefinesTitle: boolean; // allow custom title
  icon?: any; // asset path
  description: string; // system prompt description
  schema: string; // json schema definition
  enabledByDefault?: boolean; // default enabled state in settings
  requires?: string[]; // tool names offered alongside on @mention
  component: React.ComponentType<{ data: T; title?: string; incognito?: boolean }>;
}

class CentralWidgetManager {
  private widgets: Map<string, IWidget> = new Map();

  registerWidget(widget: IWidget) {
    this.widgets.set(widget.id, widget);
  }

  unregisterWidget(id: string) {
    this.widgets.delete(id);
  }

  getWidget(id: string): IWidget | undefined {
    return this.widgets.get(id);
  }

  //get widgets for ui
  getAllWidgets(): IWidget[] {
    return Array.from(this.widgets.values());
  }

  //get enabled widgets
  getEnabledWidgets(): IWidget[] {
    return Array.from(this.widgets.values()).filter(w =>
      PluginRegistry.isEnabled('widget', w.id, w.enabledByDefault ?? false)
    );
  }

  getSystemPromptSegment(enabledWidgets: IWidget[] = this.getEnabledWidgets()): string {
    if (enabledWidgets.length === 0) return '';

    let prompt = `\n\n## WIDGET SYSTEM\n`;
    prompt += `Display interactive UI widgets by outputting a fenced code block:\n\n`;
    prompt += `\`\`\`widget id="WIDGET_ID" title="OPTIONAL_TITLE"\n`;
    prompt += `{ "your": "json data" }\n`;
    prompt += `\`\`\`\n\n`;
    prompt += `Rules: title attribute only when aiDefinesTitle is true. JSON must be strictly valid (use \\n in strings). WIDGET_ID must match an ID below exactly. Tools and widgets are separate systems: use tool-call JSON for tools, widget blocks only for widgets below.\n`;
    prompt += `Available Widgets:\n`;

    for (const widget of enabledWidgets) {
      prompt += `- **${widget.id}** (${widget.name}): ${widget.description}\n`;
      if (widget.aiDefinesTitle) {
        prompt += `  Requires title="CITY_NAME"\n`;
      }
      prompt += `  Schema: ${widget.schema}\n`;
    }

    return prompt;
  }
}

export const WidgetManager = new CentralWidgetManager();

