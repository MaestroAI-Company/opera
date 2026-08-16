import Head from "expo-router/head";
import { Platform } from "react-native";

const SITE_NAME = "Opera";
const SITE_TITLE = "Opera - MaestroAI";
const SITE_DESCRIPTION =
  "AI for all, privacy for freedom";

export default function SiteHead() {
  if (Platform.OS !== "web") return null;
  return (
    <Head>
      <title>{SITE_TITLE}</title>
      <meta name="description" content={SITE_DESCRIPTION} />
      <meta name="application-name" content={SITE_NAME} />
      <meta name="theme-color" content="#FDF8F1" />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={SITE_TITLE} />
      <meta property="og:description" content={SITE_DESCRIPTION} />
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content={SITE_TITLE} />
      <meta name="twitter:description" content={SITE_DESCRIPTION} />
      <meta name="apple-mobile-web-app-title" content={SITE_NAME} />
      <meta name="apple-mobile-web-app-capable" content="yes" />
    </Head>
  );
}
