// ============================================================================
// KAM3D Live Editor – Polymesh Editor (Light Theme) - wersja r128
// ============================================================================

// Używamy globalnego THREE z CDN
const OrbitControls = THREE.OrbitControls;
const TransformControls = THREE.TransformControls;
const GLTFLoader = THREE.GLTFLoader;
const GLTFExporter = THREE.GLTFExporter;

// ============================================================================
// GLOBAL STATE
// ============================================================================

const state = {
    scene: null,
    camera: null,
    renderer: null,
    orbitControls: null,
    transformControls: null,
    contentGroup: null,

    // Systems
    history: null,
    objectManager: null,
    snapping: null,
    partSystem: null,
    faceEdit: null,
    tiling: null,
    transformInputs: null,
    dimensionsUI: null,
    multiSelect: null,

    // State
    importedRoots: [],
    polymeshes: [],
    candidateMesh: null,
    candidateOutline: null,
    selectedRoot: null,
    activePolymesh: null,
    dragState: null,
    lastHighlightedPolymesh: null,
    faceHighlightMesh: null,
    selectionPivot: null,
    selectionHelpers: [],
    transformSnapshot: null,
    pivotSnapshot: null,

    raycaster: new THREE.Raycaster(),
    dragPlane: new THREE.Plane(),
    pointerNDC: new THREE.Vector2(),

    VERTEX_PICK_PX: 11,
    EDGE_PICK_PX: 8,

    statusbar: null,
    emptystate: null,
    generateBtn: null,
    toolButtons: [],
    fileInput: null,
    importBtn: null,
    exportBtn: null,
    deleteBtn: null,
    
    _initialRenderDone: false,
};

// ============================================================================
// SCENE / RENDERER / CAMERA
// ============================================================================

const container = document.getElementById('live-editor-canvas');

function getContainerSize() {
    const rect = container.getBoundingClientRect();
    return {
        width: rect.width || container.clientWidth || window.innerWidth,
        height: rect.height || container.clientHeight || window.innerHeight
    };
}

const size = getContainerSize();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf3f4f6);
scene.fog = new THREE.Fog(0xf3f4f6, 30, 90);
state.scene = scene;

const camera = new THREE.PerspectiveCamera(50, size.width / size.height, 0.01, 2000);
camera.position.set(5, 5, 5);
camera.lookAt(0, 0, 0);
state.camera = camera;

const renderer = new THREE.WebGLRenderer({ 
    antialias: true,
    alpha: false
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(size.width, size.height);
renderer.setViewport(0, 0, size.width, size.height);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

renderer.domElement.style.width = '100%';
renderer.domElement.style.height = '100%';
renderer.domElement.style.display = 'block';
renderer.domElement.style.position = 'absolute';
renderer.domElement.style.top = '0';
renderer.domElement.style.left = '0';
renderer.domElement.style.pointerEvents = 'auto';

state.renderer = renderer;

// ============================================================================
// LIGHTING
// ============================================================================

const ambientLight = new THREE.AmbientLight(0xffffff, 2.0);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 3.0);
dirLight.position.set(10, 15, 10);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);

const fillLight = new THREE.DirectionalLight(0x8899ff, 1.0);
fillLight.position.set(-10, 5, -10);
scene.add(fillLight);

const backLight = new THREE.DirectionalLight(0xffffff, 0.8);
backLight.position.set(-5, 5, -10);
scene.add(backLight);

const bottomLight = new THREE.DirectionalLight(0x4466ff, 0.5);
bottomLight.position.set(0, -5, 0);
scene.add(bottomLight);

const frontLight = new THREE.DirectionalLight(0xffffff, 0.6);
frontLight.position.set(0, 8, 15);
scene.add(frontLight);

// Ground grid
const grid = new THREE.GridHelper(40, 40, 0xd1d5db, 0xe5e7eb);
grid.position.y = -0.01;
scene.add(grid);

// Content group
const contentGroup = new THREE.Group();
contentGroup.name = 'Scene';
scene.add(contentGroup);
state.contentGroup = contentGroup;

// ============================================================================
// CONTROLS
// ============================================================================

const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.enableDamping = true;
orbitControls.dampingFactor = 0.08;
orbitControls.target.set(0, 0.5, 0);
state.orbitControls = orbitControls;

const transformControls = new TransformControls(camera, renderer.domElement);
transformControls.setSize(0.9);
scene.add(transformControls);
transformControls.enabled = false;
transformControls.visible = false;

transformControls.addEventListener('dragging-changed', (e) => {
    orbitControls.enabled = !e.value;
});
function captureObjectTransforms(objects) {
    return objects.map(object => ({ object, position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone() }));
}
function restoreObjectTransforms(snapshot) {
    snapshot.forEach(value => { value.object.position.copy(value.position); value.object.quaternion.copy(value.quaternion); value.object.scale.copy(value.scale); value.object.updateMatrixWorld(true); });
    rebuildSelectionPivot(); syncEditor();
}
function transformsChanged(a, b) {
    return a.length !== b.length || a.some((value, index) => !value.position.equals(b[index].position) || !value.quaternion.equals(b[index].quaternion) || !value.scale.equals(b[index].scale));
}
transformControls.addEventListener('mouseDown', () => {
    const objects = getTransformObjects();
    state.transformSnapshot = captureObjectTransforms(objects);
    if (objects.length > 1) beginProgrammaticTransform();
});
transformControls.addEventListener('objectChange', () => {
    if (getTransformObjects().length > 1) applyProgrammaticTransform();
    syncEditor();
});
transformControls.addEventListener('mouseUp', () => {
    const before = state.transformSnapshot;
    const after = captureObjectTransforms(getTransformObjects());
    endProgrammaticTransform(); state.transformSnapshot = null;
    if (before?.length && transformsChanged(before, after)) {
        const mode = transformControls.getMode?.() || transformControls.mode || 'transform';
        state.history?.push({ label: `${mode[0].toUpperCase() + mode.slice(1)} selection`, undo: () => restoreObjectTransforms(before), redo: () => restoreObjectTransforms(after) });
    }
});
state.transformControls = transformControls;

// ============================================================================
// UI REFERENCES
// ============================================================================

state.statusbar = document.getElementById('le-statusbar');
state.emptystate = document.getElementById('le-emptystate');
state.generateBtn = document.getElementById('le-btn-generate');
state.deleteBtn = document.getElementById('le-btn-delete');
state.toolButtons = [
    document.getElementById('le-btn-move'),
    document.getElementById('le-btn-rotate'),
    document.getElementById('le-btn-scale')
];
state.fileInput = document.getElementById('le-fileInput');
state.importBtn = document.getElementById('le-btn-import');
state.exportBtn = document.getElementById('le-btn-export');

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function setStatus(text) {
    if (state.statusbar) state.statusbar.textContent = text;
}

