const ICONS = {
    chevron: '<svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>',
    group: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 8h8v8H8z"/></svg>',
    mesh: '<svg viewBox="0 0 24 24"><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 7 9 5 9-5v10l-9 5-9-5V7Z"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24"><path d="m3 3 18 18"/><path d="M10.6 5.2A10.5 10.5 0 0 1 12 5c6.5 0 10 7 10 7a16 16 0 0 1-2.1 3.1M6.2 6.2C3.5 8.1 2 12 2 12s3.5 7 10 7a10 10 0 0 0 4.2-.9"/></svg>',
    lock: '<svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
    unlock: '<svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2m3 0-1 15H6L5 6m5 4v7m4-7v7"/></svg>'
};

function editableChildren(object) {
    return object.children.filter(child => !child.userData?.editorHelper && !child.userData?.faceHighlight && !child.userData?.isPolymeshElement);
}

function indexInParent(object) { return object.parent ? object.parent.children.indexOf(object) : -1; }

function restoreParent(object, parent, index) {
    if (!parent) return;
    parent.attach(object);
    const current = parent.children.indexOf(object);
    parent.children.splice(current, 1);
    parent.children.splice(Math.max(0, Math.min(index, parent.children.length)), 0, object);
    object.updateMatrixWorld(true);
}

export class ObjectManager {
    constructor(state, contentGroup) {
        this.state = state;
        this.contentGroup = contentGroup;
        this.panel = document.getElementById('object-manager-panel');
        this.isOpen = false;
        this.expanded = new Set([contentGroup.uuid]);
        this.dragged = null;
        document.getElementById('object-search')?.addEventListener('input', () => this.render());
    }

    toggle() { this.isOpen ? this.close() : this.open(); }
    open() { this.isOpen = true; this.panel?.classList.remove('hidden'); document.getElementById('le-btn-object-manager')?.classList.add('active'); this.refresh(); }
    close() { this.isOpen = false; this.panel?.classList.add('hidden'); document.getElementById('le-btn-object-manager')?.classList.remove('active'); }
    refresh() { if (this.isOpen) this.render(); }

    roots() { return editableChildren(this.contentGroup); }
    allObjects() {
        const result = [];
        const walk = object => { result.push(object); editableChildren(object).forEach(walk); };
        this.roots().forEach(walk);
        return result;
    }

    matches(object, query) {
        if (!query) return true;
        return (object.name || object.type || '').toLowerCase().includes(query) || editableChildren(object).some(child => this.matches(child, query));
    }

    render() {
        const list = document.getElementById('object-manager-list');
        if (!list) return;
        const query = (document.getElementById('object-search')?.value || '').trim().toLowerCase();
        list.replaceChildren();
        const roots = this.roots().filter(object => this.matches(object, query));
        roots.forEach(object => list.appendChild(this.createRow(object, 0, query)));
        if (!roots.length) {
            const empty = document.createElement('div');
            empty.className = 'om-empty'; empty.textContent = 'No objects found'; list.appendChild(empty);
        }
        const count = this.allObjects().length;
        const countEl = document.getElementById('object-manager-count');
        if (countEl) countEl.textContent = `${count} object${count === 1 ? '' : 's'}`;
    }

    createRow(object, depth, query) {
        const branch = document.createElement('div');
        const row = document.createElement('div');
        const children = editableChildren(object).filter(child => this.matches(child, query));
        const expanded = Boolean(query) || this.expanded.has(object.uuid);
        row.className = `object-row${this.state.multiSelect?.isSelected(object) ? ' selected' : ''}${object.userData.locked ? ' locked' : ''}`;
        row.style.setProperty('--om-depth', depth);
        row.draggable = !object.userData.locked;
        row.dataset.uuid = object.uuid;

        const disclosure = this.iconButton(children.length ? 'om-disclosure' : 'om-disclosure empty', 'Expand', ICONS.chevron);
        disclosure.classList.toggle('expanded', expanded);
        disclosure.addEventListener('click', event => {
            event.stopPropagation();
            this.expanded.has(object.uuid) ? this.expanded.delete(object.uuid) : this.expanded.add(object.uuid);
            this.render();
        });
        row.appendChild(disclosure);

        const type = document.createElement('span');
        type.className = 'om-type-icon'; type.innerHTML = object.isGroup ? ICONS.group : ICONS.mesh; row.appendChild(type);
        const name = document.createElement('span');
        name.className = 'object-name'; name.textContent = object.name || (object.isGroup ? 'Assembly' : 'Mesh'); row.appendChild(name);

        const actions = document.createElement('span'); actions.className = 'object-actions';
        const visibility = this.iconButton('', 'Toggle visibility', object.visible ? ICONS.eye : ICONS.eyeOff);
        visibility.addEventListener('click', event => { event.stopPropagation(); this.setVisible(object, !object.visible); });
        const lock = this.iconButton('', object.userData.locked ? 'Unlock' : 'Lock', object.userData.locked ? ICONS.lock : ICONS.unlock);
        lock.addEventListener('click', event => { event.stopPropagation(); this.setLocked(object, !object.userData.locked); });
        const remove = this.iconButton('danger', 'Delete', ICONS.trash);
        remove.addEventListener('click', event => { event.stopPropagation(); this.deleteObjects([object]); });
        actions.append(visibility, lock, remove); row.appendChild(actions);

        row.addEventListener('click', event => this.state.multiSelect?.selectObject(object, { additive: this.state.multiSelect.isActive(event), event }));
        row.addEventListener('dblclick', event => { event.stopPropagation(); this.renameObject(object, name); });
        this.bindDrag(row, object);
        branch.appendChild(row);
        if (children.length && expanded) children.forEach(child => branch.appendChild(this.createRow(child, depth + 1, query)));
        return branch;
    }

