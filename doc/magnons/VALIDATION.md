# Magnon validation

Executed on 2026-10-15. These checks cover the bundled examples, not every
upstream tutorial.

| Check | Result |
| --- | --- |
| Sunny 0.7.8 and 0.9.2, Julia 1.11.7 | 639 assertions passed per version; five examples |
| SpinW dc06a4b, MATLAB R2026a | Native exporter tests passed; four examples |
| Magnopy 0.6.1, Python 3.12 | 37 tests passed; three examples, 163 q points |
| Website JavaScript suite | 99 passed, 3 optional checks skipped |
| Existing Python phonon suite | 15 passed, 1 optional check skipped |

Checks include native energies and complex mode observables, analytic chain
spectra, momentum signs, precession, ellipticity, and full cross-solver mode
covariances. Degenerate subspaces are compared together; arbitrary eigenvector
phases are not compared directly.

Sunny examples include CoRh₂O₄, Ewald dipoles, and FeI₂ SU(3). SpinW includes
noncollinear kagome and triangular models. Magnopy examples use its native FM
and AFM tutorials; they do not test a DFT workflow.

All files pass the browser parser. Debug/production builds and guide links were
checked. Browser checks covered branch selection, centered arrows, tip paths,
movies, narrow-screen controls, and phonon/exciton regressions. Optional external
Playwright checks were not run.

Scope: stable modes in explicit periodic cells. Damping, incommensurate rotating
frames, and full multipolar dynamics are not supported. Magnopy may return
nonorthogonal modes at exact degeneracies; those are rejected without repair.

[Sunny details](../../exporters/sunny/VALIDATION.md) ·
[Magnopy details](../../exporters/magnopy/VALIDATION.md) · [Review guide](REVIEW.md)
