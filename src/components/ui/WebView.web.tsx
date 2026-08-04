import React, { useEffect, useRef } from "react";
import { StyleSheet } from "react-native";

// iframe shim for react-native-webview (no web build in v13)
// bridge postMessage between iframe and parent

type WebViewSource = { html?: string; baseUrl?: string; uri?: string };

type WebViewMessageEvent = { nativeEvent: { data: string } };

type WebViewProps = {
  source?: WebViewSource;
  onMessage?: (event: WebViewMessageEvent) => void;
  style?: any;
  scrollEnabled?: boolean;
  originWhitelist?: string[];
  viewportContent?: string;
  scalesPageToFit?: boolean;
  injectedJavaScript?: string;
};

function toCssStyle(style: any): Record<string, string | number> {
  const flat = StyleSheet.flatten(style) || {};
  const out: Record<string, string | number> = {};
  for (const key of Object.keys(flat)) {
    const value = flat[key];
    if (key === "flex" && typeof value === "number") {
      out[key] = value;
    } else if (typeof value === "number") {
      out[key] = `${value}px`;
    } else {
      out[key] = value;
    }
  }
  return out;
}

function WebView({ source, onMessage, style }: WebViewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (iframeRef.current && e.source === iframeRef.current.contentWindow) {
        onMessage?.({ nativeEvent: { data: e.data } });
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onMessage]);

  if (!source || !source.html) return null;

  const bridge = '<script>window.ReactNativeWebView={postMessage:function(data){window.parent.postMessage(data,"*")}}</script>';
  const html = source.html.includes("<head>") ? source.html.replace("<head>", `<head>${bridge}`) : bridge + source.html;

  return (
    <iframe
      ref={iframeRef}
      srcDoc={html}
      title="webview"
      style={{ border: "none", display: "block", ...toCssStyle(style) }}
    />
  );
}

export { WebView };
export default WebView;
