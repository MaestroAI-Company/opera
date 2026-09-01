import Constants from 'expo-constants';
import { useCallback, useState } from 'react';
import { Linking, Platform } from 'react-native';
import { buildIssueUrl } from '../services/github/GitHubIssues';
import type { Crash } from '../services/logging/CrashReporter';
import { getRelevantLogs } from '../services/logging/Logger';
import { t } from '../i18n';
import { copyScreenshot } from '../services/logging/ReportScreenshot';

export type NotifyFn = (title: string, message: string, buttons?: { text: string; onPress: () => void }[]) => void;

//log lines attached per report
export const REPORT_LOG_LINES = 20;



//shared by shake sheet and settings
export function useBugReport(notify: NotifyFn) {
  const [text, setText] = useState("");
  const [logs, setLogs] = useState<string[] | null>(null);
  const [crash, setCrash] = useState<Crash | null>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);

  //crash ships its own captured logs
  const reset = useCallback((pendingCrash: Crash | null = null, shot: string | null = null) => {
    setText("");
    setCrash(pendingCrash);
    setScreenshot(shot);
    setLogs(pendingCrash ? pendingCrash.logs : getRelevantLogs(REPORT_LOG_LINES));
  }, []);

  const toggleLogs = useCallback((attach: boolean) => {
    if (!attach) return setLogs(null);
    setLogs(crash ? crash.logs : getRelevantLogs(REPORT_LOG_LINES));
  }, [crash]);

  const send = useCallback(async (onSent?: () => void) => {
    if (!text.trim() && !crash) {
      notify(t("bugReport.empty.title"), t("bugReport.empty.message"));
      return;
    }
    //clipboard set before github opens
    if (screenshot) await copyScreenshot(screenshot);

    const url = buildIssueUrl({
      description: text,
      logs,
      crash,
      deviceInfo: `${Platform.OS} ${Platform.Version} — Opera ${Constants.expoConfig?.version ?? "?"}`,
    });
    Linking.openURL(url).catch(() => notify(t("bugReport.githubFailed.title"), t("bugReport.githubFailed.message")));
    reset();
    onSent?.();
  }, [text, logs, crash, screenshot, notify, reset]);

  return {
    text, setText,
    logs, toggleLogs,
    crash,
    screenshot, setScreenshot,
    send, reset,
  };
}
