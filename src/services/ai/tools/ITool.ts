import type React from 'react';
import type { TranslationKey } from '../../../i18n';

//tool call returned by ollama
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

//approval card shown in the reply
export interface ConsentPrompt {
  tool: string;
  title: TranslationKey;
  message: TranslationKey;
  params?: Record<string, string>;
  //adds a third button when set
  always?: TranslationKey;
}

export type ConsentAnswer = 'deny' | 'allow' | 'always';

//helpers the turn hands to a tool
export interface ToolContext {
  summarize?: (text: string, systemPrompt?: string) => Promise<string>;
  recordSource?: (source: ToolSource) => void;
  //vision call on the chat model
  describeImage?: (base64: string, prompt: string) => Promise<string>;
  //resolves on user card response
  askConsent?: (prompt: ConsentPrompt) => Promise<ConsentAnswer>;
  signal?: AbortSignal;
}

//renders tool result in reply
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
  //hidden from text only models
  requiresVision?: boolean;
  //optional ui for the tool result
  widget?: ToolWidget;
  execute(args: Record<string, any>, context?: ToolContext): Promise<string>;
}
