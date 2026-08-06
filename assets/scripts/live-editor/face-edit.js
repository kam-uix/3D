import { capturePolymeshState, applyPolymeshState } from './history.js';

export class FaceEdit {
    constructor(state) {
        this.state = state;
        this.active = false;
        this.polymesh = null;
        this.selectedFaces = new Set();
        this.highlights = new THREE.Group();
        this.highlights.name = 'Face selection';
        this.highlights.userData.editorHelper = true;
        this.panel = document.getElementById('face-edit-panel');
    }

    toggle() { this.active ? this.close() : this.open(); }

    open(polymesh = this.state.activePolymesh) {
        if (!polymesh) {
            const mesh = this.state.multiSelect?.getSelected().find(object => object.userData?.polymesh);
            polymesh = mesh?.userData.polymesh || null;
        }
        if (!polymesh) { this.state.setStatus?.('Generate or select a polymesh first'); return; }
        this.active = true; this.polymesh = polymesh; this.selectedFaces.clear();
        polymesh.group.add(this.highlights);
        this.panel?.classList.remove('hidden');
        document.getElementById('le-btn-face-edit')?.classList.add('active');
        this.state.transformControls?.detach();
        this.state.transformControls.visible = false;
        this.state.setStatus?.('Face Edit — click a face; Shift+click adds or removes faces');
        this.updateUI();
    }

    close() {
        this.clearSelection(); this.highlights.parent?.remove(this.highlights);
        this.active = false; this.polymesh = null;
        this.panel?.classList.add('hidden');
        document.getElementById('le-btn-face-edit')?.classList.remove('active');
        this.state.applyObjectSelection?.(this.state.multiSelect?.getSelected() || []);
        this.state.setStatus?.('Face Edit closed');
    }

    selectFace(faceIndex, additive = false) {
        if (!this.active || !this.polymesh || faceIndex == null) return;
        if (!additive) this.selectedFaces.clear();
        if (additive && this.selectedFaces.has(faceIndex)) this.selectedFaces.delete(faceIndex);
        else this.selectedFaces.add(faceIndex);
        this.highlightFaces(); this.updateUI();
    }

    highlightFaces() {
        this.clearHighlightMeshes();
        const index = this.polymesh.geometry.index;
        const position = this.polymesh.geometry.attributes.position;
        this.selectedFaces.forEach(faceIndex => {
            const vertices = [0, 1, 2].map(offset => index.getX(faceIndex * 3 + offset));
            const points = vertices.map(vertex => new THREE.Vector3(position.getX(vertex), position.getY(vertex), position.getZ(vertex)));
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            geometry.setIndex([0, 1, 2]);
            const material = new THREE.MeshBasicMaterial({ color: 0xf05023, transparent: true, opacity: 0.48, side: THREE.DoubleSide, depthTest: false });
            const highlight = new THREE.Mesh(geometry, material);
            highlight.renderOrder = 20; highlight.userData.editorHelper = true;
            this.highlights.add(highlight);
        });
    }

    clearHighlightMeshes() {
        [...this.highlights.children].forEach(child => { this.highlights.remove(child); child.geometry?.dispose(); child.material?.dispose(); });
    }

    extrudeFaces(distance = 0.5) {
        if (!this.active || !this.polymesh || !this.selectedFaces.size || !Number.isFinite(distance)) return;
        const before = capturePolymeshState(this.polymesh);
        const position = this.polymesh.geometry.attributes.position;
        const index = this.polymesh.geometry.index;
        const movements = new Map();
        this.selectedFaces.forEach(faceIndex => {
            const ids = [0, 1, 2].map(offset => index.getX(faceIndex * 3 + offset));
            const a = new THREE.Vector3().fromBufferAttribute(position, ids[0]);
            const b = new THREE.Vector3().fromBufferAttribute(position, ids[1]);
            const c = new THREE.Vector3().fromBufferAttribute(position, ids[2]);
            const normal = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
            ids.forEach(id => {
                const entry = movements.get(id) || { normal: new THREE.Vector3(), count: 0 };
                entry.normal.add(normal); entry.count++; movements.set(id, entry);
            });
        });
        movements.forEach((entry, id) => {
            entry.normal.divideScalar(entry.count).normalize().multiplyScalar(distance);
            position.setXYZ(id, position.getX(id) + entry.normal.x, position.getY(id) + entry.normal.y, position.getZ(id) + entry.normal.z);
        });
        position.needsUpdate = true;
        this.polymesh.geometry.computeVertexNormals(); this.polymesh.geometry.computeBoundingBox(); this.polymesh.geometry.computeBoundingSphere();
        const after = capturePolymeshState(this.polymesh);
        const refresh = snapshot => { applyPolymeshState(snapshot); this.highlightFaces(); this.state.dimensionsUI?.update(); };
        this.state.history.push({ label: `Extrude ${this.selectedFaces.size} face(s)`, undo: () => refresh(before), redo: () => refresh(after) });
        this.highlightFaces(); this.state.dimensionsUI?.update();
    }

    clearSelection() { this.selectedFaces.clear(); this.clearHighlightMeshes(); this.updateUI(); }
    updateUI() {
        const count = this.selectedFaces.size;
        const label = document.getElementById('selected-faces-count'); if (label) label.textContent = `${count} face${count === 1 ? '' : 's'} selected`;
        ['fe-extrude', 'fe-clear'].forEach(id => { const button = document.getElementById(id); if (button) button.disabled = !count; });
    }
    isActive() { return this.active; }
    getSelectedFaces() { return new Set(this.selectedFaces); }
}
