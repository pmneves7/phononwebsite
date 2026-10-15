"""I/O, coordinate, and failure checks using actual Magnopy calculations."""

import json

import magnopy
import numpy as np
import pytest
from numpy.testing import assert_allclose

from magnopy_magnon_export import export_magnons, magnon_data


@pytest.fixture
def model():
    spinham = magnopy.examples.cubic_ferro_nn(S=1, J_21=(0, 0, -0.5))
    return spinham, magnopy.LSWT(spinham, [[0, 0, 1]])


def test_precomputed_export_never_calls_solver(model, monkeypatch, tmp_path):
    spinham, lswt = model
    q = [[0.23, 0, 0]]
    modes = [lswt.diagonalize(q[0], relative=True, units="meV")]
    expected = magnon_data(spinham, lswt, q, relative=True)
    def forbidden(*args, **kwargs):
        pytest.fail("precomputed export must not diagonalize")
    monkeypatch.setattr(lswt, "diagonalize", forbidden)
    path = export_magnons(tmp_path / "modes.json", spinham, lswt, q,
                          relative=True, modes=modes, name="A magnetic model")
    data = json.loads(path.read_text())
    assert np.asarray(data["vectors"]).shape == (1, 1, 1, 3, 2)
    assert np.asarray(data["energies"]).shape == (1, 1)
    assert data["vectors"] == expected["vectors"]
    assert data["energies"] == expected["energies"]
    assert data["metadata"]["mode_source"] == "precomputed diagonalize results"


def test_cartesian_q_length_units_and_nonmagnetic_mapping():
    # Skew cell in nm, unwrapped magnetic position, and a ligand before the spin.
    spinham = magnopy.SpinHamiltonian(
        cell=[[0.3, 0, 0], [0.1, 0.4, 0], [0, 0, 0.5]],
        atoms=dict(names=["ligand", "model"], species=["O", "Fe"], spins=[0, 1],
                   positions=[[0.2, 0.3, 0.4], [1.2, -0.1, 0.3]], g_factors=[2, 7]),
        convention=magnopy.Convention(spin_normalized=False, multiple_counting=True, c21=1),
    )
    spinham.add_21(alpha=1, parameter=np.diag([0, 0, -0.5]))
    lswt = magnopy.LSWT(spinham, [[0, 0, 1]])
    q = np.array([[0.2, 0.3, -0.1]])
    k = 2 * np.pi * q @ np.linalg.inv(spinham.cell).T
    data = magnon_data(spinham, lswt, k, length_to_angstrom=10)
    fractional = magnon_data(spinham, lswt, q, relative=True, length_to_angstrom=10)
    assert_allclose(data["qpoints"], q)
    assert_allclose(data["lattice"], spinham.cell * 10)
    assert data["atom_pos_red"] == spinham.atoms.positions
    assert data["magnetic_atom_indices"] == [1]
    assert data["atom_types"] == ["O", "Fe"]
    assert_allclose(data["spin_vectors"], [[0, 0, 1]])  # no g-factor scaling
    assert_allclose(data["vectors"], fractional["vectors"])
    assert_allclose(data["energies"], fractional["energies"])


def test_paths_labels_and_provenance(model):
    spinham, lswt = model
    data = magnon_data(spinham, lswt, [[0, 0, 0], [0.2, 0, 0], [0.8, 0, 0]],
                       relative=True, line_breaks=[[0, 2], [2, 3]],
                       highsym_qpts=[[0, "Γ"], [2, "X"]], atom_types=["Cu"],
                       metadata={"source_url": "https://example.org/model", "producer": "wrong"})
    assert data["line_breaks"] == [[0, 2], [2, 3]]
    assert data["highsym_qpts"] == [[0, "Γ"], [2, "X"]]
    assert data["metadata"]["producer"] == "Magnopy"
    assert data["metadata"]["source_url"] == "https://example.org/model"
    assert data["atom_types"] == ["Cu"]


@pytest.mark.parametrize("options", [
    {"repetitions": [1, 0, 1]}, {"repetitions": [1.5, 1, 1]},
    {"relative": "True"}, {"length_to_angstrom": 0}, {"length_to_angstrom": np.nan},
    {"atom_types": []}, {"atom_types": "X"}, {"line_breaks": [[1, 2]]}, {"line_breaks": []},
    {"highsym_qpts": [[2, "X"]]}, {"highsym_qpts": [[0.5, "X"]]},
    {"modes": []}, {"metadata": {"bad": float("nan")}},
])
def test_rejects_invalid_options(model, options):
    with pytest.raises((ValueError, TypeError)):
        magnon_data(*model, [[0.2, 0, 0]], **options)


@pytest.mark.parametrize("q", [[], [[0, 0]], [[np.nan, 0, 0]], [[1j, 0, 0]]])
def test_rejects_bad_qpoints(model, q):
    with pytest.raises(ValueError):
        magnon_data(*model, q)


@pytest.mark.parametrize("energy,g", [
    ([-1], [[1, 0]]), ([1 + 1j], [[1, 0]]), ([np.nan], [[1, 0]]),
    ([1], [[np.inf, 0]]), ([1], [[0, 1]]), ([1], [[2, 0]]), ([1], [[1]]),
])
def test_rejects_invalid_modes_before_writing(model, tmp_path, energy, g):
    filename = tmp_path / "existing.json"
    filename.write_text("keep")
    with pytest.raises(ValueError):
        export_magnons(filename, *model, [[0, 0, 0]], modes=[(energy, 0, g)])
    assert filename.read_text() == "keep"


def test_rejects_mismatched_structure(model):
    spinham, lswt = model
    other = magnopy.examples.cubic_ferro_nn(a=2, S=1)
    with pytest.raises(ValueError, match="same magnetic cell"):
        magnon_data(other, lswt, [[0, 0, 0]])
    other = magnopy.examples.cubic_ferro_nn(S=2)
    with pytest.raises(ValueError, match="same positive spin lengths"):
        magnon_data(other, lswt, [[0, 0, 0]])
