import { ITool, ToolDefinition } from '../ai/tools/ITool';
import { McpToolInfo } from './types';

//ollama rejects names outside this alphabet
function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

//keep server tools apart so two servers can expose the same tool name
export function buildToolName(serverName: string, toolName: string): string {
  return `mcp_${slug(serverName)}_${slug(toolName)}`.slice(0, 64);
}

//wraps one remote mcp tool so the rest of the app sees a normal tool
export class McpTool implements ITool {
  definition: ToolDefinition;
  displayName: string;
  displayDescription?: string;
  enabledByDefault = true;

  constructor(
    public serverId: string,
    public serverLabel: string,
    public remoteName: string,
    info: McpToolInfo,
    private invoke: (serverId: string, remoteName: string, args: Record<string, any>) => Promise<string>,
  ) {
    const schema = info.inputSchema ?? {};
    this.displayName = info.title ?? info.name;
    this.displayDescription = info.description;
    this.definition = {
      type: 'function',
      function: {
        name: buildToolName(serverLabel, info.name),
        description: info.description ?? info.name,
        parameters: {
          type: 'object',
          properties: schema.properties ?? {},
          required: schema.required ?? [],
        },
      },
    };
  }

  async execute(args: Record<string, any>): Promise<string> {
    return this.invoke(this.serverId, this.remoteName, args);
  }
}
