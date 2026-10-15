import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import { JSDOM } from 'jsdom';
import jquery from 'jquery';
import { MagnonCrystal, SPIN_APPEARANCE_DEFAULTS } from '../src/magnoncrystal.js';
import { MagnonWebpage } from '../src/magnonwebpage.js';

const html = fs.readFileSync(new URL('../magnon.html', import.meta.url), 'utf8');

function fixture() {
    const mode = [[[1, 0], [0, -1], [0, 0]], [[0.5, 0], [0, 0.5], [0, 0]]];
    return {
        format: 'magnonwebsite', version: 1, name: 'Appearance controls',
        units: { length: 'angstrom', energy: 'meV', spin: 'hbar' },
        phase_convention: 'cell-periodic', time_convention: 'exp(-iwt)',
        lattice: [[4, 0, 0], [0, 4, 0], [0, 0, 4]],
        atom_types: ['Fe', 'O', 'Co'], atom_pos_red: [[0, 0, 0], [0.35, 0, 0], [0.7, 0, 0]],
        magnetic_atom_indices: [0, 2], spin_vectors: [[0, 0, 1], [0, 0, -1]],
        qpoints: [[0, 0, 0], [0.5, 0, 0]], energies: [[1, 2], [2, 3]],
        vectors: [[mode, mode], [mode, mode]],
    };
}

function setup(t) {
    const dom = new JSDOM(html, { url: 'http://localhost/magnon.html' });
    const previous = new Map(['window', 'document'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: dom.window });
    Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: dom.window.document });
    t.after(() => {
        dom.window.close();
        for (const [key, descriptor] of previous) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete globalThis[key];
        }
    });
    const $ = jquery(dom.window);
    // Exercise the real viewer state and appearance implementation without
    // initializing WebGL; renderer/scene methods explicitly support this.
    const viewer = new MagnonCrystal();
    const chart = {
        refreshes: [], selections: [],
        setClickEvent(controller) { this.controller = controller; },
        setMagnonData(data) { this.data = data; },
        update(plot, options) { this.plot = plot; this.options = options; },
        refreshAppearance(options) { this.refreshes.push(options); },
        selectModePoint(plot, k, band) { this.selections.push([k, band]); },
        reflow() {},
    };
    const page = new MagnonWebpage(viewer, chart, $);
    page.bindControls();
    page.loadData(fixture());
    return { $, page, viewer, chart };
}

