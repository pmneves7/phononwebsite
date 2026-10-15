import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { ViewerCapture, getCaptureFilename, supportsWebmCapture } from '../src/viewercapture.js';
import { MagnonCrystal } from '../src/magnoncrystal.js';

describe('shared viewer movie export', () => {
    let oldGlobals, saved, rendered, events, downloads, state, encoder, recorder, tracksStopped;
    let capture, canvas;

    beforeEach(() => {
        oldGlobals = Object.fromEntries(['GIF', 'CCapture', 'MediaRecorder', 'window', 'requestAnimationFrame'].map((key) => [key, globalThis[key]]));
        saved = { phase: 0.7, paused: true, speed: 1 };
        state = { ...saved };
        rendered = [];
        events = [];
        downloads = [];
        tracksStopped = 0;
        globalThis.GIF = function () {};
        globalThis.CCapture = class {
            constructor(options) { this.options = options; this.frames = []; encoder = this; }
            start() { this.started = true; }
            capture(value) { this.frames.push(value); }
            stop() { this.stopped = true; }
            save(callback) { this.saveCallback = callback; }
        };
        globalThis.MediaRecorder = class {
            static isTypeSupported(type) { return type.startsWith('video/webm'); }
            constructor(stream, { mimeType }) {
                this.stream = stream;
                this.mimeType = mimeType;
                this.state = 'inactive';
                recorder = this;
            }
            start() { this.state = 'recording'; }
            stop() {
                this.state = 'inactive';
                this.ondataavailable?.({ data: new Blob(['movie']) });
                this.onstop?.();
            }
        };
        globalThis.window = { URL: { createObjectURL: () => 'blob:recorded' } };
        canvas = { captureStream: () => ({ getTracks: () => [{ stop: () => { tracksStopped++; } }] }) };
        capture = new ViewerCapture({
            canvas: () => canvas,
            getState: () => state,
            setState: (original) => { state = { ...original }; },
            renderPhase: (phase) => { state.phase = phase; rendered.push(phase); },
            filename: (format) => getCaptureFilename('Magnon demo', 2, 3, format, 'magnon'),
            onStateChange: (event) => events.push(event),
            download: (url, filename) => downloads.push({ url, filename }),
            fps: 4,
        });
    });

    afterEach(() => {
        for (const [key, value] of Object.entries(oldGlobals)) {
            if (value === undefined) delete globalThis[key];
            else globalThis[key] = value;
        }
    });

    it('captures evenly spaced phases for a complete GIF loop while paused and restores playback after saving', async () => {
        const completed = capture.start('gif');
        assert.equal(capture.busy, true);
        assert.equal(encoder.options.workersPath, 'libs/');
        // Timestamp spacing cannot affect the exact GIF phase samples.
        for (const time of [100, 200, 700, 800]) assert.equal(capture.tick(time), true);
        assert.deepEqual(rendered, [0, 1, 2, 3].map((i) => saved.phase + 2 * Math.PI * i / 4));
        assert.equal(encoder.frames.length, 4);
        assert.equal(encoder.stopped, true);
        assert.equal(capture.state, 'saving');
        assert.equal(capture.tick(900), true);
        assert.equal(rendered.length, 4);
        encoder.options.onProgress(0.6);
        assert.deepEqual(events.at(-1), { state: 'saving', busy: true, format: 'gif', progress: 0.6 });
        encoder.saveCallback('blob:gif');
        assert.deepEqual(await completed, { format: 'gif', filename: 'Magnon_demo_k2_n3.gif' });
        assert.deepEqual(state, saved);
        assert.equal(capture.busy, false);
        assert.equal(capture.tick(1000), false);
        assert.deepEqual(downloads, [{ url: 'blob:gif', filename: 'Magnon_demo_k2_n3.gif' }]);
        assert.deepEqual(events.at(-1), { state: 'idle', busy: false, format: null, progress: 0 });
    });

    it('preserves playing state and uses the selected visual speed', async () => {
        state.paused = false;
        state.speed = 2;
        const original = { ...state };
        const completed = capture.start('gif');
        assert.equal(capture.frameTarget, 2);
        assert.equal(capture.durationMs, 500);
        capture.tick(0);
        capture.tick(10);
        encoder.saveCallback('blob:gif');
        await completed;
        assert.deepEqual(state, original);
    });

    it('keeps its single viewer loop alive when chart or resize frames overwrite CCapture RAF', async () => {
        const nativeFrames = [];
        const nativeRaf = (callback) => nativeFrames.push(callback);
        globalThis.requestAnimationFrame = nativeRaf;
        const FakeEncoder = globalThis.CCapture;
        let foreignFrame;
        globalThis.CCapture = class extends FakeEncoder {
            start() {
                super.start();
                globalThis.requestAnimationFrame = (callback) => { foreignFrame = callback; };
            }
            stop() {
                super.stop();
                globalThis.requestAnimationFrame = nativeRaf;
            }
        };
        capture = new ViewerCapture({
            canvas: () => canvas, getState: () => state, setState: (original) => { state = original; },
            renderPhase: (phase) => rendered.push(phase), filename: () => 'magnon.gif',
            download: () => {}, fps: 4,
        });
        const viewer = new MagnonCrystal();
        viewer.movieCapture = capture;
        const completed = capture.start('gif');
        viewer.animate(0);
        for (let i = 1; i < 4; i++) {
            // CCapture retains only this last unrelated callback, but the
            // viewer schedules its next frame with the retained native RAF.
            globalThis.requestAnimationFrame(() => {});
            assert.equal(typeof foreignFrame, 'function');
            assert.equal(nativeFrames.length, 1);
            nativeFrames.shift()(i * 250);
        }
        assert.equal(capture.state, 'saving');
        assert.equal(encoder.frames.length, 4);
        assert.equal(globalThis.requestAnimationFrame, nativeRaf);
        assert.equal(nativeFrames.length, 1);
        encoder.saveCallback('blob:gif');
        await completed;
        assert.equal(viewer.lastTime, null);
        assert.deepEqual(state, saved);
    });

    it('rejects competing exports without interrupting the active export', async () => {
        const completed = capture.start('gif');
        await assert.rejects(capture.start('webm'), /already in progress/);
        for (let i = 0; i < 4; i++) capture.tick(i);
        await assert.rejects(capture.start('gif'), /already in progress/);
        encoder.saveCallback('blob:gif');
        await completed;
    });

    it('samples native WebM by elapsed time, ends after one cycle, and releases recording tracks', async () => {
        const completed = capture.start('webm');
        assert.equal(recorder.state, 'inactive');
        capture.tick(100);
        assert.equal(recorder.state, 'recording');
        capture.tick(350);
        capture.tick(850);
        assert.equal(capture.busy, true);
        capture.tick(1100);
        await completed;
        assert.deepEqual(rendered, [0, 0.25, 0.75, 1].map((fraction) => saved.phase + 2 * Math.PI * fraction));
        assert.deepEqual(state, saved);
        assert.equal(tracksStopped, 1);
        assert.deepEqual(downloads, [{ url: 'blob:recorded', filename: 'Magnon_demo_k2_n3.webm' }]);
    });

    it('disables unsupported WebM instead of falling through to the legacy encoder', async () => {
        globalThis.MediaRecorder.isTypeSupported = () => false;
        assert.equal(supportsWebmCapture(canvas), false);
        await assert.rejects(capture.start('webm'), /does not support WebM/);
        assert.equal(capture.busy, false);
        assert.equal(events.length, 0);
        assert.deepEqual(state, saved);
    });

    it('cleans up a stream when native recorder creation fails', async () => {
        globalThis.MediaRecorder = class {
            static isTypeSupported() { return true; }
            constructor() { throw new Error('Recorder unavailable'); }
        };
        await assert.rejects(capture.start('webm'), /Recorder unavailable/);
        assert.equal(capture.busy, false);
        assert.equal(tracksStopped, 1);
        assert.deepEqual(state, saved);
    });

    it('restores state and stops the GIF backend after a rendering failure', async () => {
        capture.renderPhase = () => { throw new Error('Render failed'); };
        const completed = capture.start('gif');
        capture.tick(0);
        await assert.rejects(completed, /Render failed/);
        assert.equal(encoder.stopped, true);
        assert.equal(capture.busy, false);
        assert.deepEqual(state, saved);
        assert.equal(downloads.length, 0);
    });

    it('rejects missing encoders and invalid speed before altering playback', async () => {
        delete globalThis.GIF;
        await assert.rejects(capture.start('gif'), /GIF export is unavailable/);
        globalThis.GIF = function () {};
        state.speed = 0;
        await assert.rejects(capture.start('gif'), /positive animation speed/);
        assert.equal(capture.busy, false);
        assert.equal(events.length, 0);
    });
});
