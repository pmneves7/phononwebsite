# SpinW → magnon viewer

Add this directory to your MATLAB path alongside your existing SpinW installation:

```matlab
addpath('/path/to/phononwebsite/exporters/spinw');
```

After defining the magnetic model and its ordered state, export with one call:

```matlab
export_magnons('magnons.json', model, {[0 0 0] [0.5 0 0] [1 0 0] 101});
```

Open `magnon.html` and load that JSON file. No SpinW installation is needed in the browser. This exporter is a small standalone MATLAB function; it does not change SpinW, install a package, save MATLAB paths, or optimize your ground state.

## Inputs and options

`qpath` follows SpinW's convention: a numeric **3 × N** matrix, or a cell array of path vertices with an optional number of samples per segment. Adjacent segments share their boundary sample. The input reciprocal coordinates and `model.unit.qmat` are treated exactly as by `model.spinwave`.

```matlab
export_magnons('magnons.json', model, {[0 0 0] [0.5 0 0] 101}, ...
    'Name', 'My magnetic model', 'Labels', {'Γ', 'X'}, ...
    'Repetitions', [4 2 1]);
```

| Option | Default | Meaning |
| --- | --- | --- |
| `Name` | `SpinW magnons` | Viewer title |
| `Labels` | `{}` | One label per vertex of a cell-array path |
| `Repetitions` | `[2 2 1]` | Initial number of displayed magnetic cells; integers from 1 to 50 |
| `OmegaTolerance` | `1e-8` | SpinW's `omega_tol`, in meV |

The optional return value is the structure written to the file. It uses nested cells to retain singleton JSON dimensions (a single atom, band, or wavevector is still an array).

## Conventions

**Hamiltonian.** The exporter uses the supplied SpinW Hamiltonian unchanged. Exchange matrices, classical single-ion anisotropy matrices, g-tensors, fields, and any interactions handled by SpinW remain SpinW's responsibility. In particular, it does not convert anisotropy to Stevens operators or apply Sunny's quantum renormalization. Matching a Sunny calculation requires matching the physical Hamiltonians in the model scripts first.

**Arrows.** The equilibrium arrows are SpinW's ordered spin vectors in global Cartesian coordinates, in units of ℏ. They are spins, not magnetic moments: the exporter does not multiply the output by a g-tensor or by the Bohr magneton. The g-tensor and field may still affect the calculated modes through the Hamiltonian. Nonmagnetic atoms are retained in the structure without arrows. SpinW's unknown element is exported as `X`.

**Magnetic cell.** The exported lattice is the explicit magnetic cell, with lattice vectors stored as rows in ångström. `model.atom` supplies all symmetry-expanded atoms and `model.magtable` supplies magnetic-site ordering and local frames. Both are repeated by `model.magstr.N_ext`. SpinW fractional positions are divided by this repetition vector. No approximate spatial matching or atom-label guessing is used.

**Momentum and time.** The shared viewer uses

```text
S(R,i,t) = S0(i) + A Re[d(i,q,ν) exp(i 2π q·R − i ωt)].
```

`R` is an integer translation of the exported magnetic cell. SpinW's native Fourier convention has the opposite momentum sign, so:

```text
q_export = −diag(N_ext) qmat q_input.
```

Energies are calculated at the **input** SpinW path, and labels stay in input path order. `metadata.input_qpoints`, `metadata.input_qmat`, and the written conversion document this difference. The amplitudes are **not conjugated**: doing that would reverse spin precession. An asymmetric DM chain in the tests checks this convention; inversion-symmetric bands alone cannot establish the sign.

**Mode reconstruction.** In SpinW's actual right-handed local frames let `z = e1 + i e2`. For each positive-norm Bogoliubov eigenvector with particle/hole components `u,v`, the Cartesian amplitude is

```text
d_i = sqrt(S_i/2) [conj(z_i) u_i + z_i v_i] = <0|S_i|one magnon>.
```

SpinW's basis is already cell-periodic, so no additional phase from the atom's position is applied. `d` includes the relative amplitudes and phases within the magnetic cell; no site or mode is normalized for display in the exporter. This is a one-quantum transition amplitude per magnetic cell, not the raw bosonic eigenvector. The browser amplitude control is visual exaggeration and does not specify a physical occupation number.

