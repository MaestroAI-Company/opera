import { extractThinkStep } from '../../components/ui/MarkdownText';
import { GenerationService, Run } from '../ai/generation/GenerationService';
import { NotificationService } from './NotificationService';

const UPDATE_INTERVAL_MS = 800;
const IDLE_BODY = 'Generating the answer…';

function stepFrom(content: string): string {
  const matches = [...content.matchAll(/<think>([\s\S]*?)(?:<\/think>|$)/g)];
  const thinking = matches.map(m => m[1].trim()).filter(t => t.length > 0).join('\n');
  return thinking.length > 0 ? extractThinkStep(thinking) : '';
}

class BackgroundGenerationImpl {
  private convId: string | null = null;
  private prompt = '';
  private lastBody = '';
  private lastUpdate = 0;

  isRunning(): boolean {
    return this.convId !== null;
  }

  //the run lives in the shade
  begin(convId: string) {
    const run = GenerationService.get(convId);
    if (!run) return false;
    this.convId = convId;
    this.prompt = run.prompt;
    this.lastUpdate = Date.now();
    this.push(IDLE_BODY);
    return true;
  }

  //overlay back in front again
  cancel() {
    const convId = this.convId;
    if (!convId) return;
    this.convId = null;
    NotificationService.cancelGenerationProgress(convId).catch(() => { });
  }

  onRun(run: Run) {
    if (run.convId !== this.convId) return;
    if (run.status === 'streaming') {
      this.update(run.content);
      return;
    }
    this.finish(run);
  }

  private update(content: string) {
    //scanning the whole stream is costly
    const now = Date.now();
    if (now - this.lastUpdate < UPDATE_INTERVAL_MS) return;
    this.lastUpdate = now;
    const body = stepFrom(content);
    if (!body || body === this.lastBody) return;
    this.push(body);
  }

  private finish(run: Run) {
    const convId = run.convId;
    const prompt = this.prompt;
    this.convId = null;
    //nothing to announce on user stop
    if (run.status === 'aborted') {
      NotificationService.cancelGenerationProgress(convId).catch(() => { });
      return;
    }
    //alert before stopping the service
    NotificationService.displayGenerationFinished(convId, prompt, run.status === 'error')
      .then(() => NotificationService.cancelGenerationProgress(convId))
      .catch(() => { });
  }

  private push(body: string) {
    this.lastBody = body;
    NotificationService.displayGenerationProgress(this.convId!, this.prompt, body).catch(() => { });
  }
}

export const BackgroundGeneration = new BackgroundGenerationImpl();

//notification mirrors the run
GenerationService.subscribe(run => BackgroundGeneration.onRun(run));
