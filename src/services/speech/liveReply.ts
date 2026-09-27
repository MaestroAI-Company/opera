import { GenerationService, Run } from '../ai/generation/GenerationService';
import { Settings } from '../settings/SettingsService';
import { TTS } from './TTSService';

//speaks the reply as it streams
export function speakReplyLive(msgId: string): (run: Run) => void {
  const live = TTS.speakLive({ language: Settings.getCached().language, id: msgId });
  const unsubscribe = GenerationService.subscribe((run) => {
    if (run.msgId === msgId && run.status === 'streaming') live.update(run.content);
  });
  return (run) => {
    unsubscribe();
    if (run.status === 'error') live.cancel();
    else live.finish(run.content);
  };
}
