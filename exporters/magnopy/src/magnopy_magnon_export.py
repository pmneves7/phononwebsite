"""Translate Magnopy's native modes to Cartesian spin amplitudes and viewer JSON."""

import json
from pathlib import Path

import magnopy
import numpy as np

__version__ = "0.1.0"
__all__ = ["export_magnons", "magnon_data"]


def _array(value, shape, name, *, complex_values=False):
    raw = np.asarray(value)
    if not complex_values and np.iscomplexobj(raw):
        raise ValueError(f"{name} must be real.")
    result = np.asarray(value, dtype=complex if complex_values else float)
    if result.shape != shape or not np.all(np.isfinite(result)):
        raise ValueError(f"{name} must have shape {shape} and contain finite numbers.")
    return result


def _integers(value, shape, name):
    result = _array(value, shape, name)
    if not np.all(result == np.floor(result)):
        raise ValueError(f"{name} must contain integers.")
    return result.astype(int)


def magnon_data(
    spinham, lswt, qpoints, *, relative=False, modes=None,
    name="Magnopy magnons", repetitions=(2, 2, 2), atom_types=None,
    highsym_qpts=None, line_breaks=None, length_to_angstrom=1.0, metadata=None,
):
    """Return magnonwebsite v1 data without changing the supplied calculation.

    ``qpoints`` is (Q, 3); as in Magnopy, Cartesian reciprocal coordinates are
    the default. Use ``relative=True`` for reciprocal lattice units of lswt.cell.
    ``modes`` optionally supplies one native ``(omega, delta, G)`` result per q,
    evaluated with the same q convention and ``units="meV"``. Without it, only
    Magnopy's own ``LSWT.diagonalize`` is called. No Hamiltonian is constructed,
    minimized, converted or diagonalized by this module.

    Magnopy does not retain atomic positions in LSWT. Pass the matching spinham
    for structure and magnetic-site ordering, without modifying it after LSWT
    construction. Cell lengths default to angstroms; length_to_angstrom scales
    another input length unit. Mode amplitudes are spins, without g factors.
    """
    if magnopy.__version__.split(".")[:2] != ["0", "6"]:
        raise ValueError("This exporter supports Magnopy 0.6.x (tested with 0.6.1).")
    if not isinstance(spinham, magnopy.SpinHamiltonian) or not isinstance(lswt, magnopy.LSWT):
        raise TypeError("Pass a Magnopy SpinHamiltonian and its matching LSWT instance.")
    if not isinstance(relative, (bool, np.bool_)):
        raise ValueError("relative must be True or False.")
    length_scale = float(length_to_angstrom)
    if not np.isfinite(length_scale) or length_scale <= 0:
        raise ValueError("length_to_angstrom must be positive and finite.")
    cell = _array(lswt.cell, (3, 3), "lswt.cell")
    lattice = cell * length_scale
    if abs(np.linalg.det(lattice)) <= 1e-12:
        raise ValueError("The lattice vectors must be independent.")
    if not np.allclose(cell, _array(spinham.cell, (3, 3), "spinham.cell"), rtol=0, atol=1e-12):
        raise ValueError("spinham and lswt must describe the same magnetic cell.")

    natoms, nspins = len(spinham.atoms.positions), lswt.M
    if not 0 < natoms <= 2000 or not 0 < nspins <= natoms:
        raise ValueError("Provide 1–2000 atoms and at least one magnetic site.")
    positions = _array(spinham.atoms.positions, (natoms, 3), "atomic positions")
    indices = _integers(spinham.map_to_all, (nspins,), "magnetic atom indices")
    if len(set(indices)) != nspins or np.any(indices < 0) or np.any(indices >= natoms):
        raise ValueError("Magnetic atom indices must be unique valid atom indices.")
    spins = _array(lswt.spins, (nspins,), "spin lengths")
    if np.any(spins <= 0) or not np.allclose(
        spins, _array(spinham.magnetic_atoms.spins, (nspins,), "spinham spin lengths"),
        rtol=0, atol=1e-12,
    ):
        raise ValueError("spinham and lswt must have the same positive spin lengths and site order.")
    z = _array(lswt.z, (nspins, 3), "local spin directions")
    p = _array(lswt.p, (nspins, 3), "local transverse frames", complex_values=True)
    if not np.allclose(np.linalg.norm(z, axis=1), 1, atol=1e-8):
        raise ValueError("Local spin directions must be unit vectors.")
    # Use explicit species only; arbitrary model names such as 'site1' are not
    # chemical elements. Keep fractional positions unwrapped to preserve gauge.
    species = atom_types if atom_types is not None else spinham.atoms.get("species", ["X"] * natoms)
    if isinstance(species, (str, bytes)):
        raise ValueError("atom_types must be a sequence of element labels, not a string.")
    species = list(species)
    if len(species) != natoms or any(not isinstance(s, str) or not 0 < len(s) <= 40 for s in species):
        raise ValueError("atom_types must supply one nonempty element label per atom.")

    nq = len(qpoints)
    if nq < 1 or nq * nspins * nspins > 2_000_000:
        raise ValueError("Provide a nonempty path with at most two million site-mode entries.")
    native_q = _array(qpoints, (nq, 3), "qpoints")
    # row lattice A: q_fractional = k_cartesian A^T / (2π).
    q = native_q.copy() if relative else native_q @ cell.T / (2 * np.pi)
    repetitions = _integers(repetitions, (3,), "repetitions")
    if np.any(repetitions < 1) or np.any(repetitions > 50):
        raise ValueError("repetitions must be integers from 1 to 50.")
    segments = [[0, nq]] if line_breaks is None else line_breaks
    segments = _integers(segments, (len(segments), 2), "line_breaks")
    end = 0
    for start, stop in segments:
        if start != end or stop <= start or stop > nq:
            raise ValueError("line_breaks must partition the path into consecutive [start, end) segments.")
        end = stop
    if end != nq:
        raise ValueError("line_breaks must include every q point.")
    labels = []
    for index, label in ([] if highsym_qpts is None else highsym_qpts):
        index = _integers([index], (1,), "label index")[0]
        if not 0 <= index < nq or not isinstance(label, str) or len(label) > 80:
            raise ValueError("highsym_qpts requires [zero-based q-index, label] pairs.")
        labels.append([int(index), label])

    if modes is not None and len(modes) != nq:
        raise ValueError("modes must contain one diagonalize result per q point.")
    energies, vectors = [], []
    for iq, k in enumerate(native_q):
        result = lswt.diagonalize(k, relative=relative, units="meV") if modes is None else modes[iq]
        if len(result) != 3:
            raise ValueError(f"q point {iq}: expected (omega, delta, G) from Magnopy.diagonalize.")
        omega = _array(result[0], (nspins,), f"q point {iq} energies", complex_values=True)
        if np.any(np.abs(omega.imag) > 1e-8 * np.maximum(1, np.abs(omega.real))) or np.any(omega.real < 0):
            raise ValueError(f"q point {iq}: unstable/complex or negative energies cannot be exported.")
        g = _array(result[2], (nspins, 2 * nspins), f"q point {iq} transformation G", complex_values=True)
        metric = np.r_[np.ones(nspins), -np.ones(nspins)]
        if not np.allclose((g * metric) @ g.conj().T, np.eye(nspins), rtol=0, atol=1e-5):
            raise ValueError(f"q point {iq}: G does not have unit positive bosonic norm; check the native modes.")
        order = np.argsort(omega.real, kind="stable")
        # Magnopy returns rows b = G (a, a†), not columns of the inverse.
        # [a_i, b_n†] = conj(G_ni); [a_i†, b_n†] = -conj(G_n,M+i).
        # Applying these to S_i = sqrt(S/2) (p* a_i + p a_i†) is only
        # representation conversion. Magnopy provides the full eigensystem.
        d = np.sqrt(spins / 2)[None, :, None] * (
            p.conj()[None, :, :] * g[:, :nspins].conj()[:, :, None]
            - p[None, :, :] * g[:, nspins:].conj()[:, :, None]
        )
        if not np.all(np.isfinite(d)):
            raise ValueError(f"q point {iq}: nonfinite Cartesian mode amplitudes.")
        energies.append(omega.real[order].tolist())
        vectors.append(np.stack((d[order].real, d[order].imag), axis=-1).tolist())

    provenance = dict(metadata or {})
    provenance.update({
        "producer": "Magnopy", "producer_version": magnopy.__version__,
        "exporter": "phononwebsite-magnopy", "exporter_version": __version__,
        "normalization": "<0|S_i|one magnon>, hbar; unit positive bosonic norm; no g factors",
        "input_qpoints": native_q.tolist(),
        "input_qpoint_units": "magnetic-cell rlu" if relative else "radians / input length unit",
        "input_lattice": cell.tolist(), "length_to_angstrom": length_scale,
        "mode_source": "precomputed diagonalize results" if modes is not None else "Magnopy.LSWT.diagonalize",
        "q_conversion": "q_export = q_input" if relative else "q_export = k_input @ cell.T / (2*pi)",
    })
    data = {
        "format": "magnonwebsite", "version": 1, "name": str(name),
        "units": {"length": "angstrom", "energy": "meV", "spin": "hbar"},
        "phase_convention": "cell-periodic", "time_convention": "exp(-iwt)",
        "lattice": lattice.tolist(), "atom_types": species,
        "atom_pos_red": positions.tolist(), "magnetic_atom_indices": indices.tolist(),
        "spin_vectors": (spins[:, None] * z).tolist(), "qpoints": q.tolist(),
        "energies": energies, "vectors": vectors, "repetitions": repetitions.tolist(),
        "highsym_qpts": labels, "line_breaks": segments.tolist(), "metadata": provenance,
    }
    # Reject invalid user metadata before any output file is opened.
    json.dumps(data, allow_nan=False)
    return data


def export_magnons(filename, spinham, lswt, qpoints, **kwargs):
    """Write viewer JSON and return its Path. See magnon_data for options."""
    data = magnon_data(spinham, lswt, qpoints, **kwargs)
    path = Path(filename)
    path.write_text(json.dumps(data, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n", encoding="utf-8")
    return path
