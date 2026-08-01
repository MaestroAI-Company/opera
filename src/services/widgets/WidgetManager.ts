import React from 'react';

export interface IWidget<T = any> {
  id: string;
  name: string; // widget display name
  hasBorder: boolean; // toggle container border
  aiDefinesTitle: boolean; // allow custom title
  icon?: any; // asset path
  description: string; // system prompt description
  schema: string; // json schema definition
  component: React.ComponentType<{ data: T }>;
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

  getAllWidgets(): IWidget[] {
    return Array.from(this.widgets.values());
  }

  getSystemPromptSegment(): string {
    if (this.widgets.size === 0) return '';

    let prompt = `\n\n## WIDGET SYSTEM\n`;
    prompt += `You can display interactive UI widgets to the user by returning a special fenced code block in your response. The widget will be parsed and rendered natively.\n`;
    prompt += `To use a widget, output exactly this syntax:\n\n`;
    prompt += `\`\`\`widget id="WIDGET_ID" title="OPTIONAL_TITLE"\n`;
    prompt += `{ "your": "json data" }\n`;
    prompt += `\`\`\`\n\n`;
    prompt += `Only use the title attribute if the widget's aiDefinesTitle is true. The json data must conform to the widget's schema.\n`;
    prompt += `CRITICAL: The JSON data must be strictly valid. Do NOT use actual newlines inside strings (use \\n instead).\n`;
    prompt += `Available Widgets (You MUST use the exact ID provided below as WIDGET_ID):\n`;

    for (const widget of this.widgets.values()) {
      prompt += `- Widget ID: **${widget.id}**\n`;
      prompt += `  - Name: ${widget.name}\n`;
      prompt += `  - Description: ${widget.description}\n`;
      if (widget.aiDefinesTitle) {
        prompt += `  - Requires title: YES (Add title="YOUR_TITLE" to the block)\n`;
      }
      prompt += `  - Schema: ${widget.schema}\n`;
    }

    return prompt;
  }
}

export const WidgetManager = new CentralWidgetManager();
