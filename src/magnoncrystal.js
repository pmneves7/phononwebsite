import * as THREE from 'three';
import { StructureViewer } from './structureviewer.js';
import { modeDisplayScale, spinAtPhase } from './magnonjson.js';
import { SPIN_APPEARANCE_DEFAULTS, spinArrowLayout, createSpinTipPathGeometry } from './magnongeometry.js';

export { SPIN_APPEARANCE_DEFAULTS } from './magnongeometry.js';

const yAxis = new THREE.Vector3(0, 1, 0);

export class MagnonCrystal extends StructureViewer {
    constructor() {
        super();
        this.magnon = null;
        this.spinArrows = [];
        this.spinResources = [];
        this.tipPaths = [];
        this.tipPathResources = [];
        this.tipPathKey = null;
        this.k = 0;
        this.band = 0;
        this.phase = 0;
        this.amplitude = 0.2;
        this.speed = 0.5;
        Object.assign(this, SPIN_APPEARANCE_DEFAULTS);
        this.paused = false;
        this.lastTime = null;
        this.onPhase = null;
        this.defaultAtomRadiusScale = 0.6;
    }

    getSpinAppearance() {
        return Object.fromEntries(Object.keys(SPIN_APPEARANCE_DEFAULTS).map((key) => [key, this[key]]));
    }

