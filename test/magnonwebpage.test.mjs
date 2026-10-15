import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { JSDOM } from 'jsdom';
import jquery from 'jquery';
import { MagnonWebpage } from '../src/magnonwebpage.js';

describe('Magnon controls', () => {
    function setup() {
        const dom = new JSDOM('<div id="load-status"></div><input id="kindex"><input id="nindex"><input id="phase"><p id="selected-mode"></p><p id="mode-note"></p>');
        const $ = jquery(dom.window);
        const viewer = { modeScale: 1, setMode(k, band) { this.selected = [k, band]; } };
        const chart = { setClickEvent() {}, selectModePoint(data, k, band) { this.selected = [k, band]; } };
        const page = new MagnonWebpage(viewer, chart, $);
        page.data = {
            nq: 2, nbands: 2, qpoints: [[0, 0, 0], [-0.5, 0, 0]], energies: [[1, 2], [3, 4]],
            metadata: { input_qpoints: [[0, 0, 0], [0.25, 0, 0]] },
        };
        return { page, viewer, chart, $ };
    }

    it('keeps exact band identity and shows native input q, not animation q', () => {
        const { page, viewer, chart, $ } = setup();
        page.selectModeByBandIndex(1, 1);
        assert.deepEqual(viewer.selected, [1, 1]);
        assert.deepEqual(chart.selected, [1, 1]);
        assert.equal($('#nindex').val(), '2');
        assert.match($('#selected-mode').text(), /0.25, 0, 0.*input RLU.*4 meV/);
    });

    it('rejects invalid selection while retaining the visible mode', () => {
        const { page, viewer, $ } = setup();
        page.selectModeByBandIndex(1, 0);
        page.selectModeByBandIndex(99, -1);
        assert.deepEqual(viewer.selected, [1, 0]);
        assert.equal($('#load-status').attr('role'), 'alert');
    });

    it('shows Cartesian input units instead of mislabeling them as RLU', () => {
        const { page, $ } = setup();
        page.data.metadata.input_qpoint_units = 'radians / input length unit';
        page.selectModeByBandIndex(1, 0);
        assert.match($('#selected-mode').text(), /0.25, 0, 0.*radians \/ input length unit/);
        assert.ok(!$('#selected-mode').text().includes('RLU'));
    });

    it('retains the previous data and reports malformed uploads', async () => {
        const { page, $ } = setup();
        const original = page.data;
        await page.loadFile({ size: 1, text: async () => '{' });
        assert.equal(page.data, original);
        assert.match($('#load-status').text(), /not valid JSON/);
    });

    it('ignores a stale request when a newer file was loaded', async () => {
        const { page } = setup();
        let resolve;
        const first = page.loadFile({ size: 1, text: () => new Promise((r) => { resolve = r; }) });
        const loaded = [];
        page.loadData = (data) => loaded.push(data.id);
        await page.loadFile({ size: 1, text: async () => '{"id":2}' });
        resolve('{"id":1}');
        await first;
        assert.deepEqual(loaded, [2]);
    });
});
