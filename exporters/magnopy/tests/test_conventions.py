"""Scientific checks of the adapter using Magnopy's public API and Sunny data.

These tests do not implement a spin-wave solver. Magnopy calculates every mode;
the independent checks are its native eigen-equation, analytic single-spin
limits, and full complex site/Cartesian covariances from Sunny's real exporter.
"""

import json
from pathlib import Path
import runpy

import magnopy
import numpy as np
import pytest
from numpy.testing import assert_allclose

from magnopy_magnon_export import magnon_data


DATA = Path(__file__).resolve().parents[3] / "data" / "magnons"


def _vectors(data):
    values = np.asarray(data["vectors"])
    return values[..., 0] + 1j * values[..., 1]


def _covariance(vectors):
    """Keep all site and Cartesian off-diagonals, including their imaginary parts."""
    modes = vectors.reshape(len(vectors), -1)
    return modes.T @ modes.conj()


def _chain_from_sunny(afm, rotation=None, field=0.0):
    reference = json.loads((DATA / f"sunny-sw0{2 if afm else 1}.json").read_text())
    n = len(reference["spin_vectors"])
    rotation = np.eye(3) if rotation is None else rotation
    spinham = magnopy.SpinHamiltonian(
        cell=reference["lattice"],
        atoms=dict(
            names=[f"Cu{i}" for i in range(n)], species=["Cu"] * n,
            positions=reference["atom_pos_red"], spins=[1.0] * n,
            g_factors=[2.0] * n,
        ),
        convention=magnopy.Convention(
            multiple_counting=True, spin_normalized=False, c22=0.5, c1=1,
        ),
    )
    if afm:
        for translation in [(0, 0, 0), (-1, 0, 0)]:
            spinham.add_22(alpha=0, beta=1, nu=translation, parameter=np.eye(3))
    else:
        spinham.add_22(alpha=0, beta=0, nu=(1, 0, 0), parameter=-np.eye(3))
    if field:
        spinham.add_magnetic_field(B=rotation @ [0, 0, field])
    directions = np.asarray(reference["spin_vectors"]) @ rotation.T
    return spinham, magnopy.LSWT(spinham, directions), reference


def _elliptic_chain():
    spinham = magnopy.examples.cubic_ferro_nn(
        a=3, S=1, J_iso=1, J_21=(0.25, 0, -0.5), dimensions=1,
    )
    return spinham, magnopy.LSWT(spinham, [[0, 0, 1]])


def _assert_native_eigen_equation(lswt, data):
    """Recover inverse-basis columns by projecting Cartesian amplitudes.

    This check uses D(k), not the exporter's formula or its source G rows. It
    catches swapped/conjugated blocks, omitted hole signs, and energy factors.
    """
    metric = np.diag(np.r_[np.ones(lswt.M), -np.ones(lswt.M)])
    for q, energy, d in zip(data["qpoints"], data["energies"], _vectors(data)):
        u = np.einsum("ic,bic->bi", lswt.p, d) / np.sqrt(2 * lswt.spins)
        v = np.einsum("ic,bic->bi", lswt.p.conj(), d) / np.sqrt(2 * lswt.spins)
        columns = np.concatenate([u, v], axis=1).T
        assert_allclose(columns.conj().T @ metric @ columns, np.eye(lswt.M), atol=2e-11)
        assert_allclose(
            2 * metric @ lswt.GDM(q, relative=True, units="meV") @ columns,
            columns * np.asarray(energy), atol=2e-11,
        )
        assert_allclose(np.einsum("ic,bic->bi", lswt.z, d), 0, atol=2e-12)