**Branch selection.** The exporter requests `saveV=true`, `sortMode=false`, `notwin=true`, `hermit=true`, and `cmplxBase=false`. It selects positive bosonic norm modes, checks their norm and energy, and sorts each q point by energy while applying the identical permutation to the eigenvectors. This avoids the mismatch possible when SpinW saves `V` before its optional dispersion continuity sorting. Degenerate eigenvectors remain a legitimate solver-selected basis and are not tracked across crossings.

**Zero modes.** SpinW may add `omega_tol` to a singular Hamiltonian. The default here is `1e-8` meV, recorded in metadata. Exact Goldstone-mode eigenvectors are not unique; normalized amplitudes can become large near a zero mode. Inspect neighboring finite-energy points for meaningful precession. Unstable or nonfinite modes are rejected rather than serialized as null values.

## Scope

The first exporter supports numerical linear spin waves in an explicit periodic magnetic cell, one unrotated magnetic domain, and SpinW's standard ångström/meV units. It rejects symbolic models, multiple/rotated twins, incommensurate rotating-frame structures, and unstable eigensystems. For a rational spiral, explicitly enlarge `genmagstr(...,'nExt',...)` until the order is periodic. This folds the bands and may increase the file size.

The implementation uses public SpinW methods `spinwave`, `magtable`, `atom`, `magstr`, `basisvector`, `sw_qscan`, and `sw_extendlattice`, but necessarily depends on the meaning/order of `saveV`. It validates returned dimensions and positive bosonic norms. It was executed with MATLAB R2026a and the MATLAB SpinW implementation at commit [`dc06a4bec2c44bcfde6baa630ecb6329fb4b68ba`](https://github.com/SpinW/spinw/tree/dc06a4bec2c44bcfde6baa630ecb6329fb4b68ba). The four committed SpinW JSON fixtures were generated with this same combination. This source checkout reports an empty version string and release `1001`; the exporter records that fact rather than substituting a version it cannot verify. Other versions, including Octave, have not been validated.

## Examples and tests

With SpinW already on the MATLAB path, run from the repository root:

```matlab
addpath('exporters/spinw', 'exporters/spinw/examples', 'exporters/spinw/tests');
test_export_magnons;
generate_examples('data/magnons');
```

The example model definitions reproduce the Hamiltonians and ordered states of [SpinW tutorials 1, 2, 7, and 12](https://spinw.org/tutorials). They omit tutorial plotting and powder calculations:

| Example | Cell and purpose |
| --- | --- |
| SW01 ferromagnetic chain | One spin; analytic dispersion and circular precession |
| SW02 antiferromagnetic chain | Two spins; magnetic-cell folding and opposite ordered spins |
| SW07 kagome antiferromagnet | Three spins; noncollinear local frames |
| SW12 triangular easy plane | Explicit 3 × 3 × 1 cell; native SpinW anisotropy, nine folded modes |

The tests compare FM/AFM energies with analytic expressions; check precession handedness and one-magnon normalization; verify a nonreciprocal DM dispersion against the canonical momentum convention; and reconstruct SpinW's full complex polarized `Sab` tensor for AFM, kagome, and triangular models. The tensor comparison includes intracell phases and SpinW's division by the number of crystallographic cells, which is applied to scattering intensities but **not** to the exported per-site transition amplitudes. Tests also cover nonmagnetic atom mapping, magnetic-cell coordinates, path labels, singleton JSON arrays, and clear rejection of unsupported input.

When comparing with Sunny, align magnetic cells, Fourier conventions, spin coordinate axes, Hamiltonian conventions, and mode phases. At a degeneracy compare the whole degenerate subspace or its summed correlation tensor; individual eigenvectors can differ by a unitary rotation even for identical physics.

References: [SpinW spinwave API](https://spinw.org/spinwdoc/spinw_spinwave), [Sunny momentum conventions](https://sunnysuite.github.io/Sunny.jl/stable/examples/08_Momentum_Conventions.html).
