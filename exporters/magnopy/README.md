# Magnopy → magnon viewer

A small Python exporter for Magnopy's calculated energies and eigenmodes. It
translates the native mode representation into the existing viewer JSON; all
spin-wave calculations remain in Magnopy. No changes to Magnopy are needed.

## Install and export

From the website repository root, install into your Python environment:

```sh
python -m pip install ./exporters/magnopy
```

After constructing your `spinham`, `lswt = magnopy.LSWT(...)`, and sampled path:

```python
from magnopy_magnon_export import export_magnons

export_magnons("magnons.json", spinham, lswt, qpoints, relative=True)
```

This convenience call obtains the modes using Magnopy's own
`lswt.diagonalize(q, relative=True, units="meV")`. To export results you have
**already calculated**, supply them directly:

```python
# These are the native results from your existing calculation:
modes = [lswt.diagonalize(q, relative=True, units="meV") for q in qpoints]
export_magnons("magnons.json", spinham, lswt, qpoints, relative=True, modes=modes)
```

With `modes=`, the exporter makes **no diagonalization calls**. Supply one native
`(omega, delta, G)` tuple for each q point, in path order, with energies in meV.
`delta` is the native constant energy shift and is not used by the viewer.
Use the same `lswt`, path, and coordinate convention that produced those modes;
their association cannot be inferred from the arrays themselves.

Open `magnon.html` and load the JSON file. Neither Python nor Magnopy is needed
in the browser. `magnon_data(spinham, lswt, qpoints, ...)` returns the same data
as a dictionary instead of writing a file.

Both `spinham` and `lswt` are required because Magnopy's `LSWT` object does not
retain atomic positions. Pass the corresponding Hamiltonian without changing
its structure after creating `lswt`. The exporter reads it only for structure
and magnetic-site ordering; it does not parse or translate interaction terms.
If your Hamiltonian came from TB2J, load it with Magnopy's existing tools before
constructing `lswt`, just as in your normal calculation.

## Options

| Keyword | Default | Meaning |
| --- | --- | --- |
| `relative` | `False` | Matches Magnopy: Cartesian reciprocal coordinates by default; `True` means reciprocal lattice units of `lswt.cell` |
| `modes` | `None` | Precomputed native diagonalization results, with energies in meV; otherwise call Magnopy |
| `name` | `"Magnopy magnons"` | Viewer title |
| `repetitions` | `(2, 2, 2)` | Displayed magnetic cells; three integers from 1 to 50 |
| `atom_types` | Native species or `X` | Optional element labels for **all** atoms, including nonmagnetic atoms |
| `highsym_qpts` | `None` | Pairs `[zero_based_sample_index, "label"]` |
| `line_breaks` | Whole path | Consecutive `[start, end)` segments partitioning the path |
| `length_to_angstrom` | `1.0` | Conversion from the native cell's length unit to Å |
| `metadata` | `None` | Additional JSON provenance; exporter convention fields cannot be overridden |

`qpoints` is a numeric `Q × 3` array. Sample the path with your existing workflow;
the exporter does not generate or optimize a path. The viewer computes path
distances from the reciprocal lattice, without jumping across disconnected
segments. Nonmagnetic atoms are retained without spin arrows.

## Conventions

**Structure and momentum.** Lattice vectors are rows, atomic positions are
fractional, and Cartesian spin axes match Magnopy. The cell must explicitly
contain the periodic magnetic order. Atom positions are preserved without
wrapping. `spinham.map_to_all` supplies the exact magnetic-to-full-site map.
For `relative=True`, the exported q equals the native q. Otherwise the exporter
uses `q = k @ cell.T / (2*pi)`, with the **native** cell lengths. Magnopy does not
attach length units to its cell; the default assumes Å. For a cell in nm use
`length_to_angstrom=10`, with Cartesian input k in radians/nm.

The viewer reconstructs

```text
S(R,i,t) = S0(i) + A Re[d(i,q,n) exp(i 2π q·R − i ωt)].
```

Magnopy's local boson basis is already cell-periodic: its Fourier factors use
cell translations, not atomic basis positions. No additional atomic-position
phase or momentum sign reversal is applied. Native coordinates and their units
are retained in metadata.

