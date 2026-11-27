"""Stable, JSON-serializable measurements and their policy."""

from dataclasses import dataclass, fields
import json
import math
from pathlib import Path


@dataclass(frozen=True)
class Limits:
    min_mass: float = 0.001
    handle_gap: float = 0.005
    surface_tolerance: float = 1e-6
    min_inertia: float = 1e-6
    passive_drift: float = 0.02
    required_travel: float = 0.95
    rebound_degrees: float = 2
    rebound_fraction: float = 0.02
    button_return: float = 0.1
    button_seconds: float = 0.5
    press_fraction: float = 0.6
    touch_force: float = 1
    touch_radius: float = 0.004
    touch_multiplier: float = 1.25
    penetration: float = 0.001
    default_effort: float = 150
    passive_seconds: float = 2
    drive_seconds: float = 3

    def __post_init__(self):
        for field in fields(self):
            value = getattr(self, field.name)
            if (
                type(value) not in (float, int)
                or not math.isfinite(value)
                or value <= 0
            ):
                raise ValueError(f"{field.name} must be finite and positive")
        for name in ("required_travel", "press_fraction", "button_return"):
            if getattr(self, name) > 1:
                raise ValueError(f"{name} must be at most 1")


def finding(rule, severity, element, measured, threshold, hint):
    return dict(
        id=rule,
        severity=severity,
        element=element,
        measured=measured,
        threshold=threshold,
        hint=hint,
    )


def dump(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + "\n",
        encoding="utf-8",
    )


def table(findings):
    rows = [
        "| Rule | Severity | Element | Measured | Threshold | Fix hint |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for f in findings:
        cells = [
            f["id"],
            f["severity"],
            f["element"],
            json.dumps(f["measured"], sort_keys=True),
            json.dumps(f["threshold"], sort_keys=True),
            f["hint"],
        ]
        rows.append(
            "| "
            + " | ".join(c.replace("|", "\\|").replace("\n", " ") for c in cells)
            + " |"
        )
    return "\n".join(rows)
