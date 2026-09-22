# 06 — Local data reliability, tests, and setup

## Outcome

Make the first five iterations dependable for daily local grading: database changes are migratable, imports do not silently destroy work, errors are actionable, tests cover critical paths, and README commands work from a clean clone.

This remains a single-machine Flask application. Production deployment, accounts, Canvas, and public code-execution security are deferred.

## Current baseline

- `app.py` initializes tables at import time with `CREATE TABLE IF NOT EXISTS`.
- There is no schema-version or migration mechanism.
- SQLite connections enable foreign keys but no busy timeout or WAL mode.
- Workbook import deletes all submissions after parsing.
- Notebook fetching is a direct Google Drive request with limited validation and no test mocking.
- `app.run(..., debug=True)` enables debug mode unconditionally.
- The suite has three `unittest` tests covering basic CRUD, one happy-path import, URL resolution, and one-cell execution.
- README setup was previously verified, but new notebook dependencies and kernel requirements will change it.
- The tracked npm/pnpm lockfiles are not used by the current no-build frontend.

## Database migrations

Add a lightweight migration system suitable for SQLite rather than introducing an ORM solely for migrations.

Create:

```sql
CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
);
```

Store ordered migration functions in a dedicated `migrations.py` or `database.py`. Each migration:

- runs in one transaction
- checks the current version
- is safe to start only once
- fails startup with a clear message rather than leaving a half-applied schema
- has a test upgrading a fixture from the prior schema

Before the first migration that rewrites `submissions`, make a timestamped copy of the SQLite file if it exists and is non-empty. Retain a small documented number of backups rather than accumulating indefinitely.

Configure connections with:

```sql
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
```

Evaluate WAL mode under tests and enable it if it behaves consistently with the application's backup method. Use SQLite's backup API for live backups rather than copying an active WAL database blindly.

## Configuration

Move hard-coded operational values into Flask config with environment overrides:

- `SHEET_EXPLORER_DB`
- `SHEET_EXPLORER_DEBUG` defaulting to false
- `MAX_UPLOAD_BYTES`
- `MAX_NOTEBOOK_BYTES`
- `EXECUTION_CELL_TIMEOUT`
- `EXECUTION_TOTAL_TIMEOUT`
- `EXECUTION_ENABLED` defaulting to true only for the documented local profile

Keep safe defaults in source and document every override. Never log notebook contents, OAuth-like query strings, or future credentials.

Change the executable entry point to use environment-driven debug mode. The README command remains `python3 app.py`.

## Import reliability

Build on task 04's reconciliation design:

1. Parse the workbook into typed records before opening a write transaction.
2. Validate duplicate/missing headers explicitly.
3. Validate that each included row has assignment title, student name, and usable share value.
4. Report skipped blank rows separately from invalid rows.
5. Make all database changes atomically.
6. Return structured import statistics and warnings.
7. Preserve the last successful dataset when parsing or reconciliation fails.

Avoid returning raw exception text from unexpected failures. Log the exception locally and give the browser a concise message with a diagnostic code.

Add a pre-import confirmation when replacing/removing a substantial portion of the existing dataset, but do not require confirmation for the first import.

## Notebook-fetch reliability

Extract Drive downloading into a testable helper or `notebook_service.py`:

- validate file IDs before network access
- use connect and read timeouts separately
- stream with the existing 15 MB cap
- reject non-JSON/HTML confirmation pages clearly
- validate `nbformat` and `cells`
- preserve an actionable shared-link error
- do not follow an unbounded redirect chain

Return normalized error categories to the frontend:

- invalid link
- access denied/not shared
- network timeout
- oversized notebook
- invalid notebook

The user message should remain plain-language; detailed exceptions stay in local logs.

## Test structure

Split the growing suite while retaining standard `unittest` compatibility:

```text
tests/
  test_classes.py
  test_imports.py
  test_notebooks.py
  test_execution.py
  test_reviews.py
  fixtures/
```

Create shared setup helpers for a temporary SQLite database and Flask test client. Do not depend on the developer's `data/sheet_explorer.db`.

### Required coverage

