import { atomic_symbol } from './atomic_data.js';
import * as mat from './mat.js';

function requireValue(condition, message) {
    if (!condition) throw new Error(`Magnon file: ${message}`);
}

function array(value, length, name) {
    requireValue(Array.isArray(value) && value.length === length, `${name} must have ${length} entries.`);
    return value;
}

function numbers(value, length, name) {
    array(value, length, name);
    requireValue(value.every((x) => typeof x === 'number' && Number.isFinite(x)), `${name} must contain finite numbers.`);
    return value;
}

export function fractionalToCartesian(position, lattice) {
    return [0, 1, 2].map((axis) => position.reduce((sum, x, i) => sum + x * lattice[i][axis], 0));
}

export function parseMagnonJson(data) {
    requireValue(data && data.format === 'magnonwebsite' && data.version === 1, 'expected magnonwebsite JSON version 1.');
    requireValue(data.units?.length === 'angstrom' && data.units?.energy === 'meV' && data.units?.spin === 'hbar',
        'units must be angstrom, meV, and hbar.');
    requireValue(data.phase_convention === 'cell-periodic' && data.time_convention === 'exp(-iwt)',
        'unsupported spatial or time phase convention.');
    array(data.lattice, 3, 'lattice').forEach((row) => numbers(row, 3, 'lattice vector'));
    requireValue(Math.abs(mat.matrix_determinant(data.lattice)) > 1e-12, 'lattice vectors must be independent.');
    const natoms = data.atom_types?.length;
    requireValue(Array.isArray(data.atom_types) && natoms > 0 && natoms <= 2000, 'provide between 1 and 2000 atoms.');
    requireValue(data.atom_types.every((s) => typeof s === 'string' && s.length > 0 && s.length <= 40), 'atom_types must contain element names.');
    array(data.atom_pos_red, natoms, 'atom_pos_red').forEach((p) => numbers(p, 3, 'atomic position'));
    const indices = data.magnetic_atom_indices;
    requireValue(Array.isArray(indices) && indices.length > 0, 'magnetic_atom_indices is empty.');
    requireValue(indices.every((i) => Number.isInteger(i) && i >= 0 && i < natoms) && new Set(indices).size === indices.length,
        'magnetic atom indices must be unique, zero-based atom indices.');
    array(data.spin_vectors, indices.length, 'spin_vectors').forEach((s) => numbers(s, 3, 'ordered spin'));
    const nq = data.qpoints?.length;
    requireValue(Array.isArray(data.qpoints) && nq > 0, 'qpoints is empty.');
    data.qpoints.forEach((q) => numbers(q, 3, 'wavevector'));
    const nbands = data.energies?.[0]?.length;
    requireValue(Number.isInteger(nbands) && nbands > 0, 'energies is empty.');
    requireValue(nq * nbands * indices.length <= 2000000, 'dataset is too large; export a shorter path.');
    array(data.energies, nq, 'energies').forEach((row) => {
        numbers(row, nbands, 'energies at a wavevector');
        requireValue(row.every((energy) => energy >= 0), 'energies must be nonnegative physical excitation energies.');
    });
    array(data.vectors, nq, 'vectors').forEach((bands) => {
        array(bands, nbands, 'mode bands').forEach((sites) => {
            array(sites, indices.length, 'mode sites').forEach((axes) => {
                array(axes, 3, 'mode components').forEach((z) => numbers(z, 2, 'complex component [real, imaginary]'));
            });
        });
    });
    const segments = data.line_breaks ?? [[0, nq]];
    requireValue(Array.isArray(segments) && segments.length > 0, 'line_breaks is empty.');
    let previousEnd = 0;
    segments.forEach((segment) => {
        numbers(segment, 2, 'path segment');
        const [start, end] = segment;
        requireValue(Number.isInteger(start) && Number.isInteger(end) && start === previousEnd && end > start && end <= nq,
            'line_breaks must partition qpoints into consecutive [start, end) segments.');
        previousEnd = end;
    });
    requireValue(previousEnd === nq, 'line_breaks must include every wavevector.');
    const reciprocal = mat.matrix_transpose(mat.matrix_inverse(data.lattice));
    const segmentStarts = new Set(segments.map(([start]) => start));
    const distances = data.distances ? numbers(data.distances, nq, 'distances').slice() : [0];
    if (!data.distances) {
        for (let k = 1; k < nq; k++) {
            const delta = data.qpoints[k].map((x, i) => x - data.qpoints[k - 1][i]);
            distances.push(distances[k - 1] + (segmentStarts.has(k) ? 0 : 2 * Math.PI * Math.hypot(...fractionalToCartesian(delta, reciprocal))));
        }
    }
    requireValue(distances.every((x, i) => x >= 0 && (i === 0 || x >= distances[i - 1])), 'distances must be nonnegative and nondecreasing.');
    const labels = {};
    requireValue(Array.isArray(data.highsym_qpts ?? []), 'highsym_qpts must be an array.');
    (data.highsym_qpts ?? []).forEach((entry) => {
        array(entry, 2, 'high-symmetry label');
        const [k, label] = entry;
        requireValue(Number.isInteger(k) && k >= 0 && k < nq && typeof label === 'string' && label.length <= 80,
            'highsym_qpts entries must be [zero-based q-index, label].');
        // Highcharts labels are text; do not treat uploaded labels as markup.
        const text = label.replace(/[<>]/g, '');
        labels[distances[k]] = labels[distances[k]] && labels[distances[k]] !== text
            ? `${labels[distances[k]]}|${text}` : text;
    });
    const repetitions = data.repetitions ?? [1, 1, 1];
    numbers(repetitions, 3, 'repetitions');
    requireValue(repetitions.every((n) => Number.isInteger(n) && n > 0 && n <= 50), 'repetitions must be integers from 1 to 50.');
    if (data.metadata?.input_qpoints !== undefined) {
        array(data.metadata.input_qpoints, nq, 'input_qpoints').forEach((q) => numbers(q, 3, 'input wavevector'));
    }
    return {
        ...data,
        name: typeof data.name === 'string' ? data.name : 'Magnon modes',
        natoms, nq, nbands,
        repetitions,
        atom_numbers: data.atom_types.map((symbol) => Math.max(0, atomic_symbol.indexOf(symbol))),
        atom_pos_car: data.atom_pos_red.map((p) => fractionalToCartesian(p, data.lattice)),
        plot: {
            eigenvalues: data.energies,
            kpoints: data.qpoints,
            distances,
            highsym_qpts: labels,
            line_breaks: segments,
            qindex: Object.fromEntries(distances.map((x, k) => [x, k])),
        },
    };
}

// One common display factor per mode preserves the relative amplitudes of all sites.
export function modeDisplayScale(data, k, band) {
    const maxMode = Math.max(...data.vectors[k][band].map((axes) => Math.sqrt(axes.reduce((s, z) => s + z[0] ** 2 + z[1] ** 2, 0))));
    const maxSpin = Math.max(1, ...data.spin_vectors.map((s) => Math.hypot(...s)));
    return maxMode > 1e-12 ? maxSpin / maxMode : 0;
}

export function spinAtPhase(data, k, band, site, cell, phase, amplitude = 1) {
    const theta = 2 * Math.PI * data.qpoints[k].reduce((s, q, i) => s + q * cell[i], 0) - phase;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    return data.spin_vectors[site].map((value, axis) => {
        const [re, im] = data.vectors[k][band][site][axis];
        return value + amplitude * (re * c - im * s);
    });
}
