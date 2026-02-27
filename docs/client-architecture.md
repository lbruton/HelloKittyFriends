# Client-Side Architecture

> **Last verified:** 2026-02-27
> **Source files:** `public/app.js`, `public/index.html`
> **Known gaps:** None

---

## Overview

My Melody Chat is a single-page application built with vanilla HTML, CSS, and JavaScript. There is no framework, no bundler, and no build step. The entire client lives in three files:

| File | Purpose |
|------|---------|
| `public/index.html` | SPA shell, DOM structure, service worker registration |
| `public/style.css` | All styles, theming, dark mode, responsive layout |
| `public/app.js` | All client-side logic (1035 lines, v2.5.0) |

The app loads via a single `<script src="app.js"></script>` tag at the bottom of the body. Service worker registration is inlined in a separate `<script>` block in `index.html`.

## SPA Shell Structure

The HTML defines a fixed-layout app container with four vertical zones:

```
┌─────────────────────────────────┐
│  Header (avatar, title, gear)   │
├─────────────────────────────────┤
│                                 │
│  Tab Content (flex: 1)          │
│  ┌───────────────────────────┐  │
│  │ Chat | Images | Memories  │  │
│  │ (only one visible)        │  │
│  └───────────────────────────┘  │
│                                 │
├─────────────────────────────────┤
│  Tab Bar (Chat / Images / Mem)  │
└─────────────────────────────────┘
```

### Tab System

Tabs use a show/hide pattern on `.tab-pane` elements. No routing, no hash changes.

```js
// All tab panes hidden by default (display: none)
// Active pane gets class "active" (display: flex)
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    // Remove active from all buttons and panes
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    // Activate selected
    btn.classList.add('active');
    document.getElementById(target).classList.add('active');
    // Lazy-load tab data
    if (target === 'tabImages') loadGallery();
    else if (target === 'tabMemories') loadMemories();
  });
});
```

Tab IDs:

| Tab Button `data-tab` | Pane ID | Content |
|------------------------|---------|---------|
| `tabChat` | `tabChat` | Chat area, typing indicator, image preview, input footer |
| `tabImages` | `tabImages` | Gallery grid (lazy-loaded on tab switch) |
| `tabMemories` | `tabMemories` | Relationship stats + memory list (lazy-loaded) |

## Module Breakdown (app.js)

`app.js` is organized into labeled sections using comment headers (`// --- Section ---`). There are no ES modules or imports.

### User Picker Overlay

Full-screen overlay (`#userPicker`) shown on first load if no user is stored in `localStorage('melodyActiveUser')`.

| User ID | Display Name |
|---------|-------------|
| `amelia` | Amelia |
| `lonnie` | Lonnie |
| `guest` | Guest |

- Buttons use `data-user` attributes wired via `querySelectorAll('[data-user]')`
- Selected user is persisted to `localStorage` and sent as `userId` in chat API requests
- Header label `#activeUserLabel` updates on selection
- Switch User button in settings dropdown re-shows the picker

### Chat UI

The chat tab consists of:

| Element | ID | Purpose |
|---------|----|---------|
| Chat area | `chatArea` | Scrollable message container |
| Message input | `messageInput` | Text input with `enterkeyhint="send"` |
| Send button | `sendBtn` | Triggers `sendMessage()` |
| Typing indicator | `typingIndicator` | Animated dots, shown/hidden via `.active` class |
| Image button | `imageBtn` | Opens file picker |
| Image preview | `imagePreview` | Thumbnail strip before send |

**Message flow:**

```
User types → Enter or click Send
  → sendMessage()
    → addMessage(text, 'user', imageDataURL)   // render user bubble
    → POST /api/chat { message, replyStyle, sessionId, userId, imageBase64?, imageMime? }
    → showTyping() + playTypingTick()
    → await response
    → hideTyping() + playReplyChime()
    → processReply(data.reply, data.sources, data.wikiSource)
      → parse search tags via regex
      → fetch media (image search, video search, gallery search)
      → addMessage(displayText, 'assistant', ..., sources, wikiSource)
      → async: fetch reaction GIF if [REACTION:] tag present
```

**Auto-scroll:** `chatArea.scrollTop = chatArea.scrollHeight` after every `addMessage()` call.

**Message rendering:**
- User messages: `textContent` (plain text, XSS-safe)
- Assistant messages: basic markdown via regex (bold, italic, bullet lists), set via `innerHTML`
- Markdown transform chain: escape HTML entities, `**bold**`, `*italic*`, bullet lists, newlines to `<br>`

