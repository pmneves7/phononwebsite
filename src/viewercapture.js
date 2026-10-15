// Shared movie-export utilities. The viewer supplies the scene and animation
// phase; encoders only receive its rendered canvas.
export function resolveGifConstructor(mod) {
    if (typeof mod === 'function') return mod;
    if (typeof mod?.default === 'function') return mod.default;
    if (typeof mod?.GIF === 'function') return mod.GIF;
    return null;
}

export function getSupportedWebmMimeType() {
    if (typeof globalThis.MediaRecorder !== 'function') return null;
    const types = [
        'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus',
        'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm',
    ];
    if (typeof globalThis.MediaRecorder.isTypeSupported !== 'function') return 'video/webm';
    return types.find((type) => globalThis.MediaRecorder.isTypeSupported(type)) || null;
}

export function supportsWebmCapture(canvas) {
    const target = canvas || (typeof document !== 'undefined' && document.createElement('canvas'));
    return Boolean(target && typeof target.captureStream === 'function' && getSupportedWebmMimeType());
}

export function getCaptureFrameTarget(speed, fps = 60, minSpeed = 0.05) {
    return Math.max(1, Math.round(fps / Math.max(speed, minSpeed, 1e-6)));
}

export function getCaptureFilename(name, k, band, format, fallback = 'phonon') {
    const safe = String(name || fallback).trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '') || fallback;
    const suffix = Number.isFinite(k) && Number.isFinite(band) ? `_k${k}_n${band}` : '';
    return `${safe}${suffix}.${format}`;
}

export function downloadCapture(url, filename) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Allow the browser to begin reading the Blob before releasing it.
    if (url.startsWith('blob:') && typeof window.URL.revokeObjectURL === 'function') {
        const timer = setTimeout(() => window.URL.revokeObjectURL(url), 1000);
        timer?.unref?.();
    }
}

/**
 * Records one complete 2π cycle at the selected visual speed, even when paused.
 * Call tick(timestamp) from the viewer's existing animation loop and skip its
 * usual phase advance/render when tick returns true. Schedule that single loop
 * with requestFrame: CCapture replaces RAF with a one-callback implementation,
 * where unrelated chart/resize requests can otherwise overwrite the viewer.
 */
export class ViewerCapture {
    constructor({ canvas, getState, setState, renderPhase, filename, onStateChange = () => {}, fps = 60, download = downloadCapture }) {
        Object.assign(this, { canvas, getState, setState, renderPhase, filename, onStateChange, fps, download });
        this.state = 'idle';
        this.format = null;
        this.progress = 0;
        this.capturer = null;
        this.recorder = null;
        this.stream = null;
        this.frameCount = 0;
        this.startedAt = null;
        // Save native timer functions before CCapture temporarily replaces them.
        this.setTimer = globalThis.setTimeout.bind(globalThis);
        this.clearTimer = globalThis.clearTimeout.bind(globalThis);
        this.saveTimer = null;
        this.requestFrame = typeof globalThis.requestAnimationFrame === 'function'
            ? globalThis.requestAnimationFrame.bind(globalThis) : null;
    }

    get busy() { return this.state !== 'idle'; }

    notify(state, progress = this.progress) {
        this.state = state;
        this.progress = progress;
        this.onStateChange({ state, busy: this.busy, format: this.format, progress });
    }

