// Unified object selection shared by the canvas, gizmo and Object Manager.
export class MultiSelect {
    constructor(state) {
        this.state = state;
        this.enabled = false;
        this.selected = new Set();
    }

    toggle() {
        this.enabled = !this.enabled;
        document.getElementById('le-btn-multiselect')?.classList.toggle('active', this.enabled);
        this.state.setStatus?.(`Multi-select ${this.enabled ? 'enabled' : 'disabled'} (Shift also works)`);
        return this.enabled;
    }

    isActive(event = null) {
        return this.enabled || Boolean(event?.shiftKey);
    }

    selectObject(object, options = {}) {
        if (!object || object.userData?.editorHelper || object.userData?.locked) return;
        const additive = options.additive ?? this.isActive(options.event);
        const toggle = options.toggle ?? additive;

        if (!additive) this.selected.clear();
        if (toggle && this.selected.has(object)) this.selected.delete(object);
        else this.selected.add(object);
        this.commit(options.primary || object);
    }

    set(objects, primary = null) {
        this.selected = new Set((objects || []).filter(Boolean));
        this.commit(primary || this.getSelected().at(-1) || null);
    }

    remove(object) {
        this.selected.delete(object);
        this.commit(this.getSelected().at(-1) || null);
    }

    prune() {
        for (const object of this.selected) {
            if (!object.parent || !this.state.contentGroup.getObjectById(object.id)) this.selected.delete(object);
        }
    }

    commit(primary = null) {
        this.prune();
        this.state.applyObjectSelection?.(this.getSelected(), primary);
        const count = this.selected.size;
        const countEl = document.getElementById('selected-count');
        if (countEl) countEl.textContent = `${count} object${count === 1 ? '' : 's'} selected`;
        this.state.transformInputs?.update();
        this.state.dimensionsUI?.update();
        this.state.objectManager?.refresh();
        this.state.tiling?.updateUI();
    }

    clear() {
        this.selected.clear();
        this.commit(null);
    }

    getSelected() { return [...this.selected]; }
    isSelected(object) { return this.selected.has(object); }
    getCount() { return this.selected.size; }
}
