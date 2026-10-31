import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import WebView from 'react-native-webview';
import { RunningTask, WebViewRunner } from '../src/services/webview/WebViewRunner';

//offscreen browser shared by every service that needs one (search, page fetch, pdf parsing)
export default function HeadlessWebView() {
  const [tasks, setTasks] = useState<RunningTask[]>([]);

  useEffect(() => WebViewRunner.subscribe(setTasks), []);

  if (tasks.length === 0) return null;

  return (
    <View style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} pointerEvents="none">
      {tasks.map(({ id, task }) => (
        <WebView
          key={id}
          source={'uri' in task.source ? { uri: task.source.uri } : { html: task.source.html, baseUrl: 'about:blank' }}
          userAgent={task.userAgent}
          injectedJavaScript={task.injectedJavaScript}
          onMessage={(event) => WebViewRunner.deliver(id, event.nativeEvent.data)}
          onError={(event) => WebViewRunner.fail(id, new Error(event.nativeEvent.description || 'WebView load failed'))}
          onHttpError={(event) => WebViewRunner.fail(id, new Error(`HTTP ${event.nativeEvent.statusCode}`))}
          javaScriptEnabled
          domStorageEnabled={false}
          thirdPartyCookiesEnabled={false}
          incognito
          cacheEnabled={false}
        />
      ))}
    </View>
  );
}
