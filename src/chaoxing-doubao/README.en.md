# Chaoxing Doubao Helper

Current version: `1.6.5` · Author: Bart · [中文](README.md)

Extracts the current question from a Chaoxing answer page, hands it to the Doubao web chat for assistance, and writes the result back into the page. The script runs on both sides: the Chaoxing page handles extraction and filling, the Doubao page handles the chat and hands the reply back, and the two halves talk through the userscript manager's cross-tab storage.

## Features

- **Homework pages** are extracted question by question: only the stem and options are sent, so headers such as question count, full marks, time window and the answer-card strip stay on the page. Screenshots render only the question blocks.
- **Exam pages** read only the currently visible question, so exam navigation and the question-number strip are never sent.
- Two send modes: question text, or a rendered screenshot for formula and image questions.
- The "open Doubao" button opens the bound conversation on a single click (only a 2-second debounce); it does not check whether a page is already open.
- Binding is manual: click "bind this page" on the Doubao panel to register it as the dedicated page, and the red "unbind" button clears it. When this page matches the binding record the status turns green ("bound"); otherwise it shows "not bound".
- Binding is per browser tab: switching Doubao to a `/chat/<id>` conversation keeps the binding valid. With no binding record the Chaoxing side will not send and prompts you to bind first.
- Delivery states are reported back: received, done, failed and timed out are shown separately on the panel instead of staying on "sent".
- Parses the JSON in the Doubao reply and writes the options back for the detected question type; a manual fetch button exists on the Doubao panel.
- The Doubao panel lists three buttons directly: manual fetch, bind this page, unbind.
- The `skip answered` toggle is persisted. `auto next question` only appears and takes effect on exam pages; homework pages never turn pages automatically.
- True/false questions follow the page's own labels: text when the page shows 正确/错误, letters when it shows A/B.

## Install

1. Install and enable Tampermonkey and allow it to run on web pages.
2. Click the Install link in the repository root README and confirm.
3. Refresh the Chaoxing answer page.

> [!IMPORTANT]
> **Install and enable the Disable Content-Security-Policy extension if you want screenshots.**
> The Chaoxing page CSP blocks the `html2canvas` script loaded from jsDelivr and the canvas export, so screenshots fail without it. Text sending and cross-page messaging are unaffected. Click the extension icon to confirm it is enabled, and keep it enabled per tab.

> [!IMPORTANT]
> Short-answer questions need the [plain-text paste helper](../chaoxing-paste-helper/README.en.md), which is a required second script installed separately. With only this script, short answers cannot be entered properly and the setup does not work as a whole.

## Usage

1. Open Doubao and sign in, go to the conversation you want to use, and click "bind this page" on the Doubao panel; the status turns green when bound.
2. Open the Chaoxing answer page and click the rule initialiser.
3. Send text or a screenshot depending on the question. With no binding record the send is blocked; if the Doubao page is closed, open it from the panel and bind this page there before sending.
4. The reply is fetched automatically, or manually from the Doubao panel.
5. On homework pages the whole page is sent once and filled in one pass. On exam pages one question is sent at a time; turn on `auto next question` to move on automatically.

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
- `@noframes` keeps one instance per page; question pages embedded in a child frame are not supported.
- Unrecognised question types are skipped rather than guessed.
- Binding is per tab; with several Doubao tabs open, bind the one you want to answer in.

## Privacy

Questions and answers travel through the manager's cross-tab storage; the page binding and toggles are stored in the same place. There is no first-party server. After you click send, the question or screenshot enters the Doubao web chat and is processed by Doubao under its own terms. Screenshots are rendered locally with canvas and uploaded through the Doubao page; no third-party image host is involved. Clearing extension data removes the binding and settings.

## Versioning

The version in the script header `@version` is authoritative; per-version changes are in the repository's [CHANGELOG.md](../../CHANGELOG.md). Reinstalling keeps the binding and toggles; do not enable two copies of the same script.