    iconButton(className, title, svg) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = className; button.title = title; button.innerHTML = svg; return button;
    }

    bindDrag(row, object) {
        row.addEventListener('dragstart', event => { this.dragged = object; row.classList.add('dragging'); event.dataTransfer.effectAllowed = 'move'; });
        row.addEventListener('dragend', () => { this.dragged = null; row.classList.remove('dragging'); this.panel?.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target')); });
        row.addEventListener('dragover', event => {
            if (!this.dragged || this.dragged === object || this.dragged.getObjectById(object.id) || object.userData.locked) return;
            event.preventDefault(); event.stopPropagation(); row.classList.add('drop-target'); event.dataTransfer.dropEffect = 'move';
        });
        row.addEventListener('dragleave', () => row.classList.remove('drop-target'));
        row.addEventListener('drop', event => {
            event.preventDefault(); event.stopPropagation(); row.classList.remove('drop-target');
            if (this.dragged) this.reparent(this.dragged, object.isGroup ? object : object.parent || this.contentGroup);
        });
    }

    reparent(object, newParent) {
        if (!object.parent || !newParent || object === newParent || object.getObjectById(newParent.id)) return;
        const oldParent = object.parent, oldIndex = indexInParent(object), newIndex = newParent.children.length;
        const apply = (parent, index) => { restoreParent(object, parent, index); this.expanded.add(parent.uuid); this.render(); this.state.syncEditor?.(); };
        apply(newParent, newIndex);
        this.state.history.push({ label: `Move "${object.name || 'Object'}"`, undo: () => apply(oldParent, oldIndex), redo: () => apply(newParent, newIndex) });
    }

    renameObject(object) {
        const oldName = object.name || '';
        const newName = prompt('Object name:', oldName)?.trim();
        if (!newName || newName === oldName) return;
        const apply = value => { object.name = value; this.render(); };
        apply(newName);
        this.state.history.push({ label: `Rename "${newName}"`, undo: () => apply(oldName), redo: () => apply(newName) });
    }

    setVisible(object, value) {
        const old = object.visible;
        const apply = next => { object.visible = next; this.render(); };
        apply(value);
        this.state.history.push({ label: `${value ? 'Show' : 'Hide'} "${object.name || 'Object'}"`, undo: () => apply(old), redo: () => apply(value) });
    }

    setLocked(object, value) {
        const old = Boolean(object.userData.locked);
        const apply = next => { object.userData.locked = next; if (next && this.state.multiSelect?.isSelected(object)) this.state.multiSelect.remove(object); this.render(); };
        apply(value);
        this.state.history.push({ label: `${value ? 'Lock' : 'Unlock'} "${object.name || 'Object'}"`, undo: () => apply(old), redo: () => apply(value) });
    }

    deleteObjects(objects) { this.state.deleteObjects?.(objects); }

    groupSelected() {
        const raw = (this.state.multiSelect?.getSelected() || []).filter(object => object.parent && !object.userData.locked);
        const selected = raw.filter(object => !raw.some(other => other !== object && other.getObjectById(object.id)));
        if (selected.length < 2) { this.state.setStatus?.('Select at least two unlocked objects'); return; }
        const commonParent = selected.every(object => object.parent === selected[0].parent) ? selected[0].parent : this.contentGroup;
        const records = selected.map(object => ({ object, parent: object.parent, index: indexInParent(object) }));
        const group = new THREE.Group(); group.name = 'Assembly'; group.userData.isAssembly = true;
        const create = () => { commonParent.add(group); selected.forEach(object => group.attach(object)); this.expanded.add(group.uuid); this.state.multiSelect.set([group]); this.refresh(); };
        const remove = () => { records.forEach(record => restoreParent(record.object, record.parent, record.index)); group.parent?.remove(group); this.state.multiSelect.set(selected); this.refresh(); };
        create();
        this.state.history.push({ label: `Group ${selected.length} objects`, undo: remove, redo: create });
    }

    ungroupSelected() {
        const groups = (this.state.multiSelect?.getSelected() || []).filter(object => object.isGroup && object !== this.contentGroup);
        if (!groups.length) { this.state.setStatus?.('Select an assembly to ungroup'); return; }
        const records = groups.map(group => ({ group, parent: group.parent, index: indexInParent(group), children: [...group.children] }));
        const ungroup = () => { const result = []; records.forEach(record => { record.children.forEach(child => { record.parent.attach(child); result.push(child); }); record.parent.remove(record.group); }); this.state.multiSelect.set(result); this.refresh(); };
        const regroup = () => { records.forEach(record => { restoreParent(record.group, record.parent, record.index); record.children.forEach(child => record.group.attach(child)); }); this.state.multiSelect.set(groups); this.refresh(); };
        ungroup();
        this.state.history.push({ label: `Ungroup ${groups.length} assembly`, undo: regroup, redo: ungroup });
    }

    showAll() {
        const hidden = this.allObjects().filter(object => !object.visible);
        if (!hidden.length) return;
        hidden.forEach(object => { object.visible = true; }); this.render();
        this.state.history.push({ label: 'Show all objects', undo: () => { hidden.forEach(object => { object.visible = false; }); this.render(); }, redo: () => { hidden.forEach(object => { object.visible = true; }); this.render(); } });
    }
}
