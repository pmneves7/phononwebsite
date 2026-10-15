# Sunny exporter

From the website repository root, install once:

```sh
julia --project=exporters/sunny -e 'using Pkg; Pkg.instantiate()'
```

Start Julia with `julia --project=exporters/sunny`. After building your Sunny
`SpinWaveTheory` and `q_space_path`, export:

```julia
using Sunny, SunnyMagnonExport
export_magnons("magnons.json", swt, path; name="My magnet")
```

Load the file in the [magnon viewer](../../magnon.html).
To use an existing Julia project, add this package with
`Pkg.develop(path="/path/to/phononwebsite/exporters/sunny")`.

The default assumes meV and Å. If you used other units, pass the same Sunny
`Units` object, e.g. `units=Units(:K, :angstrom)`. Optional keywords include
`repetitions=(2,2,2)`, `atom_types`, and `source_url`.

**Supported:** periodic dipole and SU(N) spin waves, including Ewald dipoles.
The exporter preserves Sunny's anisotropy/Stevens and renormalization choices.
It exports magnetic sites only. Spiral, KPM, and entangled-unit calculations
are not supported. SU(N) arrows show the dipole component, including longitudinal
motion; purely multipolar modes remain stationary.

Tested with Sunny 0.7.8 and 0.9.2. Try the five bundled examples:

```sh
julia --project=exporters/sunny exporters/sunny/examples/export_examples.jl
julia --project=exporters/sunny exporters/sunny/test/runtests.jl
```

[Format and conventions](../../doc/magnons/FORMAT.md) · [Validation](VALIDATION.md)
