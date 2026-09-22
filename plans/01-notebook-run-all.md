# 01 — Notebook-native Run All

## Outcome

Replace the current per-cell `exec()` behavior with a notebook-native **Run all** action. Every code cell must execute from top to bottom in one Python kernel so imports, variables, functions, and filesystem changes remain available to later cells.

This is a local-only feature for this iteration. Canvas integration, hosted execution, and multi-user kernel management are not part of this task.

## Current implementation and failure mode

- `static/app.js::runAllVisibleCode()` calls `runCode()` once for every rendered button without awaiting prior calls. Cells therefore run concurrently.
- `runCode()` sends only one cell's source to `POST /api/execute-python`.
- `app.py::execute_python()` starts a fresh subprocess for every request.
- `execution_runner.py` creates a fresh `namespace` for every subprocess and uses Python `exec()` rather than a Jupyter kernel.
- Only cells currently rendered by `visibleCells()` run. “Run all” must operate on the complete notebook instead.

The result does not match Colab/Jupyter semantics: a later cell cannot use values created by an earlier cell, execution order is nondeterministic, and notebook-native rich output is reduced to text plus a special Matplotlib pass.

## Technical decisions

1. Use `nbformat` to validate and normalize the downloaded notebook.
2. Use `nbclient.NotebookClient` with the `python3` kernel to execute code cells sequentially.
3. Execute the full notebook in a child process, never inside the Flask process.
4. Start with one active execution at a time. This matches the current local, single-grader scope and keeps resource use predictable.
5. Preserve the original downloaded notebook in browser state. Runtime outputs live in a separate state object and are never written back to Google Drive.
6. Stop on the first error by default. Cells after the error are marked `not_run`.
7. Build the runner protocol as newline-delimited JSON events so task 03 can add live progress and cancellation without replacing the executor.

## Dependencies

Add and pin compatible releases of:

- `nbformat`
- `nbclient`
- `ipykernel`

After installation, verify that `.venv/bin/python -m ipykernel` starts successfully and that `python3` appears in the local kernelspec list. Keep the dependency list Python-only; do not add a Node build step.

## Backend design

### Execution request

Add:

```http
POST /api/executions
Content-Type: application/json
```

Request body:

```json
{
  "notebook": {
    "nbformat": 4,
    "nbformat_minor": 5,
    "metadata": {},
    "cells": []
  }
}
```

Successful response:

```json
{
  "execution_id": "random-server-generated-id",
  "status": "queued",
  "code_cell_count": 7
}
```

Return `202 Accepted`. Reject malformed notebooks with `400`, oversized requests with `413`, and a second concurrent execution with `409` in this local iteration.

### Execution status

Add:

```http
GET /api/executions/<execution_id>
```

Initial implementation may only expose `queued`, `running`, `completed`, and `failed`; task 03 will expose richer intermediate progress.

Terminal response shape:

```json
{
  "execution_id": "...",
  "status": "completed",
  "started_at": "...",
  "finished_at": "...",
  "cells": [
    {
      "cell_index": 2,
      "execution_count": 1,
      "status": "completed",
      "duration_ms": 18,
      "outputs": []
    }
  ]
}
```

`cell_index` is the cell's absolute index in `notebook.cells`, not its index in a filtered UI list.

### Runner process protocol

Refactor `execution_runner.py` to accept an input notebook path. It writes one JSON object per line to stdout:

- `notebook_started`
- `cell_started`
- `cell_finished`
- `cell_failed`
- `notebook_finished`
- `notebook_failed`

Diagnostic logs go to stderr so they cannot corrupt the protocol. The final event includes normalized outputs for every executed code cell.

Use `NotebookClient` hooks for cell start/completion events. Set:

- Python kernel override: `python3`
- Per-cell timeout: 30 seconds initially
- Overall subprocess timeout: 180 seconds
- `allow_errors=False`
- temporary working directory as the kernel `cwd`
- widget-state storage off for the first version

Always clean up the kernel and temporary directory in `finally` blocks. If a cell fails, retain the error output attached by `nbclient` and mark all following code cells `not_run`.

### Job ownership

Create `execution_service.py` containing a small `ExecutionManager` instead of placing process/thread state directly in `app.py`. It owns:

- an in-memory dictionary keyed by an unguessable execution ID
- a lock around job mutation
- child-process handles
- bounded terminal results
- cleanup of terminal jobs older than one hour

This manager is intentionally process-local. Supporting multiple Gunicorn workers belongs to the later hosted iteration.

## Frontend design

Add a **Run all** button to the notebook toolbar. On click:

1. Send the complete notebook held in `state.notebook`, not `visibleCells()`.
2. Poll the status endpoint until terminal.
3. Disable Run all while the job is active.
4. Show `Running notebook…` in the notebook status area.
5. Hand returned cell results to the output mapping introduced in task 02.

Change `selectSubmission()` to retain the full notebook object:

```js
state.notebook = notebook;
state.cells = notebook.cells || [];
```

Remove `quick-grade`'s automatic call to the current `runAllVisibleCode()`. Quick grade may change visibility, but it must not silently execute student code.

For this task, remove or disable the existing per-cell **Run** buttons. A correct per-cell experience needs a persistent kernel or a “run through this cell” definition and is not required for Run all.

## Validation and limits

- Accept only notebook major version 4.
- Accept only Python kernels in this iteration; show a clear error for R, Julia, or unknown kernels.
- Limit the notebook JSON body to the existing 15 MB notebook limit.
- Limit aggregate source text to 500 KB initially.
- Limit the notebook to 500 cells.
- Never trust notebook metadata as a filesystem path or command argument.
- Continue displaying the existing local execution warning in the README.

These limits reduce accidental machine exhaustion but do not make untrusted execution safe.

## Tests

Add backend tests for:

1. Cell 2 can read a variable assigned by Cell 1.
2. Three cells execute in document order.
3. `stdout`, `execute_result`, and an `image/png` display attach to the originating cell.
4. A failing cell contains an error output and later cells are `not_run`.
5. A timed-out cell terminates the job and kernel.
6. Markdown cells are not executed.
7. Invalid and non-Python notebooks are rejected.
8. A second concurrent job returns `409`.
9. Temporary files are removed after success and failure.

Mock the executor in Flask route tests; keep at least one integration test that launches a real kernel.

## Acceptance criteria

- A notebook where later cells depend on earlier cells runs successfully.
- Code cells execute exactly once and in notebook order.
- Run all uses every code cell, even when quick-grade or show-all filters hide cells.
- A cell error is attributed to the failing cell and later cells do not run.
- The Flask process remains responsive while the child process runs.
- Existing workbook import, class management, and notebook loading tests still pass.

## Not in scope

- Editing notebook source
- Persisting modified output to the student's Drive file
- Persistent interactive kernels
- Installing arbitrary packages requested by a notebook
- Secure public/VPS execution
- Canvas APIs

