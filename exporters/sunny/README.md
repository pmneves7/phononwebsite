# Sunny → magnon viewer

This small Julia package exports an existing Sunny spin-wave calculation to the
website's JSON format. It does not fit a Hamiltonian, choose a ground state, or
translate anisotropy parameters to SpinW. No graphics backend is required.

## Install and export

From the website repository root, prepare this package's local environment once:

```sh
julia --project=exporters/sunny -e 'using Pkg; Pkg.instantiate()'
```

Start Julia with `julia --project=exporters/sunny`, build your Sunny model as
usual, and add one export call after constructing `swt` and `path`:

```julia
using Sunny, SunnyMagnonExport
# ... model, energy minimization, swt = SpinWaveTheory(...), path = q_space_path(...)
export_magnons("magnons.json", swt, path; name="My magnet")
```

Alternatively, add the local package to your existing **project environment**
with `Pkg.develop(path="/path/to/phononwebsite/exporters/sunny")`.
Open `magnon.html` and use the file chooser to load the exported file.

Sunny numbers do not carry units. The default assumes your model was defined in
meV and angstroms. Pass the same `Units` object you used when building the model:

```julia
export_magnons("dipoles.json", swt, path; units=Units(:K, :angstrom))
```

This converts energies from kelvin to meV; it does not change the Hamiltonian.
The output always uses meV, angstroms, and spin in units of ℏ. There is no
automatic way to infer the input unit system from `swt`.

Optional keywords: `name`, `units`, `repetitions=(2,2,2)`, `atom_types`,
`source_url`, and `metadata=Dict(...)`. Each repetition count must be an integer
from 1 to 50, matching the viewer's limits. `atom_types` overrides the labels for
the exported magnetic sites; unnamed Sunny sites become `X`. Only magnetic
sites are included, so a `subcrystal` does not regain its nonmagnetic ligands.
`magnon_data(swt, path; ...)` returns the same content as a Julia dictionary
without writing a file.

## Convention choices

### Preserve the solver's model

The exporter calls Sunny's `excitations(swt, q)` on the supplied model and retains
its equilibrium state. It accepts ordinary periodic `SpinWaveTheory` for
`:dipole`, `:dipole_uncorrected`, and `:SUN` modes, including Ewald long-range
dipoles. A commensurate noncollinear state is supported through its explicit
magnetic cell. `SpinWaveTheorySpiral`, KPM, and entangled-unit calculations are
rejected explicitly.

