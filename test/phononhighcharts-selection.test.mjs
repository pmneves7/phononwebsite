import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PhononHighcharts } from '../src/phononhighcharts.js';

describe('PhononHighcharts selection sync', () => {
  it('selects points using bandIndex metadata instead of series name', () => {
    const chartHelper = new PhononHighcharts(null);
    let deselected = false;
    let selected = false;
    const previousPoint = {
      select(value) {
        if (value === false) {
          deselected = true;
        }
      },
    };
    const targetPoint = {
      x: 1.25,
      select(value) {
        if (value === true) {
          selected = true;
        }
      },
    };

    chartHelper.selectedPoint = previousPoint;
    chartHelper.selectedBandIndex = 0;
    chartHelper.selectedX = 0.0;
    chartHelper.chart = {
      series: [
        {
          name: 'custom-label',
          options: {
            bandIndex: 4,
          },
          points: [targetPoint],
        },
      ],
    };

    chartHelper.selectModePoint({ distances: [1.25] }, 0, 4);

    assert.equal(deselected, true);
    assert.equal(selected, true);
    assert.equal(chartHelper.selectedPoint, targetPoint);
    assert.equal(chartHelper.selectedBandIndex, 4);
    assert.equal(chartHelper.selectedX, 1.25);
  });

  it('prefers the exact k-index when multiple points share the same x position', () => {
    const chartHelper = new PhononHighcharts(null);
    let selectedPoint = null;
    const firstPoint = {
      x: 2.0,
      options: { kIndex: 5 },
      select(value) {
        if (value === true) {
          selectedPoint = 'first';
        }
      },
    };
    const secondPoint = {
      x: 2.0,
      options: { kIndex: 6 },
      select(value) {
        if (value === true) {
          selectedPoint = 'second';
        }
      },
    };

    chartHelper.chart = {
      series: [
        {
          name: '4',
          options: { bandIndex: 4 },
          points: [firstPoint, secondPoint],
        },
      ],
    };

    chartHelper.selectModePoint({ distances: [0, 0, 0, 0, 0, 2.0, 2.0] }, 6, 4);

    assert.equal(selectedPoint, 'second');
    assert.equal(chartHelper.selectedK, 6);
  });

  it('finds the exact k-index across disconnected segments before using an x fallback', () => {
    const chartHelper = new PhononHighcharts(null);
    let selectedPoint = null;
    const previousSegmentEnd = {
      x: 2, options: { kIndex: 5 },
      select(value) { if (value) selectedPoint = 'previous'; },
    };
    const nextSegmentStart = {
      x: 2, options: { kIndex: 6 },
      select(value) { if (value) selectedPoint = 'next'; },
    };
    chartHelper.chart = {
      series: [
        { options: { bandIndex: 4 }, points: [previousSegmentEnd] },
        { options: { bandIndex: 4 }, points: [nextSegmentStart] },
      ],
    };

    chartHelper.selectModePoint({ distances: [0, 0, 0, 0, 0, 2, 2] }, 6, 4);

    assert.equal(selectedPoint, 'next');
    assert.equal(chartHelper.selectedPoint, nextSegmentStart);
  });

  for (const oldK of [0, 1]) {
    it(`clears destroyed points when loading a new chart (${oldK === 0 ? 'same' : 'different'} selection)`, () => {
      const chartHelper = new PhononHighcharts([{}]);
      let destroyed = false;
      let selected = false;
      const oldHighcharts = globalThis.Highcharts;
      const oldPoint = {
        select() { throw new Error('A destroyed point cannot be selected'); },
      };
      chartHelper.selectedPoint = oldPoint;
      chartHelper.selectedBandIndex = 0;
      chartHelper.selectedK = oldK;
      chartHelper.selectedX = oldK;
      chartHelper.chart = {
        destroy() {
          assert.equal(chartHelper.selectedPoint, null);
          assert.equal(chartHelper.selectedBandIndex, null);
          assert.equal(chartHelper.selectedK, null);
          assert.equal(chartHelper.selectedX, null);
          destroyed = true;
        },
      };
      const newPoint = {
        x: 0, options: { kIndex: 0 },
        select(value) { selected = value; },
      };
      globalThis.Highcharts = {
        chart() {
          return { series: [{ options: { bandIndex: 0 }, points: [newPoint] }] };
        },
      };
      try {
        const data = {
          eigenvalues: [[1]], kpoints: [[0, 0, 0]], distances: [0],
          highsym_qpts: {}, line_breaks: [[0, 1]],
        };
        chartHelper.update(data);
        chartHelper.selectModePoint(data, 0, 0);
        assert.equal(destroyed, true);
        assert.equal(selected, true);
        assert.equal(chartHelper.selectedPoint, newPoint);
      } finally {
        if (oldHighcharts === undefined) delete globalThis.Highcharts;
        else globalThis.Highcharts = oldHighcharts;
      }
    });
  }
});
