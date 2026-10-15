import { parseMagnonJson } from './magnonjson.js';
import { renderLatticeTable, renderAtomPositionsTable } from './structureinfo.js';

export class MagnonWebpage {
    constructor(viewer, dispersion, $) {
        this.viewer = viewer;
        this.dispersion = dispersion;
        this.$ = $;
        this.loadId = 0;
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
        this.dispersion.update(data.plot);
        this.$('#name').text(data.name);
        this.$('#kindex').attr('max', data.nq);
        this.$('#nindex').attr('max', data.nbands);
        ['#nx', '#ny', '#nz'].forEach((selector, i) => this.$(selector).val([this.viewer.nx, this.viewer.ny, this.viewer.nz][i]));
        renderLatticeTable(this.$('#lattice'), data.lattice);
        renderAtomPositionsTable(this.$('#atompos'), data.atom_pos_red, data.atom_types, data.atom_numbers, this.viewer.getAtomColorHex.bind(this.viewer));
        this.$('#mode-controls :input').prop('disabled', false);
        // Start away from a possible Goldstone singularity where possible.
        this.selectModeByBandIndex(Math.min(Math.floor(data.nq / 3), data.nq - 1), 0);
        this.setStatus('');
    }

    async loadUrl(url) {
        const id = ++this.loadId;
        this.setStatus('Loading modes…');
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Could not load modes (HTTP ${response.status}).`);
            const data = await response.json();
            if (id !== this.loadId) return;
            this.loadData(data);
        } catch (error) {
            if (id === this.loadId) this.setStatus(error.message, true);
        }
    }

    async loadFile(file) {
        if (!file) return;
        const id = ++this.loadId;
        this.setStatus('Loading modes…');
        try {
            if (file.size > 100 * 1024 * 1024) throw new Error('Please export a JSON file smaller than 100 MB.');
            const data = JSON.parse(await file.text());
            if (id !== this.loadId) return;
            this.loadData(data);
            this.$('#example-select').val('');
        } catch (error) {
            if (id === this.loadId) this.setStatus(error instanceof SyntaxError ? 'This file is not valid JSON. Load a file produced by a magnon exporter.' : error.message, true);
        }
    }

    selectModeByBandIndex(k, band) {
        if (!this.data) return;
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
        const basis = nativeQ ? 'input RLU' : 'magnetic RLU';
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
        const sliders = { amplitude: 'amplitude', speed: 'speed', 'arrow-scale': 'arrowScale' };
        for (const [id, property] of Object.entries(sliders)) {
            $('#' + id).on('input', (event) => {
                this.viewer[property] = Number(event.target.value);
                this.viewer.render();
            });
        }
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
