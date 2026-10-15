# SpinW exporter

Add the exporter alongside your existing SpinW installation:

```matlab
addpath('/path/to/phononwebsite/exporters/spinw');
```

After defining the model and ordered spins, export:

```matlab
export_magnons('magnons.json', model, {[0 0 0] [0.5 0 0] [1 0 0] 101});
```

Load the file in the [magnon viewer](../../magnon.html).
The path follows SpinW: a **3 × N** array, or path vertices in a cell array
with an optional sample count. Options include `'Name', 'My magnet'`,
`'Labels', {'Γ','X','Γ'}`, and `'Repetitions', [4 2 1]`.

**Supported:** stable numerical modes in an explicit periodic magnetic cell,
with SpinW's standard meV and Å units. Nonmagnetic atoms are retained.
The exporter keeps SpinW's Hamiltonian and anisotropy conventions. It does not
optimize the spins. Incommensurate rotating frames, symbolic models, and rotated
or multiple twins are not supported.

Tested with MATLAB R2026a and [SpinW dc06a4b](https://github.com/SpinW/spinw/tree/dc06a4bec2c44bcfde6baa630ecb6329fb4b68ba).
To generate the four tutorial examples and run the tests:

```matlab
addpath('exporters/spinw', 'exporters/spinw/examples', 'exporters/spinw/tests');
generate_examples('data/magnons');
test_export_magnons;
```

[Format and conventions](../../doc/magnons/FORMAT.md) · [Validation](../../doc/magnons/VALIDATION.md)
