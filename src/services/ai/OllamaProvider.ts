import { fetch as expoFetch } from 'expo/fetch';
import { IAIProvider } from './IAIProvider';
import { NotificationService } from '../notifications/NotificationService';

async function universalFetch(input: string | URL | Request, init?: any): Promise<Response> {
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  
  if (isTauri) {
    try {
      const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
      const customInit = { ...(init || {}) };
      let headers: any = {};
      if (customInit.headers) {
        if (customInit.headers instanceof Headers) {
          customInit.headers.forEach((value: string, key: string) => { headers[key] = value; });
        } else {
          headers = { ...customInit.headers };
        }
      }
      headers['Origin'] = 'http://localhost';
      customInit.headers = headers;
      
      const res = await tauriFetch(input as any, customInit);
      return res;
    } catch (e: any) {
      console.warn("Tauri Fetch Error:", e);
      throw e;
    }
  }
  
  return expoFetch(input, init);
}


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
      const response = await universalFetch(this.baseUrl, { headers: this.defaultHeaders });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    if (!this.isConfigured()) return [];
    try {
      const response = await universalFetch(`${this.baseUrl}/api/tags`, { headers: this.defaultHeaders });
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
      await universalFetch(`${this.baseUrl}/api/generate`, {
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
      const response = await universalFetch(`${this.baseUrl}/api/show`, {
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

  async downloadService(modelName: string, onProgress?: (progress: number, etaSeconds: number, speedStr: string, sizeStr: string) => void): Promise<void> {
    if (!this.isConfigured()) throw new Error('AI server not configured');
    try {
      const response = await universalFetch(`${this.baseUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.defaultHeaders },
        body: JSON.stringify({
          name: modelName,
          stream: true
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to pull model: ${response.status} - ${text}`);
      }

      if (!response.body) {
        throw new Error('No response body for streaming');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');

      const startTime = Date.now();

      const formatBytes = (bytes: number) => {
        if (bytes === 0 || !bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
      };

      const downloadId = `ollama-${modelName}`;

      let lastCompleted = -1;
      let lastTime = Date.now();
      let smoothedSpeed = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunkText = decoder.decode(value, { stream: true });
        const lines = chunkText.split('\n').filter((line) => line.trim() !== '');

        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.total && parsed.completed !== undefined) {
              const now = Date.now();

              if (lastCompleted === -1 || parsed.completed < lastCompleted) {
                // First chunk or switched to a new layer
                lastCompleted = parsed.completed;
                lastTime = now;
                smoothedSpeed = 0;
              } else {
                const elapsedSeconds = (now - lastTime) / 1000;
                if (elapsedSeconds >= 0.5) { 
                  const currentSpeed = (parsed.completed - lastCompleted) / elapsedSeconds;
                  smoothedSpeed = smoothedSpeed === 0 ? currentSpeed : smoothedSpeed * 0.7 + currentSpeed * 0.3;
                  lastCompleted = parsed.completed;
                  lastTime = now;
                }
              }

              const etaSeconds = smoothedSpeed > 0 ? (parsed.total - parsed.completed) / smoothedSpeed : 0;
              
              const sizeStr = `${formatBytes(parsed.completed)} / ${formatBytes(parsed.total)}`;
              const speedStr = smoothedSpeed > 0 ? `${formatBytes(smoothedSpeed)}/s` : 'Calcul...';
              const progress = parsed.total > 0 ? parsed.completed / parsed.total : 0;
              
              if (onProgress) {
                onProgress(progress, etaSeconds, speedStr, sizeStr);
              }
              
              NotificationService.displayDownloadProgress(
                downloadId,
                `Ollama ${modelName}`,
                progress,
                etaSeconds,
                speedStr,
                sizeStr
              );
            }
          } catch (e) {
            //ignore incomplete json
          }
        }
      }
      await NotificationService.displayDownloadFinished(downloadId, `Ollama ${modelName}`);
    } catch (error) {
      console.error('Error pulling Ollama model:', error);
      await NotificationService.cancelNotification(`ollama-${modelName}`);
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

      const response = await universalFetch(`${this.baseUrl}/api/chat`, {
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
      
      let isThinkingMode = false;
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunkText = decoder.decode(value, { stream: true });
        //split chunks by newline
        const lines = chunkText.split('\n').filter((line) => line.trim() !== '');
        
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            
            if (parsed.message) {
              // handle thinking stream
              if (typeof parsed.message.thinking === 'string' && parsed.message.thinking.length > 0) {
                if (!isThinkingMode) {
                  onChunk("<think>\n");
                  isThinkingMode = true;
                }
                onChunk(parsed.message.thinking);
              }
              
              // handle actual content stream
              if (typeof parsed.message.content === 'string' && parsed.message.content.length > 0) {
                if (isThinkingMode) {
                  onChunk("\n</think>\n");
                  isThinkingMode = false;
                }
                onChunk(parsed.message.content);
              }
            }
          } catch (e) {
            //ignore incomplete json
            console.warn('Failed to parse Ollama chunk:', line);
          }
        }
      }
      
      // close thinking mode if stream ended abruptly
      if (isThinkingMode) {
        onChunk("\n</think>\n");
      }
    } catch (error: any) {
      throw error;
    }
  }
}
