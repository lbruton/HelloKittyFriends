# Architecture Overview

> **Last verified:** 2026-02-27 — audited from `server.js` v2.5.0, `Dockerfile`, `docker-compose.yml`, `package.json`
> **Source files:** `server.js`, `public/app.js`, `public/index.html`, `public/sw.js`, `Dockerfile`, `docker-compose.yml`
> **Known gaps:** None

---

## System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  Docker Container (my-melody-chat)                              │
│  node:20-alpine                                                 │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐     │
│  │  Express Server (server.js)                            │     │
│  │  ┌──────────────┐  ┌────────────┐  ┌───────────────┐  │     │
│  │  │ POST /api/   │  │ Static     │  │ /data/images  │  │     │
│  │  │   chat       │  │ public/    │  │ (uploaded)    │  │     │
│  │  │   welcome    │  │            │  │               │  │     │
│  │  │ GET /api/    │  │ index.html │  │               │  │     │
│  │  │   images     │  │ app.js     │  │               │  │     │
│  │  │   memories   │  │ style.css  │  │               │  │     │
│  │  │   etc.       │  │ sw.js      │  │               │  │     │
│  │  └──────┬───────┘  └────────────┘  └───────────────┘  │     │
│  │         │                                              │     │
│  │  ┌──────▼──────────────────────────────────────────┐   │     │
│  │  │ In-Memory Session Buffers (Map)                 │   │     │
│  │  │ max 1000 sessions, 1hr TTL, 10min prune cycle   │   │     │
│  │  └─────────────────────────────────────────────────┘   │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                 │
│  ┌─────────────────────────────────────┐                        │
│  │  /app/data (Docker volume)          │                        │
│  │  relationship.json                  │                        │
│  │  images-meta.json                   │                        │
│  │  sanrio-characters.json             │                        │
│  │  images/*.jpg                       │                        │
│  └─────────────────────────────────────┘                        │
│                                                                 │
│  Port 3000 (HTTP)  ─────────►  Host 3030                       │
│  Port 3443 (HTTPS) ─────────►  Host 3031                       │
└─────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
  ┌──────────────┐   ┌───────────────┐   ┌────────────────┐
  │ Gemini API   │   │ mem0 API      │   │ Brave Search   │
  │ (Google AI)  │   │ (mem0.ai)     │   │ API            │
  │              │   │               │   │                │
  │ Chat + Vision│   │ User track    │   │ Image search   │
  │ Google Search│   │ Agent track   │   │ Video search   │
  │ grounding    │   │               │   │                │
  └──────────────┘   └───────────────┘   └────────────────┘
                                                  │
         ┌────────────────────────────────────────┘
         ▼
  ┌──────────────────┐
  │ MediaWiki APIs   │
  │                  │
  │ HKIA wiki.gg     │
  │ minecraft.wiki   │
  └──────────────────┘
```

---

## Technology Stack

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Runtime | Node.js | 20 (Alpine) | `node:20-alpine` Docker image |
| Framework | Express | ^4.21.2 | JSON body parser, static file serving |
| AI SDK | @google/genai | ^1.0.0 | Gemini 3 Flash Preview |
| Config | dotenv | ^16.4.7 | Environment variable loading |
| Frontend | Vanilla JS | ES2022+ | No framework, no build step |
| Styling | Plain CSS | CSS custom properties | Dark mode via `data-theme` attribute |
| PWA | Service Worker | Cache API | Stale-while-revalidate for static assets |
| Containerization | Docker | node:20-alpine | Single-container deployment |
| Orchestration | Docker Compose | v3 (implicit) | Named volume, port mapping, restart policy |
| Module system | ES Modules | `"type": "module"` | `import`/`export` syntax throughout |

---

## Service Map

| Service | Purpose | Base URL | Auth Method |
|---------|---------|----------|-------------|
| Gemini (Google AI) | Chat, image vision, Google Search grounding | SDK-managed | `GEMINI_API_KEY` env var via SDK constructor |
| mem0 | Persistent memory (dual-track: user + agent) | `https://api.mem0.ai` | `Token` header via `MEM0_API_KEY` |
| Brave Search | Image search, video search | `https://api.search.brave.com` | `X-Subscription-Token` header via `BRAVE_API_KEY` |
| HKIA Wiki | Hello Kitty Island Adventure wiki search | `https://hellokittyislandadventure.wiki.gg/api.php` | None (public MediaWiki API) |
| Minecraft Wiki | Minecraft wiki search | `https://minecraft.wiki/api.php` | None (public MediaWiki API) |

---

## Request Lifecycle (POST /api/chat)

```
Client (app.js)
  │
  │  POST /api/chat { message, imageBase64?, imageMime?, replyStyle?, sessionId, userId }
  ▼
Express Server
  │
  ├─► updateRelationship(userId) ──► read/write relationship.json
  │
  ├─► Parallel mem0 searches:
  │     ├─► searchMemories(query, userId)     ──► mem0 user track
  │     └─► searchAgentMemories(query)         ──► mem0 agent track
  │
  ├─► Cross-user memory check (if message mentions another known user)
  │     └─► searchMemories(query, otherUserId) ──► mem0 other user track
  │
  ├─► Build system prompt:
  │     SYSTEM_PROMPT + CHARACTER_CONTEXT + identityContext
  │     + crossUserInstruction + relationshipContext
  │     + userMemoryContext + agentMemoryContext + crossUserContext
  │     + styleInstruction
  │
  ├─► Prepend session buffer history (sliding window, max 6 exchanges)
  │
  ├─► Gemini generateContent (1st call)
  │     model: gemini-3-flash-preview
  │     config: temp 1.0, topP 0.95, thinkingBudget -1, googleSearch tool
  │
  ├─► Extract grounding sources from response metadata
  │
  ├─► Wiki pipeline check:
  │     If reply contains [WIKI_SEARCH: wikiId query]:
  │       ├─► searchWiki(wikiId, query)      ──► MediaWiki search API
  │       ├─► fetchWikiContent(wikiId, title) ──► MediaWiki parse API
  │       └─► Gemini generateContent (2nd call) with wiki context
  │
  ├─► Save image if provided (UUID filename → data/images/, metadata → images-meta.json)
  │
  ├─► addToSessionBuffer(sessionId, message, reply)
  │
  ├─► saveToMemory(message, reply, userId) (fire-and-forget)
  │     ├─► mem0 user track (skipped for guest)
  │     └─► mem0 agent track (always)
  │
  └─► Response: { reply, sources, wikiSource? }
```

---

## Port Configuration

| Protocol | Container Port | Host Port | Purpose |
|----------|---------------|-----------|---------|
| HTTP | 3000 | 3030 | Primary app access |
| HTTPS | 3443 | 3031 | PWA install over LAN (requires certs) |

HTTPS is optional. The server checks for `certs/cert.pem` and `certs/key.pem` at startup. If present, an `https.createServer` listener starts on port 3443. If absent, only HTTP is available.

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| No frontend framework | Single-page app is simple enough for vanilla JS. No build step, no bundler, no transpiler. |
| No build step | `public/` is served directly by Express. Edit and reload. |
| System prompt rebuilt per request | Each request gets fresh memory context, relationship stats, and reply style injection. No stale system prompts. |
| Chat session recreated per request | `ai.models.generateContent()` called each time with full contents array (buffer + current message). No persistent SDK chat session. |
| Conversation buffer in-memory | `Map<sessionId, {contents, lastAccess}>` with sliding window (max 6 exchanges = 12 items). Pruned every 10 minutes (1hr TTL). |
| ES Modules | `"type": "module"` in package.json. All imports use `import` syntax. |
| Images compressed client-side | Canvas resize to 1024px max width, JPEG 0.8 quality before base64 encoding. Reduces upload payload. |
| Brave Search over Google CSE | Single API key, no engine setup, returns images + videos. Google CSE requires a Programmable Search Engine ID. |
| `safesearch=strict` | Brave image/video API does not accept `"moderate"` — returns HTTP 422. |
| Web Audio API for sounds | Synthesized chimes (sine waves), zero audio files. Reply chime = C5+E5, typing tick = A5 blip. |
| Fire-and-forget memory saves | `saveToMemory()` does not `await` — errors are logged but do not block the response. |
| Per-user keyed data | `relationship.json` uses a versioned keyed structure (`_version: 2`). Auto-migrates from legacy flat format. |
| Guest privacy | Guest user skips mem0 user track saves. Cross-user memory never queries guest data. |

---

## Known Users

| User ID | Display Name | mem0 User ID |
|---------|-------------|-------------|
| `amelia` | Amelia | `melody-friend-amelia` |
| `lonnie` | Lonnie | `melody-friend-lonnie` |
| `guest` | Guest | `melody-friend-guest` |
| (none/legacy) | - | `melody-friend` (MEM0_USER_ID env var fallback) |

---

## Related Pages

- [API Reference](api-reference.md) — full endpoint documentation
- [Docker Deployment](docker-deployment.md) — build, run, and environment setup
- [Data Persistence](data-persistence.md) — server-side files, client storage, mem0 tracks
