# Distribution

Texts published with each release. Fill them in before you ship.

| File | Where it shows | Limit |
|---|---|---|
| `release-notes.md` | the GitHub release (versioned and beta), and the in-app **What's new** sheet | none |
| `whatsnew/whatsnew-en-US` | the Play Store "What's new", English only | 500 characters |


## release-notes.md

Markdown. `build-apk.yml` and `build-desktop.yml` publish it as the notes of the tag release and write it again on every run, so the file is the source of truth: an edit made on GitHub is overwritten by the next build of that tag.

Opera reads the notes of the release matching its own version (`v` + `app.json` version) and shows them once per device, on the first launch after an update. Fresh installs, downgrades and the browser build don't show them.

Write it for users, not as a commit list. The sheet supports `##` headings, `-` lists, **bold** and links.

## whatsnew-en-US

Plain text, no Markdown. The Play Console accepts up to 500 characters, a longer text is refused and the upload fails.

## Production release

1. Merge the work into `main`. A release is always tagged on `main`, so the release matches the published code and the workflows are the ones `main` carries.
2. On `main`, bump `version` in `app.json`. The `versionCode` is set by the workflow, see [versionCode](#versioncode).
3. Write new `release-notes.md` and `whatsnew/whatsnew-en-US` texts, then commit and push `main`.
4. Tag the `main` commit and push the tag, it must match `app.json`:

   ```bash
   git checkout main
   git pull
   git tag v1.2.3
   git push origin v1.2.3
   ```

5. The workflows build Android, Windows, macOS and Linux, and attach everything to the GitHub release `v1.2.3`, marked as latest. The website download buttons pick the new files up on their own.
6. The bundle lands in the Play Console, **Production** track, as a **draft** with its name and notes filled in. Open it, check it, and send it for review: it goes live to everyone once Google approves it.

## Beta release

A beta can come from any branch, no need to merge into `main` first.

1. Set `version` in `app.json` to the version the beta leads to, `1.2.3` for the betas of `1.2.3`.
2. Write new `release-notes.md` and `whatsnew/whatsnew-en-US` texts, then commit and push the branch. Beta testers see the release notes in the **What's new** sheet. When that version ships, they get the production notes too.
3. Tag the commit `v<version>-beta.<n>` and push the tag, counting `n` up from 1 for each beta of the same version:

   ```bash
   git tag v1.2.3-beta.1
   git push origin v1.2.3-beta.1
   ```

4. The workflows build Android, Windows, macOS and Linux, and attach everything to the GitHub release `v1.2.3-beta.1`, marked as a pre-release. It never shows as latest, so the website keeps offering the stable build.
5. The bundle lands in the Play Console, **Open testing** track, as a **draft**. Send it for review: once approved, anyone who joins the open testing from the Play Store gets it.

The Play uploads only run when the `PLAY_SERVICE_ACCOUNT_JSON` secret is set, and the beta one also needs the upload keystore secrets, since Play refuses a debug-signed bundle.

## versionCode

Play refuses a `versionCode` it has already received, beta included. On each tag, `scripts/next-version-code.mjs` asks Play for the highest code it holds and builds with the next one, so `android.versionCode` in `app.json` never needs a bump. A higher value in `app.json` still wins. Without the `PLAY_SERVICE_ACCOUNT_JSON` secret, the build keeps the `app.json` value.

## Desktop updates

The desktop app updates itself from the GitHub release. Each release carries a signed `latest.json` next to the installers, and the app reads the one of the newest release for its channel: stable builds follow stable releases, builds with the **Beta versions** toggle on (or a beta build) follow betas too.

The bundles are signed by `build-desktop.yml`, which needs two repository secrets:

- `TAURI_SIGNING_PRIVATE_KEY`: the content of the private key file
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: its password

The public key sits in `src-tauri/tauri.conf.json`. Lose the private key and installed apps can no longer verify an update: they would need a manual reinstall with a new key. The desktop bundle version is the tag (`1.2.3-beta.2`), not the `app.json` version, so the updater can tell two betas apart. A `.deb` install can't replace itself, the app opens the release page instead.

