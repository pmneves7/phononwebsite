# Magnon viewer

Open `magnon.html`, choose an example or load a JSON exported from your calculation,
then click a point on a dispersion branch. The arrows show the selected mode's
spin expectation values on the atoms. Drag to rotate, scroll to zoom, and use the
phase slider to pause at a particular point in the cycle.

The viewer shares the website's Three.js structure renderer, atom and bond
geometry, camera controls, cell display, structure tables, and Highcharts
dispersion selection. It adds a small spin-animation layer. Calculations remain
in Sunny, SpinW, or Magnopy; loading a file in the browser requires no solver.
Local uploads are read in the browser and are not sent to a server.

## Appearance and movies

The camera, cell, shading, Jmol/Vesta atom display, per-element atom color and
radius, and bond color/radius/type controls follow the phonon viewer. Bond cutoffs
are in Å; atom radius is a multiplier. Add or remove bond types with the same
element-pair controls. Reset buttons restore the corresponding section.

Spin arrows have independent length, color, cylinder width, cone width, and cone
fraction controls. Length is a display multiplier; changing it leaves widths
unchanged. Cylinder width, cone width, and tip-path thickness are **diameters in
Å**, while cone fraction is between 0 and 1 and specifies how much of the total
arrow length is occupied by its head. Spin styling persists when selecting
another mode or changing atom/bond appearance.

By default the arrow's tail is attached to its atom. **Center on atom** fixes the
arrow's midpoint to the atom instead: both ends move symmetrically, and the tip
travels half as far from the atom for the same total arrow length. This changes
only the drawing, not the spin expectation value or eigenmode.

**Tip path** draws the tip's complete trajectory through one phase cycle, using
the arrow color and its own thickness. It follows the actual complex Cartesian
mode, including elliptical or longitudinal response; a linearly polarized mode
traces a segment and a stationary mode has no path. This is a full-cycle guide,
not a fading history. Paths update with the mode, amplitude, arrow length, and
anchor choice. They can remain visible when the arrows are hidden.

**Mode weights** colors the dispersion by relative spin-dipole weight per
element, summing `|d|²` over Cartesian components and magnetic sites and
normalizing at each q and band. Nonmagnetic atoms and equilibrium spins do not
contribute. Purely dipole-dark modes retain an uncolored dispersion branch.
These weights are not neutron intensities: no g tensor, polarization factor,
form factor, or thermal population is applied.

GIF and WebM export the 3D view through one visual phase cycle at the selected
speed, including when playback is paused. Export temporarily locks the controls
and then restores the original phase and playback state. As with phase scrubbing,
an export can illustrate the phase dependence of a zero-energy mode. WebM is
disabled when the browser has no compatible native recorder; GIF uses the same
bundled encoder as the phonon viewer. All encoding happens locally.

## Export a calculation

- [Sunny exporter](../../exporters/sunny/README.md): a small Julia package with
  a one-call export from a `SpinWaveTheory` and reciprocal-space path.
- [SpinW exporter](../../exporters/spinw/README.md): MATLAB functions with a
  one-call export from a configured SpinW model and path.
- [Magnopy exporter](../../exporters/magnopy/README.md): a small Python package
  exporting native `LSWT.diagonalize` results, including precomputed modes.
- [JSON format and conventions](FORMAT.md): the shared, versioned data contract.

Each exporter preserves the solver's Hamiltonian, chosen ground state, and
anisotropy conventions. In particular, the Sunny adapter does not undo Stevens
operator or interaction renormalization choices. A comparison model must be
configured consistently in the compared packages before export. Conversion concerns
coordinates, units, and representation of modes, not the Hamiltonian.

## What the animation means

For site `i` in repeated magnetic cell `R`, the viewer evaluates

```
S(R,i,t) = S0(i) + A Re[d(i,q,band) exp(i(2π q·R − phase))].
```

Atoms are stationary. A mode has one complex Cartesian spin vector at each
magnetic site. Relative complex phases produce precession and propagation.
Arrows represent **spins in units of ħ**, not magnetic moments weighted by a
g-tensor. A single common display scale per mode makes motion visible while
preserving relative site amplitudes. The amplitude slider is a visualization
scale, not magnon occupation or temperature.

Playback cycles at an adjustable visual speed independently of the physical
excitation energy. The dispersion uses meV. Exactly zero-energy modes do not
advance automatically. At a degeneracy, the solver can return any basis of the
degenerate subspace; the visible polarization of an individual branch is not
necessarily unique.

The animation is the linear spin expectation-value response of a coherent
excitation. It is not the time-dependent expectation of a one-magnon number
state. Spins are not projected onto a sphere: that would erase longitudinal
response in SU(N) modes. Conventional transverse modes therefore have the small
second-order length changes inherent in adding a linear fluctuation to `S0`.
Use small amplitudes for faithful linear-response interpretation.

SU(N) modes are displayed through their spin-dipole projection. A pure
quadrupolar excitation may have no visible arrow motion; the viewer identifies
zero-dipole modes instead of amplifying numerical noise. It does not display
higher multipoles or entangled-unit observables.

## Coordinates and native conventions

Files contain a periodic magnetic cell, with all animation wavevectors expressed
in the reciprocal basis of that exported cell. Site vectors are in a shared
Cartesian frame. The cell-periodic spatial phase and negative time phase are
explicit fields; the viewer rejects other conventions.

The packages differ in their native momentum and eigenvector conventions. The
exporters adapt to the common animation convention without reversing precession. They retain
the user's original reciprocal coordinates in `metadata.input_qpoints`; those
native coordinates are shown alongside the selected energy. The lattice and
atomic positions in the Structure panel describe the exported magnetic cell.

## Examples and validation

See the [executed validation record](VALIDATION.md) for numerical results,
clean-install checks, browser checks, and remaining limitations. The
[review guide](REVIEW.md) gives a short demo and code map.

The initial example collection covers the ferromagnetic and antiferromagnetic
chain tutorials, CoRh₂O₄, FeI₂ in SU(N) mode, and the long-range dipole tutorial.
Magnopy examples add a cubic ferromagnet, an elliptically polarized variation,
and the two-site antiferromagnetic-chain tutorial. These are model examples,
not validations of a DFT-to-exchange workflow.
Generation scripts and solver tests live with the exporters. Saved JSON files
allow browser testing without any solver installation. See the exporter
READMEs for the exact solver versions, source tutorials, and regeneration steps.

Validation should compare energies and Cartesian mode observables, not raw
Bogoliubov matrix entries. A mode's overall complex phase is arbitrary, and
degenerate eigenvectors can mix. Comparisons account for global phase and sum
or compare subspaces at degeneracies. The exporters also test reconstruction of
native spin-correlation intensities where supported.

## Local development

From the repository root:

```sh
npm ci
npm run build
cd build
python3 -m http.server 8000
```

Visit `http://localhost:8000/magnon.html`. Run `npm test` for JavaScript tests.
The viewer accepts `magnon.html?json=URL` for a hosted dataset when the server
permits browser access. For a local calculation, use the file picker.

The first format targets periodic magnetic cells and real, stable excitation
energies. Exporters report unsupported cases instead of silently treating
incommensurate spirals, unstable modes, or multipolar observables as ordinary
spin waves. The browser limits display to 2000 atoms and mode data to two million
site-mode entries; export a shorter path or reduce repetitions for larger models.
For magnetic cells containing more than 128 atoms, cosmetic bonds are omitted
to keep loading responsive; atoms and spin modes are preserved.
