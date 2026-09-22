from __future__ import annotations

import base64
import io
import json
import re
import sys
import traceback
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path


class InputRequired(Exception):
    def __init__(self, prompt: str):
        super().__init__(prompt)
        self.prompt = prompt


def interactive_input(values: list[str]):
    position = 0

    def grader_input(prompt: object = "") -> str:
        nonlocal position
        prompt_text = str(prompt)
        print(prompt_text, end="")
        if position >= len(values):
            raise InputRequired(prompt_text)
        value = values[position]
        position += 1
        print(value)
        return value

    return grader_input


def prepare_colab_code(code: str, namespace: dict) -> str:
    """Translate Colab/IPython shell and magic syntax before plain execution."""
    if not re.search(r"^\s*[!%]", code, flags=re.MULTILINE):
        return code
    from IPython.core.inputtransformer2 import TransformerManager
    from IPython.core.interactiveshell import InteractiveShell

    shell = InteractiveShell.instance()
    namespace["get_ipython"] = lambda: shell
    return TransformerManager().transform_cell(code)


def main() -> None:
    output = io.StringIO()
    error_output = io.StringIO()
    plots: list[str] = []
    success = True
    error = None
    needs_input = False
    input_prompt = None
    try:
        code = Path(sys.argv[1]).read_text(encoding="utf-8")
        namespace = {"__name__": "__main__"}
        if len(sys.argv) > 2:
            values = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
            namespace["input"] = interactive_input(values)
        code = prepare_colab_code(code, namespace)
        with redirect_stdout(output), redirect_stderr(error_output):
            exec(compile(code, "student_code.py", "exec"), namespace)
        try:
            import matplotlib.pyplot as plt

            for figure_number in plt.get_fignums():
                image = io.BytesIO()
                plt.figure(figure_number).savefig(image, format="png", bbox_inches="tight", dpi=110)
                plots.append(base64.b64encode(image.getvalue()).decode("ascii"))
            plt.close("all")
        except ImportError:
            pass
    except InputRequired as exc:
        success = False
        needs_input = True
        input_prompt = exc.prompt
    except Exception as exc:
        success = False
        error = f"{type(exc).__name__}: {exc}"
        error_output.write(traceback.format_exc())
    combined = output.getvalue()
    if error_output.getvalue():
        combined += ("\n" if combined else "") + error_output.getvalue()
    print(json.dumps({
        "success": success,
        "needs_input": needs_input,
        "prompt": input_prompt,
        "output": combined,
        "error": error,
        "plots": plots,
    }))


if __name__ == "__main__":
    main()
