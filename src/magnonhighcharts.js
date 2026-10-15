import { PhononHighcharts } from './phononhighcharts.js';

// Reuse path segmentation, exact (q, band) selection, and chart lifecycle.
export class MagnonHighcharts extends PhononHighcharts {
    constructor(container) {
        super(container);
        this.HighchartsOptions.yAxis.title.text = 'Energy (meV)';
        this.HighchartsOptions.tooltip.formatter = function() {
            return `${Number(this.y.toPrecision(5))} meV`;
        };
    }
}
