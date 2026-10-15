# Magnon JSON, version 1

This format stores already-calculated spin modes. It deliberately contains no
Hamiltonian parser or solver-specific bosonic eigenbasis. The web viewer only
needs Cartesian expectation-value fluctuations and the matching energies.

## Required fields

| Field | Shape / meaning |
| --- | --- |
| `format` | Exactly `"magnonwebsite"` |
| `version` | Integer `1` |
| `name` | Display name (plain text) |
| `units` | `{"length":"angstrom","energy":"meV","spin":"hbar"}` |
| `phase_convention` | `"cell-periodic"` |
| `time_convention` | `"exp(-iwt)"` |
| `lattice` | Three **row** vectors of the periodic magnetic cell, in Å |
| `atom_types` | `N` element symbols; `X` for an unspecified model site |
| `atom_pos_red` | `N × 3` fractional coordinates in that cell |
| `magnetic_atom_indices` | `M` unique **zero-based** indices into the atom arrays |
| `spin_vectors` | `M × 3` ordered Cartesian spin expectation values in ħ |
| `qpoints` | `Q × 3` fractional reciprocal coordinates of the exported lattice |
| `energies` | `Q × B` nonnegative, finite excitation energies in meV |
| `vectors` | `Q × B × M × 3 × 2`: Cartesian components, each `[real, imaginary]` |

The ordering of sites in `vectors` and `spin_vectors` is exactly the ordering of
`magnetic_atom_indices`. `B` is the number of physical modes, not the doubled
particle/hole dimension. It need not equal `M` (e.g. SU(N) modes).
All singleton array dimensions must be retained, including a one-site mode.
JSON does not encode complex numbers, NaN, or infinity; these must not be written
as strings or silently replaced by null.

## Optional fields

| Field | Meaning |
| --- | --- |
| `repetitions` | Three positive integers; defaults to `[1,1,1]` |
| `distances` | `Q` nonnegative, nondecreasing path coordinates |
| `highsym_qpts` | Pairs `[zeroBasedQIndex, "label"]` |
| `line_breaks` | Consecutive `[startInclusive,endExclusive]` segments partitioning all q-points |
| `metadata` | Provenance and solver-specific information, not executable content |

Without distances, the reader computes reciprocal Cartesian path length in
Å⁻¹, with the `2π` included, and no distance jump between disconnected segments.
Without segments, the entire path is connected. Repeated boundary points are
allowed. Labels at the same path coordinate are combined.

Recommended metadata include producer, producer version, exporter version,
normalization, source tutorial URL, and the original `input_qpoints` as a `Q × 3`
array. Optional `input_qpoint_units` labels those displayed coordinates (default:
`input RLU`); Magnopy can also supply Cartesian reciprocal coordinates.
Native input q-points are displayed when supplied. They do not control
the animation: only the canonical `qpoints` do.

## Reconstruction and normalization

Let the rows of `lattice` be `a_j`. The position of site `i` in cell `R` is
`sum_j (R_j + atom_pos_red[i][j]) a_j`. The reciprocal basis includes `2π` and
satisfies `a_j·b_k = 2π δ_jk`.

For a selected q and band, write `d_i` for the complex vector in `vectors`.
The reconstruction is

```
S_Ri(phase) = S0_i + A Re[d_i exp(i(2π q·R − phase))].
```

There is **no additional** `q·atom_pos_red` term in the viewer. An exporter must
convert any position-inclusive Bloch gauge to this cell-periodic gauge. When a
solver already uses the cell-periodic gauge, no basis-phase conversion is needed.
Both equilibrium spins and mode vectors must be rotated into the same global
Cartesian coordinate frame as the lattice.

The bundled exporters use one-magnon spin matrix elements (`sqrt(S/2)` factors
for ordinary Holstein–Primakoff modes). Their metadata document normalization.
Only a common overall mode amplitude is arbitrary for visualization; independently
normalizing each site changes the physics and is not permitted. Both particle
and hole blocks contribute, even when only positive-energy modes are exported.
Neither g-tensors, magnetic form factors, Bose populations, nor neutron
polarization factors belong in `vectors`.

The viewer rescales the complete mode by one common factor for visibility.
Exactly zero or numerically negligible dipole vectors remain zero. A pure
multipolar mode is valid and may have no visible arrow motion.

## Solver independence

The exporters leave all interactions, Stevens coefficients, quantum correction
choices, and ground-state optimization to the originating solver. They convert
units and representations only. The SpinW adapter accounts for its opposite
native momentum sign while keeping its original input coordinates in metadata.
The Sunny adapter uses its own magnetic-cell conversion and native local frames.
The Magnopy adapter translates native `LSWT.diagonalize` transformations using
Magnopy's local spin frames; it accepts precomputed results and adds no solver.
Each adapter's README specifies its supported versions and native conventions.

Version 1 does not encode multiple domains, incommensurate rotating frames,
complex unstable energies, damping, thermal trajectories, or higher multipole
operators. Such data require an explicit extension rather than reinterpretation
of existing fields.
