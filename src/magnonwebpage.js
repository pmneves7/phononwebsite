import { parseMagnonJson } from './magnonjson.js';
import { renderLatticeTable, renderAtomPositionsTable } from './structureinfo.js';
import { atomic_symbol } from './atomic_data.js';
import { ViewerCapture, supportsWebmCapture } from './viewercapture.js';

export class MagnonWebpage {
    constructor(viewer, dispersion, $) {
        this.viewer = viewer;
        this.dispersion = dispersion;
        this.$ = $;
        this.loadId = 0;
        this.isLoading = false;
        dispersion.setClickEvent(this);
    }

    setStatus(message, error = false) {
        this.$('#load-status').text(message).attr('role', error ? 'alert' : 'status').toggleClass('error', error);
    }

    loadData(raw) {
        const data = parseMagnonJson(raw);
        this.viewer.setMagnon(data);
        this.data = data;
        // Adapter to the existing chart's controller interface.
        this.phonon = data.plot;
        this.dispersion.setMagnonData(data);
        this.dispersion.update(data.plot, this.chartOptions());
        this.$('#name').text(data.name);
        this.$('#kindex').attr('max', data.nq);
        this.$('#nindex').attr('max', data.nbands);
        ['#nx', '#ny', '#nz'].forEach((selector, i) => this.$(selector).val([this.viewer.nx, this.viewer.ny, this.viewer.nz][i]));
        renderLatticeTable(this.$('#lattice'), data.lattice);
        renderAtomPositionsTable(this.$('#atompos'), data.atom_pos_red, data.atom_types, data.atom_numbers, this.viewer.getAtomColorHex.bind(this.viewer));
        this.updateControlState();
        // Start away from a possible Goldstone singularity where possible.
        this.selectModeByBandIndex(Math.min(Math.floor(data.nq / 3), data.nq - 1), 0);
        this.setStatus('');
    }

