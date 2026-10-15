import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { parseMagnonJson } from '../src/magnonjson.js';
import { MagnonHighcharts } from '../src/magnonhighcharts.js';

function fixture() {
    return {
        format: 'magnonwebsite', version: 1, name: 'One magnetic ion and a ligand',
        units: { length: 'angstrom', energy: 'meV', spin: 'hbar' },
        phase_convention: 'cell-periodic', time_convention: 'exp(-iwt)',
        lattice: [[3, 0, 0], [0, 4, 0], [0, 0, 5]],
        atom_types: ['Fe', 'O'], atom_pos_red: [[0, 0, 0], [0.5, 0.5, 0.5]],
        magnetic_atom_indices: [0], spin_vectors: [[0, 0, 1]],
        qpoints: [[0, 0, 0], [0.5, 0, 0]], energies: [[0], [4]],
        vectors: [[[[[1, 0], [0, -1], [0, 0]]]], [[[[1, 0], [0, -1], [0, 0]]]]],
        highsym_qpts: [[0, 'Γ'], [1, 'X']],
    };
}

describe('Magnon JSON data contract', () => {
    it('loads a magnetic subset without requiring 3N bands or vectors for ligands', () => {
        const data = parseMagnonJson(fixture());
        assert.equal(data.nbands, 1);
        assert.deepEqual(data.atom_pos_car[1], [1.5, 2, 2.5]);
        assert.deepEqual(data.atom_numbers, [26, 8]);
        assert.ok(Math.abs(data.plot.distances[1] - Math.PI / 3) < 1e-12);
        assert.equal(data.plot.highsym_qpts[data.plot.distances[1]], 'X');
    });

    it('preserves extra SU(N) bands including zero dipole projections', () => {
        const raw = fixture();
        raw.energies = [[0.5, 2.25], [0.5, 2.25]];
        raw.vectors = raw.vectors.map((modes) => [[[[0, 0], [0, 0], [0, 0]]], ...modes]);
        assert.equal(parseMagnonJson(raw).nbands, 2);
    });

    it('rejects conventions and malformed shapes instead of guessing', () => {
        for (const mutate of [
            (x) => { x.version = 2; },
            (x) => { x.units.energy = 'K'; },
            (x) => { x.phase_convention = 'position-inclusive'; },
            (x) => { x.time_convention = 'exp(+iwt)'; },
            (x) => { x.lattice[1] = x.lattice[0]; },
            (x) => { x.magnetic_atom_indices = [1, 1]; },
            (x) => { x.vectors[0][0][0][0] = 2; },
            (x) => { x.energies[0][0] = -1; },
            (x) => { x.energies[0][0] = null; },
            (x) => { x.qpoints[0][0] = Infinity; },
            (x) => { x.atom_types = 'Fe'; },
            (x) => { x.repetitions = [0, 1, 1]; },
            (x) => { x.line_breaks = [[0, 1]]; },
            (x) => { x.metadata = { input_qpoints: [[0, 0, 0]] }; },
        ]) {
            const raw = fixture();
            mutate(raw);
            assert.throws(() => parseMagnonJson(raw), /^Error: Magnon file:/);
        }
    });

    it('does not connect a disconnected path and keeps its boundary labels', () => {
        const raw = fixture();
        raw.line_breaks = [[0, 1], [1, 2]];
        const data = parseMagnonJson(raw);
        assert.deepEqual(data.plot.distances, [0, 0]);
        assert.equal(data.plot.highsym_qpts[0], 'Γ|X');
        const chart = new MagnonHighcharts(null);
        chart.getGraph(data.plot);
        assert.equal(chart.highcharts.length, 2);
        assert.equal(chart.highcharts[1].data[0].kIndex, 1);
    });

    it('parses every committed solver-generated example and its manifest entry', () => {
        const root = path.resolve('data/magnons');
        const manifest = JSON.parse(fs.readFileSync(path.join(root, 'models.json'), 'utf8'));
        assert.ok(manifest.length >= 5, 'include the requested Sunny examples');
        for (const entry of manifest) assert.ok(fs.existsSync(entry.file), `Missing ${entry.file}`);
        for (const file of fs.readdirSync(root).filter((f) => f.endsWith('.json') && f !== 'models.json')) {
            const data = parseMagnonJson(JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')));
            assert.ok(data.nq > 1, file);
            assert.ok(data.metadata?.producer, `${file}: provenance`);
            assert.ok(data.metadata?.input_qpoints, `${file}: native q coordinates`);
        }
    });
});