Database and classes:

- class/student CRUD happy and error paths
- case-insensitive uniqueness
- cascade delete
- migration from every supported schema version

Imports:

- hyperlink, formula hyperlink, and plain URL
- Excel datetime, string datetime, and invalid timestamp
- missing/duplicate headers
- blank and malformed rows
- duplicate submissions
- atomic failure
- review preservation across reimport
- size and extension rejection

Notebook fetching:

- all supported Colab/Drive URL forms
- invalid IDs
- successful streamed download
- access-denied HTML body
- timeout, non-JSON, invalid shape, and oversized response

Execution:

- sequential shared state
- standard output types
- first-error behavior
- cell and total timeout
- cancellation/process cleanup
- malformed runner protocol
- disabled execution configuration

Reviews:

- validation and idempotent upsert
- status counts
- stable identity across imports

Frontend/manual smoke:

- new-install empty state
- complete import-to-review workflow
- filter and navigation behavior
- output identity through visibility toggles
- keyboard-only class picker and grading
- narrow viewport and 200% zoom

Avoid adopting a full browser-test stack unless manual regressions remain frequent. Pure JavaScript selectors/formatters can be extracted for lightweight tests later without adding a bundler now.

## Logging and diagnostics

Use Python logging with concise events:

- application startup and database path
- migration version applied
- import success counts or diagnostic code on failure
- notebook fetch category and Drive file ID suffix only
- execution ID, duration, terminal status, and failing cell index
- cleanup failures

Never log student code, notebook outputs, review feedback, or full submitted URLs by default.

Add:

```http
GET /api/health
```

For local diagnostics it returns application status, schema version, execution availability, and kernel availability—no student data or filesystem secrets.

## README and clean-clone verification

Update README with:

1. Python version requirement.
2. Existing clone/pull commands.
3. Virtual environment creation and activation.
4. Dependency installation.
5. A kernel verification command.
6. `python3 app.py` and the actual port (`8000` unless overridden).
7. `python3 -m unittest discover -s tests`.
8. Database and backup locations.
9. How to disable execution.
10. A prominent warning that local execution runs student code on the machine.

Verify the documented commands verbatim in a clean temporary clone using a temporary database path. Confirm:

- dependencies install
- migrations run
- test suite passes
- `/api/health` succeeds
- app starts on the documented URL
- a sample notebook kernel can execute two dependent cells

Do not commit generated databases, virtual environments, notebook artifacts, or execution output.

## Repository cleanup

Audit the tracked `package-lock.json` and `pnpm-lock.yaml`. If the application has no package manifest, Node source, or required build step after tasks 01–05, remove the obsolete lockfiles in a dedicated commit and document that no Node installation is needed.

Do not delete user-owned untracked files such as `static/styles 2.css` without explicit confirmation. Preserve unrelated working-tree changes throughout implementation.

Expand `.gitignore` as needed for:

- SQLite databases plus WAL/SHM files
- database backups
- execution temp/output files
- notebook checkpoints
- Python caches and virtual environments
- macOS metadata

## Code organization

Keep Flask simple. Extract only cohesive services made necessary by the work:

- `database.py` / `migrations.py`
- `notebook_service.py`
- `execution_service.py`
- `execution_runner.py`

Do not convert the application into a large package hierarchy or add an ORM merely for style. Route handlers should validate HTTP input and delegate operations, while services remain directly unit-testable.

## Acceptance criteria

- A database created by the current release upgrades without losing classes or submissions.
- A repeat import does not erase saved reviews.
- Failed imports leave the previous dataset intact.
- Execution timeouts and cancellation leave no child kernels behind.
- Debug mode is opt-in.
- Errors shown to graders are actionable and do not leak internals.
- The expanded automated suite passes from a clean clone.
- README commands work verbatim on the supported local environment.
- No unrelated user changes or untracked files are overwritten.

## Not in scope

- VPS/systemd/Nginx deployment
- Public sandboxing
- User accounts or permissions
- Cloud backups
- Canvas OAuth or APIs
- Postgres, Redis, Celery, Docker, or a frontend build system