state.setStatus = setStatus;

function clearSelectionHelpers() {
    state.selectionHelpers.forEach(helper => { helper.parent?.remove(helper); helper.geometry?.dispose(); helper.material?.dispose(); });
    state.selectionHelpers.length = 0;
}

function selectedObjects() {
    return state.multiSelect?.getSelected() || [];
}

function getTransformObjects() {
    return selectedObjects().filter(object => object.parent && !object.userData?.locked);
}

function makeSelectionPivot(objects) {
    if (!state.selectionPivot) {
        state.selectionPivot = new THREE.Object3D();
        state.selectionPivot.name = 'Selection Pivot';
        state.selectionPivot.userData.editorHelper = true;
        scene.add(state.selectionPivot);
    }
    const center = new THREE.Vector3();
    objects.forEach(object => center.add(new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3())));
    center.divideScalar(objects.length || 1);
    state.selectionPivot.position.copy(center);
    state.selectionPivot.quaternion.identity();
    state.selectionPivot.scale.set(1, 1, 1);
    state.selectionPivot.updateMatrixWorld(true);
    return state.selectionPivot;
}

function getTransformTarget() {
    const objects = getTransformObjects();
    if (objects.length === 1) return objects[0];
    if (objects.length > 1) return state.pivotSnapshot && state.selectionPivot ? state.selectionPivot : makeSelectionPivot(objects);
    return state.activePolymesh?.group || null;
}

function beginProgrammaticTransform() {
    const objects = getTransformObjects();
    if (objects.length < 2) return;
    const pivot = makeSelectionPivot(objects);
    state.pivotSnapshot = {
        inverse: pivot.matrixWorld.clone().invert(),
        worlds: objects.map(object => ({ object, matrix: object.matrixWorld.clone() }))
    };
}

function applyProgrammaticTransform() {
    if (!state.pivotSnapshot || getTransformObjects().length < 2) return;
    state.selectionPivot.updateMatrixWorld(true);
    const delta = state.selectionPivot.matrixWorld.clone().multiply(state.pivotSnapshot.inverse);
    state.pivotSnapshot.worlds.forEach(entry => {
        const world = delta.clone().multiply(entry.matrix);
        const local = entry.object.parent.matrixWorld.clone().invert().multiply(world);
        local.decompose(entry.object.position, entry.object.quaternion, entry.object.scale);
        entry.object.updateMatrixWorld(true);
    });
}

function endProgrammaticTransform() { state.pivotSnapshot = null; }

function rebuildSelectionPivot() {
    const objects = getTransformObjects();
    if (objects.length > 1) makeSelectionPivot(objects);
}

function applyObjectSelection(objects, primary = null) {
    clearAllHighlights();
    removeCandidateOutline();
    clearSelectionHelpers();
    const selected = objects.filter(object => object?.parent && !object.userData?.editorHelper);
    primary = selected.includes(primary) ? primary : selected.at(-1) || null;
    state.candidateMesh = primary?.isMesh && !primary.userData?.isPolymeshElement ? primary : null;
    state.selectedRoot = primary;
    state.activePolymesh = primary?.userData?.polymesh || null;
    selected.forEach(object => {
        const helper = new THREE.BoxHelper(object, 0xf05023);
        helper.material.depthTest = false; helper.renderOrder = 12; helper.userData.editorHelper = true;
        scene.add(helper); state.selectionHelpers.push(helper);
    });
    const target = getTransformTarget();
    state.transformControls.detach();
    if (target && !state.faceEdit?.isActive()) {
        state.transformControls.attach(target);
        state.transformControls.enabled = true;
        state.transformControls.visible = state.toolButtons.some(button => button?.classList.contains('active'));
    } else {
        state.transformControls.enabled = false; state.transformControls.visible = false;
    }
    updateGenerateButtonState();
    state.transformInputs?.update(target); state.dimensionsUI?.update(primary || target);
    setStatus(selected.length ? `${selected.length} object${selected.length === 1 ? '' : 's'} selected` : (state.importedRoots.length ? 'Click an object to select it' : 'Import a .glb file to begin'));
}

function syncEditor() {
    state.selectionHelpers.forEach(helper => helper.update());
    state.transformInputs?.update(); state.dimensionsUI?.update(); state.objectManager?.refresh();
}

Object.assign(state, { applyObjectSelection, getTransformObjects, getTransformTarget, beginProgrammaticTransform, applyProgrammaticTransform, endProgrammaticTransform, rebuildSelectionPivot, syncEditor });

function refreshEmptyState() {
    if (state.emptystate) {
        const hasContent = state.contentGroup?.children.some(child => !child.userData?.editorHelper);
        state.emptystate.style.display = hasContent ? 'none' : 'block';
    }
}

// ============================================================================
// POLYMESH CLASS
// ============================================================================

function weldByPosition(geometry, tolerance = 1e-5) {
    const source = geometry.index ? geometry.toNonIndexed() : geometry;
    const posAttr = source.attributes.position;
    const uvAttr = source.attributes.uv;
    const count = posAttr.count;
    const precision = Math.max(0, Math.round(-Math.log10(tolerance)));

    const newPositions = [];
    const newUVs = uvAttr ? [] : null;
    const indices = new Array(count);
    const map = new Map();

    for (let i = 0; i < count; i++) {
        const x = posAttr.getX(i), y = posAttr.getY(i), z = posAttr.getZ(i);
        const key = x.toFixed(precision) + '_' + y.toFixed(precision) + '_' + z.toFixed(precision);
        let idx = map.get(key);
        if (idx === undefined) {
            idx = newPositions.length / 3;
            newPositions.push(x, y, z);
            if (newUVs) newUVs.push(uvAttr.getX(i), uvAttr.getY(i));
            map.set(key, idx);
        }
        indices[i] = idx;
    }

    const welded = new THREE.BufferGeometry();
    welded.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    if (newUVs) welded.setAttribute('uv', new THREE.Float32BufferAttribute(newUVs, 2));
    welded.setIndex(indices);
    return welded;
}

function pickPolymeshMaterial(sourceMaterial) {
    const mat = Array.isArray(sourceMaterial) ? sourceMaterial[0] : sourceMaterial;
    if (!mat) {
        return new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.65, metalness: 0.05, side: THREE.DoubleSide });
    }
    const clone = mat.clone();
    clone.side = THREE.DoubleSide;
    return clone;
}

