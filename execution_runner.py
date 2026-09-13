from __future__ import annotations

import base64
import io
import json
import sys
import traceback
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path


def main() -> None:
    output = io.StringIO()
    error_output = io.StringIO()
    plots: list[str] = []
    success = True
    error = None
    try:
        code = Path(sys.argv[1]).read_text(encoding="utf-8")
        namespace = {"__name__": "__main__"}
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
    except Exception as exc:
        success = False
        error = f"{type(exc).__name__}: {exc}"
        error_output.write(traceback.format_exc())
    combined = output.getvalue()
    if error_output.getvalue():
        combined += ("\n" if combined else "") + error_output.getvalue()
    print(json.dumps({"success": success, "output": combined, "error": error, "plots": plots}))


if __name__ == "__main__":
    main()
