# 04 — Local grading workflow and navigation

## Outcome

Turn the current submission viewer into a complete local grading workspace. A grader can record a score, feedback, private notes, and review status; move through a deterministic queue; and return later without losing work.

No grade is posted to an LMS in this iteration. The local data model should remain neutral enough that a later Canvas destination can read it without changing the UI's core concepts.

## Current implementation gaps

- The database stores classes, students, and imported submissions but no grading state.
- Import uses `DELETE FROM submissions`, so database row IDs are unstable across imports.
- The queue has no reviewed/unreviewed status or progress.
- Previous/Next only changes submissions; it does not save grader work.
- Quick grade currently means “show the final code and markdown cells and auto-run them,” not an actual grading flow.
- There is no assignment-level points-possible value in the workbook schema.

## Stable submission identity

Introduce a source-neutral key before storing reviews.

Add to `submissions`:

```sql
source_type TEXT NOT NULL DEFAULT 'xlsx',
source_key TEXT
```

For XLSX rows, compute `source_key` as a versioned SHA-256 digest over normalized:

```text
xlsx:v1 | assignment title | normalized full name | timestamp | canonical share URL
```

The digest includes timestamp and URL so separate attempts remain separate. Normalize whitespace/case where appropriate, but do not discard meaningful timestamp or Drive file differences.

Add a unique index on `(source_type, source_key)` after backfilling existing records. Keep the numeric `id` for local database joins and responses, but never use it as the durable review identity.

## Data model

Add:

```sql
CREATE TABLE assignment_settings (
    source_type TEXT NOT NULL,
    assignment_key TEXT NOT NULL,
    title TEXT NOT NULL,
    points_possible REAL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (source_type, assignment_key)
);

CREATE TABLE reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type TEXT NOT NULL,
    submission_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'not_started',
    score REAL,
    feedback TEXT NOT NULL DEFAULT '',
    private_notes TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    UNIQUE (source_type, submission_key),
    CHECK (status IN ('not_started', 'in_progress', 'graded'))
);
```

Use an assignment key derived from the normalized title for XLSX imports. `points_possible` remains optional. Score validation rules:

- score may be blank
- score must be finite and non-negative
- if points possible is configured, warn—but do not silently clamp—when score exceeds it
- marking `graded` requires a score unless the grader explicitly chooses a scoreless review status in a later iteration

Keep `feedback` separate from `private_notes`; only feedback would eventually be eligible for Canvas posting.

## Import behavior

Replace destructive delete/reinsert semantics with a reconciliation transaction:

1. Parse and validate the entire workbook before changing the database.
2. Compute each row's source key.
3. Upsert current submissions by source key.
4. Remove or mark absent XLSX submissions only after all new rows are valid.
5. Retain `reviews` even if a row is temporarily absent, so reimporting the same submission restores its work.
6. Return counts for inserted, updated, removed, and review-preserved records.

Do not create reviews automatically for every submission; create on first edit or explicit status change.

## API

Extend `/api/state` only with lightweight review summaries needed for queue badges. Keep full notes available with the selected submission.

Add:

```http
GET /api/submissions/<int:submission_id>/review
PUT /api/submissions/<int:submission_id>/review
PUT /api/assignments/<assignment_key>/settings
```

Review update body:

```json
{
  "status": "graded",
  "score": 8.5,
  "feedback": "Correct result; explain the loop invariant.",
  "private_notes": "Recheck late-policy question."
}
```

The server resolves the numeric submission ID to its source key, validates all fields, and upserts atomically. Return the normalized saved record and `updated_at`.

## UI layout

Add a grading panel adjacent to the notebook on wide screens and below it on narrow screens. Fields:

- score and points possible
- feedback textarea
- private notes textarea
- status selector
- saved/saving/error indicator
- explicit **Mark graded & next** action

Do not make the panel a modal; it must remain visible while inspecting cells.

Rename the existing Quick grade toggle to **Focus mode**. Focus mode may reduce notebook detail and enable navigation shortcuts, but it must not execute code or alter review status.

## Saving behavior

- Debounce edits for 600 ms and save to the local API.
- Flush pending changes before Previous, Next, queue selection, mode change, or page unload where possible.
- Disable **Mark graded & next** while the save is pending.
- If saving fails, remain on the current submission and show a persistent inline error with Retry.
- Do not rely solely on a transient toast for unsaved grading data.

Use a client-side draft keyed by source key until the server confirms save. `beforeunload` may warn about an unconfirmed draft but is not the primary persistence mechanism.

## Queue behavior

Add:

- review-status badge on each queue row
- assignment progress: `graded / total`
- status filter: All, Needs review, In progress, Graded
- deterministic order using class roster position, then student name
- current-row focus and scroll preservation after rerender

“Next” should respect the active filters. **Mark graded & next** saves, marks graded, then moves to the next visible queue item. At the end of the queue, show a completion state instead of wrapping silently.

## Keyboard behavior

Only when focus is not inside an input, textarea, select, dialog, or notebook output frame:

- `j` / right arrow: next submission
- `k` / left arrow: previous submission
- `g`: focus score
- `f`: focus feedback
- `Shift+Enter`: mark graded and next

Display shortcuts in a small help popover. Never intercept common editing shortcuts.

## Files to change

- `app.py` — schema migration, source keys, review/settings endpoints, import reconciliation
- `templates/index.html` — grading panel, progress, filters, shortcut help
- `static/app.js` — review drafts, autosave, queue state, navigation guards
- `static/styles.css` — split workspace and review states
- `tests/test_app.py` — persistence, validation, reconciliation, navigation-data fixtures
- `README.md` — explain local review storage and backups

## Tests

1. A review survives importing the same workbook again.
2. Two attempts from one student receive different source keys.
3. Duplicate identical workbook rows are handled deterministically and reported.
4. Invalid score/status values return `400` without partial updates.
5. Review upsert is idempotent.
6. Mark graded requires a score.
7. Queue summaries count statuses correctly.
8. Failed autosave blocks Mark graded & next.
9. Filters and roster order determine Previous/Next consistently.
10. Feedback and private notes stay distinct in API responses.

## Acceptance criteria

- A grader can score and comment on every queued submission without leaving the app.
- Saved reviews survive refresh, restart, and repeat workbook import.
- The queue makes remaining work obvious.
- Navigation never knowingly discards an unsaved edit.
- Focus mode is a display/navigation feature and never runs code automatically.
- No Canvas terminology, credentials, or network requests are introduced.

## Not in scope

- Canvas grade posting
- Rubrics
- Multiple graders or accounts
- Grade export back into the imported workbook
- Submission editing

