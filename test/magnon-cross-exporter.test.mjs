import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';

import { parseMagnonJson } from '../src/magnonjson.js';

function loadFixture(name) {
  return parseMagnonJson(JSON.parse(fs.readFileSync(new URL(`../data/magnons/${name}.json`, import.meta.url), 'utf8')));
}

function close(actual, expected, label, tolerance = 2e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)),
    `${label}: ${actual} != ${expected}`);
}

// For D=[d_1 ... d_n], the dipole spectral covariance is C=D D†.
// tr(C) and tr(C²) are unchanged by a global spin rotation, site permutation,
// per-site phase convention, eigenvector phases, or unitary mixing within a
// degenerate band group. No comparison of arbitrary eigensolver gauges is made.
function spectralInvariants(modes) {
  const columns = modes.map((sites) => sites.flat());
  let trace = 0;
  let squaredTrace = 0;
  for (const column of columns) {
    trace += column.reduce((total, [re, im]) => total + re * re + im * im, 0);
    for (const other of columns) {
      let re = 0;
      let im = 0;
      column.forEach(([a, b], i) => {
        const [c, d] = other[i];
        re += a * c + b * d;
        im += a * d - b * c;
      });
      squaredTrace += re * re + im * im;
    }
  }
  return { trace, squaredTrace };
}

// Full site-by-Cartesian covariance retains relative site phases and chiral
// polarization, while removing arbitrary overall mode phases and degenerate
// basis rotations. SpinW's +y order is rotated to Sunny's +z with Rx(+π/2).
function spectralCovariance(modes, rotate = false) {
  const columns = modes.map((sites) => sites.flatMap(([x, y, z]) =>
    rotate ? [x, z.map((v) => -v), y] : [x, y, z]));
  return columns[0].flatMap((_, i) => columns[0].map((_, j) => {
    let re = 0, im = 0;
    for (const column of columns) {
      const [a, b] = column[i], [c, d] = column[j];
      re += a * c + b * d;
      im += b * c - a * d;
    }
    return [re, im];
  }));
}

describe('Sunny and SpinW chain exports', () => {
  for (const afm of [false, true]) {
    it(`${afm ? 'AFM' : 'FM'} preserves analytic spectra and dipole weights across solver conventions`, () => {
      const sunny = loadFixture(afm ? 'sunny-sw02' : 'sunny-sw01');
      const spinw = loadFixture(afm ? 'spinw-sw02-antiferromagnetic-chain' : 'spinw-sw01-ferromagnetic-chain');
      const nbands = afm ? 2 : 1;
      assert.equal(sunny.nbands, nbands);
      assert.equal(spinw.nbands, nbands);

      // Both fixtures are spin-1, nearest-neighbor chains with |J|=1 meV.
      // Their ground states differ by a spin rotation (+z versus +y). They
      // are inversion symmetric, so opposite native q signs have equal E.
      // This comparison is deliberately not applied to nonreciprocal models.
      let comparisons = 0;
      for (const [sunnyIndex, nativeQ] of sunny.metadata.input_qpoints.entries()) {
        const q = nativeQ[0];
        const expectedEnergy = afm ? 2 * Math.abs(Math.sin(2 * Math.PI * q)) : 2 * (1 - Math.cos(2 * Math.PI * q));
        // At Goldstone points each solver uses a small numerical regulator;
        // eigenvector weights there are divergent and regulator dependent.
        if (expectedEnergy < 1e-4) continue;
        const spinwIndex = spinw.metadata.input_qpoints.findIndex((other) =>
          nativeQ.every((value, axis) => Math.abs(value - other[axis]) < 1e-10));
        if (spinwIndex < 0) continue;
        comparisons++;

        close(sunny.qpoints[sunnyIndex][0], nbands * q, 'Sunny magnetic-cell q', 1e-12);
        close(spinw.qpoints[spinwIndex][0], -nbands * q, 'SpinW magnetic-cell q', 1e-12);
        for (let band = 0; band < nbands; band++) {
          close(sunny.energies[sunnyIndex][band], expectedEnergy, 'Sunny analytic energy');
          close(spinw.energies[spinwIndex][band], expectedEnergy, 'SpinW analytic energy');
          close(sunny.energies[sunnyIndex][band], spinw.energies[spinwIndex][band], 'Cross-solver energy');
        }

        const sunnyWeight = spectralInvariants(sunny.vectors[sunnyIndex]);
        const spinwWeight = spectralInvariants(spinw.vectors[spinwIndex]);
        const perModeWeight = afm ? 1 / Math.abs(Math.sin(2 * Math.PI * q)) : 1;
        for (const [source, value] of [['Sunny', sunnyWeight], ['SpinW', spinwWeight]]) {
          close(value.trace, nbands * perModeWeight, `${source} analytic dipole weight`);
          close(value.squaredTrace, nbands * perModeWeight ** 2, `${source} spectral covariance`);
        }
        close(sunnyWeight.trace, spinwWeight.trace, 'Cross-solver dipole weight');
        close(sunnyWeight.squaredTrace, spinwWeight.squaredTrace, 'Cross-solver spectral covariance');

        // Compare at the SAME canonical momentum, accounting for the native
        // SpinW sign. Cell-periodic modes repeat under integer magnetic-cell
        // reciprocal shifts. No complex conjugation or fitted site phases.
        const sameQ = spinw.qpoints.findIndex((other) =>
          Math.abs((other[0] - sunny.qpoints[sunnyIndex][0]) -
            Math.round(other[0] - sunny.qpoints[sunnyIndex][0])) < 1e-10);
        assert.ok(sameQ >= 0, 'Matching canonical momentum');
        const a = spectralCovariance(sunny.vectors[sunnyIndex]);
        const b = spectralCovariance(spinw.vectors[sameQ], true);
        a.forEach((pair, index) => pair.forEach((value, component) =>
          close(value, b[index][component], 'Full site/Cartesian covariance')));
      }
      assert.ok(comparisons >= 3, 'Need several common nonzero-energy wavevectors');
    });
  }
});