function pointSegmentDistance(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq > 0 ? ((px - x1) * dx + (py - y1) * dy) / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = x1 + t * dx, cy = y1 + t * dy;
    return Math.hypot(px - cx, py - cy);
}

class Polymesh {
    constructor(sourceMesh) {
        this.geometry = weldByPosition(sourceMesh.geometry);
        this.geometry.computeVertexNormals();

        const posAttr = this.geometry.attributes.position;
        this.vertexCount = posAttr.count;

        this.faces = [];
        this.vertexFaces = Array.from({ length: this.vertexCount }, () => []);
        this.vertexEdges = Array.from({ length: this.vertexCount }, () => []);
        const edgeMap = new Map();

        const addEdge = (v1, v2, faceIdx) => {
            const key = v1 < v2 ? (v1 + '_' + v2) : (v2 + '_' + v1);
            let e = edgeMap.get(key);
            if (!e) { e = { v1: Math.min(v1, v2), v2: Math.max(v1, v2), faces: [] }; edgeMap.set(key, e); }
            e.faces.push(faceIdx);
            return key;
        };

        const idx = this.geometry.index.array;
        const faceCount = idx.length / 3;
        for (let f = 0; f < faceCount; f++) {
            const a = idx[f * 3], b = idx[f * 3 + 1], c = idx[f * 3 + 2];
            this.faces.push({ a, b, c });
            this.vertexFaces[a].push(f);
            this.vertexFaces[b].push(f);
            this.vertexFaces[c].push(f);
            addEdge(a, b, f);
            addEdge(b, c, f);
            addEdge(c, a, f);
        }

        this.edges = Array.from(edgeMap.values());
        this.edges.forEach((e, i) => e.index = i);
        for (const e of this.edges) {
            this.vertexEdges[e.v1].push(e.index);
            this.vertexEdges[e.v2].push(e.index);
        }

        this.faceMaterial = pickPolymeshMaterial(sourceMesh.material);
        this.mesh = new THREE.Mesh(this.geometry, this.faceMaterial);
        this.mesh.userData.isPolymeshElement = true;
        this.mesh.userData.polymesh = this;

        this.pointsGeometry = new THREE.BufferGeometry();
        this.pointsGeometry.setAttribute('position', this.geometry.attributes.position);
        const ptColors = new Float32Array(this.vertexCount * 3).fill(1);
        this.pointsGeometry.setAttribute('color', new THREE.Float32BufferAttribute(ptColors, 3));
        this.pointsMaterial = new THREE.PointsMaterial({
            color: 0xf05023, vertexColors: true, size: 6, sizeAttenuation: false, depthTest: false, transparent: true
        });
        this.points = new THREE.Points(this.pointsGeometry, this.pointsMaterial);
        this.points.renderOrder = 3;
        this.points.userData.isPolymeshElement = true;

        this.lineGeometry = new THREE.BufferGeometry();
        this.lineGeometry.setAttribute('position', this.geometry.attributes.position);
        const edgeIndex = new Uint32Array(this.edges.length * 2);
        this.edges.forEach((e, i) => { edgeIndex[i * 2] = e.v1; edgeIndex[i * 2 + 1] = e.v2; });
        this.lineGeometry.setIndex(new THREE.BufferAttribute(edgeIndex, 1));
        const lnColors = new Float32Array(this.vertexCount * 3).fill(0.6);
        this.lineGeometry.setAttribute('color', new THREE.Float32BufferAttribute(lnColors, 3));
        this.lineMaterial = new THREE.LineBasicMaterial({
            color: 0x6b7280, vertexColors: true, depthTest: false, transparent: true, opacity: 0.85
        });
        this.lines = new THREE.LineSegments(this.lineGeometry, this.lineMaterial);
        this.lines.renderOrder = 2;
        this.lines.userData.isPolymeshElement = true;

        this.group = new THREE.Group();
        this.group.add(this.mesh, this.lines, this.points);
        this.group.userData.isPolymeshGroup = true;
        this.group.userData.polymesh = this;
        this.group.name = sourceMesh.name || 'Polymesh';
    }

    translateVertices(vertexIndices, localDelta) {
        const pos = this.geometry.attributes.position;
        for (const vi of vertexIndices) {
            pos.setXYZ(vi, pos.getX(vi) + localDelta.x, pos.getY(vi) + localDelta.y, pos.getZ(vi) + localDelta.z);
        }
        pos.needsUpdate = true;
        this.geometry.computeVertexNormals();
        this.geometry.computeBoundingSphere();
        this.geometry.computeBoundingBox();
    }

    vertexWorldPosition(vi, target) {
        const pos = this.geometry.attributes.position;
        target.set(pos.getX(vi), pos.getY(vi), pos.getZ(vi));
        return target.applyMatrix4(this.group.matrixWorld);
    }

    resetHighlight() {
        const ptColor = this.pointsGeometry.attributes.color;
        const lnColor = this.lineGeometry.attributes.color;
        for (let i = 0; i < this.vertexCount; i++) {
            ptColor.setXYZ(i, 1, 1, 1);
            lnColor.setXYZ(i, 0.6, 0.6, 0.6);
        }
        ptColor.needsUpdate = true;
        lnColor.needsUpdate = true;
    }

    highlightVertex(vi) {
        const c = this.pointsGeometry.attributes.color;
        c.setXYZ(vi, 1, 0.72, 0.3);
        c.needsUpdate = true;
    }

    highlightEdge(v1, v2) {
        const c = this.lineGeometry.attributes.color;
        c.setXYZ(v1, 1, 0.72, 0.3);
        c.setXYZ(v2, 1, 0.72, 0.3);
        c.needsUpdate = true;
    }

    dispose() {
        this.geometry.dispose();
        this.pointsGeometry.dispose();
        this.lineGeometry.dispose();
        this.faceMaterial.dispose();
        this.pointsMaterial.dispose();
        this.lineMaterial.dispose();
    }
}

// ============================================================================
// FACE HIGHLIGHT
// ============================================================================

function ensureFaceHighlightMesh() {
    if (state.faceHighlightMesh) return state.faceHighlightMesh;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(9), 3));
    const mat = new THREE.MeshBasicMaterial({
        color: 0xf05023, transparent: true, opacity: 0.35, depthTest: false, side: THREE.DoubleSide
    });
    state.faceHighlightMesh = new THREE.Mesh(geo, mat);
    state.faceHighlightMesh.renderOrder = 4;
    state.faceHighlightMesh.userData.isPolymeshElement = true;
    state.faceHighlightMesh.visible = false;
    return state.faceHighlightMesh;
}