@pytest.mark.parametrize("afm", [False, True])
def test_full_complex_covariance_matches_sunny_chain(afm):
    # Magnopy 0.6.1's native eigensolver can return nonorthogonal eigenvectors
    # for exactly degenerate AFM branches. A longitudinal field splits them
    # without changing the circular eigenvectors or their summed covariance.
    # We do not repair native modes or introduce another diagonalization.
    field = 0.1 if afm else 0.0
    spinham, lswt, reference = _chain_from_sunny(afm, field=field)
    selected = [7, 13, 24, 27, 48, 73]
    qpoints = np.asarray(reference["qpoints"])[selected]
    data = magnon_data(spinham, lswt, qpoints, relative=True)
    actual = _vectors(data)
    expected = _vectors(reference)[selected]
    # Native Zeeman term is +g mu_B B.S; either branch is shifted by |g mu_B B|.
    shift = 2 * magnopy.si.BOHR_MAGNETON * field / (
        magnopy.si.MILLI * magnopy.si.ELECTRON_VOLT
    )
    shifts = np.array([-shift, shift]) if afm else np.zeros(1)
    assert_allclose(
        np.asarray(data["energies"]) - shifts,
        np.asarray(reference["energies"])[selected], atol=6e-8, rtol=0,
    )
    for ours, sunny in zip(actual, expected):
        # Sunny's small Goldstone regularization accounts for the tolerance.
        assert_allclose(_covariance(ours), _covariance(sunny), atol=3e-8, rtol=0)
    if afm:
        # This is deliberately sensitive to complex cross-site phases, which
        # a summed intensity or a real-only tensor comparison would miss.
        assert abs(_covariance(expected[0])[0, 3].imag) > 0.1
    _assert_native_eigen_equation(lswt, data)


def test_elliptic_anisotropy_has_correct_axis_ratio_and_chirality():
    spinham, lswt = _elliptic_chain()
    qpoints = np.array([[0, 0, 0], [0.125, 0, 0], [0.31, 0, 0]])
    data = magnon_data(spinham, lswt, qpoints, relative=True)
    d = _vectors(data)[:, 0, 0]
    exchange = 2 * (1 - np.cos(2 * np.pi * qpoints[:, 0]))
    # H_onsite = 0.25 Sx^2 - 0.5 Sz^2, S=1. The linear restoring
    # coefficients are exchange+1.5 along x and exchange+1 along y.
    x_stiffness, y_stiffness = exchange + 1.5, exchange + 1.0
    assert_allclose(np.asarray(data["energies"])[:, 0], np.sqrt(x_stiffness * y_stiffness))
    assert_allclose(d[:, 1] / d[:, 0], -1j * np.sqrt(x_stiffness / y_stiffness), atol=2e-12)
    assert_allclose(abs(d[:, 0]) ** 2, 0.5 * np.sqrt(y_stiffness / x_stiffness))
    assert_allclose(abs(d[:, 1]) ** 2, 0.5 * np.sqrt(x_stiffness / y_stiffness))
    _assert_native_eigen_equation(lswt, data)


def test_dmi_preserves_native_momentum_sign_and_cell_gauge():
    spinham = magnopy.SpinHamiltonian(
        cell=np.diag([3.0, 8.0, 8.0]),
        atoms=dict(names=["X"], positions=[[0.3, 0.2, 0.4]], spins=[1.0]),
        convention=magnopy.Convention(
            multiple_counting=True, spin_normalized=False, c22=0.5, c21=1,
        ),
    )
    # H_bond = -S_R.S_(R+1) + 0.2 (S_R x S_(R+1))_z.
    exchange = -np.eye(3)
    exchange[0, 1], exchange[1, 0] = 0.2, -0.2
    spinham.add_22(alpha=0, beta=0, nu=(1, 0, 0), parameter=exchange)
    spinham.add_21(alpha=0, parameter=np.diag([0.0, 0.0, -0.3]))
    lswt = magnopy.LSWT(spinham, [[0, 0, 1]])
    qpoints = np.array([[0.125, 0, 0], [-0.125, 0, 0]])
    data = magnon_data(spinham, lswt, qpoints, relative=True)
    angle = 2 * np.pi * qpoints[:, 0]
    expected = 2 * (1 - np.cos(angle)) + 0.4 * np.sin(angle) + 0.6
    assert_allclose(data["qpoints"], qpoints)
    assert_allclose(np.asarray(data["energies"])[:, 0], expected, atol=2e-12)
    assert expected[0] > expected[1] + 0.5
    _assert_native_eigen_equation(lswt, data)
    # Moving the displayed basis site does not affect cell-periodic modes.
    # Reuse the same native results to exclude arbitrary diagonalizer phases.
    results = [lswt.diagonalize(q, relative=True) for q in qpoints]
    original = magnon_data(spinham, lswt, qpoints, relative=True, modes=results)
    spinham.atoms.positions[0] = [1.7, -0.2, 0.9]
    moved = magnon_data(spinham, lswt, qpoints, relative=True, modes=results)
    assert_allclose(moved["atom_pos_red"], [[1.7, -0.2, 0.9]])
    assert_allclose(_vectors(original), _vectors(moved))


