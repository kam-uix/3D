// ============================================================================
// PART SYSTEM - Object/Part/Face selection
// ============================================================================

export class PartSystem {
    constructor(state) {
        this.state = state;
        this.mode = 'object'; // 'object' | 'part' | 'face'
        this.selectedParts = [];
        this.selectedFaces = new Map(); // polymesh -> Set(faceIndex)
    }

    setMode(mode) {
        this.mode = mode;
        document.querySelectorAll('[data-selection-mode]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.selectionMode === mode);
        });

        if (mode === 'part') {
            this.selectedParts = [];
        } else if (mode === 'face') {
            this.selectedFaces.clear();
        }

        this.updateUI();
    }

    selectPart(mesh) {
        if (this.mode !== 'part') return;

        const polymesh = mesh.userData.polymesh;
        if (polymesh) {
            if (this.selectedParts.includes(mesh)) {
                this.selectedParts = this.selectedParts.filter(p => p !== mesh);
            } else {
                this.selectedParts.push(mesh);
            }
            this.updateUI();
        }
    }

    selectFace(polymesh, faceIndex) {
        if (this.mode !== 'face') return;

        if (!this.selectedFaces.has(polymesh)) {
            this.selectedFaces.set(polymesh, new Set());
        }

        const faces = this.selectedFaces.get(polymesh);
        if (faces.has(faceIndex)) {
            faces.delete(faceIndex);
            if (faces.size === 0) {
                this.selectedFaces.delete(polymesh);
            }
        } else {
            faces.add(faceIndex);
        }

        this.updateUI();
        this.highlightSelectedFaces();
    }

    highlightSelectedFaces() {
        // Remove old highlights
        document.querySelectorAll('.face-highlight').forEach(el => {
            el.remove();
        });

        this.selectedFaces.forEach((faces, polymesh) => {
            faces.forEach(faceIndex => {
                const geometry = polymesh.geometry;
                const pos = geometry.attributes.position;
                const idx = geometry.index;

                if (idx) {
                    const a = idx.getX(faceIndex * 3);
                    const b = idx.getX(faceIndex * 3 + 1);
                    const c = idx.getX(faceIndex * 3 + 2);

                    const points = [
                        new THREE.Vector3(pos.getX(a), pos.getY(a), pos.getZ(a)),
                        new THREE.Vector3(pos.getX(b), pos.getY(b), pos.getZ(b)),
                        new THREE.Vector3(pos.getX(c), pos.getY(c), pos.getZ(c))
                    ];

                    const geo = new THREE.BufferGeometry().setFromPoints(points);
                    const material = new THREE.MeshBasicMaterial({
                        color: 0xf05023,
                        transparent: true,
                        opacity: 0.3,
                        side: THREE.DoubleSide,
                        depthTest: false
                    });
                    const mesh = new THREE.Mesh(geo, material);
                    mesh.userData.faceHighlight = true;
                    polymesh.group.add(mesh);
                }
            });
        });
    }

    duplicateSelectedParts() {
        if (!this.selectedParts.length) return;

        const clones = [];
        this.selectedParts.forEach(part => {
            const polymesh = part.userData.polymesh;
            if (!polymesh) return;

            const clone = this.duplicatePart(polymesh, part);
            if (clone) clones.push(clone);
        });

        if (clones.length) {
            this.state.history.push({
                label: `Duplicate ${clones.length} part(s)`,
                undo: () => {
                    clones.forEach(c => {
                        c.group.parent.remove(c.group);
                    });
                },
                redo: () => {
                    clones.forEach(c => {
                        this.state.contentGroup.add(c.group);
                    });
                }
            });
        }

        this.updateUI();
    }

    duplicatePart(polymesh, part) {
        const geometry = part.geometry.clone();
        const material = part.material.clone();
        const newMesh = new THREE.Mesh(geometry, material);

        newMesh.position.copy(part.position);
        newMesh.quaternion.copy(part.quaternion);
        newMesh.scale.copy(part.scale);

        const newPolymesh = new Polymesh(newMesh);
        this.state.contentGroup.add(newPolymesh.group);

        return newPolymesh;
    }

    deleteSelectedParts() {
        if (!this.selectedParts.length) return;

        const deleted = [];
        this.selectedParts.forEach(part => {
            const polymesh = part.userData.polymesh;
            if (!polymesh) return;

            const idx = polymesh.group.children.indexOf(part);
            if (idx !== -1) {
                polymesh.group.remove(part);
                deleted.push({ polymesh, part });
            }
        });

        if (deleted.length) {
            this.state.history.push({
                label: `Delete ${deleted.length} part(s)`,
                undo: () => {
                    deleted.forEach(({ polymesh, part }) => {
                        polymesh.group.add(part);
                    });
                },
                redo: () => {
                    deleted.forEach(({ polymesh, part }) => {
                        polymesh.group.remove(part);
                    });
                }
            });
        }

        this.selectedParts = [];
        this.updateUI();
    }

    updateUI() {
        const countEl = document.getElementById('selected-parts-count');
        if (countEl) {
            const totalParts = this.selectedParts.length;
            const totalFaces = Array.from(this.selectedFaces.values()).reduce((sum, set) => sum + set.size, 0);
            countEl.textContent = this.mode === 'part' ? 
                `Parts: ${totalParts}` :
                this.mode === 'face' ? 
                `Faces: ${totalFaces}` :
                'Object mode';
        }
    }

    getSelectedParts() {
        return this.selectedParts;
    }

    getSelectedFaces() {
        return this.selectedFaces;
    }

    clear() {
        this.selectedParts = [];
        this.selectedFaces.clear();
        this.updateUI();
    }
}