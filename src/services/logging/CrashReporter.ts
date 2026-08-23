import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { getRelevantLogs } from './Logger';

const FILE_NAME = 'pending-crash.json';
const WEB_KEY = 'pending_crash';

//buffer dies with the crash
const CRASH_LOG_LINES = 40;

export interface Crash {
  message: string;
  stack: string;
  at: string;
  logs: string[];
}

function crashFile(): File {
  return new File(Paths.document, FILE_NAME);
}

//dying process needs sync writes
function save(error: Error) {
  const crash: Crash = {
    message: error?.message || String(error),
    stack: error?.stack ?? '',
    at: new Date().toISOString(),
    logs: getRelevantLogs(CRASH_LOG_LINES),
  };
  try {
    const json = JSON.stringify(crash);
    if (Platform.OS === 'web') localStorage.setItem(WEB_KEY, json);
    else crashFile().write(json);
  } catch {
    //app is going down anyway
  }
}

//file consumed on first read
let taken: Crash | null | undefined;

function readCrash(): Crash | null {
  try {
    let json: string | null = null;
    if (Platform.OS === 'web') {
      json = localStorage.getItem(WEB_KEY);
      localStorage.removeItem(WEB_KEY);
    } else {
      const file = crashFile();
      if (!file.exists) return null;
      json = file.textSync();
      file.delete();
    }
    return json ? (JSON.parse(json) as Crash) : null;
  } catch {
    return null;
  }
}

//a crash is offered once per launch
export function takePendingCrash(): Crash | null {
  if (taken === undefined) taken = readCrash();
  return taken;
}

export function installCrashHandler() {
  if (Platform.OS === 'web') {
    window.addEventListener('error', (e) => save(e.error ?? new Error(e.message)));
    window.addEventListener('unhandledrejection', (e) => save(e.reason instanceof Error ? e.reason : new Error(String(e.reason))));
    return;
  }

  const previous = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    //non fatal errors already buffered
    if (isFatal) save(error);
    previous?.(error, isFatal);
  });
}
