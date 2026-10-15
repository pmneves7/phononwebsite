# Sunny validation

Executed on 2026-10-15 with Julia 1.11.7 on macOS arm64.

| Version | Result |
| --- | --- |
| Sunny 0.9.2 | 639 assertions passed |
| Sunny 0.7.8 | 639 assertions passed |

The five generated examples cover FM/AFM chains, CoRh₂O₄, Ewald dipoles with
K-to-meV conversion, and FeI₂ SU(3). Tests compare native complex correlation
tensors and analytic results, including ellipticity, DMI, and a dipole-dark mode.
FM/AFM fixtures also agree with SpinW after aligning coordinates and degenerate
subspaces. Goldstone points are excluded from cross-solver weight comparisons.

The adapter uses Sunny's internal local frames; rerun the tests for new versions.
Sunny 0.8.x is in the compatibility range but was not tested. The native tensor
reference must use the original System, not Sunny 0.7's internally rotated system.

[Exporter instructions](README.md) · [Site validation](../../doc/magnons/VALIDATION.md)
