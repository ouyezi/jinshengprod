import pytest
from app.scoring import calculate_scores, round_score, suggest_result


def test_all_ones():
    r = calculate_scores([1] * 12)
    assert r["avg_values"] == 1.00
    assert r["avg_capability"] == 1.00
    assert r["avg_output"] == 1.00
    assert r["final_score"] == 1.00


def test_all_fives():
    r = calculate_scores([5] * 12)
    assert r["final_score"] == 5.00


def test_partial_none():
    r = calculate_scores([3, 3, 3, None] + [3] * 8)
    assert r["final_score"] is None


def test_round_half_up():
    assert round_score(3.996) == 4.00
    assert round_score(2.004) == 2.00


def test_boundary_two():
    scores = [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]
    r = calculate_scores(scores)
    assert r["final_score"] == 2.00
    assert suggest_result(r["final_score"]) == ("不通过", "不通过晋升")


def test_boundary_four():
    scores = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]
    r = calculate_scores(scores)
    assert r["final_score"] == 4.00
    assert suggest_result(r["final_score"]) == ("通过", "通过晋升")


def test_middle_zone():
    scores = [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3]
    r = calculate_scores(scores)
    assert r["final_score"] == 3.00
    assert suggest_result(r["final_score"]) == ("评委自选", None)
