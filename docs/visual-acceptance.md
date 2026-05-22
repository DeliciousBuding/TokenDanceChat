# Visual Acceptance Notes

TokenDanceChat is the AgentHub technical validation project and a playable demo. Visual work should prove that the AgentHub IM surface can feel credible as a real chat product, not only that the protocol works.

## Product Direction

- Primary posture: light, restrained enterprise chat UI inspired by Feishu/Lark.
- Interaction feel: Telegram-grade composer ergonomics, readable message flow, strong mobile tap targets.
- Avoid marketing-style hero layouts, decorative cards, and empty ornamental space.
- Prefer lucide icons for controls; text labels are reserved for commands that need clarity.

## Multimodal Screenshot Acceptance

Every meaningful UI polish increment must capture real browser screenshots before claiming completion. Generated mockups can help set direction, but they are not acceptance evidence.

Required workflow:

1. Capture real browser screenshots with `npm run visual:acceptance` or an equivalent Playwright pass.
2. Review screenshots directly for layout, typography, button size, icon balance, density, empty space, and visual hierarchy.
3. Compare against a deliberate aesthetic reference when useful. A `gpt-image-2` mockup is acceptable as a reference target, but the implementation passes only when the real browser screenshots and metrics pass.
4. Record the screenshot output directory in `ROADMAP.md` or the relevant PR/commit notes for meaningful frontend polish.

| Viewport | Theme | Required checks |
|---|---|---|
| 1440x900 | light | Header density, sidebar width, visible message count, no horizontal toolbar overflow. |
| 1440x900 | light + group info | Right-side group admin panel width, full-height alignment, unclipped group heading, owner-only Webhook section visibility, readable admin controls. |
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
- desktop sidebar model preview count and online-user section y-position;
- group info panel width, height, right alignment, heading clipping, Webhook section visibility, member-row count, panel-local controls below 44x44, desktop title line stability, and first-run group empty-state visibility;
- console errors.

Current hard gates in `npm run visual:acceptance` include:

- no horizontal overflow and no console/page errors;
- mobile textarea at least 180px wide, tablet textarea at least 360px wide;
- collapsed mobile composer at most 24% of viewport height;
- mobile title at least 120px wide and the public-chat title must not be clipped;
- mobile visible message text must stay at or below 15px;
- at least 4 visible messages in collapsed mobile and tablet seeded chat views.
- desktop sidebar model preview at most 4 cards and online-user section no lower than 680px from the top.
- group info scenario must show a 320-390px right-aligned full-height panel, an unclipped heading, owner/admin Webhook controls, at least one member row, no visible panel controls below 44x44, a single-line desktop title, and a visible first-run group empty state.

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

The script writes screenshots and `metrics.json` to a temp directory such as `C:\Users\Ding\AppData\Local\Temp\tdchat-visual-*`. It refuses non-local targets unless `VISUAL_ALLOW_NONLOCAL=1` is set, because it seeds demo messages. Do not claim UI polish from a generated reference alone; use generated images only as aesthetic guidance for the real implementation.

## 2026-05-23 Acceptance

Latest accepted screenshot pass:

- Output: `C:\Users\Ding\AppData\Local\Temp\tdchat-visual-2026-05-22T23-29-14-410Z`
- Baseline: production build served by the Go backend on a clean temporary SQLite DB, so screenshots contain only the current seeded demo transcript and no repeated history from earlier runs.
- Scenarios: seven screenshots, including `desktop-light-group-info`.
- Desktop light/dark 1440x900: textarea 816x48px, composer 130px, 4 visible seeded messages, `smallControls=0`, sidebar width 312px, sidebar model preview 4 cards, sidebar online-user section top 561px, no horizontal overflow, no console errors.
- Desktop light group info 1440x900: right-side panel 384px wide and full height, Webhook section visible for the owner, 1 member row, `groupSmallControls=0`, desktop title 174x24 and single-line, visible group empty state, no horizontal overflow, no console errors.
- Tablet light 768x1024: textarea 456x48px, mobile title width 580px, composer 130px, 4 visible seeded messages, `smallControls=0`, no horizontal overflow, no console errors.
- Mobile light/dark 390x844: title width 202px with `公共聊天` unclipped, message font 13.5px, collapsed composer textarea 208x66px, composer 87px, 4 visible seeded messages, `smallControls=0`, no horizontal overflow, no console errors.
- Mobile light with formatting toolbar: textarea 208x66px, composer 144px, 4 visible seeded messages, `smallControls=0`, no horizontal overflow, no console errors.
- Screenshot review confirms the group admin panel controls are readable and no longer tiny; desktop title no longer wraps when the right panel is open; the first-run group empty state is present without decorative filler; mobile and desktop core chat remain visually stable.

Screenshot passes caught real implementation issues:

- 768px tablet was forced into desktop layout and squeezed the textarea to 144px; the accepted layout now keeps tablet/mobile top bar until `lg`.
- Mobile header showed `公共聊天` as `公...`; secondary mobile actions now live behind the more menu.
- Desktop sidebar previously showed six model cards plus tall empty-state rows before online users; the accepted sidebar now keeps four model preview cards and brings online users to 561px from the top.
- A follow-up pass caught a 43px tablet avatar button caused by pixel rounding; clickable avatars now use a 46px minimum target.
- The group info screenshot initially hid owner-only Webhook controls because the frontend read legacy `members` instead of the backend `group_info.group_members` payload; the accepted pass verifies the typed role payload after a real WebSocket round trip.
- Opening the group info panel squeezed desktop header icon buttons until fixed-width controls shrank to roughly 30px; header buttons now keep their 44px floor with `flex-shrink-0`.
- Manual screenshot review then caught the desktop group title wrapping and a sparse first-run group state; the final script gates desktop title single-line stability and visible group empty-state content.

## Current Reference Prompt

Use this with `gpt-image-2` when an image-generation tool and API key are available. Treat the output as visual direction, not as a source asset to copy blindly, and never as a replacement for real browser screenshot acceptance.

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