**Eigenvectors and normalization.** Magnopy returns a matrix with modes in its
**rows**, defining `b = G (a, a†)`. It is not the inverse transformation returned
by some other packages. With its public local frames `p_i = x_i + i y_i`, the
Cartesian transition amplitude is

```text
d(n,i) = sqrt(S_i/2) [conj(p_i) conj(G[n,i]) − p_i conj(G[n,M+i])].
```

This is `⟨0|S_i|q,n⟩`, in units of ℏ. The minus sign and conjugations follow from
the bosonic commutators; both particle and hole blocks are retained. Ordered
spins are `S_i z_i`. For +z circular precession, `d` is proportional to
`(1, −i, 0)`, consistent with the negative time phase. No site or mode is
independently normalized. The browser applies one common visibility scale per
mode, preserving relative phases, amplitudes, and ellipticity.

The exporter requests energies in meV and does not apply another factor of two
to Magnopy's physical excitation energies. It sorts energies with the matching
rows of G. Overall mode phases and bases within degenerate subspaces remain
arbitrary; bands are not tracked through crossings. Magnopy's native Goldstone
regularization is left unchanged. Negative, nonfinite, or significantly complex
energies and invalid bosonic norms are rejected rather than repaired.

Magnopy 0.6.1 can return nonorthogonal native modes at exact degeneracies in
some models. The exporter reports this as an invalid bosonic norm; it does not
orthogonalize modes or alter your Hamiltonian. Such a failure needs to be
resolved in the originating calculation. The field in the official AFM example
separates its two branches.

**Hamiltonian.** Exchange conventions, anisotropy, spin normalization, fields,
ground-state choice, and all diagonalization belong to Magnopy. The exporter
does not implement spin-wave theory, infer exchange parameters, or convert a
Hamiltonian between solvers. The output shows spins, not `g μB S` magnetic
moments, and contains no neutron form factors or scattering polarization factors.

## Examples and validation

Run from the repository root:

```sh
python -m pip install './exporters/magnopy[test]'
python -m pytest exporters/magnopy/tests -q
python exporters/magnopy/examples/export_examples.py
```

The generator calculates modes with Magnopy, then passes those results to the
exporter. It writes three small files to `data/magnons`:

| Example | Source and purpose |
| --- | --- |
| Cubic ferromagnet | Magnopy's native helper and LSWT tutorial; circular precession |
| Cubic elliptic variant | Explicit variation of that helper with unequal transverse anisotropy; particle/hole mixing |
| Antiferromagnetic chain | Official exercise 2: two sites, easy-axis anisotropy, 1 T field; relative site phases and two branches |

Sources: [cubic tutorial](https://tutorials.magnopy.org/en/latest/master-tutorial/1_python-library/plot_8_lswt.html)
and [AFM exercise](https://tutorials.magnopy.org/en/latest/master-tutorial/3_exercises/plot_8_lswt.html#exercise-2).
These are toy spin models, **not DFT calculations**. Lattice spacing and path
sampling are chosen for display, and the hypothetical sites are explicitly
displayed as Fe. Model parameters and provenance are retained in the example
scripts and JSON metadata. No third-party solver source is copied.

Compatibility is bounded to Magnopy **0.6.x**, tested with **0.6.1**. The exporter
uses public APIs only. It supports stable modes in explicit periodic cells;
there is no rotating-frame spiral, damping, susceptibility-to-mode extraction,
or thermal-trajectory adapter. See the [executed validation record](VALIDATION.md)
for tested cases and limits. Magnopy 0.6.1 does not expose a native correlation
tensor API, so validation uses its public eigensystem plus independent analytic
and cross-solver comparisons.

API references: [LSWT](https://docs.magnopy.org/en/latest/api/generated/magnopy.LSWT.html),
[diagonalize](https://docs.magnopy.org/en/latest/api/generated/magnopy.LSWT.diagonalize.html),
[magnetic-site mapping](https://docs.magnopy.org/en/latest/api/generated/magnopy.SpinHamiltonian.map_to_all.html),
[native Fourier implementation](https://docs.magnopy.org/en/latest/_modules/magnopy/_lswt.html),
[shared JSON format](../../doc/magnons/FORMAT.md).