### Image Attachment

Pipeline: `FileReader` -> `Image` -> `Canvas` resize -> `toDataURL` -> Base64 extraction

```js
function compressAndStage(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const maxW = 1024;                    // Max width in pixels
      let w = img.width, h = img.height;
      if (w > maxW) {
        h = Math.round(h * (maxW / w));     // Maintain aspect ratio
        w = maxW;
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const dataURL = canvas.toDataURL('image/jpeg', 0.8);  // JPEG quality 0.8
      const base64 = dataURL.split(',')[1];
      // Stage for upload
      pendingImageBase64 = base64;
      pendingImageMime = 'image/jpeg';
      pendingImageDataURL = dataURL;
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
```

| Parameter | Value |
|-----------|-------|
| Max width | 1024px |
| Output format | JPEG |
| Quality | 0.8 |
| Aspect ratio | Maintained (height scaled proportionally) |

The preview thumbnail appears in the `.image-preview` strip. The `x` button calls `clearImagePreview()` to reset all pending state.

### Image Gallery Tab

- Fetches `GET /api/images` on tab activation (lazy-loaded)
- Renders a 3-column CSS grid of square thumbnails (`aspect-ratio: 1`)
- Each item has a delete overlay button (`.delete-overlay`) that appears on hover/active
- Clicking an image opens the lightbox
- Delete calls `DELETE /api/images/:id` then reloads the gallery
- Images use `loading="lazy"` for performance
- Empty state: "No images shared yet! Send a photo in chat"

### Memories Tab

Two sections rendered on tab activation:

1. **Relationship Stats** (`loadRelationshipStats`) - Fetches `GET /api/relationship?userId=` and renders three stat cards: Days, Chats, Streak
2. **Memory List** (`loadMemories`) - Fetches `GET /api/memories?userId=` and renders memory cards with track labels (Friend/Melody), text, date, and delete button

Memory track labels use CSS classes `.friend` (pink) and `.melody` (lavender) for visual distinction.

### Settings Dropdown

Gear icon button (`#settingsBtn`) toggles `#settingsDropdown` visibility via `.hidden` class.

| Setting | Control | Storage Key | Default |
|---------|---------|-------------|---------|
| Dark Mode | Toggle button | `darkMode` | `false` |
| Sounds | Toggle button | `soundEnabled` | `true` (not 'false') |
| Reply Style | Select dropdown | `replyStyle` | `'default'` |
| User | Switch button | `melodyActiveUser` | None (shows picker) |

The dropdown is dismissed by clicking outside (document-level click listener checks `contains`).

Reply style options: `default` (Normal), `brief` (Brief), `detailed` (Detailed).

### PWA Install Banner

Listens for the `beforeinstallprompt` event, defers it, and shows a banner at the bottom of the app container.

```
┌─────────────────────────────────────────────┐
│ Add My Melody to your home screen!  [Install] [x] │
└─────────────────────────────────────────────┘
```

- Banner is created dynamically via `document.createElement`
- Dismiss sets `sessionStorage('installDismissed')` to suppress for the session
- Install button calls `deferredInstallPrompt.prompt()` and awaits `userChoice`
- Banner will not show if one already exists in the DOM (`.install-banner` check)

### Audio Engine (Web Audio API)

Synthesized sounds using the Web Audio API. Zero audio files.

| Sound | Function | Notes | Duration |
|-------|----------|-------|----------|
| Reply chime | `playReplyChime()` | C5 (523.25Hz) then E5 (659.25Hz), sine waves | 2 x 0.3s |
| Typing tick | `playTypingTick()` | A5 (880Hz), sine wave | 0.08s |

Implementation details:
- Lazy `AudioContext` creation via `getAudioContext()`
- Falls back to `webkitAudioContext` for older browsers
- Auto-resumes suspended context (browser policy)
- Audio unlocked on first `touchstart` or `click` (Android requirement)
- Gain ramp: attack 0.04s to 0.15, exponential decay to 0.001
- All sounds gated by `soundEnabled` flag

### Session Management

Each browser tab gets a unique `sessionId` via `crypto.randomUUID()`, stored in `sessionStorage`.

```js
const sessionId = sessionStorage.getItem('melodySessionId') || (() => {
  const id = crypto.randomUUID();
  sessionStorage.setItem('melodySessionId', id);
  return id;
})();
```

