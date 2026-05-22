# Visual Acceptance Notes

TokenDanceChat is the AgentHub technical validation project and a playable demo. Visual work should prove that the AgentHub IM surface can feel credible as a real chat product, not only that the protocol works.

## Product Direction

- Primary posture: light, restrained enterprise chat UI inspired by Feishu/Lark.
- Interaction feel: Telegram-grade composer ergonomics, readable message flow, strong mobile tap targets.
- Avoid marketing-style hero layouts, decorative cards, and empty ornamental space.
- Prefer lucide icons for controls; text labels are reserved for commands that need clarity.

## Screenshot Acceptance

Every meaningful UI polish increment should capture real browser screenshots before claiming completion:

| Viewport | Theme | Required checks |
|---|---|---|
| 1440x900 | light | Header density, sidebar width, visible message count, no horizontal toolbar overflow. |
| 1440x900 | dark | Contrast and spacing remain usable without becoming a black slab. |
| 768x1024 | light | Tablet should keep chat full-width until `lg`; textarea should be wider than 360px. |
| 390x844 | light | Composer stays usable; title is readable, textarea should be wider than 180px with controls visible. |
| 390x844 | dark | Tap targets remain at least 44px where practical; no text overlap. |

Collect these metrics with screenshots:

- total buttons and count below 44x44;
- minimum textarea width;
- composer height as a percentage of viewport height;
- mobile header title width and whether `公共聊天` is clipped;
- visible message font size on mobile;
- first meaningful chat content y-position;
- horizontal scroll presence;
- number of visible messages above composer;
- console errors.

Current hard gates in `npm run visual:acceptance` include:

- no horizontal overflow and no console/page errors;
- mobile textarea at least 180px wide, tablet textarea at least 360px wide;
- collapsed mobile composer at most 24% of viewport height;
- mobile title at least 120px wide and the public-chat title must not be clipped;
- mobile visible message text must stay at or below 15px;
- at least 4 visible messages in collapsed mobile and tablet seeded chat views.

Run the reusable Playwright acceptance script against a local production build:

```powershell
cd D:\Code\Projects\TokenDanceChat\frontend
npm run build

# In another shell, serve the built app through the Go backend.
cd D:\Code\Projects\TokenDanceChat\backend
$env:CHAT_DB_PATH = Join-Path $env:TEMP 'tdchat-visual-chat.db'
$env:CHAT_FRONTEND_DIR = 'D:\Code\Projects\TokenDanceChat\frontend\dist'
$env:CHAT_ADDR = ':8091'
go run .

# Then collect screenshots and metrics.
cd D:\Code\Projects\TokenDanceChat\frontend
$env:VISUAL_BASE_URL = 'http://127.0.0.1:8091'
npm run visual:acceptance
```

The script writes screenshots and `metrics.json` to a temp directory such as `C:\Users\Ding\AppData\Local\Temp\tdchat-visual-*`. It refuses non-local targets unless `VISUAL_ALLOW_NONLOCAL=1` is set, because it seeds demo messages.

## 2026-05-23 Acceptance

Latest accepted screenshot pass:

- Output: `C:\Users\Ding\AppData\Local\Temp\tdchat-visual-2026-05-22T19-36-55-386Z`
- Desktop light/dark 1440x900: textarea 816px, composer 126px, 4 visible seeded messages, no horizontal overflow, no console errors.
- Tablet light 768x1024: textarea 456px, 4 visible seeded messages, no horizontal overflow, no console errors.
- Mobile light/dark 390x844: title width 202px with `公共聊天` unclipped, message font 13.5px, collapsed composer textarea 208px, composer 91px, 4 visible seeded messages, no horizontal overflow, no console errors.
- Mobile light with formatting toolbar: composer 144px, 4 visible seeded messages, no horizontal overflow, no console errors.
- Screenshot review removed the duplicated non-own bottom timestamp; the remaining timestamp sits next to the sender name for a denser chat flow.

Earlier screenshot passes caught two real issues:

- 768px tablet was forced into desktop layout and squeezed the textarea to 144px; the accepted layout now keeps tablet/mobile top bar until `lg`.
- Mobile header showed `公共聊天` as `公...`; secondary mobile actions now live behind the more menu.

## Current Reference Prompt

Use this with `gpt-image-2` when an image-generation tool and API key are available. Treat the output as visual direction, not as a source asset to copy blindly.

```text
Use case: ui-mockup
Asset type: product UI reference for a web chat app
Primary request: create a polished desktop and mobile chat interface reference for TokenDanceChat, an AgentHub validation demo where AI agents are contacts in an enterprise IM.
Style/medium: high-fidelity SaaS product UI mockup, restrained Feishu/Lark enterprise workspace with Telegram-like message flow.
Composition/framing: show one desktop 1440x900 chat workspace and one mobile 390x844 chat screen side by side; desktop has sidebar, conversation header, message transcript, and composer; mobile focuses on readable transcript and compact composer.
Color palette: light mode first, warm neutral surfaces, one confident red/coral primary accent, subtle borders, dark mode variant hinted but not dominant.
Typography: system UI, readable 14-16px body text, compact metadata, no tiny unreadable labels.
Controls: lucide-style icon buttons, 44px mobile tap targets, compact but not cramped composer, clear send button, restrained toolbar.
Constraints: no marketing hero, no decorative blob backgrounds, no glassmorphism, no fake brand logos, no unreadable microtext, no overlapping UI, no emoji as primary icons.
```

## Review Notes

If screenshots still feel weak, adjust in this order:

1. Mobile composer row and formatting toolbar collapse.
2. Header action overflow and secondary actions.
3. Sidebar information density above the fold.
4. Message transcript padding and empty-state scale.
5. Remaining `text-[10px]` pockets in banners, metadata, and badges.
