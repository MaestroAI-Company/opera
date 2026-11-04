## Opera Desktop

Opera now runs on Windows, macOS and Linux, with a layout made for the computer and a settings window of its own. It updates itself, can start with your computer, and offers a **Beta versions** switch.

An assistant overlay opens over any app from a keyboard shortcut or the tray icon. Pin it on screen, talk to it with push to talk, and hold Ctrl to select a part of your screen: Opera detects buttons, text and images under the cursor so your selection snaps to them.

Opera Desktop can also host Sampler Hub itself and shares its tray icon with it.

## Faster local AI on desktop

Voice transcription, screen element detection and offline voices now run natively on your computer's graphics card instead of inside the app window. Transcription is up to 6 times faster and element detection up to 4 times faster, and these models free their memory after 5 minutes without use.

On Linux, Opera starts correctly with its name, icon and rounded window. The AppImage installs itself on first launch, adds Opera to your applications menu and updates itself, and local AI uses your graphics card through Vulkan.

## Sampler Hub

Sampler Hub, formerly Opera Hub, is your own sync server. Install it on a computer you own, pair your devices with a QR code or a code, and everything stays between them with no account and nobody in the middle.

- **Sync.** Conversations, messages, images and settings move between your devices, sealed end to end.
- **Profiles.** One hub for a whole home. Each profile has its own password, can be restored when you set up a new device, and can be backed up to its own cloud.
- **Shared models.** Use the Ollama, LM Studio and llama.cpp models running on the hub's computer from every paired device. Download and manage llama.cpp models from Opera, switch to llama.cpp nightly and see which version runs.
- **MCP servers.** Install MCP servers on the hub from Opera and use their tools on every device. One sign-in is shared across all the devices of a profile.
- **Administration.** An admin screen with the paired devices, live CPU and memory charts, an orbit view of connected devices, updates, and a switch to stop the hub. It also opens in a browser.
- **Sign in from your network.** On the same network, tap **Link to** the hub, pick your profile and type its password, no pairing code needed. All your hubs show in one list, and their models sit under a single **Sampler** tab in the model picker. This needs Sampler Hub 0.12.0, older hubs keep pairing with a code.

## Stand-by

Stand-by turns a charging phone or tablet into a docked smart display: a clock, Maestro's butterflies and spoken answers with a card next to them, showing a picture, key facts, a list and an action button. Say "Maestro" to ask hands free, Maestro listens for follow-up questions, and the wake word runs on the device. Stand-by dims when idle, moves the clock to protect OLED screens, and has an incognito button. It also opens in the browser at `/standby`.

## Maestro

- Pick Maestro's mood, tone and level of detail from the **Personality** card in the Maestro settings.
- Customize Maestro's butterfly and your profile card. The butterfly follows the personality and takes the colors of your voice, and flies from the home screen into the chat.
- Maestro now speaks with neural Supertonic voices, with spoken previews when you pick one.

## Chat

- Edit your messages.
- Attach videos, and paste images straight into the message box.
- Share text and files from other apps into Opera.
- Maestro can look at images from web pages, like charts and screenshots, and web pages show their pictures in the answer. Remote images ask before loading.
- Tools ask for your consent inside the reply instead of in a separate window.
- See which prompt size Automatic picks for each model, and set one per model.
- Spoken replies stop when you leave the app, switch chats or start recording.

## Models

- Built-in models are merged into **On-device**, and cloud API models open in their own sheet with a page per model.
- Turn individual Ollama and cloud models on or off, and override what a model can do.
- Download large local models when you force load them.

## Setup, sync and backup

- A new onboarding with a startup sound and a voice step, where you can also restore a backup.
- One **Sync & backup** page for your cloud and your Sampler Hub.
- Opera offers to become your default assistant when you start it.
- A **What's new** sheet shows these notes after each update.

## Design and performance

- A new toggle in the top bar switches between chat and Sampler, next to the incognito button.
- A refined, darker dark theme, restyled drawers and sheets, and a simpler settings page.
- The shadows and your profile card follow the tilt of your phone, and pause when you are not looking at them.
- Opera now runs on Expo SDK 58 and feels smoother, with less jank when scrolling and opening sheets.
- Opera no longer asks for broad photo and video access on Android, in line with Google Play's photo picker policy.
