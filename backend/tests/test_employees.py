import pytest
from app.models import next_target_level, EMPLOYEE_LEVELS


def test_next_target_level_normal():
    assert next_target_level("P4") == "P5"
    assert next_target_level("P5") == "P6"
    assert next_target_level("P9") == "P10"


def test_next_target_level_p10_returns_none():
    assert next_target_level("P10") is None


def test_next_target_level_invalid():
    assert next_target_level("P3") is None
    assert next_target_level("invalid") is None


def test_employee_levels_include_p4():
    assert "P4" in EMPLOYEE_LEVELS
    assert "P10" in EMPLOYEE_LEVELS
