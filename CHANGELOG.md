# Changelog

All notable changes to My Melody Chat will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

---

## [2.3.1] - 2026-02-27

### Added — JSDoc Coverage

- Added JSDoc annotations to server.js (+249 lines): @file, @typedef, @param, @returns for all functions, routes, and constants
- Added JSDoc annotations to public/app.js (+113 lines): all DOM manipulation, audio, welcome flow, and utility functions
- Added JSDoc annotations to public/sw.js (+50 lines): service worker lifecycle and caching strategy

---

## [2.3.0] - 2026-02-27

### Added — Game Wiki Integration + English Speech Patterns

- Two-step wiki search pipeline: Gemini emits `[WIKI_SEARCH: wiki_id query]`, server searches MediaWiki API, fetches page intro, makes second Gemini call with wiki context
- Wiki registry (extensible): Hello Kitty Island Adventure (`hkia`) and Minecraft (`minecraft`)
- Lavender-themed wiki source card in frontend with book icon
- Authentic English speech patterns based on anime dub translations (dropped Japanese verbal tics)
- Ali:Chat format example dialogues in system prompt
- `/api/wiki-search` REST endpoint for direct wiki queries

---

## [2.2.0] - 2026-02-27

### Added — PWA, Sounds, Welcome Flow

- Progressive Web App with service worker (stale-while-revalidate caching)
- PWA install prompt banner for Android/iOS
- Web Audio API sound engine: reply chime (C5+E5) and typing tick (A5)
- First-time welcome onboarding flow (name, color, interests saved to mem0)
- Returning user personalized greeting
- Accent color system from favorite color
- Dark mode toggle
- Reply style selector (default/brief/detailed)
- Sound on/off toggle

---

## [2.1.0] - 2026-02-27

### Changed — Speed Optimization

- Swapped model from `gemini-3.1-pro-preview` to `gemini-3-flash-preview` for 3x faster responses

---

## [2.0.0] - 2026-02-27

### Added — Initial Release

- My Melody companion chat powered by Gemini AI
- Dual-track mem0 persistent memory (friend facts + Melody personality)
- Image vision (upload, compress, analyze with Gemini)
- Image gallery with lightbox and delete
- Brave Search integration (image search, video search)
- Relationship tracking (days together, chat count, streak, milestones)
- Mobile-first responsive design (max-width 420px)
- Docker deployment (node:20-alpine, port 3000)
