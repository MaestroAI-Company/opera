<div align="center">
  <img src="./public/og-image.png" alt="Opera" width="420" />

  # Opera

  **AI for all, privacy for freedom.**

  *The app is Opera. The assistant living inside it is called* **Maestro**.

  [maestroai.company](https://maestroai.company)

  <p>
    <img alt="platform" src="https://img.shields.io/badge/platform-Android%20%7C%20Web-FF1A1A?style=flat-square">
    <img alt="Expo" src="https://img.shields.io/badge/Expo-SDK%2057-000020?style=flat-square&logo=expo&logoColor=white">
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white">
    <img alt="License" src="https://img.shields.io/badge/license-AGPLv3-333333?style=flat-square">
  </p>
</div>

Opera is a privacy-first AI assistant. Run a model on the device itself, on your own Ollama server, or on any OpenAI-compatible endpoint — no account, and nothing leaves your device unless you pick an online model, a cloud sync or a web search.

## Features

| | |
|---|---|
| Model providers | **Built-in** (Gemini Nano via Android AICore, or the browser's built-in model on web), **On-Device** (Hugging Face `.litertlm` models run with LiteRT-LM), **Ollama**, **OpenAI-compatible** (Mistral, LM Studio…) |
| Tools | web search (DuckDuckGo), page fetching, math, clipboard, opening apps, sending messages, contacts, calendar, alarms, Android settings panels - each can be toggled on or off |
| MCP support | any OAuth-aware [Model Context Protocol](https://modelcontextprotocol.io) server plugs in and its tools show up in chat; tools can be `@mentioned` |
| Attachments | camera, photos, and documents (PDF, DOCX, plain text) |
| Voice | dictation through the system speech recognizer, or raw audio sent to models that accept it; Whisper runs in the browser on web; replies can be read aloud |
| Android integration | default assistant role, overlay over any app, screen capture with on-screen text selection and object detection, home-screen quick actions |
| Rich replies | Markdown with KaTeX math and code highlighting, citations, reply suggestions; weather, maps, HTML and Mermaid widgets |
| Sync & backup |Nextcloud/Google Drive sync encrypted with a PIN, local JSON export / import |
| Sharing | conversations shared as encrypted [PrivateBin](https://privatebin.info) links, key kept in the URL fragment, instance configurable |
| Incognito mode | conversations that are never written to history |
| Languages | English, French |

## Stack

| Layer | Technology |
|---|---|
| Mobile / Web UI | Expo (SDK 57), React Native, `expo-router`, React 19 |
| Local database | SQLite (`expo-sqlite`) |
| On-device AI | LiteRT-LM (`react-native-litert-lm`), Android AICore (Gemini Nano), ExecuTorch (on-screen object detection), Whisper via `@xenova/transformers` (web) |
| Native Android | Kotlin / Java (voice interaction service, overlay, screen capture, text selection, AICore bridge) |
| Crypto | `react-native-quick-crypto` / WebCrypto |
| Language | TypeScript, strict |

<details>
<summary><strong>Project structure</strong></summary>

```
src/
  app/                 expo-router screens (chat, onboarding, oauth redirects)
  components/
    features/          feature UI (chat, drawers, overlay, settings sheets…)
    ui/                design-system primitives (buttons, inputs, cards…)
    toolwidgets/       shared blocks used by tool-result widgets
    widgets/           weather / maps / html / mermaid widgets
  services/
    ai/                providers, tools, generation pipeline, mentions, quick flow
    mcp/               MCP client, OAuth, server storage
    cloud/, crypto/    cloud sync providers and encrypted backup
    db/                SQLite-backed conversation storage
    speech/            STT / TTS
    overlay/           screen capture, text selection, object detection
    documents/         PDF / DOCX extraction
    share/             PrivateBin share links
    settings/, notifications/, updates/, ...
  hooks/               shared hooks
  i18n/                en / fr catalogs

constants/             design tokens (theme.ts) and system prompts
native/android/        native Kotlin/Java modules (assistant service, overlay, screen capture)
plugins/               custom Expo config plugins
src-tauri/             desktop shell
design/                design system rules (DESIGN.md)
assets/                icons, images, fonts, animations, on-device models
```

</details>

## Getting started

**Prerequisites** — Node.js & npm, [Expo CLI](https://docs.expo.dev/more/expo-cli/) (via `npx`), and for native builds: Android Studio/SDK. The desktop build also needs a Rust toolchain.

```bash
npm install

npm start          # Expo dev server — scan the QR, or press a/w for android/web
npm run android    # run on a connected device/emulator
npm run web        # run in the browser
```

**Dev builds on Android** — debug builds install as **Opera Dev** (`ai.maestro.opera.dev`, blue icon), so they sit next to the Play Store version instead of clashing with its signature. Expo CLI doesn't see the suffix, so launch with `--app-id` (the npm scripts already pass it):

```bash
npm run android           # debug build, JS served by Metro
npm run android:preview   # release build (R8, bundled JS, no Metro) for testing real performance, e.g. on-device AI
```

Both share the same app slot and data, so downloaded models survive switching between them. Once installed, JS-only changes just need `npm start` and opening Opera Dev; rebuild only after native changes (plugins, `app.json`, Kotlin modules, native deps).

Then, only if you need it:

```bash
cp .env.example .env   # Google Drive OAuth and beta server vars — irrelevant for plain local dev
```

**Building for real:**

```bash
npm run build:android   # Expo prebuild + Gradle release APK
npm run lint            # ESLint
```

Coding conventions for this repo are in [AGENTS.md](./AGENTS.md); the visual language — colors, type, spacing, component specs — is documented separately in [DESIGN.md](./DESIGN.md).

## License

[AGPLv3](./LICENSE) — if you run a modified version of Opera as a network service, you must make your source available too.