function updateFaceHighlight(pm, face) {
    const fh = ensureFaceHighlightMesh();
    if (fh.parent !== pm.group) pm.group.add(fh);
    const pos = pm.geometry.attributes.position;
    const arr = fh.geometry.attributes.position.array;
    arr[0] = pos.getX(face.a); arr[1] = pos.getY(face.a); arr[2] = pos.getZ(face.a);
    arr[3] = pos.getX(face.b); arr[4] = pos.getY(face.b); arr[5] = pos.getZ(face.b);
    arr[6] = pos.getX(face.c); arr[7] = pos.getY(face.c); arr[8] = pos.getZ(face.c);
    fh.geometry.attributes.position.needsUpdate = true;
    fh.geometry.computeBoundingSphere();
    fh.visible = true;
}

function hideFaceHighlight() {
    if (state.faceHighlightMesh) state.faceHighlightMesh.visible = false;
}

function clearAllHighlights() {
    if (state.lastHighlightedPolymesh) state.lastHighlightedPolymesh.resetHighlight();
    state.lastHighlightedPolymesh = null;
    hideFaceHighlight();
}

// ============================================================================
// SELECTION FUNCTIONS
// ============================================================================

function updateGenerateButtonState() {
    if (state.activePolymesh) {
        state.generateBtn.classList.remove('disabled');
        state.generateBtn.classList.add('active');
        state.generateBtn.dataset.tip = 'Exit Editing';
    } else if (state.candidateMesh) {
        state.generateBtn.classList.remove('disabled');
        state.generateBtn.classList.remove('active');
        state.generateBtn.dataset.tip = 'Generate Polymesh';
    } else {
        state.generateBtn.classList.add('disabled');
        state.generateBtn.classList.remove('active');
        state.generateBtn.dataset.tip = 'Generate Polymesh';
    }
}

function removeCandidateOutline() {
    if (state.candidateOutline) {
        if (state.candidateOutline.parent) state.candidateOutline.parent.remove(state.candidateOutline);
        state.candidateOutline.geometry.dispose();
        state.candidateOutline.material.dispose();
        state.candidateOutline = null;
    }
}

function selectCandidateMesh(mesh) {
    if (state.multiSelect) state.multiSelect.set([mesh], mesh);
    else applyObjectSelection([mesh], mesh);
}

function deselectAll() {
    if (state.faceEdit?.isActive()) state.faceEdit.close();
    if (state.multiSelect?.getCount()) { state.multiSelect.clear(); return; }
    state.candidateMesh = null; state.activePolymesh = null; state.selectedRoot = null;
    applyObjectSelection([], null);
}

function exitPolymeshEditing(pm) {
    clearAllHighlights();
    const finalGeometry = pm.geometry.clone();
    const finalMaterial = pm.faceMaterial.clone();
    const mesh = new THREE.Mesh(finalGeometry, finalMaterial);
    mesh.position.copy(pm.group.position);
    mesh.quaternion.copy(pm.group.quaternion);
    mesh.scale.copy(pm.group.scale);

    mesh.name = pm.group.name || 'Mesh';
    const parent = pm.group.parent;
    const showMesh = () => {
        parent.add(mesh); parent.remove(pm.group);
        const idx = state.polymeshes.indexOf(pm); if (idx > -1) state.polymeshes.splice(idx, 1);
        state.multiSelect?.set([mesh], mesh); state.objectManager?.refresh();
    };
    const showPolymesh = () => {
        parent.add(pm.group); parent.remove(mesh);
        if (!state.polymeshes.includes(pm)) state.polymeshes.push(pm);
        state.multiSelect?.set([pm.group], pm.group); state.objectManager?.refresh();
    };
    showMesh();
    state.history?.push({ label: 'Finish polymesh editing', undo: showPolymesh, redo: showMesh });
}

// ============================================================================
// POINTER HELPERS
// ============================================================================

