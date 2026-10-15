import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { modeDisplayScale, parseMagnonJson, spinAtPhase } from '../src/magnonjson.js';

function near(actual, expected, tolerance = 1e-12) {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < tolerance,
    `component ${i}: ${value} != ${expected[i]}`));
}

function dataset(overrides = {}) {
  return {
    format: 'magnonwebsite', version: 1,
    units: { length: 'angstrom', energy: 'meV', spin: 'hbar' },
    phase_convention: 'cell-periodic', time_convention: 'exp(-iwt)',
    lattice: [[2, 0, 0], [0, 2, 0], [0, 0, 2]],
    atom_types: ['Fe'], atom_pos_red: [[0, 0, 0]],
    magnetic_atom_indices: [0], spin_vectors: [[0, 0, 2]],
    qpoints: [[0.25, 0, 0]], energies: [[1]],
    vectors: [[[[[1, 0], [0, -1], [0, 0]]]]],
    ...overrides,
  };
}

describe('Magnon physical conventions', () => {
  it('gives the correct precession handedness and propagation for a +z spin', () => {
    // <S,S|S|S,S-1> is proportional to (1,-i,0). With exp(-iwt),
    // a fluctuation initially along +x moves towards -y. A +1/4-RLU
    // translation instead advances its spatial phase towards +y.
    const data = dataset();
    near(spinAtPhase(data, 0, 0, 0, [0, 0, 0], 0, 0.2), [0.2, 0, 2]);
    near(spinAtPhase(data, 0, 0, 0, [0, 0, 0], Math.PI / 2, 0.2), [0, -0.2, 2]);
    near(spinAtPhase(data, 0, 0, 0, [1, 0, 0], 0, 0.2), [0, 0.2, 2]);
    near(spinAtPhase(data, 0, 0, 0, [1, 0, 0], Math.PI / 2, 0.2), [0.2, 0, 2]);
  });

  it('treats an overall eigenvector phase as a shift of the playback origin', () => {
    const data = dataset();
    const shifted = structuredClone(data);
    const chi = 0.713;
    shifted.vectors[0][0][0] = data.vectors[0][0][0].map(([re, im]) => [
      re * Math.cos(chi) - im * Math.sin(chi),
      re * Math.sin(chi) + im * Math.cos(chi),
    ]);
    near(
      spinAtPhase(shifted, 0, 0, 0, [3, 0, 0], 1.2 + chi, 0.1),
      spinAtPhase(data, 0, 0, 0, [3, 0, 0], 1.2, 0.1),
    );
  });

  it('does not add an extra atomic basis phase to cell-periodic eigenvectors', () => {
    const polarization = [[1, 0], [0, -1], [0, 0]];
    const data = dataset({
      atom_types: ['Fe', 'Fe'], atom_pos_red: [[0.1, 0, 0], [0.9, 0, 0]],
      magnetic_atom_indices: [0, 1], spin_vectors: [[0, 0, 2], [0, 0, 2]],
      vectors: [[[polarization, polarization]]],
    });
    near(
      spinAtPhase(data, 0, 0, 0, [2, 0, 0], 0.4),
      spinAtPhase(data, 0, 0, 1, [2, 0, 0], 0.4),
    );
  });

  it('uses the reciprocal metric of a skew cell, including 2pi', () => {
    const mode = dataset().vectors[0];
    const data = parseMagnonJson(dataset({
      lattice: [[2, 0, 0], [1, 2, 0], [0, 0, 3]],
      atom_pos_red: [[0.25, 0.5, 0.75]],
      qpoints: [[0, 0, 0], [1, 0, 0], [1, 1, 0]],
      energies: [[1], [1], [1]], vectors: [mode, mode, mode],
    }));
    // The reciprocal vectors are 2pi*(1/2,-1/4,0),
    // 2pi*(0,1/2,0), and 2pi*(0,0,1/3).
    near(data.atom_pos_car[0], [1, 1, 2.25]);
    near(data.plot.distances, [0, Math.PI * Math.sqrt(5) / 2, Math.PI * (Math.sqrt(5) / 2 + 1)]);
  });

  it('preserves relative site amplitudes and longitudinal SU(N) motion', () => {
    const data = dataset({
      spin_vectors: [[0, 0, 1], [0, 0, 2]],
      vectors: [[[
        [[1, 0], [0, 0], [0.5, 0]],
        [[2, 0], [0, 0], [-0.5, 0]],
      ]]],
    });
    const amplitude = 0.2 * modeDisplayScale(data, 0, 0);
    const first = spinAtPhase(data, 0, 0, 0, [0, 0, 0], 0, amplitude);
    const second = spinAtPhase(data, 0, 0, 1, [0, 0, 0], 0, amplitude);
    assert.ok(Math.abs(second[0] / first[0] - 2) < 1e-12);
    assert.ok(first[2] > 1);
    assert.ok(second[2] < 2);
  });

  it('leaves an exactly dipole-dark mode stationary instead of inventing arrows', () => {
    // A pure spin-1 |+1> -> |-1> single-ion quadrupolar transition has
    // nonzero excitation energy but all three spin matrix elements vanish.
    const data = dataset({ vectors: [[[[[0, 0], [0, 0], [0, 0]]]]], energies: [[0.5]] });
    assert.equal(modeDisplayScale(data, 0, 0), 0);
    for (const phase of [0, 0.7, Math.PI, 2 * Math.PI]) {
      near(spinAtPhase(data, 0, 0, 0, [4, 0, 0], phase, modeDisplayScale(data, 0, 0)), [0, 0, 2]);
    }
  });
});
