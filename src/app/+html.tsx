import { ScrollViewStyleReset } from "expo-router/html";
import { type PropsWithChildren } from "react";

const rootStyle = `
html,body{overscroll-behavior:none}
#root{overflow:hidden}
[data-chatbar-input]::-webkit-scrollbar{display:none}
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: rootStyle }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
