---
version: alpha
name: Opera
description: Warm editorial privacy-first design system for Opera, a local on-device AI assistant. The app is Opera; the assistant persona is Maestro.
colors:
  primary: "#FF1A1A"
  primary-pressed: "#D61515"
  primary-active: "#CC1414"
  primary-bright: "#FF4D4D"
  background: "#FFF5EC"
  background-splash: "#FDF8F1"
  surface: "#FFFFFF"
  surface-muted: "#F9F9F9"
  surface-subtle: "#F5F5F5"
  surface-pressed: "#EAEAEA"
  surface-code: "#F0F0F0"
  border: "#00000017"
  border-on-primary: "#FFFFFF52"
  text-primary: "#000000"
  text-secondary: "#222222"
  text-tertiary: "#333333"
  text-strong: "#444444"
  text-muted: "#555555"
  text-body: "#666666"
  text-faint: "#888888"
  text-disabled: "#999999"
  text-placeholder: "#AAAAAA"
  text-disabled-strong: "#BBBBBB"
  text-on-primary: "#FFFFFF"
  link: "#3B82F6"
  link-alt: "#0066CC"
  error: "#FF4444"
  danger-border: "#FF1A1A22"
  danger-bg: "#FFF0F0"
  danger-bg-soft: "#FFF5F5"
  danger-border-soft: "#FFCCCC"
  code-block-bg: "#1E1E1E"
  code-block-text: "#D4D4D4"
  code-inline-text: "#D63384"
  window-close: "#E81123"
  window-close-pressed: "#F1707A"
  incognito: "#565A75"
  incognito-pressed: "#3E4157"
  incognito-bright: "#70748E"
  incognito-surface: "#2A2A35"
  incognito-border: "#00000030"
typography:
  display-hero:
    fontFamily: Petrona
    fontSize: 48px
    lineHeight: 1.15
  display-lg:
    fontFamily: Petrona
    fontSize: 36px
    lineHeight: 1.15
  display-md:
    fontFamily: Petrona
    fontSize: 26px
    lineHeight: 1.2
  display-sm:
    fontFamily: Petrona
    fontSize: 22px
    lineHeight: 1.2
  title:
    fontFamily: IBMPlexMono-Medium
    fontSize: 17px
    fontWeight: 500
  label:
    fontFamily: IBMPlexMono-Medium
    fontSize: 12px
    fontWeight: 500
  label-sm:
    fontFamily: IBMPlexMono-Medium
    fontSize: 10px
    fontWeight: 500
  body:
    fontFamily: Jakarta
    fontSize: 15px
    lineHeight: 21px
  body-md:
    fontFamily: Jakarta
    fontSize: 14px
    lineHeight: 20px
  caption:
    fontFamily: Jakarta
    fontSize: 13px
  micro:
    fontFamily: Jakarta
    fontSize: 11px
  code:
    fontFamily: IBMPlexMono-Medium
    fontSize: 13px
    lineHeight: 18px
rounded:
  sm: 4px
  md: 5px
  lg: 6px
  xl: 8px
  xxl: 10px
  huge: 16px
  pill: 20px
spacing:
  xs2: 2px
  xs: 4px
  sm: 6px
  md: 8px
  lg: 10px
  lg2: 12px
  xl: 14px
  xl2: 16px
  xxl: 20px
  xxl2: 24px
  xxxl: 32px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.text-on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.xxl}"
    padding: 12px
  button-primary-pressed:
    backgroundColor: "{colors.primary-pressed}"
  button-ghost:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.label}"
    rounded: "{rounded.xxl}"
    padding: 12px
  button-ghost-pressed:
    backgroundColor: "{colors.surface-pressed}"
  button-danger:
    backgroundColor: "{colors.danger-bg}"
    textColor: "{colors.primary}"
    typography: "{typography.label}"
    rounded: "{rounded.xxl}"
    padding: 12px
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.body}"
    rounded: "{rounded.xxl}"
    padding: 12px
    height: 44px
  chat-input:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.text-on-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.xxl}"
    height: 56px
  user-bubble:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.text-on-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.xxl}"
  user-bubble-incognito:
    backgroundColor: "{colors.incognito}"
    textColor: "{colors.text-on-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.xxl}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xxl}"
    padding: 16px
  drawer:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xxl}"
  modal:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xxl}"
    padding: 16px
  code-block:
    backgroundColor: "{colors.code-block-bg}"
    textColor: "{colors.code-block-text}"
    typography: "{typography.code}"
    rounded: "{rounded.lg}"
  toggle:
    backgroundColor: "{colors.surface-subtle}"
    rounded: "{rounded.pill}"
    height: 26px
    width: 44px
  snackbar:
    backgroundColor: "{colors.text-tertiary}"
    textColor: "{colors.text-on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
---

## Overview

Opera is a local, on-device, privacy-respecting AI assistant. The app is **Opera**; the assistant persona inside it is **Maestro**. The UI reads as warm, editorial, and slightly technical: a cream canvas, a single bold red accent, serif display headings, and monospace UI chrome that evokes a terminal. Everything runs locally (Ollama, Whisper, Gemini Nano) and the copy consistently reinforces privacy ("no trace", "disappears forever"). The tagline is "AI for all, privacy for freedom", and a butterfly is the visual mascot.

Emotionally the app should feel trustworthy and calm — like a premium broadsheet, not a loud consumer app. Red is the only interaction color and must stay rare and intentional.

