import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import { MagnonCrystal, SPIN_APPEARANCE_DEFAULTS } from '../src/magnoncrystal.js';
import { createSpinTipPathGeometry, SpinTipCurve, spinArrowLayout } from '../src/magnongeometry.js';
import { parseMagnonJson, spinAtPhase } from '../src/magnonjson.js';

function near(actual, expected, tolerance = 1e-10) {
    assert.ok(actual.distanceTo(expected) < tolerance, `${actual.toArray()} != ${expected.toArray()}`);
}

function setup() {
    const viewer = new MagnonCrystal();
    viewer.scene = new THREE.Scene();
    viewer.camera = new THREE.PerspectiveCamera();
    viewer.setMagnon(parseMagnonJson({
        format: 'magnonwebsite', version: 1,
        units: { length: 'angstrom', energy: 'meV', spin: 'hbar' },
        phase_convention: 'cell-periodic', time_convention: 'exp(-iwt)',
        lattice: [[3, 0, 0], [0, 3, 0], [0, 0, 3]],
        atom_types: ['Fe'], atom_pos_red: [[0, 0, 0]],
        magnetic_atom_indices: [0], spin_vectors: [[0, 0, 2]],
        qpoints: [[0.25, 0, 0]], energies: [[1, 2]],
        vectors: [[[[[1, 0], [0, -0.6], [0.2, 0]]], [[[0, 0], [0.3, 0], [0, 0.1]]]]],
        repetitions: [2, 1, 1],
    }));
    return viewer;
}

