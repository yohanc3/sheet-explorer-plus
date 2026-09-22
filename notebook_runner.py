from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import nbformat
from nbclient import NotebookClient
from nbclient.exceptions import CellExecutionError, CellTimeoutError


def error_message(cells: list[dict]) -> str:
    for cell in cells:
        for output in cell.get("outputs", []):
            if output.get("output_type") == "error":
                return f"{output.get('ename', 'Error')}: {output.get('evalue', '')}".strip()
    return "Notebook execution failed."


def main() -> None:
    notebook_path = Path(sys.argv[1])
    notebook = nbformat.read(notebook_path, as_version=4)
    for cell in notebook.cells:
        if cell.cell_type == "code":
            cell.outputs = []
            cell.execution_count = None

    execution_error: str | None = None
    try:
        shim_directory = Path(__file__).resolve().parent / "runtime_shims"
        python_path = os.environ.get("PYTHONPATH")
        os.environ["PYTHONPATH"] = os.pathsep.join(
            [str(shim_directory), *([python_path] if python_path else [])]
        )
        client = NotebookClient(
            notebook,
            timeout=30,
            kernel_name="python3",
            allow_errors=False,
            store_widget_state=False,
        )
        client.execute()
    except (CellExecutionError, CellTimeoutError) as exc:
        execution_error = f"{type(exc).__name__}: {exc}"
    except Exception as exc:
        execution_error = f"Could not run the notebook kernel: {type(exc).__name__}: {exc}"

    serialized = json.loads(nbformat.writes(notebook))
    cells = []
    found_error = False
    completed_count = 0
    for index, cell in enumerate(serialized["cells"]):
        if cell.get("cell_type") != "code":
            continue
        outputs = cell.get("outputs", [])
        has_error = any(output.get("output_type") == "error" for output in outputs)
        if has_error:
            status = "error"
            found_error = True
        elif found_error or cell.get("execution_count") is None:
            status = "not_run"
        else:
            status = "completed"
            completed_count += 1
        cells.append(
            {
                "cell_index": index,
                "execution_count": cell.get("execution_count"),
                "status": status,
                "outputs": outputs,
            }
        )

    success = execution_error is None and not found_error
    message = None if success else error_message(serialized["cells"])
    if message == "Notebook execution failed." and execution_error:
        message = execution_error
    print(
        json.dumps(
            {
                "success": success,
                "error": message,
                "completed_count": completed_count,
                "code_cell_count": len(cells),
                "cells": cells,
            }
        )
    )


if __name__ == "__main__":
    main()
