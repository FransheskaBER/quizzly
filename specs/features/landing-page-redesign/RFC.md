# RFC: Landing Page Redesign

**Date**: 2026-03-11
**Status**: Reviewed - deviations documented in REVIEW.md
**Type**: Refactor
**TDD Updates Required**: No

## 1. Context

The current landing page (`packages/client/src/pages/landing/LandingPage.tsx`, 102 lines + 215 lines CSS) has four sections: Navbar → Hero → How It Works → Bottom CTA → Footer.

The page describes a generic process (upload → generate → grade) that could be any quiz tool. The 7 exercise types — Quizzly's core differentiator — appear nowhere. A visitor cannot tell what they'll actually practice. Two critical sections are missing: the exercise types showcase and the target audience identification.

## 2. Goals and Non-Goals

### Goals

1. Surface the 7 exercise types as the page's visual centerpiece immediately after the hero.
2. Communicate the specific skill gap (evaluation vs. writing) from headline through final CTA.
3. Identify the target audience explicitly via a "Who It's For" section with three personas.
4. Unify all CTAs to one outcome-oriented action: "Start Practicing Now" → `/login`.
5. Sharpen How It Works copy to reference the 7 exercise types and emphasize critical thinking.

### Non-Goals

- No new shared components or files — 2-file edit only.
- No new CSS variables or design tokens.
- No animation, interactivity, or scroll effects.
- No SEO/meta tag changes, A/B testing, or analytics events.
- No backend changes.

## 3. Detailed Design

### 3.1 Files Modified

- `packages/client/src/pages/landing/LandingPage.tsx`
- `packages/client/src/pages/landing/LandingPage.module.css`

No other files are touched.

### 3.2 Page Structure (top to bottom)

**Navbar** — Keep structure. Update CTA copy to "Start Practicing Now".

**Hero** — Keep the eyebrow pill ("AI-native engineering"). Keep/preserve headline: "Stop memorising. Start thinking like a senior engineer." New subheadline: "LeetCode trains you to write code. Quizzly trains you to evaluate it — spot bugs, critique AI output, reason about architecture." Primary CTA: "Start Practicing Now". Friction reducer below CTA: "No credit card required. Works with any subject."

**Exercise Types (NEW)** — Section heading: "7 types of exercises. Not definitions. Not recall." 7 cards in a 4-3 grid. Each card: bold name + one-sentence description. Tagline below grid: "Difficulty controls which types appear and how deep the reasoning must go."

The 7 types:

| Name | Description |
|---|---|
| Spot the Bug | Find bugs, anti-patterns, and security issues in real code snippets. |
| Evaluate AI Output | You get a prompt and the AI's response. Find what the AI got wrong — missing edge cases, silent failures, incorrect assumptions. |
| Compare Approaches | Two implementations of the same problem. Justify which is better and why — complexity, readability, maintainability. |
| Choose the Right Tool | A scenario with constraints. Pick the right algorithm, data structure, or pattern with explicit trade-off justification. |
| Architectural Trade-off | A system design problem or partial architecture. Reason about weaknesses and defend your decisions. |
| AI Collaboration | Use an AI tool to solve a real problem, then evaluate its output — is it correct, optimal, scalable, production-ready? |
| Prompt Construction | Write the prompt you'd give an AI coding assistant to implement something correctly. Tests whether you anticipate edge cases, constraints, and what the AI would miss without explicit instruction. |

**How It Works** — Keep 3-step structure, update copy:
- Step 1: "Upload your study material" / "PDF, notes, or any document. Or just describe what you're studying."
- Step 2: "AI generates critical thinking exercises" / "Not recall questions. Exercises from the 7 types above, tailored to your content and difficulty level."
- Step 3: "Get graded with real feedback" / "Detailed explanations. Partial credit. Specific improvement tips — not just correct or incorrect."

**Who It's For (NEW)** — 3-column card layout:
- Bootcamp Graduate: "You finished the course. You can build apps. But technical interviews ask something different."
- CS Student: "You know the theory. But you've never practiced evaluating code or reviewing AI output."
- Junior Developer: "You're in your first job. You need to level up from writing code to reviewing and architecting it."

