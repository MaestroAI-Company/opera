import { fetch as expoFetch } from 'expo/fetch';

export async function universalFetch(input: string | URL | Request, init?: any): Promise<Response> {
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
