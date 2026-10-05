---
version: alpha
name: Opera
description: Warm editorial privacy-first design system for Opera, a local on-device AI assistant. The app is Opera; the assistant persona is Maestro.
colors:
  primary: "#FF1A1A"
  primary-pressed: "#D61515"
  primary-active: "#CC1414"
  primary-bright: "#FF4D4D"
  background: "#FDF8F1"
  surface: "#FFFFFF"
  surface-muted: "#F9F9F9"
  surface-subtle: "#F5F5F5"
  surface-pressed: "#EAEAEA"
  surface-code: "#F0F0F0"
  border: "#00000017"
  border-on-primary: "#FFFFFF52"
  shadow-ink: "#00000013"
  text-primary: "#000000"
  text-secondary: "#444444"
  text-muted: "#888888"
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
    fontFamily: FragmentMono
    fontSize: 17px
    fontWeight: 500
  label:
    fontFamily: FragmentMono
    fontSize: 12px
    fontWeight: 500
  label-sm:
    fontFamily: FragmentMono
    fontSize: 10px
    fontWeight: 500
  body:
    fontFamily: Figtree
    fontSize: 15px
    lineHeight: 21px
  body-md:
    fontFamily: Figtree
    fontSize: 14px
    lineHeight: 20px
  caption:
    fontFamily: Figtree
    fontSize: 13px
  micro:
    fontFamily: Figtree
    fontSize: 11px
  code:
    fontFamily: FragmentMono
    fontSize: 13px
    lineHeight: 18px
