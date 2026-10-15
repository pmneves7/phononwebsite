import { PhononHighcharts } from './phononhighcharts.js';

// Relative spin-dipole weight, summed over Cartesian components and sites of
// each magnetic element. These are not bosonic norms or neutron intensities:
// equilibrium spins, g factors, polarization, and form factors do not enter.
export function magnonAtomTypeWeights(data) {
    const siteAtomNumbers = data.magnetic_atom_indices.map((atom) => data.atom_numbers[atom]);
    const atomNumbers = [...new Set(siteAtomNumbers)];
    const typeIndex = new Map(atomNumbers.map((number, index) => [number, index]));
    const weights = data.vectors.map((bands) => bands.map((sites) => {
        const totals = new Array(atomNumbers.length).fill(0);
        // Scaling first makes the normalized result independent of units and
        // avoids overflow/underflow for unusually scaled imported modes.
        let maxComponent = 0;
        for (const axes of sites) {
            for (const [re, im] of axes) maxComponent = Math.max(maxComponent, Math.abs(re), Math.abs(im));
        }
        if (maxComponent === 0) return totals;
        let total = 0;
        sites.forEach((axes, site) => {
            const weight = axes.reduce((sum, [re, im]) => sum + (re / maxComponent) ** 2 + (im / maxComponent) ** 2, 0);
            totals[typeIndex.get(siteAtomNumbers[site])] += weight;
            total += weight;
        });
        return totals.map((weight) => weight / total);
    }));
    return { atomNumbers, weights };
}

// Reuse path segmentation, exact (q, band) selection, and chart lifecycle.
export class MagnonHighcharts extends PhononHighcharts {
    constructor(container) {
        super(container);
        this.HighchartsOptions.yAxis.title.text = 'Energy (meV)';
        this.HighchartsOptions.tooltip.formatter = function() {
            return `${Number(this.y.toPrecision(5))} meV`;
        };
    }

    // Call before update(data.plot, options). Appearance options are the same
    // as the phonon chart: enabled, getAtomColorHex, and getAtomLabel.
    setMagnonData(data) {
        this.magnon = data;
        this.magnonWeights = null;
    }

    setModeWeightsOptions(options = {}) {
        super.setModeWeightsOptions({
            ...options,
            getAtomColorHex: typeof options.getAtomColorHex === 'function' ? options.getAtomColorHex : (() => 0x0066ff),
        });
    }

    ensureAtomTypeWeights(plot) {
        if (!this.magnon || plot !== this.magnon.plot) return { atomNumbers: [], weights: [] };
        if (!this.magnonWeights) this.magnonWeights = magnonAtomTypeWeights(this.magnon);
        return this.magnonWeights;
    }

    getWeightedColorForIndices(indices, weights) {
        // Appearance controls can refresh colors after every legend entry has
        // been hidden. The hidden overlays still need a valid fallback color.
        return indices.length ? super.getWeightedColorForIndices(indices, weights) : '#94a3b8';
    }

    getGraph(plot) {
        super.getGraph(plot);
        // A purely multipolar mode has no dipole weight to color. Leave its
        // underlying dispersion visible without a misleading species overlay.
        this.highcharts = this.highcharts.filter((series) => !series.isWeightSeries || series.avgWeights.some((weight) => weight > 0));
    }
}
