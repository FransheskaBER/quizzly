# Review: landing-page-redesign
**Date**: 2026-03-11
**Spec file**: RFC.md
**Overall result**: Deviations found

## Deviations

### Eyebrow retained in hero
- **Section**: 3.2 Page Structure (Hero), 3.3 Design Decisions (Eyebrow removed)
- **Type**: Spec is outdated
- **Spec says**: Eyebrow pill is removed; hero should only contain headline, subheadline, CTA, friction reducer.
- **Code does**: Hero still renders `styles.eyebrow` and CSS class `.eyebrow` exists in `packages/client/src/pages/landing/LandingPage.tsx` and `packages/client/src/pages/landing/LandingPage.module.css`.
- **Root cause**: Intent changed during implementation (decision to keep eyebrow), but RFC text was not updated.
- **Resolution**: Update RFC to explicitly keep eyebrow in hero and remove "Eyebrow removed" language.

### AC1 "without scrolling" is not objectively testable across devices
- **Section**: 6 Acceptance Criteria, Criterion 1
- **Type**: Spec was ambiguous
- **Spec says**: Visitor should understand product, audience, and skill gap "without scrolling."
- **Code does**: Page follows designed section sequence, but "without scrolling" cannot be guaranteed across unknown viewport/device sizes.
- **Root cause**: Criterion uses a viewport-dependent requirement that is not deterministic for QA.
- **Resolution**: Clarify AC1 to a deterministic statement about content hierarchy and messaging prominence (not viewport fold behavior).

### AC8 scope conflicts with detailed design intent
- **Section**: 6 Acceptance Criteria, Criterion 8 vs 3.3 Mobile breakpoint
- **Type**: Spec was ambiguous
- **Spec says**: "all grids collapse to single column" below 640px.
- **Code does**: Exercise Types and Audience grids collapse to `1fr`; Steps grid remains responsive via `auto-fit`.
- **Root cause**: AC wording was broader than the detailed design note that explicitly called out only Exercise Types and Audience collapse.
- **Resolution**: Clarify AC8 to apply only to Exercise Types and Audience grids.

## Acceptance Criteria Results

| Criterion | Implemented | Tested | Status |
|-----------|------------|--------|--------|
| Hero communicates product/audience/skill gap (AC1 current wording included "without scrolling") | Partial | No | Gap |
| Exercise Types shows 7 cards in 4-3 grid with name + one sentence | Yes | No | Gap |
| All CTAs say "Start Practicing Now" and link to `/login` | Yes | No | Gap |
| Narrative flow: problem -> solution -> how it works -> who it's for -> act | Yes | No | Gap |
| How It Works step 2 references 7 types and critical thinking | Yes | No | Gap |
| Who It's For shows Bootcamp Graduate / CS Student / Junior Developer with persona copy | Yes | No | Gap |
| Exercise Types section uses `var(--color-bg-secondary)` and is visually distinct | Yes | No | Gap |
| Below 640px required grids collapse to one column (after AC8 clarification) | Yes | No | Gap |
| Authenticated user at `/` redirects to `/dashboard` | Yes | No | Gap |
| Landing update does not affect other pages/routes/components | Yes (from inspected scope) | No | Gap |

## Lessons Learned

- Acceptance criteria should avoid viewport-dependent language ("above the fold", "without scrolling") unless tied to a fixed viewport definition.
- When implementation intent changes (for example, eyebrow retained), RFC text should be updated in the same PR to prevent drift.
- Criteria and detailed design should use identical scope terms (for example, "all grids" vs named grids only).

## TDD Updates Required

- No TDD updates required.
