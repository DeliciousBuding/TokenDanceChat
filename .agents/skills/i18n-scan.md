# i18n-scan -- TokenDanceChat internationalization audit SOP

Reusable SOP for auditing i18n completeness. Designed for any agent to execute without project-specific onboarding. All commands run from `frontend/`.

---

## 1. Scan checklist

Run these checks in order. Each check produces a table row in the output format (Section 4).

### 1.1 Extract all `t("...")` call-site keys

```powershell
cd frontend && rg -o --no-filename 't\("([^"]+)"\)' -r '$1' src/ | sort | Get-Unique
```

This produces the set of keys actually used in source. Pipe to a temp file for cross-referencing.

### 1.2 Verify every call-site key exists in both languages

For each key from 1.1, check it resolves in `zhCN` and `enUS` objects in `src/i18n/translations.ts`. Use the same dot-path resolution that `resolvePath()` uses (Section 2 of `context.tsx`).

Keys that fail resolution fall back to the raw path string (visible in UI as `"section.missingKey"`). These are **MISSING** -- add them to the appropriate section in both languages.

### 1.3 Find keys in translations.ts never used in source

Compare the full set of dot-path keys (recursively flattened from `translations.ts`) against the call-site set from 1.1. Keys in the translation object but never called as `t("...")` are **UNUSED** -- candidates for removal.

To flatten the translation object, walk the TypeScript type `TranslationDict` recursively, joining parent keys with `"."`.

### 1.4 Find inline bilingual ternaries

```powershell
cd frontend && rg -n 'lang\s*===\s*"zh-CN"\s*\?\s*".+?"\s*:' src/ --type ts --type tsx
```

Every hit is a **HARDCODED** string that should use `t()`. Typical cases:
- Sidebar "Connecting..." / "连接中..." (dup of `sidebar.connecting`)
- ChatInput "Not connected" (dup of `input.notConnected`)
- Sidebar "Friends Online" / "好友在线" (no existing key)

Exclude: language toggle logic (`lang === "zh-CN" ? "en-US" : "zh-CN"`) -- these are structural, not user-visible strings.

### 1.5 Find hardcoded Chinese strings in JSX text content

```powershell
cd frontend && rg -n '[\x{4e00}-\x{9fff}]{2,}' src/components/ --type tsx
```

Filter out:
- Lines already inside `t("...")` or `t('...')` calls
- Translation file itself (`src/i18n/`)
- Test fixtures and test assertions
- Comment lines

Each remaining hit is a **HARDCODED** Chinese string.

### 1.6 Find hardcoded English strings in aria-labels and alt text

```powershell
cd frontend && rg -n 'aria-label="[A-Z]' src/components/ --type tsx
```

Check each hit. If the value is a static English string (not `{t("...")}` or `{...}` expression), flag as **HARDCODED**.

### 1.7 Verify interpolation variable consistency

For each `t("key", { param1, param2 })` call site, verify the translation value in BOTH languages uses exactly the same `{{param}}` placeholders.

Mismatches produce silent substitution failures: extra `{{param}}` in the translation value renders literally; missing `{{param}}` in the value means the call-site param is ignored.

**Common interpolation params used in this project**: `{{username}}`, `{{name}}`, `{{count}}`, `{{n}}`, `{{time}}`, `{{attempt}}`, `{{current}}`, `{{max}}`, `{{used}}`, `{{group}}`, `{{name1}}`, `{{name2}}`, `{{size}}`.

### 1.8 Check utility functions that bypass i18n

```powershell
cd frontend && rg -n 'hardcoded|just now|ago|Today|Yesterday|今天|昨天' src/lib/ --type ts --type tsx
```

Key files to audit:
- `src/lib/utils.ts`: `formatTime()` returns "just now" / "Nm ago" (always English)
- `src/lib/utils.ts`: `formatLastSeen()` returns "just now" / "Nm ago" / "Nh ago" / "Nd ago" (always English)
- `src/lib/utils.ts`: `formatDate()` uses inline ternary for "Today"/"Yesterday" (has `lang` param but still hardcoded)

These functions are consumed by components that pass display strings directly to JSX, bypassing `t()` entirely.

---

## 2. Grep patterns quick reference

