# Magnopy validation

Executed on 2026-10-15 with Python 3.12.0, Magnopy 0.6.1, NumPy 2.5.4,
and Wulfric 0.7.3: **37 tests passed**.

The three examples cover all modes at **163 q points**:

- [Cubic FM tutorial](https://tutorials.magnopy.org/en/latest/master-tutorial/1_python-library/plot_8_lswt.html): 61 points.
- Elliptic variant of that model: 61 points.
- [AFM exercise 2](https://tutorials.magnopy.org/en/latest/master-tutorial/3_exercises/plot_8_lswt.html#exercise-2): 41 points, two bands.

Tests check native energies/eigen-equations, complex Sunny mode covariances,
DMI momentum sign, ellipticity, coordinates, and export without recalculation.
These are toy models, not DFT validation.

Some exactly degenerate native AFM modes were nonorthogonal and are rejected.
The Sunny comparison uses a small field to split branches and removes its known
energy shifts in the test. The exporter makes no repair or Hamiltonian change.
No native intensity comparison is claimed; Magnopy 0.6.1 has no public intensity API.

[Exporter instructions](README.md) · [Site validation](../../doc/magnons/VALIDATION.md)
