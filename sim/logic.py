"""Decode observable joint/control values and evaluate validated v0.4 trees."""
import operator

OPS = {"==": operator.eq, "<": operator.lt, "<=": operator.le, ">": operator.gt, ">=": operator.ge}


def snapshot(data, record, *, joint_sensors=False):
    fractions, ranges = {}, {}
    for j in record["joints"]:
        lo, hi = j["limits"]
        ranges[j["name"]] = (lo, hi)
        fractions[j["name"]] = float((data.joint(j["name"]).qpos[0] - lo) / (hi - lo))
    controls = {}
    for c in record.get("controls", []):
        name, state = c["name"], c["state"]
        if c["type"] == "touch":
            value = bool(data.sensor(name).data[0] >= state["minForceN"])
        else:
            joint = c["joint"]
            position = data.sensor(name).data[0] if joint_sensors else data.joint(joint).qpos[0]
            if c["type"] == "knob":
                i = min(range(len(state["positions"])), key=lambda i: abs(state["positions"][i] - position))
                value = state["values"][i]
            else:
                lo, hi = ranges[joint]
                value = bool((position-lo)/(hi-lo) >= state["pressedAt"])
        controls[name] = value
    return {"joints": fractions, "controls": controls}


def evaluate(node, states, values):
    def sub(n):
        return evaluate(n, states, values)
    if "all" in node:
        return all(map(sub, node["all"]))
    if "any" in node:
        return any(map(sub, node["any"]))
    if "not" in node:
        return not sub(node["not"])
    if "state" in node:
        return sub(states[node["state"]])
    kind = "joint" if "joint" in node else "control"
    return OPS[node["op"]](values[kind + "s"][node[kind]], node["val"])