- `sessionStorage` scopes the ID to the tab (new tab = new session)
- Survives page refresh within the same tab
- Sent with every `POST /api/chat` request for server-side conversation buffer tracking

### Search Tag Parser

The `processReply()` function parses special tags from assistant responses using regex, fetches media, and renders results inline.

| Tag | Regex | API Called | Rendering |
|-----|-------|-----------|-----------|
| `[IMAGE_SEARCH: query]` | `/\[IMAGE_SEARCH:\s*(.+?)\]/` | `GET /api/image-search?q=` | Random pick from top 4 results, displayed as clickable image |
| `[VIDEO_SEARCH: query]` | `/\[VIDEO_SEARCH:\s*(.+?)\]/` | `GET /api/video-search?q=` | First result as clickable card with thumbnail |
| `[GALLERY_SEARCH: keywords]` | `/\[GALLERY_SEARCH:\s*(.+?)\]/` | `GET /api/gallery-search?q=` | Saved photo from `/data/images/` |
| `[WIKI_SEARCH: wiki query]` | `/\[WIKI_SEARCH:\s*.+?\]/` | Server-side (intercepted) | Wiki source card (lavender themed) |
| `[REACTION: emotion]` | `/\[REACTION:\s*(\w+)\]/` | `nekos.best/api/v2/{category}` | Anime GIF appended to bubble (async, non-blocking) |

All tags are stripped from display text before rendering. Image search picks a random result from the first 4 valid results. Gallery search only fires if no image search result was found.

**Reaction GIF mapping** (`REACTION_MAP`):

| Emotion | nekos.best Categories |
|---------|----------------------|
| `happy` | happy, smile, dance |
| `love` | hug, cuddle, pat |
| `shy` | blush, wave, wink |
| `sad` | cry, pout |
| `think` | think, nod, shrug |
| `playful` | tickle, poke, nom |
| `angry` | angry, facepalm, baka |
| `sassy` | smug, thumbsup, yeet |
| `tired` | yawn, bored, sleep |
| `excited` | highfive, thumbsup, dance |

### Welcome Flow

First-time onboarding for each user. Runs on init via `runWelcomeFlow()`.

**Detection:** Checks `localStorage('melodyWelcomeDone-{userId}')`. If absent, runs the interactive flow. If present, fetches personalized returning-user greeting from `GET /api/welcome-status`.

**Interactive flow steps:**

1. Melody introduces herself (scripted messages)
2. Ask for name -> `POST /api/welcome { type: 'name', value, userId }`
3. Ask for favorite color -> `POST /api/welcome { type: 'color', value, userId }` -> `applyAccentColor()`
4. Ask for interests -> `POST /api/welcome { type: 'interests', value, userId }`
5. Set `localStorage` flag, restore normal chat

During the flow, `welcomeActive = true` causes `sendMessage()` to route input to a `Promise` resolver instead of the chat API. The image button is hidden during onboarding.

## Event Handling Patterns

- **Click/touch:** Direct `addEventListener` on DOM refs (no delegation except user picker buttons)
- **Keyboard:** `keydown` on `messageInput` checks `Enter` without `Shift`
- **Outside-click dismiss:** Document-level click listener for settings dropdown
- **Resize:** `visualViewport.resize` hides tab bar when Android keyboard opens (height diff > 100px)
- **Lifecycle:** `beforeinstallprompt` for PWA install, `touchstart`/`click` for audio unlock

## DOM Manipulation Approach

All DOM manipulation is imperative via `document.createElement`, `appendChild`, `classList.toggle`, `textContent`, and `innerHTML` (only for markdown-formatted assistant messages). No template literals inserted via innerHTML for user content (XSS prevention).

## Lightbox

Full-screen image viewer with dark overlay (`rgba(0, 0, 0, 0.9)`, z-index 100).

- Opened by `openLightbox(src)` which sets `lightboxImg.src` and adds `.active` class
- Closed by clicking the `x` button or clicking the overlay background
- Used by: chat message images, search result images, gallery thumbnails

## Accent Color System

A `COLOR_MAP` object maps 24 color names to hex values. Applied via:

```js
document.documentElement.style.setProperty('--accent-highlight', hex);
```

The accent color affects tab indicator color (active tab text and SVG stroke). Saved to `localStorage('accentColor')` and restored on load.

---

## Related Pages

- [PWA & Service Worker](pwa-service-worker.md) - Caching strategy, install prompt, offline behavior
- [Styling & Theming](styling-theming.md) - CSS architecture, dark mode, color system
