# 05 — Minimal local UI and information architecture

## Outcome

Refine the interface into a calm, predictable three-level workspace—scope, queue, submission—without adding a frontend framework or build pipeline. The visual direction remains thin, modern, and utilitarian.

This task is a structural polish pass after execution and grading behaviors are stable. It must not redesign backend contracts unnecessarily.

## Design principles

1. One primary action per state.
2. Context stays visible: class, assignment/student mode, selected submission, and saved grade state.
3. Empty states explain the next action, not unrelated setup.
4. Execution controls and grading controls are visually distinct.
5. Thin borders, restrained color, compact spacing, and strong typography hierarchy.
6. Desktop-first for grading, with a usable stacked layout below 900 px.
7. Native HTML controls and progressive enhancement over custom widgets.

## Current strengths to retain

- One top bar and two-column workspace
- Existing neutral/accent color tokens
- Segmented assignment/student mode
- Context-aware empty-state copy
- Visible import progress
- Modal class manager
- Plain Flask template plus vanilla JavaScript

## Current issues to resolve

- Header actions compete visually even though importing and roster management have different frequency.
- Filtering, queue selection, notebook controls, and grading controls do not yet form a clear hierarchy.
- `static/app.js` replaces large blocks with `innerHTML`, making focus and scroll preservation fragile.
- Notebook toolbar will become crowded once Run all and grading state are added.
- Long submission metadata consumes vertical space before code.
- On narrow screens the entire queue appears above the notebook, causing excessive scrolling.
- Dialog interactions use browser `prompt()` and `confirm()` for rename/delete flows.

## Target structure

```text
Top bar
  Product / workbook status                         Import · Classes

Left rail
  Review mode
  Class + assignment/student
  Status and secondary filters
  Progress
  Submission queue

Main workspace
  Submission identity + Previous/Next
  Notebook execution toolbar
  Notebook cells

Review panel
  Score
  Feedback
  Private notes
  Save state / Mark graded & next
```

At desktop widths, use three columns:

```css
grid-template-columns: minmax(280px, 320px) minmax(520px, 1fr) minmax(280px, 340px);
```

At medium widths, place the review panel below or in a collapsible drawer. At mobile widths, switch the queue to a compact selector/drawer rather than forcing the user to scroll through every row before reaching the notebook.

## Component changes

### Top bar

- Keep workbook status beside the product name.
- Make **Import workbook** the primary action only when no workbook exists; use secondary styling after import.
- Rename **Manage classes** to **Classes** and keep equal control height/alignment.
- Add no additional global navigation for this local iteration.

### Left rail

- Group required scope controls together.
- Move date/search/status into one clearly labeled Filters disclosure.
- Show assignment progress immediately above the queue.
- Keep queue rows one-line-first with secondary metadata and a review badge.
- Preserve selection and scroll position when filters rerender.

### Submission header

- Make student name the primary heading in assignment mode and assignment title primary in student mode.
- Keep the complementary label as an eyebrow/subheading.
- Collapse reflection metadata into a **Submission details** disclosure after showing the two most useful fields.
- Keep Previous/Next near the title, not separated from submission context.

### Execution toolbar

- Put Run all, Stop, and Clear outputs in one labeled group.
- Keep **Open in Colab** at the far end as a secondary external action.
- Move Focus mode and Show all into a View menu/disclosure if space is constrained.
- Show run status adjacent to execution controls rather than in an unrelated global banner.

### Review panel

- Keep score and points possible on one row.
- Use comfortable textareas despite the compact theme.
- Pin **Mark graded & next** to the panel footer on desktop.
- Make save status persistent but quiet.

### Class manager

- Replace `prompt()` rename actions with inline editing.
- Replace browser `confirm()` with an in-dialog confirmation row that names the affected class/student.
- Complete combobox keyboard support: Up/Down, Enter, Escape, active descendant, and no mouse requirement.
- Keep manually typed names allowed, but distinguish exact workbook names from free text.

## UI state model

Define a small set of top-level workspace states and render them deliberately:

```text
no_workbook
scope_required
queue_empty
submission_loading
submission_ready
submission_error
execution_running
```

Avoid inferring every state independently in different functions. Add a `getWorkspaceState()` selector and a single empty/loading-state renderer. This prevents contradictory messages such as asking for import when data exists but no assignment is selected.

Where practical, update existing DOM nodes rather than rebuilding the whole rail. At minimum, restore:

- focused element
- queue scroll position
- selected row
- open disclosure state

after a render.

## CSS system

Keep the current tokens and formalize:

- spacing scale: 4, 8, 12, 16, 24, 32
- radius scale: 6 and 10 only
- control height: 38 or 40 px
- one subtle shadow reserved for dialogs/popovers
- semantic state tokens for success, warning, and danger

Do not add gradients, oversized cards, glass effects, or multiple accent colors. Use whitespace and typographic weight before borders and backgrounds.

Add:

- `prefers-reduced-motion` handling
- visible focus styles for every interactive element
- high-contrast review/execution states
- print styles only if graders explicitly need printed reviews later

## Accessibility requirements

- All icon-only buttons have accessible names.
- Queue selection uses `aria-current` or `aria-selected` consistently.
- Combobox follows the ARIA combobox/listbox interaction pattern.
- Dialog focus is trapped by native `<dialog>` behavior and returns to its opener.
- Status messages use appropriate polite/assertive live regions.
- Color never carries status alone.
- Tab order follows the visual workflow.
- Verify at 200% browser zoom and with keyboard-only navigation.

## Implementation sequence

1. Inventory all states and actions after tasks 01–04 land.
2. Restructure `templates/index.html` into rail, notebook, and review landmarks.
3. Implement `getWorkspaceState()` and consolidate state messaging.
4. Reorganize toolbars and disclosures without changing behavior.
5. Apply the three-column CSS grid and responsive fallbacks.
6. Convert class rename/delete flows from browser dialogs to inline UI.
7. Complete combobox keyboard interactions.
8. Audit focus, loading, error, and empty states.
9. Conduct a manual full workflow pass at desktop, tablet, and narrow widths.

## Files to change

- `templates/index.html` — semantic landmarks and control grouping
- `static/app.js` — workspace-state selector, focused updates, dialog/combobox behavior
- `static/styles.css` — grid, component states, responsive and reduced-motion rules
- `tests/` — state selector and API-driven smoke coverage where feasible

Do not use or modify the untracked `static/styles 2.css`; determine whether it is user-owned experimental work before any later cleanup.

## Verification scenarios

1. Brand-new install with no workbook and no classes.
2. Classes exist but no workbook has been imported.
3. Workbook loaded but assignment/student scope not selected.
4. Filter produces no submissions.
5. Notebook download fails.
6. Notebook loads with saved outputs and no execution.
7. Execution running, failing, stopping, and completing.
8. Review has unsaved, saving, saved, and failed states.
9. End of grading queue.
10. Keyboard-only class/student management.

## Acceptance criteria

- The next action is obvious in every workspace state.
- Import and Classes buttons align and reflect their relative importance.
- Execution, view, and grading actions are visually separated.
- The selected scope and queue progress remain visible while grading.
- Desktop grading does not require unnecessary vertical travel.
- The workflow remains usable at 200% zoom and 375 px width.
- No JavaScript framework, CSS framework, or build tool is introduced.
- The UI retains its restrained thin-line visual identity.

## Not in scope

- Branding project or custom illustration
- Canvas navigation or terminology
- Multi-user presence
- Dark mode
- Rich text editing
- Replacing Flask templates with a SPA