| Purpose | Pattern | Notes |
|---------|---------|-------|
| Extract `t()` keys | `t\("([^"]+)"\)` | Use `rg -o -r '$1'` for key-only output |
| Inline bilingual ternary | `lang\s*===\s*"zh-CN"\s*\?\s*".+?"\s*:` | Add `--type ts --type tsx` |
| Hardcoded Chinese | `[\x{4e00}-\x{9fff}]{2,}` | Filter out test files and translations.ts |
| Hardcoded English aria | `aria-label="[A-Z]` | Check for `{t(` expression vs static string |
| Interpolation params in values | `\{\{[a-zA-Z]+\}\}` | Compare param sets across zh-CN/en-US |
| Utility function bypass | `"(just now\|ago\|Today\|Yesterday)"` | Check `src/lib/utils.ts` |
| Dynamic key construction | `t\(\s*` + `[^)]*\+\s*[^)]*\)` | Keys built at runtime cannot be statically audited |

---

## 3. Common issues from our history

### 3.1 formatDate inline ternaries (PRESENT -- pre-existing)

**File**: `src/lib/utils.ts:48-52`

```typescript
return lang === "en-US" ? "Today" : "今天";
return lang === "en-US" ? "Yesterday" : "昨天";
```

The `lang` param was added (fixing the original bug where Chinese users always saw English), but the values themselves are still hardcoded inline rather than using `schedule.today` / `schedule.tomorrow` or dedicated keys. This blocks any third language addition.

**Status**: Known, not yet refactored. Refactoring would require injecting the `t()` function into `formatDate`, which is a pure utility with no React context access. Options: (a) accept the inline ternary as a utility-function exception, (b) pass `t` as a parameter, (c) move formatting to a hook.

### 3.2 Sidebar search strings used inline ternaries (FIXED)

**Original**: SearchBar had `lang === "zh-CN" ? "未找到匹配的对话" : "No matching conversations"`.

**Fix**: Replaced with `t("sidebar.searchEmpty")`. Both zh-CN and en-US entries exist in `translations.ts`.

### 3.3 Admin Dashboard aria-label hardcoded English (PRESENT)

**File**: `src/components/AdminPanel.tsx:64`

```tsx
aria-label="Close"
```

Should be `aria-label={t("group.cancel")}` or a dedicated key. All icon-only buttons need i18n-aware aria-labels.

### 3.4 formatTime / formatLastSeen hardcoded English (PRESENT -- pre-existing)

**File**: `src/lib/utils.ts:17,20,100-103`

```typescript
// formatTime
if (diffSec < 60) return "just now";
if (diffMin < 60) return `${diffMin}m ago`;

// formatLastSeen
if (diffSec < 60) return "just now";
if (diffMin < 60) return `${diffMin}m ago`;
if (diffHour < 24) return `${diffHour}h ago`;
if (diffDay < 30) return `${diffDay}d ago`;
```

These functions have no `lang` parameter and always return English. Chinese users see "just now" / "5m ago" in message timestamps and last-seen indicators. The translation keys exist (`profile.justNow`, `profile.minutesAgo`, etc.) but these utility functions never use them.

**Status**: Same architectural constraint as 3.1 -- pure functions without React context access. A hook-based wrapper (`useFormatTime`) that calls `t()` internally is the idiomatic fix but requires migration of all call sites.

### 3.5 Sidebar inline ternaries (PRESENT)

**File**: `src/components/Sidebar.tsx:963,1001`

```tsx
{lang === "zh-CN" ? "连接中..." : "Connecting..."}
{lang === "zh-CN" ? "好友在线" : "Friends Online"}
```

Line 963 duplicates `sidebar.connecting` which already exists in translations. Line 1001 ("Friends Online") has no existing translation key.

### 3.6 ChatInput inline ternary (PRESENT)

**File**: `src/components/ChatInput.tsx:1732-1734`

```tsx
{lang === "zh-CN" ? "未连接 — 重新连接后重试" : "Not connected — retrying..."}
```

Duplicates `input.notConnected` which is already in translations.ts with matching values.

---

## 4. Output format

After running the full scan, produce this table.

