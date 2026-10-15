"""Compare common physical chain models after both real exporters have run.

Run from any directory with Python 3; no numerical packages are required.
Sunny's fixtures polarize along z, SpinW's along y, so compare rotationally
invariant total spin-mode weights. AFM branches are degenerate and only their
summed weight is invariant. Exclude regularized Goldstone singularities.
"""
import json
from pathlib import Path

data_dir = Path(__file__).resolve().parents[3] / "data" / "magnons"


def total_weight(data, iq):
    return sum(real * real + imag * imag
               for mode in data["vectors"][iq]
               for site in mode
               for real, imag in site)


for example in ("sw01", "sw02"):
    sunny = json.loads((data_dir / f"sunny-{example}.json").read_text())
    spinw = json.loads(next(data_dir.glob(f"spinw-{example}-*.json")).read_text())
    native_sunny_q = sunny["metadata"]["input_qpoints"]
    native_spinw_q = spinw["metadata"]["input_qpoints"]
    energy_errors, weight_errors = [], []
    for iq, q in enumerate(native_sunny_q):
        matching = [j for j, p in enumerate(native_spinw_q)
                    if max(abs(x-y) for x, y in zip(q, p)) < 1e-9]
        if not matching or min(sunny["energies"][iq]) < 1e-3:
            continue
        j = matching[0]
        assert len(sunny["energies"][iq]) == len(spinw["energies"][j])
        energy_errors.append(max(abs(a-b) for a, b in
                                 zip(sunny["energies"][iq], spinw["energies"][j])))
        weight_errors.append(abs(total_weight(sunny, iq) - total_weight(spinw, j)))
    assert len(energy_errors) >= 3, "Not enough shared nonzero-energy q points"
    assert max(energy_errors) < 2e-6, energy_errors
    assert max(weight_errors) < 2e-5, weight_errors
    print(f"{example}: {len(energy_errors)} common nonzero-energy q points; "
          f"max ΔE={max(energy_errors):.3g} meV, "
          f"max ΔΣ|d|²={max(weight_errors):.3g}")
