# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Moodle-Palette is a collection of Tampermonkey userscripts that add keyboard shortcuts and command-palette features to Moodle (targeting Calvin University's instance at moodle.calvin.edu). The scripts enhance instructor productivity for grading, quiz management, and course navigation.

## Architecture

There is no build system, package manager, or test framework. The scripts are standalone JavaScript files loaded directly by Tampermonkey.

### Main Scripts

- **moodle-ninja.js** — Primary command palette (Ctrl/Cmd+P). Course navigation, assignment grading, file upload viewing, AI copilot experiments. Uses ninja-keys library from CDN.
- **quiz-ninja.js** — Quiz-specific command palette (Ctrl+K). Quiz grading, feedback reuse, question bank access. Also uses ninja-keys.
- **keyboard-rubric-grading.js** — Number key shortcuts (0-9) for rubric grading, plus special keys (f=full credit, >=save & next).
- **discussion-full-credit.js** — Lightweight keyboard shortcuts for forum grading (f=full credit, m=missing, >=next user).
- **scraps.js** — Small utility for batch-setting close times.

### Key Patterns

- **IIFE encapsulation** — Scripts wrap logic in immediately-invoked function expressions.
- **URL-based feature gating** — Conditional behavior based on `window.location.pathname` to activate features only on relevant Moodle pages.
- **Moodle DOM integration** — Accesses `unsafeWindow`, Moodle's `M.cfg` object, and jQuery. Uses Moodle-specific selectors (`[data-region]`, `.gradingtable`, `.criterion`, etc.).
- **localStorage caching** — Caches activity directories and scraped grading comments.
- **CDN dependencies** — ninja-keys and lit-html loaded from unpkg.com.

### Deployment

Scripts declare Tampermonkey metadata headers (`// ==UserScript==`) specifying `@match https://moodle.calvin.edu/*`, `@grant unsafeWindow`, and `@run-at document-idle`. To test changes, update the script content in Tampermonkey's editor or point it at a local file.
