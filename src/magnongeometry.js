import * as THREE from 'three';

// Radii are world-space lengths in Å; the arrow multiplier changes only length.
export const SPIN_APPEARANCE_DEFAULTS = Object.freeze({
    arrowScale: 1,
    arrowColor: '#336ca6',
    shaftRadius: 0.05,
    coneRadius: 0.125,
    coneFraction: 0.25,
    centeredArrows: false,
    arrowsVisible: true,
    showTipPaths: false,
    tipPathRadius: 0.015,
});

export function spinArrowLayout(length, coneFraction, centered) {
    const tail = centered ? -length / 2 : 0;
    const headLength = length * coneFraction;
    const shaftLength = length - headLength;
    return {
        tail,
        tip: tail + length,
        shaftLength,
        shaftCenter: tail + shaftLength / 2,
        headLength,
        headCenter: tail + length - headLength / 2,
    };
}

export class SpinTipCurve extends THREE.Curve {
    constructor(equilibrium, polarization, amplitude, lengthScale, centered) {
        super();
        const scale = lengthScale * (centered ? 0.5 : 1);
        this.center = new THREE.Vector3(...equilibrium).multiplyScalar(scale);
        this.cosine = new THREE.Vector3(...polarization.map((z) => z[0])).multiplyScalar(amplitude * scale);
        this.sine = new THREE.Vector3(...polarization.map((z) => z[1])).multiplyScalar(amplitude * scale);
    }

    getPoint(t, target = new THREE.Vector3()) {
        const phase = 2 * Math.PI * t;
        return target.copy(this.center)
            .addScaledVector(this.cosine, Math.cos(phase))
            .addScaledVector(this.sine, Math.sin(phase));
    }

    getTangent(t, target = new THREE.Vector3()) {
        const phase = 2 * Math.PI * t;
        return target.copy(this.cosine).multiplyScalar(-Math.sin(phase))
            .addScaledVector(this.sine, Math.cos(phase)).normalize();
    }
}

// A full-period path is independent of a cell's Bloch phase, so translated
// copies of one magnetic site can share this geometry. Do not normalize spins:
// an ellipse may have a longitudinal component, or degenerate to a line/point.
export function createSpinTipPathGeometry(equilibrium, polarization, amplitude, lengthScale, centered, radius) {
    const curve = new SpinTipCurve(equilibrium, polarization, amplitude, lengthScale, centered);
    const a = curve.cosine;
    const b = curve.sine;
    const a2 = a.lengthSq();
    const b2 = b.lengthSq();
    const extent2 = a2 + b2;
    if (extent2 < 1e-18 || radius <= 0) return null;

    const area2 = new THREE.Vector3().crossVectors(a, b).lengthSq();
    if (area2 <= extent2 * extent2 * 1e-12) {
        // TubeGeometry needs a nonzero tangent. A linearly polarized mode
        // retraces a segment and has zero tangent at its turning points.
        const direction = (a2 >= b2 ? a : b).clone().normalize();
        const geometry = new THREE.CylinderGeometry(radius, radius, 2 * Math.sqrt(extent2), 8);
        geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction));
        geometry.translate(curve.center.x, curve.center.y, curve.center.z);
        return geometry;
    }
    return new THREE.TubeGeometry(curve, 64, radius, 8, true);
}