**Bottom CTA** — Heading: "The industry needs AI-native engineers. Start becoming one." Subtext: "Upload what you're studying. Generate your first exercise in under a minute." CTA: "Start Practicing Now". Friction reducer: "No credit card required."

**Footer** — Unchanged. `© {year} Quizzly`.

### 3.3 Design Decisions

**Hero `flex: 1` removal.** Currently the hero stretches to fill the viewport. With 5 content sections below, this makes the hero absurdly tall. Change to standard block flow with padding.

**Exercise types grid: fixed 4-column.** `grid-template-columns: repeat(4, 1fr)` guarantees the intended 4-3 layout. Collapses to `1fr` below 640px via media query.

**Exercise types container: `max-width: 960px`.** Wider than the 900px used by How It Works, giving 4 cards room to breathe.

**Section backgrounds for visual rhythm:**

| Section | Background |
|---|---|
| Hero | `linear-gradient(160deg, #eff6ff 0%, #ffffff 55%)` (existing, unchanged) |
| Exercise Types | `var(--color-bg-secondary)` + top/bottom borders — dark band, visual centerpiece |
| How It Works | `var(--color-bg)` — flipped from current dark to light |
| Who It's For | `var(--color-bg)` |
| Bottom CTA | `var(--color-bg)` (unchanged) |

**Eyebrow retained.** The hero keeps the `.eyebrow` element ("AI-native engineering") above the headline to reinforce positioning.

**Data-driven arrays.** `EXERCISE_TYPES` (7 items) and `AUDIENCES` (3 items) follow the existing `STEPS` array pattern.

**Mobile breakpoint.** Single `@media (max-width: 639px)` block at the bottom of CSS. Exercise types grid and audience grid collapse to `1fr`.

### 3.4 New CSS Classes

```
.exerciseTypes, .exerciseTypesInner, .exerciseTypesHeading
.exerciseTypesGrid, .exerciseTypeCard
.exerciseTypeName, .exerciseTypeDescription, .exerciseTypesTagline

.audience, .audienceInner, .audienceHeading
.audienceGrid, .audienceCard, .audienceTitle, .audienceDescription

.frictionReducer
```

## 4. Blast Radius

- **Files modified:** `LandingPage.tsx`, `LandingPage.module.css`
- **Indirectly affected:** `App.tsx` (lazy import — interface unchanged, not affected)
- **Tests affected:** None exist
- **Features affected:** Landing page only
- **Dependencies affected:** None

## 5. Migration / Rollback

**Migration:** Big bang cutover. Single commit modifying 2 files. No data, no API, no shared state.

**Implementation sequence:**
1. Update CSS — add new classes, modify `.hero`, add mobile breakpoint
2. Update TSX — add data arrays, rewrite JSX
3. Visual check

**Rollback:** `git revert <commit>`. No side effects to undo.

## 6. Acceptance Criteria

1. **Given** the hero loads **When** a visitor reads the hero and immediate narrative **Then** they understand what the product is (code evaluation training), the skill gap (evaluation vs writing), and that the page explicitly identifies bootcamp grads, CS students, and junior devs as the target audience.
2. **Given** the visitor scrolls past the hero **When** the Exercise Types section appears **Then** all 7 types are visible with bold name and one-sentence description in a 4-3 grid.
3. **Given** any CTA on the page **When** the visitor reads it **Then** it says "Start Practicing Now" and links to `/login`.
4. **Given** the page top to bottom **When** read as a narrative **Then** it flows: problem → solution (7 types) → how it works → who it's for → act. No generic copy.
5. **Given** the How It Works section **When** reading step 2 **Then** it references the 7 exercise types and emphasizes critical thinking.
6. **Given** the Who It's For section **When** scanning the three columns **Then** Bootcamp Graduate, CS Student, and Junior Developer appear with persona-specific copy.
7. **Given** the Exercise Types section **When** rendered **Then** it has `var(--color-bg-secondary)` background, visually distinct from adjacent sections.
8. **Given** a viewport below 640px **When** the page renders **Then** the Exercise Types and Who It's For grids collapse to single column.
9. **Given** an authenticated user **When** navigating to `/` **Then** they redirect to `/dashboard`.
10. **Given** the rest of the app **When** the landing page is updated **Then** no other page, component, or route is affected.

## 7. TDD Updates Required (not implementation scope)

No TDD updates required.
