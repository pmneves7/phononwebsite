# Magnopy exporter

From the website repository root, install once:

```sh
python -m pip install ./exporters/magnopy
```

Export from your existing Magnopy Hamiltonian, LSWT object, and sampled path:

```python
from magnopy_magnon_export import export_magnons
export_magnons("magnons.json", spinham, lswt, qpoints, relative=True)
```

Load the file in the [magnon viewer](../../magnon.html).
`qpoints` is **N × 3**. Use `relative=True` for magnetic-cell reciprocal lattice
units; the default, like Magnopy, is Cartesian reciprocal coordinates.

To reuse already calculated modes without diagonalizing again:

```python
# modes contains the native (omega, delta, G) result for each q, in meV.
export_magnons("magnons.json", spinham, lswt, qpoints, relative=True, modes=modes)
```

Without `modes=`, the exporter calls Magnopy's own `diagonalize` method.
Pass the matching, unchanged `spinham` for atomic positions. Cell lengths are
assumed to be Å; use `length_to_angstrom=10` for nm. Optional keywords include
`name`, `repetitions`, `atom_types`, and `highsym_qpts=[[0, "Γ"], ...]`.

Tested with Magnopy 0.6.1. Stable periodic modes are supported; invalid native
modes, including some nonorthogonal results at exact degeneracies, are rejected
without repair. All spin-wave calculations remain in Magnopy.

Try the cubic FM, elliptic variant, and two-site AFM examples:

```sh
python exporters/magnopy/examples/export_examples.py
python -m pip install './exporters/magnopy[test]'
python -m pytest exporters/magnopy/tests -q
```

[Format and conventions](../../doc/magnons/FORMAT.md) · [Validation](VALIDATION.md)
