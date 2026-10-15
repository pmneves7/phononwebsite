# Magnopy exporter validation

Executed on 2026-10-15 with Python 3.12.0, Magnopy 0.6.1, NumPy 2.5.4,
and Wulfric 0.7.3. Magnopy was installed in a separate virtual environment;
the exporter was installed through its checked-in `pyproject.toml`.

## Native examples

The three examples use Magnopy's existing APIs. Their generator first obtains
native `(omega, delta, G)` results and then supplies them through `modes=`.
The exporter performs no diagonalization in this workflow.

| Example | q points | Bands | Energy range (meV) |
| --- | ---: | ---: | ---: |
| Cubic ferromagnet | 61 | 1 | 1–13 |
| Cubic elliptic variant | 61 | 1 | 1.224745–13.247641 |
| Antiferromagnetic chain | 41 | 2 | 1.164857–4.315768 |

All 163 q points pass native energy comparisons. For every mode, the tests
recover particle/hole columns from the exported Cartesian vectors, then check
Magnopy's native dynamical-matrix eigen-equation, positive bosonic normalization,
and transversality. This tests the conversion independently of the exporter's
formula. The cubic variant is explicitly an adaptation; these models do not
validate a DFT/TB2J calculation.

## Independent checks

The Python suite has **37 passing tests**. In addition to the examples:

- FM and AFM chains agree with the saved Sunny results in full complex
  site-by-Cartesian spectral covariance, including relative site phases.
- An asymmetric DMI chain checks the native momentum sign against its analytic
  dispersion. The elliptic case checks analytic energy, axis ratio, absolute
  amplitudes, and precession handedness.
- A global spin rotation preserves multisite mode covariances. Cartesian
  reciprocal coordinates, skew lattices, length conversion, unwrapped positions,
  and nonmagnetic atom mapping are tested explicitly.
- Precomputed export is tested with `diagonalize` replaced by a function that
  fails if called. Singleton JSON dimensions, path segments, provenance, and
  rejection of invalid modes/options are also checked. Invalid data do not
  overwrite an existing output file.

Magnopy 0.6.1 sometimes returns nonorthogonal native modes at an exact AFM
degeneracy on this installation. The exporter detects and rejects them; no
orthogonalization, solver replacement, or automatic Hamiltonian modification
was added. For the independent Sunny AFM comparison, a small longitudinal field
splits the native modes without changing their summed covariance; the known
Zeeman shifts are removed **in the test** before comparing energies. The
official AFM example already includes its tutorial's 1 T field.

## Limits

Only Magnopy 0.6.1 was executed. Native correlation-tensor comparison is not
claimed: this version exposes the eigensystem but no public intensity API.
The tests cover stable periodic spin-dipole modes, not damping, susceptibility
mode extraction, rotating-frame spirals, or a fresh DFT workflow.

The site-wide [validation record](../../doc/magnons/VALIDATION.md) covers the
browser, build, and regression checks. Regenerate the fixtures and repeat these
tests before expanding the supported Magnopy version range.