function updateRaycasterFromEvent(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    state.pointerNDC.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    state.pointerNDC.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    state.raycaster.setFromCamera(state.pointerNDC, camera);
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

function pickVertexOrEdge(clientX, clientY) {
    if (!state.polymeshes.length) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    const px = clientX - rect.left, py = clientY - rect.top;

    let best = null, bestDist = state.VERTEX_PICK_PX;
    for (const pm of state.polymeshes) {
        for (let i = 0; i < pm.vertexCount; i++) {
            pm.vertexWorldPosition(i, _v1);
            const ndc = _v1.project(camera);
            if (ndc.z < -1 || ndc.z > 1) continue;
            const sx = (ndc.x * 0.5 + 0.5) * rect.width;
            const sy = (-ndc.y * 0.5 + 0.5) * rect.height;
            const d = Math.hypot(sx - px, sy - py);
            if (d < bestDist) { bestDist = d; best = { type: 'vertex', polymesh: pm, indices: [i] }; }
        }
    }
    if (best) return best;

    bestDist = state.EDGE_PICK_PX;
    for (const pm of state.polymeshes) {
        for (const e of pm.edges) {
            pm.vertexWorldPosition(e.v1, _v1);
            pm.vertexWorldPosition(e.v2, _v2);
            const n1 = _v1.clone().project(camera);
            const n2 = _v2.clone().project(camera);
            if ((n1.z < -1 || n1.z > 1) && (n2.z < -1 || n2.z > 1)) continue;
            const s1x = (n1.x * 0.5 + 0.5) * rect.width, s1y = (-n1.y * 0.5 + 0.5) * rect.height;
            const s2x = (n2.x * 0.5 + 0.5) * rect.width, s2y = (-n2.y * 0.5 + 0.5) * rect.height;
            const d = pointSegmentDistance(px, py, s1x, s1y, s2x, s2y);
            if (d < bestDist) { bestDist = d; best = { type: 'edge', polymesh: pm, indices: [e.v1, e.v2] }; }
        }
    }
    return best;
}

function pickFace(event) {
    if (!state.polymeshes.length) return null;
    updateRaycasterFromEvent(event);
    const meshes = state.polymeshes.map(p => p.mesh);
    const hit = state.raycaster.intersectObjects(meshes, false)[0];
    if (!hit) return null;
    const pm = hit.object.userData.polymesh;
    const face = pm.faces[hit.faceIndex];
    return { type: 'face', polymesh: pm, indices: [face.a, face.b, face.c], face, faceIndex: hit.faceIndex, point: hit.point };
}

function pickCandidateMesh(event) {
    updateRaycasterFromEvent(event);
    const candidates = [];
    state.contentGroup.traverse(o => { if (o.isMesh && !o.userData.isPolymeshElement && !o.userData.editorHelper && o.visible) candidates.push(o); });
    const hit = state.raycaster.intersectObjects(candidates, false)[0];
    return hit ? hit.object : null;
}

// ============================================================================
// DRAG FUNCTIONS
// ============================================================================

function applySelectionHighlight(pick) {
    clearAllHighlights();
    state.lastHighlightedPolymesh = pick.polymesh;
    if (pick.type === 'vertex') pick.polymesh.highlightVertex(pick.indices[0]);
    else if (pick.type === 'edge') pick.polymesh.highlightEdge(pick.indices[0], pick.indices[1]);
    else if (pick.type === 'face') updateFaceHighlight(pick.polymesh, pick.face);
}

function beginElementDrag(pick, event) {
    applySelectionHighlight(pick);
    orbitControls.enabled = false;

    const pm = pick.polymesh;
    const centroid = new THREE.Vector3();
    pick.indices.forEach(vi => { pm.vertexWorldPosition(vi, _v1); centroid.add(_v1); });
    centroid.divideScalar(pick.indices.length);

    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    state.dragPlane.setFromNormalAndCoplanarPoint(camDir, centroid);

    updateRaycasterFromEvent(event);
    const startPoint = new THREE.Vector3();
    state.raycaster.ray.intersectPlane(state.dragPlane, startPoint);

    const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3();
    pm.group.updateMatrixWorld();
    pm.group.matrixWorld.decompose(wp, wq, ws);

    state.dragState = {
        pick, pm,
        lastPoint: startPoint ? startPoint.clone() : centroid.clone(),
        invQuat: wq.clone().invert(),
        scale: ws.clone(),
        before: pm.geometry.attributes.position.array.slice()
    };

    setStatus('Dragging ' + pick.type + ' — release to finish');
    window.addEventListener('pointermove', onElementDragMove);
    window.addEventListener('pointerup', endElementDrag, { once: true });
}

function onElementDragMove(event) {
    if (!state.dragState) return;
    updateRaycasterFromEvent(event);
    const point = new THREE.Vector3();
    if (!state.raycaster.ray.intersectPlane(state.dragPlane, point)) return;

    const worldDelta = point.clone().sub(state.dragState.lastPoint);
    state.dragState.lastPoint = point;

    const localDelta = worldDelta.clone().applyQuaternion(state.dragState.invQuat);
    localDelta.x /= (state.dragState.scale.x || 1);
    localDelta.y /= (state.dragState.scale.y || 1);
    localDelta.z /= (state.dragState.scale.z || 1);

    state.dragState.pm.translateVertices(state.dragState.pick.indices, localDelta);
    if (state.dragState.pick.type === 'face') updateFaceHighlight(state.dragState.pm, state.dragState.pick.face);
}

function endElementDrag() {
    window.removeEventListener('pointermove', onElementDragMove);
    orbitControls.enabled = true;
    const drag = state.dragState;
    if (drag) {
        const after = drag.pm.geometry.attributes.position.array.slice();
        const changed = after.some((value, index) => Math.abs(value - drag.before[index]) > 1e-6);
        if (changed) {
            const apply = positions => {
                const attribute = drag.pm.geometry.attributes.position;
                attribute.array.set(positions); attribute.needsUpdate = true;
                drag.pm.geometry.computeVertexNormals(); drag.pm.geometry.computeBoundingBox(); drag.pm.geometry.computeBoundingSphere();
                syncEditor();
            };
            state.history?.push({ label: `Edit ${drag.pick.type}`, undo: () => apply(drag.before), redo: () => apply(after) });
        }
    }
    state.dragState = null;
    setStatus('Editing polymesh — drag vertices, edges, or faces to sculpt');
}

// ============================================================================
// POINTER EVENTS - z MultiSelect
// ============================================================================

renderer.domElement.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (state.transformControls.dragging) return;

    const isMultiSelect = state.multiSelect?.isActive(event) || false;

    if (state.faceEdit?.isActive()) {
        const facePick = pickFace(event);
        if (facePick && facePick.polymesh === state.faceEdit.polymesh) {
            state.faceEdit.selectFace(facePick.faceIndex ?? facePick.polymesh.faces.indexOf(facePick.face), event.shiftKey);
            return;
        }
        return;
    }

    const vOrE = pickVertexOrEdge(event.clientX, event.clientY);
    if (vOrE) {
        if (isMultiSelect) {
            // Multi-select dla wierzchołków/krawędzi
        } else {
            beginElementDrag(vOrE, event);
        }
        return;
    }

    const facePick = pickFace(event);
    if (facePick) {
        beginElementDrag(facePick, event);
        return;
    }

    if (!state.activePolymesh) {
        const candidate = pickCandidateMesh(event);
        if (candidate) {
            state.multiSelect?.selectObject(candidate, { additive: isMultiSelect, event, primary: candidate });
            return;
        }
    }

    if (state.activePolymesh) return;
    state.multiSelect?.clear();
});

renderer.domElement.addEventListener('pointermove', (event) => {
    if (state.dragState || state.transformControls.dragging) return;
    const vOrE = pickVertexOrEdge(event.clientX, event.clientY);
    if (vOrE) { renderer.domElement.style.cursor = 'crosshair'; return; }

    if (state.polymeshes.length) {
        updateRaycasterFromEvent(event);
        const meshes = state.polymeshes.map(p => p.mesh);
        if (state.raycaster.intersectObjects(meshes, false)[0]) {
            renderer.domElement.style.cursor = 'crosshair';
            return;
        }
    }

    updateRaycasterFromEvent(event);
    const candidates = [];
    state.contentGroup.traverse(o => { if (o.isMesh && !o.userData.isPolymeshElement && !o.userData.editorHelper && o.visible) candidates.push(o); });
    if (state.raycaster.intersectObjects(candidates, false)[0]) {
        renderer.domElement.style.cursor = 'pointer';
        return;
    }

    renderer.domElement.style.cursor = 'default';
});

// ============================================================================
// TOP BAR WIRING
// ============================================================================

