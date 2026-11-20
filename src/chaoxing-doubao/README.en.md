# Chaoxing Doubao Helper

Current version: `1.6.2` · Author: Bart · [中文](README.md)

Extracts the current question from a Chaoxing answer page, hands it to the Doubao web chat for assistance, and writes the result back into the page. The script runs on both sides: the Chaoxing page handles extraction and filling, the Doubao page handles the chat and hands the reply back, and the two halves talk through the userscript manager's cross-tab storage.

## Features

- Reads the currently visible question block (`.questionLi`, with `.TiMu` / `.exam-content` as fallbacks); when no block is found it reports an error instead of sending the whole page.
- Two send modes: question text, or a rendered screenshot of the question area for formula and image questions.
- Opens the Doubao page when it is not running: the bound page if available, otherwise the Doubao home page. The newly opened page picks up the pending message, so it is not processed twice.
- Parses the JSON in the Doubao reply and writes the options back for the detected question type; a manual fetch button exists on the Doubao panel.
- Page binding lives in the panel settings menu: bind the current page, check status, clear the binding. A stale binding can be replaced without opening the old page.
- The `auto next question` and `skip answered` toggles are persisted and restored after a reload.
- True/false questions follow the page's own labels: text when the page shows 正确/错误, letters when it shows A/B.

## Install

1. Install and enable Tampermonkey and allow it to run on web pages.
2. Click the Install link in the repository root README and confirm.
3. Refresh the Chaoxing answer page.

For screenshot mode, also install the Disable Content-Security-Policy extension and enable it, otherwise the page CSP blocks the canvas export.

## Usage

1. Open Doubao, sign in, and use the gear menu to bind the current page; without a binding the Doubao home page is used.
2. Open the Chaoxing answer page and click the rule initialiser.
3. Send text or a screenshot depending on the question. If Doubao is not open, the message is stored first and the page is opened.
4. The reply is fetched automatically, or manually from the Doubao panel.
5. Filling follows the two toggles; question switching depends on page loading and is re-evaluated on the next round when loading is slow.

## Supported pages

| Page | Function |
|---|---|
| `*.chaoxing.com/mooc-ans*` | Extract, send, fill |
| `*.chaoxing.com/exam-ans*` | Extract, send, fill |
| `*.doubao.com/*` | Receive question, fetch reply, page binding |

Page matching only means the script runs on that URL, not that every question layout is recognised. Page redesigns may require re-adapting lookup and filling.

## Compatibility

- Userscript manager: Tampermonkey only (untested elsewhere).
- Screenshots: `html2canvas` loaded from jsDelivr plus the Disable Content-Security-Policy extension.
- `@noframes` keeps a single instance per page.
- Question types that cannot be recognised are skipped rather than guessed.

## Privacy

Questions and answers travel through the manager's cross-tab storage; the page binding and toggles are stored in the same place. There is no first-party server. After you click send, the question or screenshot enters the Doubao web chat and is processed by Doubao under its own terms. Screenshots are rendered locally with canvas and uploaded through the Doubao page; no third-party image host is involved. Clearing extension data removes the binding and settings.

## Versioning

The version in the script header `@version` is authoritative; per-version changes are in the repository's [CHANGELOG.md](../../CHANGELOG.md). Reinstalling keeps the binding and toggles; do not enable two copies of the same script.