    setSpinAppearance(changes) {
        const limits = {
            arrowScale: [0, 20], shaftRadius: [0, 10], coneRadius: [0, 10],
            coneFraction: [0, 1], tipPathRadius: [0, 10],
        };
        for (const key of Object.keys(SPIN_APPEARANCE_DEFAULTS)) {
            if (!(key in changes)) continue;
            if (key in limits) {
                const value = Number(changes[key]);
                if (Number.isFinite(value)) this[key] = Math.min(limits[key][1], Math.max(limits[key][0], value));
            } else if (key === 'arrowColor') {
                if (typeof changes[key] === 'string' && /^#[0-9a-f]{6}$/i.test(changes[key])) this[key] = changes[key];
            } else {
                this[key] = Boolean(changes[key]);
            }
        }
        if (this.spinMaterial) this.spinMaterial.color.set(this.arrowColor);
        this.render();
        return this.getSpinAppearance();
    }

    resetSpinAppearance() {
        return this.setSpinAppearance(SPIN_APPEARANCE_DEFAULTS);
    }

    setMagnon(data) {
        this.magnon = data;
        this.k = 0;
        this.band = 0;
        this.phase = 0;
        this.modeScale = modeDisplayScale(data, 0, 0);
        [this.nx, this.ny, this.nz] = data.repetitions;
        if (data.natoms * this.nx * this.ny * this.nz > 2000) [this.nx, this.ny, this.nz] = [1, 1, 1];
        this.atomRadiusScaleOverrides = {};
        data.atom_numbers.forEach((n) => { this.atomRadiusScaleOverrides[n] = 0.6; });
        this.setData({
            lat: data.lattice,
            atoms: data.atom_pos_car.map((position, i) => [i, ...position]),
            atom_numbers: data.atom_numbers,
        });
    }

    setMode(k, band) {
        this.k = k;
        this.band = band;
        this.phase = 0;
        this.modeScale = modeDisplayScale(this.magnon, k, band);
        this.render();
    }

    initializeBondRulesFromAtoms() {
        // Bonds are decoration; avoid the shared all-pairs 2×2×2 probe for
        // large magnetic cells. Spin and atom data are still fully displayed.
        if (this.baseAtoms.length > 128) {
            this.bondRules = {};
            return;
        }
        super.initializeBondRulesFromAtoms();
    }

    updateViewParameters() {
        super.updateViewParameters();
        // The shared fit uses the vertical field of view. A narrow panel needs
        // extra distance to show long chains along the horizontal direction.
        this.cameraDistance *= 1.1 / Math.min(1, this.dimensions?.ratio || 1);
        if (this.camera) {
            // An oblique view exposes arrows ordered along any Cartesian axis.
            this.camera.position.set(0.6, -1.5, 1).normalize().multiplyScalar(this.cameraDistance);
            this.camera.up.set(0, 0, 1);
        }
    }

    updateStructure() {
        super.updateStructure();
        if (!this.scene || !this.magnon || !this.geometricCenter) return;
        const data = this.magnon;
        const shaft = new THREE.CylinderGeometry(1, 1, 1, 10);
        const tip = new THREE.ConeGeometry(1, 1, 12);
        const material = this.createShadedMaterial({ color: this.arrowColor });
        this.spinMaterial = material;
        this.spinResources = [shaft, tip, material];
        let separation = Infinity;
        for (let i = 0; i < data.atom_pos_car.length; i++) {
            for (let j = i + 1; j < data.atom_pos_car.length; j++) {
                const distance = Math.hypot(...data.atom_pos_car[i].map((x, a) => x - data.atom_pos_car[j][a]));
                if (distance > 1e-6) separation = Math.min(separation, distance);
            }
        }
        separation = Math.min(separation, ...data.lattice.map((a) => Math.hypot(...a)));
        this.lengthPerSpin = 0.65 * separation / Math.max(1, ...data.spin_vectors.map((s) => Math.hypot(...s)));
        for (let ix = 0; ix < this.nx; ix++) {
            for (let iy = 0; iy < this.ny; iy++) {
                for (let iz = 0; iz < this.nz; iz++) {
                    data.magnetic_atom_indices.forEach((atom, site) => {
                        const group = new THREE.Group();
                        const stem = new THREE.Mesh(shaft, material);
                        const head = new THREE.Mesh(tip, material);
                        group.add(stem, head);
                        group.name = 'spin';
                        const cell = [ix, iy, iz];
                        group.position.set(...data.atom_pos_car[atom].map((x, axis) =>
                            x + cell.reduce((s, n, j) => s + n * data.lattice[j][axis], 0)));
                        group.position.sub(this.geometricCenter);
                        this.scene.add(group);
                        this.spinArrows.push({ group, stem, head, site, cell });
                    });
                }
            }
        }
        this.render();
    }

    removeStructure() {
        this.removeTipPaths();
        // The shared base disposes top-level meshes. Spin meshes are children of
        // groups and share resources, so release each resource exactly once.
        for (const resource of this.spinResources) resource.dispose();
        this.spinResources = [];
        this.spinMaterial = null;
        this.spinArrows = [];
        super.removeStructure();
    }

    removeTipPaths() {
        for (const path of this.tipPaths) path.removeFromParent();
        for (const resource of this.tipPathResources) resource.dispose();
        this.tipPaths = [];
        this.tipPathResources = [];
        this.tipPathKey = null;
    }

    updateTipPaths() {
        if (!this.magnon || !this.scene || !this.spinMaterial || !this.spinArrows.length) return;
        const key = [this.k, this.band, this.amplitude, this.modeScale, this.lengthPerSpin,
            this.arrowScale, this.centeredArrows, this.showTipPaths, this.tipPathRadius].join(',');
        if (this.tipPathKey === key) return;
        this.removeTipPaths();
        this.tipPathKey = key;
        if (!this.showTipPaths) return;
        const geometries = this.magnon.spin_vectors.map((spin, site) => createSpinTipPathGeometry(
            spin, this.magnon.vectors[this.k][this.band][site], this.amplitude * this.modeScale,
            this.lengthPerSpin * this.arrowScale, this.centeredArrows, this.tipPathRadius,
        ));
        this.tipPathResources = geometries.filter(Boolean);
        for (const { group, site } of this.spinArrows) {
            if (!geometries[site]) continue;
            const path = new THREE.Mesh(geometries[site], this.spinMaterial);
            path.name = 'spin-tip-path';
            path.position.copy(group.position);
            this.scene.add(path);
            this.tipPaths.push(path);
        }
    }

    animate(timestamp) {
        const requestFrame = this.movieCapture?.requestFrame || requestAnimationFrame;
        requestFrame((time) => this.animate(time));
        if (this.movieCapture?.tick(timestamp)) {
            this.lastTime = null;
            return;
        }
        if (this.lastTime != null && timestamp != null && !this.paused && this.magnon?.energies[this.k][this.band] > 0) {
            const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
            this.phase = (this.phase + dt * this.speed * 2 * Math.PI) % (2 * Math.PI);
        }
        this.lastTime = timestamp;
        this.update();
        if (!this.paused) this.render();
        if (this.onPhase) this.onPhase(this.phase);
    }

    render() {
        if (this.magnon) {
            const vector = new THREE.Vector3();
            for (const { group, stem, head, site, cell } of this.spinArrows) {
                vector.set(...spinAtPhase(this.magnon, this.k, this.band, site, cell, this.phase, this.amplitude * this.modeScale));
                const length = vector.length() * this.lengthPerSpin * this.arrowScale;
                group.visible = this.arrowsVisible && length > 1e-9;
                if (!group.visible) continue;
                group.quaternion.setFromUnitVectors(yAxis, vector.normalize());
                const layout = spinArrowLayout(length, this.coneFraction, this.centeredArrows);
                stem.visible = layout.shaftLength > 0 && this.shaftRadius > 0;
                stem.scale.set(this.shaftRadius, layout.shaftLength, this.shaftRadius);
                stem.position.y = layout.shaftCenter;
                head.visible = layout.headLength > 0 && this.coneRadius > 0;
                head.scale.set(this.coneRadius, layout.headLength, this.coneRadius);
                head.position.y = layout.headCenter;
            }
            this.updateTipPaths();
        }
        super.render();
    }
}
