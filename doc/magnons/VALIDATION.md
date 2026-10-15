# Magnon validation record

Executed 2026-10-15 on macOS arm64. Numerical physics checks and visual browser
checks are separate: a plausible animation alone is not evidence of a correct
eigenmode conversion.

## Numerical checks

| Check | Result |
| --- | --- |
| Sunny 0.9.2, Julia 1.11.7 | 639/639 assertions passed in a freshly resolved project |
| Sunny 0.7.8, Julia 1.11.7 | 639/639 assertions passed in a separate project |
| SpinW `dc06a4bec2c44bcfde6baa630ecb6329fb4b68ba`, MATLAB R2026a | Native exporter suite passed, including full polarized tensors |
| Common Sunny/SpinW chains | Energies, analytic weights, and full complex site/Cartesian covariances agree |
| Fresh JSON → viewer parser and motion evaluator | All nine examples accepted; 37,984 finite spin samples checked |
| Clean npm install, production build, JavaScript suite | 97 passed, 3 optional checks skipped, 0 failed |
| Existing Python phonon suite, Python 3.12 / phonopy 4.8.3 | 15 passed, 1 skipped, 0 failed |

The chains test analytic dispersions, circular handedness, absolute transverse
weights, and the AFM magnetic cell. Nonreciprocal DM checks establish the momentum
sign independently of inversion-symmetric bands. An anisotropic single-ion
case checks elliptical precession against an analytic axis ratio.

For every Sunny example, exported vectors reconstruct the native full complex
3×3 bare-spin correlation tensor and its trace, including atomic basis phases.
Degenerate bands are summed before comparison. This covers CoRh₂O₄'s primitive
cell, full Ewald dipoles with kelvin-to-meV conversion, and FeI₂'s eight SU(3)
branches and longitudinal response. A separate exact SU(3) single-ion case
checks a dipole-dark quadrupolar excitation. SpinW's AFM, kagome, and triangular
examples reconstruct the native polarized `Sab` tensor.

The cross-solver comparison rotates the global spin axes and matches canonical
momenta, then compares `Σν dν dν†` over the whole degenerate subspace, retaining
site and Cartesian indices. It neither fits site phases nor conjugates modes.
The scalar fixture check finds maximum energy differences of `1.00e-8 meV`
(FM, 15 shared samples) and `2.61e-8 meV` (AFM, seven shared samples). Goldstone
singularities are excluded from the cross-solver comparison because the solvers
use different small regularizations.

## Clean workflow

A separate checkout without `node_modules` or a Julia Manifest was used.
Julia package downloads/caches and the installed MATLAB application were
reused; this was a fresh project/session test, not a pristine operating system.

1. Ran the Sunny README's `Pkg.instantiate()` with its checked-in `Project.toml`;
   it resolved Sunny 0.9.2 and JSON 0.21.4. Ran the suite and generated all five
   Sunny files using the documented exporter calls.
2. Started a new MATLAB batch session, called `restoredefaultpath`, added the
   identified SpinW checkout and the exporter's directories, ran its suite, and
   regenerated all four SpinW files. No MATLAB path was saved permanently.
3. Ran the Python chain comparison on the regenerated files. Parsed all nine
   fresh files with the production JavaScript parser and evaluated four phases
   at every q/band/site, including a nonzero repeated-cell translation.
4. Ran `npm ci` and `npm test`, which builds the production bundles before
   testing. The host supplied Node but no npm executable, so npm 11 was invoked
   through a temporary `pnpm dlx npm@11` installation. No runtime dependency or
   lockfile changes were needed.

Malformed paths, unsupported calculators/spirals, invalid repetitions, JSON
shape errors, and unsupported phase/unit conventions have rejection tests.

## Browser checks

In the desktop Chromium browser, loaded the fresh SpinW kagome and Sunny FeI₂
files through the file chooser. Selected different branches, including FeI₂
band 8, and checked centered arrows and tip paths. Also inspected the regenerated
CoRh₂O₄ and Ewald dipole examples from the clean production build.

The same clean build rendered the graphene phonon dispersion and atom motion,
and the boron-nitride exciton spectrum and isosurface. Phonon mode selection and
Jmol/Vesta changes worked; exciton display and atom-radius changes worked. No
console errors were observed in these checks. The optional external Playwright
tests were not run; these browser checks used the desktop browser directly.
GIF/WebM export and playback restoration were verified during the preceding
appearance-controls validation, with automated capture regressions rerun here.

## Limits

These checks support the documented periodic, stable spin-dipole projection.
They do not validate incommensurate rotating frames, unstable modes, complete
multipolar-state visualization, finite-temperature dynamics, or entangled units.
Sunny 0.8.x remains within the declared compatibility range but was not executed.
Other SpinW releases, Octave, and other browser engines were not tested.
Individual eigenvectors at degeneracies and their overall phase are not unique.

See the [Sunny details](../../exporters/sunny/VALIDATION.md),
[SpinW conventions/tests](../../exporters/spinw/README.md), and
[review guide](REVIEW.md).
