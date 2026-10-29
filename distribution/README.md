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
2. On `main`, bump `version` and `android.versionCode` in `app.json`. Play refuses a `versionCode` it has already received, beta included.
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

1. Bump `android.versionCode` in `app.json` (the beta and the next production build need different codes).
2. Write new `release-notes.md` and `whatsnew/whatsnew-en-US` texts, then commit and push the branch. The release notes go on the GitHub `beta` release, titled `Beta <version>`, and beta testers see them in the **What's new** sheet. When that version ships, they get the production notes too.
3. On GitHub, **Actions → Build Android APK → Run workflow**, pick the branch. A beta can come from any branch, no need to merge into `main` first.
4. The APK replaces the GitHub `beta` pre-release, which never shows as latest, so the website keeps offering the stable build.
5. The bundle lands in the Play Console, **Open testing** track, as a **draft**. Send it for review: once approved, anyone who joins the open testing from the Play Store gets it.

The Play uploads only run when the `PLAY_SERVICE_ACCOUNT_JSON` secret is set, and the beta one also needs the upload keystore secrets, since Play refuses a debug-signed bundle.
