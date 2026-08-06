// ============================================================================
// SMART SNAPPING SYSTEM
// ============================================================================

export class Snapping {
    constructor(state) {
        this.state = state;
        this.enabled = true;
        this.gridSnap = 0.5;
        this.rotationSnap = 15;
        this.scaleSnap = 0.1;
        this.smartSnap = {
            enabled: true,
            showGuides: true,
            snapToEdges: true,
            snapToCenters: true,
            distance: 0.35
        };
        this.guides = [];
        this.guideGroup = null;
    }

    init(scene) {
        this.guideGroup = new THREE.Group();
        this.guideGroup.name = 'SnappingGuides';
        scene.add(this.guideGroup);
    }

    snapValue(value, step) {
        if (!this.enabled || !step) return value;
        return Math.round(value / step) * step;
    }

    snapPosition(position) {
        if (!this.enabled) return position;
        return new THREE.Vector3(
            this.snapValue(position.x, this.gridSnap),
            this.snapValue(position.y, this.gridSnap),
            this.snapValue(position.z, this.gridSnap)
        );
    }

    snapRotation(euler) {
        if (!this.enabled) return euler;
        const snapRad = THREE.MathUtils.degToRad(this.rotationSnap);
        return new THREE.Euler(
            this.snapValue(euler.x, snapRad),
            this.snapValue(euler.y, snapRad),
            this.snapValue(euler.z, snapRad)
        );
    }

    snapScale(scale) {
        if (!this.enabled) return scale;
        return new THREE.Vector3(
            this.snapValue(scale.x, this.scaleSnap),
            this.snapValue(scale.y, this.scaleSnap),
            this.snapValue(scale.z, this.scaleSnap)
        );
    }

    findSnapTargets(object, objects) {
        if (!this.smartSnap.enabled || !objects?.length) return null;

        const box = new THREE.Box3().setFromObject(object);
        const center = box.getCenter(new THREE.Vector3());
        const targets = [];

        objects.forEach(other => {
            if (other === object) return;
            const otherBox = new THREE.Box3().setFromObject(other);
            const otherCenter = otherBox.getCenter(new THREE.Vector3());

            const dist = center.distanceTo(otherCenter);
            if (dist > this.smartSnap.distance * 10) return;

            if (this.smartSnap.snapToEdges) {
                ['x', 'y', 'z'].forEach(axis => {
                    const idx = ['x', 'y', 'z'].indexOf(axis);
                    const objMin = box.min.getComponent(idx);
                    const objMax = box.max.getComponent(idx);
                    const otherMin = otherBox.min.getComponent(idx);
                    const otherMax = otherBox.max.getComponent(idx);

                    const snaps = [
                        { value: otherMin, offset: objMin - otherMin },
                        { value: otherMax, offset: objMax - otherMax },
                        { value: (otherMin + otherMax) / 2, offset: center.getComponent(idx) - (otherMin + otherMax) / 2 }
                    ];

                    snaps.forEach(({ value, offset }) => {
                        if (Math.abs(offset) < this.smartSnap.distance) {
                            targets.push({
                                axis,
                                value,
                                offset,
                                type: 'edge',
                                object: other
                            });
                        }
                    });
                });
            }

            if (this.smartSnap.snapToCenters) {
                ['x', 'y', 'z'].forEach(axis => {
                    const idx = ['x', 'y', 'z'].indexOf(axis);
                    const offset = center.getComponent(idx) - otherCenter.getComponent(idx);
                    if (Math.abs(offset) < this.smartSnap.distance) {
                        targets.push({
                            axis,
                            value: otherCenter.getComponent(idx),
                            offset,
                            type: 'center',
                            object: other
                        });
                    }
                });
            }
        });

        return targets;
    }

    showGuides(targets) {
        this.clearGuides();
        if (!this.smartSnap.showGuides || !targets?.length) return;

        targets.forEach(target => {
            const points = [];
            const axis = ['x', 'y', 'z'].indexOf(target.axis);
            const size = 10;

            for (let i = -size / 2; i <= size / 2; i += 0.5) {
                const pos = new THREE.Vector3();
                pos.setComponent(axis, target.value);
                const otherAxes = ['x', 'y', 'z'].filter((_, idx) => idx !== axis);
                pos.setComponent(['x', 'y', 'z'].indexOf(otherAxes[0]), i);
                pos.setComponent(['x', 'y', 'z'].indexOf(otherAxes[1]), i * 0.5);
                points.push(pos);
            }

            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const material = new THREE.LineBasicMaterial({
                color: 0x54b8ff,
                transparent: true,
                opacity: 0.6,
                depthTest: false
            });
            const line = new THREE.Line(geometry, material);
            this.guideGroup.add(line);
            this.guides.push(line);
        });
    }

    clearGuides() {
        this.guides.forEach(guide => {
            this.guideGroup.remove(guide);
            guide.geometry?.dispose();
            guide.material?.dispose();
        });
        this.guides = [];
    }

    applySnap(object, objects) {
        const targets = this.findSnapTargets(object, objects);
        if (!targets) return null;

        const bestTargets = this.selectBestTargets(targets);
        bestTargets.forEach(target => {
            const idx = ['x', 'y', 'z'].indexOf(target.axis);
            object.position.setComponent(idx, target.value - target.offset);
        });

        this.showGuides(bestTargets);
        return bestTargets;
    }

    selectBestTargets(targets) {
        const best = {};
        targets.forEach(target => {
            if (!best[target.axis] || Math.abs(target.offset) < Math.abs(best[target.axis].offset)) {
                best[target.axis] = target;
            }
        });
        return Object.values(best);
    }

    toggle() {
        this.enabled = !this.enabled;
        if (!this.enabled) this.clearGuides();
        return this.enabled;
    }

    toggleSmartSnap() {
        this.smartSnap.enabled = !this.smartSnap.enabled;
        if (!this.smartSnap.enabled) this.clearGuides();
        return this.smartSnap.enabled;
    }
}