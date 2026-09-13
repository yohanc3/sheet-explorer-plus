# Submission Desk

A local Flask app for reviewing student Google Colab/Jupyter notebook submissions from a master Excel workbook. Classes and rosters are stored in SQLite and start empty—there are no hard-coded students.

## Local setup

Clone the project for the first time:

```bash
git clone git@github.com:yohanc3/sheet-explorer-plus.git
cd sheet-explorer-plus
```

If the project is already cloned, update it:

```bash
cd sheet-explorer-plus
git remote set-url origin git@github.com:yohanc3/sheet-explorer-plus.git
git pull origin main
```

Create the Python environment and install the dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
python3 app.py
```

Open <http://127.0.0.1:8000>.

On later runs, activate the existing environment and start the app:

```bash
source .venv/bin/activate
python3 app.py
```

Stop the app with `Ctrl+C`.

## Push changes to main

Before pushing, pull the latest changes:

```bash
git pull --rebase origin main
git add .
git commit -m "Describe the change"
git push origin main
```

## Workflow

1. Open **Manage classes**, add a class, and add its students by full name.
2. Import the master `.xlsx` file. Its first worksheet must include `title`, `first_name`, `last_name`, and `share` columns. Existing submission rows are replaced; classes are kept.
3. Choose an assignment and optionally a class. The queue shows only that class roster, in roster order.
4. Select a student to load their shared Colab notebook. You can inspect saved outputs, run code locally, open the original notebook in Colab, or use Quick grade with the arrow keys.

Application data is saved in `data/sheet_explorer.db`. Set `SHEET_EXPLORER_DB` to use another database path.

> Python execution runs student code on the local machine. Use this only with submissions you trust or run the app in an isolated environment.