// Move/Rotate/Scale - toggle z panelem transform
state.toolButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        const panelMap = {
            'translate': 'transform-panel',
            'rotate': 'transform-panel',
            'scale': 'transform-panel'
        };
        const panelName = panelMap[mode];
        const panel = document.getElementById(panelName);
        
        // Sprawdź czy przycisk jest już aktywny
        const isActive = btn.classList.contains('active');
        
        if (isActive) {
            // Deaktywuj
            btn.classList.remove('active');
            state.transformControls.setMode('translate');
            state.transformControls.enabled = false;
            state.transformControls.visible = false;
            if (panel) panel.style.display = 'none';
        } else {
            // Deaktywuj wszystkie inne
            state.toolButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.transformControls.setMode(mode);
            
            // Jeśli jest zaznaczony obiekt, pokaż gizmo
            const transformTarget = getTransformTarget();
            if (transformTarget) {
                state.transformControls.enabled = true;
                state.transformControls.visible = true;
                state.transformControls.attach(transformTarget);
            }
            
            // Pokaż panel transform
            if (panel) {
                panel.style.display = 'block';
                // Aktualizuj wartości
                const target = getTransformTarget();
                if (state.transformInputs) state.transformInputs.update(target);
                if (state.dimensionsUI) state.dimensionsUI.update(target);
            }
        }
    });
});

// Delete button
if (state.deleteBtn) {
    state.deleteBtn.addEventListener('click', deleteSelectedObjects);
}

function deleteSelectedObjects() {
    const selection = selectedObjects();
    deleteObjects(selection.length ? selection : [state.activePolymesh?.group || state.candidateMesh].filter(Boolean));
}

function deleteObjects(objects) {
    const unique = [...new Set(objects)].filter(object => object?.parent && !object.userData?.locked);
    const roots = unique.filter(object => !unique.some(other => other !== object && object.parent && other.getObjectById(object.id)));
    if (!roots.length) { setStatus('Nothing unlocked to delete'); return; }
    const records = roots.map(object => ({ object, parent: object.parent, index: object.parent.children.indexOf(object) }));
    const removedPolymeshes = state.polymeshes.filter(pm => roots.some(root => root === pm.group || root.getObjectById(pm.group.id)));
    const removedImports = state.importedRoots.filter(root => roots.includes(root));
    const remove = () => {
        records.forEach(record => record.object.parent?.remove(record.object));
        removedPolymeshes.forEach(pm => { const index = state.polymeshes.indexOf(pm); if (index > -1) state.polymeshes.splice(index, 1); });
        removedImports.forEach(root => { const index = state.importedRoots.indexOf(root); if (index > -1) state.importedRoots.splice(index, 1); });
        state.multiSelect?.clear(); refreshEmptyState(); state.objectManager?.refresh();
    };
    const restore = () => {
        records.forEach(record => {
            record.parent.add(record.object);
            const current = record.parent.children.indexOf(record.object);
            record.parent.children.splice(current, 1);
            record.parent.children.splice(Math.min(record.index, record.parent.children.length), 0, record.object);
        });
        removedPolymeshes.forEach(pm => { if (!state.polymeshes.includes(pm)) state.polymeshes.push(pm); });
        removedImports.forEach(root => { if (!state.importedRoots.includes(root)) state.importedRoots.push(root); });
        state.multiSelect?.set(roots); refreshEmptyState(); state.objectManager?.refresh();
    };
    remove();
    state.history?.push({ label: `Delete ${roots.length} object${roots.length === 1 ? '' : 's'}`, undo: restore, redo: remove });
    setStatus(`Deleted ${roots.length} object${roots.length === 1 ? '' : 's'}`);
}
state.deleteObjects = deleteObjects;

state.generateBtn.addEventListener('click', () => {
    if (state.generateBtn.classList.contains('disabled')) return;
    if (state.activePolymesh) { exitPolymeshEditing(state.activePolymesh); return; }
    if (!state.candidateMesh) return;

    const pm = new Polymesh(state.candidateMesh);
    pm.group.position.copy(state.candidateMesh.position);
    pm.group.quaternion.copy(state.candidateMesh.quaternion);
    pm.group.scale.copy(state.candidateMesh.scale);

    const parent = state.candidateMesh.parent;
    const sourceMesh = state.candidateMesh;
    const showPolymesh = () => {
        parent.add(pm.group); parent.remove(sourceMesh);
        if (!state.polymeshes.includes(pm)) state.polymeshes.push(pm);
        state.multiSelect?.set([pm.group], pm.group); state.objectManager?.refresh();
    };
    const showSource = () => {
        parent.add(sourceMesh); parent.remove(pm.group);
        const index = state.polymeshes.indexOf(pm); if (index > -1) state.polymeshes.splice(index, 1);
        state.multiSelect?.set([sourceMesh], sourceMesh); state.objectManager?.refresh();
    };
    showPolymesh();
    removeCandidateOutline();
    state.history?.push({ label: 'Generate polymesh', undo: showSource, redo: showPolymesh });
    updateGenerateButtonState();
    setStatus('Editing polymesh — drag vertices, edges, or faces to sculpt');
    
    if (state.transformInputs) {
        state.transformInputs.update(pm.group);
    }
    if (state.dimensionsUI) {
        state.dimensionsUI.update(pm.group);
    }
});

// ============================================================================
// IMPORT / EXPORT
// ============================================================================

const gltfLoader = new GLTFLoader();

state.importBtn.addEventListener('click', () => state.fileInput.click());

state.fileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    
    setStatus('Loading ' + file.name + '...');
    
    const reader = new FileReader();
    reader.onload = () => {
        setStatus('Parsing ' + file.name + '...');
        
        gltfLoader.parse(reader.result, '', (gltf) => {
            const root = gltf.scene || gltf.scenes[0];
            root.name = root.name || file.name.replace(/\.glb$/i, '');
            root.visible = true;
            
            let meshCount = 0;
            root.traverse((o) => { 
                if (o.isMesh) {
                    meshCount++;
                    o.userData.isPolymeshElement = false;
                    
                    if (o.material) {
                        if (Array.isArray(o.material)) {
                            o.material.forEach(m => {
                                if (m) {
                                    m.needsUpdate = true;
                                    if (m.map) m.map.needsUpdate = true;
                                }
                            });
                        } else {
                            o.material.needsUpdate = true;
                            if (o.material.map) o.material.map.needsUpdate = true;
                        }
                    }
                    
                    o.visible = true;
                    o.frustumCulled = true;
                }
            });
            
            if (meshCount === 0) {
                setStatus('Warning: No meshes found in the model');
                return;
            }
            
            state.contentGroup.add(root);
            state.importedRoots.push(root);
            const add = () => { state.contentGroup.add(root); if (!state.importedRoots.includes(root)) state.importedRoots.push(root); state.multiSelect?.set([root], root); refreshEmptyState(); state.objectManager?.refresh(); };
            const remove = () => { root.parent?.remove(root); const index = state.importedRoots.indexOf(root); if (index > -1) state.importedRoots.splice(index, 1); state.multiSelect?.clear(); refreshEmptyState(); state.objectManager?.refresh(); };
            state.history?.push({ label: `Import ${file.name}`, undo: remove, redo: add });
            
            root.updateMatrixWorld(true);
            state.contentGroup.updateMatrixWorld(true);
            
            frameObject(root);
            state.multiSelect?.set([root], root);
            
            refreshEmptyState();
            setStatus(`Model imported: ${file.name} (${meshCount} meshes)`);
            if (state.objectManager) state.objectManager.refresh();
            
            // Wymuś renderowanie
            setTimeout(() => {
                renderer.render(scene, camera);
            }, 100);
            
            setTimeout(() => {
                renderer.render(scene, camera);
            }, 300);
            
        }, (err) => {
            console.error('GLTF Parse error:', err);
            setStatus('Failed to parse .glb file: ' + err.message);
        });
    };
    reader.onerror = () => setStatus('Could not read file');
    reader.readAsArrayBuffer(file);
    state.fileInput.value = '';
});

