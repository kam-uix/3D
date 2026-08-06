function cloneForEditor(source, preview = false) {
    const clone = source.clone(true);
    clone.name = preview ? `${source.name || 'Object'} preview` : `${source.name || 'Object'} copy`;
    clone.userData = { ...source.userData, editorHelper: preview, arrayCopy: !preview };
    clone.traverse(child => {
        child.userData = { ...child.userData, editorHelper: preview };
        if (child.isMesh) {
            child.material = Array.isArray(child.material) ? child.material.map(material => material.clone()) : child.material?.clone();
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            if (preview) materials.filter(Boolean).forEach(material => { material.transparent = true; material.opacity = 0.24; material.depthWrite = false; });
        }
    });
    return clone;
}

export class Tiling {
    constructor(state) {
        this.state = state; this.mode = 'grid'; this.previewObjects = [];
        this.panel = document.getElementById('tiling-panel'); this.isOpen = false;
        this.gridSettings = { countX: 3, countZ: 3, spacingX: 2, spacingZ: 2 };
        this.radialSettings = { count: 8, radius: 5 };
        this.layerSettings = { countY: 1, spacingY: 2 };
    }

    toggle() { this.isOpen ? this.close() : this.open(); }
    open() { this.isOpen = true; this.panel?.classList.remove('hidden'); document.getElementById('le-btn-tiling')?.classList.add('active'); this.updateUI(); this.preview(); }
    close() { this.isOpen = false; this.panel?.classList.add('hidden'); document.getElementById('le-btn-tiling')?.classList.remove('active'); this.clearPreview(); }
    source() { const selection = this.state.multiSelect?.getSelected() || []; return selection.length === 1 ? selection[0] : null; }

    placements() {
        const result = [];
        const layers = Math.max(1, this.layerSettings.countY | 0);
        for (let y = 0; y < layers; y++) {
            const dy = y * this.layerSettings.spacingY;
            if (this.mode === 'grid') {
                const sx = this.gridSettings, cx = Math.max(1, sx.countX | 0), cz = Math.max(1, sx.countZ | 0);
                for (let z = 0; z < cz; z++) for (let x = 0; x < cx; x++) {
                    const offset = new THREE.Vector3((x - (cx - 1) / 2) * sx.spacingX, dy, (z - (cz - 1) / 2) * sx.spacingZ);
                    if (y === 0 && offset.lengthSq() < 1e-10) continue;
                    result.push({ offset, rotationY: 0 });
                }
            } else {
                const count = Math.max(1, this.radialSettings.count | 0);
                for (let i = y === 0 ? 1 : 0; i < count; i++) {
                    const angle = i * Math.PI * 2 / count;
                    result.push({ offset: new THREE.Vector3(Math.cos(angle) * this.radialSettings.radius, dy, Math.sin(angle) * this.radialSettings.radius), rotationY: -angle });
                }
            }
        }
        return result;
    }

    place(clone, source, placement) {
        clone.position.copy(source.position).add(placement.offset);
        clone.quaternion.copy(source.quaternion);
        if (this.mode === 'radial') clone.rotateY(placement.rotationY);
        clone.scale.copy(source.scale);
    }

    createArray(source = this.source()) {
        if (!source || source.userData.locked) { this.state.setStatus?.('Select exactly one unlocked object for the array'); return []; }
        this.clearPreview();
        const parent = source.parent || this.state.contentGroup;
        const clones = this.placements().map(placement => { const clone = cloneForEditor(source); this.place(clone, source, placement); parent.add(clone); return clone; });
        if (!clones.length) { this.state.setStatus?.('Array settings create no additional copies'); return []; }
        const add = () => { clones.forEach(clone => parent.add(clone)); this.state.multiSelect?.set(clones); this.state.objectManager?.refresh(); };
        const remove = () => { clones.forEach(clone => clone.parent?.remove(clone)); this.state.multiSelect?.set([source]); this.state.objectManager?.refresh(); };
        this.state.multiSelect?.set(clones);
        this.state.history.push({ label: `Create ${this.mode} array (${clones.length} copies)`, undo: remove, redo: add });
        this.state.setStatus?.(`Created ${clones.length} array copies`); this.close(); return clones;
    }

    preview() {
        this.clearPreview();
        const source = this.source(); if (!source) { this.updateUI(); return; }
        const parent = source.parent || this.state.contentGroup;
        this.previewObjects = this.placements().map(placement => { const clone = cloneForEditor(source, true); this.place(clone, source, placement); parent.add(clone); return clone; });
        this.updateUI(); this.state.setStatus?.(`Array preview: ${this.previewObjects.length} copies`);
    }

    clearPreview() {
        this.previewObjects.forEach(object => { object.parent?.remove(object); object.traverse(child => { const materials = Array.isArray(child.material) ? child.material : [child.material]; materials.filter(Boolean).forEach(material => material.dispose()); }); });
        this.previewObjects.length = 0;
    }

    updateUI() {
        const count = this.source() ? this.placements().length : 0;
        const label = document.getElementById('tiling-count'); if (label) label.textContent = `${count} copies`;
        document.getElementById('tiling-mode-grid')?.classList.toggle('active', this.mode === 'grid');
        document.getElementById('tiling-mode-radial')?.classList.toggle('active', this.mode === 'radial');
        const grid = document.getElementById('grid-settings'); if (grid) grid.style.display = this.mode === 'grid' ? 'flex' : 'none';
        const radial = document.getElementById('radial-settings'); if (radial) radial.style.display = this.mode === 'radial' ? 'flex' : 'none';
    }
    setMode(mode) { if (!['grid', 'radial'].includes(mode)) return; this.mode = mode; this.preview(); }
    setGridSettings(settings) { Object.assign(this.gridSettings, settings); this.preview(); }
    setRadialSettings(settings) { Object.assign(this.radialSettings, settings); this.preview(); }
    setLayerSettings(settings) { Object.assign(this.layerSettings, settings); this.preview(); }
}
