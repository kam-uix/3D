// ============================================================================
// DIMENSIONS & POSITION UI (read-only)
// ============================================================================

export class DimensionsUI {
    constructor(state) {
        this.state = state;
        this.target = null;
    }

    bind() {
        // Dimensions are read-only
        ['dimX', 'dimY', 'dimZ', 'centerX', 'centerY', 'centerZ'].forEach(id => {
            const input = document.getElementById(`input-${id}`);
            if (input) {
                input.readOnly = true;
                input.className += ' bg-ln-gray-50';
            }
        });
    }

    update(target = this.activeTarget()) {
        if (!target) {
            ['dimX', 'dimY', 'dimZ', 'centerX', 'centerY', 'centerZ'].forEach(id => {
                const input = document.getElementById(`input-${id}`);
                if (input) input.value = '';
            });
            return;
        }

        // Compute bounding box
        const box = new THREE.Box3().setFromObject(target);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        // Dimensions
        document.getElementById('input-dimX').value = size.x.toFixed(3);
        document.getElementById('input-dimY').value = size.y.toFixed(3);
        document.getElementById('input-dimZ').value = size.z.toFixed(3);

        // Center
        document.getElementById('input-centerX').value = center.x.toFixed(3);
        document.getElementById('input-centerY').value = center.y.toFixed(3);
        document.getElementById('input-centerZ').value = center.z.toFixed(3);
    }

    activeTarget() {
        // Check if a polymesh is active
        if (this.state.activePolymesh) {
            return this.state.activePolymesh.group;
        }

        // Check multi-select
        const selected = this.state.multiSelect?.getSelected() || [];
        if (selected.length === 1) {
            return selected[0];
        }

        // Check candidate mesh
        if (this.state.candidateMesh) {
            return this.state.candidateMesh;
        }

        return null;
    }
}