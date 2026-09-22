# 03 — Execution controls and progress feedback

## Outcome

Make notebook execution understandable and controllable: graders can start Run all, see which cell is running, stop execution, clear fresh outputs, and recover cleanly from errors or navigation.

This task builds on the job/event protocol from task 01 and the stable per-cell output state from task 02.

## User experience

Place a compact execution group in the notebook toolbar:

- **Run all** — always starts a fresh kernel and executes the complete notebook.
- **Stop** — visible/enabled only while queued or running.
- **Clear outputs** — clears locally generated output only; never hides or mutates submitted output.

Show one summary line:

```text
Running cell 3 of 8 · 4.2 s
```

Each code cell independently shows `Queued`, `Running`, `Completed`, `Error`, or `Not run`.

Because every Run all job starts a fresh kernel, a separate **Restart kernel** button would be misleading in this stateless local version. Add it only if persistent per-cell execution is introduced later.

## Backend API additions

Extend:

```http
GET /api/executions/<execution_id>
```

Running response:

```json
{
  "execution_id": "...",
  "status": "running",
  "current_cell_index": 6,
  "completed_code_cells": 2,
  "total_code_cells": 8,
  "cells": [
    {"cell_index": 1, "status": "completed", "outputs": []},
    {"cell_index": 4, "status": "completed", "outputs": []},
    {"cell_index": 6, "status": "running", "outputs": []}
  ]
}
```

Add:

```http
DELETE /api/executions/<execution_id>
```

Return `202` while termination is in progress and a terminal `cancelled` status on later reads. Return `404` for unknown IDs. Calling delete on a terminal execution is idempotent and returns its current state.

## Process cancellation

Launch the runner with `start_new_session=True` on macOS/Linux. Store the `Popen` handle in `ExecutionManager`.

Cancellation sequence:

1. Mark the job `cancelling` under the manager lock.
2. Send `SIGTERM` to the runner's process group so the Jupyter kernel child is included.
3. Wait up to two seconds outside the request thread.
4. Send `SIGKILL` to the process group if it remains alive.
5. Mark the active and remaining cells `not_run` and the job `cancelled`.
6. Delete its temporary directory.

Also perform this cleanup on overall timeout and Flask shutdown where feasible. The runner must still attempt normal Jupyter kernel shutdown in its own `finally` block.

## Progress transport

Use polling for the local iteration:

- poll every 300 ms while running
- back off to 750 ms after 30 seconds
- stop immediately on a terminal state
- stop polling when a new submission supersedes the current one

Server-Sent Events would provide smoother streaming but adds reconnect and lifecycle complexity without meaningful benefit for a single local grader. The NDJSON runner events remain internal between the runner and `ExecutionManager`.

The manager's stdout reader updates job state as each line arrives. Invalid protocol lines are treated as runner failures and stderr is included only in a bounded diagnostic field.

## Frontend state machine

Use explicit execution states rather than scattered button flags:

```text
idle → starting → queued → running → completed
                              ↘ failed
                              ↘ cancelling → cancelled
```

One function applies state to controls:

```js
function renderExecutionControls(execution) { /* ... */ }
```

Track both:

- `state.execution.id`
- a monotonically increasing browser `requestToken`

Ignore polling responses whose token no longer matches. This mirrors the existing `loadingToken` pattern used for notebook downloads and prevents results from Student A appearing after navigating to Student B.

## Navigation behavior

When a grader selects another submission during execution:

1. Ask once: “Stop this run and open the next submission?”
2. On confirmation, call the cancellation endpoint and navigate immediately.
3. On rejection, keep the current submission selected.

Browser refresh naturally loses process ownership in the UI. On startup, the server should prune abandoned terminal jobs; active orphan handling can remain process-lifetime-based for local use.

Do not automatically begin execution when quick-grade mode is enabled or when navigating. Student code should run only after an explicit action.

## Error states

Differentiate:

- **Cell error:** expected student-code failure; show it on the cell, mark later cells not run.
- **Timeout:** show which cell exceeded the limit and offer Run all again.
- **Cancelled:** neutral state, not a red system error.
- **Kernel startup failure:** actionable message to reinstall/check `ipykernel`.
- **Runner protocol/server failure:** concise UI message plus logged server diagnostic.
- **Notebook superseded:** silently ignore stale responses.

Do not display raw temporary paths or full server tracebacks in the browser.

## Accessibility

- Put execution summary in an `aria-live="polite"` region.
- Use text plus color for all states.
- Keep keyboard focus on the initiating button unless an error summary needs focus.
- `Stop` and `Run all` must have unambiguous accessible names.
- Spinners must respect `prefers-reduced-motion`.

## Files to change

- `execution_service.py` — incremental event state, cancellation, cleanup
- `execution_runner.py` — flushed NDJSON events and signal-safe cleanup
- `app.py` — status/delete endpoints and error mapping
- `templates/index.html` — execution controls and live summary
- `static/app.js` — polling, state machine, cancellation, stale-response protection
- `static/styles.css` — progress/status styling and reduced-motion behavior
- `tests/test_app.py` plus execution-specific tests

## Tests

1. Progress moves from queued to running to completed.
2. Per-cell completion is visible before the notebook finishes.
3. Stop terminates the runner and kernel process group.
4. Stop is idempotent.
5. Overall timeout uses the same cleanup path.
6. Navigating during a run cannot attach stale output to the next submission.
7. Clear outputs leaves submitted output untouched.
8. Run all is disabled during an active run.
9. Quick-grade toggling never starts execution.
10. A dead/missing kernel produces an actionable error.

Use a short sleeping notebook cell in integration tests and keep timeouts low so the test suite remains fast.

## Acceptance criteria

- The grader can always tell whether the notebook is idle, running, failed, or cancelled.
- Progress names the active cell and completed/total counts.
- Stop ends the child kernel, not only the browser request.
- Navigation cannot leak results between submissions.
- Clear outputs affects only local runtime results.
- No code executes implicitly.

## Not in scope

- WebSockets or Server-Sent Events
- Resuming jobs after restarting Flask
- Multiple simultaneous graders
- Persistent interactive kernels
- Public/VPS execution isolation
- Canvas

