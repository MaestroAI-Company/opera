import {
    ScrollViewStyleReset,
    useServerDocumentContext,
} from "expo-router/html";
import { type PropsWithChildren } from "react";

const rootStyle = `
html,body{overscroll-behavior:none}
#root{overflow:hidden}
/*selection opt in like native, only selectable texts and fields*/
#root{-webkit-user-select:none;user-select:none}
input,textarea{-webkit-user-select:text;user-select:text}
[data-chatbar-input]::-webkit-scrollbar{display:none}
`;

export default function Root({ children }: PropsWithChildren) {
  const { bodyAttributes, bodyNodes, htmlAttributes, headNodes } =
    useServerDocumentContext();

  return (
    <html lang="en" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <ScrollViewStyleReset />
        {headNodes}
        <style dangerouslySetInnerHTML={{ __html: rootStyle }} />
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