```markdown
# i18n Scan Report -- YYYY-MM-DD

## Summary
- Total keys in translations.ts: N
- Keys used in source: N
- Missing keys: N
- Unused keys: N
- Hardcoded strings: N (inline ternaries: N, utility bypass: N, aria-labels: N)

## Findings

| # | Key | zh-CN | en-US | Status | File:line |
|---|-----|-------|-------|--------|-----------|
| 1 | sidebar.connecting | 连接中... | Connecting... | HARDCODED | Sidebar.tsx:963 |
| 2 | input.notConnected | 未连接 — 重新连接后重试 | Not connected — retrying... | HARDCODED | ChatInput.tsx:1732 |
| 3 | sidebar.friendsOnline | (missing) | (missing) | HARDCODED | Sidebar.tsx:1001 |
| 4 | a11y.closeAdmin | (missing) | (missing) | HARDCODED | AdminPanel.tsx:64 |
| 5 | profile.justNow | 刚刚 | just now | HARDCODED | utils.ts:17,100 |
| 6 | profile.minutesAgo | {{n}}分钟前 | {{n}}m ago | HARDCODED | utils.ts:20,101 |
| 7 | schedule.today | 今天 | Today | HARDCODED | utils.ts:49 |
| 8 | schedule.tomorrow | 明天 | Tomorrow | HARDCODED | utils.ts:52 |

Status values:
- **OK**: key exists in both languages, used in source, interpolation matches
- **MISSING**: key called in source but not in translations
- **UNUSED**: key exists in translations but never called in source
- **HARDCODED**: string is hardcoded (inline ternary, un-i18n'd utility, static aria-label) instead of using t()

## Interpolation mismatches

| Key | zh-CN params | en-US params | Call-site params | Issue |
|-----|-------------|-------------|-----------------|-------|

## Missing keys detail

| Key | Used at | Suggested zh-CN | Suggested en-US |
|-----|---------|----------------|-----------------|

## Unused keys

| Key | zh-CN value | Notes |
|-----|------------|-------|
```

---

## 5. Post-scan actions

### 5.1 Fix HARDCODED items

**Inline ternaries in components** (easiest):
1. Replace `lang === "zh-CN" ? "X" : "Y"` with `t("section.key")`
2. If a matching key already exists in translations.ts, just use it
3. If no key exists, add entries to both `zhCN` and `enUS` objects in translations.ts
4. Verify the TypeScript type `TranslationDict` -- if adding to an existing section the key must be declared in the interface

**Hardcoded aria-labels**:
1. Replace static `aria-label="Close"` with `aria-label={t("group.cancel")}` or a dedicated key
2. Run `npx tsc --noEmit` after changes

**Utility function bypass** (harder, may defer):
1. `formatTime` / `formatLastSeen`: evaluate effort vs impact. These are pure functions without React context. Options: (a) create `useFormatTime` hook wrapping `t()`, (b) accept as known limitation in pure utilities, (c) export locale-aware variants that accept a `t` function parameter.
2. `formatDate`: already has `lang` param; could accept `t` function or a translations subset instead.

### 5.2 Remove UNUSED keys

1. For each unused key found in 1.3, verify it is truly never referenced (check dynamic key construction like `t("section." + variable)`)
2. Remove from both `zhCN` and `enUS` objects
3. Remove from the `TranslationDict` interface
4. Run `npx tsc --noEmit` -- if the key is still referenced via dynamic construction, TypeScript will catch it

### 5.3 Add MISSING keys

1. Add to the appropriate section in both `zhCN` and `enUS`
2. Add to the `TranslationDict` interface
3. Commit with message: `i18n: add missing keys -- <list>`

### 5.4 Final verification

```powershell
cd frontend && npx tsc --noEmit && npm test -- --run
```

---

## 6. Integration with cross-review

The [cross-review](cross-review.md) skill includes i18n as dimension 2.5 with a condensed checklist. The i18n-scan skill is the **full-depth audit** -- run it when:

- Adding a new language
- Before a release (completeness gate)
- After a large feature branch lands
- When the cross-review i18n dimension scores 2 or below

The cross-review i18n check is a quick spot-check (scan changed files only). The i18n-scan is the comprehensive audit (entire frontend source).
