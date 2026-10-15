import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MagnonHighcharts, magnonAtomTypeWeights } from '../src/magnonhighcharts.js';
import { parseMagnonJson } from '../src/magnonjson.js';

function fixture() {
    const bright = [
        [[3, 4], [0, 0], [0, 0]],
        [[0, 2], [0, 0], [0, 0]],
        [[0, 0], [1, 0], [0, 0]],
    ];
    const dark = bright.map(() => [[0, 0], [0, 0], [0, 0]]);
    return parseMagnonJson({
        format: 'magnonwebsite', version: 1,
        units: { length: 'angstrom', energy: 'meV', spin: 'hbar' },
        phase_convention: 'cell-periodic', time_convention: 'exp(-iwt)',
        lattice: [[4, 0, 0], [0, 4, 0], [0, 0, 4]],
        atom_types: ['Fe', 'O', 'Co', 'Fe'],
        atom_pos_red: [[0, 0, 0], [0.2, 0, 0], [0.5, 0, 0], [0.7, 0, 0]],
        magnetic_atom_indices: [2, 0, 3],
        spin_vectors: [[0, 0, 1], [0, 0, 10], [0, 0, -1]],
        qpoints: [[0, 0, 0], [0.5, 0, 0]], energies: [[1, 2], [2, 3]],
        vectors: [[bright, dark], [bright, dark]],
    });
}

describe('Magnon mode weights', () => {
    it('groups mapped magnetic sites by element, with complex norms and no ligand or equilibrium-spin contribution', () => {
        const weights = magnonAtomTypeWeights(fixture());
        assert.deepEqual(weights.atomNumbers, [27, 26]);
        assert.deepEqual(weights.weights[0][0], [5 / 6, 1 / 6]);
        assert.deepEqual(weights.weights[0][1], [0, 0]);
    });

    it('preserves relative weights under a global complex phase and very large or small mode scales', () => {
        for (const scale of [1e-250, 1e250]) {
            const data = fixture();
            data.vectors = data.vectors.map((bands) => bands.map((sites) => sites.map((axes) => axes.map(([re, im]) => [-scale * im, scale * re]))));
            const weights = magnonAtomTypeWeights(data).weights;
            assert.ok(Math.abs(weights[0][0][0] - 5 / 6) < 1e-15);
            assert.ok(Math.abs(weights[0][0][1] - 1 / 6) < 1e-15);
            assert.deepEqual(weights[0][1], [0, 0]);
        }
    });

    it('reuses species color mixing and leaves SU(N) dark branches visible without colored weight overlays', () => {
        const data = fixture();
        const chart = new MagnonHighcharts(null);
        chart.setMagnonData(data);
        chart.setModeWeightsOptions({ enabled: true, getAtomColorHex: (number) => number === 27 ? 0xff0000 : 0x0000ff });
        chart.atomTypeLegend = chart.getAtomTypeLegend(data.plot);
        chart.syncLegendVisibility();
        chart.getGraph(data.plot);
        const overlays = chart.highcharts.filter((series) => series.isWeightSeries);
        assert.equal(overlays.length, 1);
        assert.equal(overlays[0].bandIndex, 0);
        assert.equal(overlays[0].color, '#d5002b');
        assert.ok(chart.highcharts.some((series) => series.bandIndex === 1 && !series.isWeightSeries));
        assert.equal(chart.highcharts.filter((series) => series.isLegendSeries).length, 2);
    });

    it('supports a single magnetic element with default colors and no divide by zero for a dark mode', () => {
        const data = fixture();
        data.atom_numbers = [26, 8, 26, 26];
        const chart = new MagnonHighcharts(null);
        chart.setMagnonData(data);
        chart.setModeWeightsOptions({ enabled: true });
        chart.atomTypeLegend = chart.getAtomTypeLegend(data.plot);
        chart.syncLegendVisibility();
        chart.getGraph(data.plot);
        const overlay = chart.highcharts.find((series) => series.isWeightSeries);
        assert.equal(overlay.color, '#0066ff');
        assert.equal(overlay.lineWidth, chart.weightLineWidthMin + chart.weightLineWidthScale);
        assert.deepEqual(chart.ensureAtomTypeWeights(data.plot).weights[0][1], [0]);
    });

    it('replaces the weight cache with the dataset and ignores unrelated plot objects', () => {
        const chart = new MagnonHighcharts(null);
        const first = fixture();
        chart.setMagnonData(first);
        const previous = chart.ensureAtomTypeWeights(first.plot);
        assert.equal(chart.ensureAtomTypeWeights(first.plot), previous);
        const next = fixture();
        next.atom_numbers[2] = 28;
        chart.setMagnonData(next);
        assert.deepEqual(chart.ensureAtomTypeWeights(next.plot).atomNumbers, [28, 26]);
        assert.notEqual(chart.ensureAtomTypeWeights(next.plot), previous);
        assert.deepEqual(chart.ensureAtomTypeWeights(first.plot), { atomNumbers: [], weights: [] });
    });

    it('can refresh atom colors with every species hidden in the legend', () => {
        const data = fixture();
        const chart = new MagnonHighcharts(null);
        chart.setMagnonData(data);
        chart.setModeWeightsOptions({ enabled: true });
        chart.phonon = data.plot;
        chart.atomTypeLegend = chart.getAtomTypeLegend(data.plot);
        chart.legendVisibility = { 26: false, 27: false };
        const series = { options: { isWeightSeries: true, avgWeights: [5 / 6, 1 / 6] } };
        chart.chart = { series: [series] };
        chart.refreshWeightedSeriesColors();
        chart.updateWeightedSeriesStyles();
        assert.equal(series.visible, false);
        assert.match(series.color, /^#[0-9a-f]{6}$/);
    });
});
