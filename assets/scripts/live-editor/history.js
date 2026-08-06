// Command history used by every mutating Live Editor action.
export class History {
    constructor(onChange = null) {
        this.undoStack = [];
        this.redoStack = [];
        this.limit = 150;
        this.running = false;
        this.onChange = onChange;
        this.updateButtons();
    }

    push(command) {
        if (this.running || !command?.undo || !command?.redo) return;
        this.undoStack.push(command);
        if (this.undoStack.length > this.limit) this.undoStack.shift();
        this.redoStack.length = 0;
        this.updateButtons();
    }

    execute(command) {
        if (!command?.redo) return;
        command.redo();
        this.push(command);
    }

    run(from, to) {
        const command = from.pop();
        if (!command || this.running) return;
        this.running = true;
        try {
            (from === this.undoStack ? command.undo : command.redo)();
            to.push(command);
        } finally {
            this.running = false;
            this.updateButtons();
        }
        return command;
    }

    undo() { return this.run(this.undoStack, this.redoStack); }
    redo() { return this.run(this.redoStack, this.undoStack); }
    clear() { this.undoStack.length = 0; this.redoStack.length = 0; this.updateButtons(); }

    updateButtons() {
        const undo = document.getElementById('le-btn-undo');
        const redo = document.getElementById('le-btn-redo');
        if (undo) { undo.disabled = !this.undoStack.length; undo.classList.toggle('disabled', !this.undoStack.length); undo.dataset.tip = this.undoStack.length ? `Undo: ${this.undoStack.at(-1).label}` : 'Undo'; }
        if (redo) { redo.disabled = !this.redoStack.length; redo.classList.toggle('disabled', !this.redoStack.length); redo.dataset.tip = this.redoStack.length ? `Redo: ${this.redoStack.at(-1).label}` : 'Redo'; }
        this.onChange?.(this);
    }

    canUndo() { return Boolean(this.undoStack.length); }
    canRedo() { return Boolean(this.redoStack.length); }
}

export function captureTransformState(objects) {
    return objects.filter(Boolean).map(object => ({
        object,
        position: object.position.clone(),
        quaternion: object.quaternion.clone(),
        scale: object.scale.clone()
    }));
}

export function applyTransformState(states) {
    states.forEach(({ object, position, quaternion, scale }) => {
        object.position.copy(position);
        object.quaternion.copy(quaternion);
        object.scale.copy(scale);
        object.updateMatrixWorld(true);
    });
}

export function capturePolymeshState(polymesh) {
    return { polymesh, positions: polymesh.geometry.attributes.position.array.slice() };
}

export function applyPolymeshState(snapshot) {
    const position = snapshot.polymesh.geometry.attributes.position;
    position.array.set(snapshot.positions);
    position.needsUpdate = true;
    snapshot.polymesh.geometry.computeVertexNormals();
    snapshot.polymesh.geometry.computeBoundingBox();
    snapshot.polymesh.geometry.computeBoundingSphere();
}

export function statesEqual(a, b, epsilon = 1e-5) {
    if (a.length !== b.length) return false;
    const near = (x, y) => Math.abs(x - y) <= epsilon;
    return a.every((value, i) => {
        const next = b[i];
        return value.object === next.object &&
            near(value.position.x, next.position.x) && near(value.position.y, next.position.y) && near(value.position.z, next.position.z) &&
            near(value.quaternion.x, next.quaternion.x) && near(value.quaternion.y, next.quaternion.y) && near(value.quaternion.z, next.quaternion.z) && near(value.quaternion.w, next.quaternion.w) &&
            near(value.scale.x, next.scale.x) && near(value.scale.y, next.scale.y) && near(value.scale.z, next.scale.z);
    });
}
