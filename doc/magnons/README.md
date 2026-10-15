# Magnon export guide

Open the [magnon viewer](../../magnon.html), choose an example, and click a dispersion
branch to animate its spin motion. To view your own calculation, export a JSON
file with one of the following tools and load it in the viewer.

The install commands below run from this repository's root directory. Each
exporter uses your solver's modes and preserves its Hamiltonian conventions.

## [Sunny](../../exporters/sunny/README.md)

Install once, then start Julia with `julia --project=exporters/sunny`:

```sh
julia --project=exporters/sunny -e 'using Pkg; Pkg.instantiate()'
```

After creating your `SpinWaveTheory` (`swt`) and reciprocal-space `path`:

```julia
using Sunny, SunnyMagnonExport
export_magnons("magnons.json", swt, path)
```

The default units are meV and Å. For another unit system, pass the same Sunny
`Units` object used in your model, e.g. `units=Units(:K, :angstrom)`.

## [SpinW](../../exporters/spinw/README.md)

With SpinW installed, add the exporter to your MATLAB path. After defining your
`model` and ordered spins:

```matlab
addpath('/path/to/phononwebsite/exporters/spinw');
export_magnons('magnons.json', model, {[0 0 0] [0.5 0 0] [1 0 0] 101});
```

The path uses SpinW's usual cell-array format or a 3 × N array of q points.
Use SpinW's standard meV and Å units.

## [Magnopy](../../exporters/magnopy/README.md)

Install the Python exporter:

```sh
python -m pip install ./exporters/magnopy
```

After creating your `spinham`, `lswt`, and N × 3 array of `qpoints`:

```python
from magnopy_magnon_export import export_magnons
export_magnons("magnons.json", spinham, lswt, qpoints, relative=True)
```

`relative=True` uses reciprocal lattice units of the magnetic cell. To reuse
previously calculated `diagonalize` results in meV, also pass `modes=modes`.
Cell lengths are assumed to be Å.

Files loaded with the file chooser stay in your browser. Your colleague only
needs the website and the exported JSON file to view your calculation.

## Controls

- **Amplitude / Speed / Phase:** adjust the motion or pause at a chosen phase.
- **Repetitions:** show more magnetic cells.
- **Atom / Bonds:** use the same appearance controls as the phonon viewer.
- **Spin arrows:** change length, color, cylinder/cone width, and cone fraction.
  Widths are diameters in Å; length is a display scale.
- **Center on atom:** place the arrow's midpoint on the atom.
- **Tip path:** show the tip's complete trajectory through one cycle.
- **GIF / WebM:** save one animation cycle.

Arrows show spin motion, not g-weighted magnetic moments. Amplitude and playback
speed are visual scales. Mode weights show relative spin-dipole weight, not
neutron intensity. A mode with no dipole component has no arrow motion.

For another exporter, see the [JSON format](FORMAT.md).