    async loadUrl(url) {
        if (this.viewer.movieCapture?.busy) return;
        const id = ++this.loadId;
        this.isLoading = true;
        this.updateControlState();
        this.setStatus('Loading modes…');
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Could not load modes (HTTP ${response.status}).`);
            const data = await response.json();
            if (id !== this.loadId) return;
            this.loadData(data);
        } catch (error) {
            if (id === this.loadId) this.setStatus(error.message, true);
        } finally {
            if (id === this.loadId) {
                this.isLoading = false;
                this.updateControlState();
            }
        }
    }

    async loadFile(file) {
        if (!file || this.viewer.movieCapture?.busy) return;
        const id = ++this.loadId;
        this.isLoading = true;
        this.updateControlState();
        this.setStatus('Loading modes…');
        try {
            if (file.size > 100 * 1024 * 1024) throw new Error('Please export a JSON file smaller than 100 MB.');
            const data = JSON.parse(await file.text());
            if (id !== this.loadId) return;
            this.loadData(data);
            this.$('#example-select').val('');
        } catch (error) {
            if (id === this.loadId) this.setStatus(error instanceof SyntaxError ? 'This file is not valid JSON. Load a file produced by a magnon exporter.' : error.message, true);
        } finally {
            if (id === this.loadId) {
                this.isLoading = false;
                this.updateControlState();
            }
        }
    }

    selectModeByBandIndex(k, band) {
        if (!this.data || this.viewer.movieCapture?.busy) return;
        k = Number(k);
        band = Number(band);
        if (!Number.isInteger(k) || k < 0 || k >= this.data.nq || !Number.isInteger(band) || band < 0 || band >= this.data.nbands) {
            this.setStatus(`Choose a q-index from 1–${this.data.nq} and a band from 1–${this.data.nbands}.`, true);
            return;
        }
        this.setStatus('');
        this.viewer.setMode(k, band);
        this.$('#kindex').val(k + 1);
        this.$('#nindex').val(band + 1);
        this.$('#phase').val(0);
        this.dispersion.selectModePoint(this.phonon, k, band);
        const nativeQ = this.data.metadata?.input_qpoints;
        const q = (nativeQ ?? this.data.qpoints)[k].map((x) => Number(x.toFixed(4))).join(', ');
        const basis = nativeQ ? (this.data.metadata.input_qpoint_units || 'input RLU') : 'magnetic RLU';
        this.$('#selected-mode').text(`q = (${q}) ${basis} · Band ${band + 1} · ${Number(this.data.energies[k][band].toPrecision(5))} meV`);
        this.$('#mode-note').text(this.viewer.modeScale === 0
            ? 'This mode has no spin-dipole motion. Higher multipoles are not shown by arrows.'
            : this.data.energies[k][band] === 0 ? 'Zero-energy mode: playback is static. Use the phase slider to inspect its shape.' : '');
    }

    bindControls() {
        const $ = this.$;
        $('#file-input').on('change', (event) => this.loadFile(event.target.files[0]));
        $('#example-select').on('change', (event) => { if (event.target.value) this.loadUrl(event.target.value); });
        $('#modeselect').on('click', () => this.selectModeByBandIndex(Number($('#kindex').val()) - 1, Number($('#nindex').val()) - 1));
        $('#kindex, #nindex').on('keydown', (event) => { if (event.key === 'Enter') $('#modeselect').trigger('click'); });
        $('#update').on('click', () => {
            if (!this.data) return;
            const counts = ['#nx', '#ny', '#nz'].map((id) => Number($(id).val()));
            if (counts.some((n) => !Number.isInteger(n) || n < 1 || n > 50) || counts.reduce((s, n) => s * n, this.data.natoms) > 2000) {
                this.setStatus('Use positive integer repetitions, with at most 2000 displayed atoms.', true);
                return;
            }
            this.setStatus('');
            this.viewer.shouldAutoFitCamera = true;
            this.viewer.setRepetitions(...counts);
        });
        for (const axis of ['x', 'y', 'z']) $('#camera' + axis).on('click', () => this.viewer.setCameraDirection(axis));
        this.viewer.setCellCheckbox($('#drawcell'));
        this.bindNumericControl('#amplitude, #amplitude-value', 0, 0.6, (value) => {
            this.viewer.amplitude = value;
            this.viewer.render();
        });
        this.bindNumericControl('#speed', 0.05, 2, (value) => { this.viewer.speed = value; });
        this.bindAppearanceControls();
        this.bindMovieControls();
        $('#playpause').on('click', () => {
            this.viewer.paused = !this.viewer.paused;
            $('#playpause').text(this.viewer.paused ? 'Play' : 'Pause').attr('aria-pressed', String(this.viewer.paused));
        });
        $('#phase').on('input', (event) => {
            this.viewer.paused = true;
            $('#playpause').text('Play').attr('aria-pressed', 'true');
            this.viewer.phase = Number(event.target.value) * Math.PI / 180;
            this.viewer.render();
        });
        this.viewer.onPhase = (phase) => $('#phase').val(phase * 180 / Math.PI);
        window.addEventListener('resize', () => this.dispersion.reflow());
    }

    bindNumericControl(selector, min, max, apply) {
        this.$(selector).on('input change', (event) => {
            if (event.target.value === '') return;
            const value = Number(event.target.value);
            if (!Number.isFinite(value) || value < min || value > max) return;
            this.$(selector).val(value);
            apply(value);
        });
    }

    chartOptions() {
        return {
            enabled: !!this.$('#mode_weights_plot').prop('checked'),
            getAtomColorHex: (n) => this.viewer.getAtomColorHex(n),
            getAtomLabel: (n) => atomic_symbol[n] || 'X',
        };
    }

    refreshAppearanceUI() {
        if (!this.data) return;
        renderAtomPositionsTable(this.$('#atompos'), this.data.atom_pos_red, this.data.atom_types,
            this.data.atom_numbers, this.viewer.getAtomColorHex.bind(this.viewer));
        this.dispersion.refreshAppearance(this.chartOptions());
        this.dispersion.selectModePoint(this.phonon, this.viewer.k, this.viewer.band);
    }

    bindAppearanceControls() {
        const $ = this.$;
        const viewer = this.viewer;
        viewer.setShadingCheckbox($('#drawshading'));
        viewer.setDisplayCombo($('#displaystyle'));
        viewer.setAppearanceControls(
            $('#appearance_atom_list'), $('#atom_color_input'), $('#bond_color_input'),
            $('#bond_color_by_atom_checkbox'), $('#atom_radius_input'), $('#bond_radius_input'),
            $('#bond_rules_list'), $('#bond_add_atom_a'), $('#bond_add_atom_b'), $('#bond_add_cutoff_input'),
            $('#appearance_reset_atom_button'), $('#appearance_reset_bonds_button'), $('#bond_add_button'),
        );
        $('#mode_weights_plot, #displaystyle, #atom_color_input').on('change', () => this.refreshAppearanceUI());
        $('#appearance_reset_atom_button').on('click', () => this.refreshAppearanceUI());
        const numbers = [
            ['#arrow-scale, #arrow-length-value', 'arrowScale', 0.1, 4, 1],
            ['#shaft-width', 'shaftRadius', 0.002, 4, 0.5],
            ['#cone-width', 'coneRadius', 0.002, 8, 0.5],
            ['#cone-fraction', 'coneFraction', 0, 1, 1],
            ['#tip-path-width', 'tipPathRadius', 0.002, 2, 0.5],
        ];
        for (const [selector, property, min, max, factor] of numbers) {
            this.bindNumericControl(selector, min, max, (value) => viewer.setSpinAppearance({ [property]: value * factor }));
        }
        const checkboxes = {
            '#center-arrows': 'centeredArrows', '#arrows-visible': 'arrowsVisible', '#show-tip-paths': 'showTipPaths',
        };
        for (const [selector, property] of Object.entries(checkboxes)) {
            $(selector).on('change', (event) => viewer.setSpinAppearance({ [property]: event.target.checked }));
        }
        $('#arrow-color').on('input change', (event) => viewer.setSpinAppearance({ arrowColor: event.target.value }));
        const sync = () => {
            const style = viewer.getSpinAppearance();
            for (const [selector, property, , , factor] of numbers) $(selector).val(style[property] / factor);
            for (const [selector, property] of Object.entries(checkboxes)) $(selector).prop('checked', style[property]);
            $('#arrow-color').val(style.arrowColor);
        };
        $('#reset-spin-appearance').on('click', () => { viewer.resetSpinAppearance(); sync(); });
        sync();
    }

    updateControlState() {
        const $ = this.$;
        const busy = !!this.viewer.movieCapture?.busy;
        $('#mode-controls :input').prop('disabled', busy || !this.data);
        $('#example-select, #file-input').prop('disabled', busy);
        if (this.viewer.controls) this.viewer.controls.enabled = !busy;
        if (!busy && this.data) this.viewer.refreshAppearanceControls?.();
        $('#gifbutton').prop('disabled', busy || !this.data || this.isLoading);
        $('#webmbutton').prop('disabled', busy || !this.data || this.isLoading || !supportsWebmCapture(this.viewer.canvas));
    }

    bindMovieControls() {
        const $ = this.$;
        const viewer = this.viewer;
        viewer.movieCapture = new ViewerCapture({
            canvas: () => viewer.canvas,
            getState: () => ({ phase: viewer.phase, paused: viewer.paused, speed: viewer.speed }),
            setState: ({ phase, paused }) => {
                viewer.phase = phase;
                viewer.paused = paused;
                viewer.lastTime = null;
                $('#playpause').text(paused ? 'Play' : 'Pause').attr('aria-pressed', String(paused));
                $('#phase').val(phase * 180 / Math.PI);
                viewer.render();
            },
            renderPhase: (phase) => { viewer.phase = phase; viewer.render(); },
            filename: (format) => {
                const name = this.data?.name?.replace(/[^a-zA-Z0-9._-]+/g, '_') || 'magnon';
                return `${name}_q${viewer.k + 1}_band${viewer.band + 1}.${format}`;
            },
            onStateChange: ({ busy, state, progress }) => {
                $('#movie-progress').prop('hidden', !busy).val(progress);
                if (busy) $('#movie-status').text(state === 'saving' ? 'Encoding movie…' : 'Recording one cycle…');
                this.updateControlState();
            },
        });
        if (!supportsWebmCapture(viewer.canvas)) $('#webmbutton').attr('title', 'WebM recording is unavailable in this browser. Use GIF.');
        for (const format of ['gif', 'webm']) {
            $('#' + format + 'button').on('click', async () => {
                if (!this.data || this.isLoading || viewer.movieCapture.busy) return;
                try {
                    await viewer.movieCapture.start(format);
                    $('#movie-status').text('Movie downloaded.');
                } catch (error) {
                    $('#movie-status').text(`Movie export failed: ${error.message}`);
                }
            });
        }
        this.updateControlState();
    }

    async init() {
        this.bindControls();
        this.$('#mode-controls :input').prop('disabled', true);
        try {
            const response = await fetch('data/magnons/models.json');
            if (!response.ok) throw new Error('Example list is unavailable. You can still load your own JSON file.');
            const examples = await response.json();
            for (const example of examples) {
                this.$('#example-select').append(this.$('<option>').val(example.file).text(example.name));
            }
            // Do not supersede a file that was opened while the example list loaded.
            if (this.loadId !== 0) return;
            const url = new URLSearchParams(window.location.search).get('json');
            const initial = url || examples[0]?.file;
            if (initial) {
                this.$('#example-select').val(url ? '' : initial);
                await this.loadUrl(initial);
            }
        } catch (error) {
            if (this.loadId === 0) this.setStatus(error.message, true);
        }
    }
}
