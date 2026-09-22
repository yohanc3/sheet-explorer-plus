from __future__ import annotations

import ast
import json
import operator
import os
import sys
from pathlib import Path

import nbformat
from nbclient import NotebookClient
from nbclient.exceptions import CellExecutionError, CellTimeoutError


STATIC_OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
}


def source_text(value: str | list[str]) -> str:
    return "".join(value) if isinstance(value, list) else value


def static_prompt_value(node: ast.AST):
    if isinstance(node, ast.Constant) and isinstance(node.value, (str, int, float)):
        return node.value
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
        value = static_prompt_value(node.operand)
        if isinstance(value, (int, float)):
            return value if isinstance(node.op, ast.UAdd) else -value
    if isinstance(node, ast.BinOp) and type(node.op) in STATIC_OPERATORS:
        left = static_prompt_value(node.left)
        right = static_prompt_value(node.right)
        if isinstance(left, (int, float, str)) and isinstance(right, (int, float, str)):
            try:
                return STATIC_OPERATORS[type(node.op)](left, right)
            except (TypeError, ValueError, ZeroDivisionError):
                return None
    return None


def literal_print_text(statement: ast.stmt) -> str | None:
    if not isinstance(statement, ast.Expr) or not isinstance(statement.value, ast.Call):
        return None
    call = statement.value
    if not isinstance(call.func, ast.Name) or call.func.id != "print" or not call.args:
        return None
    try:
        value = ast.literal_eval(call.args[0])
    except (ValueError, TypeError):
        return None
    return value if isinstance(value, str) and value else None


def input_markers(tree: ast.AST) -> list[tuple[ast.Call, str, bool]]:
    markers: dict[int, tuple[str, bool]] = {}

    def visit_statement_lists(node: ast.AST) -> None:
        for _field, value in ast.iter_fields(node):
            if isinstance(value, list) and value and all(isinstance(item, ast.stmt) for item in value):
                for index, statement in enumerate(value):
                    previous_print = literal_print_text(value[index - 1]) if index else None
                    for child in ast.walk(statement):
                        if not (
                            isinstance(child, ast.Call)
                            and isinstance(child.func, ast.Name)
                            and child.func.id == "input"
                        ):
                            continue
                        prompt = None
                        if child.args:
                            prompt = static_prompt_value(child.args[0])
                        if isinstance(prompt, (str, int, float)) and str(prompt):
                            markers[id(child)] = (str(prompt), True)
                        elif previous_print:
                            markers[id(child)] = (previous_print, False)
                    visit_statement_lists(statement)
            elif isinstance(value, ast.AST):
                visit_statement_lists(value)

    visit_statement_lists(tree)
    calls = sorted(
        (
            node
            for node in ast.walk(tree)
            if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id == "input"
        ),
        key=lambda node: (node.lineno, node.col_offset),
    )
    return [(call, *markers[id(call)]) for call in calls if id(call) in markers]


def value_after_marker(saved_output: str, marker: str, cursor: int, inline: bool) -> tuple[str, int] | None:
    marker_start = saved_output.find(marker, cursor)
    if marker_start < 0:
        return None
    value_start = marker_start + len(marker)
    if not inline and saved_output[value_start:value_start + 2] == "\r\n":
        value_start += 2
    elif not inline and saved_output[value_start:value_start + 1] in {"\r", "\n"}:
        value_start += 1
    value_end = saved_output.find("\n", value_start)
    if value_end < 0:
        value_end = len(saved_output)
    return saved_output[value_start:value_end].rstrip("\r"), value_end + 1


def saved_input_values(cell: dict) -> list[str] | None:
    """Recover values entered in Colab from the cell's saved stdout."""
    try:
        tree = ast.parse(source_text(cell.get("source", "")))
    except SyntaxError:
        return None

    markers = input_markers(tree)
    if not markers:
        return None

    saved_output = "".join(
        source_text(output.get("text", ""))
        for output in cell.get("outputs", [])
        if output.get("output_type") == "stream" and output.get("name") == "stdout"
    )
    values: list[str] = []
    cursor = 0
    if len(markers) == 1:
        _call, marker, inline = markers[0]
        while recovered := value_after_marker(saved_output, marker, cursor, inline):
            value, cursor = recovered
            values.append(value)
        return values or None

    for _call, marker, inline in markers:
        recovered = value_after_marker(saved_output, marker, cursor, inline)
        if recovered is None:
            return None
        value, cursor = recovered
        values.append(value)
    return values


def add_saved_inputs(cell: dict) -> None:
    values = saved_input_values(cell)
    if values is None:
        return
    prelude = (
        f"__grader_saved_inputs = iter({values!r})\n"
        "def input(prompt=''):\n"
        "    value = next(__grader_saved_inputs, '')\n"
        "    print(f'{prompt}{value}')\n"
        "    return value\n"
    )
    cell["source"] = prelude + source_text(cell.get("source", ""))


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
            add_saved_inputs(cell)
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