describe('Magnon appearance controls in the real page', { concurrency: false }, () => {
    it('changes the selected atom color and radius and resets only that atom section', (t) => {
        const { $, viewer } = setup(t);
        assert.equal($('#appearance_atom_list button').length, 3);
        $('#appearance_atom_list button[data-atom-number="26"]').trigger('click');
        $('#atom_color_input').val('#123456').trigger('change');
        $('#atom_radius_input').val('1.7').trigger('change');
        assert.equal(viewer.getAtomColorHex(26), 0x123456);
        assert.equal(viewer.getAtomRadiusScale(26), 1.7);
        assert.equal(viewer.getAtomRadiusScale(8), 0.6);
        $('#shaft-width').val('0.3').trigger('change');
        $('#bond_radius_input').val('0.23').trigger('change');

        $('#appearance_reset_atom_button').trigger('click');
        assert.equal(viewer.getAtomColorHex(26), viewer.getDefaultAtomColor(26));
        assert.equal(viewer.getAtomRadiusScale(26), 0.6);
        assert.equal($('#atom_radius_input').val(), '0.6');
        assert.equal(viewer.bondRadius, 0.23);
        assert.equal(viewer.shaftRadius, 0.15);
    });

    it('adds and removes bond rules, changes split colors, and restores bond defaults', (t) => {
        const { $, viewer } = setup(t);
        const defaultRules = structuredClone(viewer.bondRules);
        assert.equal($('#bond_color_input').prop('disabled'), true);
        $('#bond_color_by_atom_checkbox').prop('checked', false).trigger('change');
        assert.equal($('#bond_color_input').prop('disabled'), false);
        $('#bond_color_input').val('#abcdef').trigger('change');
        $('#bond_radius_input').val('0.27').trigger($.Event('keydown', { key: 'Enter' }));
        assert.equal(viewer.bondscolor, 0xabcdef);
        assert.equal(viewer.bondRadius, 0.27);

        $('#bond_add_atom_a').val('26').trigger('change');
        $('#bond_add_atom_b').val('8').trigger('change');
        $('#bond_add_cutoff_input').val('2.35');
        $('#bond_add_button').trigger('click');
        const key = viewer.getBondRuleKey(26, 8);
        assert.equal(viewer.bondRules[key].cutoff, 2.35);
        $('#bond_rules_list').find(`button[data-remove-key="${key}"]`).trigger('click');
        assert.equal(viewer.hasBondRule(26, 8), false);
        $('#appearance_reset_bonds_button').trigger('click');
        assert.deepEqual(viewer.bondRules, defaultRules);
        assert.equal(viewer.bondscolor, viewer.defaultBondsColor);
        assert.equal(viewer.bondRadius, viewer.defaultBondRadius);
        assert.equal(viewer.bondColorByAtom, true);
        assert.equal($('#bond_color_input').prop('disabled'), true);
    });

    it('refreshes dispersion colors and weights without changing the selected mode or animation phase', (t) => {
        const { $, page, viewer, chart } = setup(t);
        page.selectModeByBandIndex(1, 1);
        viewer.phase = 0.75;
        $('#mode_weights_plot').prop('checked', true).trigger('change');
        $('#appearance_atom_list button[data-atom-number="27"]').trigger('click');
        $('#atom_color_input').val('#ff8800').trigger('change');
        let options = chart.refreshes.at(-1);
        assert.equal(options.enabled, true);
        assert.equal(options.getAtomColorHex(27), 0xff8800);
        assert.equal(options.getAtomLabel(27), 'Co');
        assert.deepEqual(chart.selections.at(-1), [1, 1]);
        assert.equal(viewer.phase, 0.75);
        assert.equal($('#atompos .atom-type-badge').last()[0].style.getPropertyValue('--atom-badge-bg'), '#ff8800');

        $('#displaystyle').val('vesta').trigger('change');
        assert.equal(viewer.display, 'vesta');
        assert.equal(viewer.getSelectedAppearanceAtomNumber(), 27);
        assert.equal(viewer.getAtomColorHex(27), 0xff8800);
        $('#appearance_reset_atom_button').trigger('click');
        options = chart.refreshes.at(-1);
        assert.equal(options.getAtomColorHex(27), viewer.getDefaultAtomColor(27));
        assert.deepEqual(chart.selections.at(-1), [1, 1]);
        assert.equal(viewer.phase, 0.75);
    });

    it('converts displayed widths to radii independently of the arrow length multiplier', (t) => {
        const { $, viewer } = setup(t);
        $('#shaft-width').val('0.2').trigger('input');
        $('#cone-width').val('0.6').trigger('change');
        $('#tip-path-width').val('0.08').trigger('change');
        $('#cone-fraction').val('0.4').trigger('change');
        $('#arrow-length-value').val('2.5').trigger('change');
        assert.equal(viewer.arrowScale, 2.5);
        assert.equal($('#arrow-scale').val(), '2.5');
        assert.equal(viewer.shaftRadius, 0.1);
        assert.equal(viewer.coneRadius, 0.3);
        assert.equal(viewer.tipPathRadius, 0.04);
        assert.equal(viewer.coneFraction, 0.4);
        $('#arrow-scale').val('1.5').trigger('input');
        assert.equal($('#arrow-length-value').val(), '1.5');
        assert.equal(viewer.shaftRadius, 0.1);
        assert.equal(viewer.coneRadius, 0.3);
    });

    it('toggles centered arrows and tip paths, updates their shared color, and resets spin appearance independently', (t) => {
        const { $, viewer } = setup(t);
        $('#center-arrows, #show-tip-paths').prop('checked', false).trigger('change');
        $('#arrows-visible').prop('checked', false).trigger('change');
        $('#arrow-color').val('#cc1188').trigger('input');
        assert.equal(viewer.centeredArrows, false);
        assert.equal(viewer.showTipPaths, false);
        assert.equal(viewer.arrowsVisible, false);
        assert.equal(viewer.arrowColor, '#cc1188');
        $('#amplitude-value').val('0.37').trigger('change');
        $('#atom_radius_input').val('1.2').trigger('change');
        $('#reset-spin-appearance').trigger('click');
        assert.deepEqual(viewer.getSpinAppearance(), SPIN_APPEARANCE_DEFAULTS);
        assert.equal($('#center-arrows').prop('checked'), true);
        assert.equal($('#show-tip-paths').prop('checked'), true);
        assert.equal($('#arrows-visible').prop('checked'), true);
        assert.equal($('#arrow-color').val(), SPIN_APPEARANCE_DEFAULTS.arrowColor);
        assert.equal(Number($('#shaft-width').val()), 2 * SPIN_APPEARANCE_DEFAULTS.shaftRadius);
        assert.equal(Number($('#cone-width').val()), 2 * SPIN_APPEARANCE_DEFAULTS.coneRadius);
        assert.equal(Number($('#tip-path-width').val()), 2 * SPIN_APPEARANCE_DEFAULTS.tipPathRadius);
        assert.equal(viewer.amplitude, 0.37);
        assert.equal(viewer.getAtomRadiusScale(26), 1.2);
    });

    it('ignores empty, nonnumeric, and out-of-range spin or amplitude inputs', (t) => {
        const { $, viewer } = setup(t);
        const original = viewer.getSpinAppearance();
        const invalid = {
            '#arrow-length-value': ['', 'bad', '0', '4.1'],
            '#shaft-width': ['', '-1', '0', '4.1'],
            '#cone-width': ['', '-1', '0', '8.1'],
            '#cone-fraction': ['', '-0.1', '1.1'],
            '#tip-path-width': ['', '-1', '0', '2.1'],
        };
        for (const [selector, values] of Object.entries(invalid)) {
            for (const value of values) {
                $(selector).val(value).trigger('change');
                assert.deepEqual(viewer.getSpinAppearance(), original, `${selector}: ${value}`);
            }
        }
        for (const value of ['', '-0.1', '0.7', 'bad']) {
            $('#amplitude-value').val(value).trigger('change');
            assert.equal(viewer.amplitude, 0.2);
        }
        $('#amplitude-value').val('0').trigger('change');
        assert.equal(viewer.amplitude, 0);
        assert.equal($('#amplitude').val(), '0');
    });

    it('retains the shared cell and shading checkbox behavior', (t) => {
        const { $, viewer } = setup(t);
        assert.equal(viewer.cell, true);
        assert.equal(viewer.shading, true);
        $('#drawcell, #drawshading').prop('checked', false).trigger('change');
        assert.equal(viewer.cell, false);
        assert.equal(viewer.shading, false);
    });
});
