# Chaoxing + Doubao Userscripts

[![CI](https://github.com/yanguanbai/Chaoxing-link-Doubao/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/yanguanbai/Chaoxing-link-Doubao/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-16705a)](LICENSE) [![Release](https://img.shields.io/github/v/release/yanguanbai/Chaoxing-link-Doubao?label=release)](https://github.com/yanguanbai/Chaoxing-link-Doubao/releases/latest)

Userscripts for Chaoxing (超星学习通) answer pages: they extract the current question, send it to the Doubao web chat for assistance, and write the result back into the page. One side of the script runs on the Chaoxing page, the other on the Doubao page; the two halves talk through the userscript manager's cross-tab storage.

Chinese version: [README.md](README.md)

## Public Scripts

No userscript manager yet? Install [Tampermonkey](https://www.tampermonkey.net/), refresh the browser, then use the Install links below.

| Script | What it does | Version | Docs & Install |
|---|---|---:|---|
| Chaoxing Doubao Helper | Reads the current question, sends text or a screenshot, fetches the reply, fills answers, binds the Doubao page | 1.6.6 | [中文](src/chaoxing-doubao/README.md) · [English](src/chaoxing-doubao/README.en.md) · [Install](https://raw.githubusercontent.com/yanguanbai/Chaoxing-link-Doubao/main/src/chaoxing-doubao/chaoxing-doubao.user.js) |
| Plain-text Paste Helper | Pastes plain text into short-answer editors while leaving image pastes untouched | 1.2.2 | [中文](src/chaoxing-paste-helper/README.md) · [English](src/chaoxing-paste-helper/README.en.md) · [Install](https://raw.githubusercontent.com/yanguanbai/Chaoxing-link-Doubao/main/src/chaoxing-paste-helper/chaoxing-paste-helper.user.js) |

The two scripts are separate files and appear as two entries in the userscript list. The helper is not bundled into the main script.

## Requirements

> [!IMPORTANT]
> **The Disable Content-Security-Policy extension is required for screenshots.**
> The Chaoxing page CSP blocks the `html2canvas` script loaded from jsDelivr and the canvas export. Without the extension, screenshots fail; text sending is unaffected. Cross-page data uses the userscript manager's local storage and is not affected by CSP. After installing it, **click the extension icon to confirm it is enabled** (it works per tab, so keep it enabled after refreshing).
> Links: [Chrome](https://chrome.google.com/webstore/detail/disable-content-security/ieelmcmcagommplceebfedjlakkhpden) · [another author's build, .crx included](https://github.com/WithoutHair/Disable-Content-Security-Policy)

> [!IMPORTANT]
> **The plain-text paste helper is a required second script, not an optional extra.**
> With only the main script, Chaoxing short-answer editors cannot take plain text properly, the flow is incomplete and the setup does not work. After installing the main script, use the second **Install** link above and confirm; the userscript list should then show two entries.

- **Userscript manager**: Tampermonkey. Only Tampermonkey has been tested; other managers are unverified.
- **Third-party library**: `html2canvas` is loaded from jsDelivr at runtime for screenshots only. See [DISTRIBUTION.md](DISTRIBUTION.md).

## Install

1. Install and enable Tampermonkey and allow it to run on web pages; add the CSP extension above if you need screenshots.
2. Click an **Install** link above and confirm the extension prompt. Do this once per script.
3. Refresh the Chaoxing answer page (`mooc-ans` or `exam-ans`). The draggable answer panel appears on the left side of the page.

The final confirmation must be clicked by you; a web page cannot silently install extensions or userscripts. Manual install: userscript panel → "Add new script" → paste the full file from `src/` → save.

## Project Layout

- `src/` holds the public userscripts with their documentation, one directory per script.
- `tools/sync-readme-versions.mjs` fills the version column of the table above from each script's `@version`; CI runs it with `--check` and fails when the two drift apart.
- `tools/check-userscript-meta.mjs` checks that every script has the required metadata and an `x.y.z` `@version`.
- `tools/check-docs.mjs` verifies that every raw install link in the docs points to a file that exists, and that each script's `@downloadURL` / `@updateURL` points to itself.
- `.github/workflows/ci.yml` runs syntax checks, metadata checks and the two checks above, on Node 22 and 24.
- `CHANGELOG.md` records per-version changes; the READMEs describe usage and do not duplicate version history.
- `DISTRIBUTION.md` records source verification, third-party dependencies and licensing scope.

## Compatibility and Privacy

Page matching only means the script runs on that URL, not that every question layout is recognised; page redesigns may require re-adapting question lookup and answer filling. A question reaches the Doubao web chat only after you click send, and is then processed by Doubao under its own terms; the scripts upload nothing to a first-party server. See the [main script docs](src/chaoxing-doubao/README.en.md).

## License

This repository is released under the [MIT license](LICENSE); both public scripts declare `@license MIT` in their metadata. `html2canvas` is a third-party project (MIT) loaded from a CDN at runtime and not vendored here; see [DISTRIBUTION.md](DISTRIBUTION.md).

Provided "as is", without any guarantee of continued compatibility with third-party sites. Verify AI output yourself; it is not an authoritative answer or professional advice. Third-party trademarks in project names only describe compatibility targets.
