import { captureTransformState, applyTransformState, statesEqual } from './history.js';

export class TransformInputs {
    constructor(state) { this.state = state; this.target = null; this.before = null; this.editing = false; }

    bind() {
        const groups = [
            { prefix: 'position', label: 'Move', property: 'position', convert: value => value },
            { prefix: 'rotation', label: 'Rotate', property: 'rotation', convert: value => THREE.MathUtils.degToRad(value) },
            { prefix: 'scale', label: 'Scale', property: 'scale', convert: value => value, validate: value => value > 0 }
        ];
        groups.forEach(group => ['X', 'Y', 'Z'].forEach((suffix, index) => {
            const input = document.getElementById(`input-${group.prefix}${suffix}`); if (!input) return;
            input.addEventListener('focus', () => {
                this.editing = true; this.target = this.activeTransformTarget();
                this.before = captureTransformState(this.state.getTransformObjects?.() || (this.target ? [this.target] : []));
                this.state.beginProgrammaticTransform?.();
            });
            input.addEventListener('input', () => {
                if (!this.target) return;
                const value = Number.parseFloat(input.value); if (!Number.isFinite(value) || (group.validate && !group.validate(value))) return;
                this.target[group.property][['x', 'y', 'z'][index]] = group.convert(value);
                this.target.updateMatrixWorld(true); this.state.applyProgrammaticTransform?.(); this.state.syncEditor?.();
            });
            const finish = () => {
                if (!this.editing) return;
                this.editing = false; this.state.endProgrammaticTransform?.();
                const after = captureTransformState(this.state.getTransformObjects?.() || []);
                if (this.before?.length && !statesEqual(this.before, after)) {
                    const before = this.before;
                    const apply = snapshot => { applyTransformState(snapshot); this.state.rebuildSelectionPivot?.(); this.state.syncEditor?.(); };
                    this.state.history.push({ label: `${group.label} selection`, undo: () => apply(before), redo: () => apply(after) });
                }
                this.target = null; this.before = null; this.update();
            };
            input.addEventListener('change', finish); input.addEventListener('blur', finish);
        }));
    }

    update(target = this.activeTransformTarget()) {
        if (this.editing) return;
        const fields = ['positionX','positionY','positionZ','rotationX','rotationY','rotationZ','scaleX','scaleY','scaleZ'];
        if (!target) { fields.forEach(id => { const input = document.getElementById(`input-${id}`); if (input) input.value = ''; }); return; }
        const values = [target.position.x, target.position.y, target.position.z,
            THREE.MathUtils.radToDeg(target.rotation.x), THREE.MathUtils.radToDeg(target.rotation.y), THREE.MathUtils.radToDeg(target.rotation.z),
            target.scale.x, target.scale.y, target.scale.z];
        fields.forEach((id, i) => { const input = document.getElementById(`input-${id}`); if (input) input.value = values[i].toFixed(i >= 3 && i < 6 ? 1 : 3); });
    }

    activeTransformTarget() { return this.state.getTransformTarget?.() || null; }
}
