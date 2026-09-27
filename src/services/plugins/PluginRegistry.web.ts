//consent records a tool approval
type PluginType = 'tool' | 'widget' | 'consent';

// manages enabled/disabled state for tools and widgets on web (localStorage)
class PluginRegistryService {
  // key: "tool:name" or "widget:id", value: enabled boolean
  private cache: Map<string, boolean> = new Map();

  async init(): Promise<void> {
    await this.loadAll();
  }

  // load all stored states from localStorage into cache
  async loadAll(): Promise<void> {
    try {
      const stored = localStorage.getItem('opera_plugin_registry');
      if (!stored) return;
      const parsed = JSON.parse(stored);
      for (const key of Object.keys(parsed)) {
        this.cache.set(key, parsed[key] === true);
      }
    } catch (e) {
      console.error('PluginRegistry loadAll failed:', e);
    }
  }

  // check if a plugin is enabled; falls back to defaultEnabled if no stored value
  isEnabled(type: PluginType, id: string, defaultEnabled: boolean): boolean {
    const key = `${type}:${id}`;
    if (this.cache.has(key)) return this.cache.get(key)!;
    return defaultEnabled;
  }

  // persist and cache a new enabled state
  async setEnabled(type: PluginType, id: string, enabled: boolean): Promise<void> {
    const key = `${type}:${id}`;
    this.cache.set(key, enabled);
    try {
      const obj: Record<string, boolean> = {};
      this.cache.forEach((v, k) => { obj[k] = v; });
      localStorage.setItem('opera_plugin_registry', JSON.stringify(obj));
    } catch (e) {
      console.error('PluginRegistry setEnabled failed:', e);
    }
  }
}

export const PluginRegistry = new PluginRegistryService();
