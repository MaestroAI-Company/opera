import { Settings } from '../settings/SettingsService';

//chore target, undefined means active provider
export type QuickFlowTarget = {
  model: string;
  service?: string;
  url?: string;
};

//main model when none set
export function resolveQuickFlow(mainModel: string): QuickFlowTarget {
  const settings = Settings.getCached();
  const model = settings.quickFlowModel.trim();
  if (!model) return { model: mainModel };
  const service = settings.quickFlowService.trim();
  if (!service) return { model };
  return { model, service, url: settings.quickFlowUrl };
}

//stable id for the settings selector rows
export function quickFlowOptionId(service: string, url: string, model: string): string {
  return `${service}|${url}|${model}`;
}

export function parseQuickFlowOptionId(id: string): { service: string; url: string; model: string } {
  const first = id.indexOf('|');
  const second = id.indexOf('|', first + 1);
  if (first === -1 || second === -1) return { service: '', url: '', model: '' };
  //model keeps any remaining separator
  return { service: id.slice(0, first), url: id.slice(first + 1, second), model: id.slice(second + 1) };
}
