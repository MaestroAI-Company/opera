# Distribution

Texts published with each release. Fill them in before you ship.

| File | Where it shows | Limit |
|---|---|---|
| `release-notes.md` | the GitHub release (versioned and beta), and the in-app **What's new** sheet | none |
| `whatsnew/whatsnew-en-US` | the Play Store "What's new", English only | 500 characters |


## release-notes.md

Markdown. `build-apk.yml` and `build-desktop.yml` publish it as the notes of the tag release and write it again on every run, so the file is the source of truth: an edit made on GitHub is overwritten by the next build of that tag.

Opera reads the notes of the release matching its own version (`v` + `app.json` version) and shows them once per device, on the first launch after an update. Fresh installs, downgrades and the browser build don't show them.

The first line shows `distribution/updatebanner.png` as the banner of the sheet and of the GitHub release page:

```markdown
![](https://raw.githubusercontent.com/MaestroAI-Company/opera/v1.2.3/distribution/updatebanner.png)
```

Put the tag you are about to push in the URL (`v1.2.3-beta.1` for a beta), and replace the image before tagging: the link points to the file of that tag, so each version keeps its own banner. A relative `![](updatebanner.png)` also works in the app, but GitHub can't resolve it on the release page. Without the line or the file, the sheet opens with no banner.

Write it for users, not as a commit list. The sheet supports `##` headings, `-` lists, **bold** and links.

What the file lists depends on the kind of release:

- **Production**: everything new since the previous production release, betas included. Read the previous notes and the beta notes, then merge them into one text.
- **Beta**: only what is new in this beta, nothing already listed in an earlier beta or in the last release. The second line points to the earlier notes, so testers know the rest is there, for example `Everything from the previous betas still applies, see [v1.2.3-beta.1](https://github.com/MaestroAI-Company/opera/releases/tag/v1.2.3-beta.1).` The first beta of a version has no previous beta, it lists what is new since the last release.

Never copy the text of the previous beta into the next one. To know what to write, diff against the previous tag: `git log --oneline v1.2.3-beta.1..HEAD`.

## whatsnew-en-US

Plain text, no Markdown. The Play Console accepts up to 500 characters, a longer text is refused and the upload fails.

## Production release

1. Merge the work into `main`. A release is always tagged on `main`, so the release matches the published code and the workflows are the ones `main` carries.
2. On `main`, bump `version` in `app.json`. The `versionCode` is set by the workflow, see [versionCode](#versioncode).
3. Write new `release-notes.md` and `whatsnew/whatsnew-en-US` texts covering everything since the last production release, see [release-notes.md](#release-notesmd), then commit and push `main`.
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
2. Write new `release-notes.md` and `whatsnew/whatsnew-en-US` texts with only what is new in this beta and a link to the previous beta, see [release-notes.md](#release-notesmd), then commit and push the branch. Beta testers see the release notes in the **What's new** sheet. When that version ships, they get the production notes too.
3. Tag the commit `v<version>-beta.<n>` and push the tag, counting `n` up from 1 for each beta of the same version:

   ```bash
   git tag v1.2.3-beta.1
   git push origin v1.2.3-beta.1
   ```

4. The workflows build Android, Windows, macOS and Linux, and attach everything to the GitHub release `v1.2.3-beta.1`, marked as a pre-release. It never shows as latest, so the website keeps offering the stable build.
5. The bundle lands in the Play Console, **Open testing** track, as a **draft**. Send it for review: once approved, anyone who joins the open testing from the Play Store gets it.

The Play uploads only run when the `PLAY_SERVICE_ACCOUNT_JSON` secret is set, and the beta one also needs the upload keystore secrets, since Play refuses a debug-signed bundle.

## iOS and Mac App Store

Every `v*` tag, beta included, also starts `build-ios.yml` and `build-mas.yml`. They upload to App Store Connect and attach nothing to the GitHub release.

1. The builds are processed by Apple, then show up in TestFlight. Add the iOS and Mac builds to the public TestFlight beta group by hand in App Store Connect, it is the one the French users join.
2. To release on the App Store, pick the processed build in App Store Connect, fill in the version notes and send it for review. Do the same for the Mac App Store version.
3. The French App Store, iOS and Mac, stays closed until the encryption declaration is approved.

Apple refuses a `-beta` suffix, so both workflows strip it before checking the tag against `app.json`. The full tag (`v1.2.3-beta.2`) still numbers the build in the app, through `EXPO_PUBLIC_RELEASE_TAG`. `build-ios.yml` can also be run by hand with a `release_tag` input to number a beta build.

Both need the repository secrets `ASC_KEY_ID`, `ASC_ISSUER_ID` and `ASC_KEY_P8_BASE64`. Both also need `MAS_CERTIFICATES_P12_BASE64` and `MAS_CERTIFICATES_PASSWORD`. The iOS build adds the `IOS_PROFILE_APP_BASE64`, `IOS_PROFILE_WIDGET_BASE64` and `IOS_PROFILE_SHARE_BASE64` profiles, the Mac one `MAS_PROVISION_PROFILE_BASE64`. TestFlight builds expire after 90 days.

## After a release: old branches

The tag is what keeps a release, not the branch: once `v1.2.3` is tagged on `main`, the `1.2.3` branch no longer holds anything the release needs, so it can be deleted. Betas work the same way, their tags (`v1.2.3-beta.1`) stay and only the working branch goes.

1. Check that the branch is fully merged into `main`, the command must print nothing. If it lists commits, merge what you want to keep first.
2. Delete the branch on GitHub and locally, then drop the stale remote references:

   ```bash
   git log main..origin/1.2.3
   git push origin --delete 1.2.3
   git branch -d 1.2.3
   git fetch --prune
   ```

Branches that aren't tied to a version (`sampler-hub`, `desktop-design`, `iOS`) stay as they are. If a fix is needed on an old release later, a branch can be recreated from its tag with `git checkout -b 1.2.3-hotfix v1.2.3`.

## versionCode

Play refuses a `versionCode` it has already received, beta included. On each tag, `scripts/next-version-code.mjs` asks Play for the highest code it holds and builds with the next one, so `android.versionCode` in `app.json` never needs a bump. A higher value in `app.json` still wins. Without the `PLAY_SERVICE_ACCOUNT_JSON` secret, the build keeps the `app.json` value.

## Desktop updates

The desktop app updates itself from the GitHub release. Each release carries a signed `latest.json` next to the installers, and the app reads the one of the newest release for its channel: stable builds follow stable releases, builds with the **Beta versions** toggle on (or a beta build) follow betas too.

The bundles are signed by `build-desktop.yml`, which needs two repository secrets:

- `TAURI_SIGNING_PRIVATE_KEY`: the content of the private key file
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: its password

The public key sits in `src-tauri/tauri.conf.json`. Lose the private key and installed apps can no longer verify an update: they would need a manual reinstall with a new key. The desktop bundle version is the tag (`1.2.3-beta.2`), not the `app.json` version, so the updater can tell two betas apart. A `.deb` install can't replace itself, the app opens the release page instead.

