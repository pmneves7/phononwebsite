import * as THREE from 'three';
import { StructureViewer } from './structureviewer.js';
import { modeDisplayScale, spinAtPhase } from './magnonjson.js';

const yAxis = new THREE.Vector3(0, 1, 0);

export class MagnonCrystal extends StructureViewer {
    constructor() {
        super();
        this.magnon = null;
        this.spinArrows = [];
        this.spinResources = [];
        this.k = 0;
        this.band = 0;
        this.phase = 0;
        this.amplitude = 0.2;
        this.speed = 0.5;
        this.arrowScale = 1;
        this.paused = false;
        this.lastTime = null;
        this.onPhase = null;
        this.defaultAtomRadiusScale = 0.6;
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
        this.spinArrows = [];
        super.updateStructure();
        if (!this.scene || !this.magnon || !this.geometricCenter) return;
        const data = this.magnon;
        const shaft = new THREE.CylinderGeometry(1, 1, 0.75, 10);
        const tip = new THREE.ConeGeometry(2.5, 0.25, 12);
        const material = this.createShadedMaterial({ color: 0x336ca6 });
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
                        stem.position.y = 0.375;
                        const head = new THREE.Mesh(tip, material);
                        head.position.y = 0.875;
                        group.add(stem, head);
                        group.name = 'spin';
                        const cell = [ix, iy, iz];
                        group.position.set(...data.atom_pos_car[atom].map((x, axis) =>
                            x + cell.reduce((s, n, j) => s + n * data.lattice[j][axis], 0)));
                        group.position.sub(this.geometricCenter);
                        this.scene.add(group);
                        this.spinArrows.push({ group, site, cell });
                    });
                }
            }
        }
        this.render();
    }

    removeStructure() {
        // The shared base disposes top-level meshes. Spin meshes are children of
        // groups and share resources, so release each resource exactly once.
        for (const resource of this.spinResources) resource.dispose();
        this.spinResources = [];
        super.removeStructure();
    }

    animate(timestamp) {
        requestAnimationFrame((time) => this.animate(time));
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
            for (const { group, site, cell } of this.spinArrows) {
                vector.set(...spinAtPhase(this.magnon, this.k, this.band, site, cell, this.phase, this.amplitude * this.modeScale));
                const length = vector.length() * this.lengthPerSpin * this.arrowScale;
                group.visible = length > 1e-9;
                if (!group.visible) continue;
                group.quaternion.setFromUnitVectors(yAxis, vector.normalize());
                const radius = Math.max(0.025, this.lengthPerSpin * 0.035) * this.arrowScale;
                group.scale.set(radius, length, radius);
            }
        }
        super.render();
    }
}