rounded:
  sm: 4px
  md: 5px
  lg: 6px
  xl: 8px
  xxl: 10px
  window: 15px
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
    rounded: "{rounded.window}"
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
- **Background (#FDF8F1):** A warm cream canvas, softer than white, giving the editorial feel. Every screen sits on it.
- **Surfaces (#FFFFFF + muted/subtle/pressed):** White cards and fields on the cream canvas; muted grays for pressed rows and subtle fills.
- **Text ramp (#000000 → #888888):** Three neutral steps — primary (#000000), secondary (#444444) and muted (#888888) — plus white on colored surfaces. Full-black text on cream keeps maximum readability. Do not introduce intermediate greys outside these tokens.
- **Incognito (#565A75):** A purple-gray identity that swaps out every red element when ephemeral mode is on. Base #565A75 acts like the red's role, with a dark surface #2A2A35 for the composer.
- **Link (#3B82F6):** Blue reserved for hyperlinks and "Confidentiality" links.
- **Code (#1E1E1E blocks / #D63384 inline):** Dark blocks with light-gray text; pink inline code.

## Typography

Three fonts with strict roles — never swap them.

- **Petrona (serif):** Display only. Drawer titles ("Settings", "Discussions"), conversation headers, welcome and onboarding screens. Sizes 22–48px. It carries the editorial, literary identity.
- **Figtree:** Reading content. Chat bubbles, markdown body, captions, help text. Sizes 13–16px.
- **Fragment Mono:** UI chrome. Buttons, labels, nav items, timestamps, dropdown options, setting names, section headers. Sizes 10–17px. Its technical construction gives the terminal/engineer feel that matches a local AI tool.

## Layout

An 8px-based spacing scale with a 2px micro-step keeps rhythm consistent. Chat content is centered in a column capped at **840px**; messages and cards stay airy.

- Breakpoints are mobile <768px, large screen ≥768px, desktop ≥1024px (web and desktop apps). Drawer layouts per breakpoint are in Drawers.
- The chat composer is a full-width **56px** pill pinned at the bottom.
- Phones lock to portrait.
- Group related controls in section cards rather than dividers (see Page Structure).

## Elevation & Depth

Depth comes from **2px sticker outlines and hard-offset shadows**, not heavy blur.

- Signature **"sticker shadow"**: a hard offset with zero blur in a near-invisible ink, e.g. `-6px 6px 0px #00000013` for desktop drawers.
- **Chat composer glow**: a colored shadow matching the fill (red in normal mode, purple in incognito) so the composer reads as the focal action.
- Floating menus and modals use `0px 4px 12px rgba(0,0,0,0.15)` with elevation 8.
- Chat lists fade at top and bottom with soft cream gradients rather than shadows.

## Shapes

The shape language is **sticker-like**: 2px outlines on nearly every interactive element, with a **10px default radius** for cards, inputs, buttons, and bubbles.

- `sm` 4px — checkboxes, inline code; `lg` 6px — code blocks; `xl` 8px — message images, dropdown options.
- `window` 15px — confirmation/info modal windows only, with buttons and inputs inside staying at the 10px default.
- `huge` 16px — 32×32 icon buttons and audio bubbles; `pill` 20px — toggles, snackbars, avatars.
- Don't mix sharp and rounded corners in the same view.

## Components

- **Buttons:** Primary is solid Opera Red with white mono text (pressed → #D61515). Ghost is white with a 2px ink outline and mono secondary text (pressed → surface-pressed). Danger is a soft red-tinted fill (#FFF0F0) with red mono text.
- **Input fields:** A borderless 44px row, mono 14px text, placeholder `text-muted`, optional 18×18 leading icon. The outline and 10px radius come from the `Group` around it (see Component Placement).
- **Chat messages:** User messages are right-aligned red pills (10px radius, max-width 80%) with white Figtree text — purple #565A75 in incognito. Assistant messages are transparent and full-width, rendered as markdown with no bubble.
- **Chat composer:** A 56px colored pill (red, or dark #2A2A35 incognito) with a glow shadow; white 16px text, 28×28 plus/mic/send icon buttons.
- **Code blocks:** Dark #1E1E1E background, #D4D4D4 text, 6px radius, mono 13px, VS2015-style highlighting. Inline code is #F0F0F0 with pink #D63384 text.
- **Drawers & modals:** Drawers and sheets sit on the grouped background with a drawer scrim (rgba(0,0,0,0.25)), modals are white windows on a modal scrim (rgba(0,0,0,0.4)); desktop sheet cards use the sticker shadow (see Drawers). Confirmation/info modals (`NotificationModal`) use a 15px window radius, with their buttons and text input kept at the 10px default.
- **Snackbar:** A #333333 pill floating above the composer, white mono text.

## Page Structure

Every page inside a drawer or a sheet uses the same nesting. Don't skip a level, and never put a control straight on the page background.

```
Drawer or sheet        SettingsDrawer, ConversationsDrawer, DrawerSheet
└─ Page                subPageContainer + header
   └─ Section          contentCard, white card on the grouped background
      └─ Row           settingRowVertical, one setting
         ├─ Label      settingLabel
         ├─ Help       helpText (optional)
         └─ Group      one shared outline
            └─ Controls    ActionButton, TextInputField, Selector, Slider...
```

The structure styles live in `makeStyles` of `src/components/features/SettingsDrawer.tsx`. Components built outside it (`VoiceEngineCard`, `BugReportSheet`, `MessageDetailsSheet`) copy the same values and must stay identical.

| Between                         | Style                             | Value                                   |
| ------------------------------- | --------------------------------- | --------------------------------------- |
| Drawer edge and content         | panel `paddingHorizontal`         | `Spacing.lg2` (12)                      |
| Header and first section        | `header.marginBottom`             | `Spacing.xxxl` (32)                     |
| Section and section             | `contentCard.marginBottom`        | `Spacing.xxl2` (24)                     |
| Section edge and its rows       | `contentCard.padding`             | `Spacing.md` (8)                        |
| Row and row                     | `settingRowVertical.marginBottom` | `Spacing.xxl` (20), `0` on the last row |
| Last text and its Group         | inline `marginBottom`             | `Spacing.md` (8)                        |
| Two Groups in one row           | `groupSpacingTight`               | `Spacing.lg2` (12)                      |
| Page-level Group and next block | `groupSpacing`                    | `Spacing.xxl` (20)                      |

### Page

- One `<View style={styles.subPageContainer}>` per page, opened by `renderSubPageHeader(title)`.
- The header is a 40px spacer, the title, a 40px spacer. Title: Petrona `FontSizes.xxxl`, centered, line height 40. The left spacer keeps room for the floating back button.
- The drawer wraps each page in its own `KeyboardAwareScrollView` (top padding 60 on mobile, `Spacing.xxl2` on desktop, bottom 40). A page never adds its own scroll view.
- Order: optional notices (NotificationCard, NotificationBanner), sections, then page-level navigation Groups.

```tsx
const renderGeneralSubPage = () => (
  <View style={styles.subPageContainer}>
    {renderSubPageHeader(t("settings.nav.general.title"))}

    {/* language, appearance and modes card */}
    <View style={styles.contentCard}>{/* rows */}</View>
  </View>
);
```

### Section

- `<View style={styles.contentCard}>`: `Colors.surface`, no outline, radius `Radius.xxl + Spacing.md` (18), padding `Spacing.md`, `marginBottom: Spacing.xxl2`.
- The radius is the Group radius plus the card padding, so a Group inside keeps concentric corners.
- One section per topic. Start a new section instead of drawing a divider.
- Name each section with a JSX comment: `{/* sharing instance card */}`.

### Row

- `<View style={styles.settingRowVertical}>`: `marginBottom: Spacing.xxl`. The last row of a section overrides it with `{ marginBottom: 0 }`.
- Order: label, optional help, then the control (usually a Group).
- `settingLabel`: Fragment Mono `FontSizes.body`, `textPrimary`, inset `Spacing.md`.
- `helpText`: Figtree `FontSizes.bodyMd`, `textMuted`, line height 20, inset `Spacing.md`.
- The last text before a Group gets `{ marginBottom: Spacing.md }`.

```tsx
<View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
  <Text style={styles.settingLabel}>{t("settings.sharing.label")}</Text>
  <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
    {t("settings.sharing.help")}
  </Text>
  <Group>
    <TextInputField
      icon={serverIcon}
      placeholder="https://privatebin.net/"
      value={shareInstanceUrl}
      onChangeText={setShareInstanceUrl}
    />
  </Group>
</View>
```

A toggle row puts label and help on the left and the Toggle on the right, with no Group:

```tsx
<View style={styles.settingRowVertical}>
  <View style={styles.toggleGroupRow}>
    <View style={styles.toggleGroupContent}>
      <Text style={styles.settingLabel}>
        {t("settings.general.advancedMode")}
      </Text>
      <Text style={styles.helpText}>
        {t("settings.general.advancedModeHelp")}
      </Text>
    </View>
    <Toggle checked={advancedMode} onToggle={setAdvancedMode} />
  </View>
</View>
```

### Group

`src/components/ui/Group.tsx` is the shared frame: 2px `Colors.border` outline, `Radius.xxl`, `Colors.surface`, `overflow: hidden`.

- Every borderless control sits in a Group, even when it is alone.
- Controls of the same row share one Group and stack edge to edge with no divider. The Group clips their pressed fill to its corners.
- Self-framed components (Toggle, Checkbox, IconSelector) never go directly in a Group.

| Style (`SettingsDrawer.tsx`) | Use                                                                                                                                     |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| none                         | Group inside a row                                                                                                                      |
| `groupSpacing`               | Group standing in for a section at page level (navigation lists): section radius, no outline, `marginBottom: Spacing.xxl`               |
| `groupSpacingTight`          | first of two Groups stacked in one row                                                                                                  |
| `highlightGroup`             | the main action: `Colors.primary` fill, `borderOnPrimary` outline, one `ActionButton variant="highlight"` inside. One per page or sheet |
| `highlightGroupDisabled`     | opacity 0.5 on a highlight Group whose action is disabled                                                                               |

```tsx
{
  /* page-level navigation group */
}
<Group style={styles.groupSpacing}>
  {renderToolsNavRow("widgets", t("settings.tools.widgets.title"), widgetsHelp)}
  {renderToolsNavRow(
    "mcpservers",
    t("settings.tools.mcp.title"),
    t("settings.tools.mcp.help"),
  )}
</Group>;

{
  /* main action */
}
<Group style={[styles.highlightGroup, busy && styles.highlightGroupDisabled]}>
  <ActionButton
    icon={addIcon}
    label={t("settings.server.add")}
    variant="highlight"
    disabled={busy}
    onPress={submit}
  />
</Group>;
```

## Component Placement

Two families:

- **Borderless** components draw no outline. They always sit in a Group.
- **Self-framed** components carry their own 2px outline. They sit directly in a row, never directly in a Group.

| Component          | File (`src/components/`)    | Family              | Placed in             |
| ------------------ | --------------------------- | ------------------- | --------------------- |
| ActionButton       | `ui/ActionButton.tsx`       | borderless          | Group                 |
| TextInputField     | `ui/TextInputField.tsx`     | borderless          | Group                 |
| Selector           | `ui/Selector.tsx`           | borderless          | Group                 |
| Slider             | `ui/Slider.tsx`             | borderless          | Group                 |
| SliderToggle       | `ui/SliderToggle.tsx`       | borderless          | Group                 |
| ProgressBar        | `ui/ProgressBar.tsx`        | borderless          | Group                 |
| Navigation row     | pattern                     | borderless          | page-level Group      |
| Toggle             | `ui/Toggle.tsx`             | self-framed         | toggle row            |
| Checkbox           | `ui/Checkbox.tsx`           | self-framed         | row                   |
| IconSelector       | `ui/IconSelector.tsx`       | self-framed         | row                   |
| DownloadProgress   | `ui/DownloadProgress.tsx`   | self-framed         | row, under its Group  |
| NotificationCard   | `ui/NotificationCard.tsx`   | wraps its own Group | page, above sections  |
| NotificationBanner | `ui/NotificationBanner.tsx` | self-framed         | page, above sections  |
| IconButton         | `ui/IconButton.tsx`         | frameless           | toolbars, field icons |
| NotificationModal  | `ui/NotificationModal.tsx`  | own window          | drawer or screen root |

### ActionButton

- Always in a Group. Several buttons of one row share the same Group.
- A row with 12px padding, an 18×18 icon and a one-line Fragment Mono `FontSizes.body` label.
- `variant="highlight"` only inside a `highlightGroup`.
- `iconBadge` puts the icon on a 36×36 red tile, for top-level actions (conversations drawer).
- Without `onPress` it is a static info row: put the value in `rightElement` with the `infoValue` style (mono `FontSizes.label`, `textMuted`, right aligned, max 60%).

```tsx
<Group>
  <ActionButton
    icon={operaIcon}
    label={t("settings.info.website")}
    onPress={openWebsite}
  />
  <ActionButton icon={githubIcon} label="Github" onPress={openGithub} />
</Group>;

{
  /* info rows */
}
<Group>
  <ActionButton
    label={t("messageDetails.model")}
    rightElement={
      <Text style={styles.infoValue} numberOfLines={1} ellipsizeMode="middle">
        {model}
      </Text>
    }
  />
</Group>;
```

### TextInputField

- Always in a Group, never bare: the Group draws the outline, the field only paints its hover and focus fill (`surfacePressed`).
- Comes after the row label, with `marginBottom: Spacing.md` on the last text.
- 44px high, Fragment Mono `FontSizes.bodyMd`, placeholder `textMuted`, optional 18×18 leading `icon`.
- `rightIcon` with `onRightIconPress` adds a trailing clear button (red `Colors.error` tint by default).
- A sheet holding a field needs `avoidKeyboard`.

```tsx
<View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
  <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
    {t("settings.profile.instructions")}
  </Text>
  <Group>
    <TextInputField
      icon={penPlaceholderIcon}
      placeholder={t("settings.profile.instructionsPlaceholder")}
      value={instruction}
      onChangeText={setInstruction}
    />
  </Group>
</View>
```

### Selector

- Always in a Group, with `fullWidth` in a settings row.
- For a long or growing list of exclusive options (language, storage, engines, models).
- `title` is the muted header of the menu ("Select a language").
- Options are `{ id, label }`. `rightIcon` with `onRightIconPress` adds a trailing action (delete an installed engine), `isDownload` renders a dashed download row.
- The menu floats under the trigger (220px, or the trigger width with `fullWidth`) on a `Colors.overlay` scrim. The selected option is the red pill; long press then drag to pick.

```tsx
<Group>
  <Selector
    options={languageOptions}
    selectedValue={language}
    onSelect={setLanguage}
    title={t("settings.general.selectLanguage")}
    fullWidth
  />
</Group>
```

### Slider

- Always in a Group.
- For an ordered scale of discrete values (speech speed, context size). Ticks before the selected value fill red, the red pill shows its label.
- Optional 18×18 leading `icon`.

```tsx
<Group>
  <Slider
    icon={timeIcon}
    options={ttsSpeedOptions}
    selectedValue={ttsSpeed}
    onSelect={setTtsSpeed}
  />
</Group>
```

### SliderToggle

- Always in a Group.
- Segmented control for a few short exclusive options that fit on one line. Without `options` it renders the theme set (system, light, dark).

```tsx
<Group>
  <SliderToggle selectedValue={theme} onSelect={setTheme} />
</Group>
```

### ProgressBar

- In a Group, first, usually followed by ActionButton info rows (downloaded, speed, time left).
- `progress` from 0 to 1, percentage on the right, fill `Colors.primary` unless `fillColor` is set.

```tsx
<Group>
  <ProgressBar progress={progress} icon={downloadIcon} />
  <ActionButton
    label={t("settings.litert.speed")}
    rightElement={<Text style={styles.litertRowMeta}>{speedStr}</Text>}
  />
</Group>
```

### Navigation rows

A pattern, not a component. Rows that open a subpage go in a page-level `<Group style={styles.groupSpacing}>`, never inside a section.

- Settings home: a `navItem` Pressable with a red badge icon (`menuIconWrap`), `navTitle` (mono `FontSizes.lg`) and `navSubtitle` (Figtree `FontSizes.bodyMd`, muted). The last row of a Group adds `navItemLast`.
- Subpages: `renderToolsNavRow(page, title, help)`, a label, its help and a muted right arrow.
- A trailing Toggle can switch on the feature the row opens, after a `toggleDivider` (service providers).

```tsx
<Group style={styles.groupSpacing}>
  <Pressable
    style={pressStyle(styles.toggleGroupRowItem, styles.toggleGroupCardPressed)}
    onPress={() => setActiveSubPage("ollama")}
  >
    <View style={styles.toggleGroupRow}>
      <View style={styles.toggleGroupContent}>
        <Text style={styles.settingLabel}>{t("settings.service.ollama")}</Text>
        <Text style={styles.helpText}>{t("settings.service.ollamaHelp")}</Text>
      </View>
      <View style={styles.toggleDivider} />
      <Toggle
        checked={ollamaEnabled}
        onToggle={(v) => setProviderEnabled("ollama", v)}
      />
    </View>
  </Pressable>
</Group>
```

### Toggle

- In a toggle row (`toggleGroupRow`, see Row), at the right of `toggleGroupContent`. Never alone in a Group.
- Only exception: the trailing element of a navigation row.
- For a setting that applies at once. To pick items in a list or in a form sent afterwards, use Checkbox.

### Checkbox

- Never in a Group.
- With `label` and `labelFirst`, in a `toggleRow` with the `checkboxRow` style: label on the left, box on the right.
- Without `label`, at the end of a list row that renders its own text (model lists).
- In a NotificationModal, pass `options` instead of placing Checkboxes.

```tsx
<View style={styles.toggleRow}>
  <Checkbox
    label={t("bugReport.attachLogs")}
    checked={report.logs !== null}
    onToggle={report.toggleLogs}
    labelFirst
    style={styles.checkboxRow}
  />
</View>
```

### IconSelector

- Never in a Group: each option is its own 56px framed tile, the selected one red.
- Directly in the row, after the label with `marginBottom: Spacing.md`.

```tsx
<View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
  <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
    {t("settings.maestro.voice")}
  </Text>
  <IconSelector
    options={ICON_SELECTOR_OPTIONS}
    selectedValue={voice}
    onSelect={setVoice}
  />
</View>
```

### DownloadProgress

- In the row, right under the Group whose control started the download (engine or model Selector). Not in a Group: it has its own muted card.

### NotificationCard and NotificationBanner

- Page level, above the first section, with `style={[styles.groupSpacing, styles.mainPageGroup]}`. Never inside a section or a Group (NotificationCard already wraps itself in one).
- NotificationCard: neutral notice with an image, a title, an optional description and a close ✕.
- NotificationBanner: red one-line notice that needs an action (update available).

### IconButton

- Bare icon for toolbars, the chat bar and trailing field icons. Not for settings rows, use ActionButton there.
- `containerSize` gives a fixed round touch target, `label` shows the hover tooltip.

### NotificationModal

- Confirmations and alerts: a centered white window, `Radius.window`, max 400 wide, on `scrimModal`.
- Mounted at the root of the drawer or screen, next to the content, driven by `visible`.
- Buttons take `style: "primary" | "secondary" | "danger"`. One optional input (`showInput`, wrapped in a Group inside) and one optional checkbox list (`options`).
- A form with more than one field is a DrawerSheet, not a modal.

## Drawers

Three containers hold pages. All sit on `Colors.groupedBackground`, pad their content by `Spacing.lg2` and use the same floating `DrawerBackButton`.

| Container             | Mobile (<768)                            | Large screen (≥768)   | Desktop (≥1024, web and desktop apps)                                                                                                        |
| --------------------- | ---------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `ConversationsDrawer` | full width, slides from the left, scrim  | panel `min(90%, 360)` | docked flush left, resizable 240–480 (320 default), no scrim, no radius, no close button                                                     |
| `SettingsDrawer`      | full width, slides from the right, scrim | panel `min(90%, 360)` | centered window max 960, `Radius.window`, 320px nav column on the left and the page on the right, close button top left of the nav, no title |
| `DrawerSheet`         | bottom sheet                             | centered card         | centered card                                                                                                                                |

### Side drawers

`ConversationsDrawer.tsx` and `SettingsDrawer.tsx` in `src/components/features/`.

- Opened and closed with `settleDrawer` (spring, stiffness 500, damping 45). Their progress values (`conversationsProgress`, `settingsProgress` in `drawerAnimation.ts`) live at module scope so the chat screen's edge swipe drags them one to one.
- The scrim (`Colors.scrimDrawer`) fades with the progress; a tap on it closes the drawer.
- Content is a `PageStack` of pages.
- `DrawerBackButton` floats top left in `fixedBackWrapper` (top 60), above the scroll, never inside a page. `kind="close"` on the root page, `kind="back"` on a subpage. `scrolled` adds a surface and a sticker shadow once content passes under it, `pulseKey={activeSubPage}` pulses it on each page change.
- Mobile only: 60px `LinearGradient` fades at the top and bottom (grouped background to clear). None on desktop.
- Sheets owned by a drawer are rendered after its panel, inside the drawer root, so they cover it.

### Subpages (PageStack)

`src/components/features/PageStack.tsx`. Pages are string keys with a parent map. Opening a child pushes from the right, going back to an ancestor slides in from the left, and the Android back gesture drags the transition.

To add a settings subpage:

1. Add the key to `SubPage`.
2. Add its parent to `SUB_PAGE_PARENT`; the back arrow and Android back follow it.
3. Write `renderXxxSubPage()` with the page structure above.
4. Add its case to `getSubPageContent`.
5. Add a navigation row in the parent page calling `setActiveSubPage("xxx")`.

### Sheets (DrawerSheet)

`src/components/features/DrawerSheet.tsx`. Every secondary panel (add a server, edit the profile, message details, bug report, model selector, previews) is a DrawerSheet, never a custom `Modal`.

- `mode="overlay"`: above everything on a scrim, slides up its own measured height, closes on pull down or flick, on Android back and on Escape.
- `mode="lift"`: inside the layout, pushes the content above instead of covering it (attachment sheet under the chat bar). The parent screen handles back.
- Large screen and desktop: a centered card (`Radius.window`, 2px outline, sticker shadow `-6px 6px 0px shadowInk`) with a close button top left. The card look lives only in DrawerSheet; consumers pass nothing but a width through `desktopStyle`. `anchored` hangs the card under its trigger with no close button (model selector on tablet).
- `avoidKeyboard` when it holds a TextInputField; it then needs a `maxHeight` in `sheetStyle`.
- `onBackPress` returns `true` when the sheet popped one of its own pages instead of closing.
- Content: a `ScrollView` padded `Spacing.lg2` on the sides, then sections, rows and Groups like a page, without the Petrona header. The first row label acts as the title.
- A sheet with several pages puts a `PageStack` in its body, a floating `DrawerBackButton kind="back"` on non-root pages, and pops pages in `onBackPress` (add model sheet).

```tsx
<DrawerSheet
  visible={visible}
  onClose={onClose}
  mode="overlay"
  isLargeScreen={isLargeScreen}
  isDesktop={isDesktop}
  handleContainerStyle={styles.sheetHandleContainer}
  avoidKeyboard
  sheetStyle={[
    styles.sheet,
    {
      paddingBottom: (Platform.OS === "ios" ? 20 : 10) + bottomInset,
      maxHeight: windowHeight - insets.top - Spacing.xl2,
    },
  ]}
  desktopStyle={styles.desktopCard}
>
  <ScrollView
    contentContainerStyle={styles.content}
    keyboardShouldPersistTaps="handled"
  >
    <View style={styles.contentCard}>
      {/* rows */}
      <Group style={styles.highlightGroup}>
        <ActionButton
          icon={arrowIcon}
          label={t("bugReport.send")}
          variant="highlight"
          onPress={send}
        />
      </Group>
    </View>
  </ScrollView>
</DrawerSheet>
```

```ts
sheet: {
  position: "absolute",
  bottom: 0,
  left: 0,
  right: 0,
  backgroundColor: Colors.groupedBackground,
  borderTopLeftRadius: Radius.huge2,
  borderTopRightRadius: Radius.huge2,
  paddingTop: 12,
},
sheetHandleContainer: {
  alignItems: "center",
  marginBottom: Spacing.xs2,
  paddingVertical: 10,
  marginTop: -10,
},
desktopCard: {
  width: DESKTOP_CARD_WIDTH,
},
content: {
  paddingHorizontal: Spacing.lg2,
  paddingBottom: Spacing.lg,
},
```

## Widgets

Structured results (weather, contact lookup, calendar events, timers, math) share one primitive set from `src/components/toolwidgets/ToolWidgetBlocks.tsx`, rather than each widget inventing its own layout.

- **`Caption`:** a muted single line above the blocks (Figtree, 18px, `text-muted`), describing what's below — the searched expression, the resolved contact's label, the event title.
- **`BlockRow` / `BlockContainer`:** lay out one or more blocks in a row, stacked in a vertical container with no extra padding — blocks run edge to edge inside the widget's own 5px card padding.
- **`Block`:** a rounded tile (5px radius, 2px border). `outlined` (default) is a white tile with an ink border for secondary values (a date, a phone number, a temperature). `filled` is a solid Opera Red tile with a translucent white border for the single headline value (a contact's name, an event's day, a timer's duration, a math result).
- **`BlockSymbol`:** a bare glyph between two blocks (`=`, `→`) — no border, no fill, tight horizontal padding. Use this instead of an outlined `Block` for connectors/operators.

**Rule:** any text inside a `filled` (Opera Red) block MUST use the Petrona serif font (`serif` prop on `Block`), never Fragment Mono or Figtree — regardless of whether the value is a name, a day, a duration, or a number. This is what makes the single most important value in a widget read as a headline rather than UI chrome.

## Do's and Don'ts

- Do use Opera Red only for the single most important action per screen.
- Do always pull values from the design tokens in `constants/theme.ts` (Colors, Fonts, FontSizes, Spacing, Radius) — never hardcode colors, fonts, or radii.
- Do use Petrona for display headings, Figtree for reading, and Fragment Mono for UI chrome.
- Do keep the incognito recolor coherent: swap every red element to the purple-gray #565A75 family.

- Don't add heavy drop shadows; prefer sticker shadows and 2px outlines.
- Don't mix serif display and monospace in the same heading.
- Don't exceed the 10px default radius on data-dense cards.
- Do keep body text at WCAG AA contrast. Note: white text on Opera Red is ~3.9:1, so use red surfaces for large or bold text and chrome, not small body copy.
