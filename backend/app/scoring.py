from decimal import Decimal, ROUND_HALF_UP


def round_score(value: float) -> float:
    return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def calculate_scores(scores: list[int | None]) -> dict[str, float | None]:
    if any(s is None for s in scores):
        return {
            "avg_values": None,
            "avg_capability": None,
            "avg_output": None,
            "final_score": None,
        }

    avg_values = round_score(sum(scores[0:3]) / 3)
    avg_capability = round_score(sum(scores[3:10]) / 7)
    avg_output = round_score(sum(scores[10:12]) / 2)
    final_score = round_score(avg_values * 0.2 + avg_capability * 0.4 + avg_output * 0.4)

    return {
        "avg_values": avg_values,
        "avg_capability": avg_capability,
        "avg_output": avg_output,
        "final_score": final_score,
    }