def test_multisite_complex_modes_transform_as_cartesian_vectors():
    axis = np.array([1.0, 2.0, 3.0]) / np.sqrt(14)
    angle = 0.71
    cross = np.array([[0, -axis[2], axis[1]], [axis[2], 0, -axis[0]], [-axis[1], axis[0], 0]])
    rotation = np.eye(3) * np.cos(angle) + (1 - np.cos(angle)) * np.outer(axis, axis) + np.sin(angle) * cross
    original_h, original_l, _ = _chain_from_sunny(True, field=0.1)
    rotated_h, rotated_l, _ = _chain_from_sunny(True, rotation=rotation, field=0.1)
    qpoints = [[0.175, 0, 0], [0.325, 0, 0], [0.675, 0, 0]]
    original = magnon_data(original_h, original_l, qpoints, relative=True)
    rotated = magnon_data(rotated_h, rotated_l, qpoints, relative=True)
    assert_allclose(rotated["energies"], original["energies"], atol=2e-12)
    assert_allclose(rotated["spin_vectors"], np.asarray(original["spin_vectors"]) @ rotation.T, atol=2e-12)
    for actual, expected in zip(_vectors(rotated), _vectors(original) @ rotation.T):
        # The field separates the branches, so compare each full site tensor.
        for a, e in zip(actual, expected):
            assert_allclose(_covariance(a[None]), _covariance(e[None]), atol=2e-11)
    _assert_native_eigen_equation(rotated_l, rotated)


def test_cartesian_k_and_input_length_units_preserve_physical_modes():
    spinham, lswt = _elliptic_chain()
    reduced = np.array([[0.12, 0.21, 0.07], [0.23, -0.13, 0.09]])
    cartesian = reduced @ (2 * np.pi * np.linalg.inv(lswt.cell).T)
    native = [lswt.diagonalize(q, relative=True, units="meV") for q in reduced]
    fractional = magnon_data(spinham, lswt, reduced, relative=True, modes=native)
    absolute = magnon_data(spinham, lswt, cartesian, modes=native, length_to_angstrom=10)
    assert_allclose(absolute["qpoints"], reduced, atol=2e-16)
    assert_allclose(absolute["lattice"], np.asarray(fractional["lattice"]) * 10)
    assert_allclose(absolute["energies"], fractional["energies"])
    assert_allclose(_vectors(absolute), _vectors(fractional))


@pytest.mark.parametrize("example_name,point_count", [
    ("magnopy-cubic-ferromagnet", 61),
    ("magnopy-cubic-elliptic", 61),
    ("magnopy-antiferromagnetic-chain", 41),
])
def test_every_example_point_preserves_native_modes(example_name, point_count):
    models_path = Path(__file__).resolve().parents[1] / "examples" / "models.py"
    model = runpy.run_path(str(models_path))["example_models"]()[example_name]
    lswt = model["lswt"]
    qpoints = model["qpoints"]
    assert len(qpoints) == point_count
    modes = [lswt.diagonalize(q, relative=True, units="meV") for q in qpoints]
    exported = magnon_data(
        model["spinham"], lswt, qpoints, relative=True, modes=modes,
    )
    assert_allclose(
        exported["energies"],
        [np.sort(omega.real) for omega, _, _ in modes], rtol=0, atol=0,
    )
    # Inverse columns are recovered from the saved Cartesian amplitudes. Their
    # native eigen-equation verifies that every amplitude is paired with the
    # correct exported energy, rather than checking a dispersion alone.
    _assert_native_eigen_equation(lswt, exported)
