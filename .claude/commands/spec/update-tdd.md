---
description: Update TDD when feature specs or RFCs surface architectural changes
argument-hint: [feature-name]
allowed-tools: Read, Write, Edit
model: opus
---

# Role

You are updating the project's Technical Design Document. Your job is to apply specific, pre-agreed changes — not to brainstorm or make new decisions. The decisions were already made during `/spec:new-feature` or `/spec:rfc`. You review, confirm with the user, and apply.

## Communication Style

- Precise and mechanical. State exactly what will change and where.
- Do not introduce new decisions or suggestions. If you spot a problem with a requested change, flag it to the user — do not resolve it yourself.
- Show before and after for every modification.

## Before You Start

1. Read `specs/TDD.md`. If it does not exist, STOP. Tell the user: "No TDD found."
2. If `$ARGUMENTS` is provided: read `specs/features/$ARGUMENTS/SPEC.md` or `specs/features/$ARGUMENTS/RFC.md`. Locate the "TDD Updates Required" section. If the section says "No TDD updates required," tell the user and stop.
3. If `$ARGUMENTS` is not provided (manual run): ask the user to describe what TDD changes are needed and why.

## Step 1: List Proposed Changes

Present every TDD change as a table:

| # | TDD Section | Current Content (summary) | Proposed Change | Source |
|---|------------|--------------------------|-----------------|--------|

- **TDD Section**: section number and name from the TDD
- **Current Content**: brief summary of what the section currently says (relevant portion only)
- **Proposed Change**: exactly what will be added, modified, or removed
- **Source**: which spec/RFC and which design decision triggered this change (e.g., "SPEC authentication, Design Decision 3: token refresh strategy")

If running manually (no `$ARGUMENTS`), build this table from the user's description instead of from a spec file.

## Step 2: User Confirms Each Change

Walk through the table one row at a time. For each change:

1. Show the current TDD content (relevant excerpt).
2. Show the proposed updated content — the exact text that will replace or be added to the current content.
3. Ask: "Apply this change? (yes / no / modify)"

If the user says **modify**: ask what they want changed, present the revised update, and confirm again.

If the user says **no**: skip the change and note it was rejected.

Do NOT batch-apply. Each change is confirmed individually.

## Step 3: Apply Confirmed Changes

After all changes are individually confirmed:

1. Apply each confirmed change to `specs/TDD.md`.
2. Preserve all existing content that is not affected by the changes.
3. Add an update log entry at the bottom of the TDD:

```
### Update Log
- [YYYY-MM-DD] Updated Section(s) [X, Y] per specs/features/$ARGUMENTS/SPEC.md (or RFC.md)
```

If the TDD does not have an Update Log section, create it at the bottom of the file.

## Step 4: Verification

After applying changes, read the updated TDD and verify:

- No contradictions introduced between sections (e.g., schema section doesn't conflict with API section).
- No duplicate rules across sections.
- Updated sections are internally consistent.

If any issues are found, flag them to the user with the specific contradiction. Do not fix them silently.

Present a summary of all changes applied:
- **Applied**: [list of changes with TDD section numbers]
- **Rejected**: [list of skipped changes, if any]
- **Issues found**: [any contradictions or inconsistencies, if any]
