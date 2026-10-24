from rest_framework import exceptions

from core.errors import _readable_validation


def test_a_field_error_reads_as_a_sentence_not_a_python_repr():
    message, details = _readable_validation(
        {"tags": [exceptions.ErrorDetail("Not tags we know: x.", code="invalid")]}
    )
    assert message == "tags: Not tags we know: x."
    assert "ErrorDetail" not in message
    assert details == {"fields": {"tags": ["Not tags we know: x."]}}


def test_non_field_errors_carry_no_label():
    message, _ = _readable_validation({"non_field_errors": ["End must follow start."]})
    assert message == "End must follow start."
