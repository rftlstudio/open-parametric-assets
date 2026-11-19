"""Collect structured per-record physics observations without retaining trajectories."""
from contextvars import ContextVar
import json
from tempfile import NamedTemporaryFile
from pathlib import Path

_current = ContextVar("measurements", default=None)


def measure(**values):
    observations = _current.get()
    if observations is not None:
        observations.append(values)


def run_check(checks, name, function, *args):
    item = {"name": name, "passed": False, "measurements": []}
    checks.append(item)
    token = _current.set(item["measurements"])
    try:
        value = function(*args)
        item["passed"] = True
        return value
    except Exception as error:
        item["error"] = str(error)
        print(f"FAIL {name}: {error}")
    finally:
        _current.reset(token)


def save_report(path, report):
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as file:
        temporary = Path(file.name)
        try:
            json.dump(report, file, indent=2, allow_nan=False)
            file.write("\n")
        except BaseException:
            file.close()
            temporary.unlink(missing_ok=True)
            raise
    temporary.replace(path)