state.exportBtn.addEventListener('click', () => {
    if (!state.importedRoots.length) { setStatus('Nothing to export yet'); return; }
    state.polymeshes.forEach(pm => { pm.lines.visible = false; pm.points.visible = false; });
    hideFaceHighlight();
    if (state.candidateOutline) state.candidateOutline.visible = false;

    const restore = () => {
        state.polymeshes.forEach(pm => { pm.lines.visible = true; pm.points.visible = true; });
        if (state.candidateOutline) state.candidateOutline.visible = true;
    };

    const exporter = new GLTFExporter();
    exporter.parse(state.contentGroup, (result) => {
        restore();
        let blob;
        if (result instanceof ArrayBuffer) {
            blob = new Blob([result], { type: 'application/octet-stream' });
        } else {
            blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'polymesh-scene.glb';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setStatus('Exported polymesh-scene.glb');
    }, (err) => { restore(); console.error(err); setStatus('Export failed'); },
    { binary: true, onlyVisible: true });
});

// ============================================================================
// CAMERA FRAMING
// ============================================================================

function frameObject(object) {
    const box = new THREE.Box3().setFromObject(object);
    
    if (box.isEmpty()) {
        camera.position.set(5, 5, 5);
        orbitControls.target.set(0, 0, 0);
        orbitControls.update();
        renderer.render(scene, camera);
        return;
    }
    
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const dist = maxDim * 1.8;
    
    camera.position.set(center.x + dist, center.y + dist * 0.8, center.z + dist);
    orbitControls.target.copy(center);
    camera.near = Math.max(dist / 1000, 0.001);
    camera.far = dist * 100 + 100;
    camera.updateProjectionMatrix();
    orbitControls.update();
    
    renderer.render(scene, camera);
}

// ============================================================================
// BIND UI BUTTONS
// ============================================================================

function bindNewUIButtons() {
    // Object Manager
    const omBtn = document.getElementById('le-btn-object-manager');
    if (omBtn) {
        omBtn.addEventListener('click', () => {
            state.objectManager?.toggle();
        });
    }

    // Multi-select
    const msBtn = document.getElementById('le-btn-multiselect');
    if (msBtn) {
        msBtn.addEventListener('click', () => {
            state.multiSelect?.toggle();
        });
    }

    // Face Edit
    const feBtn = document.getElementById('le-btn-face-edit');
    if (feBtn) {
        feBtn.addEventListener('click', () => {
            state.faceEdit?.toggle();
        });
    }

    // Tiling
    const tilingBtn = document.getElementById('le-btn-tiling');
    if (tilingBtn) {
        tilingBtn.addEventListener('click', () => {
            state.tiling?.toggle();
        });
    }

    // Undo/Redo
    const undoBtn = document.getElementById('le-btn-undo');
    if (undoBtn) {
        undoBtn.addEventListener('click', () => {
            state.history?.undo();
        });
    }
    const redoBtn = document.getElementById('le-btn-redo');
    if (redoBtn) {
        redoBtn.addEventListener('click', () => {
            state.history?.redo();
        });
    }

    // Panel close buttons
    document.querySelectorAll('.panel-close').forEach(btn => {
        btn.addEventListener('click', () => {
            const panel = btn.closest('.floating-panel');
            if (panel) {
                panel.classList.add('hidden');
                const panelName = panel.dataset.panel;
                if (panelName === 'object-manager') state.objectManager?.close();
                if (panelName === 'face-edit') state.faceEdit?.close();
                if (panelName === 'tiling') state.tiling?.close();
            }
        });
    });

    // Object Manager actions
    document.getElementById('om-group')?.addEventListener('click', () => {
        state.objectManager?.groupSelected();
    });
    document.getElementById('om-ungroup')?.addEventListener('click', () => {
        state.objectManager?.ungroupSelected();
    });
    document.getElementById('om-show-all')?.addEventListener('click', () => {
        state.objectManager?.showAll();
    });

    // Face Edit actions
    document.getElementById('fe-extrude')?.addEventListener('click', () => {
        const distance = parseFloat(document.getElementById('fe-distance')?.value || 0.5);
        state.faceEdit?.extrudeFaces(distance);
    });
    document.getElementById('fe-clear')?.addEventListener('click', () => {
        state.faceEdit?.clearSelection();
    });
    document.getElementById('fe-exit')?.addEventListener('click', () => {
        state.faceEdit?.close();
    });

    // Tiling actions
    document.getElementById('tiling-mode-grid')?.addEventListener('click', () => {
        state.tiling?.setMode('grid');
    });
    document.getElementById('tiling-mode-radial')?.addEventListener('click', () => {
        state.tiling?.setMode('radial');
    });
    document.getElementById('tiling-create')?.addEventListener('click', () => {
        const selected = state.multiSelect?.getSelected() || [];
        const source = selected.length === 1 ? selected[0] : state.activePolymesh?.mesh;
        state.tiling?.createArray(source);
    });
    document.getElementById('tiling-preview')?.addEventListener('click', () => {
        state.tiling?.preview();
    });

    // Tiling input changes
    ['tiling-countX', 'tiling-countZ', 'tiling-spacingX', 'tiling-spacingZ'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', () => {
            state.tiling?.setGridSettings({
                countX: parseInt(document.getElementById('tiling-countX')?.value) || 3,
                countZ: parseInt(document.getElementById('tiling-countZ')?.value) || 3,
                spacingX: parseFloat(document.getElementById('tiling-spacingX')?.value) || 2,
                spacingZ: parseFloat(document.getElementById('tiling-spacingZ')?.value) || 2,
            });
        });
    });

    ['tiling-radial-count', 'tiling-radial-radius'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', () => {
            state.tiling?.setRadialSettings({
                count: parseInt(document.getElementById('tiling-radial-count')?.value) || 8,
                radius: parseFloat(document.getElementById('tiling-radial-radius')?.value) || 5,
            });
        });
    });

    ['tiling-layers', 'tiling-layer-spacing'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', () => {
            state.tiling?.setLayerSettings({
                countY: parseInt(document.getElementById('tiling-layers')?.value) || 1,
                spacingY: parseFloat(document.getElementById('tiling-layer-spacing')?.value) || 2,
            });
        });
    });

    // Transform panel - close on outside click
    document.addEventListener('click', (e) => {
        const panel = document.getElementById('transform-panel');
        const isTransformBtn = e.target.closest('.le-tb-btn[data-mode]');
        const isPanel = e.target.closest('#transform-panel');
        
        if (panel && panel.style.display !== 'none' && !isTransformBtn && !isPanel) {
            // Sprawdź czy kliknięto na inny przycisk transform
            if (!e.target.closest('.le-tb-btn')) {
                panel.style.display = 'none';
                state.toolButtons.forEach(b => b.classList.remove('active'));
                state.transformControls.enabled = false;
                state.transformControls.visible = false;
            }
        }
    });
}