Sunny supports specifying anisotropy with spin matrices or Stevens operators;
the relevant distinction from other codes is also Sunny's **mode-dependent
interaction renormalization**. In `:dipole`, operator expectations receive
Sunny's finite-spin corrections; `:dipole_uncorrected` retains its classical
polynomial convention; `:SUN` retains the local quantum operators. The exporter
never rescales an anisotropy coefficient to match SpinW. To compare a physical
model across solvers, make the Hamiltonians equivalent in the model scripts
first, including their sign, spin-length, and operator conventions. See
[Sunny's renormalization notes](https://sunnysuite.github.io/Sunny.jl/stable/renormalization.html)
and its [SW12 port](https://sunnysuite.github.io/Sunny.jl/stable/examples/spinw/SW12_Triangular_easy_plane.html).

### Magnetic cell and Fourier phase

The input path follows Sunny: its q vectors use reciprocal lattice units of the
**original crystallographic cell**, even after `reshape_supercell`. The exporter
uses `swt.sys.crystal` as the exported magnetic cell and converts q into that
cell's reciprocal basis. Original q vectors and lattice are retained in
`metadata.input_qpoints` and `metadata.input_lattice`.

Sunny stores direct lattice vectors as columns. JSON stores those vectors as
rows. Atom positions are fractional in the exported cell. Cartesian spin axes
are the same global axes used by Sunny; there is no rotation to lattice axes.

The viewer's motion is

```text
S[R,i](t) = S0[i] + A Re{d[i](q,ν) exp[i(2π q·R − ωt)]}.
```

Here `R` is an integer translation of the **magnetic** cell. Sunny's spin-wave
Hamiltonian uses `exp(+2π i q·bond.n)`, so its eigenvectors already have the
required cell-periodic gauge. **No extra site-position phase is applied.**
The separate `exp(-i q_cart·r_i)` basis phase belongs to scattering intensities,
not to the animation's cell-translation factor.

### Spin matrix elements and normalization

The JSON contains the complex vector `d[i] = ⟨0|S_i|q,ν⟩` in units of ℏ, with
the normal mode normalized to unit positive bosonic metric. For a coherent
oscillation of small complex amplitude α, the physical expectation change is
`2 Re{α d exp[i(2πq·R−ωt)]}`; the viewer folds this overall factor into its
arbitrary visual amplitude `A`. A single-magnon number state itself has no
oscillating one-point spin expectation.

For dipole calculations, writing the positive-energy eigenvector as `(u,v)`,

```text
d_i = sqrt(S_i/2) R_i (u_i+v_i, i(v_i−u_i), 0).
```

`R_i` is Sunny's exact local-to-global rotation, including its arbitrary local
gauge angle. Both sectors of the **same** positive-energy eigenvector are
needed. For a +z ferromagnet, `d ∝ (1,−i,0)`: with `exp(−iωt)`, an initial +x
displacement moves toward −y. No per-site or per-mode normalization is applied
in the file; relative site amplitudes and ellipticity are preserved.

For SU(N), let `O_i^a` be the global Cartesian spin operator expressed in Sunny's
local coherent-state basis, with the ground state in its last (`N`) component:

```text
d_i^a = Σ_f [O_i^a[N,f] u_(f,i) + O_i^a[f,N] v_(f,i)].
```

All `N−1` flavors and all three spin components are retained. Arrow lengths may
change, because SU(N) spin expectations can have longitudinal fluctuations.
Purely multipolar modes can have **zero spin-dipole amplitude** and consequently
stationary arrows. Their bands remain present. An arrow display does not show
the full quadrupole or higher-multipole state; this matters for FeI₂.

The arrows show **spin**, not magnetic moment `−μB g S`. `g` still influences the
solver's Zeeman and dipolar interactions, but is not applied again to the
displayed vectors. Magnetic form factors, neutron polarization factors, Bose
occupation, and scattering-intensity normalization do not enter the file.

Only the positive-energy q columns are exported; negative-energy columns encode
the partner at −q, not additional bands. Bands are sorted by energy at each q
with vectors kept paired. Crossings are not tracked by eigenvector overlap.
Overall mode phase and basis choice within a degenerate subspace are arbitrary.
Sunny's regularization is preserved and recorded, so Goldstone points can have
small nonzero energies and large canonically normalized amplitudes.

## Examples and validation

Run these commands from the website repository root:

```sh
julia --project=exporters/sunny exporters/sunny/test/runtests.jl
julia --project=exporters/sunny exporters/sunny/examples/export_examples.jl
python3 exporters/sunny/test/compare_spinw_fixtures.py
```

The generator writes five small, solver-generated files under `data/magnons`:

| File | Model and checks |
| --- | --- |
| `sunny-sw01.json` | Ferromagnetic chain: analytic dispersion, absolute transverse weight, precession handedness |
| `sunny-sw02.json` | Antiferromagnetic chain: analytic dispersion, doubled magnetic cell, anomalous Bogoliubov sector |
| `sunny-corh2o4.json` | CoRh₂O₄: exact ground-state energy, two-site primitive cell, analytic diamond-lattice dispersion |
| `sunny-dipole.json` | Four-site pyrochlore: full Ewald interactions, noncollinear local frames, K → meV conversion |
| `sunny-fei2.json` | Four-site FeI₂ SU(3): eight physical bands, full spin operator matrix elements, longitudinal amplitudes |

These are compact adaptations of the official tutorials, not saved plot data.
They omit plotting and exploratory large-cell searches, use deterministic
ground states or fixed seeds, and sample fewer q points. The FeI₂ example seeds
the known two-up/two-down state and still minimizes its full SU(3) coherent
states. The pyrochlore site's `Gd` label is descriptive of the tutorial's spin
7/2 model, not a claim to include a full chemical structure.

For **every** example the tests compare exported bands against the native
solver and reconstruct Sunny's bare-spin dynamical structure factor from the
exported complex vectors and atomic positions. Degenerate modes are compared
through summed spectral weights. This tests relative phase, amplitudes, units,
and magnetic-cell conversion. A separate analytic SU(3) single-ion test ensures
a zero-dipole quadrupolar mode is retained without inventing spin motion.
The Python check compares common FM/AFM q samples against the independently
generated SpinW fixtures: energies and rotationally invariant summed spin-mode
weights agree, allowing for the two solvers' small Goldstone regularizations.

### Compatibility boundary

The public `excitations` API supplies the modes; reconstructing Cartesian spins
also needs Sunny's internal local frames. That dependency is isolated in
`src/sunny_adapter.jl`. Compatibility is bounded to Sunny 0.7.8–0.9.x, with
solver versions recorded in each export. The package does not modify Sunny's
source. A future upstream public Cartesian-mode API could replace this small
adapter without changing the JSON or viewer.

The initial validated release and exact execution results are recorded in
`VALIDATION.md`. Regenerate fixtures and rerun tests when changing the supported
Sunny versions. Exact eigenvector JSON need not match byte-for-byte across
BLAS, Julia, or Sunny versions because mode phase and degeneracy bases can vary.
