# Chaoxing Plain-text Paste Helper

Current version: `1.2.1` · Author: Bart · [中文](README.md)

A paste helper for the short-answer editors on Chaoxing pages. Image pastes are left untouched; text-only pastes are converted to plain text with line breaks preserved.

## Features

- Intercepts paste events on UEditor instances found on the Chaoxing page.
- Reads the clipboard: when it contains an image, the native paste is allowed so image questions keep working.
- When it contains text only, the content is split by line breaks and inserted as plain text, so page styles are not carried over and paragraphs are not lost.

## Install

1. Install and enable Tampermonkey.
2. Click the "paste helper" install link in the repository root README and confirm.
3. Refresh the Chaoxing page.

This is a separate second script; the main script does not contain it. Skipping it does not stop the main script, it only affects text entry in short-answer editors.

## Limitations

- Only UEditor instances reachable from the Chaoxing page are handled.
- Requires `UE` (UEditor) to be loaded; nothing happens before the instance exists, and the page is re-detected after a refresh.
- Behaviour depends on the browser's Clipboard API implementation and permissions; without read permission the native paste path is used.

## Troubleshooting

**Paste does nothing, or styles remain**: confirm the script is enabled, the page has a UEditor instance, and reload the page.

**Image paste broke**: the script is treating images as text — check that this repository's version is installed rather than an older copy with the single-path logic.

## Versioning

The version in the script header `@version` is authoritative; per-version changes are in the repository's [CHANGELOG.md](../../CHANGELOG.md).