// ============================================================================
// KEYBOARD SHORTCUTS
// ============================================================================

document.addEventListener('keydown', (event) => {
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    
    // Ignoruj jeśli focus na input
    if (event.target.matches('input, select, textarea') || event.repeat) return;
    
    // Undo/Redo
    if (mod && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
            state.history?.redo();
        } else {
            state.history?.undo();
        }
        return;
    }
    
    if (mod && key === 'y') {
        event.preventDefault();
        state.history?.redo();
        return;
    }
    
    // Delete
    if (key === 'delete' || key === 'backspace') {
        event.preventDefault();
        deleteSelectedObjects();
        return;
    }
    
    // Move/Rotate/Scale
    const modeMap = {
        'w': { btn: 'le-btn-move', mode: 'translate' },
        'e': { btn: 'le-btn-rotate', mode: 'rotate' },
        'r': { btn: 'le-btn-scale', mode: 'scale' }
    };
    
    if (modeMap[key]) {
        event.preventDefault();
        const { btn, mode } = modeMap[key];
        const button = document.getElementById(btn);
        if (button) {
            const isActive = button.classList.contains('active');
            if (isActive) {
                // Deaktywuj
                button.classList.remove('active');
                state.transformControls.enabled = false;
                state.transformControls.visible = false;
                document.getElementById('transform-panel').style.display = 'none';
            } else {
                // Aktywuj
                state.toolButtons.forEach(b => b.classList.remove('active'));
                button.classList.add('active');
                state.transformControls.setMode(mode);
                const transformTarget = getTransformTarget();
                if (transformTarget) {
                    state.transformControls.enabled = true;
                    state.transformControls.visible = true;
                    state.transformControls.attach(transformTarget);
                }
                document.getElementById('transform-panel').style.display = 'block';
                const target = getTransformTarget();
                if (state.transformInputs) state.transformInputs.update(target);
                if (state.dimensionsUI) state.dimensionsUI.update(target);
            }
        }
        return;
    }
    
    // Multi-select toggle (Shift)
    if (key === 'shift') {
        // Multi-select jest aktywowany przez Shift podczas kliknięcia
        // Nic nie robimy, tylko zaznaczamy że Shift jest wciśnięty
        return;
    }
    
    // Focus selection (F)
    if (key === 'f') {
        event.preventDefault();
        const target = getTransformTarget();
        if (target) {
            frameObject(target);
        }
        return;
    }
    
    // Escape - deselect
    if (key === 'escape') {
        event.preventDefault();
        deselectAll();
        state.multiSelect?.clear();
        document.getElementById('transform-panel').style.display = 'none';
        state.toolButtons.forEach(b => b.classList.remove('active'));
        state.transformControls.enabled = false;
        state.transformControls.visible = false;
        return;
    }
});

// ============================================================================
// RESIZE / RENDER LOOP
// ============================================================================

function handleResize() {
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    
    renderer.setSize(width, height);
    renderer.setViewport(0, 0, width, height);
    renderer.render(scene, camera);
}

window.addEventListener('resize', handleResize);

const resizeObserver = new ResizeObserver(() => {
    handleResize();
});

if (container) {
    resizeObserver.observe(container);
}

function animate() {
    requestAnimationFrame(animate);
    orbitControls.update();
    
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    
    if (renderer.domElement.width !== width * window.devicePixelRatio || 
        renderer.domElement.height !== height * window.devicePixelRatio) {
        renderer.setSize(width, height);
        renderer.setViewport(0, 0, width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    }
    
    renderer.render(scene, camera);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

async function init() {
    try {
        const [historyModule, omModule, snapModule, partModule, faceModule, tilingModule, transModule, dimModule, multiModule] = await Promise.all([
            import('./live-editor/history.js'),
            import('./live-editor/object-manager.js'),
            import('./live-editor/snapping.js'),
            import('./live-editor/part-system.js'),
            import('./live-editor/face-edit.js'),
            import('./live-editor/tiling.js'),
            import('./live-editor/transforms.js'),
            import('./live-editor/dimensions.js'),
            import('./live-editor/multiselect.js')
        ]);

        state.history = new historyModule.History();
        state.objectManager = new omModule.ObjectManager(state, state.contentGroup);
        state.snapping = new snapModule.Snapping(state);
        state.snapping.init(scene);
        state.partSystem = new partModule.PartSystem(state);
        state.faceEdit = new faceModule.FaceEdit(state);
        state.tiling = new tilingModule.Tiling(state);
        state.transformInputs = new transModule.TransformInputs(state);
        state.transformInputs.bind();
        state.dimensionsUI = new dimModule.DimensionsUI(state);
        state.dimensionsUI.bind();
        state.multiSelect = new multiModule.MultiSelect(state);

        bindNewUIButtons();

        // Ukryj panel transform na start
        const panel = document.getElementById('transform-panel');
        if (panel) panel.style.display = 'none';

        setTimeout(() => {
            handleResize();
            state._initialRenderDone = true;
        }, 50);
        
        setTimeout(() => {
            handleResize();
        }, 200);

        animate();
        refreshEmptyState();

        setStatus('KAM3D Live Editor ready — Import a .glb file to begin');
        
    } catch (error) {
        console.error('Failed to initialize Live Editor:', error);
        setStatus('Error loading Live Editor modules: ' + error.message);
    }
}

// Start
init();

// Udostępnij globalnie
window.Polymesh = Polymesh;
window.state = state;
