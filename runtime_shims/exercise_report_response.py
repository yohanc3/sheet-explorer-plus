"""Local no-op replacement for the Colab-only course reporting helper.

The reporting cells collect and submit student reflections. Graders only need to
execute the student's work, so those reporting hooks intentionally do nothing.
"""

er_question_list: list = []


def exercise_time_difficulty_report(_exercise_name):
    return None


def display_form(_questions):
    return None


def submit_exercise_response(_exercise_name, _questions):
    return None