    start(format) {
        if (this.busy) return Promise.reject(new Error('A movie export is already in progress.'));
        const canvas = this.canvas();
        if (!canvas) return Promise.reject(new Error('Load a structure before exporting a movie.'));
        if (!['gif', 'webm'].includes(format)) return Promise.reject(new Error('Choose GIF or WebM export.'));
        if (format === 'gif' && (typeof globalThis.GIF !== 'function' || typeof globalThis.CCapture !== 'function')) {
            return Promise.reject(new Error('GIF export is unavailable. Reload the page and try again.'));
        }
        if (format === 'webm' && !supportsWebmCapture(canvas)) {
            return Promise.reject(new Error('This browser does not support WebM recording. Use GIF instead.'));
        }
        const savedState = { ...this.getState() };
        if (!Number.isFinite(savedState.phase) || !Number.isFinite(savedState.speed) || savedState.speed <= 0) {
            return Promise.reject(new Error('Set a positive animation speed before exporting a movie.'));
        }
        this.savedState = savedState;
        this.operation = (this.operation || 0) + 1;
        this.format = format;
        this.outputFilename = this.filename(format);
        this.frameTarget = getCaptureFrameTarget(savedState.speed, this.fps);
        this.durationMs = this.frameTarget / this.fps * 1000;
        this.frameCount = 0;
        this.startedAt = null;
        return new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
            try {
                this.notify('capturing', 0);
                if (format === 'gif') {
                    this.capturer = new globalThis.CCapture({
                        format, workersPath: 'libs/', verbose: false, framerate: this.fps,
                        onProgress: (progress) => {
                            if (this.state === 'saving') this.notify('saving', Math.min(1, Math.max(0, progress)));
                        },
                    });
                    this.capturer.start();
                } else {
                    this.startWebm(canvas);
                }
            } catch (error) {
                this.finish(error);
            }
        });
    }

    startWebm(canvas) {
        const mimeType = getSupportedWebmMimeType();
        this.stream = canvas.captureStream(this.fps);
        this.recorder = new globalThis.MediaRecorder(this.stream, { mimeType });
        const chunks = [];
        this.recorder.ondataavailable = (event) => {
            if (event?.data?.size > 0) chunks.push(event.data);
        };
        this.recorder.onerror = (event) => this.finish(event.error || new Error('WebM recording failed.'));
        this.recorder.onstop = () => {
            if (!this.busy) return;
            try {
                if (!chunks.length) throw new Error('The browser did not produce a movie. Try GIF export instead.');
                const blob = new Blob(chunks, { type: this.recorder.mimeType || mimeType });
                this.download(window.URL.createObjectURL(blob), this.outputFilename);
                this.finish();
            } catch (error) {
                this.finish(error);
            }
        };
        // captureStream observes canvas renders. Start recording only after the
        // first tick, so loading/idle time is not prepended to the movie.
    }

    tick(timestamp) {
        if (!this.busy) return false;
        if (this.state === 'saving') return true;
        try {
            if (this.startedAt === null) {
                this.startedAt = Number.isFinite(timestamp) ? timestamp : performance.now();
                if (this.recorder) this.recorder.start();
            }
            const elapsed = Math.max(0, (Number.isFinite(timestamp) ? timestamp : performance.now()) - this.startedAt);
            const fraction = this.capturer ? this.frameCount / this.frameTarget : Math.min(1, elapsed / this.durationMs);
            this.renderPhase(this.savedState.phase + 2 * Math.PI * fraction);
            if (this.capturer) {
                this.capturer.capture(this.canvas());
                this.frameCount += 1;
                this.notify('capturing', this.frameCount / this.frameTarget);
                if (this.frameCount >= this.frameTarget) this.save();
            } else {
                this.notify('capturing', fraction);
                if (fraction >= 1) this.save();
            }
        } catch (error) {
            this.finish(error);
        }
        return true;
    }

    save() {
        const operation = this.operation;
        this.notify('saving', 0);
        this.saveTimer = this.setTimer(() => this.finish(new Error('Movie encoding timed out. Try a smaller structure or canvas.')), 120000);
        this.saveTimer?.unref?.();
        if (this.capturer) {
            const capturer = this.capturer;
            // Restore native timers before GIF workers encode and save.
            capturer.stop();
            this.capturer = null;
            capturer.save((url) => {
                if (this.state !== 'saving' || this.operation !== operation) return;
                try {
                    this.download(url, this.outputFilename);
                    this.finish();
                } catch (error) {
                    this.finish(error);
                }
            });
        } else {
            this.recorder.stop();
        }
    }

    finish(error) {
        if (!this.busy) return;
        const result = { format: this.format, filename: this.outputFilename };
        const resolve = this.resolve;
        const reject = this.reject;
        if (this.saveTimer !== null) this.clearTimer(this.saveTimer);
        this.saveTimer = null;
        if (this.capturer) {
            try { this.capturer.stop(); } catch (_) { /* Continue restoring playback. */ }
        }
        this.capturer = null;
        if (this.recorder) {
            this.recorder.onstop = this.recorder.onerror = this.recorder.ondataavailable = null;
            if (this.recorder.state !== 'inactive') {
                try { this.recorder.stop(); } catch (_) { /* Tracks are stopped below. */ }
            }
        }
        this.recorder = null;
        this.stream?.getTracks().forEach((track) => track.stop());
        this.stream = null;
        try {
            this.setState(this.savedState);
        } catch (restoreError) {
            error ||= restoreError;
        }
        this.savedState = null;
        this.format = null;
        this.notify('idle', 0);
        if (error) reject(error instanceof Error ? error : new Error(String(error)));
        else resolve(result);
    }
}
