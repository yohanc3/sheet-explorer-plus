# 02 — Correct per-cell output mapping

## Outcome

Render each fresh execution result directly below the code cell that produced it, independent of quick-grade filtering, show-all filtering, or rerendering. Clearly distinguish the student's saved notebook output from output produced locally by the grader.

## Current implementation and failure mode

- `visibleCells()` returns a sliced/rebuilt array and discards each cell's original notebook index.
- `renderCells()` assigns `data-cell` and `data-output` using the filtered array index.
- `runCode()` looks the cell up by that filtered index.
- Toggling quick grade or show-all changes the meaning of the same index.
- Runtime output is stored only in generated DOM. Calling `renderCells()` destroys it.
- `savedOutputHtml()` and local runtime rendering use different, incomplete output paths.

Task 01 will return results keyed by absolute notebook cell index. This task makes that identity stable throughout the browser.

## Data model

Extend frontend state:

```js
const state = {
  // existing fields
  notebook: null,
  cells: [],
  runtimeByCell: new Map(),
  execution: null,
};
```

Each entry in `runtimeByCell`:

```js
{
  status: "queued" | "running" | "completed" | "error" | "not_run",
  executionCount: 2,
  durationMs: 41,
  outputs: [],
  runId: "..."
}
```

Do not use cell source text as an identifier because duplicate source cells are valid. Do not trust notebook `cell.id` to be present or unique. The canonical local identity is the absolute array index assigned when the notebook is loaded.

## Preserve identity through filters

Replace `visibleCells()` with a function that returns references:

```js
function displayedCells() {
  return state.cells
    .map((cell, cellIndex) => ({cell, cellIndex}))
    .filter(/* current visibility rules */);
}
```

Every cell article receives:

```html
<article class="cell code" data-cell-index="12">
```

Every output lookup uses `cellIndex=12`, never the current rendered position.

Quick-grade mode should select the last code and markdown cells by absolute identity. Define the current behavior explicitly in a helper and cover it with tests so later UI changes cannot silently shift outputs.

## Rendering architecture

Split the current rendering functions into:

- `renderNotebookCells()` — builds the visible cell cards.
- `renderCellSource(cell)` — code or markdown source.
- `renderOutputs(outputs, kind)` — renders standard Jupyter outputs.
- `renderRuntimeSection(cellIndex)` — local execution state and outputs.
- `renderSavedOutputSection(cell)` — original student output.

Both saved and runtime outputs use the same low-level output renderer. Their surrounding labels differ:

- **Submitted output** for `cell.outputs` from the downloaded notebook
- **Local run** for `state.runtimeByCell.get(cellIndex)`

Fresh runtime results must survive calls to `renderNotebookCells()` and toggling show-all/quick-grade. Clear them only when:

- the grader clicks **Clear outputs**
- a different submission is selected
- a new Run all begins, after explicit UI feedback

## Supported Jupyter output types

Implement these in order:

1. `stream`
   - join string arrays
   - label stderr visually as an error stream
   - strip or safely translate ANSI control sequences
2. `error`
   - show `ename`, `evalue`, and traceback
   - strip ANSI escape sequences before inserting text
3. `execute_result` and `display_data`
   - prefer `image/png`
   - then sandboxed `text/html`
   - then `text/plain`
4. Empty output
   - show a compact “Completed with no output” state, not a blank block

Do not render arbitrary JavaScript, `application/javascript`, or notebook widget bundles. Continue placing HTML in an iframe with `sandbox` and no `allow-scripts`. Do not add `allow-same-origin`.

SVG and interactive widget support are deferred because they require additional sanitization and comm-state handling.

## Visual treatment

Within each code-cell card:

```text
Code · [2] · Completed in 41 ms
───────────────────────────────
source
───────────────────────────────
Submitted output   (collapsed when local output exists)
Local run          (expanded)
```

Use existing tokens from `static/styles.css`. Add status colors conservatively:

- queued: muted
- running: accent plus subtle spinner
- completed: accent/success
- error: existing danger color
- not run: faint

Avoid duplicating entire output DOM when an output is hidden. `details` is appropriate for submitted output; runtime output stays open by default.

## Files to change

- `static/app.js`
  - new state fields
  - identity-preserving filters
  - shared output renderer
  - runtime-state reducer
- `static/styles.css`
  - runtime headers, badges, stderr/error states, empty output
- `templates/index.html`
  - no large structural change expected; add an accessible live execution summary if task 01 does not already add it
- `tests/`
  - add browser-independent tests for pure output/identity helpers if helpers are extracted

Because the app has no frontend build system, place pure functions in `static/app.js` unless testability becomes unmanageable. If extraction is needed, use a plain browser module rather than introducing a bundler.

## Implementation steps

1. Store the complete notebook and reset runtime state in `selectSubmission()`.
2. Implement `displayedCells()` returning `{cell, cellIndex}`.
3. Update cell markup and all selectors to use `data-cell-index`.
4. Introduce one renderer for Jupyter output objects.
5. Store execution results in `runtimeByCell` before rerendering.
6. Add submitted/local output labels and metadata.
7. Preserve runtime output across filter toggles.
8. Add ANSI stripping and output-size truncation indicators.
9. Remove the old DOM-only `runtime-output` update path.

## Tests

Cover:

1. Output from absolute cell 5 remains on cell 5 when earlier cells are hidden.
2. Switching quick grade on and off preserves runtime results.
3. Duplicate code cells do not share results.
4. Stream array/string variants render identically.
5. stdout and stderr are visually distinguishable.
6. Error tracebacks render as text, never markup.
7. HTML output is escaped into `srcdoc` and the iframe remains sandboxed.
8. Unsupported MIME types fall back to `text/plain` or a clear unsupported message.
9. Oversized output is truncated with an explicit notice.
10. Selecting a new submission clears the previous runtime map.

## Acceptance criteria

- Every result appears under its originating code cell.
- Results remain correct after either visibility toggle changes.
- Submitted and locally generated output cannot be confused.
- Tracebacks, plots, HTML, and plain text all use the same rendering path.
- No notebook-provided script executes in the parent page.
- The UI never uses a filtered array position as a notebook cell identity.

## Not in scope

- Streaming partial text within a running cell
- Editable code cells
- Widget interaction
- Saving executed output to Drive
- Canvas

