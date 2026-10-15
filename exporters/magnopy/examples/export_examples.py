"""Calculate the small examples with Magnopy, then export their native modes.

After installing this exporter, run from the repository root:
    python exporters/magnopy/examples/export_examples.py
"""

import argparse
from pathlib import Path

from magnopy_magnon_export import export_magnons

from models import example_models


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "output", nargs="?", type=Path,
        default=Path(__file__).resolve().parents[3] / "data" / "magnons",
        help="Output directory (default: repository data/magnons)",
    )
    output = parser.parse_args().output
    output.mkdir(parents=True, exist_ok=True)
    for stem, model in example_models().items():
        source_url, notes = model.pop("source_url"), model.pop("notes")
        # Magnopy does the calculation. The exporter receives the existing
        # eigenvalues and transformations and does not recalculate them.
        modes = [model["lswt"].diagonalize(q, relative=True, units="meV")
                 for q in model["qpoints"]]
        path = export_magnons(
            output / f"{stem}.json", **model, relative=True, modes=modes,
            metadata={"source_url": source_url, "example_notes": notes,
                      "example_script": "exporters/magnopy/examples/models.py"},
        )
        print(path)


if __name__ == "__main__":
    main()
