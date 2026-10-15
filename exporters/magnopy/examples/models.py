"""Small native Magnopy models for the exporter examples and validation.

The cubic model follows Magnopy's LSWT introduction; the antiferromagnetic
chain follows exercise 2 of its master tutorial. The elliptic model is an
explicit variation of the cubic example. Lattice spacings are chosen in
angstrom for legible display; interactions and reduced-q dispersions do not
depend on this illustrative spacing. These are model systems, not DFT results.

All mode calculations remain in Magnopy. No spin-wave solver is defined here.
"""

import magnopy
import numpy as np


CUBIC_SOURCE = (
    "https://tutorials.magnopy.org/en/latest/master-tutorial/"
    "1_python-library/plot_8_lswt.html"
)
AFM_SOURCE = (
    "https://tutorials.magnopy.org/en/latest/master-tutorial/"
    "3_exercises/plot_8_lswt.html#exercise-2"
)


def _path(vertices, labels, intervals=20):
    """Sample a connected path in reduced magnetic-cell coordinates."""
    points = np.concatenate(
        [np.linspace(a, b, intervals, endpoint=False)
         for a, b in zip(vertices[:-1], vertices[1:])]
        + [np.asarray(vertices[-1], dtype=float)[None, :]]
    )
    return points, [[i * intervals, label] for i, label in enumerate(labels)]


def cubic_ferromagnet(elliptic=False):
    """Native cubic S=1 example, optionally with unequal transverse anisotropy."""
    anisotropy = (0.25, 0, -0.5) if elliptic else (0, 0, -0.5)
    spinham = magnopy.examples.cubic_ferro_nn(a=3, S=1, J_21=anisotropy)
    lswt = magnopy.LSWT(spinham, spin_directions=[[0, 0, 1]])
    qpoints, labels = _path(
        [[0, 0, 0], [0.5, 0, 0], [0.5, 0.5, 0], [0.5, 0.5, 0.5]],
        ["Γ", "X", "M", "R"],
    )
    return dict(
        spinham=spinham, lswt=lswt, qpoints=qpoints,
        name="Magnopy · cubic ferromagnet" + (" (elliptic)" if elliptic else ""),
        repetitions=(3, 3, 3), highsym_qpts=labels,
        # The upstream helper deliberately calls its hypothetical atom X.
        atom_types=["Fe"], source_url=CUBIC_SOURCE,
        notes=("Toy S=1 magnetic site displayed as Fe; a=3 Å. "
               + ("Variation: onsite diagonal anisotropy (0.25, 0, -0.5) meV."
                  if elliptic else "Tutorial onsite anisotropy (0, 0, -0.5) meV.")),
    )


def antiferromagnetic_chain():
    """Two-site easy-axis AFM chain in the tutorial's 1 T longitudinal field."""
    spinham = magnopy.SpinHamiltonian(
        cell=np.diag([6.0, 8.0, 8.0]),
        atoms=dict(
            names=["Fe1", "Fe2"], species=["Fe", "Fe"],
            positions=[[0.25, 0.5, 0.5], [0.75, 0.5, 0.5]],
            spins=[1.0, 1.0], g_factors=[2.0, 2.0], spglib_types=[1, 2],
        ),
        convention=magnopy.Convention(
            multiple_counting=True, spin_normalized=False, c21=1, c22=1,
        ),
    )
    for translation in [(0, 0, 0), (-1, 0, 0)]:
        spinham.add(
            nus=(translation,), alphas=(0, 1), parameter=np.eye(3),
            populate_equivalent=True,
        )
    for atom in (0, 1):
        spinham.add(
            nus=((0, 0, 0),), alphas=(atom, atom),
            parameter=np.diag([0.0, 0.0, -0.1]),
        )
    spinham.add_magnetic_field(B=(0, 0, 1))
    lswt = magnopy.LSWT(spinham, spin_directions=[[0, 0, 1], [0, 0, -1]])
    qpoints, labels = _path([[0, 0, 0], [0.5, 0, 0], [1, 0, 0]], ["Γ", "X", "Γ"])
    return dict(
        spinham=spinham, lswt=lswt, qpoints=qpoints,
        name="Magnopy · antiferromagnetic chain", repetitions=(4, 1, 1),
        highsym_qpts=labels, atom_types=["Fe", "Fe"], source_url=AFM_SOURCE,
        notes=("Master tutorial exercise 2 interactions and spin directions; "
               "illustrative cell (6, 8, 8) Å and Γ-X-Γ chain path."),
    )


def example_models():
    return {
        "magnopy-cubic-ferromagnet": cubic_ferromagnet(),
        "magnopy-cubic-elliptic": cubic_ferromagnet(elliptic=True),
        "magnopy-antiferromagnetic-chain": antiferromagnetic_chain(),
    }
