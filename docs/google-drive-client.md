# Using your own Google Cloud project for Google Drive

Opera backs up (or syncs, without Sampler) to the app's hidden folder on Google Drive (`appDataFolder`). By default the app uses the OAuth clients of the Maestro AI Google Cloud project. This guide shows how to replace them with your own, for example in a fork or a personal build.

## What the app asks Google for

- **API**: Google Drive API.
- **Scopes**: `https://www.googleapis.com/auth/drive.appdata`, `email`, `profile`. `drive.appdata` only reaches the app's hidden folder, never the rest of the Drive.
- **One OAuth client per platform**:

| Platform | Google client type | Where it is used |
|---|---|---|
| Android | Android | `ANDROID_CLIENT_ID` in `src/services/cloud/GoogleDriveProvider.ts` |
| iOS | iOS | `IOS_CLIENT_ID` in the same file |
| Web and desktop (Tauri) | Web application | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, otherwise `WEB_CLIENT_ID` in the same file |

Android and iOS come back to the app through a URL scheme made of the reversed client ID (`com.googleusercontent.apps.<id>:/oauth2redirect/google`). That scheme must also be declared in `app.json`.

## 1. Create the project and enable the API

1. Open the [Google Cloud console](https://console.cloud.google.com/) and create a project.
2. **APIs & Services → Library**: enable **Google Drive API**.

## 2. Set up the consent screen

1. **APIs & Services → OAuth consent screen** (or **Google Auth Platform → Branding**).
2. User type: **External**.
3. Fill in the app name, the contact address, and the domain if you publish the web version.
4. **Data access (scopes)**: add `.../auth/drive.appdata`, `email` and `profile`.
5. **Audience**:
   - **Testing**: only accounts added as test users can sign in (100 at most). In testing mode Google expires refresh tokens after 7 days, so users have to sign in again in the app.
   - **In production**: any Google account can sign in. `drive.appdata` is not a sensitive scope, so Google's verification stays light.

## 3. Create the OAuth clients

In **APIs & Services → Credentials → Create credentials → OAuth client ID**.

### Android

1. Type: **Android**.
2. **Package name**: `ai.maestro.opera`. Debug and preview builds (`ai.maestro.opera.dev`) work with this same client, no second client is needed.
3. **SHA-1 fingerprint** of the key that signs your release APK: the SHA-1 of your upload key (`UPLOAD_STORE_FILE`), or of the Google Play signing key if you use Play App Signing (Play Console → App integrity).
4. In the client's **advanced settings**, enable the **custom URI scheme**. The app comes back from the Google sign in through that scheme; without it, Google refuses the redirect.
5. Copy the client ID (`xxxx.apps.googleusercontent.com`).

### iOS

1. Type: **iOS**.
2. **Bundle ID**: `ai.maestro.opera`.
3. Copy the client ID.

### Web and desktop

1. Type: **Web application**.
2. **Authorized JavaScript origins**:
   - `http://localhost:8081` (`npm run web` locally);
   - the origin of your published web version, for example `https://app.example.com`.
3. **Authorized redirect URIs**:
   - `http://localhost:8081/oauth2redirect/google` (local web);
   - `https://app.example.com/oauth2redirect/google` (published web);
   - `http://localhost:46357/oauth2redirect/google` (desktop app: it opens the sign in in the browser and listens on this fixed port, `OAUTH_LOOPBACK_PORT`).
4. Copy the client ID.

Web and desktop use the implicit flow: they get no refresh token and ask to sign in again when the token expires (about an hour).

## 4. Plug the clients into Opera

### Android and iOS

1. In `src/services/cloud/GoogleDriveProvider.ts`, replace `ANDROID_CLIENT_ID` and `IOS_CLIENT_ID` with your client IDs.
2. In `app.json`, replace the two `com.googleusercontent.apps.390321100520-...` entries of the `scheme` list with your reversed client IDs. For the client ID `1234-abcd.apps.googleusercontent.com`, the scheme is `com.googleusercontent.apps.1234-abcd`.
3. Regenerate the native project, then rebuild:
   ```bash
   npx expo prebuild --platform android
   ```
   ```bash
   npm run android
   ```

### Web and desktop

Create a `.env` file at the root of the project (or secrets in your CI):

```bash
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=1234-abcd.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_REDIRECT_URI=https://app.example.com/oauth2redirect/google
```

- `EXPO_PUBLIC_GOOGLE_REDIRECT_URI` only matters for the published web version: it is used only when its origin is the page's origin. Locally the app computes `http://localhost:8081/oauth2redirect/google` on its own.
- The `.github/workflows/deploy-web.yml` workflow already passes `EXPO_PUBLIC_GOOGLE_REDIRECT_URI` from the repository secrets. Add `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` the same way if you publish the web version with your own client.

## 5. Check

1. In the app, open **Settings → Cloud** and pick **Google Drive**.
2. Sign in with an allowed account (a test user while the consent screen is in testing mode).
3. The page shows your account. Run a sync or a backup, then check the "Last synced" or "Last backup" row.

## Common errors

| Google error | Likely cause |
|---|---|
| `redirect_uri_mismatch` | The redirect URI is missing from the Web client's list (port, `/oauth2redirect/google` path, or `http` vs `https`). |
| `invalid_request`, scheme refused on Android | The custom URI scheme is not enabled on the Android client, or the `app.json` scheme does not match the client ID. |
| `access_denied`, "app not verified" | The account is not a test user while the consent screen is in testing mode. |
| Signed out after a week | Consent screen in testing mode: refresh tokens expire after 7 days. Move it to production. |

Switching Google projects does not move files: a backup made with the old project stays in that project's hidden folder, which the new one cannot see. Make a new backup from a device that has the data.