## Colors

The palette is rooted in a warm cream foundation, a single red accent, and a full purple-gray recolor for incognito mode.

- **Primary — Opera Red (#FF1A1A):** The sole interaction color. Drives primary actions, the chat composer, user chat bubbles, CTAs, and text selection. Use for the single most important action per screen; never for decoration.
- **Primary pressed/active (#D61515 / #CC1414):** Slightly darker red for pressed and active states of red surfaces.
- **Background (#FFF5EC):** A warm cream canvas, softer than white, giving the editorial feel. Every screen sits on it.
- **Surfaces (#FFFFFF + muted/subtle/pressed):** White cards and fields on the cream canvas; muted grays for pressed rows and subtle fills.
- **Text ramp (#000000 → #AAAAAA):** A ten-step neutral ramp from primary text down to placeholders. Full-black text on cream keeps maximum readability.
- **Incognito (#565A75):** A purple-gray identity that swaps out every red element when ephemeral mode is on. Base #565A75 acts like the red's role, with a dark surface #2A2A35 for the composer.
- **Link (#3B82F6):** Blue reserved for hyperlinks and "Confidentiality" links.
- **Code (#1E1E1E blocks / #D63384 inline):** Dark blocks with light-gray text; pink inline code.

## Typography

Three fonts with strict roles — never swap them.

- **Petrona (serif):** Display only. Drawer titles ("Settings", "Discussions"), conversation headers, welcome and onboarding screens. Sizes 22–48px. It carries the editorial, literary identity.
- **Plus Jakarta Sans:** Reading content. Chat bubbles, markdown body, captions, help text. Sizes 13–16px.
- **IBM Plex Mono (Medium):** UI chrome. Buttons, labels, nav items, timestamps, dropdown options, setting names, section headers. Sizes 10–17px. Its technical construction gives the terminal/engineer feel that matches a local AI tool.

## Layout

An 8px-based spacing scale with a 2px micro-step keeps rhythm consistent. Chat content is centered in a column capped at **840px**; messages and cards stay airy.

- Desktop: drawers and overlays become fixed **320px** floating panels; breakpoints are mobile <768px, desktop ≥1024px.
- The chat composer is a full-width **56px** pill pinned at the bottom.
- Phones lock to portrait.
- Group related controls in cards with 16px internal padding rather than dividers.

## Elevation & Depth

Depth comes from **2px sticker outlines and hard-offset shadows**, not heavy blur.

- Signature **"sticker shadow"**: a hard offset with zero blur in a near-invisible ink, e.g. `-6px 6px 0px #00000013` for desktop drawers.
- **Chat composer glow**: a colored shadow matching the fill (red in normal mode, purple in incognito) so the composer reads as the focal action.
- Floating menus and modals use `0px 4px 12px rgba(0,0,0,0.15)` with elevation 8.
- Chat lists fade at top and bottom with soft cream gradients rather than shadows.

## Shapes

The shape language is **sticker-like**: 2px outlines on nearly every interactive element, with a **10px default radius** for cards, inputs, buttons, and bubbles.

- `sm` 4px — checkboxes, inline code; `lg` 6px — code blocks; `xl` 8px — message images, dropdown options.
- `huge` 16px — 32×32 icon buttons and audio bubbles; `pill` 20px — toggles, snackbars, avatars.
- Don't mix sharp and rounded corners in the same view.

## Components

- **Buttons:** Primary is solid Opera Red with white mono text (pressed → #D61515). Ghost is white with a 2px ink outline and mono secondary text (pressed → surface-pressed). Danger is a soft red-tinted fill (#FFF0F0) with red mono text.
- **Input fields:** White bordered pills, 10px radius, mono 14px text, placeholder #AAAAAA, optional 18×18 leading icon.
- **Chat messages:** User messages are right-aligned red pills (10px radius, max-width 80%) with white Plus Jakarta Sans text — purple #565A75 in incognito. Assistant messages are transparent and full-width, rendered as markdown with no bubble.
- **Chat composer:** A 56px colored pill (red, or dark #2A2A35 incognito) with a glow shadow; white 16px text, 28×28 plus/mic/send icon buttons.
- **Code blocks:** Dark #1E1E1E background, #D4D4D4 text, 6px radius, mono 13px, VS2015-style highlighting. Inline code is #F0F0F0 with pink #D63384 text.
- **Drawers & modals:** White surfaces with scrims (drawer rgba(0,0,0,0.25), modal rgba(0,0,0,0.4)); drawers use the sticker shadow on desktop.
- **Snackbar:** A #333333 pill floating above the composer, white mono text.

## Do's and Don'ts

- Do use Opera Red only for the single most important action per screen.
- Do always pull values from the design tokens in `constants/theme.ts` (Colors, Fonts, FontSizes, Spacing, Radius) — never hardcode colors, fonts, or radii.
- Do use Petrona for display headings, Plus Jakarta Sans for reading, and IBM Plex Mono for UI chrome.
- Do keep the incognito recolor coherent: swap every red element to the purple-gray #565A75 family.
- Don't add heavy drop shadows; prefer sticker shadows and 2px outlines.
- Don't mix serif display and monospace in the same heading.
- Don't exceed the 10px default radius on data-dense cards.
- Do keep body text at WCAG AA contrast. Note: white text on Opera Red is ~3.9:1, so use red surfaces for large or bold text and chrome, not small body copy.