describe('Magnon arrow geometry and tip paths', () => {
    it('allocates the requested fraction of the full arrow to the cone', () => {
        const layout = spinArrowLayout(8, 0.375, true);
        assert.equal(layout.tail, -4);
        assert.equal(layout.tip, 4);
        assert.equal(layout.shaftLength, 5);
        assert.equal(layout.headLength, 3);
        assert.equal(layout.shaftCenter, -1.5);
        assert.equal(layout.headCenter, 2.5);
    });

    it('traces the true 3D elliptic polarization, including longitudinal motion', () => {
        const spin = [0, 0, 2];
        const polarization = [[1, 0.3], [0, -0.5], [0.2, 0.4]];
        const curve = new SpinTipCurve(spin, polarization, 0.7, 1.8, false);
        const centered = new SpinTipCurve(spin, polarization, 0.7, 1.8, true);
        const data = { spin_vectors: [spin], vectors: [[[polarization]]], qpoints: [[0, 0, 0]] };
        for (const t of [0, 0.125, 0.25, 0.71, 1]) {
            const expected = new THREE.Vector3(...spinAtPhase(data, 0, 0, 0, [0, 0, 0], 2 * Math.PI * t, 0.7)).multiplyScalar(1.8);
            near(curve.getPoint(t), expected);
            near(centered.getPoint(t), expected.multiplyScalar(0.5));
        }
        near(curve.getPoint(0), curve.getPoint(1));
    });

    it('handles linearly polarized and stationary modes without invented circles or NaNs', () => {
        const line = createSpinTipPathGeometry([0, 0, 1], [[1, 2], [0, 0], [0, 0]], 1, 1, false, 0.02);
        assert.equal(line.type, 'CylinderGeometry');
        line.computeBoundingBox();
        assert.ok(Math.abs(line.boundingBox.max.x - Math.sqrt(5)) < 1e-6);
        assert.ok(Math.abs(line.boundingBox.min.x + Math.sqrt(5)) < 1e-6);
        assert.ok(Array.from(line.attributes.position.array).every(Number.isFinite));
        line.dispose();
        assert.equal(createSpinTipPathGeometry([0, 0, 1], [[0, 0], [0, 0], [0, 0]], 1, 1, false, 0.02), null);
        assert.equal(createSpinTipPathGeometry([0, 0, 1], [[1, 0], [0, 1], [0, 0]], 0, 1, false, 0.02), null);
    });

    it('keeps the arrow tail or midpoint on its atom throughout precession', () => {
        const viewer = setup();
        for (const centered of [false, true]) {
            viewer.setSpinAppearance({ centeredArrows: centered, arrowScale: 1.4, shaftRadius: 0.07, coneRadius: 0.21, coneFraction: 0.4 });
            for (const phase of [0, 0.87, 2.3]) {
                viewer.phase = phase;
                viewer.render();
                viewer.scene.updateMatrixWorld(true);
                for (const { group, stem, head, site, cell } of viewer.spinArrows) {
                    const vector = new THREE.Vector3(...spinAtPhase(viewer.magnon, 0, 0, site, cell, phase, viewer.amplitude * viewer.modeScale));
                    vector.multiplyScalar(viewer.lengthPerSpin * viewer.arrowScale);
                    const tip = head.localToWorld(new THREE.Vector3(0, 0.5, 0));
                    const tail = stem.localToWorld(new THREE.Vector3(0, -0.5, 0));
                    near(tip, group.position.clone().addScaledVector(vector, centered ? 0.5 : 1));
                    near(tail, group.position.clone().addScaledVector(vector, centered ? -0.5 : 0));
                    assert.equal(stem.scale.x, 0.07);
                    assert.equal(head.scale.x, 0.21);
                }
            }
        }
        viewer.removeStructure();
    });

    it('shares paths across cells and rebuilds only when their trajectory changes', () => {
        const viewer = setup();
        viewer.setSpinAppearance({ showTipPaths: true });
        assert.equal(viewer.tipPaths.length, 2);
        const original = viewer.tipPaths[0].geometry;
        assert.equal(viewer.tipPaths[1].geometry, original);
        let disposals = 0;
        original.addEventListener('dispose', () => { disposals++; });
        viewer.phase = 1.2;
        viewer.render();
        viewer.setSpinAppearance({ arrowColor: '#ef1234', shaftRadius: 0.08, coneFraction: 0.4 });
        assert.equal(viewer.tipPaths[0].geometry, original);
        assert.equal(viewer.tipPaths[0].material, viewer.spinMaterial);
        assert.equal(viewer.spinMaterial.color.getHexString(), 'ef1234');
        assert.equal(disposals, 0);
        viewer.amplitude = 0.4;
        viewer.render();
        assert.notEqual(viewer.tipPaths[0].geometry, original);
        assert.equal(disposals, 1);
        const resized = viewer.tipPaths[0].geometry;
        viewer.setMode(0, 1);
        assert.notEqual(viewer.tipPaths[0].geometry, resized);
        const differentMode = viewer.tipPaths[0].geometry;
        viewer.setSpinAppearance({ centeredArrows: false });
        assert.notEqual(viewer.tipPaths[0].geometry, differentMode);
        viewer.removeStructure();
    });

    it('disposes shared resources once and preserves appearance through structure rebuilds', () => {
        const viewer = setup();
        viewer.setSpinAppearance({ showTipPaths: true, arrowColor: '#123456', centeredArrows: true, arrowScale: 2 });
        const resources = [...viewer.spinResources, ...viewer.tipPathResources];
        const disposals = resources.map(() => 0);
        resources.forEach((resource, i) => resource.addEventListener('dispose', () => { disposals[i]++; }));
        viewer.shading = false;
        viewer.updateStructure();
        assert.deepEqual(disposals, resources.map(() => 1));
        assert.equal(viewer.spinMaterial.type, 'MeshBasicMaterial');
        assert.equal(viewer.spinMaterial.color.getHexString(), '123456');
        assert.equal(viewer.arrowScale, 2);
        assert.equal(viewer.centeredArrows, true);
        assert.equal(viewer.tipPaths.length, 2);
        assert.equal(viewer.scene.children.filter((object) => object.name === 'spin').length, 2);
        viewer.setSpinAppearance({ showTipPaths: false });
        assert.equal(viewer.tipPaths.length, 0);
        assert.equal(viewer.scene.children.filter((object) => object.name === 'spin-tip-path').length, 0);
        viewer.removeStructure();
        assert.deepEqual(disposals, resources.map(() => 1));
    });

    it('hides arrows independently of paths and resets every arrow style field', () => {
        const viewer = setup();
        viewer.setSpinAppearance({ arrowsVisible: false, showTipPaths: true, arrowScale: 2, centeredArrows: true });
        assert.ok(viewer.spinArrows.every(({ group }) => !group.visible));
        assert.equal(viewer.tipPaths.length, 2);
        viewer.resetSpinAppearance();
        assert.deepEqual(viewer.getSpinAppearance(), SPIN_APPEARANCE_DEFAULTS);
        assert.ok(viewer.spinArrows.every(({ group }) => group.visible));
        assert.equal(viewer.tipPaths.length, 2);
        viewer.removeStructure();
    });
});
