# Magnon viewer: review guide

This change adds a magnon page where selecting a dispersion point animates
site-resolved spin arrows. Sunny, SpinW, and Magnopy calculations are exported
once to versioned JSON; no solver runs in the browser. Local JSON files stay local.

## Short demo

From the repository root:

```sh
npm ci
npm run build:site
python3 -m http.server 8000 --directory build
```

Open `http://localhost:8000/magnon.html`.

1. Choose **Ferromagnetic chain · Sunny**. Click a finite-energy point, then
   enable **center on atom** and **tip path**. Change arrow length or cone width
   to see that they are independent; scrub phase to inspect the precession.
2. Choose **Antiferromagnetic chain · SpinW** to inspect the two-sublattice
   magnetic cell. The selected q is displayed in the solver's input convention.
3. Choose **FeI₂ · Sunny SU(N)** and select band 8. All eight bands are retained;
   arrows show their dipole projection, including longitudinal motion. A pure
   multipolar mode can be invisible to this observable.
4. Choose **Cubic ferromagnet (elliptic) · Magnopy** and enable **tip path** to
   inspect elliptical precession from its native anisotropic mode.
5. Load a JSON file using **Your calculation**, or export a GIF/WebM of the
   current 3D mode. The exporter READMEs document the one-call workflows.

## Code boundaries

- `magnonjson.js` validates the data contract and evaluates the shared phase
  convention; `magnoncrystal.js`/`magnongeometry.js` add arrows and trajectories
  to the existing structure renderer.
- `magnonhighcharts.js` adapts the existing dispersion chart to meV and relative
  spin-dipole weights. Atom/bond controls, cameras, cells, and tables are reused.
- `exporters/sunny`, `exporters/spinw`, and `exporters/magnopy` preserve the native
  Hamiltonian and anisotropy conventions, converting solver modes to Cartesian spin amplitudes.
  No solver sources are modified. Magnopy's examples explicitly calculate modes
  with Magnopy before passing them to the exporter.
- Shared changes fix exact q-index selection at disconnected path boundaries,
  clear stale chart selections, pass the optional bond-add button, apply numeric
  appearance changes on blur, and reuse movie-export utilities. The existing
  phonon capture controller remains in place.
- Navigation and build scripts include the magnon page, its data, and guides.
  No new website runtime dependencies are introduced.

## Suggested review order

1. [Format and phase conventions](FORMAT.md), then the isolated solver adapters.
2. [Executed validation](VALIDATION.md), especially the native correlation-tensor
   reconstructions and cross-solver site/Cartesian covariance checks.
3. Shared-code diffs and regression tests, then the magnon UI and short demo.

The default amplitude and playback speed are visual scales. Arrows represent
spin, not g-weighted magnetic moment or neutron intensity. The first format is
restricted to explicit periodic magnetic cells and real stable energies;
unsupported solver cases are rejected. Eigenvector continuity across crossings
and complete multipolar observables are outside this change.
