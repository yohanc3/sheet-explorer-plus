import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from openpyxl import Workbook

import app as application


class AppTestCase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        application.DATABASE = Path(self.temp_dir.name) / "test.db"
        application.init_db()
        application.app.config.update(TESTING=True)
        self.client = application.app.test_client()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_class_and_student_crud(self):
        created = self.client.post("/api/classes", json={"name": "CS 127"})
        self.assertEqual(created.status_code, 201)
        class_id = created.get_json()["id"]
        student = self.client.post(f"/api/classes/{class_id}/students", json={"name": "Ada Lovelace"})
        self.assertEqual(student.status_code, 201)
        student_id = student.get_json()["id"]

        state = self.client.get("/api/state").get_json()
        self.assertEqual(state["classes"][0]["students"][0]["name"], "Ada Lovelace")
        self.assertEqual(self.client.patch(f"/api/students/{student_id}", json={"name": "Augusta Lovelace"}).status_code, 200)
        self.assertEqual(self.client.delete(f"/api/classes/{class_id}").status_code, 204)
        self.assertEqual(self.client.get("/api/state").get_json()["classes"], [])

    def test_xlsx_import_replaces_submissions(self):
        workbook = Workbook()
        sheet = workbook.active
        sheet.append(["Timestamp", "title", "first_name", "last_name", "time", "difficulty", "confident", "needswork", "suggestions", "corrections", "locals", "share"])
        sheet.append(["8/25/2021 13:15:35", "01.0.0 Intro to the Course", "Justin", "Bruso", "30 min or less", "Very Easy", "Running the code", "The syntax of python", "None", "N/A", 26, "Open submission"])
        sheet["L2"].hyperlink = "https://colab.research.google.com/drive/1tw6sWATzkK6kZB3msBVZUojB9koL_fDa?usp=sharing"
        data = io.BytesIO()
        workbook.save(data)
        data.seek(0)

        response = self.client.post(
            "/api/import",
            data={"file": (data, "submissions.xlsx")},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 200)
        state = self.client.get("/api/state").get_json()
        self.assertEqual(len(state["submissions"]), 1)
        submission = state["submissions"][0]
        self.assertEqual(submission["full_name"], "Justin Bruso")
        self.assertEqual(submission["timestamp"], "2021-08-25T13:15:35")
        self.assertEqual(submission["time"], "30 min or less")
        self.assertEqual(submission["share"], "https://colab.research.google.com/drive/1tw6sWATzkK6kZB3msBVZUojB9koL_fDa?usp=sharing")

    def test_sync_master_sheet_downloads_csv_and_replaces_submissions(self):
        csv_data = (
            "Timestamp,title,first_name,last_name,time,difficulty,confident,needswork,"
            "suggestions,corrections,locals,share\n"
            "8/25/2021 13:15:35,Intro,Grace,Hopper,30 min,Easy,Loops,Syntax,None,N/A,26,"
            "https://colab.research.google.com/drive/abcdefghij12345?usp=sharing\n"
        ).encode()
        response = Mock()
        response.raise_for_status.return_value = None
        response.iter_content.return_value = [csv_data[:40], csv_data[40:]]

        with patch.object(application.requests, "get", return_value=response) as get:
            synced = self.client.post("/api/sync-master")

        self.assertEqual(synced.status_code, 200)
        self.assertEqual(synced.get_json()["count"], 1)
        get.assert_called_once_with(
            application.app.config["MASTER_SHEET_EXPORT_URL"],
            timeout=(5, 30),
            stream=True,
        )
        submission = self.client.get("/api/state").get_json()["submissions"][0]
        self.assertEqual(submission["full_name"], "Grace Hopper")
        self.assertEqual(submission["title"], "Intro")

    def test_sync_failure_keeps_last_saved_submissions(self):
        with application.db() as connection:
            connection.execute(
                """INSERT INTO submissions
                (title, first_name, last_name, full_name, share)
                VALUES (?, ?, ?, ?, ?)""",
                ("Saved assignment", "Ada", "Lovelace", "Ada Lovelace", "saved-link"),
            )

        with self.assertLogs(application.app.logger, level="ERROR"):
            with patch.object(application.requests, "get", side_effect=application.requests.Timeout):
                synced = self.client.post("/api/sync-master")

        self.assertEqual(synced.status_code, 502)
        submissions = self.client.get("/api/state").get_json()["submissions"]
        self.assertEqual(len(submissions), 1)
        self.assertEqual(submissions[0]["title"], "Saved assignment")

    def test_state_groups_case_and_spacing_variants_of_student_names(self):
        with application.db() as connection:
            connection.executemany(
                """INSERT INTO submissions
                (timestamp, title, first_name, last_name, full_name, share)
                VALUES (?, ?, ?, ?, ?, ?)""",
                [
                    ("2026-09-03T12:00:00", "Assignment 3", "yohance", "smith", "yohance smith", "third"),
                    ("2026-09-02T12:00:00", "Assignment 2", "yohance", "smith", "yohance   smith", "second"),
                    ("2026-09-01T12:00:00", "Assignment 1", "Yohance", "Smith", "Yohance Smith", "first"),
                ],
            )

        submissions = self.client.get("/api/state").get_json()["submissions"]

        self.assertEqual({item["student_key"] for item in submissions}, {"yohance smith"})
        self.assertEqual({item["full_name"] for item in submissions}, {"Yohance Smith"})
        self.assertEqual({item["title"] for item in submissions}, {"Assignment 1", "Assignment 2", "Assignment 3"})

    def test_resolve_colab_url_and_execute_python(self):
        response = self.client.post(
            "/api/resolve-notebook",
            json={"url": "https://colab.research.google.com/drive/abcdefghij12345?usp=sharing"},
        )
        self.assertEqual(response.get_json()["file_id"], "abcdefghij12345")
        executed = self.client.post("/api/execute-python", json={"code": "print(6 * 7)"})
        self.assertEqual(executed.status_code, 200)
        self.assertEqual(executed.get_json()["output"].strip(), "42")

    def test_execute_python_replays_saved_cell_inputs(self):
        cell = {
            "cell_type": "code",
            "source": (
                "message = input('Write a short message:')\n"
                "limit = int(input('What is the limit?'))\n"
                "print((message * 3)[:limit])"
            ),
            "outputs": [
                {
                    "name": "stdout",
                    "output_type": "stream",
                    "text": [
                        "Write a short message:Go!\n",
                        "What is the limit?6\n",
                        "Go!Go!\n",
                    ],
                }
            ],
        }

        executed = self.client.post("/api/execute-python", json={"cell": cell})

        self.assertEqual(executed.status_code, 200)
        result = executed.get_json()
        self.assertTrue(result["success"])
        self.assertIn("Write a short message:Go!", result["output"])
        self.assertIn("What is the limit?6", result["output"])
        self.assertIn("Go!Go!", result["output"])

    def test_execute_python_returns_eof_instead_of_hanging_without_saved_input(self):
        executed = self.client.post(
            "/api/execute-python",
            json={"code": "input('Missing saved input:')"},
        )

        self.assertEqual(executed.status_code, 422)
        self.assertEqual(executed.get_json()["error"], "EOFError: EOF when reading a line")

    def test_execute_python_supports_colab_syntax_and_local_report_shim(self):
        cell = {
            "cell_type": "code",
            "source": (
                "if False:\n"
                "  ! git clone --quiet https://github.com/bsheese/cs125_tools.git\n"
                "import exercise_report_response\n"
                "exercise_report_response.exercise_time_difficulty_report('03.7.1')"
            ),
            "outputs": [],
        }

        executed = self.client.post("/api/execute-python", json={"cell": cell})

        self.assertEqual(executed.status_code, 200)
        self.assertTrue(executed.get_json()["success"])

    def test_execute_notebook_runs_cells_sequentially_with_per_cell_outputs(self):
        notebook = {
            "nbformat": 4,
            "nbformat_minor": 5,
            "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"}},
            "cells": [
                {"cell_type": "code", "metadata": {}, "source": "answer = 21", "outputs": [], "execution_count": None},
                {"cell_type": "code", "metadata": {}, "source": "print(answer * 2)", "outputs": [], "execution_count": None},
                {"cell_type": "code", "metadata": {}, "source": "answer * 3", "outputs": [], "execution_count": None},
                {"cell_type": "code", "metadata": {}, "source": "from IPython.display import HTML, display\ndisplay(HTML('<b>done</b>'))", "outputs": [], "execution_count": None},
            ],
        }

        executed = self.client.post("/api/execute-notebook", json={"notebook": notebook})

        self.assertEqual(executed.status_code, 200)
        result = executed.get_json()
        self.assertTrue(result["success"])
        self.assertEqual([cell["status"] for cell in result["cells"]], ["completed"] * 4)
        self.assertEqual(result["cells"][1]["outputs"][0]["output_type"], "stream")
        stream_text = result["cells"][1]["outputs"][0]["text"]
        self.assertEqual("".join(stream_text).strip(), "42")
        self.assertEqual(result["cells"][2]["outputs"][0]["output_type"], "execute_result")
        expression_text = result["cells"][2]["outputs"][0]["data"]["text/plain"]
        self.assertEqual("".join(expression_text), "63")
        html = result["cells"][3]["outputs"][0]["data"]["text/html"]
        self.assertEqual("".join(html), "<b>done</b>")

    def test_execute_notebook_uses_local_exercise_report_shim(self):
        notebook = {
            "nbformat": 4,
            "nbformat_minor": 5,
            "metadata": {},
            "cells": [
                {
                    "cell_type": "code",
                    "execution_count": None,
                    "metadata": {},
                    "outputs": [],
                    "source": "import exercise_report_response\nexercise_report_response.exercise_time_difficulty_report('03.7.1')",
                },
                {
                    "cell_type": "code",
                    "execution_count": None,
                    "metadata": {},
                    "outputs": [],
                    "source": "print('student cell ran')",
                },
            ],
        }

        executed = self.client.post("/api/execute-notebook", json={"notebook": notebook})

        self.assertEqual(executed.status_code, 200)
        result = executed.get_json()
        self.assertTrue(result["success"])
        self.assertEqual(result["completed_count"], 2)
        self.assertIn("student cell ran", "".join(result["cells"][1]["outputs"][0]["text"]))

    def test_execute_notebook_replays_saved_input_values(self):
        notebook = {
            "nbformat": 4,
            "nbformat_minor": 5,
            "metadata": {},
            "cells": [
                {
                    "cell_type": "code",
                    "execution_count": 1,
                    "metadata": {},
                    "outputs": [
                        {
                            "name": "stdout",
                            "output_type": "stream",
                            "text": ["Message:hello\n", "Limit:12\n", "hellohello\n"],
                        }
                    ],
                    "source": "message = input('Message:')\nlimit = int(input('Limit:'))\nprint((message * 2)[:limit])",
                }
            ],
        }

        executed = self.client.post("/api/execute-notebook", json={"notebook": notebook})

        self.assertEqual(executed.status_code, 200)
        result = executed.get_json()
        self.assertTrue(result["success"])
        output = "".join(result["cells"][0]["outputs"][0]["text"])
        self.assertIn("Message:hello", output)
        self.assertIn("Limit:12", output)
        self.assertIn("hellohello", output)

    def test_execute_notebook_replays_bare_input_inside_a_loop(self):
        notebook = {
            "nbformat": 4,
            "nbformat_minor": 5,
            "metadata": {},
            "cells": [
                {
                    "cell_type": "code",
                    "execution_count": 1,
                    "metadata": {},
                    "outputs": [
                        {
                            "name": "stdout",
                            "output_type": "stream",
                            "text": [
                                "Which fruit?\n",
                                "apple\n",
                                "Try again.\n",
                                "Which fruit?\n",
                                "orange\n",
                                "Correct.\n",
                            ],
                        }
                    ],
                    "source": (
                        "while True:\n"
                        "    print('Which fruit?')\n"
                        "    fruit = input()\n"
                        "    if fruit == 'orange':\n"
                        "        print('Correct.')\n"
                        "        break\n"
                        "    print('Try again.')"
                    ),
                }
            ],
        }

        executed = self.client.post("/api/execute-notebook", json={"notebook": notebook})

        self.assertEqual(executed.status_code, 200)
        result = executed.get_json()
        self.assertTrue(result["success"])
        output = "".join(result["cells"][0]["outputs"][0]["text"])
        self.assertIn("apple", output)
        self.assertIn("orange", output)
        self.assertIn("Correct.", output)

    def test_execute_notebook_replays_numeric_expression_prompts(self):
        notebook = {
            "nbformat": 4,
            "nbformat_minor": 5,
            "metadata": {},
            "cells": [
                {
                    "cell_type": "code",
                    "execution_count": 1,
                    "metadata": {},
                    "outputs": [
                        {
                            "name": "stdout",
                            "output_type": "stream",
                            "text": ["2525\n", "77\n", "32\n"],
                        }
                    ],
                    "source": "first = int(input(5 * 5))\nsecond = int(input(5 + 2))\nprint(first + second)",
                }
            ],
        }

        executed = self.client.post("/api/execute-notebook", json={"notebook": notebook})

        self.assertEqual(executed.status_code, 200)
        result = executed.get_json()
        self.assertTrue(result["success"])
        output = "".join(result["cells"][0]["outputs"][0]["text"])
        self.assertIn("32", output)


if __name__ == "__main__":
    unittest.main()
