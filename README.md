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

Opera is a local, on-device AI assistant. Talk to it through Ollama, an on-device model, or Android's built-in Gemini Nano — no account, no server required unless you choose one.

## Features

| | |
|---|---|
| Model providers | Ollama, on-device (ExecuTorch + Whisper), or Android AICore (Gemini Nano) — picked per conversation |
| Tools | weather, math, calendar, contacts, alarms, clipboard, opening apps, sending messages, fetching pages, web search |
| MCP support | any OAuth-aware [Model Context Protocol](https://modelcontextprotocol.io) server plugs in and its tools show up in chat |
| OS-level integration | default Android assistant, voice interaction, screen capture, on-screen text/object selection, overlay UI |
| Structured widgets | weather, maps, HTML and Mermaid diagrams render as widgets, not raw text |
| Sync & backup | Google Drive / Nextcloud sync, end-to-end encrypted backups, PrivateBin-style encrypted share links |
| Incognito mode | UI recolors purple-gray for conversations that leave no trace |

## Stack

| Layer | Technology |
|---|---|
| Mobile / Web UI | Expo (SDK 57), React Native, `expo-router`, React 19 |
| Local database | SQLite (`expo-sqlite`) |
| On-device AI | `react-native-executorch`, Whisper, Android AICore (Gemini Nano) |
| Native Android | Kotlin / Java (voice interaction, screen capture, overlays) |
| Language | TypeScript, strict |

An experimental desktop build also exists via Tauri (`npm run desktop`).

<details>
<summary><strong>Project structure</strong></summary>

```
src/
  app/                 expo-router screens (chat, onboarding, settings entry points)
  components/
    features/          feature UI (chat, drawers, overlay, settings sheets…)
    ui/                 design-system primitives (buttons, inputs, cards…)
    toolwidgets/        shared blocks used by structured tool-result widgets
    widgets/            weather / maps / html / mermaid widgets
  services/
    ai/                 providers (Ollama, AICore, local), tools, generation pipeline, MCP client
    cloud/, crypto/     cloud sync providers + encrypted backup
    db/                 SQLite-backed conversation storage
    speech/             STT / TTS
    overlay/            screen capture, selection, object detection
    settings/, share/, notifications/, ...
  hooks/, constants/     shared hooks and design tokens (constants/theme.ts)

native/android/         native Kotlin/Java modules (assistant service, overlay, screen capture)
plugins/                 custom Expo config plugins
design/                  standalone design system showcase (index.html)
assets/                  icons, images, fonts, animations, on-device models
```

</details>

## Getting started

**Prerequisites** — Node.js & npm, [Expo CLI](https://docs.expo.dev/more/expo-cli/) (via `npx`), and for native builds: Android Studio/SDK.

```bash
npm install

npm start          # Expo dev server — scan the QR, or press a/w for android/web
npm run android    # run on a connected device/emulator
npm run web        # run in the browser
```

Then, only if you need it:

```bash
cp .env.example .env   # Google Drive OAuth vars — irrelevant for plain local dev
```

**Building for real:**

```bash
npm run build:android   # Expo prebuild + Gradle release APK
npm run lint             # ESLint
```

Coding conventions for this repo are in [AGENTS.md](./AGENTS.md); the visual language — colors, type, spacing, component specs — is documented separately in [DESIGN.md](./DESIGN.md).

## License

[AGPLv3](./LICENSE) — if you run a modified version of Opera as a network service, you must make your source available too.
