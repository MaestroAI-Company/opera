import type { Crash } from '../logging/CrashReporter';

const OWNER = 'MaestroAI-Company';
const REPO = 'opera';

//github caps prefill url length
const MAX_BODY = 6000;

//stack only useful near app frames
const MAX_STACK = 1500;

export interface ReportPayload {
  description: string;
  logs: string[] | null;
  deviceInfo: string;
  crash?: Crash | null;
}

function block(summary: string, content: string): string {
  return `<details><summary>${summary}</summary>\n\n\`\`\`\n${content}\n\`\`\`\n\n</details>`;
}

function buildBody(payload: ReportPayload): string {
  const parts = [payload.description.trim() || '_No description provided._'];

  if (payload.crash) {
    const stack = payload.crash.stack.slice(0, MAX_STACK);
    parts.push(`**Crashed at** ${payload.crash.at}`);
    parts.push(block('Stack trace', `${payload.crash.message}\n\n${stack}`));
  }

  parts.push(block('Device', payload.deviceInfo));

  //trim logs so body fences stay closed
  const room = MAX_BODY - parts.join('\n\n').length - 60;
  if (payload.logs?.length && room > 0) {
    let logs = payload.logs.join('\n');
    if (logs.length > room) logs = `_truncated_\n${logs.slice(-room)}`;
    parts.push(block(payload.crash ? 'Logs before the crash' : 'Logs', logs));
  }
  return parts.join('\n\n');
}

function buildTitle(payload: ReportPayload): string {
  const firstLine = payload.description.trim().split('\n')[0] || payload.crash?.message.split('\n')[0];
  if (!firstLine) return payload.crash ? 'Crash' : 'Bug report';
  const title = payload.crash ? `Crash: ${firstLine}` : firstLine;
  return title.length > 70 ? `${title.slice(0, 70)}...` : title;
}

//user submits the issue himself
export function buildIssueUrl(payload: ReportPayload): string {
  const params = new URLSearchParams({
    title: buildTitle(payload),
    body: buildBody(payload),
    labels: payload.crash ? 'bug report,crash' : 'bug report',
  });
  return `https://github.com/${OWNER}/${REPO}/issues/new?${params.toString()}`;
}
