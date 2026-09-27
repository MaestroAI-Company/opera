import type React from 'react';
import type { TranslationKey } from '../../../i18n';

// tool call returned by ollama
export interface ToolCall {
  //pairs tool results to calls
  id?: string;
  function: {
    name: string;
    arguments: Record<string, any>;
  };
}

//json schema subset for mcp
export interface ToolParameterSchema {
  type?: string | string[];
  description?: string;
  enum?: any[];
  items?: ToolParameterSchema;
  properties?: Record<string, ToolParameterSchema>;
  required?: string[];
  [key: string]: any;
}

//tool definition in ollama format
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, ToolParameterSchema>;
      required: string[];
    };
  };
}

//platforms a tool can run on
export type ToolPlatform = 'ios' | 'android' | 'web' | 'desktop';

//web page consulted by a tool
export interface ToolSource {
  url: string;
  title?: string;
  favicon?: string;
}

//widget rendering a tool result in the reply
export interface ToolWidget<T = any> {
  //header label
  name: string;
  //toggle container border
  hasBorder: boolean;
  //null result shows no widget
  build(args: Record<string, any>, result: string): T | null;
  component: React.ComponentType<{ data: T; incognito?: boolean }>;
}

//interface for all tools
export interface ITool {
  definition: ToolDefinition;
  displayName?: string;
  displayDescription?: string;
  enabledByDefault?: boolean;
  //omit if supported on all platforms
  platforms?: ToolPlatform[];
  //tool names offered alongside on @mention
  requires?: string[];
  //request os permission on enable
  requestPermission?(): Promise<boolean>;
  //off device data needs consent
  consent?: { title: TranslationKey; message: TranslationKey };
  //optional ui for the tool result
  widget?: ToolWidget;
  execute(
    args: Record<string, any>,
    summarize?: (text: string, systemPrompt?: string) => Promise<string>,
    recordSource?: (source: ToolSource) => void
  ): Promise<string>;
}
