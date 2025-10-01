#!/usr/bin/env python3
"""
Python execution wrapper for server-side code execution.
Handles package installation, execution, output capture, and plot generation.
"""

import sys
import json
import subprocess
import tempfile
import base64
import os
import io
import traceback
from contextlib import redirect_stdout, redirect_stderr

def install_packages(packages):
    """Install required packages using pip."""
    if not packages:
        return True, ""

    try:
        for package in packages:
            # Validate package name (basic security check)
            if not package.replace("-", "").replace("_", "").replace(".", "").isalnum():
                return False, f"Invalid package name: {package}"

            # Install the package
            result = subprocess.run([
                sys.executable, "-m", "pip", "install", package
            ], capture_output=True, text=True, timeout=60)

            if result.returncode != 0:
                return False, f"Failed to install {package}: {result.stderr}"

        return True, ""
    except subprocess.TimeoutExpired:
        return False, "Package installation timeout"
    except Exception as e:
        return False, f"Package installation error: {str(e)}"

def capture_plots():
    """Capture matplotlib plots as base64 encoded images."""
    plots = []
    try:
        import matplotlib.pyplot as plt
        import matplotlib

        # Set non-interactive backend
        matplotlib.use('Agg')

        # Get all figures
        figures = [plt.figure(i) for i in plt.get_fignums()]

        for fig in figures:
            # Save figure to bytes
            img_buffer = io.BytesIO()
            fig.savefig(img_buffer, format='png', bbox_inches='tight', dpi=100)
            img_buffer.seek(0)

            # Convert to base64
            img_base64 = base64.b64encode(img_buffer.getvalue()).decode('utf-8')
            plots.append(img_base64)

            img_buffer.close()

        # Close all figures to free memory
        plt.close('all')

    except ImportError:
        # matplotlib not available, no plots to capture
        pass
    except Exception as e:
        # Error capturing plots, but don't fail the entire execution
        print(f"Warning: Failed to capture plots: {e}", file=sys.stderr)

    return plots

def custom_input(prompt=""):
    """Custom input function for interactive mode that uses JSON protocol."""
    # Send input request to Node.js via stdout
    sys.stdout.write(json.dumps({"type": "input_request", "prompt": prompt}) + "\n")
    sys.stdout.flush()

    # Read response from stdin
    response = sys.stdin.readline().strip()
    return response

def execute_code(code_string, interactive=False):
    """Execute the provided Python code and capture results."""
    # Capture stdout and stderr
    stdout_buffer = io.StringIO()
    stderr_buffer = io.StringIO()

    plots = []
    success = True
    error_message = ""

    try:
        # Create a new namespace for execution
        exec_namespace = {
            '__name__': '__main__',
            '__builtins__': __builtins__
        }

        # If interactive mode, replace input() with custom version
        if interactive:
            exec_namespace['input'] = custom_input
            # For Python 2 compatibility (though we're using Python 3)
            exec_namespace['raw_input'] = custom_input

        # Execute the code with output redirection for non-input output
        if interactive:
            # In interactive mode, we need to allow real stdout/stdin for input()
            # but still capture regular print() output
            original_stdout = sys.stdout
            original_stderr = sys.stderr
            original_stdin = sys.stdin

            # Temporarily restore real stdout/stderr/stdin
            sys.stdout = original_stdout
            sys.stderr = original_stderr
            sys.stdin = original_stdin

            try:
                exec(code_string, exec_namespace)
            finally:
                # Restore buffers
                sys.stdout = original_stdout
                sys.stderr = original_stderr
                sys.stdin = original_stdin
        else:
            # Non-interactive mode - use normal redirection
            with redirect_stdout(stdout_buffer), redirect_stderr(stderr_buffer):
                exec(code_string, exec_namespace)

        # Capture any plots that were created
        plots = capture_plots()

    except Exception as e:
        success = False
        error_message = f"{type(e).__name__}: {str(e)}"

        # Also capture the full traceback for debugging
        if not interactive:
            stderr_buffer.write(traceback.format_exc())
        else:
            sys.stderr.write(traceback.format_exc())

    # Get the captured output
    output = stdout_buffer.getvalue() if not interactive else ""
    error_output = stderr_buffer.getvalue() if not interactive else ""

    # If there's error output but no exception, treat as success with warnings
    if error_output and success:
        # Add error output to main output as warnings
        if output:
            output += "\n" + error_output
        else:
            output = error_output

    return {
        "success": success,
        "output": output,
        "error": error_message if error_message else None,
        "plots": plots if plots else None
    }

def main():
    """Main execution function."""
    if len(sys.argv) < 3:
        print(json.dumps({
            "success": False,
            "output": "",
            "error": "Invalid arguments. Usage: python_executor.py <packages_json> <code_file> [--interactive]"
        }))
        sys.exit(1)

    packages_json = sys.argv[1]
    code_file = sys.argv[2]
    interactive = '--interactive' in sys.argv

    try:
        # Parse packages
        packages = json.loads(packages_json) if packages_json != "null" else []

        # Install packages if needed
        if packages:
            install_success, install_error = install_packages(packages)
            if not install_success:
                print(json.dumps({
                    "success": False,
                    "output": "",
                    "error": f"Package installation failed: {install_error}"
                }))
                sys.exit(1)

        # Read the code file
        try:
            with open(code_file, 'r', encoding='utf-8') as f:
                code = f.read()
        except FileNotFoundError:
            print(json.dumps({
                "success": False,
                "output": "",
                "error": "Code file not found"
            }))
            sys.exit(1)

        # Execute the code and get results
        result = execute_code(code, interactive=interactive)

        # Output the result as JSON (only in non-interactive mode)
        if not interactive:
            print(json.dumps(result))
        else:
            # In interactive mode, send final result as JSON
            sys.stdout.write(json.dumps({"type": "result", "data": result}) + "\n")
            sys.stdout.flush()

    except json.JSONDecodeError:
        print(json.dumps({
            "success": False,
            "output": "",
            "error": "Invalid packages JSON format"
        }))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({
            "success": False,
            "output": "",
            "error": f"Execution error: {str(e)}"
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()