import { fetch } from 'expo/fetch';
import { IAIProvider } from './IAIProvider';

export class OllamaProvider implements IAIProvider {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;

  constructor(baseUrl: string, defaultHeaders: Record<string, string> = {}) {
    this.baseUrl = baseUrl;
    this.defaultHeaders = defaultHeaders;
  }

  private isConfigured(): boolean {
    return this.baseUrl.length > 0;
  }

  async isAvailable(): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      //check root endpoint
      const response = await fetch(this.baseUrl, { headers: this.defaultHeaders });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    if (!this.isConfigured()) return [];
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, { headers: this.defaultHeaders });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to fetch models: ${response.status} - ${text}`);
      }
      const data = await response.json();
      return data.models.map((m: any) => m.name);
    } catch (error) {
      console.error('Error fetching available models from Ollama:', error);
      return [];
    }
  }

  async preloadModel(modelName: string): Promise<void> {
    if (!this.isConfigured()) return;
    try {
      //preload model
      await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.defaultHeaders },
        body: JSON.stringify({
          model: modelName,
          //load without generating
        }),
      });
    } catch (error) {
      console.error('Error preloading Ollama model:', error);
    }
  }

  async getModelCapabilities(modelName: string): Promise<string[]> {
    if (!this.isConfigured()) return [];
    try {
      const response = await fetch(`${this.baseUrl}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.defaultHeaders },
        body: JSON.stringify({ model: modelName }),
      });
      if (!response.ok) return [];
      const data = await response.json();
      return data.capabilities || [];
    } catch (error) {
      console.error('Error fetching capabilities from Ollama:', error);
      return [];
    }
  }

  async downloadService(modelName: string): Promise<void> {
    if (!this.isConfigured()) throw new Error('AI server not configured');
    try {
      const response = await fetch(`${this.baseUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.defaultHeaders },
        body: JSON.stringify({
          name: modelName,
          stream: false
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to pull model: ${response.status} - ${text}`);
      }
    } catch (error) {
      console.error('Error pulling Ollama model:', error);
      throw error;
    }
  }

  async sendMessage(
    modelName: string,
    systemPrompt: string,
    messages: { role: string; content: string; images?: string[] }[],
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
    options?: { think?: boolean | string }
  ): Promise<void> {
    if (!this.isConfigured()) throw new Error('AI server not configured');
    try {
      const payload = {
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.map(m => ({
            ...m,
            images: m.images && m.images.length > 0 ? m.images : undefined
          }))
        ],
        stream: true,
        think: options?.think,
        options: { num_ctx: 16384 }
      };
      
      const logPayload = {
        ...payload,
        messages: payload.messages.map((m: any) => ({
          ...m,
          images: m.images && m.images.length > 0 ? ['<base64_data_hidden>'] : undefined
        }))
      };
      console.log('Ollama request payload:', JSON.stringify(logPayload, null, 2));

      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.defaultHeaders },
        body: JSON.stringify(payload),
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }

      if (!response.body) {
        throw new Error('No response body for streaming');
      }

      //read stream chunks
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunkText = decoder.decode(value, { stream: true });
        //split chunks by newline
        const lines = chunkText.split('\n').filter((line) => line.trim() !== '');
        
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.message?.content) {
              onChunk(parsed.message.content);
            }
          } catch (e) {
            //ignore incomplete json
            console.warn('Failed to parse Ollama chunk:', line);
          }
        }
      }
    } catch (error: any) {
      throw error;
    }
  }
}
