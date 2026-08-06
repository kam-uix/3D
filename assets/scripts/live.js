    import * as THREE from 'three';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
    import { TransformControls } from 'three/addons/controls/TransformControls.js';
    import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
    import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
    import { RectAreaLightHelper } from 'three/addons/helpers/RectAreaLightHelper.js';
    import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
    import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

    RectAreaLightUniformsLib.init();

    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const uid = () => `kam-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));

    const state = {
      selectionEnabled: true,
      selectionScope: 'object',
      multiSelect: false,
      transformEnabled: { translate: true, rotate: false, scale: false },
      transformSpace: 'world',
      gridVisible: true,
      snapEnabled: true,
      moveSnap: .5,
      rotateSnap: 15,
      scaleSnap: .1,
      smartSnap: { enabled: true, guides: true, edges: true, centers: true, distance: .35, applying: false },
      shadows: true,
      cameraType: 'perspective',
      dragDepth: 0,
      dragAssetId: null,
      selectedAssetId: null,
      ghost: null,
      ghostPoint: new THREE.Vector3(),
      transformSession: null,
      gizmoDragging: false,
      currentColor: '#f2f2f2',
      paletteMode: 'replace',
      recentColors: [],
      objectManagerExpanded: new Set(),
      textureChannel: 'map',
      selectedTextureId: null,
      uniformScale: false,
      transformInputEditing: false,
      uiReady: false,
      tiling: { source: 'selected', type: 'grid', directionX: 'positive', directionY: 'positive', directionZ: 'positive', preview: [], placements: [] },
      areaArray: {
        source: 'selected', fill: 'spacing', active: false, tool: null, mode: 'editing', drawing: false, dragHandle: null,
        center: new THREE.Vector3(0, 0, 0), width: 10, depth: 10, rotation: 0,
        bounds: {
          array: { center: new THREE.Vector3(0, 0, 0), width: 10, depth: 10, rotation: 0 },
          select: { center: new THREE.Vector3(0, 0, 0), width: 10, depth: 10, rotation: 0 }
        },
        preview: [], placements: [], guide: null, handles: [],
        selectionMode: 'replace', replacementSource: 'selected', inclusion: 'center', directionY: 'positive', candidates: [], candidateHelpers: new Map(), redrawBackup: null
      },
      paint: { active: false, mode: 'paint', source: 'library', surface: 'ground', eraseTarget: 'current', stroke: null, lastPoint: null, eraseHelpers: new Map() },
      meshEdit: { active: false, root: null, partScope: null, selectionMode: 'surface', selected: new Map(), overlays: new Map(), transformBefore: null, transformChanged: false, lastPivot: new THREE.Vector3() },
      lighting: { preset: 'neutral', fillEnabled: true, rimEnabled: false, exposure: 1, toneMapping: 'aces' },
      background: {
        mode: 'solid', solid: '#f5f6f8', top: '#ffffff', bottom: '#eef1f5', horizon: 55,
        fogEnabled: true, fogType: 'exp', fogColor: '#f5f6f8', fogMatch: true, fogNear: 40, fogFar: 450, fogDensity: .0017
      }
    };

    const canvas = $('#sceneCanvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f5f6f8');
    scene.fog = new THREE.FogExp2('#f5f6f8', 0.0017);
    let gradientBackgroundTexture = null;

    const perspectiveCamera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, .05, 5000);
    perspectiveCamera.position.set(12, 10, 12);
    const orthographicCamera = new THREE.OrthographicCamera(-12, 12, 12, -12, .05, 5000);
    orthographicCamera.position.copy(perspectiveCamera.position);
    let activeCamera = perspectiveCamera;
    let orthoSize = 14;

    const orbit = new OrbitControls(activeCamera, canvas);
    orbit.target.set(0, 1.5, 0);
    orbit.enableDamping = true;
    orbit.dampingFactor = .075;
    orbit.screenSpacePanning = true;
    orbit.minDistance = .1;
    orbit.maxDistance = 1800;
    orbit.maxPolarAngle = Math.PI * .499;
    orbit.update();

    const instancesRoot = new THREE.Group();
    instancesRoot.name = 'KAM3D World';
    scene.add(instancesRoot);
    const sceneLightsRoot = new THREE.Group();
    sceneLightsRoot.name = 'KAM3D Scene Lights';
    scene.add(sceneLightsRoot);
    const selectionPivot = new THREE.Group();
    selectionPivot.name = '__SelectionPivot';
    scene.add(selectionPivot);
    const meshEditPivot = new THREE.Object3D();
    meshEditPivot.name = '__MeshEditPivot';
    scene.add(meshEditPivot);
    const partSelectionPivot = new THREE.Group();
    partSelectionPivot.name = '__PartSelectionPivot';
    scene.add(partSelectionPivot);
    const arrayPreviewRoot = new THREE.Group();
    arrayPreviewRoot.name = '__ArrayPreview';
    scene.add(arrayPreviewRoot);
    const tilingPreviewGroup = new THREE.Group();
    tilingPreviewGroup.name = '__TilingPreview';
    arrayPreviewRoot.add(tilingPreviewGroup);
    const areaPreviewGroup = new THREE.Group();
    areaPreviewGroup.name = '__AreaPreview';
    arrayPreviewRoot.add(areaPreviewGroup);
    const areaGuideRoot = new THREE.Group();
    areaGuideRoot.name = '__AreaArrayGuide';
    scene.add(areaGuideRoot);
    const paintGuide = new THREE.LineLoop(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .9, depthTest: false })
    );
    paintGuide.name = '__PaintBrushGuide';
    paintGuide.visible = false;
    paintGuide.renderOrder = 1300;
    scene.add(paintGuide);
    const alignmentGuideRoot = new THREE.Group();
    alignmentGuideRoot.name = '__AlignmentGuides';
    scene.add(alignmentGuideRoot);
    const instanceRegistry = new Set();
    const lightRegistry = new Set();
    const lightHelpers = new Map();
    const editableMeshStore = new Map();
    const assets = new Map();
    const assetUsage = new Map();
    const textureAssets = new Map();

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xcbd5e1, 1.2);
    scene.add(hemiLight);
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(-14, 17, 11);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = -60;
    keyLight.shadow.camera.right = 60;
    keyLight.shadow.camera.top = 60;
    keyLight.shadow.camera.bottom = -60;
    keyLight.shadow.camera.near = .1;
    keyLight.shadow.camera.far = 160;
    keyLight.shadow.bias = -.00025;
    keyLight.shadow.normalBias = .025;
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x9fc5ff, .7);
    fillLight.castShadow = false;
    scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0xffffff, 1.2);
    rimLight.castShadow = false;
    rimLight.visible = false;
    scene.add(rimLight);

    let grid = createGrid(1000, 1000, .42);
    scene.add(grid);
    const shadowGround = new THREE.Mesh(
      new THREE.PlaneGeometry(1000, 1000),
      new THREE.ShadowMaterial({ color: 0x64748b, opacity: .13, transparent: true, depthWrite: false })
    );
    shadowGround.rotation.x = -Math.PI / 2;
    shadowGround.position.y = -.002;
    shadowGround.receiveShadow = true;
    shadowGround.name = '__ShadowGround';
    scene.add(shadowGround);
    const axesHelper = new THREE.AxesHelper(4);
    axesHelper.visible = false;
    scene.add(axesHelper);

    const placementPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const gltfLoader = new GLTFLoader();
    const gltfExporter = new GLTFExporter();
    const textureLoader = new THREE.TextureLoader();

    function createGrid(size, divisions, opacity) {
      const helper = new THREE.GridHelper(size, divisions, 0xc5cbd4, 0xdfe3e8);
      helper.name = '__WorldGrid';
      helper.material.transparent = true;
      helper.material.opacity = opacity;
      helper.material.depthWrite = false;
      helper.renderOrder = -1;
      return helper;
    }

    function rebuildGrid() {
      const size = clamp(Number($('#gridSizeInput').value) || 1000, 10, 10000);
      const divisions = clamp(Math.round(Number($('#gridDivisionsInput').value) || 1000), 10, 2000);
      const opacity = clamp(Number($('#gridOpacityInput').value) / 100, .05, 1);
      scene.remove(grid);
      grid.geometry.dispose();
      grid.material.dispose();
      grid = createGrid(size, divisions, opacity);
      grid.visible = state.gridVisible;
      scene.add(grid);
      const groundSize = Math.max(1000, size);
      shadowGround.geometry.dispose();
      shadowGround.geometry = new THREE.PlaneGeometry(groundSize, groundSize);
    }

    function clearAlignmentGuides() {
      while (alignmentGuideRoot.children.length) {
        const line = alignmentGuideRoot.children[0];
        alignmentGuideRoot.remove(line);
        line.geometry?.dispose?.();
        line.material?.dispose?.();
      }
    }

    function boxAnchors(box, axis) {
      const values = [];
      if (state.smartSnap.edges) values.push({ value: box.min[axis], type: 'min' }, { value: box.max[axis], type: 'max' });
      if (state.smartSnap.centers) values.push({ value: (box.min[axis] + box.max[axis]) / 2, type: 'center' });
      return values;
    }

    function addAlignmentGuide(axis, value, targetBox, referenceBox) {
      if (!state.smartSnap.guides) return;
      const a = targetBox.getCenter(new THREE.Vector3());
      const b = referenceBox.getCenter(new THREE.Vector3());
      a[axis] = value;
      b[axis] = value;
      if (a.distanceToSquared(b) < .0001) {
        const size = Math.max(targetBox.getSize(new THREE.Vector3()).length(), referenceBox.getSize(new THREE.Vector3()).length(), 1);
        const crossAxis = axis === 'x' ? 'z' : 'x';
        a[crossAxis] -= size * .6;
        b[crossAxis] += size * .6;
      }
      const geometry = new THREE.BufferGeometry().setFromPoints([a, b]);
      const material = new THREE.LineBasicMaterial({ color: 0x54b8ff, transparent: true, opacity: .95, depthTest: false });
      const line = new THREE.Line(geometry, material);
      line.renderOrder = 1400;
      alignmentGuideRoot.add(line);
    }

    function applySmartObjectSnap(target, movingObjects, axes = ['x', 'y', 'z']) {
      clearAlignmentGuides();
      if (!state.snapEnabled || !state.smartSnap.enabled || state.smartSnap.applying || (!state.smartSnap.edges && !state.smartSnap.centers)) return;
      const movingSet = new Set(movingObjects);
      const references = partSelection?.items().length
        ? [...allRootMeshes(partSelection.root).filter(object => !movingSet.has(object) && object.visible), ...[...instanceRegistry].filter(object => object !== partSelection.root && object.visible)]
        : [...instanceRegistry].filter(object => !movingSet.has(object) && object.visible);
      if (!references.length) return;
      state.smartSnap.applying = true;
      scene.updateMatrixWorld(true);
      let targetBox = getObjectsBox(movingObjects);
      const threshold = Math.max(.001, state.smartSnap.distance);
      const matches = [];
      axes.forEach(axis => {
        let best = null;
        const targetAnchors = boxAnchors(targetBox, axis);
        references.forEach(object => {
          const referenceBox = new THREE.Box3().setFromObject(object);
          if (referenceBox.isEmpty()) return;
          boxAnchors(referenceBox, axis).forEach(referenceAnchor => targetAnchors.forEach(targetAnchor => {
            const delta = referenceAnchor.value - targetAnchor.value;
            const distance = Math.abs(delta);
            if (distance <= threshold && (!best || distance < best.distance)) best = { delta, distance, value: referenceAnchor.value, referenceBox };
          }));
        });
        if (!best) return;
        if (partSelection?.items().length && target.parent) {
          target.updateWorldMatrix(true, false);
          const position = target.getWorldPosition(new THREE.Vector3());
          const quaternion = target.getWorldQuaternion(new THREE.Quaternion());
          const scale = target.getWorldScale(new THREE.Vector3());
          position[axis] += best.delta;
          setTargetWorldTransform(target, position, quaternion, scale);
        } else {
          target.position[axis] += best.delta;
          target.updateMatrixWorld(true);
        }
        targetBox = getObjectsBox(movingObjects);
        matches.push({ axis, value: best.value, referenceBox: best.referenceBox, targetBox: targetBox.clone() });
      });
      matches.forEach(match => addAlignmentGuide(match.axis, match.value, match.targetBox, match.referenceBox));
      state.smartSnap.applying = false;
    }

    function createTransformControl(mode) {
      const control = new TransformControls(activeCamera, canvas);
      control.setMode(mode);
      control.setSpace(mode === 'scale' ? 'local' : state.transformSpace);
      control.setSize(1);
      control.visible = false;
      control.enabled = false;
      scene.add(control);

      control.addEventListener('mouseDown', () => {
        state.gizmoDragging = true;
        orbit.enabled = false;
        transformControls.forEach(other => { if (other !== control) other.enabled = false; });
        if (state.meshEdit.active) {
          const root = state.meshEdit.root;
          state.meshEdit.transformBefore = capturePolyState(root);
          state.meshEdit.transformChanged = false;
          state.meshEdit.lastPivot.copy(meshEditPivot.position);
          state.transformSession = { mode, meshEdit: true, root };
          return;
        }
        const targets = activeTransformTargets();
        state.transformSession = { mode, before: captureStates(targets), targets };
      });
      control.addEventListener('objectChange', () => {
        if (state.transformSession?.meshEdit) {
          const delta = meshEditPivot.position.clone().sub(state.meshEdit.lastPivot);
          if (delta.lengthSq() > 1e-16) { moveSelectedMeshFaces(delta); state.meshEdit.transformChanged = true; }
          state.meshEdit.lastPivot.copy(meshEditPivot.position);
          return;
        }
        if (mode === 'translate' && state.transformSession) applySmartObjectSnap(control.object, state.transformSession.targets);
        selection.updateHelpers();
        updateTransformInputs();
      });
      control.addEventListener('mouseUp', () => {
        orbit.enabled = true;
        state.gizmoDragging = false;
        const session = state.transformSession;
        if (session?.meshEdit) {
          const after = capturePolyState(session.root);
          const before = state.meshEdit.transformBefore;
          if (before && state.meshEdit.transformChanged) history.push({ label: 'Move mesh surface', undo: () => applyPolyState(session.root, before), redo: () => applyPolyState(session.root, after) });
          state.meshEdit.transformBefore = null;
          state.meshEdit.transformChanged = false;
          updateMeshEditPivot(); updateMeshEditOverlays();
        } else if (session) {
          const after = captureStates(session.targets);
          if (!statesEqual(session.before, after)) pushTransformHistory(session.targets, session.before, after, mode);
        }
        state.transformSession = null;
        clearAlignmentGuides();
        updateTransformControls();
        updateStats();
        updateTransformInputs();
      });
      return control;
    }

    const transformControls = [];
    transformControls.push(createTransformControl('translate'));
    transformControls.push(createTransformControl('rotate'));
    transformControls.push(createTransformControl('scale'));

    function sceneEntities() { return [...instanceRegistry, ...lightRegistry]; }
    function isSceneEntity(object) { return instanceRegistry.has(object) || lightRegistry.has(object); }
    function sceneEntityParent(object) { return lightRegistry.has(object) || object.userData.kamEntityType === 'light' ? sceneLightsRoot : instancesRoot; }
    function isLightEntity(object) { return Boolean(object?.userData?.kamEntityType === 'light'); }
    function modelSelection() { return selection.items().filter(object => instanceRegistry.has(object)); }
    let partSelection = null;

    const selection = {
      selected: [],
      helpers: new Map(),
      pivotActive: false,

      items() { return [...this.selected]; },
      has(object) { return this.selected.includes(object); },

      dissolvePivot() {
        if (!this.pivotActive) return;
        scene.updateMatrixWorld(true);
        [...selectionPivot.children].forEach(object => sceneEntityParent(object).attach(object));
        selectionPivot.position.set(0, 0, 0);
        selectionPivot.rotation.set(0, 0, 0);
        selectionPivot.scale.set(1, 1, 1);
        selectionPivot.updateMatrixWorld(true);
        this.pivotActive = false;
      },

      set(objects, { silent = false, preserveParts = false } = {}) {
        const unique = [...new Set(objects)].filter(object => isSceneEntity(object) && object.visible && !object.userData.kamLocked);
        if (state.meshEdit.active && (unique.length !== 1 || unique[0] !== state.meshEdit.root)) exitMeshEditMode();
        if (!preserveParts && partSelection?.items().length) partSelection.clear({ keepObjectSelection: true });
        this.dissolvePivot();
        this.selected = unique;
        this.rebuildPivot();
        this.rebuildHelpers();
        updateTransformControls();
        updateSelectionBadge();
        updateStats();
        updateToolAvailability();
        refreshObjectManager();
        if (!silent && unique.length && instanceRegistry.has(unique[0])) selectAsset(unique[0].userData.assetId);
        updateSelectedLightPanel();
        updateMeshEditUI();
        updateTransformInputs();
        updateTextureTargetUI();
        refreshOpenArrayPreviews();
      },

      toggle(object) {
        if (this.has(object)) this.set(this.selected.filter(item => item !== object));
        else this.set([...this.selected, object]);
      },

      clear() { this.set([]); },

      rebuildPivot() {
        if (this.selected.length <= 1) return;
        const box = getObjectsBox(this.selected);
        if (box.isEmpty()) return;
        const center = box.getCenter(new THREE.Vector3());
        selectionPivot.position.copy(center);
        selectionPivot.rotation.set(0, 0, 0);
        selectionPivot.scale.set(1, 1, 1);
        selectionPivot.updateMatrixWorld(true);
        this.selected.forEach(object => selectionPivot.attach(object));
        this.pivotActive = true;
      },

      rebuild() { this.set(this.selected, { silent: true, preserveParts: true }); },

      target() {
        if (!this.selected.length) return null;
        return this.selected.length === 1 ? this.selected[0] : selectionPivot;
      },

      rebuildHelpers() {
        this.helpers.forEach(helper => { scene.remove(helper); helper.geometry?.dispose?.(); helper.material?.dispose?.(); });
        this.helpers.clear();
        const partTargets = partSelection?.items().length ? partSelection.items() : null;
        (partTargets || this.selected).forEach(object => {
          const helper = new THREE.BoxHelper(object, partTargets ? 0x54b8ff : 0xf2f2f2);
          helper.material.transparent = true;
          helper.material.opacity = partTargets ? .95 : .76;
          helper.material.depthTest = false;
          helper.renderOrder = 1000;
          scene.add(helper);
          this.helpers.set(object, helper);
        });
      },

      updateHelpers() { this.helpers.forEach((helper, object) => helper.setFromObject(object)); }
    };

    function meshParts(root) {
      const parts = [];
      root?.traverse(object => {
        if (object.isMesh && object.visible && !object.userData.kamEditorOnly) parts.push(object);
      });
      if (partSelection?.root === root) partSelection.items().forEach(part => { if (part.visible && !parts.includes(part)) parts.push(part); });
      return parts;
    }

    function partLabel(part, index = 0) {
      return part.name?.trim() || `Mesh ${index + 1}`;
    }

    partSelection = {
      selected: [],
      root: null,
      pivotActive: false,
      parents: new Map(),

      items() { return [...this.selected]; },
      has(part) { return this.selected.includes(part); },

      dissolvePivot() {
        if (!this.pivotActive) return;
        scene.updateMatrixWorld(true);
        [...partSelectionPivot.children].forEach(part => {
          const parent = this.parents.get(part);
          if (parent) parent.attach(part);
        });
        partSelectionPivot.position.set(0, 0, 0);
        partSelectionPivot.rotation.set(0, 0, 0);
        partSelectionPivot.scale.set(1, 1, 1);
        partSelectionPivot.updateMatrixWorld(true);
        this.parents.clear();
        this.pivotActive = false;
      },

      rebuildPivot() {
        this.dissolvePivot();
        if (this.selected.length <= 1) return;
        const box = getObjectsBox(this.selected);
        if (box.isEmpty()) return;
        partSelectionPivot.position.copy(box.getCenter(new THREE.Vector3()));
        partSelectionPivot.rotation.set(0, 0, 0);
        partSelectionPivot.scale.set(1, 1, 1);
        partSelectionPivot.updateMatrixWorld(true);
        this.selected.forEach(part => {
          this.parents.set(part, part.parent);
          partSelectionPivot.attach(part);
        });
        this.pivotActive = true;
      },

      set(parts, root = null) {
        this.dissolvePivot();
        const resolvedRoot = root || (parts[0] ? findInstance(parts[0]) : null);
        const valid = [...new Set(parts)].filter(part => part?.isMesh && part.visible && findInstance(part) === resolvedRoot);
        this.selected = valid;
        this.root = valid.length ? resolvedRoot : null;
        if (this.root?.userData?.instanceId) state.objectManagerExpanded.add(this.root.userData.instanceId);
        if (this.root) selection.set([this.root], { silent: true, preserveParts: true });
        else if (state.selectionScope === 'part') selection.set([], { silent: true, preserveParts: true });
        this.rebuildPivot();
        selection.rebuildHelpers();
        updateTransformControls();
        updateTransformInputs();
        updateSelectionBadge();
        updateToolAvailability();
        updateTextureTargetUI();
        refreshObjectManager();
      },

      toggle(part, root) {
        if (this.root && this.root !== root) { this.set([part], root); return; }
        this.has(part) ? this.set(this.selected.filter(item => item !== part), root) : this.set([...this.selected, part], root);
      },

      clear({ keepObjectSelection = false } = {}) {
        this.dissolvePivot();
        this.selected = [];
        this.root = null;
        selection.rebuildHelpers();
        updateTransformControls();
        updateTransformInputs();
        updateSelectionBadge();
        updateToolAvailability();
        updateTextureTargetUI();
        refreshObjectManager();
        if (!keepObjectSelection && state.selectionScope === 'part') selection.set([], { silent: true, preserveParts: true });
      },

      target() {
        if (!this.selected.length) return null;
        return this.selected.length === 1 ? this.selected[0] : partSelectionPivot;
      }
    };

    function objectGroupLabel(object) { return object.userData.kamGroupName || 'Ungrouped'; }

    function refreshObjectManager() {
      if (!state.uiReady || !$('[data-panel="object-manager"]')?.classList.contains('open')) return;
      const list = $('#objectManagerList');
      const query = $('#objectSearchInput').value.trim().toLocaleLowerCase();
      const allObjects = sceneEntities();
      const objects = allObjects.filter(object => {
        const assetName = assets.get(object.userData.assetId)?.name || '';
        const typeName = isLightEntity(object) ? `${object.userData.kamLightType} light` : 'model';
        const partNames = instanceRegistry.has(object) ? allRootMeshes(object).map(part => part.name).join(' ') : '';
        return !query || `${object.name} ${assetName} ${typeName} ${objectGroupLabel(object)} ${partNames}`.toLocaleLowerCase().includes(query);
      });
      list.replaceChildren();
      $('#objectManagerCount').textContent = query ? `${objects.length} of ${allObjects.length}` : `${allObjects.length} object${allObjects.length === 1 ? '' : 's'}`;
      if (!objects.length) {
        const empty = document.createElement('div');
        empty.id = 'objectManagerEmpty';
        empty.textContent = query ? 'No scene objects match your search.' : 'The scene has no objects.';
        list.appendChild(empty);
        return;
      }
      const groups = new Map();
      objects.forEach(object => {
        const key = object.userData.kamGroupId || '__ungrouped';
        if (!groups.has(key)) groups.set(key, { name: objectGroupLabel(object), objects: [] });
        groups.get(key).objects.push(object);
      });
      [...groups.entries()].sort((a, b) => (a[0] === '__ungrouped' ? 1 : b[0] === '__ungrouped' ? -1 : a[1].name.localeCompare(b[1].name))).forEach(([groupId, group]) => {
        const head = document.createElement('div');
        head.className = 'object-group-head';
        const title = document.createElement('strong');
        title.textContent = group.name;
        const count = document.createElement('span');
        count.textContent = group.objects.length;
        head.append(title, count);
        head.addEventListener('click', event => {
          const available = group.objects.filter(object => object.visible && !object.userData.kamLocked);
          setSelectionScope('object');
          selection.set(event.shiftKey ? [...selection.items(), ...available] : available);
        });
        list.appendChild(head);
        group.objects.sort((a, b) => a.name.localeCompare(b.name)).forEach(object => {
          const parts = instanceRegistry.has(object) ? allRootMeshes(object) : [];
          const expansionKey = object.userData.instanceId;
          const expanded = Boolean(parts.length && (query || state.objectManagerExpanded.has(expansionKey) || partSelection.root === object));
          const row = document.createElement('div');
          row.className = `object-row${selection.has(object) ? ' selected' : ''}${object.visible ? '' : ' hidden-object'}${object.userData.kamLocked ? ' locked-object' : ''}`;
          const expandButton = document.createElement('button');
          expandButton.className = `object-row-action${parts.length ? '' : ' placeholder'}${expanded ? ' expanded' : ''}`;
          expandButton.dataset.tooltip = parts.length ? (expanded ? 'Collapse model parts' : 'Expand model parts') : '';
          expandButton.innerHTML = `<i data-lucide="${parts.length ? 'chevron-right' : isLightEntity(object) ? 'lightbulb' : 'box'}"></i>`;
          if (parts.length) expandButton.addEventListener('click', event => {
            event.stopPropagation();
            state.objectManagerExpanded[expanded ? 'delete' : 'add'](expansionKey);
            refreshObjectManager();
          });
          const visibleButton = document.createElement('button');
          visibleButton.className = 'object-row-action';
          visibleButton.dataset.tooltip = object.visible ? 'Hide object' : 'Show object';
          visibleButton.innerHTML = `<i data-lucide="${object.visible ? 'eye' : 'eye-off'}"></i>`;
          visibleButton.addEventListener('click', event => { event.stopPropagation(); setObjectVisibility(object, !object.visible, true); });
          const lockButton = document.createElement('button');
          lockButton.className = 'object-row-action';
          lockButton.dataset.tooltip = object.userData.kamLocked ? 'Unlock object' : 'Lock object';
          lockButton.innerHTML = `<i data-lucide="${object.userData.kamLocked ? 'lock' : 'lock-open'}"></i>`;
          lockButton.addEventListener('click', event => { event.stopPropagation(); setObjectLocked(object, !object.userData.kamLocked, true); });
          const copy = document.createElement('div');
          copy.className = 'object-row-copy';
          const name = document.createElement('span');
          name.className = 'object-row-name';
          name.textContent = object.name;
          const meta = document.createElement('span');
          meta.className = 'object-row-meta';
          meta.textContent = isLightEntity(object) ? `${object.userData.kamLightType[0].toUpperCase() + object.userData.kamLightType.slice(1)} light` : object.userData.kamEditableMesh ? `Editable Mesh · ${stripExtension((assets.get(object.userData.assetId)?.name || 'Scene object').split('/').pop())}` : stripExtension((assets.get(object.userData.assetId)?.name || 'Scene object').split('/').pop());
          if (isLightEntity(object)) { meta.textContent = `● ${meta.textContent}`; meta.style.color = lightProperties(object).color; }
          copy.append(name, meta);
          copy.addEventListener('click', event => {
            if (!object.visible) { toast('Object is hidden', 'Show it before selecting.', 'eye-off'); return; }
            if (object.userData.kamLocked) { toast('Object is locked', 'Unlock it before selecting.', 'lock'); return; }
            if (instanceRegistry.has(object)) setSelectionScope('object');
            event.shiftKey ? selection.toggle(object) : selection.set([object]);
          });
          copy.addEventListener('dblclick', event => { event.stopPropagation(); renameSceneObject(object); });
          row.append(expandButton, visibleButton, lockButton, copy);
          list.appendChild(row);
          if (expanded) {
            const partList = document.createElement('div');
            partList.className = 'object-part-list';
            const rootMatches = !query || `${object.name} ${assets.get(object.userData.assetId)?.name || ''}`.toLocaleLowerCase().includes(query);
            parts.forEach((part, index) => {
              if (query && !rootMatches && !partLabel(part, index).toLocaleLowerCase().includes(query)) return;
                const partRow = document.createElement('div');
                partRow.className = `object-part-row${partSelection.has(part) ? ' selected' : ''}`;
                partRow.innerHTML = `<i data-lucide="${part.userData.kamPolyMeshPart ? 'box-select' : 'component'}"></i><span></span>`;
                $('span', partRow).textContent = partLabel(part, index);
                partRow.addEventListener('click', event => {
                  event.stopPropagation();
                  setSelectionScope('part');
                  state.objectManagerExpanded.add(expansionKey);
                  event.shiftKey || state.multiSelect ? partSelection.toggle(part, object) : partSelection.set([part], object);
                });
                partRow.addEventListener('dblclick', event => { event.stopPropagation(); renameModelPart(part); });
                partList.appendChild(partRow);
            });
            list.appendChild(partList);
          }
        });
      });
      window.lucide?.createIcons?.({ attrs: { 'stroke-width': 1.8 } });
    }

    function renameSceneObject(object) {
      const next = prompt('Object name', object.name)?.trim();
      if (!next || next === object.name) return;
      const before = object.name;
      const apply = value => { object.name = value; refreshObjectManager(); updateSelectionBadge(); updateSelectedLightPanel(); };
      apply(next);
      history.push({ label: `Rename ${before}`, undo: () => apply(before), redo: () => apply(next) });
    }

    function renameModelPart(part) {
      const next = prompt('Model part name', partLabel(part))?.trim();
      if (!next || next === part.name) return;
      const before = part.name;
      const apply = value => { part.name = value; refreshObjectManager(); updateSelectionBadge(); updateTextureTargetUI(); };
      apply(next);
      history.push({ label: `Rename ${before || 'model part'}`, undo: () => apply(before), redo: () => apply(next) });
    }

    function setObjectVisibility(object, visible, record = false) {
      const before = object.visible;
      if (before === visible) return;
      const apply = value => {
        object.visible = value;
        if (isLightEntity(object)) object.userData.kamStoredVisible = value;
        if (!value && selection.has(object)) selection.set(selection.items().filter(item => item !== object));
        updateLightHelpers();
        refreshObjectManager();
      };
      apply(visible);
      if (record) history.push({ label: `${visible ? 'Show' : 'Hide'} ${object.name}`, undo: () => apply(before), redo: () => apply(visible) });
    }

    function setObjectLocked(object, locked, record = false) {
      const before = Boolean(object.userData.kamLocked);
      if (before === locked) return;
      const apply = value => {
        object.userData.kamLocked = value;
        if (value && selection.has(object)) selection.set(selection.items().filter(item => item !== object));
        refreshObjectManager();
      };
      apply(locked);
      if (record) history.push({ label: `${locked ? 'Lock' : 'Unlock'} ${object.name}`, undo: () => apply(before), redo: () => apply(locked) });
    }

    function groupSelectedObjects() {
      const objects = selection.items();
      if (objects.length < 2) { toast('Select at least two objects', 'A group needs two or more scene objects.', 'group'); return; }
      const name = prompt('Group name', `Group ${new Set(sceneEntities().map(objectGroupLabel)).size}`)?.trim();
      if (!name) return;
      const before = objects.map(object => ({ object, id: object.userData.kamGroupId || null, name: object.userData.kamGroupName || null }));
      const groupId = uid();
      const apply = (id, groupName) => { objects.forEach(object => { object.userData.kamGroupId = id; object.userData.kamGroupName = groupName; }); refreshObjectManager(); };
      apply(groupId, name);
      history.push({
        label: `Group ${objects.length} objects`,
        undo: () => { before.forEach(item => { item.object.userData.kamGroupId = item.id; item.object.userData.kamGroupName = item.name; }); refreshObjectManager(); },
        redo: () => apply(groupId, name)
      });
    }

    function ungroupSelectedObjects() {
      const objects = selection.items().filter(object => object.userData.kamGroupId);
      if (!objects.length) return;
      const before = objects.map(object => ({ object, id: object.userData.kamGroupId, name: object.userData.kamGroupName }));
      const clear = () => { objects.forEach(object => { delete object.userData.kamGroupId; delete object.userData.kamGroupName; }); refreshObjectManager(); };
      clear();
      history.push({ label: `Ungroup ${objects.length} objects`, undo: () => { before.forEach(item => { item.object.userData.kamGroupId = item.id; item.object.userData.kamGroupName = item.name; }); refreshObjectManager(); }, redo: clear });
    }

    function updateTransformControls() {
      const meshEditing = state.meshEdit.active;
      const target = meshEditing ? (selectedMeshFaceCount() ? meshEditPivot : null) : (partSelection?.target() || selection.target());
      const containsLight = selection.items().some(isLightEntity);
      transformControls.forEach(control => {
        const mode = control.getMode();
        const enabled = Boolean(target && (meshEditing ? mode === 'translate' : state.transformEnabled[mode]) && !(mode === 'scale' && containsLight) && !state.areaArray.active && !state.paint.active);
        if (target) control.attach(target); else control.detach();
        control.visible = enabled;
        control.enabled = enabled && !state.gizmoDragging;
        control.setSpace(mode === 'scale' ? 'local' : state.transformSpace);
        control.setTranslationSnap(state.snapEnabled ? state.moveSnap : null);
        control.setRotationSnap(state.snapEnabled ? THREE.MathUtils.degToRad(state.rotateSnap) : null);
        control.setScaleSnap(state.snapEnabled ? state.scaleSnap : null);
      });
      updateTransformInputs();
    }

    function activeTransformTargets() {
      return partSelection?.items().length ? partSelection.items() : selection.items();
    }

    function activeTransformTarget() {
      if (state.meshEdit.active) return selectedMeshFaceCount() ? meshEditPivot : null;
      return partSelection?.target() || selection.target();
    }

    function captureStates(objects) {
      scene.updateMatrixWorld(true);
      return objects.map(object => {
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        object.matrixWorld.decompose(position, quaternion, scale);
        return { position: position.toArray(), quaternion: quaternion.toArray(), scale: scale.toArray() };
      });
    }

    function applyStates(objects, states) {
      scene.updateMatrixWorld(true);
      objects.forEach((object, index) => {
        const value = states[index];
        if (!value || !object.parent) return;
        const world = new THREE.Matrix4().compose(
          new THREE.Vector3().fromArray(value.position),
          new THREE.Quaternion().fromArray(value.quaternion),
          new THREE.Vector3().fromArray(value.scale)
        );
        const parentInverse = new THREE.Matrix4().copy(object.parent.matrixWorld).invert();
        const local = parentInverse.multiply(world);
        local.decompose(object.position, object.quaternion, object.scale);
        object.updateMatrixWorld(true);
      });
      selection.rebuild();
    }

    function statesEqual(a, b) {
      const epsilon = 1e-6;
      return a.length === b.length && a.every((stateA, i) => {
        const stateB = b[i];
        return ['position', 'quaternion', 'scale'].every(key => stateA[key].every((v, j) => Math.abs(v - stateB[key][j]) < epsilon));
      });
    }

    const history = {
      undoStack: [],
      redoStack: [],
      limit: 120,
      push(command) {
        this.undoStack.push(command);
        if (this.undoStack.length > this.limit) this.undoStack.shift();
        this.redoStack.length = 0;
        updateHistoryButtons();
      },
      undo() {
        const command = this.undoStack.pop();
        if (!command) return;
        command.undo();
        this.redoStack.push(command);
        updateHistoryButtons();
        toast('Undo', command.label, 'undo-2');
      },
      redo() {
        const command = this.redoStack.pop();
        if (!command) return;
        command.redo();
        this.undoStack.push(command);
        updateHistoryButtons();
        toast('Redo', command.label, 'redo-2');
      },
      clear() { this.undoStack.length = 0; this.redoStack.length = 0; updateHistoryButtons(); }
    };

    function pushTransformHistory(objects, before, after, mode) {
      const label = `${mode === 'translate' ? 'Move' : mode === 'rotate' ? 'Rotate' : 'Scale'} ${objects.length > 1 ? `${objects.length} objects` : objects[0]?.name || 'object'}`;
      history.push({ label, undo: () => applyStates(objects, before), redo: () => applyStates(objects, after) });
    }

    const transformInputBefore = new WeakMap();
    const TRANSFORM_FIELDS = {
      position: ['positionXInput','positionYInput','positionZInput'],
      rotation: ['rotationXInput','rotationYInput','rotationZInput'],
      scale: ['scaleXInput','scaleYInput','scaleZInput']
    };

    function readTargetTransform(target) {
      if (!target) return null;
      target.updateWorldMatrix(true, false);
      const world = state.transformSpace === 'world';
      const position = world ? target.getWorldPosition(new THREE.Vector3()) : target.position.clone();
      const quaternion = world ? target.getWorldQuaternion(new THREE.Quaternion()) : target.quaternion.clone();
      const scale = world ? target.getWorldScale(new THREE.Vector3()) : target.scale.clone();
      const rotation = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');
      return { position, rotation, scale };
    }

    function setTargetWorldTransform(target, position, quaternion, scale) {
      const world = new THREE.Matrix4().compose(position, quaternion, scale);
      const local = target.parent ? new THREE.Matrix4().copy(target.parent.matrixWorld).invert().multiply(world) : world;
      local.decompose(target.position, target.quaternion, target.scale);
      target.updateMatrixWorld(true);
    }

    function applyTransformField(type, axisIndex, rawValue) {
      const target = activeTransformTarget();
      if (!target || (state.meshEdit.active && type !== 'position')) return;
      const values = readTargetTransform(target);
      const axis = ['x','y','z'][axisIndex];
      const world = state.transformSpace === 'world';
      if (type === 'position') {
        values.position[axis] = rawValue;
      } else if (type === 'rotation') {
        values.rotation[axis] = THREE.MathUtils.degToRad(rawValue);
      } else {
        const safe = Math.max(.001, Math.abs(rawValue) || .001);
        if (state.uniformScale) {
          const current = Math.max(.000001, Math.abs(values.scale[axis]));
          const ratio = safe / current;
          values.scale.multiplyScalar(ratio);
        } else values.scale[axis] = safe;
      }
      const quaternion = new THREE.Quaternion().setFromEuler(values.rotation);
      if (world) setTargetWorldTransform(target, values.position, quaternion, values.scale);
      else {
        target.position.copy(values.position);
        target.quaternion.copy(quaternion);
        target.scale.copy(values.scale);
        target.updateMatrixWorld(true);
      }
      selection.updateHelpers();
      updateTransformInputs(true);
      refreshOpenArrayPreviews();
    }

    function updateTransformInputs(force = false) {
      if (state.transformInputEditing && !force) return;
      const target = activeTransformTarget();
      const values = readTargetTransform(target);
      const faceMode = state.meshEdit.active;
      Object.entries(TRANSFORM_FIELDS).forEach(([type, ids]) => {
        const available = Boolean(values && (!faceMode || type === 'position'));
        const fields = $(`[data-transform-fields="${type}"]`);
        const empty = $(`#${type === 'position' ? 'position' : type === 'rotation' ? 'rotation' : 'scale'}Empty`);
        if (fields) fields.hidden = !available;
        if (empty) empty.hidden = available;
        ids.forEach((id, index) => {
          const input = $(`#${id}`);
          input.disabled = !available;
          if (!available || document.activeElement === input) return;
          const axis = ['x','y','z'][index];
          const value = type === 'rotation' ? THREE.MathUtils.radToDeg(values.rotation[axis]) : values[type][axis];
          input.value = trimNumber(value, type === 'rotation' ? 2 : 4);
        });
      });
      $('#positionSpaceLabel').textContent = state.transformSpace === 'world' ? 'World' : 'Local';
    }

    function bindTransformInputs() {
      Object.entries(TRANSFORM_FIELDS).forEach(([type, ids]) => ids.forEach((id, axisIndex) => {
        const input = $(`#${id}`);
        const begin = () => {
          const targets = activeTransformTargets();
          if (!targets.length || transformInputBefore.has(input)) return;
          transformInputBefore.set(input, { targets, before: captureStates(targets) });
          state.transformInputEditing = true;
        };
        input.addEventListener('focus', begin);
        input.addEventListener('input', () => {
          begin();
          applyTransformField(type, axisIndex, Number(input.value) || 0);
        });
        input.addEventListener('change', () => {
          const session = transformInputBefore.get(input);
          state.transformInputEditing = false;
          if (!session) { updateTransformInputs(); return; }
          const after = captureStates(session.targets);
          transformInputBefore.delete(input);
          if (!statesEqual(session.before, after)) pushTransformHistory(session.targets, session.before, after, type === 'position' ? 'translate' : type);
          updateTransformControls();
        });
        input.addEventListener('blur', () => { state.transformInputEditing = false; updateTransformInputs(); });
      }));
    }

    function cloneMaterials(root) {
      root.traverse(object => {
        if (!object.isMesh) return;
        if (Array.isArray(object.material)) object.material = object.material.map(material => material?.clone?.() || material);
        else if (object.material?.clone) object.material = object.material.clone();
        object.castShadow = state.shadows;
        object.receiveShadow = state.shadows;
        object.frustumCulled = true;
      });
      return root;
    }

    function tagInstanceParts(root) {
      let index = 0;
      root.traverse(object => {
        if (!object.isMesh || object.userData.kamEditorOnly) return;
        object.userData.kamSourceMeshIndex ??= index;
        object.userData.kamPartKey ||= `source:${index}`;
        index++;
      });
    }

    function createInstance(asset, nameOverride = null, { trackUsage = true } = {}) {
      const model = cloneMaterials(SkeletonUtils.clone(asset.scene));
      const wrapper = new THREE.Group();
      const index = trackUsage ? (assetUsage.get(asset.id) || 0) + 1 : (assetUsage.get(asset.id) || 0) + 1;
      if (trackUsage) assetUsage.set(asset.id, index);
      wrapper.name = nameOverride || `${stripExtension(asset.name)} ${index}`;
      wrapper.userData.kamInstance = true;
      wrapper.userData.instanceId = uid();
      wrapper.userData.assetId = asset.id;
      wrapper.add(model);
      tagInstanceParts(wrapper);
      wrapper.userData.kamOriginalColors = collectMaterialColors(wrapper);
      return wrapper;
    }

    const POLY_WELD_PRECISION = 100000;
    const POLY_SURFACE_COS = Math.cos(THREE.MathUtils.degToRad(4));
    function polyVertexKey(x, y, z) { return `${Math.round(x * POLY_WELD_PRECISION)},${Math.round(y * POLY_WELD_PRECISION)},${Math.round(z * POLY_WELD_PRECISION)}`; }
    function polyFaceOffset(faceIndex) { return faceIndex * 9; }
    function polyUVOffset(faceIndex) { return faceIndex * 6; }

    function polyFaceNormal(data, faceIndex, target = new THREE.Vector3()) {
      const offset = polyFaceOffset(faceIndex);
      const ax = data.positions[offset], ay = data.positions[offset + 1], az = data.positions[offset + 2];
      const abx = data.positions[offset + 3] - ax, aby = data.positions[offset + 4] - ay, abz = data.positions[offset + 5] - az;
      const acx = data.positions[offset + 6] - ax, acy = data.positions[offset + 7] - ay, acz = data.positions[offset + 8] - az;
      return target.set(aby * acz - abz * acy, abz * acx - abx * acz, abx * acy - aby * acx).normalize();
    }

    function computePolySurfaces(data) {
      const faceCount = Math.floor(data.positions.length / 9);
      const normals = Array.from({ length: faceCount }, (_, index) => polyFaceNormal(data, index));
      const edges = new Map();
      const adjacency = Array.from({ length: faceCount }, () => new Set());
      for (let face = 0; face < faceCount; face++) {
        const offset = polyFaceOffset(face);
        const keys = [0, 1, 2].map(corner => polyVertexKey(data.positions[offset + corner * 3], data.positions[offset + corner * 3 + 1], data.positions[offset + corner * 3 + 2]));
        [[0,1],[1,2],[2,0]].forEach(([a,b]) => {
          const key = keys[a] < keys[b] ? `${keys[a]}|${keys[b]}` : `${keys[b]}|${keys[a]}`;
          const linked = edges.get(key) || [];
          linked.forEach(other => { adjacency[face].add(other); adjacency[other].add(face); });
          linked.push(face); edges.set(key, linked);
        });
      }
      const surfaceIds = new Array(faceCount).fill(-1);
      let nextSurface = 0;
      for (let start = 0; start < faceCount; start++) {
        if (surfaceIds[start] !== -1) continue;
        const queue = [start]; surfaceIds[start] = nextSurface;
        while (queue.length) {
          const face = queue.pop();
          adjacency[face].forEach(neighbor => {
            if (surfaceIds[neighbor] !== -1) return;
            if ((data.faceMaterials[neighbor] || 0) !== (data.faceMaterials[face] || 0)) return;
            if (normals[neighbor].dot(normals[face]) < POLY_SURFACE_COS) return;
            surfaceIds[neighbor] = nextSurface; queue.push(neighbor);
          });
        }
        nextSurface++;
      }
      data.surfaceIds = surfaceIds;
      data.faceNormals = normals.map(normal => normal.toArray());
      return data;
    }

    function updatePolyFaceNormals(data, faceIndices = null) {
      const faceCount = Math.floor(data.positions.length / 9);
      if (!data.normals) data.normals = new Array(data.positions.length).fill(0);
      else if (data.normals.length < data.positions.length) while (data.normals.length < data.positions.length) data.normals.push(0);
      else if (data.normals.length > data.positions.length) data.normals.length = data.positions.length;
      const faces = faceIndices || Array.from({ length: faceCount }, (_, index) => index);
      faces.forEach(face => {
        if (face < 0 || face >= faceCount) return;
        const normal = polyFaceNormal(data, face);
        const offset = polyFaceOffset(face);
        for (let corner = 0; corner < 3; corner++) {
          data.normals[offset + corner * 3] = normal.x;
          data.normals[offset + corner * 3 + 1] = normal.y;
          data.normals[offset + corner * 3 + 2] = normal.z;
        }
      });
    }

    function geometryToPolyData(geometry, matrix) {
      const source = geometry.index ? geometry.toNonIndexed() : geometry.clone();
      const position = source.getAttribute('position');
      if (!position || position.count < 3) { source.dispose(); return null; }
      const uv = source.getAttribute('uv');
      const color = source.getAttribute('color');
      const normal = source.getAttribute('normal');
      const positions = [];
      const vector = new THREE.Vector3();
      for (let index = 0; index < position.count; index++) {
        vector.fromBufferAttribute(position, index).applyMatrix4(matrix);
        positions.push(vector.x, vector.y, vector.z);
      }
      const uvs = uv ? [] : null;
      if (uv) for (let index = 0; index < uv.count; index++) uvs.push(uv.getX(index), uv.getY(index));
      const colorItemSize = color ? color.itemSize : 0;
      const colors = color ? [] : null;
      if (color) for (let index = 0; index < color.count; index++) {
        colors.push(color.getX(index), color.getY(index), color.getZ(index));
        if (colorItemSize === 4) colors.push(color.getW(index));
      }
      const normals = normal ? [] : null;
      if (normal) {
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
        for (let index = 0; index < normal.count; index++) {
          vector.fromBufferAttribute(normal, index).applyNormalMatrix(normalMatrix);
          normals.push(vector.x, vector.y, vector.z);
        }
      }
      if (matrix.determinant() < 0) {
        for (let face = 0; face < Math.floor(position.count / 3); face++) {
          const po = polyFaceOffset(face);
          for (let axis = 0; axis < 3; axis++) [positions[po + 3 + axis], positions[po + 6 + axis]] = [positions[po + 6 + axis], positions[po + 3 + axis]];
          if (uvs) {
            const uo = polyUVOffset(face);
            for (let axis = 0; axis < 2; axis++) [uvs[uo + 2 + axis], uvs[uo + 4 + axis]] = [uvs[uo + 4 + axis], uvs[uo + 2 + axis]];
          }
          if (colors) {
            const co = face * 3 * colorItemSize;
            for (let axis = 0; axis < colorItemSize; axis++) [colors[co + colorItemSize + axis], colors[co + colorItemSize * 2 + axis]] = [colors[co + colorItemSize * 2 + axis], colors[co + colorItemSize + axis]];
          }
          if (normals) for (let axis = 0; axis < 3; axis++) [normals[po + 3 + axis], normals[po + 6 + axis]] = [normals[po + 6 + axis], normals[po + 3 + axis]];
        }
      }
      const faceCount = Math.floor(position.count / 3);
      const faceMaterials = new Array(faceCount).fill(0);
      source.groups.forEach(group => {
        const first = Math.floor(group.start / 3);
        const last = Math.min(faceCount, Math.ceil((group.start + group.count) / 3));
        for (let face = first; face < last; face++) faceMaterials[face] = group.materialIndex || 0;
      });
      source.dispose();
      const data = { positions, uvs, colors, colorItemSize, normals, faceMaterials };
      if (!normals) updatePolyFaceNormals(data);
      return computePolySurfaces(data);
    }

    function rebuildPolyGeometry(part) {
      const data = part.userData.kamPolyData;
      computePolySurfaces(data);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
      if (data.uvs?.length === data.positions.length / 3 * 2) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
      if (data.colors?.length === data.positions.length / 3 * data.colorItemSize) geometry.setAttribute('color', new THREE.Float32BufferAttribute(data.colors, data.colorItemSize));
      if (data.normals?.length === data.positions.length) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
      else geometry.computeVertexNormals();
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      const faceCount = Math.floor(data.positions.length / 9);
      if (faceCount) {
        let startFace = 0, material = data.faceMaterials[0] || 0;
        for (let face = 1; face <= faceCount; face++) {
          const next = face < faceCount ? (data.faceMaterials[face] || 0) : null;
          if (face === faceCount || next !== material) {
            geometry.addGroup(startFace * 3, (face - startFace) * 3, material);
            startFace = face; material = next;
          }
        }
      }
      part.geometry?.dispose?.();
      part.geometry = geometry;
      part.castShadow = state.shadows; part.receiveShadow = state.shadows;
    }

    function createEditableMeshPart(data, materials, name, sourceMeshIndex = 0) {
      const materialList = (Array.isArray(materials) ? materials : [materials]).filter(Boolean).map(material => material.clone?.() || material);
      if (!materialList.length) materialList.push(new THREE.MeshStandardMaterial({ color: 0xbfc3c7, roughness: .75 }));
      const part = new THREE.Mesh(new THREE.BufferGeometry(), materialList.length === 1 ? materialList[0] : materialList);
      part.name = name || `Editable part ${sourceMeshIndex + 1}`;
      part.userData.kamPolyMeshPart = true;
      part.userData.kamSourceMeshIndex = sourceMeshIndex;
      part.userData.kamPolyData = { positions: [...data.positions], uvs: data.uvs ? [...data.uvs] : null, colors: data.colors ? [...data.colors] : null, colorItemSize: data.colorItemSize || 0, normals: data.normals ? [...data.normals] : null, faceMaterials: [...data.faceMaterials] };
      rebuildPolyGeometry(part);
      return part;
    }

    function editableParts(root) {
      const parts = [];
      root?.traverse(object => { if (object.userData?.kamPolyMeshPart) parts.push(object); });
      if (partSelection?.root === root) partSelection.items().forEach(part => { if (part.userData?.kamPolyMeshPart && !parts.includes(part)) parts.push(part); });
      return parts;
    }

    function setEditableConversion(root, enabled) {
      const store = editableMeshStore.get(root);
      if (!store || store.mode === 'inplace') return;
      if (state.meshEdit.active && state.meshEdit.root === root) exitMeshEditMode();
      while (root.children.length) root.remove(root.children[0]);
      (enabled ? store.parts : store.originalChildren).forEach(child => root.add(child));
      root.userData.kamEditableMesh = enabled;
      selection.set([root], { silent: true });
      updateMeshEditUI();
    }

    function clonePolyData(data) {
      return {
        positions: [...data.positions],
        uvs: data.uvs ? [...data.uvs] : null,
        colors: data.colors ? [...data.colors] : null,
        colorItemSize: data.colorItemSize || 0,
        normals: data.normals ? [...data.normals] : null,
        faceMaterials: [...data.faceMaterials]
      };
    }

    function setPartEditableRecords(root, records, enabled) {
      if (state.meshEdit.active && state.meshEdit.root === root) exitMeshEditMode();
      records.forEach(record => {
        const part = record.part;
        part.geometry?.dispose?.();
        if (enabled) {
          part.userData.kamPolyMeshPart = true;
          part.userData.kamPolyData = clonePolyData(record.data);
          part.userData.kamSourceMeshIndex = record.sourceMeshIndex;
          rebuildPolyGeometry(part);
        } else {
          part.geometry = record.originalGeometry.clone();
          delete part.userData.kamPolyMeshPart;
          delete part.userData.kamPolyData;
        }
        record.enabled = enabled;
      });
      root.userData.kamEditableMesh = editableParts(root).length > 0;
      selection.set([root], { silent: true });
      updateMeshEditUI();
      refreshObjectManager();
      updateStats();
    }

    function convertPartsToEditable(root, targets, scopedPart = null) {
      const unsupported = targets.filter(part => part.isSkinnedMesh || part.morphTargetInfluences?.length);
      if (unsupported.length) {
        toast('Conversion unavailable', 'Skinned meshes and morph targets cannot be converted to Editable Mesh.', 'triangle-alert'); return;
      }
      const convertible = targets.filter(part => part.isMesh && !part.userData.kamEditorOnly && !part.userData.kamPolyMeshPart);
      if (!convertible.length) {
        const target = scopedPart?.userData.kamPolyMeshPart ? scopedPart : null;
        if (editableParts(root).length) enterMeshEditMode(root, target);
        else toast('No editable geometry', 'The selected target has no static triangle mesh.', 'triangle-alert');
        return;
      }
      const triangleCount = convertible.reduce((count, mesh) => count + Math.floor((mesh.geometry?.index?.count || mesh.geometry?.getAttribute('position')?.count || 0) / 3), 0);
      if (triangleCount > 50000 && !confirm(`This selection contains ${triangleCount.toLocaleString()} triangles. Editing may be slow. Convert anyway?`)) return;
      let store = editableMeshStore.get(root);
      if (!store || store.mode !== 'inplace') {
        if (store && store.mode !== 'inplace') { toast('Model already flattened', 'This legacy Editable Mesh model is already fully converted.', 'box-select'); enterMeshEditMode(root, scopedPart); return; }
        store = { mode: 'inplace', records: new Map() };
        editableMeshStore.set(root, store);
      }
      const rootMeshes = allRootMeshes(root);
      const records = [];
      convertible.forEach(part => {
        const data = geometryToPolyData(part.geometry, new THREE.Matrix4());
        if (!data) return;
        const record = {
          part,
          sourceMeshIndex: part.userData.kamSourceMeshIndex ?? rootMeshes.indexOf(part),
          originalGeometry: part.geometry.clone(),
          data: clonePolyData(data),
          enabled: true
        };
        store.records.set(part, record);
        records.push(record);
      });
      if (!records.length) { toast('No editable faces', 'No triangle surfaces could be extracted from this selection.', 'triangle-alert'); return; }
      setPartEditableRecords(root, records, true);
      history.push({
        label: `Convert ${records.length === 1 ? partLabel(records[0].part) : `${records.length} parts`} to Editable Mesh`,
        undo: () => setPartEditableRecords(root, records, false),
        redo: () => setPartEditableRecords(root, records, true)
      });
      const scope = scopedPart && records.some(record => record.part === scopedPart) ? scopedPart : null;
      enterMeshEditMode(root, scope);
      toast('Editable Mesh ready', `${triangleCount.toLocaleString()} triangles converted in place.`, 'box-select');
    }

    function convertSelectedToEditable() {
      const selectedParts = partSelection.items();
      if (selectedParts.length) {
        if (selectedParts.length !== 1) { toast('Select one part', 'Face Edit works on one model part at a time.', 'component'); return; }
        convertPartsToEditable(partSelection.root, selectedParts, selectedParts[0]);
        return;
      }
      const objects = modelSelection();
      if (objects.length !== 1) { toast('Select one model', 'Editable Mesh conversion works on one imported GLB object at a time.', 'box-select'); return; }
      const root = objects[0];
      const meshes = allRootMeshes(root).filter(part => !part.userData.kamPolyMeshPart);
      if (!meshes.length && editableParts(root).length) { enterMeshEditMode(root); return; }
      convertPartsToEditable(root, meshes);
    }

    function serializeEditableRoot(root) {
      if (!root.userData.kamEditableMesh) return null;
      const store = editableMeshStore.get(root);
      const parts = editableParts(root);
      const serialized = parts.map((part, index) => ({
        partKey: part.userData.kamPartKey || null,
        name: part.name,
        sourceMeshIndex: part.userData.kamSourceMeshIndex ?? index,
        visible: part.visible,
        ...clonePolyData(part.userData.kamPolyData)
      }));
      return { mode: store?.mode === 'inplace' || parts.some(part => findInstance(part) === root && part.parent !== root) ? 'inplace' : 'flattened', parts: serialized };
    }

    function restoreEditableRoot(root, saved) {
      if (!saved?.parts?.length) return false;
      if (saved.mode === 'inplace') {
        const sourceMeshes = allRootMeshes(root);
        const records = new Map();
        saved.parts.forEach((partData, index) => {
          const part = sourceMeshes.find(mesh => partData.partKey && mesh.userData.kamPartKey === partData.partKey) || sourceMeshes[partData.sourceMeshIndex] || sourceMeshes[index];
          if (!part) return;
          const record = {
            part,
            sourceMeshIndex: partData.sourceMeshIndex ?? index,
            originalGeometry: part.geometry.clone(),
            data: clonePolyData(partData),
            enabled: true
          };
          records.set(part, record);
          part.name = partData.name || part.name;
          part.visible = partData.visible !== false;
          part.userData.kamPolyMeshPart = true;
          part.userData.kamPolyData = clonePolyData(partData);
          part.userData.kamSourceMeshIndex = record.sourceMeshIndex;
          rebuildPolyGeometry(part);
        });
        editableMeshStore.set(root, { mode: 'inplace', records });
        root.userData.kamEditableMesh = records.size > 0;
        return records.size > 0;
      }
      const sourceMeshes = [];
      root.traverse(object => { if (object.isMesh && !object.userData.kamEditorOnly) sourceMeshes.push(object); });
      const parts = saved.parts.map((partData, index) => {
        const source = sourceMeshes[partData.sourceMeshIndex] || sourceMeshes[index];
        const part = createEditableMeshPart(partData, source?.material, partData.name, partData.sourceMeshIndex || index);
        part.userData.kamPartKey = partData.partKey || `source:${partData.sourceMeshIndex ?? index}`;
        part.visible = partData.visible !== false;
        return part;
      });
      editableMeshStore.set(root, { mode: 'flattened', originalChildren: [...root.children], parts });
      while (root.children.length) root.remove(root.children[0]);
      parts.forEach(part => root.add(part));
      root.userData.kamEditableMesh = true;
      return true;
    }

    function selectedMeshFaceCount() {
      let count = 0;
      state.meshEdit.selected.forEach(faces => { count += faces.size; });
      return count;
    }

    function removeMeshEditOverlays() {
      state.meshEdit.overlays.forEach(overlay => {
        overlay.removeFromParent();
        overlay.traverse(object => { object.geometry?.dispose?.(); object.material?.dispose?.(); });
      });
      state.meshEdit.overlays.clear();
    }

    function updateMeshEditOverlays() {
      removeMeshEditOverlays();
      if (!state.meshEdit.active) return;
      state.meshEdit.selected.forEach((faces, part) => {
        if (!faces.size) return;
        const data = part.userData.kamPolyData;
        const positions = [];
        faces.forEach(face => {
          const offset = polyFaceOffset(face);
          const normal = polyFaceNormal(data, face);
          for (let corner = 0; corner < 3; corner++) {
            positions.push(data.positions[offset + corner * 3] + normal.x * .003, data.positions[offset + corner * 3 + 1] + normal.y * .003, data.positions[offset + corner * 3 + 2] + normal.z * .003);
          }
        });
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const group = new THREE.Group();
        group.name = '__MeshFaceSelection'; group.userData.kamEditorOnly = true;
        const fill = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0x4fb3ff, transparent: true, opacity: .32, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
        fill.userData.kamEditorOnly = true;
        fill.renderOrder = 1250;
        const edgeGeometry = new THREE.EdgesGeometry(geometry, 1);
        const edges = new THREE.LineSegments(edgeGeometry, new THREE.LineBasicMaterial({ color: 0xbde5ff, transparent: true, opacity: .95, depthTest: false, toneMapped: false }));
        edges.userData.kamEditorOnly = true;
        edges.renderOrder = 1251;
        group.add(fill, edges); part.add(group); state.meshEdit.overlays.set(part, group);
      });
      updateMeshEditPivot();
      updateMeshEditUI();
    }

    function clearMeshFaceSelection() {
      state.meshEdit.selected.clear();
      removeMeshEditOverlays();
      updateMeshEditPivot(); updateMeshEditUI(); updateTransformControls();
    }

    function updateMeshEditPivot() {
      const center = new THREE.Vector3();
      const point = new THREE.Vector3();
      let count = 0;
      state.meshEdit.selected.forEach((faces, part) => {
        part.updateMatrixWorld(true);
        const data = part.userData.kamPolyData;
        faces.forEach(face => {
          const offset = polyFaceOffset(face);
          for (let corner = 0; corner < 3; corner++) {
            point.set(data.positions[offset + corner * 3], data.positions[offset + corner * 3 + 1], data.positions[offset + corner * 3 + 2]).applyMatrix4(part.matrixWorld);
            center.add(point); count++;
          }
        });
      });
      if (count) center.multiplyScalar(1 / count);
      meshEditPivot.position.copy(center);
      if (state.meshEdit.partScope) state.meshEdit.partScope.getWorldQuaternion(meshEditPivot.quaternion);
      else if (state.meshEdit.root) state.meshEdit.root.getWorldQuaternion(meshEditPivot.quaternion);
      else meshEditPivot.quaternion.identity();
      meshEditPivot.scale.set(1, 1, 1); meshEditPivot.updateMatrixWorld(true);
    }

    function updateMeshEditUI() {
      if (!state.uiReady) return;
      const selected = selection.items();
      const selectedPartItems = state.meshEdit.active ? (state.meshEdit.partScope ? [state.meshEdit.partScope] : []) : partSelection.items();
      const selectedPart = selectedPartItems.length === 1 ? selectedPartItems[0] : null;
      const multipleParts = selectedPartItems.length > 1;
      const root = state.meshEdit.active ? state.meshEdit.root : (selectedPartItems.length ? partSelection.root : selected.length === 1 && instanceRegistry.has(selected[0]) ? selected[0] : null);
      const editable = multipleParts ? false : selectedPart ? Boolean(selectedPart.userData.kamPolyMeshPart) : Boolean(editableParts(root).length);
      const remaining = root ? allRootMeshes(root).filter(part => !part.userData.kamPolyMeshPart && !part.isSkinnedMesh && !part.morphTargetInfluences?.length) : [];
      const status = $('#meshEditStatus');
      status.classList.toggle('ready', Boolean(root));
      const copy = $('span', status);
      if (!root) copy.textContent = 'Select one imported GLB object or model part.';
      else if (multipleParts) copy.textContent = `${selectedPartItems.length} parts selected · choose one for Face Edit`;
      else if (selectedPart && editable) copy.textContent = `${partLabel(selectedPart)} · Editable Part`;
      else if (selectedPart) copy.textContent = `${partLabel(selectedPart)} · ready to convert in place`;
      else if (editable) copy.textContent = `${root.name} · ${editableParts(root).length} editable part${editableParts(root).length === 1 ? '' : 's'}`;
      else copy.textContent = `${root.name} · ready to convert`;
      $('#convertEditableMeshBtn').disabled = !root || multipleParts || state.meshEdit.active || (selectedPart ? editable : !remaining.length);
      $('#convertEditableMeshBtn').innerHTML = `<i data-lucide="combine"></i>${selectedPart ? 'Convert selected part' : editable ? 'Convert remaining parts' : 'Convert to editable'}`;
      $('#toggleMeshEditModeBtn').disabled = multipleParts || !editable;
      $('span', $('#toggleMeshEditModeBtn')).textContent = state.meshEdit.active ? 'Exit edit mode' : 'Enter edit mode';
      $('#meshEditControls').hidden = !state.meshEdit.active;
      $('#meshSelectedFaceCount').textContent = `${selectedMeshFaceCount()} face${selectedMeshFaceCount() === 1 ? '' : 's'}`;
      $('#extrudeMeshFacesBtn').disabled = !state.meshEdit.active || !selectedMeshFaceCount();
      $('#clearMeshSelectionBtn').disabled = !selectedMeshFaceCount();
      $$('#meshSelectionModeSegment button').forEach(button => button.classList.toggle('active', button.dataset.meshSelection === state.meshEdit.selectionMode));
      window.lucide?.createIcons?.({ attrs: { 'stroke-width': 1.8 } });
    }

    function enterMeshEditMode(root = selection.items()[0], scopedPart = null) {
      const targets = scopedPart ? [scopedPart].filter(part => part?.userData.kamPolyMeshPart) : editableParts(root);
      if (!root || !targets.length || !instanceRegistry.has(root)) { toast('Editable Mesh required', 'Convert the selected model or part before entering Face Edit Mode.', 'box-select'); return; }
      if (state.areaArray.active) { panelManager.close('area-array'); panelManager.close('select-area'); }
      if (state.paint.active) panelManager.close('paint');
      state.meshEdit.active = true; state.meshEdit.root = root; state.meshEdit.partScope = scopedPart || null; state.meshEdit.selected.clear();
      selection.set([root], { silent: true });
      state.selectionScope = 'face';
      $$('#selectionScopeSegment button').forEach(button => button.classList.toggle('active', button.dataset.selectionScope === 'face'));
      syncSelectionScopeStatus('face');
      state.selectionEnabled = true; syncToggle('selectBtn', true);
      state.transformEnabled.translate = true; syncToggle('moveBtn', true);
      clearAlignmentGuides(); updateMeshEditOverlays(); updateMeshEditUI(); updateTransformControls();
      updateToolAvailability();
      $('#meshEditBtn').classList.add('active');
    }

    function exitMeshEditMode({ preserveScope = false } = {}) {
      if (!state.meshEdit.active) {
        if (!preserveScope && state.selectionScope === 'face') {
          state.selectionScope = partSelection.items().length ? 'part' : 'object';
          $$('#selectionScopeSegment button').forEach(button => button.classList.toggle('active', button.dataset.selectionScope === state.selectionScope));
          syncSelectionScopeStatus(state.selectionScope);
        }
        return;
      }
      const returnRoot = state.meshEdit.root;
      const returnPart = state.meshEdit.partScope;
      state.meshEdit.active = false; state.meshEdit.root = null; state.meshEdit.partScope = null; state.meshEdit.selected.clear();
      if (!preserveScope) {
        const returnToPart = Boolean(returnPart && (findInstance(returnPart) === returnRoot || returnPart.parent));
        state.selectionScope = returnToPart ? 'part' : 'object';
        $$('#selectionScopeSegment button').forEach(button => button.classList.toggle('active', button.dataset.selectionScope === state.selectionScope));
        syncSelectionScopeStatus(state.selectionScope);
      }
      removeMeshEditOverlays();
      transformControls.forEach(control => control.detach());
      if (!preserveScope && returnPart && state.selectionScope === 'part') partSelection.set([returnPart], returnRoot);
      updateMeshEditUI(); updateTransformControls(); updateToolAvailability();
      if (!$('[data-panel="mesh-edit"]')?.classList.contains('open')) $('#meshEditBtn').classList.remove('active');
    }

    function toggleMeshEditMode() {
      if (state.meshEdit.active) { exitMeshEditMode(); return; }
      const scopedPart = partSelection.items().length === 1 ? partSelection.items()[0] : null;
      enterMeshEditMode(scopedPart ? partSelection.root : selection.items()[0], scopedPart);
    }

    function meshEditTargetParts(root = state.meshEdit.root) {
      return state.meshEdit.partScope ? [state.meshEdit.partScope] : editableParts(root);
    }

    function pickEditableFace(clientX, clientY, additive = false) {
      const root = state.meshEdit.root;
      if (!state.meshEdit.active || !root) return;
      pointer.x = (clientX / window.innerWidth) * 2 - 1;
      pointer.y = -(clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(pointer, activeCamera);
      const hit = raycaster.intersectObjects(meshEditTargetParts(root).filter(part => part.visible), false)[0];
      if (!hit || !Number.isInteger(hit.faceIndex)) { if (!additive) clearMeshFaceSelection(); return; }
      const part = hit.object;
      const data = part.userData.kamPolyData;
      const picked = state.meshEdit.selectionMode === 'surface' ? data.surfaceIds.reduce((faces, surface, index) => { if (surface === data.surfaceIds[hit.faceIndex]) faces.push(index); return faces; }, []) : [hit.faceIndex];
      if (!additive) state.meshEdit.selected.clear();
      const selected = state.meshEdit.selected.get(part) || new Set();
      const removing = additive && picked.every(face => selected.has(face));
      picked.forEach(face => removing ? selected.delete(face) : selected.add(face));
      if (selected.size) state.meshEdit.selected.set(part, selected); else state.meshEdit.selected.delete(part);
      updateMeshEditOverlays(); updateTransformControls();
    }

    function capturePolyState(root) {
      return meshEditTargetParts(root).map(part => ({ part, positions: Float32Array.from(part.userData.kamPolyData.positions), uvs: part.userData.kamPolyData.uvs ? Float32Array.from(part.userData.kamPolyData.uvs) : null, colors: part.userData.kamPolyData.colors ? Float32Array.from(part.userData.kamPolyData.colors) : null, colorItemSize: part.userData.kamPolyData.colorItemSize || 0, normals: part.userData.kamPolyData.normals ? Float32Array.from(part.userData.kamPolyData.normals) : null, faceMaterials: Uint32Array.from(part.userData.kamPolyData.faceMaterials) }));
    }

    function applyPolyState(root, snapshot) {
      snapshot.forEach(saved => {
        saved.part.userData.kamPolyData = { positions: Array.from(saved.positions), uvs: saved.uvs ? Array.from(saved.uvs) : null, colors: saved.colors ? Array.from(saved.colors) : null, colorItemSize: saved.colorItemSize || 0, normals: saved.normals ? Array.from(saved.normals) : null, faceMaterials: Array.from(saved.faceMaterials) };
        rebuildPolyGeometry(saved.part);
      });
      if (state.meshEdit.root === root) updateMeshEditOverlays();
      selection.updateHelpers(); updateStats();
    }

    function moveSelectedMeshFaces(worldDelta) {
      const root = state.meshEdit.root;
      if (!root || worldDelta.lengthSq() < 1e-16) return;
      root.updateMatrixWorld(true);
      const worldOrigin = root.getWorldPosition(new THREE.Vector3());
      const localOrigin = root.worldToLocal(worldOrigin.clone());
      const localMoved = root.worldToLocal(worldOrigin.clone().add(worldDelta));
      const localDelta = localMoved.sub(localOrigin);
      state.meshEdit.selected.forEach((faces, part) => {
        const data = part.userData.kamPolyData;
        const selectedKeys = new Set();
        faces.forEach(face => {
          const offset = polyFaceOffset(face);
          for (let corner = 0; corner < 3; corner++) selectedKeys.add(polyVertexKey(data.positions[offset + corner * 3], data.positions[offset + corner * 3 + 1], data.positions[offset + corner * 3 + 2]));
        });
        const affectedFaces = new Set();
        for (let index = 0; index < data.positions.length; index += 3) {
          if (!selectedKeys.has(polyVertexKey(data.positions[index], data.positions[index + 1], data.positions[index + 2]))) continue;
          data.positions[index] += localDelta.x; data.positions[index + 1] += localDelta.y; data.positions[index + 2] += localDelta.z;
          affectedFaces.add(Math.floor(index / 9));
        }
        updatePolyFaceNormals(data, [...affectedFaces]);
        rebuildPolyGeometry(part);
      });
      updateMeshEditOverlays(); selection.updateHelpers();
    }

    function extrudePolyFaceGroup(part, faces, distance) {
      const data = part.userData.kamPolyData;
      computePolySurfaces(data);
      const originalFaceCount = Math.floor(data.positions.length / 9);
      const normal = new THREE.Vector3();
      faces.forEach(face => normal.add(new THREE.Vector3().fromArray(data.faceNormals[face])));
      if (normal.lengthSq() < 1e-12) return;
      normal.normalize();
      const offset = normal.clone().multiplyScalar(distance);
      const boundary = new Map();
      faces.forEach(face => {
        const positionOffset = polyFaceOffset(face);
        const uvOffset = polyUVOffset(face);
        const colorOffset = face * 3 * (data.colorItemSize || 0);
        const vertices = [0,1,2].map(corner => [data.positions[positionOffset + corner * 3], data.positions[positionOffset + corner * 3 + 1], data.positions[positionOffset + corner * 3 + 2]]);
        const uvs = data.uvs ? [0,1,2].map(corner => [data.uvs[uvOffset + corner * 2], data.uvs[uvOffset + corner * 2 + 1]]) : null;
        const colors = data.colors ? [0,1,2].map(corner => data.colors.slice(colorOffset + corner * data.colorItemSize, colorOffset + (corner + 1) * data.colorItemSize)) : null;
        [[0,1],[1,2],[2,0]].forEach(([a,b]) => {
          const keyA = polyVertexKey(...vertices[a]), keyB = polyVertexKey(...vertices[b]);
          const key = keyA < keyB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`;
          const entry = boundary.get(key);
          if (entry) entry.count++;
          else boundary.set(key, { count: 1, a: vertices[a], b: vertices[b], auv: uvs?.[a], buv: uvs?.[b], acolor: colors?.[a], bcolor: colors?.[b], material: data.faceMaterials[face] || 0 });
        });
      });
      faces.forEach(face => {
        const positionOffset = polyFaceOffset(face);
        for (let corner = 0; corner < 3; corner++) {
          data.positions[positionOffset + corner * 3] += offset.x;
          data.positions[positionOffset + corner * 3 + 1] += offset.y;
          data.positions[positionOffset + corner * 3 + 2] += offset.z;
        }
      });
      boundary.forEach(edge => {
        if (edge.count !== 1) return;
        const a = edge.a, b = edge.b, na = [a[0] + offset.x, a[1] + offset.y, a[2] + offset.z], nb = [b[0] + offset.x, b[1] + offset.y, b[2] + offset.z];
        data.positions.push(...a, ...b, ...nb, ...a, ...nb, ...na);
        data.faceMaterials.push(edge.material, edge.material);
        if (data.uvs) {
          const length = new THREE.Vector3(...b).distanceTo(new THREE.Vector3(...a));
          const height = Math.abs(distance);
          data.uvs.push(0,0, length,0, length,height, 0,0, length,height, 0,height);
        }
        if (data.colors) data.colors.push(...edge.acolor, ...edge.bcolor, ...edge.bcolor, ...edge.acolor, ...edge.bcolor, ...edge.acolor);
      });
      const finalFaceCount = Math.floor(data.positions.length / 9);
      const changedFaces = [...faces];
      for (let face = originalFaceCount; face < finalFaceCount; face++) changedFaces.push(face);
      updatePolyFaceNormals(data, changedFaces);
      rebuildPolyGeometry(part);
    }

    function extrudeSelectedMeshFaces() {
      const root = state.meshEdit.root;
      const distance = Number($('#meshExtrudeDistanceInput').value);
      if (!root || !selectedMeshFaceCount() || !Number.isFinite(distance) || Math.abs(distance) < 1e-6) return;
      const before = capturePolyState(root);
      state.meshEdit.selected.forEach((faces, part) => {
        const data = part.userData.kamPolyData; computePolySurfaces(data);
        const groups = new Map();
        faces.forEach(face => { const id = data.surfaceIds[face]; if (!groups.has(id)) groups.set(id, []); groups.get(id).push(face); });
        groups.forEach(group => extrudePolyFaceGroup(part, group, distance));
      });
      const after = capturePolyState(root);
      history.push({ label: `Extrude ${selectedMeshFaceCount()} faces`, undo: () => applyPolyState(root, before), redo: () => applyPolyState(root, after) });
      updateMeshEditOverlays(); selection.updateHelpers(); updateStats();
      toast('Surface extruded', `${selectedMeshFaceCount()} faces · ${trimNumber(distance)} units`, 'move-up');
    }

    function sceneLightObject(root) { return root?.children.find(child => child.isLight) || null; }

    function makeLightIcon(type, color) {
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .95, depthTest: false, depthWrite: false, toneMapped: false, wireframe: type !== 'point' });
      let geometry;
      if (type === 'spot') geometry = new THREE.ConeGeometry(.18, .38, 12, 1, true);
      else if (type === 'area') geometry = new THREE.PlaneGeometry(1, 1);
      else geometry = new THREE.OctahedronGeometry(.18, 1);
      const icon = new THREE.Mesh(geometry, material);
      icon.name = '__LightEditorIcon';
      icon.userData.kamEditorOnly = true;
      icon.renderOrder = 1200;
      if (type === 'spot') icon.rotation.x = -Math.PI / 2;
      return icon;
    }

    function makePointRangeHelper() {
      const geometry = new THREE.WireframeGeometry(new THREE.SphereGeometry(1, 16, 10));
      const material = new THREE.LineBasicMaterial({ color: 0xffdf65, transparent: true, opacity: .16, depthTest: false, toneMapped: false });
      const range = new THREE.LineSegments(geometry, material);
      range.name = '__PointLightRange';
      range.renderOrder = 1100;
      return range;
    }

    function configureLocalShadow(light, size = 1024) {
      if (!light.shadow) return;
      light.shadow.mapSize.set(size, size);
      light.shadow.bias = -.0002;
      light.shadow.normalBias = .025;
      light.shadow.camera.near = .05;
      light.shadow.camera.far = Math.max(10, light.distance || 100);
      light.shadow.map?.dispose?.();
      light.shadow.map = null;
    }

    function createLightEntity(type = 'point', data = {}) {
      const normalized = ['point', 'spot', 'area'].includes(type) ? type : 'point';
      const root = new THREE.Group();
      root.name = data.name || `${normalized[0].toUpperCase() + normalized.slice(1)} Light ${lightRegistry.size + 1}`;
      root.userData.kamInstance = true;
      root.userData.kamEntityType = 'light';
      root.userData.kamLightType = normalized;
      root.userData.instanceId = data.id || uid();
      root.userData.kamLocked = Boolean(data.locked);
      if (data.groupId) root.userData.kamGroupId = data.groupId;
      if (data.groupName) root.userData.kamGroupName = data.groupName;
      const color = data.color || '#ffffff';
      let light;
      if (normalized === 'spot') {
        light = new THREE.SpotLight(color, data.intensity ?? 70, data.range ?? 18, THREE.MathUtils.degToRad(data.angle ?? 35), data.penumbra ?? .25, data.decay ?? 2);
        const target = new THREE.Object3D();
        target.name = '__LightTarget';
        target.position.set(0, 0, -1);
        root.add(target);
        light.target = target;
      } else if (normalized === 'area') {
        light = new THREE.RectAreaLight(color, data.intensity ?? 12, data.width ?? 4, data.height ?? 4);
      } else {
        light = new THREE.PointLight(color, data.intensity ?? 35, data.range ?? 14, data.decay ?? 2);
      }
      light.name = '__SceneLight';
      light.castShadow = normalized !== 'area' && Boolean(data.castShadow);
      root.add(light);
      const icon = makeLightIcon(normalized, color);
      root.add(icon);
      const shadowSize = Number(data.shadowSize) || 1024;
      root.userData.kamShadowSize = shadowSize;
      configureLocalShadow(light, shadowSize);
      if (normalized === 'area') icon.scale.set(Math.max(.25, light.width), Math.max(.25, light.height), 1);

      let helper;
      let range = null;
      let direction = null;
      if (normalized === 'spot') helper = new THREE.SpotLightHelper(light, color);
      else if (normalized === 'area') {
        helper = new RectAreaLightHelper(light);
        direction = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(), 2.5, color, .35, .2);
        direction.name = '__AreaLightDirection';
        direction.userData.kamEditorOnly = true;
      }
      else { helper = new THREE.PointLightHelper(light, .32, color); range = makePointRangeHelper(); }
      helper.name = '__SceneLightHelper';
      helper.userData.kamEditorOnly = true;
      helper.renderOrder = 1100;
      if (normalized === 'area') light.add(helper);
      lightHelpers.set(root, { helper, range, direction });
      return root;
    }

    function attachLightEntity(root) {
      sceneLightsRoot.add(root);
      lightRegistry.add(root);
      root.visible = root.userData.kamStoredVisible !== false;
      const editor = lightHelpers.get(root);
      if (editor?.helper && !editor.helper.parent) scene.add(editor.helper);
      if (editor?.range) scene.add(editor.range);
      if (editor?.direction) scene.add(editor.direction);
    }

    function detachLightEntity(root) {
      root.userData.kamStoredVisible = root.visible;
      root.removeFromParent();
      lightRegistry.delete(root);
      const editor = lightHelpers.get(root);
      if (editor?.helper?.parent === scene) editor.helper.removeFromParent();
      editor?.range?.removeFromParent();
      editor?.direction?.removeFromParent();
    }

    function attachSceneEntities(objects) {
      objects.forEach(object => {
        if (isLightEntity(object)) attachLightEntity(object);
        else { instancesRoot.add(object); instanceRegistry.add(object); object.visible = true; }
      });
      updateAssetUsageBadges(); updateStats(); updateEmptyState();
    }

    function detachSceneEntities(objects) {
      objects.forEach(object => {
        if (isLightEntity(object)) detachLightEntity(object);
        else { object.removeFromParent(); instanceRegistry.delete(object); }
      });
      updateAssetUsageBadges(); updateStats(); updateEmptyState();
    }

    function lightProperties(root) {
      const light = sceneLightObject(root);
      const type = root.userData.kamLightType;
      return {
        color: `#${light.color.getHexString()}`,
        intensity: light.intensity,
        range: type === 'area' ? null : light.distance,
        decay: type === 'area' ? null : light.decay,
        angle: type === 'spot' ? THREE.MathUtils.radToDeg(light.angle) : null,
        penumbra: type === 'spot' ? light.penumbra : null,
        width: type === 'area' ? light.width : null,
        height: type === 'area' ? light.height : null,
        castShadow: type === 'area' ? false : light.castShadow,
        shadowSize: root.userData.kamShadowSize || 1024
      };
    }

    function applyLightProperties(root, properties, syncPanel = true) {
      if (!isLightEntity(root)) return;
      const light = sceneLightObject(root);
      const type = root.userData.kamLightType;
      if (properties.color) light.color.set(properties.color);
      if (Number.isFinite(properties.intensity)) light.intensity = Math.max(0, properties.intensity);
      if (type !== 'area') {
        if (Number.isFinite(properties.range)) light.distance = Math.max(0, properties.range);
        if (Number.isFinite(properties.decay)) light.decay = clamp(properties.decay, 0, 4);
        if (typeof properties.castShadow === 'boolean') light.castShadow = properties.castShadow;
      }
      if (type === 'spot') {
        if (Number.isFinite(properties.angle)) light.angle = THREE.MathUtils.degToRad(clamp(properties.angle, 1, 89));
        if (Number.isFinite(properties.penumbra)) light.penumbra = clamp(properties.penumbra, 0, 1);
      }
      if (type === 'area') {
        if (Number.isFinite(properties.width)) light.width = Math.max(.05, properties.width);
        if (Number.isFinite(properties.height)) light.height = Math.max(.05, properties.height);
        const icon = root.getObjectByName('__LightEditorIcon');
        if (icon) icon.scale.set(light.width, light.height, 1);
      }
      if (Number.isFinite(properties.shadowSize)) {
        root.userData.kamShadowSize = properties.shadowSize;
        configureLocalShadow(light, properties.shadowSize);
      } else if (light.shadow) light.shadow.camera.far = Math.max(10, light.distance || 100);
      const icon = root.getObjectByName('__LightEditorIcon');
      if (icon?.material?.color) icon.material.color.copy(light.color);
      const editor = lightHelpers.get(root);
      if (editor?.helper && 'color' in editor.helper) editor.helper.color = light.color.getHex();
      if (syncPanel && selection.items().length === 1 && selection.items()[0] === root) updateSelectedLightPanel();
    }

    function addSceneLight(type, { record = true, select = true, data = null } = {}) {
      const root = createLightEntity(type, data || {});
      if (data?.position) root.position.fromArray(data.position);
      else root.position.copy(orbit.target).add(new THREE.Vector3(0, 4, 2));
      if (data?.quaternion) root.quaternion.fromArray(data.quaternion);
      if (data?.scale) root.scale.fromArray(data.scale);
      root.visible = data?.visible !== false;
      root.userData.kamStoredVisible = root.visible;
      attachLightEntity(root);
      if (record) history.push({ label: `Add ${root.name}`, undo: () => { selection.clear(); detachLightEntity(root); updateStats(); }, redo: () => { attachLightEntity(root); selection.set([root]); updateStats(); } });
      if (select && root.visible && !root.userData.kamLocked) selection.set([root]);
      updateStats(); updateEmptyState();
      return root;
    }

    function cloneLightEntity(source) {
      const data = { ...lightProperties(source), name: `${source.name.replace(/ copy \d+$/i, '')} copy`, groupId: source.userData.kamGroupId || null, groupName: source.userData.kamGroupName || null };
      const clone = createLightEntity(source.userData.kamLightType, data);
      clone.position.copy(source.position); clone.quaternion.copy(source.quaternion); clone.scale.copy(source.scale);
      clone.userData.kamStoredVisible = true;
      return clone;
    }

    function updateLightHelpers() {
      lightHelpers.forEach((editor, root) => {
        const active = lightRegistry.has(root) && root.visible;
        const detailVisible = active && selection.has(root);
        if (editor.helper) { editor.helper.visible = detailVisible; if (detailVisible) editor.helper.update?.(); }
        if (editor.range) {
          editor.range.visible = detailVisible;
          if (detailVisible) {
            const light = sceneLightObject(root);
            light.getWorldPosition(editor.range.position);
            const radius = light.distance > 0 ? light.distance : 25;
            editor.range.scale.setScalar(radius);
          }
        }
        if (editor.direction) {
          editor.direction.visible = detailVisible;
          if (detailVisible) {
            const light = sceneLightObject(root);
            const worldPosition = light.getWorldPosition(editor.worldPosition || (editor.worldPosition = new THREE.Vector3()));
            const worldQuaternion = root.getWorldQuaternion(editor.worldQuaternion || (editor.worldQuaternion = new THREE.Quaternion()));
            const directionVector = editor.directionVector || (editor.directionVector = new THREE.Vector3());
            editor.direction.position.copy(worldPosition);
            editor.direction.setDirection(directionVector.set(0, 0, -1).applyQuaternion(worldQuaternion).normalize());
            editor.direction.setColor(light.color);
          }
        }
      });
    }

    function updateSelectedLightPanel() {
      const root = selection?.items?.().length === 1 && isLightEntity(selection.items()[0]) ? selection.items()[0] : null;
      $('#selectedLightSection').hidden = !root;
      if (!root) return;
      const type = root.userData.kamLightType;
      const properties = lightProperties(root);
      $('#selectedLightName').textContent = root.name;
      $('#selectedLightTypeLabel').textContent = `${type[0].toUpperCase() + type.slice(1)} light`;
      $('#sceneLightColorInput').value = properties.color;
      $('#sceneLightIntensityInput').value = trimNumber(properties.intensity);
      $('#sceneLightRangeInput').value = trimNumber(properties.range ?? 0);
      $('#sceneLightDecayInput').value = trimNumber(properties.decay ?? 2);
      $('#sceneLightAngleInput').value = trimNumber(properties.angle ?? 35);
      $('#sceneLightPenumbraInput').value = trimNumber(properties.penumbra ?? .25);
      $('#sceneLightWidthInput').value = trimNumber(properties.width ?? 4);
      $('#sceneLightHeightInput').value = trimNumber(properties.height ?? 4);
      $('#sceneLightShadowInput').checked = properties.castShadow;
      $('#sceneLightShadowQualityInput').value = String(properties.shadowSize);
      $('#sceneLightRangeField').hidden = type === 'area';
      $('#sceneLightDecayField').hidden = type === 'area';
      $('#sceneLightSpotFields').hidden = type !== 'spot';
      $('#sceneLightAreaFields').hidden = type !== 'area';
      $('#sceneLightShadowRow').hidden = type === 'area';
      $('#sceneLightShadowQualityField').hidden = type === 'area' || !properties.castShadow;
    }

    function cloneExistingInstance(source) {
      const clone = cloneMaterials(SkeletonUtils.clone(source));
      clone.name = `${source.name.replace(/ copy \d+$/i, '')} copy`;
      clone.userData = { ...source.userData, instanceId: uid(), kamInstance: true, kamDeletedPartKeys: [...(source.userData.kamDeletedPartKeys || [])] };
      if (source.userData.kamEditableMesh) {
        const parts = [];
        const records = new Map();
        clone.traverse(object => {
          if (!object.userData?.kamPolyMeshPart) return;
          const data = object.userData.kamPolyData;
          object.userData.kamPolyData = clonePolyData(data);
          rebuildPolyGeometry(object);
          parts.push(object);
          records.set(object, { part: object, sourceMeshIndex: object.userData.kamSourceMeshIndex || 0, originalGeometry: object.geometry.clone(), data: clonePolyData(data), enabled: true });
        });
        const sourceStore = editableMeshStore.get(source);
        editableMeshStore.set(clone, sourceStore?.mode === 'inplace' ? { mode: 'inplace', records } : { mode: 'flattened', originalChildren: [], parts });
      }
      return clone;
    }

    function attachInstances(objects) {
      objects.forEach(object => {
        instancesRoot.add(object);
        instanceRegistry.add(object);
        object.visible = true;
      });
      updateAssetUsageBadges();
      updateStats();
      updateEmptyState();
    }

    function detachInstances(objects) {
      objects.forEach(object => {
        object.removeFromParent();
        instanceRegistry.delete(object);
      });
      updateAssetUsageBadges();
      updateStats();
      updateEmptyState();
    }

    function placeAsset(assetId, point, { record = true, select = true } = {}) {
      const asset = assets.get(assetId);
      if (!asset) return null;
      const object = createInstance(asset);
      object.position.copy(point);
      instancesRoot.add(object);
      object.updateMatrixWorld(true);
      if (!asset.prefab || asset.prefab.pivot === 'bottom') {
        const box = new THREE.Box3().setFromObject(object);
        if (!box.isEmpty() && Number.isFinite(box.min.y)) object.position.y += point.y - box.min.y;
      }
      object.updateMatrixWorld(true);
      instanceRegistry.add(object);
      if (record) {
        history.push({
          label: `Add ${object.name}`,
          undo: () => { selection.clear(); detachInstances([object]); },
          redo: () => { attachInstances([object]); selection.set([object]); }
        });
      }
      if (select) selection.set([object]);
      updateAssetUsageBadges();
      updateStats();
      updateEmptyState();
      return object;
    }

    async function registerAssetFromBuffer(name, buffer, providedId = null, prefab = null) {
      const id = providedId || uid();
      const gltf = await parseGLB(buffer.slice(0));
      const asset = { id, name, buffer: buffer.slice(0), scene: gltf.scene, thumbnail: null, prefab };
      gltf.scene.traverse(object => {
        delete object.userData.kamInstance;
        delete object.userData.instanceId;
        delete object.userData.assetId;
        delete object.userData.kamLocked;
        delete object.userData.kamGroupId;
        delete object.userData.kamGroupName;
        if (object.isMesh) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      });
      assets.set(id, asset);
      assetUsage.set(id, 0);
      asset.thumbnail = renderThumbnail(asset.scene);
      addAssetCard(asset);
      updateAssetCount();
      updateEmptyState();
      return asset;
    }

    function parseGLB(buffer) {
      return new Promise((resolve, reject) => gltfLoader.parse(buffer, '', resolve, reject));
    }

    async function importFiles(files) {
      const glbFiles = [...files].filter(file => file.name.toLowerCase().endsWith('.glb'));
      if (!glbFiles.length) { toast('Nothing imported', 'Choose files with the .glb extension.', 'circle-alert'); return; }
      setBusy(true, 'Importing GLB models', `0 of ${glbFiles.length}`);
      let imported = 0;
      let failed = 0;
      for (const file of glbFiles) {
        try {
          const buffer = await file.arrayBuffer();
          await registerAssetFromBuffer(file.webkitRelativePath || file.name, buffer);
          imported++;
        } catch (error) {
          console.error(`Could not import ${file.name}`, error);
          failed++;
        }
        $('#busyDetail').textContent = `${imported + failed} of ${glbFiles.length}`;
        await nextFrame();
      }
      setBusy(false);
      toast('Import complete', `${imported} model${imported === 1 ? '' : 's'} added${failed ? ` · ${failed} failed` : ''}.`, failed ? 'triangle-alert' : 'check');
      if (imported) { filterAssetCards(); $('#assetList').scrollTop = $('#assetList').scrollHeight; }
    }

    const thumbRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    thumbRenderer.setPixelRatio(1);
    thumbRenderer.setSize(180, 110, false);
    thumbRenderer.outputColorSpace = THREE.SRGBColorSpace;
    thumbRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    const thumbScene = new THREE.Scene();
    thumbScene.background = new THREE.Color(0x202224);
    const thumbCamera = new THREE.PerspectiveCamera(34, 180 / 110, .01, 10000);
    thumbScene.add(new THREE.HemisphereLight(0xffffff, 0x3c4147, 2.1));
    const thumbKey = new THREE.DirectionalLight(0xffffff, 3.2);
    thumbKey.position.set(4, 6, 5);
    thumbScene.add(thumbKey);

    function renderThumbnail(source) {
      const holder = new THREE.Group();
      const model = SkeletonUtils.clone(source);
      holder.add(model);
      thumbScene.add(holder);
      const box = new THREE.Box3().setFromObject(holder);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      holder.position.sub(center);
      const maxSize = Math.max(size.x, size.y, size.z, .001);
      const distance = maxSize / (2 * Math.tan(THREE.MathUtils.degToRad(thumbCamera.fov / 2))) * 1.35;
      thumbCamera.position.set(distance * .8, distance * .58, distance);
      thumbCamera.near = Math.max(.001, distance / 100);
      thumbCamera.far = distance * 100;
      thumbCamera.lookAt(0, 0, 0);
      thumbCamera.updateProjectionMatrix();
      thumbRenderer.render(thumbScene, thumbCamera);
      const image = thumbRenderer.domElement.toDataURL('image/webp', .86);
      thumbScene.remove(holder);
      return image;
    }

    function addAssetCard(asset) {
      const card = document.createElement('article');
      card.className = 'asset-card';
      card.draggable = true;
      card.dataset.assetId = asset.id;
      card.title = `${asset.name}\nDrag onto the grid · double-click to place at view center`;
      card.innerHTML = `<img alt="" draggable="false" src="${asset.thumbnail}">${asset.prefab ? '<span class="asset-prefab">PREFAB</span>' : ''}<span class="asset-uses">0</span><span class="asset-name"></span>`;
      $('.asset-name', card).textContent = stripExtension(asset.name.split('/').pop());
      card.addEventListener('click', () => selectAsset(asset.id));
      card.addEventListener('dblclick', () => {
        const point = orbit.target.clone();
        point.y = 0;
        point.x = snapValue(point.x, state.moveSnap);
        point.z = snapValue(point.z, state.moveSnap);
        placeAsset(asset.id, point);
        focusSelection();
      });
      card.addEventListener('dragstart', event => beginAssetDrag(event, asset.id));
      card.addEventListener('dragend', endAssetDrag);
      $('#assetList').appendChild(card);
      filterAssetCards();
    }

    function filterAssetCards() {
      const query = $('#assetSearchInput').value.trim().toLocaleLowerCase();
      let visible = 0;
      $$('.asset-card').forEach(card => {
        const asset = assets.get(card.dataset.assetId);
        const name = asset?.name || $('.asset-name', card)?.textContent || '';
        const matches = !query || name.toLocaleLowerCase().includes(query);
        card.hidden = !matches;
        if (matches) visible++;
      });
      $('#clearAssetSearchBtn').hidden = !query;
      $('#assetSearchEmpty').hidden = !query || visible > 0;
      $('#assetCount').textContent = query ? `${visible} of ${assets.size}` : `${assets.size} model${assets.size === 1 ? '' : 's'}`;
    }

    function initAssetShelf() {
      const shelf = $('#assetShelf');
      const handle = $('#shelfResizeHandle');
      const compactHeight = 100;
      const maxHeight = () => Math.max(compactHeight, window.innerHeight * .55);
      let lastOpenHeight = compactHeight;
      try { lastOpenHeight = clamp(Number(localStorage.getItem('kam3d-shelf-height')) || compactHeight, compactHeight, maxHeight()); } catch {}
      const setHeight = (height, persist = true) => {
        const next = clamp(height, 34, maxHeight());
        shelf.style.height = `${next}px`;
        const collapsed = next <= 50;
        shelf.classList.toggle('collapsed', collapsed);
        if (!collapsed) lastOpenHeight = next;
        if (persist) try {
          localStorage.setItem('kam3d-shelf-height', String(Math.round(lastOpenHeight)));
          localStorage.setItem('kam3d-shelf-collapsed', collapsed ? '1' : '0');
        } catch {}
      };
      let initiallyCollapsed = false;
      try { initiallyCollapsed = localStorage.getItem('kam3d-shelf-collapsed') === '1'; } catch {}
      setHeight(initiallyCollapsed ? 34 : lastOpenHeight, false);
      handle.addEventListener('pointerdown', event => {
        if (event.detail > 1) return;
        event.preventDefault();
        const startY = event.clientY;
        const startHeight = shelf.getBoundingClientRect().height;
        shelf.classList.add('resizing');
        handle.setPointerCapture(event.pointerId);
        const move = moveEvent => setHeight(startHeight + startY - moveEvent.clientY, false);
        const up = () => {
          shelf.classList.remove('resizing');
          handle.removeEventListener('pointermove', move);
          handle.removeEventListener('pointerup', up);
          setHeight(shelf.getBoundingClientRect().height, true);
        };
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', up);
      });
      handle.addEventListener('dblclick', event => {
        event.preventDefault();
        const height = shelf.getBoundingClientRect().height;
        setHeight(shelf.classList.contains('collapsed') || height < 160 ? window.innerHeight * .42 : compactHeight);
      });
      $('#shelfCollapseBtn').addEventListener('click', () => setHeight(shelf.classList.contains('collapsed') ? lastOpenHeight : 34));
      $('#assetSearchInput').addEventListener('input', filterAssetCards);
      $('#assetSearchInput').addEventListener('focus', () => { if (shelf.classList.contains('collapsed')) setHeight(compactHeight); });
      $('#clearAssetSearchBtn').addEventListener('click', event => { event.preventDefault(); $('#assetSearchInput').value = ''; filterAssetCards(); $('#assetSearchInput').focus(); });
      window.addEventListener('resize', () => setHeight(shelf.classList.contains('collapsed') ? 34 : Math.min(lastOpenHeight, maxHeight()), false));
    }

    function selectAsset(id) {
      state.selectedAssetId = id;
      $$('.asset-card').forEach(card => card.classList.toggle('selected', card.dataset.assetId === id));
      refreshOpenArrayPreviews();
    }

    function beginAssetDrag(event, assetId) {
      state.dragAssetId = assetId;
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('application/x-kam3d-asset', assetId);
      event.dataTransfer.setData('text/plain', assetId);
      const asset = assets.get(assetId);
      if (!asset) return;
      state.ghost = createInstance(asset, '__PlacementPreview', { trackUsage: false });
      state.ghost.userData.kamGhost = true;
      state.ghost.traverse(object => {
        if (!object.isMesh) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(material => {
          if (!material) return;
          material.userData.__ghost = { transparent: material.transparent, opacity: material.opacity, depthWrite: material.depthWrite };
          material.transparent = true;
          material.opacity = .38;
          material.depthWrite = false;
        });
      });
      scene.add(state.ghost);
    }

    function endAssetDrag() {
      cleanupGhost();
      state.dragAssetId = null;
      $('#dropOverlay').classList.remove('visible');
      resetDropCopy();
    }

    function cleanupGhost() {
      if (!state.ghost) return;
      state.ghost.removeFromParent();
      state.ghost.traverse(object => {
        if (!object.isMesh) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(material => material?.dispose?.());
      });
      state.ghost = null;
      clearAlignmentGuides();
    }

    function updateGhost(clientX, clientY) {
      if (!state.ghost) return;
      const point = getGroundPoint(clientX, clientY);
      if (!point) return;
      if (state.snapEnabled) {
        point.x = snapValue(point.x, state.moveSnap);
        point.z = snapValue(point.z, state.moveSnap);
      }
      state.ghost.position.copy(point);
      state.ghost.updateMatrixWorld(true);
      const dragAsset = assets.get(state.dragAssetId);
      if (!dragAsset?.prefab || dragAsset.prefab.pivot === 'bottom') {
        const box = new THREE.Box3().setFromObject(state.ghost);
        if (!box.isEmpty()) state.ghost.position.y += point.y - box.min.y;
      }
      state.ghost.updateMatrixWorld(true);
      applySmartObjectSnap(state.ghost, [state.ghost], ['x', 'z']);
      state.ghostPoint.set(state.ghost.position.x, point.y, state.ghost.position.z);
    }

    function snapValue(value, step) { return state.snapEnabled && step > 0 ? Math.round(value / step) * step : value; }

    function getGroundPoint(clientX, clientY) {
      pointer.x = (clientX / window.innerWidth) * 2 - 1;
      pointer.y = -(clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(pointer, activeCamera);
      const point = new THREE.Vector3();
      return raycaster.ray.intersectPlane(placementPlane, point) ? point : null;
    }

    function findInstance(object) {
      let current = object;
      while (current && current !== scene) {
        if (current.userData?.kamInstance) return current;
        current = current.parent;
      }
      return null;
    }

    function pickObject(clientX, clientY) {
      pointer.x = (clientX / window.innerWidth) * 2 - 1;
      pointer.y = -(clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(pointer, activeCamera);
      const intersections = raycaster.intersectObjects(sceneEntities(), true);
      for (const hit of intersections) {
        const instance = findInstance(hit.object);
        if (instance && isSceneEntity(instance) && instance.visible && !instance.userData.kamLocked) return instance;
      }
      return null;
    }

    function pickModelPart(clientX, clientY) {
      pointer.x = (clientX / window.innerWidth) * 2 - 1;
      pointer.y = -(clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(pointer, activeCamera);
      const intersections = raycaster.intersectObjects([...instanceRegistry, ...partSelection.items()], true);
      for (const hit of intersections) {
        const root = findInstance(hit.object) || (partSelection.has(hit.object) ? partSelection.root : null);
        if (!root || !root.visible || root.userData.kamLocked || !hit.object.isMesh || hit.object.userData.kamEditorOnly) continue;
        return { root, part: hit.object };
      }
      return null;
    }

    function setSelectionScope(scope) {
      if (!['object','part','face'].includes(scope)) return;
      const facePart = scope === 'face' && partSelection.items().length === 1 ? partSelection.items()[0] : null;
      const faceRoot = facePart ? partSelection.root : (modelSelection().length === 1 ? modelSelection()[0] : null);
      if (scope !== 'face' && state.meshEdit.active) {
        exitMeshEditMode({ preserveScope: true });
        panelManager.panels.get('mesh-edit')?.classList.remove('open');
        $('#meshEditBtn').classList.remove('active');
      }
      if (scope !== 'part' && !(scope === 'face' && facePart) && partSelection.items().length) partSelection.clear({ keepObjectSelection: true });
      state.selectionScope = scope;
      state.selectionEnabled = true;
      syncToggle('selectBtn', true);
      $$('#selectionScopeSegment button').forEach(button => button.classList.toggle('active', button.dataset.selectionScope === scope));
      const status = $('#selectionScopeStatus');
      const descriptions = {
        object: ['box', 'Clicks select complete scene objects.'],
        part: ['component', 'Clicks select individual meshes inside a GLB. Shift-click selects multiple parts of one model.'],
        face: ['box-select', 'Face selection uses Editable Mesh surfaces and triangles.']
      };
      status.innerHTML = `<i data-lucide="${descriptions[scope][0]}"></i><span></span>`;
      $('span', status).textContent = descriptions[scope][1];
      if (scope === 'face') {
        panelManager.open('mesh-edit');
        if (facePart?.userData.kamPolyMeshPart) enterMeshEditMode(faceRoot, facePart);
        else if (editableParts(faceRoot).length) enterMeshEditMode(faceRoot);
      }
      updateSelectionBadge();
      updateTransformControls();
      updateTextureTargetUI();
      refreshObjectManager();
      window.lucide?.createIcons?.({ attrs: { 'stroke-width': 1.8 } });
    }

    function syncSelectionScopeStatus(scope = state.selectionScope) {
      const status = $('#selectionScopeStatus');
      if (!status) return;
      const descriptions = {
        object: ['box', 'Clicks select complete scene objects.'],
        part: ['component', 'Clicks select individual meshes inside a GLB. Shift-click selects multiple parts of one model.'],
        face: ['box-select', 'Face selection uses Editable Mesh surfaces and triangles.']
      };
      status.innerHTML = `<i data-lucide="${descriptions[scope][0]}"></i><span></span>`;
      $('span', status).textContent = descriptions[scope][1];
      window.lucide?.createIcons?.({ attrs: { 'stroke-width': 1.8 } });
    }

    function getPaintSource() {
      if (state.paint.source === 'library') {
        const asset = assets.get(state.selectedAssetId);
        return asset ? { kind: 'asset', asset } : null;
      }
      const object = modelSelection()[0];
      return object ? { kind: 'selected', object } : null;
    }

    function paintSourceId(source) {
      if (!source) return null;
      const assetId = source.kind === 'asset' ? source.asset.id : source.object.userData.assetId;
      return assetId ? `asset:${assetId}` : source.kind === 'selected' ? `object:${source.object.userData.instanceId}` : null;
    }

    function updatePaintSourceUI() {
      const source = getPaintSource();
      const status = $('#paintSourceStatus');
      status.classList.toggle('ready', Boolean(source));
      const text = $('span', status);
      if (!source) text.textContent = state.paint.source === 'library' ? 'Choose a model from the bottom library.' : 'Select one object on the scene.';
      else if (source.kind === 'asset') text.textContent = `Library: ${stripExtension(source.asset.name.split('/').pop())}`;
      else text.textContent = `Scene: ${source.object.name}`;
      const needsEraseSource = state.paint.mode === 'erase' && state.paint.eraseTarget === 'current';
      $('#paintSourceSection').classList.toggle('hidden', state.paint.mode === 'erase' && !needsEraseSource);
      $('#paintVariationSection').classList.toggle('hidden', state.paint.mode === 'erase');
      $('#paintEraseTargetSection').classList.toggle('hidden', state.paint.mode !== 'erase');
      const hints = {
        current: 'Only painted instances matching the current source can be erased.',
        painted: 'Any object created with Paint & Scatter can be erased.',
        all: 'Every scene object inside the brush can be erased.'
      };
      $('#paintEraseTargetHint').textContent = hints[state.paint.eraseTarget];
    }

    function paintRadius() { return clamp(Number($('#paintRadiusInput').value) || 2.5, .1, 100); }

    function getPaintHit(clientX, clientY) {
      if (state.paint.surface === 'ground') {
        const point = getGroundPoint(clientX, clientY);
        return point ? { point, normal: new THREE.Vector3(0, 1, 0) } : null;
      }
      pointer.x = (clientX / window.innerWidth) * 2 - 1;
      pointer.y = -(clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(pointer, activeCamera);
      const hit = raycaster.intersectObjects([...instanceRegistry], true)[0];
      if (!hit) return null;
      const normal = hit.face?.normal?.clone() || new THREE.Vector3(0, 1, 0);
      normal.applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();
      return { point: hit.point.clone(), normal };
    }

    function surfaceHitNear(point, normal) {
      if (state.paint.surface === 'ground') return { point: new THREE.Vector3(point.x, 0, point.z), normal: new THREE.Vector3(0, 1, 0) };
      const probe = new THREE.Raycaster(point.clone().addScaledVector(normal, 50), normal.clone().negate(), 0, 100);
      const targets = state.paint.stroke?.surfaceTargets || [...instanceRegistry];
      const hit = probe.intersectObjects(targets, true)[0];
      if (!hit) return null;
      const hitNormal = hit.face?.normal?.clone() || normal.clone();
      hitNormal.applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();
      return { point: hit.point.clone(), normal: hitNormal };
    }

    function updatePaintGuide(event) {
      if (!state.paint.active) { paintGuide.visible = false; return null; }
      const hit = getPaintHit(event.clientX, event.clientY);
      paintGuide.visible = Boolean(hit);
      if (!hit) return null;
      if (!paintGuide.geometry.getAttribute('position')) {
        const points = [];
        for (let i = 0; i < 64; i++) {
          const angle = i / 64 * Math.PI * 2;
          points.push(new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)));
        }
        paintGuide.geometry.setFromPoints(points);
      }
      paintGuide.position.copy(hit.point).addScaledVector(hit.normal, .025);
      paintGuide.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), hit.normal);
      paintGuide.scale.setScalar(paintRadius());
      paintGuide.material.color.set(state.paint.mode === 'erase' ? 0xff7272 : 0xffffff);
      if (state.paint.mode === 'erase') updatePaintErasePreview(hit);
      else clearPaintErasePreview();
      return hit;
    }

    function clearPaintErasePreview() {
      state.paint.eraseHelpers.forEach(helper => {
        scene.remove(helper);
        helper.geometry?.dispose?.();
        helper.material?.dispose?.();
      });
      state.paint.eraseHelpers.clear();
    }

    function isPaintEraseEligible(object, source = getPaintSource()) {
      if (state.paint.eraseTarget === 'all') return true;
      if (!object.userData.kamPainted) return false;
      if (state.paint.eraseTarget === 'painted') return true;
      const sourceId = paintSourceId(source);
      return Boolean(sourceId && object.userData.paintSourceId === sourceId);
    }

    function paintEraseCandidates(hit, source = getPaintSource()) {
      const radius = paintRadius();
      return [...instanceRegistry].filter(object => {
        if (!isPaintEraseEligible(object, source)) return false;
        const box = new THREE.Box3().setFromObject(object);
        if (box.isEmpty()) return false;
        return box.getCenter(new THREE.Vector3()).distanceTo(hit.point) <= radius;
      });
    }

    function updatePaintErasePreview(hit) {
      clearPaintErasePreview();
      paintEraseCandidates(hit, state.paint.stroke?.source).forEach(object => {
        const helper = new THREE.BoxHelper(object, 0xff7272);
        helper.material.transparent = true;
        helper.material.opacity = .82;
        helper.material.depthTest = false;
        helper.renderOrder = 1290;
        scene.add(helper);
        state.paint.eraseHelpers.set(object, helper);
      });
    }

    function createPaintedObject(source, hit) {
      const object = source.kind === 'asset' ? createInstance(source.asset) : cloneExistingInstance(source.object);
      object.userData.kamPainted = true;
      object.userData.paintSourceId = paintSourceId(source);
      object.userData.paintStrokeId = state.paint.stroke?.id || uid();
      delete object.userData.kamGroupId;
      delete object.userData.kamGroupName;
      delete object.userData.kamLocked;
      object.visible = true;
      const minScale = Math.max(.01, Number($('#paintScaleMinInput').value) || .8);
      const maxScale = Math.max(minScale, Number($('#paintScaleMaxInput').value) || 1.2);
      const randomScale = THREE.MathUtils.lerp(minScale, maxScale, Math.random());
      const baseScale = source.kind === 'selected' ? source.object.scale.clone() : new THREE.Vector3(1, 1, 1);
      object.scale.copy(baseScale).multiplyScalar(randomScale);
      const align = $('#paintAlignNormalInput').checked;
      const normal = align ? hit.normal : new THREE.Vector3(0, 1, 0);
      const alignment = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
      const yaw = $('#paintRandomRotationInput').checked ? Math.random() * Math.PI * 2 : 0;
      object.quaternion.copy(alignment).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
      object.position.copy(hit.point);
      instancesRoot.add(object);
      object.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(object);
      if (!box.isEmpty()) {
        const corners = boxCorners(box);
        const minProjection = Math.min(...corners.map(corner => corner.dot(normal)));
        object.position.addScaledVector(normal, hit.point.dot(normal) - minProjection);
      }
      object.updateMatrixWorld(true);
      instanceRegistry.add(object);
      return object;
    }

    function paintStamp(hit) {
      const stroke = state.paint.stroke;
      if (!stroke) return;
      const radius = paintRadius();
      if (state.paint.mode === 'erase') {
        paintEraseCandidates(hit, stroke.source).forEach(object => {
          if (stroke.removed.has(object)) return;
          stroke.removed.add(object);
          selection.has(object) && selection.set(selection.items().filter(item => item !== object));
          object.removeFromParent();
          instanceRegistry.delete(object);
        });
        clearPaintErasePreview();
        return;
      }
      const source = stroke.source;
      const density = clamp(Math.round(Number($('#paintDensityInput').value) || 1), 1, 20);
      const tangentA = new THREE.Vector3().crossVectors(Math.abs(hit.normal.y) < .95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0), hit.normal).normalize();
      const tangentB = new THREE.Vector3().crossVectors(hit.normal, tangentA).normalize();
      for (let i = 0; i < density; i++) {
        const distance = radius * Math.sqrt(Math.random());
        const angle = Math.random() * Math.PI * 2;
        const candidate = hit.point.clone().addScaledVector(tangentA, Math.cos(angle) * distance).addScaledVector(tangentB, Math.sin(angle) * distance);
        const surface = surfaceHitNear(candidate, hit.normal);
        if (!surface) continue;
        const slope = THREE.MathUtils.radToDeg(surface.normal.angleTo(new THREE.Vector3(0, 1, 0)));
        if (slope > clamp(Number($('#paintMaxSlopeInput').value) || 55, 0, 180)) continue;
        stroke.added.push(createPaintedObject(source, surface));
      }
    }

    function beginPaintStroke(event) {
      const hit = updatePaintGuide(event);
      if (!hit) return false;
      const sourceRequired = state.paint.mode === 'paint' || state.paint.eraseTarget === 'current';
      const source = sourceRequired ? getPaintSource() : null;
      if (sourceRequired && !source) { toast('Choose a brush source', 'Select a library model or one object on the scene.', 'circle-alert'); return true; }
      state.paint.stroke = { id: uid(), added: [], removed: new Set(), source, surfaceTargets: [...instanceRegistry], pointerId: event.pointerId };
      canvas.setPointerCapture?.(event.pointerId);
      state.paint.lastPoint = hit.point.clone();
      orbit.enabled = false;
      paintStamp(hit);
      return true;
    }

    function movePaintStroke(event) {
      const hit = updatePaintGuide(event);
      if (!state.paint.stroke || !hit) return;
      const spacing = Math.max(.05, Number($('#paintSpacingInput').value) || 1.5);
      if (hit.point.distanceTo(state.paint.lastPoint) < spacing) return;
      state.paint.lastPoint.copy(hit.point);
      paintStamp(hit);
    }

    function endPaintStroke() {
      const stroke = state.paint.stroke;
      if (!stroke) return;
      if (canvas.hasPointerCapture?.(stroke.pointerId)) canvas.releasePointerCapture(stroke.pointerId);
      state.paint.stroke = null;
      state.paint.lastPoint = null;
      orbit.enabled = true;
      const added = stroke.added;
      const removed = [...stroke.removed];
      updateAssetUsageBadges(); updateStats(); updateEmptyState();
      if (added.length) history.push({
        label: `Paint ${added.length} object${added.length === 1 ? '' : 's'}`,
        undo: () => { selection.clear(); detachInstances(added); },
        redo: () => { attachInstances(added); }
      });
      if (removed.length) history.push({
        label: `Erase ${removed.length} object${removed.length === 1 ? '' : 's'}`,
        undo: () => { attachInstances(removed); },
        redo: () => { selection.clear(); detachInstances(removed); }
      });
      if (added.length || removed.length) toast(state.paint.mode === 'erase' ? 'Objects erased' : 'Scatter stroke created', `${added.length || removed.length} object${(added.length || removed.length) === 1 ? '' : 's'} affected.`, state.paint.mode === 'erase' ? 'eraser' : 'paintbrush');
    }

    function startPaintTool() { state.paint.active = true; updatePaintSourceUI(); updateTransformControls(); }
    function stopPaintTool() { endPaintStroke(); state.paint.active = false; paintGuide.visible = false; clearPaintErasePreview(); orbit.enabled = true; updateTransformControls(); }

    let pointerDown = null;
    canvas.addEventListener('pointerdown', event => {
      if (state.paint.active && event.button === 0) {
        if (beginPaintStroke(event)) { event.stopImmediatePropagation(); pointerDown = null; return; }
      }
      if (state.areaArray.active && event.button === 0) {
        if (beginAreaInteraction(event)) {
          event.stopImmediatePropagation();
          pointerDown = null;
          return;
        }
      }
      pointerDown = { x: event.clientX, y: event.clientY, button: event.button };
    }, { capture: true });
    canvas.addEventListener('pointermove', event => { movePaintStroke(event); moveAreaInteraction(event); });
    canvas.addEventListener('pointerup', event => {
      if (state.paint.stroke) { endPaintStroke(); pointerDown = null; return; }
      if (state.areaArray.active && (state.areaArray.drawing || state.areaArray.dragHandle)) {
        endAreaInteraction();
        pointerDown = null;
        return;
      }
      if (!pointerDown || pointerDown.button !== 0 || state.gizmoDragging || !state.selectionEnabled) { pointerDown = null; return; }
      const distance = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
      pointerDown = null;
      if (distance > 4) return;
      if (state.meshEdit.active) { pickEditableFace(event.clientX, event.clientY, event.shiftKey || state.multiSelect); return; }
      if (state.selectionScope === 'part') {
        const hit = pickModelPart(event.clientX, event.clientY);
        if (!hit) { if (!event.shiftKey && !state.multiSelect) partSelection.clear(); return; }
        if (event.shiftKey || state.multiSelect) partSelection.toggle(hit.part, hit.root);
        else partSelection.set([hit.part], hit.root);
        return;
      }
      const object = pickObject(event.clientX, event.clientY);
      if (!object) { if (!event.shiftKey && !state.multiSelect) selection.clear(); return; }
      if (event.shiftKey || state.multiSelect) selection.toggle(object);
      else selection.set([object]);
    });
    canvas.addEventListener('pointercancel', () => endPaintStroke());
    canvas.addEventListener('pointerleave', () => { if (!state.paint.stroke) { paintGuide.visible = false; clearPaintErasePreview(); } });

    function insertChildAt(parent, child, index = parent.children.length) {
      parent.add(child);
      const current = parent.children.indexOf(child);
      if (current >= 0) parent.children.splice(current, 1);
      parent.children.splice(clamp(index, 0, parent.children.length), 0, child);
      child.parent = parent;
      parent.updateMatrixWorld(true);
    }

    function cloneMaterialIndependent(material) {
      if (!material?.clone) return material;
      const clone = material.clone();
      ['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap','alphaMap','bumpMap','displacementMap'].forEach(key => {
        if (!material[key]?.clone) return;
        clone[key] = material[key].clone();
        clone[key].needsUpdate = true;
      });
      clone.userData = { ...(material.userData || {}), kamTextureManaged: { ...(material.userData?.kamTextureManaged || {}) } };
      return clone;
    }

    function cloneModelPart(source, { key = `duplicate:${uid()}` } = {}) {
      if (!source?.isMesh || source.isSkinnedMesh || source.morphTargetInfluences?.length) return null;
      const clone = source.clone(false);
      clone.geometry = source.geometry?.clone?.() || source.geometry;
      clone.material = Array.isArray(source.material) ? source.material.map(cloneMaterialIndependent) : cloneMaterialIndependent(source.material);
      clone.name = `${partLabel(source).replace(/ copy \d*$/i, '')} copy`;
      clone.userData = {
        ...(source.userData || {}),
        kamPartKey: key,
        kamDuplicatedPart: true,
        kamDuplicateSourceKey: source.userData.kamDuplicateSourceKey || source.userData.kamPartKey || null
      };
      if (source.userData.kamPolyData) {
        const data = source.userData.kamPolyData;
        clone.userData.kamPolyData = {
          positions: [...data.positions],
          uvs: data.uvs ? [...data.uvs] : null,
          colors: data.colors ? [...data.colors] : null,
          colorItemSize: data.colorItemSize || 0,
          normals: data.normals ? [...data.normals] : null,
          faceMaterials: [...data.faceMaterials]
        };
        clone.userData.kamPolyMeshPart = true;
        rebuildPolyGeometry(clone);
      }
      clone.castShadow = source.castShadow;
      clone.receiveShadow = source.receiveShadow;
      return clone;
    }

    function refreshRootEditableFlag(root) {
      root.userData.kamEditableMesh = editableParts(root).some(part => part.parent || partSelection.has(part));
      updateMeshEditUI();
      refreshObjectManager();
    }

    function duplicateSelectedParts() {
      const sources = partSelection.items();
      const root = partSelection.root;
      if (!sources.length || !root) return;
      if (sources.some(part => part.isSkinnedMesh || part.morphTargetInfluences?.length)) {
        toast('Part duplication unavailable', 'Skinned meshes and morph targets cannot be duplicated independently.', 'triangle-alert'); return;
      }
      partSelection.dissolvePivot();
      scene.updateMatrixWorld(true);
      const offset = state.snapEnabled ? state.moveSnap : .5;
      const records = [];
      sources.forEach(source => {
        const parent = source.parent;
        if (!parent) return;
        const clone = cloneModelPart(source);
        if (!clone) return;
        const index = parent.children.indexOf(source) + 1;
        insertChildAt(parent, clone, index);
        clone.updateWorldMatrix(true, false);
        const position = clone.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(offset, 0, offset));
        const quaternion = clone.getWorldQuaternion(new THREE.Quaternion());
        const scale = clone.getWorldScale(new THREE.Vector3());
        setTargetWorldTransform(clone, position, quaternion, scale);
        records.push({ part: clone, parent, index });
      });
      if (!records.length) return;
      const attach = () => {
        records.forEach(record => insertChildAt(record.parent, record.part, record.index));
        setSelectionScope('part');
        partSelection.set(records.map(record => record.part), root);
        refreshRootEditableFlag(root);
      };
      const detach = () => {
        partSelection.clear({ keepObjectSelection: true });
        records.forEach(record => record.part.removeFromParent());
        refreshRootEditableFlag(root);
      };
      setSelectionScope('part');
      partSelection.set(records.map(record => record.part), root);
      refreshRootEditableFlag(root);
      history.push({ label: `Duplicate ${records.length} part${records.length === 1 ? '' : 's'}`, undo: detach, redo: attach });
      toast('Part duplicated', `${records.length} independent model part${records.length === 1 ? '' : 's'} created.`, 'copy-plus');
    }

    function deleteSelectedParts() {
      const parts = partSelection.items();
      const root = partSelection.root;
      if (!parts.length || !root) return;
      const total = allRootMeshes(root).length;
      if (parts.length >= total && !confirm('This removes every mesh part from the model and leaves an empty object. Continue?')) return;
      partSelection.dissolvePivot();
      const records = parts.map(part => ({ part, parent: part.parent, index: part.parent?.children.indexOf(part) ?? -1 })).filter(record => record.parent);
      const deletedKeys = new Set(root.userData.kamDeletedPartKeys || []);
      const setDeletedState = removed => {
        records.forEach(record => {
          const key = record.part.userData.kamPartKey;
          if (!record.part.userData.kamDuplicatedPart && key) removed ? deletedKeys.add(key) : deletedKeys.delete(key);
        });
        root.userData.kamDeletedPartKeys = [...deletedKeys];
      };
      const detach = () => {
        partSelection.clear({ keepObjectSelection: true });
        records.forEach(record => record.part.removeFromParent());
        setDeletedState(true);
        refreshRootEditableFlag(root);
        updateStats();
      };
      const attach = () => {
        records.slice().sort((a, b) => a.index - b.index).forEach(record => insertChildAt(record.parent, record.part, record.index));
        setDeletedState(false);
        setSelectionScope('part');
        partSelection.set(records.map(record => record.part), root);
        refreshRootEditableFlag(root);
        updateStats();
      };
      detach();
      history.push({ label: `Delete ${records.length} part${records.length === 1 ? '' : 's'}`, undo: attach, redo: detach });
      toast('Part deleted', `${records.length} model part${records.length === 1 ? '' : 's'} removed.`, 'trash-2');
    }

    function duplicateSelection() {
      if (state.meshEdit.active) return;
      if (partSelection.items().length) { duplicateSelectedParts(); return; }
      const sources = selection.items();
      if (!sources.length) return;
      selection.clear();
      const offset = state.snapEnabled ? state.moveSnap : .5;
      const clones = sources.map(source => {
        const clone = isLightEntity(source) ? cloneLightEntity(source) : cloneExistingInstance(source);
        clone.position.x += offset;
        clone.position.z += offset;
        return clone;
      });
      attachSceneEntities(clones);
      selection.set(clones);
      history.push({
        label: `Duplicate ${clones.length > 1 ? `${clones.length} objects` : clones[0].name}`,
        undo: () => { selection.clear(); detachSceneEntities(clones); },
        redo: () => { attachSceneEntities(clones); selection.set(clones); }
      });
    }

    function deleteSelection() {
      if (partSelection.items().length) { deleteSelectedParts(); return; }
      if (state.meshEdit.active) { clearMeshFaceSelection(); return; }
      const objects = selection.items();
      if (!objects.length) return;
      selection.clear();
      detachSceneEntities(objects);
      history.push({
        label: `Delete ${objects.length > 1 ? `${objects.length} objects` : objects[0].name}`,
        undo: () => { attachSceneEntities(objects); selection.set(objects); },
        redo: () => { selection.clear(); detachSceneEntities(objects); }
      });
    }

    function getArraySource(mode) {
      if (mode === 'library') {
        const asset = assets.get(state.selectedAssetId);
        return asset ? { kind: 'asset', asset } : null;
      }
      const objects = modelSelection();
      if (!objects.length) return null;
      scene.updateMatrixWorld(true);
      const box = getObjectsBox(objects);
      const center = box.getCenter(new THREE.Vector3());
      const states = captureStates(objects);
      return { kind: 'selected', objects, states, center, minY: box.min.y };
    }

    function sourceStatus(mode, elementId) {
      const source = getArraySource(mode);
      const element = $(`#${elementId}`);
      if (!element) return source;
      element.classList.toggle('ready', Boolean(source));
      const text = $('span', element);
      if (!source) text.textContent = mode === 'library' ? 'Choose a model from the bottom library.' : 'Select one or more objects on the scene.';
      else if (source.kind === 'asset') text.textContent = `Library: ${stripExtension(source.asset.name.split('/').pop())}`;
      else text.textContent = `Selected: ${source.objects.length} object${source.objects.length === 1 ? '' : 's'} as one tile`;
      return source;
    }

    function selectedDescriptor(source, index, position, quaternion = null) {
      const base = source.states[index];
      return {
        kind: 'selected', source: source.objects[index],
        position: position.toArray(),
        quaternion: (quaternion || new THREE.Quaternion().fromArray(base.quaternion)).toArray(),
        scale: [...base.scale]
      };
    }

    function assetDescriptor(asset, position, quaternion = new THREE.Quaternion()) {
      return { kind: 'asset', assetId: asset.id, position: position.toArray(), quaternion: quaternion.toArray(), scale: [1, 1, 1] };
    }

    function readObjectSequence(prefix) {
      const value = suffix => Number($(`#${prefix}${suffix}Input`)?.value) || 0;
      return {
        position: new THREE.Vector3(value('PositionX'), value('PositionY'), value('PositionZ')),
        rotation: new THREE.Euler(
          THREE.MathUtils.degToRad(value('RotationX')),
          THREE.MathUtils.degToRad(value('RotationY')),
          THREE.MathUtils.degToRad(value('RotationZ')),
          'XYZ'
        ),
        scale: new THREE.Vector3(value('ScaleX'), value('ScaleY'), value('ScaleZ'))
      };
    }

    function applyObjectSequence(descriptor, index, sequence) {
      if (!index) return descriptor;
      const position = new THREE.Vector3().fromArray(descriptor.position).addScaledVector(sequence.position, index);
      const quaternion = new THREE.Quaternion().fromArray(descriptor.quaternion);
      const rotation = new THREE.Euler(sequence.rotation.x * index, sequence.rotation.y * index, sequence.rotation.z * index, 'XYZ');
      quaternion.multiply(new THREE.Quaternion().setFromEuler(rotation));
      descriptor.position = position.toArray();
      descriptor.quaternion = quaternion.toArray();
      descriptor.scale = descriptor.scale.map((value, axis) => Math.max(.001, value + sequence.scale.getComponent(axis) * index));
      return descriptor;
    }

    function instantiateArrayDescriptor(descriptor, preview = false) {
      let object;
      if (descriptor.kind === 'asset') {
        const asset = assets.get(descriptor.assetId);
        if (!asset) return null;
        object = createInstance(asset, preview ? '__ArrayPreview' : null, { trackUsage: !preview });
      } else {
        object = cloneExistingInstance(descriptor.source);
        if (preview) object.name = '__ArrayPreview';
      }
      object.position.fromArray(descriptor.position);
      object.quaternion.fromArray(descriptor.quaternion);
      object.scale.fromArray(descriptor.scale);
      object.updateMatrixWorld(true);
      if (descriptor.kind === 'asset' && !assets.get(descriptor.assetId)?.prefab) {
        const targetY = object.position.y;
        const box = new THREE.Box3().setFromObject(object);
        if (!box.isEmpty() && Number.isFinite(box.min.y)) object.position.y += targetY - box.min.y;
      }
      if (preview) styleArrayPreview(object);
      return object;
    }

    function styleArrayPreview(root) {
      root.userData.kamArrayPreview = true;
      root.traverse(object => {
        if (!object.isMesh) return;
        object.castShadow = false;
        object.receiveShadow = false;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(material => {
          if (!material) return;
          material.transparent = true;
          material.opacity = .34;
          material.depthWrite = false;
          material.needsUpdate = true;
        });
      });
    }

    function clearPreviewGroup(group) {
      while (group.children.length) {
        const object = group.children[0];
        group.remove(object);
        object.traverse(child => {
          if (!child.isMesh) return;
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach(material => material?.dispose?.());
        });
      }
    }

    function renderArrayPreview(group, placements, countElement) {
      clearPreviewGroup(group);
      const capped = placements.slice(0, 800);
      capped.forEach(descriptor => {
        const object = instantiateArrayDescriptor(descriptor, true);
        if (object) group.add(object);
      });
      if (countElement) countElement.textContent = `${placements.length} ${placements.length === 1 ? 'copy' : 'copies'}${placements.length > 800 ? ' · preview capped at 800' : ''}`;
    }

    function directedArrayOffset(index, count, spacing, direction) {
      if (direction === 'negative') return -index * spacing;
      if (direction === 'centered') return (index - (count - 1) / 2) * spacing;
      return index * spacing;
    }

    function buildTilingPlacements() {
      const source = sourceStatus(state.tiling.source, 'tilingSourceStatus');
      if (!source) return [];
      const placements = [];
      const countY = clamp(Math.round(Number($('#tileYInput').value) || 1), 1, 50);
      const gapY = Math.max(.01, Number($('#tileGapYInput').value) || 2);
      const startOffset = new THREE.Vector3(Number($('#tileOffsetXInput').value) || 0, Number($('#tileOffsetYInput').value) || 0, Number($('#tileOffsetZInput').value) || 0);
      const layerOffsetX = Number($('#tileLayerOffsetXInput').value) || 0;
      const layerOffsetZ = Number($('#tileLayerOffsetZInput').value) || 0;
      const alternate = $('#tileAlternateLayerInput').checked;
      const sequence = readObjectSequence('tileSeq');
      const layerVector = layer => new THREE.Vector3(alternate ? (layer % 2) * layerOffsetX : layer * layerOffsetX, directedArrayOffset(layer, countY, gapY, state.tiling.directionY), alternate ? (layer % 2) * layerOffsetZ : layer * layerOffsetZ).add(startOffset);
      if (state.tiling.type === 'radial') {
        const count = clamp(Math.round(Number($('#radialCountInput').value) || 1), 1, 200);
        const radius = Math.max(.01, Number($('#radialRadiusInput').value) || 5);
        const spacing = THREE.MathUtils.degToRad(Number($('#radialSpacingInput').value) || 45);
        const angleOffset = THREE.MathUtils.degToRad(Number($('#radialOffsetInput').value) || 0);
        const faceCenter = $('#radialFaceCenterInput').checked;
        const center = source.kind === 'selected' ? source.center.clone() : new THREE.Vector3(snapValue(orbit.target.x, state.moveSnap), 0, snapValue(orbit.target.z, state.moveSnap));
        for (let layer = 0; layer < countY; layer++) {
          const levelOffset = layerVector(layer);
          for (let i = 0; i < count; i++) {
            const sequenceIndex = layer * count + i;
            const angle = angleOffset + spacing * i;
            const ringCenter = center.clone().add(levelOffset).add(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
            const faceYaw = Math.atan2(center.x + levelOffset.x - ringCenter.x, center.z + levelOffset.z - ringCenter.z);
            const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), faceYaw);
            if (source.kind === 'asset') placements.push(applyObjectSequence(assetDescriptor(source.asset, ringCenter, faceCenter ? yawQ : new THREE.Quaternion()), sequenceIndex, sequence));
            else source.states.forEach((base, index) => {
              const relative = new THREE.Vector3().fromArray(base.position).sub(source.center);
              let quaternion = new THREE.Quaternion().fromArray(base.quaternion);
              if (faceCenter) { relative.applyQuaternion(yawQ); quaternion = yawQ.clone().multiply(quaternion); }
              placements.push(applyObjectSequence(selectedDescriptor(source, index, ringCenter.clone().add(relative), quaternion), sequenceIndex, sequence));
            });
          }
        }
      } else {
        const countX = clamp(Math.round(Number($('#tileXInput').value) || 1), 1, 50);
        const countZ = clamp(Math.round(Number($('#tileZInput').value) || 1), 1, 50);
        const gapX = Math.max(.01, Number($('#tileGapXInput').value) || 2);
        const gapZ = Math.max(.01, Number($('#tileGapZInput').value) || 2);
        const anchor = source.kind === 'asset' ? new THREE.Vector3(snapValue(orbit.target.x, state.moveSnap), 0, snapValue(orbit.target.z, state.moveSnap)) : null;
        for (let layer = 0; layer < countY; layer++) for (let z = 0; z < countZ; z++) for (let x = 0; x < countX; x++) {
          const sequenceIndex = (layer * countZ + z) * countX + x;
          const offset = layerVector(layer).add(new THREE.Vector3(directedArrayOffset(x, countX, gapX, state.tiling.directionX), 0, directedArrayOffset(z, countZ, gapZ, state.tiling.directionZ)));
          if (source.kind === 'selected' && offset.lengthSq() < 1e-8) continue;
          if (source.kind === 'asset') placements.push(applyObjectSequence(assetDescriptor(source.asset, anchor.clone().add(offset)), sequenceIndex, sequence));
          else source.states.forEach((base, index) => placements.push(applyObjectSequence(selectedDescriptor(source, index, new THREE.Vector3().fromArray(base.position).add(offset)), sequenceIndex, sequence)));
        }
      }
      return placements;
    }

    function refreshTilingPreview() {
      if (!$('[data-panel="tiling"]')?.classList.contains('open')) return;
      state.tiling.placements = buildTilingPlacements();
      renderArrayPreview(tilingPreviewGroup, state.tiling.placements, $('#tilingPreviewCount'));
      $('#applyTilingBtn').disabled = !state.tiling.placements.length;
    }

    function commitArray(placements, label, panelName) {
      if (!placements.length) { toast('Nothing to create', 'Choose a valid source and array size first.', 'circle-alert'); return; }
      if (placements.length > 1200 && !confirm(`This will create ${placements.length} models. Continue?`)) return;
      panelManager.close(panelName);
      selection.clear();
      const clones = placements.map(descriptor => instantiateArrayDescriptor(descriptor, false)).filter(Boolean);
      attachInstances(clones);
      selection.set(clones);
      history.push({
        label,
        undo: () => { selection.clear(); detachInstances(clones); },
        redo: () => { attachInstances(clones); selection.set(clones); }
      });
      toast('Array created', `${clones.length} new model${clones.length === 1 ? '' : 's'} placed.`, 'layout-grid');
    }

    function applyTiling() {
      const label = state.tiling.type === 'radial' ? 'Create radial array' : 'Create grid array';
      commitArray(state.tiling.placements, label, 'tiling');
    }

    function rotatedAreaPoint(localX, localZ) {
      const angle = THREE.MathUtils.degToRad(state.areaArray.rotation);
      const cos = Math.cos(angle), sin = Math.sin(angle);
      return new THREE.Vector3(
        state.areaArray.center.x + localX * cos + localZ * sin,
        0,
        state.areaArray.center.z - localX * sin + localZ * cos
      );
    }

    function areaGridMetrics() {
      const margin = clamp(Number($('#areaMarginInput').value) || 0, 0, Math.min(state.areaArray.width, state.areaArray.depth) * .49);
      const usableWidth = Math.max(.05, state.areaArray.width - margin * 2);
      const usableDepth = Math.max(.05, state.areaArray.depth - margin * 2);
      let columns, rows, gapX, gapZ;
      if (state.areaArray.fill === 'count') {
        columns = clamp(Math.round(Number($('#areaColumnsInput').value) || 1), 1, 100);
        rows = clamp(Math.round(Number($('#areaRowsInput').value) || 1), 1, 100);
        gapX = columns > 1 ? usableWidth / (columns - 1) : 0;
        gapZ = rows > 1 ? usableDepth / (rows - 1) : 0;
      } else {
        gapX = Math.max(.05, Number($('#areaSpacingXInput').value) || 2);
        gapZ = Math.max(.05, Number($('#areaSpacingZInput').value) || 2);
        columns = Math.max(1, Math.floor(usableWidth / gapX) + 1);
        rows = Math.max(1, Math.floor(usableDepth / gapZ) + 1);
      }
      return { margin, usableWidth, usableDepth, columns, rows, gapX, gapZ };
    }

    function buildAreaPlacements() {
      const source = sourceStatus(state.areaArray.source, 'areaSourceStatus');
      if (!source) return [];
      const metrics = areaGridMetrics();
      const placements = [];
      const areaYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), THREE.MathUtils.degToRad(state.areaArray.rotation));
      const spanX = metrics.gapX * Math.max(0, metrics.columns - 1);
      const spanZ = metrics.gapZ * Math.max(0, metrics.rows - 1);
      const countY = clamp(Math.round(Number($('#areaCountYInput').value) || 1), 1, 50);
      const gapY = Math.max(.01, Number($('#areaSpacingYInput').value) || 2);
      const startOffset = new THREE.Vector3(Number($('#areaOffsetXInput').value) || 0, Number($('#areaOffsetYInput').value) || 0, Number($('#areaOffsetZInput').value) || 0);
      const layerOffsetX = Number($('#areaLayerOffsetXInput').value) || 0;
      const layerOffsetZ = Number($('#areaLayerOffsetZInput').value) || 0;
      const alternate = $('#areaAlternateLayerInput').checked;
      const sequence = readObjectSequence('areaSeq');
      for (let layer = 0; layer < countY; layer++) {
        const layerFactor = alternate ? layer % 2 : layer;
        const horizontalLayerOffset = new THREE.Vector3(layerOffsetX * layerFactor, 0, layerOffsetZ * layerFactor).applyQuaternion(areaYaw);
        const verticalOffset = directedArrayOffset(layer, countY, gapY, state.areaArray.directionY);
        for (let row = 0; row < metrics.rows; row++) for (let column = 0; column < metrics.columns; column++) {
          const sequenceIndex = (layer * metrics.rows + row) * metrics.columns + column;
          const localX = metrics.columns === 1 ? 0 : -spanX / 2 + column * metrics.gapX;
          const localZ = metrics.rows === 1 ? 0 : -spanZ / 2 + row * metrics.gapZ;
          const cell = rotatedAreaPoint(localX, localZ).add(startOffset).add(horizontalLayerOffset);
          cell.y += verticalOffset;
          if (source.kind === 'asset') {
            placements.push(applyObjectSequence(assetDescriptor(source.asset, cell, areaYaw), sequenceIndex, sequence));
          } else {
            source.states.forEach((base, index) => {
              const basePosition = new THREE.Vector3().fromArray(base.position);
              const relative = basePosition.sub(new THREE.Vector3(source.center.x, source.minY, source.center.z)).applyQuaternion(areaYaw);
              const quaternion = areaYaw.clone().multiply(new THREE.Quaternion().fromArray(base.quaternion));
              placements.push(applyObjectSequence(selectedDescriptor(source, index, cell.clone().add(relative), quaternion), sequenceIndex, sequence));
            });
          }
        }
      }
      return placements;
    }

    function disposeAreaGuide() {
      state.areaArray.handles = [];
      while (areaGuideRoot.children.length) {
        const object = areaGuideRoot.children[0];
        areaGuideRoot.remove(object);
        object.geometry?.dispose?.();
        object.material?.dispose?.();
      }
    }

    function updateAreaGuide() {
      if (!state.areaArray.active) return;
      disposeAreaGuide();
      const metrics = areaGridMetrics();
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(state.areaArray.width, state.areaArray.depth),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .055, depthWrite: false, side: THREE.DoubleSide })
      );
      plane.rotation.x = -Math.PI / 2;
      plane.position.y = .012;
      areaGuideRoot.add(plane);

      const vertices = [];
      for (let column = 0; column <= metrics.columns; column++) {
        const x = -state.areaArray.width / 2 + state.areaArray.width * (column / metrics.columns);
        vertices.push(x, .018, -state.areaArray.depth / 2, x, .018, state.areaArray.depth / 2);
      }
      for (let row = 0; row <= metrics.rows; row++) {
        const z = -state.areaArray.depth / 2 + state.areaArray.depth * (row / metrics.rows);
        vertices.push(-state.areaArray.width / 2, .018, z, state.areaArray.width / 2, .018, z);
      }
      const lineGeometry = new THREE.BufferGeometry();
      lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      const lines = new THREE.LineSegments(lineGeometry, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .68, depthTest: false }));
      lines.renderOrder = 1100;
      areaGuideRoot.add(lines);

      const handleGeometry = new THREE.BoxGeometry(.24, .12, .24);
      const corners = [[-1,-1],[1,-1],[1,1],[-1,1]];
      corners.forEach(([sx, sz]) => {
        const handle = new THREE.Mesh(handleGeometry.clone(), new THREE.MeshBasicMaterial({ color: 0xf4f4f4, depthTest: false }));
        handle.position.set(sx * state.areaArray.width / 2, .08, sz * state.areaArray.depth / 2);
        handle.userData.areaHandle = { type: 'corner', sx, sz };
        handle.renderOrder = 1200;
        areaGuideRoot.add(handle);
        state.areaArray.handles.push(handle);
      });
      handleGeometry.dispose();
      const centerHandle = new THREE.Mesh(new THREE.BoxGeometry(.32,.1,.32), new THREE.MeshBasicMaterial({ color: 0x858b90, depthTest: false }));
      centerHandle.position.y = .07;
      centerHandle.userData.areaHandle = { type: 'center' };
      centerHandle.renderOrder = 1200;
      areaGuideRoot.add(centerHandle);
      state.areaArray.handles.push(centerHandle);
      areaGuideRoot.position.copy(state.areaArray.center);
      areaGuideRoot.rotation.y = THREE.MathUtils.degToRad(state.areaArray.rotation);
    }

    function pointToAreaLocal(point) {
      const angle = THREE.MathUtils.degToRad(state.areaArray.rotation);
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const dx = point.x - state.areaArray.center.x;
      const dz = point.z - state.areaArray.center.z;
      return { x: dx * cos - dz * sin, z: dx * sin + dz * cos };
    }

    function boxCorners(box) {
      const corners = [];
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
      return corners;
    }

    function objectMatchesArea(object, mode) {
      const box = new THREE.Box3().setFromObject(object);
      if (box.isEmpty()) return false;
      const halfWidth = state.areaArray.width / 2;
      const halfDepth = state.areaArray.depth / 2;
      const inside = point => {
        const local = pointToAreaLocal(point);
        return Math.abs(local.x) <= halfWidth && Math.abs(local.z) <= halfDepth;
      };
      if (mode === 'center') return inside(box.getCenter(new THREE.Vector3()));
      const locals = boxCorners(box).map(pointToAreaLocal);
      if (mode === 'fully') return locals.every(local => Math.abs(local.x) <= halfWidth && Math.abs(local.z) <= halfDepth);
      const minX = Math.min(...locals.map(local => local.x));
      const maxX = Math.max(...locals.map(local => local.x));
      const minZ = Math.min(...locals.map(local => local.z));
      const maxZ = Math.max(...locals.map(local => local.z));
      return maxX >= -halfWidth && minX <= halfWidth && maxZ >= -halfDepth && minZ <= halfDepth;
    }

    function clearAreaCandidateHelpers() {
      state.areaArray.candidateHelpers.forEach(helper => {
        scene.remove(helper);
        helper.geometry?.dispose?.();
        helper.material?.dispose?.();
      });
      state.areaArray.candidateHelpers.clear();
    }

    function getAreaReplacementSource() {
      if (state.areaArray.replacementSource === 'library') {
        const asset = assets.get(state.selectedAssetId);
        return asset ? { kind: 'asset', asset } : null;
      }
      const object = modelSelection()[0];
      return object ? { kind: 'selected', object } : null;
    }

    function updateAreaReplacementUI() {
      const mode = state.areaArray.selectionMode;
      const replacing = mode === 'replace';
      $('#areaReplacementSourceSection').classList.toggle('hidden', !replacing);
      const source = getAreaReplacementSource();
      const status = $('#areaReplacementSourceStatus');
      status.classList.toggle('ready', Boolean(source));
      const text = $('span', status);
      if (!source) text.textContent = state.areaArray.replacementSource === 'library' ? 'Choose a model from the bottom library.' : 'Select one object on the scene.';
      else if (source.kind === 'asset') text.textContent = `Library: ${stripExtension(source.asset.name.split('/').pop())}`;
      else text.textContent = `Scene: ${source.object.name}`;
      const count = state.areaArray.candidates.length;
      const action = $('#selectAreaObjectsBtn');
      const verb = replacing ? 'Replace' : mode === 'remove' ? 'Remove' : 'Select';
      $('span', action).textContent = `${verb} ${count} object${count === 1 ? '' : 's'}`;
      action.disabled = !count || (replacing && !source);
    }

    function updateAreaSelectionCandidates() {
      if (!state.areaArray.active || state.areaArray.tool !== 'select') return;
      clearAreaCandidateHelpers();
      state.areaArray.candidates = [...instanceRegistry].filter(object => {
        if (!objectMatchesArea(object, state.areaArray.inclusion)) return false;
        return state.areaArray.selectionMode !== 'select' || (object.visible && !object.userData.kamLocked);
      });
      state.areaArray.candidates.forEach(object => {
        const helper = new THREE.BoxHelper(object, 0x9fe0b4);
        helper.material.transparent = true;
        helper.material.opacity = .82;
        helper.material.depthTest = false;
        helper.renderOrder = 1150;
        scene.add(helper);
        state.areaArray.candidateHelpers.set(object, helper);
      });
      $('#areaSelectionCount').textContent = `${state.areaArray.candidates.length} object${state.areaArray.candidates.length === 1 ? '' : 's'}`;
      updateAreaReplacementUI();
    }

    function applyAreaObjectOperation() {
      const originals = [...state.areaArray.candidates];
      if (!originals.length) return;
      if (state.areaArray.selectionMode === 'select') {
        selection.set(originals);
        clearAreaCandidateHelpers();
        toast('Area objects selected', `${originals.length} object${originals.length === 1 ? '' : 's'} selected.`, 'scan-search');
        return;
      }
      const source = state.areaArray.selectionMode === 'replace' ? getAreaReplacementSource() : null;
      if (state.areaArray.selectionMode === 'replace' && !source) { updateAreaReplacementUI(); return; }
      clearAreaCandidateHelpers();
      selection.clear();
      if (state.areaArray.selectionMode === 'remove') {
        detachInstances(originals);
        history.push({
          label: `Remove ${originals.length} area object${originals.length === 1 ? '' : 's'}`,
          undo: () => { attachInstances(originals); selection.set(originals); refreshOpenArrayPreviews(); },
          redo: () => { selection.clear(); detachInstances(originals); refreshOpenArrayPreviews(); }
        });
        toast('Area objects removed', `${originals.length} object${originals.length === 1 ? '' : 's'} removed from the scene.`, 'trash-2');
        refreshAreaPreview();
        return;
      }
      scene.updateMatrixWorld(true);
      const targetStates = captureStates(originals);
      const replacements = originals.map((original, index) => {
        const object = source.kind === 'asset' ? createInstance(source.asset) : cloneExistingInstance(source.object);
        const target = targetStates[index];
        object.position.fromArray(target.position);
        object.quaternion.fromArray(target.quaternion);
        object.scale.fromArray(target.scale);
        object.updateMatrixWorld(true);
        return object;
      });
      detachInstances(originals);
      attachInstances(replacements);
      selection.set(replacements);
      history.push({
        label: `Replace ${originals.length} area object${originals.length === 1 ? '' : 's'}`,
        undo: () => { selection.clear(); detachInstances(replacements); attachInstances(originals); selection.set(originals); refreshOpenArrayPreviews(); },
        redo: () => { selection.clear(); detachInstances(originals); attachInstances(replacements); selection.set(replacements); refreshOpenArrayPreviews(); }
      });
      toast('Area objects replaced', `${replacements.length} object${replacements.length === 1 ? '' : 's'} replaced.`, 'replace');
      refreshAreaPreview();
    }

    function refreshAreaPreview() {
      if (!state.areaArray.active) return;
      if (state.areaArray.tool === 'array') {
        state.areaArray.width = Math.max(.1, Number($('#areaWidthInput').value) || state.areaArray.width);
        state.areaArray.depth = Math.max(.1, Number($('#areaDepthInput').value) || state.areaArray.depth);
        state.areaArray.rotation = Number($('#areaRotationInput').value) || 0;
        state.areaArray.placements = buildAreaPlacements();
      }
      const bounds = state.areaArray.bounds[state.areaArray.tool];
      if (bounds) {
        bounds.center.copy(state.areaArray.center);
        bounds.width = state.areaArray.width;
        bounds.depth = state.areaArray.depth;
        bounds.rotation = state.areaArray.rotation;
      }
      updateAreaGuide();
      if (state.areaArray.tool === 'select') {
        clearPreviewGroup(areaPreviewGroup);
        updateAreaSelectionCandidates();
      } else {
        clearAreaCandidateHelpers();
        renderArrayPreview(areaPreviewGroup, state.areaArray.placements, $('#areaPreviewCount'));
        $('#applyAreaArrayBtn').disabled = !state.areaArray.placements.length;
      }
    }

    function startAreaTool(tool) {
      state.areaArray.active = true;
      state.areaArray.tool = tool;
      state.areaArray.mode = 'editing';
      document.body.classList.remove('area-array-mode');
      orbit.enabled = true;
      const bounds = state.areaArray.bounds[tool];
      state.areaArray.center.copy(bounds.center);
      if (bounds.center.lengthSq() === 0) state.areaArray.center.set(snapValue(orbit.target.x, state.moveSnap), 0, snapValue(orbit.target.z, state.moveSnap));
      state.areaArray.width = bounds.width;
      state.areaArray.depth = bounds.depth;
      state.areaArray.rotation = bounds.rotation;
      if (tool === 'array') {
        state.areaArray.width = Math.max(.1, Number($('#areaWidthInput').value) || 10);
        state.areaArray.depth = Math.max(.1, Number($('#areaDepthInput').value) || 10);
        state.areaArray.rotation = Number($('#areaRotationInput').value) || 0;
      }
      refreshAreaPreview();
      updateTransformControls();
    }

    function stopAreaTool(tool) {
      if (state.areaArray.tool !== tool) return;
      state.areaArray.active = false;
      state.areaArray.tool = null;
      state.areaArray.mode = 'editing';
      state.areaArray.drawing = false;
      state.areaArray.dragHandle = null;
      document.body.classList.remove('area-array-mode');
      clearPreviewGroup(areaPreviewGroup);
      disposeAreaGuide();
      clearAreaCandidateHelpers();
      state.areaArray.candidates = [];
      orbit.enabled = true;
      updateTransformControls();
    }

    function startAreaRedraw() {
      state.areaArray.redrawBackup = {
        center: state.areaArray.center.clone(), width: state.areaArray.width, depth: state.areaArray.depth, rotation: state.areaArray.rotation
      };
      state.areaArray.mode = 'armed';
      state.areaArray.drawing = false;
      document.body.classList.add('area-array-mode');
      orbit.enabled = false;
      toast('Draw area', 'Drag across the ground to define the array bounds.', 'pen-tool');
    }

    function cancelAreaRedraw() {
      const backup = state.areaArray.redrawBackup;
      if (backup) {
        state.areaArray.center.copy(backup.center);
        state.areaArray.width = backup.width;
        state.areaArray.depth = backup.depth;
        state.areaArray.rotation = backup.rotation;
        if (state.areaArray.tool === 'array') {
          $('#areaWidthInput').value = trimNumber(backup.width);
          $('#areaDepthInput').value = trimNumber(backup.depth);
          $('#areaRotationInput').value = trimNumber(backup.rotation);
        }
      }
      state.areaArray.mode = 'editing';
      state.areaArray.drawing = false;
      state.areaArray.dragHandle = null;
      state.areaArray.redrawBackup = null;
      document.body.classList.remove('area-array-mode');
      orbit.enabled = true;
      refreshAreaPreview();
    }

    function pickAreaHandle(clientX, clientY) {
      pointer.x = (clientX / window.innerWidth) * 2 - 1;
      pointer.y = -(clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(pointer, activeCamera);
      return raycaster.intersectObjects(state.areaArray.handles, false)[0]?.object || null;
    }

    function beginAreaInteraction(event) {
      const point = getGroundPoint(event.clientX, event.clientY);
      if (!point) return false;
      const handle = pickAreaHandle(event.clientX, event.clientY);
      if (handle) {
        orbit.enabled = false;
        state.areaArray.mode = 'editing';
        const data = handle.userData.areaHandle;
        if (data.type === 'center') state.areaArray.dragHandle = { type: 'center', offset: state.areaArray.center.clone().sub(point) };
        else {
          const opposite = rotatedAreaPoint(-data.sx * state.areaArray.width / 2, -data.sz * state.areaArray.depth / 2);
          state.areaArray.dragHandle = { ...data, opposite };
        }
      } else if (state.areaArray.mode === 'armed') {
        orbit.enabled = false;
        state.areaArray.mode = 'drawing';
        state.areaArray.drawing = true;
        state.areaArray.drawStart = point.clone();
        state.areaArray.center.copy(point);
        state.areaArray.width = .1;
        state.areaArray.depth = .1;
        state.areaArray.rotation = 0;
        if (state.areaArray.tool === 'array') $('#areaRotationInput').value = 0;
      } else return false;
      return true;
    }

    function moveAreaInteraction(event) {
      if (!state.areaArray.active || (!state.areaArray.drawing && !state.areaArray.dragHandle)) return;
      const point = getGroundPoint(event.clientX, event.clientY);
      if (!point) return;
      if (state.areaArray.drawing === true) {
        const start = state.areaArray.drawStart;
        state.areaArray.center.set((start.x + point.x) / 2, 0, (start.z + point.z) / 2);
        state.areaArray.width = Math.max(.1, Math.abs(point.x - start.x));
        state.areaArray.depth = Math.max(.1, Math.abs(point.z - start.z));
      } else if (state.areaArray.dragHandle?.type === 'center') {
        state.areaArray.center.copy(point).add(state.areaArray.dragHandle.offset);
        state.areaArray.center.y = 0;
      } else if (state.areaArray.dragHandle?.type === 'corner') {
        const drag = state.areaArray.dragHandle;
        const angle = THREE.MathUtils.degToRad(state.areaArray.rotation);
        const axisX = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));
        const axisZ = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
        const delta = point.clone().sub(drag.opposite);
        const signedWidth = delta.dot(axisX);
        const signedDepth = delta.dot(axisZ);
        state.areaArray.width = Math.max(.1, Math.abs(signedWidth));
        state.areaArray.depth = Math.max(.1, Math.abs(signedDepth));
        state.areaArray.center.copy(drag.opposite)
          .add(axisX.multiplyScalar(signedWidth / 2))
          .add(axisZ.multiplyScalar(signedDepth / 2));
      }
      if (state.areaArray.tool === 'array') {
        $('#areaWidthInput').value = trimNumber(state.areaArray.width);
        $('#areaDepthInput').value = trimNumber(state.areaArray.depth);
      }
      refreshAreaPreview();
    }

    function endAreaInteraction() {
      if (!state.areaArray.active) return;
      state.areaArray.drawing = false;
      state.areaArray.dragHandle = null;
      state.areaArray.mode = 'editing';
      state.areaArray.redrawBackup = null;
      document.body.classList.remove('area-array-mode');
      orbit.enabled = true;
      refreshAreaPreview();
    }

    function applyAreaArray() {
      commitArray(state.areaArray.placements, 'Create area array', 'area-array');
    }

    function refreshOpenArrayPreviews() {
      if (!state.uiReady) return;
      if ($('[data-panel="tiling"]')?.classList.contains('open')) refreshTilingPreview();
      if (state.areaArray.active) refreshAreaPreview();
      if (state.paint.active) updatePaintSourceUI();
    }

    function materialTargetMeshes() {
      if (partSelection?.items().length) return partSelection.items().filter(object => object.isMesh);
      const meshes = [];
      modelSelection().forEach(root => root.traverse(object => {
        if (object.isMesh && !object.userData.kamEditorOnly) meshes.push(object);
      }));
      return meshes;
    }

    function materialTargetLabel() {
      const parts = partSelection?.items() || [];
      if (parts.length) return parts.length === 1 ? partLabel(parts[0]) : `${parts.length} model parts`;
      const objects = modelSelection();
      return objects.length === 1 ? objects[0].name : `${objects.length} objects`;
    }

    function applySelectedColor() {
      const objects = modelSelection();
      const targetMeshes = materialTargetMeshes();
      if (!targetMeshes.length) { toast('Nothing selected', 'Select a model or model part first.', 'palette'); return; }
      const changes = [];
      const target = new THREE.Color(state.currentColor);
      const targetHsl = {};
      target.getHSL(targetHsl);
      targetMeshes.forEach(object => {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(material => {
          if (!material?.color) return;
          const before = `#${material.color.getHexString()}`;
          let after = state.currentColor;
          if (state.paletteMode === 'tint') {
            const currentHsl = {};
            material.color.getHSL(currentHsl);
            const tinted = new THREE.Color().setHSL(targetHsl.h, targetHsl.s < .02 ? 0 : Math.max(targetHsl.s * .86, currentHsl.s * .18), currentHsl.l);
            after = `#${tinted.getHexString()}`;
          }
          changes.push({ material, before, after });
          material.color.set(after);
          material.needsUpdate = true;
        });
      });
      if (!changes.length) { toast('No color channel', 'The selected model has no color-editable material.', 'circle-alert'); return; }
      const apply = key => { changes.forEach(change => { change.material.color.set(change[key]); change.material.needsUpdate = true; }); refreshOpenArrayPreviews(); };
      addRecentColor(state.currentColor);
      const label = `${state.paletteMode === 'tint' ? 'Tint' : 'Recolor'} ${materialTargetLabel()}`;
      history.push({ label, undo: () => apply('before'), redo: () => apply('after') });
      toast(state.paletteMode === 'tint' ? 'Tint applied' : 'Color applied', `${changes.length} material${changes.length === 1 ? '' : 's'} updated.`, 'paint-bucket');
    }

    function resetSelectedColors() {
      const objects = modelSelection();
      if (!objects.length) return;
      const changes = [];
      objects.forEach(root => {
        const originals = root.userData.kamOriginalColors || [];
        let index = 0;
        root.traverse(object => {
          if (!object.isMesh) return;
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach(material => {
            const original = originals[index++];
            if (partSelection?.items().length && !partSelection.has(object)) return;
            if (!material?.color || !original) return;
            changes.push({ material, before: `#${material.color.getHexString()}`, after: original });
            material.color.set(original);
            material.needsUpdate = true;
          });
        });
      });
      if (!changes.length) { toast('Original colors unavailable', 'No resettable material colors were found.', 'circle-alert'); return; }
      const apply = key => { changes.forEach(change => { change.material.color.set(change[key]); change.material.needsUpdate = true; }); refreshOpenArrayPreviews(); };
      history.push({ label: `Reset colors on ${objects.length} object${objects.length === 1 ? '' : 's'}`, undo: () => apply('before'), redo: () => apply('after') });
      toast('Original colors restored', `${changes.length} material${changes.length === 1 ? '' : 's'} reset.`, 'rotate-ccw');
    }

    const COLOR_FAMILIES = [
      ['Neutral', ['#f5f5f5','#e5e5e5','#d4d4d4','#a3a3a3','#737373','#525252','#262626','#171717']],
      ['Red', ['#fee2e2','#fecaca','#fca5a5','#f87171','#ef4444','#dc2626','#991b1b','#450a0a']],
      ['Orange', ['#ffedd5','#fed7aa','#fdba74','#fb923c','#f97316','#ea580c','#9a3412','#431407']],
      ['Amber', ['#fef3c7','#fde68a','#fcd34d','#fbbf24','#f59e0b','#d97706','#92400e','#451a03']],
      ['Yellow', ['#fef9c3','#fef08a','#fde047','#facc15','#eab308','#ca8a04','#854d0e','#422006']],
      ['Lime', ['#ecfccb','#d9f99d','#bef264','#a3e635','#84cc16','#65a30d','#3f6212','#1a2e05']],
      ['Green', ['#dcfce7','#bbf7d0','#86efac','#4ade80','#22c55e','#16a34a','#166534','#052e16']],
      ['Teal', ['#ccfbf1','#99f6e4','#5eead4','#2dd4bf','#14b8a6','#0d9488','#115e59','#042f2e']],
      ['Cyan', ['#cffafe','#a5f3fc','#67e8f9','#22d3ee','#06b6d4','#0891b2','#155e75','#083344']],
      ['Sky', ['#e0f2fe','#bae6fd','#7dd3fc','#38bdf8','#0ea5e9','#0284c7','#075985','#082f49']],
      ['Blue', ['#dbeafe','#bfdbfe','#93c5fd','#60a5fa','#3b82f6','#2563eb','#1e40af','#172554']],
      ['Indigo', ['#e0e7ff','#c7d2fe','#a5b4fc','#818cf8','#6366f1','#4f46e5','#3730a3','#1e1b4b']],
      ['Violet', ['#ede9fe','#ddd6fe','#c4b5fd','#a78bfa','#8b5cf6','#7c3aed','#5b21b6','#2e1065']],
      ['Magenta', ['#fae8ff','#f5d0fe','#f0abfc','#e879f9','#d946ef','#c026d3','#86198f','#4a044e']],
      ['Rose', ['#ffe4e6','#fecdd3','#fda4af','#fb7185','#f43f5e','#e11d48','#9f1239','#4c0519']]
    ];

    function createColorSwatch(color, tooltip) {
      const button = document.createElement('button');
      button.className = 'swatch';
      button.style.setProperty('--swatch', color);
      button.dataset.color = color.toLowerCase();
      button.dataset.tooltip = tooltip;
      button.setAttribute('aria-label', tooltip);
      button.addEventListener('click', () => setCurrentColor(color, button));
      return button;
    }

    function renderRecentColors() {
      const grid = $('#recentColorGrid');
      grid.replaceChildren();
      const colors = [...state.recentColors];
      while (colors.length < 8) colors.push(COLOR_FAMILIES[0][1][colors.length]);
      colors.slice(0, 8).forEach((color, index) => grid.appendChild(createColorSwatch(color, index < state.recentColors.length ? `Recent · ${color.toUpperCase()}` : `Neutral · ${color.toUpperCase()}`)));
    }

    function addRecentColor(color) {
      const normalized = color.toLowerCase();
      state.recentColors = [normalized, ...state.recentColors.filter(item => item !== normalized)].slice(0, 8);
      try { localStorage.setItem('kam3d-recent-colors', JSON.stringify(state.recentColors)); } catch {}
      renderRecentColors();
      setCurrentColor(normalized);
    }

    function initColorPalette() {
      try {
        const saved = JSON.parse(localStorage.getItem('kam3d-recent-colors') || '[]');
        if (Array.isArray(saved)) state.recentColors = saved.filter(color => /^#[0-9a-f]{6}$/i.test(color)).slice(0, 8);
      } catch {}
      const container = $('#paletteFamilies');
      COLOR_FAMILIES.forEach(([name, colors]) => {
        const row = document.createElement('div');
        row.className = 'palette-family';
        const label = document.createElement('span');
        label.className = 'palette-family-name';
        label.textContent = name;
        const grid = document.createElement('div');
        grid.className = 'palette-grid';
        colors.forEach((color, index) => grid.appendChild(createColorSwatch(color, `${name} ${index + 1}/8 · ${color.toUpperCase()}`)));
        row.append(label, grid);
        container.appendChild(row);
      });
      renderRecentColors();
      setCurrentColor(state.currentColor);
    }

    function createProceduralTextureCanvas(kind, size = 128) {
      const surface = document.createElement('canvas');
      surface.width = surface.height = size;
      const ctx = surface.getContext('2d');
      const random = (() => { let seed = [...kind].reduce((sum, char) => sum + char.charCodeAt(0), 1); return () => ((seed = (seed * 9301 + 49297) % 233280) / 233280); })();
      const fillNoise = (base, amount = 25) => {
        ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
        const image = ctx.getImageData(0, 0, size, size);
        for (let index = 0; index < image.data.length; index += 4) {
          const delta = (random() - .5) * amount;
          image.data[index] = clamp(image.data[index] + delta, 0, 255);
          image.data[index + 1] = clamp(image.data[index + 1] + delta, 0, 255);
          image.data[index + 2] = clamp(image.data[index + 2] + delta, 0, 255);
        }
        ctx.putImageData(image, 0, 0);
      };
      if (kind === 'Concrete') fillNoise('#8b8e8f', 34);
      else if (kind === 'Stone') {
        fillNoise('#737779', 30); ctx.strokeStyle = 'rgba(25,28,29,.38)'; ctx.lineWidth = 2;
        for (let y = 0; y < size; y += 32) for (let x = -16; x < size; x += 42) ctx.strokeRect(x + (y / 32 % 2) * 20, y, 40, 30);
      } else if (kind === 'Brick') {
        fillNoise('#884b3b', 18); ctx.strokeStyle = '#c1a38e'; ctx.lineWidth = 3;
        for (let y = 0; y <= size; y += 24) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke(); for (let x = (y / 24 % 2) * 32; x <= size; x += 64) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 24); ctx.stroke(); } }
      } else if (kind === 'Wood') {
        fillNoise('#8d633e', 16); ctx.strokeStyle = 'rgba(54,31,16,.42)';
        for (let y = 8; y < size; y += 18) { ctx.beginPath(); for (let x = 0; x <= size; x += 8) ctx.lineTo(x, y + Math.sin(x * .11 + y) * 2); ctx.stroke(); }
      } else if (kind === 'Metal') {
        const gradient = ctx.createLinearGradient(0, 0, size, 0); gradient.addColorStop(0, '#70777b'); gradient.addColorStop(.45, '#c5c9ca'); gradient.addColorStop(1, '#596064'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = 'rgba(255,255,255,.15)'; for (let x = 0; x < size; x += 5) ctx.fillRect(x, 0, 1, size);
      } else if (kind === 'Grass') {
        fillNoise('#58723c', 38); ctx.strokeStyle = 'rgba(187,210,112,.38)'; ctx.lineWidth = 1;
        for (let i = 0; i < 170; i++) { const x = random() * size, y = random() * size; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (random() - .5) * 4, y - 3 - random() * 7); ctx.stroke(); }
      } else if (kind === 'Dirt') {
        fillNoise('#6e5038', 42); ctx.fillStyle = 'rgba(38,27,20,.35)';
        for (let i = 0; i < 180; i++) { const radius = .4 + random() * 1.8; ctx.beginPath(); ctx.arc(random() * size, random() * size, radius, 0, Math.PI * 2); ctx.fill(); }
      } else if (kind === 'Asphalt') {
        fillNoise('#3f4243', 46); ctx.fillStyle = 'rgba(225,225,215,.28)';
        for (let i = 0; i < 150; i++) ctx.fillRect(random() * size, random() * size, 1, 1);
      } else if (kind === 'Plaster') {
        fillNoise('#c8c2b3', 22); ctx.strokeStyle = 'rgba(117,108,94,.15)';
        for (let i = 0; i < 18; i++) { ctx.beginPath(); ctx.arc(random() * size, random() * size, 3 + random() * 13, 0, Math.PI * 2); ctx.stroke(); }
      } else if (kind === 'Roof Tiles') {
        fillNoise('#743e32', 16); ctx.strokeStyle = 'rgba(238,194,158,.48)'; ctx.lineWidth = 2;
        for (let y = 0; y < size; y += 22) for (let x = -12; x < size; x += 24) { ctx.beginPath(); ctx.arc(x + (y / 22 % 2) * 12, y, 12, 0, Math.PI); ctx.stroke(); }
      } else if (kind === 'Rusted Metal') {
        fillNoise('#686b69', 24);
        for (let i = 0; i < 55; i++) { ctx.fillStyle = `rgba(${120 + random() * 70},${48 + random() * 35},${20 + random() * 18},${.18 + random() * .42})`; ctx.beginPath(); ctx.arc(random() * size, random() * size, 2 + random() * 10, 0, Math.PI * 2); ctx.fill(); }
      } else {
        fillNoise('#b39a68', 28); ctx.fillStyle = 'rgba(255,255,255,.1)';
        for (let i = 0; i < 100; i++) ctx.fillRect(random() * size, random() * size, 1, 1);
      }
      return surface;
    }

    function configureTexture(texture, channel = 'map') {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.colorSpace = channel === 'map' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      texture.needsUpdate = true;
      return texture;
    }

    function addTextureAsset({ id = uid(), name, texture, dataUrl = null, builtin = false }) {
      texture.userData.kamTextureId = id;
      const asset = { id, name, texture, dataUrl, builtin };
      textureAssets.set(id, asset);
      if (!state.selectedTextureId) state.selectedTextureId = id;
      renderTextureLibrary();
      return asset;
    }

    function loadTextureFromDataUrl(dataUrl, channel = 'map') {
      return new Promise((resolve, reject) => textureLoader.load(dataUrl, texture => resolve(configureTexture(texture, channel)), undefined, reject));
    }

    async function importTextureFiles(files) {
      const supported = [...files].filter(file => /^image\/(png|jpeg|webp)$/i.test(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name));
      if (!supported.length) { toast('No supported textures', 'Use PNG, JPG or WebP image files.', 'image-off'); return; }
      setBusy(true, 'Importing textures', `${supported.length} file${supported.length === 1 ? '' : 's'}`);
      try {
        let lastAsset = null;
        for (const file of supported) {
          const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
          const texture = await loadTextureFromDataUrl(dataUrl);
          lastAsset = addTextureAsset({ name: stripExtension(file.name), texture, dataUrl, builtin: false });
        }
        if (lastAsset) selectTextureAsset(lastAsset);
        toast('Textures imported', `${supported.length} texture${supported.length === 1 ? '' : 's'} added to the library.`, 'image-plus');
      } catch (error) {
        console.error(error); toast('Texture import failed', error.message || 'The image could not be loaded.', 'triangle-alert');
      } finally { setBusy(false); }
    }

    function initTextureLibrary() {
      ['Concrete','Brick','Wood','Metal','Stone','Sand','Grass','Dirt','Asphalt','Plaster','Roof Tiles','Rusted Metal'].forEach(name => {
        const canvas = createProceduralTextureCanvas(name);
        const texture = configureTexture(new THREE.CanvasTexture(canvas));
        addTextureAsset({ id: `builtin-${name.toLowerCase()}`, name, texture, dataUrl: canvas.toDataURL('image/png'), builtin: true });
      });
      renderTextureLibrary();
    }

    function selectTextureAsset(asset) {
      state.selectedTextureId = asset.id;
      const name = asset.name.toLowerCase();
      const guessedChannel = /normal|_n(?:\W|$)/.test(name) ? 'normalMap' : /rough/.test(name) ? 'roughnessMap' : /metal/.test(name) ? 'metalnessMap' : null;
      if (guessedChannel) {
        state.textureChannel = guessedChannel;
        $$('#textureChannelSegment button').forEach(button => button.classList.toggle('active', button.dataset.textureChannel === guessedChannel));
        syncMaterialControlsFromSelection();
      }
      renderTextureLibrary();
    }

    function renderTextureLibrary() {
      const grid = $('#textureGrid');
      if (!grid) return;
      const previousScrollTop = grid.scrollTop;
      grid.replaceChildren();
      textureAssets.forEach(asset => {
        const card = document.createElement('div');
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.className = `texture-card${asset.id === state.selectedTextureId ? ' selected' : ''}`;
        card.dataset.textureId = asset.id;
        const image = document.createElement('img');
        image.alt = asset.name;
        image.src = asset.dataUrl || asset.texture.image?.toDataURL?.('image/png') || '';
        const label = document.createElement('span');
        label.textContent = asset.name;
        card.append(image, label);
        card.addEventListener('click', () => selectTextureAsset(asset));
        card.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectTextureAsset(asset); } });
        if (!asset.builtin) {
          const remove = document.createElement('button');
          remove.type = 'button'; remove.className = 'texture-remove'; remove.dataset.tooltip = 'Remove from texture library'; remove.innerHTML = '<i data-lucide="x"></i>';
          remove.addEventListener('click', event => {
            event.stopPropagation();
            let inUse = false;
            instanceRegistry.forEach(root => allRootMeshes(root).forEach(mesh => {
              (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(material => {
                if (['map','normalMap','roughnessMap','metalnessMap'].some(key => material?.[key]?.userData?.kamTextureId === asset.id)) inUse = true;
              });
            }));
            if (inUse) {
              toast('Texture is in use', 'Remove it from selected materials before deleting it from the library.', 'circle-alert'); return;
            }
            asset.texture.dispose(); textureAssets.delete(asset.id);
            if (state.selectedTextureId === asset.id) state.selectedTextureId = textureAssets.keys().next().value || null;
            renderTextureLibrary();
          });
          card.appendChild(remove);
        }
        grid.appendChild(card);
      });
      grid.scrollTop = previousScrollTop;
      requestAnimationFrame(() => $('.texture-card.selected', grid)?.scrollIntoView({ block: 'nearest' }));
      window.lucide?.createIcons?.({ attrs: { 'stroke-width': 1.8 } });
    }

    function selectedMaterials() {
      const materials = [];
      materialTargetMeshes().forEach(mesh => {
        (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(material => {
          if (material && !materials.includes(material)) materials.push(material);
        });
      });
      return materials;
    }

    function textureTransform(texture) {
      return texture ? { repeat: texture.repeat.toArray(), offset: texture.offset.toArray(), rotation: texture.rotation, center: texture.center.toArray() } : null;
    }

    function captureMaterialState(materials = selectedMaterials()) {
      return materials.map(material => ({
        material,
        roughness: material.roughness,
        metalness: material.metalness,
        opacity: material.opacity,
        transparent: material.transparent,
        normalScale: material.normalScale?.toArray?.() || null,
        managed: { ...(material.userData.kamTextureManaged || {}) },
        maps: Object.fromEntries(['map','normalMap','roughnessMap','metalnessMap'].map(key => [key, { texture: material[key] || null, transform: textureTransform(material[key]) }]))
      }));
    }

    function applyMaterialState(snapshot) {
      snapshot.forEach(item => {
        const material = item.material;
        if (Number.isFinite(item.roughness)) material.roughness = item.roughness;
        if (Number.isFinite(item.metalness)) material.metalness = item.metalness;
        material.opacity = item.opacity;
        material.transparent = item.transparent;
        if (item.normalScale && material.normalScale) material.normalScale.fromArray(item.normalScale);
        material.userData.kamTextureManaged = { ...item.managed };
        Object.entries(item.maps).forEach(([key, saved]) => {
          material[key] = saved.texture;
          if (saved.texture && saved.transform) {
            saved.texture.repeat.fromArray(saved.transform.repeat);
            saved.texture.offset.fromArray(saved.transform.offset);
            saved.texture.rotation = saved.transform.rotation;
            saved.texture.center.fromArray(saved.transform.center);
            saved.texture.needsUpdate = true;
          }
        });
        material.needsUpdate = true;
      });
      syncMaterialControlsFromSelection();
      refreshOpenArrayPreviews();
    }

    function applyTextureToSelection(remove = false) {
      const materials = selectedMaterials();
      const asset = textureAssets.get(state.selectedTextureId);
      if (!materials.length) { toast('Nothing selected', 'Select a model or model part first.', 'image'); return; }
      if (!remove && !asset) { toast('Choose a texture', 'Select a texture tile from the library.', 'image'); return; }
      const channel = state.textureChannel;
      const before = captureMaterialState(materials);
      materials.forEach(material => {
        material.userData.kamTextureManaged ||= {};
        material.userData.kamTextureManaged[channel] = true;
        if (remove) material[channel] = null;
        else {
          const texture = configureTexture(asset.texture.clone(), channel);
          texture.userData.kamTextureId = asset.id;
          texture.repeat.set(Math.max(.01, Number($('#textureRepeatXInput').value) || 1), Math.max(.01, Number($('#textureRepeatYInput').value) || 1));
          texture.offset.set(Number($('#textureOffsetXInput').value) || 0, Number($('#textureOffsetYInput').value) || 0);
          texture.center.set(.5, .5);
          texture.rotation = THREE.MathUtils.degToRad(Number($('#textureRotationInput').value) || 0);
          texture.needsUpdate = true;
          material[channel] = texture;
        }
        material.needsUpdate = true;
      });
      const after = captureMaterialState(materials);
      history.push({ label: `${remove ? 'Remove' : 'Apply'} ${channel} · ${materialTargetLabel()}`, undo: () => applyMaterialState(before), redo: () => applyMaterialState(after) });
      syncMaterialControlsFromSelection();
      toast(remove ? 'Texture removed' : 'Texture applied', `${channel === 'map' ? 'Base color' : channel.replace('Map','')} updated on ${materialTargetLabel()}.`, remove ? 'image-off' : 'image');
    }

    function materialValuesFromUI() {
      return {
        roughness: clamp(Number($('#materialRoughnessInput').value) || 0, 0, 1),
        metalness: clamp(Number($('#materialMetalnessInput').value) || 0, 0, 1),
        opacity: clamp(Number($('#materialOpacityInput').value) || 0, 0, 1),
        normalStrength: clamp(Number($('#normalStrengthInput').value) || 0, 0, 5),
        repeatX: Math.max(.01, Number($('#textureRepeatXInput').value) || 1),
        repeatY: Math.max(.01, Number($('#textureRepeatYInput').value) || 1),
        rotation: THREE.MathUtils.degToRad(Number($('#textureRotationInput').value) || 0),
        offsetX: Number($('#textureOffsetXInput').value) || 0,
        offsetY: Number($('#textureOffsetYInput').value) || 0
      };
    }

    function applyMaterialValuesFromUI() {
      const values = materialValuesFromUI();
      selectedMaterials().forEach(material => {
        if (Number.isFinite(material.roughness)) material.roughness = values.roughness;
        if (Number.isFinite(material.metalness)) material.metalness = values.metalness;
        material.opacity = values.opacity;
        material.transparent = values.opacity < .999;
        if (material.normalScale) material.normalScale.setScalar(values.normalStrength);
        const texture = material[state.textureChannel];
        if (texture) {
          material.userData.kamTextureManaged ||= {};
          material.userData.kamTextureManaged[state.textureChannel] = true;
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(values.repeatX, values.repeatY);
          texture.offset.set(values.offsetX, values.offsetY);
          texture.center.set(.5, .5);
          texture.rotation = values.rotation;
          texture.needsUpdate = true;
        }
        material.needsUpdate = true;
      });
      refreshOpenArrayPreviews();
    }

    function syncMaterialControlsFromSelection() {
      const material = selectedMaterials()[0];
      const texture = material?.[state.textureChannel];
      const controls = ['materialRoughnessInput','materialMetalnessInput','materialOpacityInput','normalStrengthInput','textureRepeatXInput','textureRepeatYInput','textureRotationInput','textureOffsetXInput','textureOffsetYInput'];
      controls.forEach(id => { $(`#${id}`).disabled = !material; });
      if (!material) return;
      $('#materialRoughnessInput').value = trimNumber(material.roughness ?? .7);
      $('#materialMetalnessInput').value = trimNumber(material.metalness ?? 0);
      $('#materialOpacityInput').value = trimNumber(material.opacity ?? 1);
      $('#normalStrengthInput').value = trimNumber(material.normalScale?.x ?? 1);
      $('#textureRepeatXInput').value = trimNumber(texture?.repeat.x ?? 1);
      $('#textureRepeatYInput').value = trimNumber(texture?.repeat.y ?? 1);
      $('#textureRotationInput').value = trimNumber(THREE.MathUtils.radToDeg(texture?.rotation || 0), 2);
      $('#textureOffsetXInput').value = trimNumber(texture?.offset.x ?? 0);
      $('#textureOffsetYInput').value = trimNumber(texture?.offset.y ?? 0);
    }

    function updateTextureTargetUI() {
      if (!state.uiReady) return;
      const meshes = materialTargetMeshes();
      const status = $('#textureTargetStatus');
      status.classList.toggle('ready', Boolean(meshes.length));
      $('span', status).textContent = meshes.length ? `${materialTargetLabel()} · ${selectedMaterials().length} material${selectedMaterials().length === 1 ? '' : 's'}` : 'Select an object or model part.';
      $('#applyTextureBtn').disabled = !meshes.length || !state.selectedTextureId || state.meshEdit.active;
      $('#removeTextureBtn').disabled = !meshes.length || state.meshEdit.active;
      syncMaterialControlsFromSelection();
    }

    const materialControlBefore = new WeakMap();
    function bindMaterialControls() {
      const ids = ['materialRoughnessInput','materialMetalnessInput','materialOpacityInput','normalStrengthInput','textureRepeatXInput','textureRepeatYInput','textureRotationInput','textureOffsetXInput','textureOffsetYInput'];
      ids.forEach(id => {
        const input = $(`#${id}`);
        const begin = () => { if (!materialControlBefore.has(input)) materialControlBefore.set(input, captureMaterialState()); };
        input.addEventListener('focus', begin);
        input.addEventListener('input', () => { begin(); applyMaterialValuesFromUI(); });
        input.addEventListener('change', () => {
          const before = materialControlBefore.get(input);
          if (!before?.length) return;
          const after = captureMaterialState(before.map(item => item.material));
          materialControlBefore.delete(input);
          history.push({ label: `Edit material · ${materialTargetLabel()}`, undo: () => applyMaterialState(before), redo: () => applyMaterialState(after) });
        });
      });
    }

    function getObjectsBox(objects) {
      const box = new THREE.Box3();
      box.makeEmpty();
      objects.forEach(object => box.expandByObject(object));
      return box;
    }

    function focusSelection() {
      const targets = partSelection?.items().length ? partSelection.items() : selection.items();
      const box = targets.length ? getObjectsBox(targets) : getObjectsBox(sceneEntities());
      if (box.isEmpty()) { setView('iso'); return; }
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const radius = Math.max(size.x, size.y, size.z, .5) * .5;
      const direction = activeCamera.position.clone().sub(orbit.target).normalize();
      if (!Number.isFinite(direction.x) || direction.lengthSq() < .1) direction.set(1, .75, 1).normalize();
      if (state.cameraType === 'perspective') {
        const distance = radius / Math.tan(THREE.MathUtils.degToRad(perspectiveCamera.fov * .5)) * 1.45;
        activeCamera.position.copy(center).add(direction.multiplyScalar(Math.max(distance, 2)));
      } else {
        orthoSize = Math.max(radius * 1.7, 1.5);
        updateCameraProjection();
        activeCamera.position.copy(center).add(direction.multiplyScalar(Math.max(radius * 4, 4)));
      }
      orbit.target.copy(center);
      activeCamera.lookAt(center);
      orbit.update();
    }

    function setView(view) {
      const center = selection.items().length ? getObjectsBox(selection.items()).getCenter(new THREE.Vector3()) : orbit.target.clone();
      const distance = Math.max(activeCamera.position.distanceTo(orbit.target), 12);
      const directions = {
        iso: new THREE.Vector3(1, .82, 1),
        top: new THREE.Vector3(0, 1, .0001),
        front: new THREE.Vector3(0, 0, 1),
        right: new THREE.Vector3(1, 0, 0)
      };
      const direction = (directions[view] || directions.iso).normalize();
      activeCamera.position.copy(center).add(direction.multiplyScalar(distance));
      orbit.target.copy(center);
      activeCamera.lookAt(center);
      orbit.update();
    }

    function setCameraType(type) {
      if (type === state.cameraType) return;
      const oldCamera = activeCamera;
      const direction = oldCamera.position.clone().sub(orbit.target).normalize();
      const distance = oldCamera.position.distanceTo(orbit.target);
      state.cameraType = type;
      activeCamera = type === 'orthographic' ? orthographicCamera : perspectiveCamera;
      activeCamera.position.copy(orbit.target).add(direction.multiplyScalar(distance));
      activeCamera.quaternion.copy(oldCamera.quaternion);
      orbit.object = activeCamera;
      transformControls.forEach(control => { control.camera = activeCamera; });
      updateCameraProjection();
      orbit.update();
      $('#cameraLabel').textContent = type === 'perspective' ? 'Perspective' : 'Orthographic';
      $$('#cameraTypeSegment button').forEach(button => button.classList.toggle('active', button.dataset.camera === type));
    }

    function updateCameraProjection() {
      const aspect = window.innerWidth / window.innerHeight;
      perspectiveCamera.aspect = aspect;
      perspectiveCamera.updateProjectionMatrix();
      orthographicCamera.left = -orthoSize * aspect;
      orthographicCamera.right = orthoSize * aspect;
      orthographicCamera.top = orthoSize;
      orthographicCamera.bottom = -orthoSize;
      orthographicCamera.updateProjectionMatrix();
    }

    function updateLightingPosition() {
      const elevation = THREE.MathUtils.degToRad(clamp(Number($('#lightElevationInput').value) || 48, 5, 89));
      const azimuth = THREE.MathUtils.degToRad(clamp(Number($('#lightAzimuthInput').value) || -35, -180, 180));
      const radius = 25;
      keyLight.position.set(
        radius * Math.cos(elevation) * Math.sin(azimuth),
        radius * Math.sin(elevation),
        radius * Math.cos(elevation) * Math.cos(azimuth)
      );
      const fillAzimuth = azimuth + THREE.MathUtils.degToRad(140);
      const fillElevation = THREE.MathUtils.degToRad(28);
      fillLight.position.set(radius * Math.cos(fillElevation) * Math.sin(fillAzimuth), radius * Math.sin(fillElevation), radius * Math.cos(fillElevation) * Math.cos(fillAzimuth));
      const rimAzimuth = azimuth + Math.PI;
      const rimElevation = THREE.MathUtils.degToRad(38);
      rimLight.position.set(radius * Math.cos(rimElevation) * Math.sin(rimAzimuth), radius * Math.sin(rimElevation), radius * Math.cos(rimElevation) * Math.cos(rimAzimuth));
    }

    const lightingPresets = {
      neutral: { ambient: 1.2, sky: '#ffffff', ground: '#31343a', key: 2.4, keyColor: '#ffffff', elevation: 48, azimuth: -35, fill: .7, fillColor: '#9fc5ff', fillEnabled: true, rim: 1.2, rimColor: '#ffffff', rimEnabled: false, exposure: 1, toneMapping: 'aces' },
      studio: { ambient: .8, sky: '#ffffff', ground: '#20242a', key: 3.1, keyColor: '#fff2df', elevation: 55, azimuth: -40, fill: 1.1, fillColor: '#b8d7ff', fillEnabled: true, rim: 1.5, rimColor: '#ffffff', rimEnabled: true, exposure: 1.05, toneMapping: 'aces' },
      outdoor: { ambient: 1.4, sky: '#cfe8ff', ground: '#5a6254', key: 2.8, keyColor: '#fff4d6', elevation: 52, azimuth: -30, fill: .45, fillColor: '#a8cbff', fillEnabled: true, rim: .7, rimColor: '#e8f4ff', rimEnabled: true, exposure: 1, toneMapping: 'aces' },
      golden: { ambient: .8, sky: '#ffd6a3', ground: '#4a3430', key: 3.5, keyColor: '#ff9f43', elevation: 24, azimuth: -55, fill: .6, fillColor: '#7da8ff', fillEnabled: true, rim: 1.8, rimColor: '#ffc078', rimEnabled: true, exposure: 1.1, toneMapping: 'aces' },
      overcast: { ambient: 1.8, sky: '#dce5ee', ground: '#626a70', key: 1.2, keyColor: '#e7f0ff', elevation: 65, azimuth: -20, fill: .8, fillColor: '#d7e6ff', fillEnabled: true, rim: .8, rimColor: '#ffffff', rimEnabled: false, exposure: 1, toneMapping: 'aces' },
      night: { ambient: .35, sky: '#5577aa', ground: '#111522', key: 1.3, keyColor: '#7aa2ff', elevation: 42, azimuth: -45, fill: .25, fillColor: '#384d8f', fillEnabled: true, rim: 1.7, rimColor: '#8fbaff', rimEnabled: true, exposure: .75, toneMapping: 'aces' },
      dramatic: { ambient: .35, sky: '#6f7785', ground: '#15171b', key: 4.2, keyColor: '#ffc49a', elevation: 38, azimuth: -65, fill: .15, fillColor: '#4466aa', fillEnabled: true, rim: 2.5, rimColor: '#79b8ff', rimEnabled: true, exposure: 1.05, toneMapping: 'cineon' }
    };

    function setToneMapping(type) {
      const mappings = { aces: THREE.ACESFilmicToneMapping, linear: THREE.LinearToneMapping, reinhard: THREE.ReinhardToneMapping, cineon: THREE.CineonToneMapping };
      state.lighting.toneMapping = mappings[type] === undefined ? 'aces' : type;
      renderer.toneMapping = mappings[state.lighting.toneMapping];
      $('#toneMappingInput').value = state.lighting.toneMapping;
    }

    function syncLightingFromUI() {
      if (state.lighting.preset === 'custom') $('#lightingPresetInput').value = 'custom';
      hemiLight.intensity = Number($('#ambientInput').value);
      hemiLight.color.set($('#ambientSkyInput').value);
      hemiLight.groundColor.set($('#ambientGroundInput').value);
      keyLight.intensity = Number($('#keyInput').value);
      keyLight.color.set($('#keyColorInput').value);
      state.lighting.fillEnabled = $('#fillEnabledInput').checked;
      fillLight.visible = state.lighting.fillEnabled;
      fillLight.intensity = Number($('#fillInput').value);
      fillLight.color.set($('#fillColorInput').value);
      state.lighting.rimEnabled = $('#rimEnabledInput').checked;
      rimLight.visible = state.lighting.rimEnabled;
      rimLight.intensity = Number($('#rimInput').value);
      rimLight.color.set($('#rimColorInput').value);
      state.lighting.exposure = Number($('#exposureInput').value);
      renderer.toneMappingExposure = state.lighting.exposure;
      setToneMapping($('#toneMappingInput').value);
      $('#ambientValue').textContent = hemiLight.intensity.toFixed(2).replace(/0$/, '');
      $('#keyValue').textContent = keyLight.intensity.toFixed(2).replace(/0$/, '');
      $('#fillValue').textContent = fillLight.intensity.toFixed(2).replace(/0$/, '');
      $('#rimValue').textContent = rimLight.intensity.toFixed(2).replace(/0$/, '');
      $('#exposureValue').textContent = state.lighting.exposure.toFixed(2).replace(/0$/, '');
      updateLightingPosition();
    }

    function applyLightingPreset(name, notify = true) {
      const preset = lightingPresets[name] || lightingPresets.neutral;
      state.lighting.preset = lightingPresets[name] ? name : 'neutral';
      $('#lightingPresetInput').value = state.lighting.preset;
      $('#ambientInput').value = preset.ambient; $('#ambientSkyInput').value = preset.sky; $('#ambientGroundInput').value = preset.ground;
      $('#keyInput').value = preset.key; $('#keyColorInput').value = preset.keyColor; $('#lightElevationInput').value = preset.elevation; $('#lightAzimuthInput').value = preset.azimuth;
      $('#fillInput').value = preset.fill; $('#fillColorInput').value = preset.fillColor; $('#fillEnabledInput').checked = preset.fillEnabled;
      $('#rimInput').value = preset.rim; $('#rimColorInput').value = preset.rimColor; $('#rimEnabledInput').checked = preset.rimEnabled;
      $('#exposureInput').value = preset.exposure; $('#toneMappingInput').value = preset.toneMapping;
      syncLightingFromUI();
      if (notify) toast('Lighting preset applied', state.lighting.preset[0].toUpperCase() + state.lighting.preset.slice(1), 'lightbulb');
    }

    function backgroundConfigFromUI() {
      return {
        mode: state.background.mode,
        solid: $('#backgroundInput').value,
        top: $('#gradientTopInput').value,
        bottom: $('#gradientBottomInput').value,
        horizon: Number($('#gradientHorizonInput').value),
        fogEnabled: $('#fogEnabledInput').checked,
        fogType: state.background.fogType,
        fogColor: $('#fogColorInput').value,
        fogMatch: $('#fogMatchInput').checked,
        fogNear: Number($('#fogNearInput').value),
        fogFar: Number($('#fogFarInput').value),
        fogDensity: Number($('#fogDensityInput').value)
      };
    }

    function updateGradientBackground(config) {
      const surface = document.createElement('canvas'); surface.width = 2; surface.height = 256;
      const context = surface.getContext('2d');
      const gradient = context.createLinearGradient(0, 0, 0, surface.height);
      const horizon = clamp(config.horizon / 100, .1, .9);
      gradient.addColorStop(0, config.top); gradient.addColorStop(Math.max(0, horizon - .12), config.top); gradient.addColorStop(Math.min(1, horizon + .12), config.bottom); gradient.addColorStop(1, config.bottom);
      context.fillStyle = gradient; context.fillRect(0, 0, surface.width, surface.height);
      gradientBackgroundTexture?.dispose();
      gradientBackgroundTexture = new THREE.CanvasTexture(surface);
      gradientBackgroundTexture.colorSpace = THREE.SRGBColorSpace;
      scene.background = gradientBackgroundTexture;
    }

    function updateFog(config = backgroundConfigFromUI()) {
      state.background = { ...state.background, ...config };
      $('#fogLinearFields').hidden = config.fogType !== 'linear';
      $('#fogExpFields').hidden = config.fogType !== 'exp';
      const fogColor = config.fogMatch ? (config.mode === 'gradient' ? config.bottom : config.solid) : config.fogColor;
      $('#fogColorInput').disabled = config.fogMatch;
      if (!config.fogEnabled) { scene.fog = null; return; }
      if (config.fogType === 'linear') scene.fog = new THREE.Fog(fogColor, Math.max(0, config.fogNear), Math.max(config.fogNear + .01, config.fogFar));
      else scene.fog = new THREE.FogExp2(fogColor, clamp(config.fogDensity, .00001, .1));
    }

    function updateSceneBackground() {
      const config = backgroundConfigFromUI();
      state.background = { ...state.background, ...config };
      $('#solidBackgroundFields').hidden = config.mode !== 'solid';
      $('#gradientBackgroundFields').hidden = config.mode !== 'gradient';
      if (config.mode === 'solid') scene.background = new THREE.Color(config.solid);
      else if (config.mode === 'gradient') updateGradientBackground(config);
      else scene.background = null;
      updateFog(config);
    }

    function setShadows(enabled) {
      state.shadows = enabled;
      renderer.shadowMap.enabled = enabled;
      keyLight.castShadow = enabled;
      shadowGround.visible = enabled;
      instanceRegistry.forEach(root => root.traverse(object => {
        if (object.isMesh) { object.castShadow = enabled; object.receiveShadow = enabled; }
      }));
      syncToggle('shadowsBtn', enabled);
      $('#shadowsEnabledInput').checked = enabled;
    }

    function exportBinaryRoot(root) {
      const stashed = [];
      root.traverse(object => {
        if (!object.userData?.kamPolyData) return;
        stashed.push({ object, data: object.userData.kamPolyData });
        delete object.userData.kamPolyData;
      });
      return new Promise((resolve, reject) => gltfExporter.parse(root, resolve, reject, {
        binary: true,
        onlyVisible: true,
        truncateDrawRange: true,
        maxTextureSize: 4096
      })).finally(() => stashed.forEach(item => { item.object.userData.kamPolyData = item.data; }));
    }

    async function createPrefabFromSelection() {
      const objects = selection.items();
      if (!objects.length) { toast('Nothing selected', 'Select one or more objects to create a prefab.', 'package-plus'); return; }
      if (objects.some(isLightEntity)) { toast('Models only', 'Scene lights can be grouped with models, but prefab light support is planned for a later step.', 'lightbulb'); return; }
      const name = ($('#prefabNameInput').value.trim() || 'New prefab').replace(/\.(glb|kamprefab)$/i, '');
      const pivotMode = $('#prefabPivotSegment button.active')?.dataset.pivot || 'bottom';
      scene.updateMatrixWorld(true);
      const box = getObjectsBox(objects);
      const center = box.getCenter(new THREE.Vector3());
      const pivot = pivotMode === 'origin' ? new THREE.Vector3(0, 0, 0) : pivotMode === 'center' ? center : new THREE.Vector3(center.x, box.min.y, center.z);
      const states = captureStates(objects);
      const children = objects.map((object, index) => ({
        assetId: object.userData.assetId,
        name: object.name,
        position: new THREE.Vector3().fromArray(states[index].position).sub(pivot).toArray(),
        quaternion: [...states[index].quaternion],
        scale: [...states[index].scale],
        colors: collectMaterialColors(object),
        visible: object.visible,
        locked: Boolean(object.userData.kamLocked),
        groupId: object.userData.kamGroupId || null,
        groupName: object.userData.kamGroupName || null
      }));
      const exportRoot = new THREE.Group();
      exportRoot.name = name;
      objects.forEach((object, index) => {
        const clone = cloneMaterials(SkeletonUtils.clone(object));
        clone.position.fromArray(children[index].position);
        clone.quaternion.fromArray(children[index].quaternion);
        clone.scale.fromArray(children[index].scale);
        clone.visible = true;
        exportRoot.add(clone);
      });
      exportRoot.updateMatrixWorld(true);
      setBusy(true, 'Creating prefab', `${objects.length} object${objects.length === 1 ? '' : 's'}`);
      try {
        const buffer = await exportBinaryRoot(exportRoot);
        const prefab = { version: 1, pivot: pivotMode, children };
        const asset = await registerAssetFromBuffer(`${name}.glb`, buffer, null, prefab);
        selectAsset(asset.id);
        if ($('#prefabDownloadInput').checked) {
          const safeName = name.replace(/[^a-z0-9._-]+/gi, '_');
          downloadBlob(new Blob([buffer], { type: 'model/gltf-binary' }), `${safeName}.glb`);
        }
        toast('Prefab created', `${name} added to the GLB Library with ${children.length} editable part${children.length === 1 ? '' : 's'}.`, 'package-plus');
      } catch (error) {
        console.error(error);
        toast('Prefab failed', error.message || 'The selected objects could not be packed.', 'triangle-alert');
      } finally { setBusy(false); }
    }

    function unpackSelectedPrefabs() {
      const prefabs = selection.items().filter(object => assets.get(object.userData.assetId)?.prefab);
      if (!prefabs.length) { toast('No prefab selected', 'Select one or more placed prefab instances first.', 'package-open'); return; }
      scene.updateMatrixWorld(true);
      const created = [];
      prefabs.forEach(prefabObject => {
        const prefab = assets.get(prefabObject.userData.assetId).prefab;
        const groupIds = new Map();
        prefab.children.forEach(child => {
          const sourceAsset = assets.get(child.assetId);
          if (!sourceAsset) return;
          const object = createInstance(sourceAsset, child.name);
          const local = new THREE.Matrix4().compose(new THREE.Vector3().fromArray(child.position), new THREE.Quaternion().fromArray(child.quaternion), new THREE.Vector3().fromArray(child.scale));
          const world = prefabObject.matrixWorld.clone().multiply(local);
          world.decompose(object.position, object.quaternion, object.scale);
          applyMaterialColors(object, child.colors || []);
          object.visible = child.visible !== false;
          object.userData.kamLocked = Boolean(child.locked);
          if (child.groupId) {
            if (!groupIds.has(child.groupId)) groupIds.set(child.groupId, uid());
            object.userData.kamGroupId = groupIds.get(child.groupId);
            object.userData.kamGroupName = child.groupName || 'Prefab group';
          }
          object.updateMatrixWorld(true);
          created.push(object);
        });
      });
      if (!created.length) { toast('Prefab sources missing', 'The source models required to unpack this prefab are not in the library.', 'triangle-alert'); return; }
      selection.clear();
      detachInstances(prefabs);
      attachInstances(created);
      selection.set(created.filter(object => object.visible && !object.userData.kamLocked));
      history.push({
        label: `Unpack ${prefabs.length} prefab${prefabs.length === 1 ? '' : 's'}`,
        undo: () => { selection.clear(); detachInstances(created); attachInstances(prefabs); selection.set(prefabs); },
        redo: () => { selection.clear(); detachInstances(prefabs); attachInstances(created); selection.set(created.filter(object => object.visible && !object.userData.kamLocked)); }
      });
      toast('Prefab unpacked', `${created.length} editable object${created.length === 1 ? '' : 's'} restored.`, 'package-open');
    }

    function manifestRound(value, precision = 6) { return Number(Number(value).toFixed(precision)); }
    function manifestVector(vector, factor = 1) { return { x: manifestRound(vector.x * factor), y: manifestRound(vector.y * factor), z: manifestRound(vector.z * factor) }; }
    function manifestQuaternion(quaternion) { return { x: manifestRound(quaternion.x), y: manifestRound(quaternion.y), z: manifestRound(quaternion.z), w: manifestRound(quaternion.w) }; }

    function collectObjectManifest(root, unitFactor) {
      root.updateMatrixWorld(true);
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      root.matrixWorld.decompose(position, quaternion, scale);
      const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');
      const manifestTargets = partSelection?.root === root ? [root, ...partSelection.items()] : [root];
      const box = getObjectsBox(manifestTargets);
      const size = box.isEmpty() ? new THREE.Vector3() : box.getSize(new THREE.Vector3());
      let meshCount = 0, vertices = 0, triangles = 0, castsShadow = false, receivesShadow = false;
      const materials = [];
      allRootMeshes(root).forEach(object => {
        meshCount++;
        const positionAttribute = object.geometry?.getAttribute?.('position');
        const vertexCount = positionAttribute?.count || 0;
        const triangleCount = object.geometry?.index ? object.geometry.index.count / 3 : vertexCount / 3;
        vertices += vertexCount;
        triangles += triangleCount;
        castsShadow ||= Boolean(object.castShadow);
        receivesShadow ||= Boolean(object.receiveShadow);
        const list = Array.isArray(object.material) ? object.material : [object.material];
        list.forEach((material, index) => {
          if (!material) return;
          materials.push({
            mesh: object.name || `Mesh ${meshCount}`,
            slot: index,
            name: material.name || `Material ${index + 1}`,
            color: material.color ? `#${material.color.getHexString()}` : null,
            opacity: manifestRound(material.opacity ?? 1),
            transparent: Boolean(material.transparent),
            roughness: Number.isFinite(material.roughness) ? manifestRound(material.roughness) : null,
            metalness: Number.isFinite(material.metalness) ? manifestRound(material.metalness) : null,
            textures: Object.fromEntries(['map','normalMap','roughnessMap','metalnessMap'].map(key => [key, material[key]?.userData?.kamTextureId || (material[key] ? 'embedded' : null)]))
          });
        });
      });
      const asset = assets.get(root.userData.assetId);
      return {
        id: root.userData.instanceId,
        name: root.name,
        asset: {
          id: root.userData.assetId || null,
          name: asset?.name || null,
          prefab: Boolean(asset?.prefab),
          prefabParts: asset?.prefab?.children?.length || 0
        },
        editableMesh: root.userData.kamEditableMesh ? { enabled: true, parts: editableParts(root).length, faces: editableParts(root).reduce((count, part) => count + Math.floor(part.userData.kamPolyData.positions.length / 9), 0) } : { enabled: false },
        group: root.userData.kamGroupId ? { id: root.userData.kamGroupId, name: root.userData.kamGroupName || null } : null,
        paint: root.userData.kamPainted ? { painted: true, sourceId: root.userData.paintSourceId || null, strokeId: root.userData.paintStrokeId || null } : null,
        transform: {
          position: manifestVector(position, unitFactor),
          rotationRadians: { x: manifestRound(euler.x), y: manifestRound(euler.y), z: manifestRound(euler.z), order: euler.order },
          rotationDegrees: { x: manifestRound(THREE.MathUtils.radToDeg(euler.x), 3), y: manifestRound(THREE.MathUtils.radToDeg(euler.y), 3), z: manifestRound(THREE.MathUtils.radToDeg(euler.z), 3), order: euler.order },
          quaternion: manifestQuaternion(quaternion),
          scale: manifestVector(scale)
        },
        dimensions: { width: manifestRound(size.x * unitFactor), height: manifestRound(size.y * unitFactor), depth: manifestRound(size.z * unitFactor) },
        bounds: box.isEmpty() ? null : { min: manifestVector(box.min, unitFactor), max: manifestVector(box.max, unitFactor) },
        visible: root.visible,
        locked: Boolean(root.userData.kamLocked),
        shadows: { casts: castsShadow, receives: receivesShadow },
        geometry: { meshes: meshCount, vertices, triangles: Math.round(triangles) },
        partStructure: {
          currentParts: allRootMeshes(root).length,
          duplicatedParts: allRootMeshes(root).filter(part => part.userData.kamDuplicatedPart).length,
          deletedSourceKeys: [...new Set(root.userData.kamDeletedPartKeys || [])]
        },
        parts: allRootMeshes(root).map((part, index) => {
          const partPosition = part.getWorldPosition(new THREE.Vector3());
          const partQuaternion = part.getWorldQuaternion(new THREE.Quaternion());
          const partRotation = new THREE.Euler().setFromQuaternion(partQuaternion, 'XYZ');
          const partScale = part.getWorldScale(new THREE.Vector3());
          return {
            index,
            name: partLabel(part, index),
            visible: part.visible,
            worldPosition: manifestVector(partPosition, unitFactor),
            worldRotationDegrees: {
              x: manifestRound(THREE.MathUtils.radToDeg(partRotation.x), 3),
              y: manifestRound(THREE.MathUtils.radToDeg(partRotation.y), 3),
              z: manifestRound(THREE.MathUtils.radToDeg(partRotation.z), 3)
            },
            worldScale: manifestVector(partScale)
          };
        }),
        materials
      };
    }

    function manifestSceneObjects() {
      const includeHidden = $('#manifestHiddenInput').checked;
      return [...instanceRegistry].filter(object => includeHidden || object.visible);
    }

    function manifestSceneLights() {
      const includeHidden = $('#manifestHiddenInput').checked;
      return [...lightRegistry].filter(object => includeHidden || object.visible);
    }

    function collectLightManifest(root, unitFactor) {
      root.updateMatrixWorld(true);
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      root.matrixWorld.decompose(position, quaternion, scale);
      const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion).normalize();
      const properties = lightProperties(root);
      return {
        id: root.userData.instanceId,
        name: root.name,
        type: root.userData.kamLightType,
        group: root.userData.kamGroupId ? { id: root.userData.kamGroupId, name: root.userData.kamGroupName || null } : null,
        visible: root.visible,
        locked: Boolean(root.userData.kamLocked),
        transform: { position: manifestVector(position, unitFactor), quaternion: manifestQuaternion(quaternion), direction: manifestVector(direction) },
        color: properties.color,
        intensity: manifestRound(properties.intensity),
        range: properties.range === null ? null : manifestRound(properties.range * unitFactor),
        decay: properties.decay,
        coneAngleDegrees: properties.angle === null ? null : manifestRound(properties.angle, 3),
        penumbra: properties.penumbra,
        width: properties.width === null ? null : manifestRound(properties.width * unitFactor),
        height: properties.height === null ? null : manifestRound(properties.height * unitFactor),
        shadows: { enabled: properties.castShadow, mapSize: properties.shadowSize }
      };
    }

    function updateManifestCount() {
      if (!state.uiReady) return;
      const models = manifestSceneObjects().length;
      const lights = manifestSceneLights().length;
      const count = models + lights;
      $('#manifestObjectCount').textContent = `${models} model${models === 1 ? '' : 's'} · ${lights} light${lights === 1 ? '' : 's'}`;
      $('#exportManifestBtn').disabled = !count;
    }

    function exportSceneManifest() {
      const roots = manifestSceneObjects();
      const sceneLights = manifestSceneLights();
      if (!roots.length && !sceneLights.length) { toast('Scene is empty', 'There are no eligible objects or lights to export.', 'file-json'); return; }
      const units = $('#manifestUnitsSegment button.active')?.dataset.units || 'meters';
      const unitFactor = units === 'centimeters' ? 100 : 1;
      scene.updateMatrixWorld(true);
      const sceneBox = getObjectsBox([...roots, ...sceneLights]);
      const sceneSize = sceneBox.getSize(new THREE.Vector3());
      const name = $('#manifestNameInput').value.trim() || 'KAM3D Scene';
      const manifest = {
        format: 'KAM3D Scene Manifest',
        schemaVersion: 6,
        editor: { name: 'KAM3D Live Editor', version: '0.14.0' },
        exportedAt: new Date().toISOString(),
        name,
        units,
        summary: {
          objects: roots.length,
          sceneLights: sceneLights.length,
          bounds: { min: manifestVector(sceneBox.min, unitFactor), max: manifestVector(sceneBox.max, unitFactor) },
          dimensions: { width: manifestRound(sceneSize.x * unitFactor), height: manifestRound(sceneSize.y * unitFactor), depth: manifestRound(sceneSize.z * unitFactor) }
        },
        world: {
          background: { mode: state.background.mode, solid: state.background.solid, top: state.background.top, bottom: state.background.bottom, horizonPercent: state.background.horizon, transparent: state.background.mode === 'transparent' },
          fog: state.background.fogEnabled ? { enabled: true, type: state.background.fogType, color: scene.fog ? `#${scene.fog.color.getHexString()}` : state.background.fogColor, matchBackground: state.background.fogMatch, near: state.background.fogType === 'linear' ? state.background.fogNear * unitFactor : null, far: state.background.fogType === 'linear' ? state.background.fogFar * unitFactor : null, density: state.background.fogType === 'exp' ? state.background.fogDensity / unitFactor : null } : { enabled: false },
          grid: { visible: state.gridVisible, size: Number($('#gridSizeInput').value) * unitFactor, divisions: Number($('#gridDivisionsInput').value), opacity: Number($('#gridOpacityInput').value) / 100 },
          snapping: { enabled: state.snapEnabled, move: state.moveSnap * unitFactor, rotateDegrees: state.rotateSnap, scale: state.scaleSnap, smart: { enabled: state.smartSnap.enabled, distance: state.smartSnap.distance * unitFactor } }
        },
        lighting: {
          preset: state.lighting.preset,
          hemisphere: { skyColor: `#${hemiLight.color.getHexString()}`, groundColor: `#${hemiLight.groundColor.getHexString()}`, intensity: manifestRound(hemiLight.intensity) },
          key: { type: 'directional', color: `#${keyLight.color.getHexString()}`, intensity: manifestRound(keyLight.intensity), position: manifestVector(keyLight.position, unitFactor), elevationDegrees: Number($('#lightElevationInput').value), azimuthDegrees: Number($('#lightAzimuthInput').value) },
          fill: { type: 'directional', enabled: fillLight.visible, color: `#${fillLight.color.getHexString()}`, intensity: manifestRound(fillLight.intensity), position: manifestVector(fillLight.position, unitFactor) },
          rim: { type: 'directional', enabled: rimLight.visible, color: `#${rimLight.color.getHexString()}`, intensity: manifestRound(rimLight.intensity), position: manifestVector(rimLight.position, unitFactor) },
          exposure: manifestRound(renderer.toneMappingExposure),
          toneMapping: state.lighting.toneMapping
        },
        shadows: { enabled: state.shadows, groundOpacity: manifestRound(shadowGround.material.opacity), mapSize: keyLight.shadow.mapSize.x, bias: keyLight.shadow.bias, normalBias: keyLight.shadow.normalBias },
        objects: roots.map(object => collectObjectManifest(object, unitFactor)),
        sceneLights: sceneLights.map(object => collectLightManifest(object, unitFactor))
      };
      if ($('#manifestCameraInput').checked) manifest.camera = {
        type: state.cameraType,
        position: manifestVector(activeCamera.position, unitFactor),
        target: manifestVector(orbit.target, unitFactor),
        near: activeCamera.near * unitFactor,
        far: activeCamera.far * unitFactor,
        fovDegrees: state.cameraType === 'perspective' ? perspectiveCamera.fov : null,
        orthographicSize: state.cameraType === 'orthographic' ? orthoSize * unitFactor : null
      };
      const pretty = ($('#manifestFormatSegment button.active')?.dataset.format || 'pretty') === 'pretty';
      const json = JSON.stringify(manifest, null, pretty ? 2 : 0);
      const safeName = name.replace(/[^a-z0-9._-]+/gi, '_');
      downloadBlob(new Blob([json], { type: 'application/json' }), `${safeName}_${dateStamp()}.json`);
      toast('Scene Manifest exported', `${roots.length} models and ${sceneLights.length} lights written to JSON.`, 'file-json');
    }

    async function exportSceneGLB() {
      if (!instanceRegistry.size) { toast('Scene is empty', 'Place at least one model before exporting.', 'box'); return; }
      setBusy(true, 'Building GLB scene', `${instanceRegistry.size} object${instanceRegistry.size === 1 ? '' : 's'}`);
      const selected = selection.items();
      const selectedParts = partSelection.items();
      const selectedPartRoot = partSelection.root;
      selection.clear();
      await nextFrame();
      try {
        const result = await exportBinaryRoot(instancesRoot);
        downloadBlob(new Blob([result], { type: 'model/gltf-binary' }), `KAM3D_WB_scene_${dateStamp()}.glb`);
        toast('GLB exported', 'All placed models were packed into one scene.', 'check');
      } catch (error) {
        console.error(error);
        toast('Export failed', error.message || 'The scene could not be exported.', 'triangle-alert');
      } finally {
        if (selectedParts.length && selectedPartRoot) {
          setSelectionScope('part');
          partSelection.set(selectedParts, selectedPartRoot);
        } else if (selected.length) selection.set(selected);
        setBusy(false);
      }
    }

    async function saveProject() {
      setBusy(true, 'Saving KAM3D project', 'Packing models and world data');
      const selected = selection.items();
      const selectedParts = partSelection.items();
      const selectedPartRoot = partSelection.root;
      const selectionScope = state.selectionScope;
      selection.clear();
      await nextFrame();
      try {
        const project = {
          format: 'KAM3D-WB',
          version: 9,
          createdAt: new Date().toISOString(),
          assets: [...assets.values()].map(asset => ({ id: asset.id, name: asset.name, glb: arrayBufferToBase64(asset.buffer), prefab: asset.prefab || null })),
          textures: [...textureAssets.values()].filter(asset => !asset.builtin).map(asset => ({ id: asset.id, name: asset.name, dataUrl: asset.dataUrl })),
          instances: [...instanceRegistry].map(object => ({
            assetId: object.userData.assetId,
            name: object.name,
            position: object.position.toArray(),
            quaternion: object.quaternion.toArray(),
            scale: object.scale.toArray(),
            colors: collectMaterialColors(object),
            visible: object.visible,
            locked: Boolean(object.userData.kamLocked),
            groupId: object.userData.kamGroupId || null,
            groupName: object.userData.kamGroupName || null,
            editableMesh: serializeEditableRoot(object),
            partStructure: serializePartStructure(object),
            parts: serializePartOverrides(object),
            paint: object.userData.kamPainted ? {
              painted: true,
              sourceId: object.userData.paintSourceId || null,
              strokeId: object.userData.paintStrokeId || null
            } : null
          })),
          lights: [...lightRegistry].map(object => ({
            id: object.userData.instanceId,
            type: object.userData.kamLightType,
            name: object.name,
            position: object.position.toArray(),
            quaternion: object.quaternion.toArray(),
            scale: object.scale.toArray(),
            visible: object.visible,
            locked: Boolean(object.userData.kamLocked),
            groupId: object.userData.kamGroupId || null,
            groupName: object.userData.kamGroupName || null,
            ...lightProperties(object)
          })),
          world: {
            background: backgroundConfigFromUI(),
            gridVisible: state.gridVisible,
            gridSize: Number($('#gridSizeInput').value),
            gridDivisions: Number($('#gridDivisionsInput').value),
            gridOpacity: Number($('#gridOpacityInput').value),
            snapEnabled: state.snapEnabled,
            moveSnap: state.moveSnap,
            rotateSnap: state.rotateSnap,
            scaleSnap: state.scaleSnap,
            smartSnap: {
              enabled: state.smartSnap.enabled,
              guides: state.smartSnap.guides,
              edges: state.smartSnap.edges,
              centers: state.smartSnap.centers,
              distance: state.smartSnap.distance
            },
            shadows: state.shadows,
            lighting: {
              preset: state.lighting.preset,
              ambient: hemiLight.intensity,
              skyColor: `#${hemiLight.color.getHexString()}`,
              groundColor: `#${hemiLight.groundColor.getHexString()}`,
              key: keyLight.intensity,
              keyColor: `#${keyLight.color.getHexString()}`,
              lightElevation: Number($('#lightElevationInput').value),
              lightAzimuth: Number($('#lightAzimuthInput').value),
              fillEnabled: fillLight.visible,
              fill: fillLight.intensity,
              fillColor: `#${fillLight.color.getHexString()}`,
              rimEnabled: rimLight.visible,
              rim: rimLight.intensity,
              rimColor: `#${rimLight.color.getHexString()}`,
              exposure: renderer.toneMappingExposure,
              toneMapping: state.lighting.toneMapping
            }
          }
        };
        const blob = new Blob([JSON.stringify(project)], { type: 'application/json' });
        downloadBlob(blob, `KAM3D_WB_project_${dateStamp()}.kamwb`);
        toast('Project saved', `${assets.size} assets · ${textureAssets.size} textures · ${instanceRegistry.size} models · ${lightRegistry.size} lights packed.`, 'save');
      } catch (error) {
        console.error(error);
        toast('Save failed', error.message || 'Project could not be packed.', 'triangle-alert');
      } finally {
        if (selectedParts.length && selectedPartRoot) {
          setSelectionScope('part');
          partSelection.set(selectedParts, selectedPartRoot);
        } else if (selected.length) selection.set(selected);
        if (!selectedParts.length && selectionScope !== state.selectionScope && selectionScope !== 'face') setSelectionScope(selectionScope);
        setBusy(false);
      }
    }

    async function openProject(file) {
      if (!file) return;
      if ((assets.size || instanceRegistry.size || lightRegistry.size) && !confirm('Opening a project replaces the current workspace. Continue?')) return;
      setBusy(true, 'Opening KAM3D project', file.name);
      try {
        const project = JSON.parse(await file.text());
        if (project.format !== 'KAM3D-WB' || !Array.isArray(project.assets) || !Array.isArray(project.instances)) throw new Error('This is not a valid KAM3D Live Editor project.');
        clearWorkspace(false);
        for (const textureData of project.textures || []) {
          if (!textureData?.dataUrl) continue;
          const texture = await loadTextureFromDataUrl(textureData.dataUrl);
          addTextureAsset({ id: textureData.id || uid(), name: textureData.name || 'Project texture', texture, dataUrl: textureData.dataUrl, builtin: false });
        }
        for (let index = 0; index < project.assets.length; index++) {
          const assetData = project.assets[index];
          $('#busyDetail').textContent = `Loading model ${index + 1} of ${project.assets.length}`;
          await registerAssetFromBuffer(assetData.name, base64ToArrayBuffer(assetData.glb), assetData.id, assetData.prefab || null);
          await nextFrame();
        }
        for (const data of project.instances) {
          const asset = assets.get(data.assetId);
          if (!asset) continue;
          const object = createInstance(asset, data.name);
          object.position.fromArray(data.position);
          object.quaternion.fromArray(data.quaternion);
          object.scale.fromArray(data.scale);
          object.visible = data.visible !== false;
          object.userData.kamLocked = Boolean(data.locked);
          if (data.groupId) object.userData.kamGroupId = data.groupId;
          if (data.groupName) object.userData.kamGroupName = data.groupName;
          if (data.paint?.painted) {
            object.userData.kamPainted = true;
            object.userData.paintSourceId = data.paint.sourceId || `asset:${data.assetId}`;
            object.userData.paintStrokeId = data.paint.strokeId || uid();
          }
          restorePartStructure(object, data.partStructure);
          if (data.editableMesh) restoreEditableRoot(object, data.editableMesh);
          applyMaterialColors(object, data.colors || []);
          restorePartOverrides(object, data.parts);
          instancesRoot.add(object);
          instanceRegistry.add(object);
        }
        for (const data of project.lights || []) addSceneLight(data.type, { record: false, select: false, data });
        applyProjectWorld(project.world || {});
        history.clear();
        updateAllUI();
        focusSelection();
        toast('Project opened', `${assets.size} assets · ${instanceRegistry.size} models · ${lightRegistry.size} lights`, 'folder-open');
      } catch (error) {
        console.error(error);
        toast('Could not open project', error.message || 'The project file is damaged.', 'triangle-alert');
      } finally { setBusy(false); }
    }

    function collectMaterialColors(root) {
      const colors = [];
      root.traverse(object => {
        if (!object.isMesh) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(material => colors.push(material?.color ? `#${material.color.getHexString()}` : null));
      });
      return colors;
    }

    function allRootMeshes(root) {
      const meshes = [];
      root?.traverse(object => { if (object.isMesh && !object.userData.kamEditorOnly) meshes.push(object); });
      if (partSelection?.root === root) partSelection.items().forEach(part => { if (!part.userData.kamEditorOnly && !meshes.includes(part)) meshes.push(part); });
      return meshes;
    }

    function serializePartStructure(root) {
      return {
        deletedSourceKeys: [...new Set(root.userData.kamDeletedPartKeys || [])],
        duplicates: allRootMeshes(root).filter(part => part.userData.kamDuplicatedPart).map(part => ({
          partKey: part.userData.kamPartKey,
          sourceKey: part.userData.kamDuplicateSourceKey,
          name: part.name
        }))
      };
    }

    function restorePartStructure(root, structure) {
      if (!structure) return;
      tagInstanceParts(root);
      const byKey = new Map(allRootMeshes(root).map(part => [part.userData.kamPartKey, part]));
      (structure.duplicates || []).forEach(saved => {
        if (!saved.partKey || byKey.has(saved.partKey)) return;
        const source = byKey.get(saved.sourceKey);
        if (!source?.parent) return;
        const clone = cloneModelPart(source, { key: saved.partKey });
        if (!clone) return;
        clone.name = saved.name || clone.name;
        source.parent.add(clone);
        byKey.set(saved.partKey, clone);
      });
      const deleted = new Set(structure.deletedSourceKeys || []);
      deleted.forEach(key => byKey.get(key)?.removeFromParent());
      root.userData.kamDeletedPartKeys = [...deleted];
      root.updateMatrixWorld(true);
    }

    function serializePartOverrides(root) {
      return allRootMeshes(root).map((mesh, meshIndex) => ({
        meshIndex,
        partKey: mesh.userData.kamPartKey || null,
        name: mesh.name,
        position: mesh.position.toArray(),
        quaternion: mesh.quaternion.toArray(),
        scale: mesh.scale.toArray(),
        visible: mesh.visible,
        materials: (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(material => {
          const managed = material?.userData?.kamTextureManaged || {};
          const maps = {};
          ['map','normalMap','roughnessMap','metalnessMap'].forEach(key => {
            if (!managed[key]) return;
            const texture = material[key];
            maps[key] = texture ? {
              textureId: texture.userData.kamTextureId || null,
              repeat: texture.repeat.toArray(),
              offset: texture.offset.toArray(),
              center: texture.center.toArray(),
              rotation: texture.rotation
            } : null;
          });
          return {
            color: material?.color ? `#${material.color.getHexString()}` : null,
            roughness: Number.isFinite(material?.roughness) ? material.roughness : null,
            metalness: Number.isFinite(material?.metalness) ? material.metalness : null,
            opacity: material?.opacity ?? 1,
            transparent: Boolean(material?.transparent),
            normalScale: material?.normalScale?.toArray?.() || null,
            maps
          };
        })
      }));
    }

    function restorePartOverrides(root, savedParts) {
      if (!Array.isArray(savedParts)) return;
      const meshes = allRootMeshes(root);
      savedParts.forEach((saved, index) => {
        const mesh = meshes.find(part => saved.partKey && part.userData.kamPartKey === saved.partKey) || meshes[saved.meshIndex ?? index];
        if (!mesh) return;
        if (saved.name) mesh.name = saved.name;
        if (saved.position) mesh.position.fromArray(saved.position);
        if (saved.quaternion) mesh.quaternion.fromArray(saved.quaternion);
        if (saved.scale) mesh.scale.fromArray(saved.scale);
        mesh.visible = saved.visible !== false;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        (saved.materials || []).forEach((materialData, materialIndex) => {
          const material = materials[materialIndex];
          if (!material) return;
          if (materialData.color && material.color) material.color.set(materialData.color);
          if (Number.isFinite(materialData.roughness)) material.roughness = materialData.roughness;
          if (Number.isFinite(materialData.metalness)) material.metalness = materialData.metalness;
          material.opacity = materialData.opacity ?? 1;
          material.transparent = Boolean(materialData.transparent);
          if (materialData.normalScale && material.normalScale) material.normalScale.fromArray(materialData.normalScale);
          Object.entries(materialData.maps || {}).forEach(([key, mapData]) => {
            material.userData.kamTextureManaged ||= {};
            material.userData.kamTextureManaged[key] = true;
            if (!mapData) { material[key] = null; return; }
            const asset = textureAssets.get(mapData.textureId);
            const baseTexture = asset?.texture || material[key];
            if (!baseTexture) return;
            const texture = configureTexture(baseTexture.clone(), key);
            if (asset) texture.userData.kamTextureId = asset.id;
            if (mapData.repeat) texture.repeat.fromArray(mapData.repeat);
            if (mapData.offset) texture.offset.fromArray(mapData.offset);
            if (mapData.center) texture.center.fromArray(mapData.center);
            texture.rotation = mapData.rotation || 0;
            texture.needsUpdate = true;
            material[key] = texture;
          });
          material.needsUpdate = true;
        });
        mesh.updateMatrix();
      });
      root.updateMatrixWorld(true);
    }

    function applyMaterialColors(root, colors) {
      let index = 0;
      root.traverse(object => {
        if (!object.isMesh) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(material => {
          const color = colors[index++];
          if (color && material?.color) material.color.set(color);
        });
      });
    }

    function applyProjectWorld(world) {
      const savedBackground = typeof world.background === 'string' ? { mode: 'solid', solid: world.background, fogColor: world.background } : (world.background || {});
      state.background = { ...state.background, ...savedBackground };
      $$('#backgroundModeSegment button').forEach(button => button.classList.toggle('active', button.dataset.mode === state.background.mode));
      $('#backgroundInput').value = state.background.solid;
      $('#gradientTopInput').value = state.background.top;
      $('#gradientBottomInput').value = state.background.bottom;
      $('#gradientHorizonInput').value = state.background.horizon;
      $('#gradientHorizonValue').textContent = `${state.background.horizon}%`;
      $('#fogEnabledInput').checked = state.background.fogEnabled;
      $('#fogColorInput').value = state.background.fogColor;
      $('#fogMatchInput').checked = state.background.fogMatch;
      $('#fogNearInput').value = state.background.fogNear;
      $('#fogFarInput').value = state.background.fogFar;
      $('#fogDensityInput').value = state.background.fogDensity;
      $$('#fogTypeSegment button').forEach(button => button.classList.toggle('active', button.dataset.fog === state.background.fogType));
      if (typeof world.gridVisible === 'boolean') state.gridVisible = world.gridVisible;
      if (world.gridSize) $('#gridSizeInput').value = world.gridSize;
      if (world.gridDivisions) $('#gridDivisionsInput').value = world.gridDivisions;
      if (world.gridOpacity) { $('#gridOpacityInput').value = world.gridOpacity; $('#gridOpacityValue').textContent = `${world.gridOpacity}%`; }
      if (typeof world.snapEnabled === 'boolean') state.snapEnabled = world.snapEnabled;
      if (world.moveSnap) state.moveSnap = world.moveSnap;
      if (world.rotateSnap) state.rotateSnap = world.rotateSnap;
      if (world.scaleSnap) state.scaleSnap = world.scaleSnap;
      if (world.smartSnap) Object.assign(state.smartSnap, world.smartSnap, { applying: false });
      if (typeof world.shadows === 'boolean') setShadows(world.shadows);
      const lighting = world.lighting || world;
      state.lighting.preset = lighting.preset || 'neutral';
      $('#lightingPresetInput').value = state.lighting.preset;
      if (Number.isFinite(lighting.ambient)) $('#ambientInput').value = lighting.ambient;
      if (lighting.skyColor) $('#ambientSkyInput').value = lighting.skyColor;
      if (lighting.groundColor) $('#ambientGroundInput').value = lighting.groundColor;
      if (Number.isFinite(lighting.key)) $('#keyInput').value = lighting.key;
      if (lighting.keyColor) $('#keyColorInput').value = lighting.keyColor;
      if (Number.isFinite(lighting.lightElevation)) $('#lightElevationInput').value = lighting.lightElevation;
      if (Number.isFinite(lighting.lightAzimuth)) $('#lightAzimuthInput').value = lighting.lightAzimuth;
      if (typeof lighting.fillEnabled === 'boolean') $('#fillEnabledInput').checked = lighting.fillEnabled;
      if (Number.isFinite(lighting.fill)) $('#fillInput').value = lighting.fill;
      if (lighting.fillColor) $('#fillColorInput').value = lighting.fillColor;
      if (typeof lighting.rimEnabled === 'boolean') $('#rimEnabledInput').checked = lighting.rimEnabled;
      if (Number.isFinite(lighting.rim)) $('#rimInput').value = lighting.rim;
      if (lighting.rimColor) $('#rimColorInput').value = lighting.rimColor;
      if (Number.isFinite(lighting.exposure)) $('#exposureInput').value = lighting.exposure;
      if (lighting.toneMapping) $('#toneMappingInput').value = lighting.toneMapping;
      $('#moveSnapInput').value = state.moveSnap;
      $('#rotateSnapInput').value = state.rotateSnap;
      $('#scaleSnapInput').value = state.scaleSnap;
      $('#smartSnapEnabledInput').checked = state.smartSnap.enabled;
      $('#alignmentGuidesInput').checked = state.smartSnap.guides;
      $('#snapEdgesInput').checked = state.smartSnap.edges;
      $('#snapCentersInput').checked = state.smartSnap.centers;
      $('#smartSnapDistanceInput').value = state.smartSnap.distance;
      $('#snapEnabledInput').checked = state.snapEnabled;
      $('#gridVisibleInput').checked = state.gridVisible;
      grid.visible = state.gridVisible;
      rebuildGrid();
      updateSceneBackground();
      syncLightingFromUI();
      updateTransformControls();
    }

    function arrayBufferToBase64(buffer) {
      const bytes = new Uint8Array(buffer);
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
      return btoa(binary);
    }

    function base64ToArrayBuffer(base64) {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes.buffer;
    }

    function downloadBlob(blob, filename) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    }

    function clearWorkspace(ask = true) {
      if (ask && (instanceRegistry.size || lightRegistry.size || assets.size) && !confirm('Clear all models, lights and the asset library? This can be undone only by reopening a saved project.')) return false;
      if (state.uiReady) { panelManager.close('mesh-edit'); panelManager.close('tiling'); panelManager.close('area-array'); panelManager.close('select-area'); panelManager.close('paint'); }
      selection.clear();
      [...instanceRegistry].forEach(object => object.removeFromParent());
      instanceRegistry.clear();
      editableMeshStore.clear();
      [...lightRegistry].forEach(object => detachLightEntity(object));
      lightRegistry.clear();
      lightHelpers.forEach(editor => { editor.helper?.removeFromParent(); editor.range?.removeFromParent(); editor.direction?.removeFromParent(); });
      lightHelpers.clear();
      assets.clear();
      assetUsage.clear();
      state.objectManagerExpanded.clear();
      [...textureAssets.values()].filter(asset => !asset.builtin).forEach(asset => { asset.texture.dispose(); textureAssets.delete(asset.id); });
      state.selectedTextureId = textureAssets.keys().next().value || null;
      renderTextureLibrary();
      $$('.asset-card').forEach(card => card.remove());
      history.clear();
      updateAllUI();
      return true;
    }

    function getFilesFromDataTransfer(dataTransfer) {
      const items = [...(dataTransfer.items || [])];
      const entries = items.map(item => item.webkitGetAsEntry?.()).filter(Boolean);
      if (!entries.length) return Promise.resolve([...(dataTransfer.files || [])]);
      return Promise.all(entries.map(readEntry)).then(groups => groups.flat(Infinity));
    }

    async function readEntry(entry) {
      if (entry.isFile) return new Promise((resolve, reject) => entry.file(resolve, reject));
      if (!entry.isDirectory) return [];
      const reader = entry.createReader();
      const all = [];
      while (true) {
        const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
        if (!batch.length) break;
        all.push(...await Promise.all(batch.map(readEntry)));
      }
      return all.flat(Infinity);
    }

    function resetDropCopy() {
      $('#dropTitle').textContent = 'Drop GLB files to import';
      $('#dropSubtitle').textContent = 'Multiple files and folders are supported';
    }

    window.addEventListener('dragenter', event => {
      event.preventDefault();
      state.dragDepth++;
      if (!state.dragAssetId) $('#dropOverlay').classList.add('visible');
    });
    window.addEventListener('dragover', event => {
      event.preventDefault();
      event.dataTransfer.dropEffect = state.dragAssetId ? 'copy' : 'copy';
      if (state.dragAssetId) {
        $('#dropOverlay').classList.remove('visible');
        updateGhost(event.clientX, event.clientY);
      }
    });
    window.addEventListener('dragleave', event => {
      event.preventDefault();
      state.dragDepth = Math.max(0, state.dragDepth - 1);
      if (!state.dragDepth && !state.dragAssetId) $('#dropOverlay').classList.remove('visible');
    });
    window.addEventListener('drop', async event => {
      event.preventDefault();
      state.dragDepth = 0;
      $('#dropOverlay').classList.remove('visible');
      if (state.dragAssetId) {
        const point = state.ghostPoint.clone();
        const assetId = state.dragAssetId;
        cleanupGhost();
        state.dragAssetId = null;
        placeAsset(assetId, point);
        resetDropCopy();
        return;
      }
      const files = await getFilesFromDataTransfer(event.dataTransfer);
      await importFiles(files);
      resetDropCopy();
    });

    function setArraySource(tool, mode) {
      state[tool].source = mode;
      const segmentId = tool === 'tiling' ? 'tilingSourceSegment' : 'areaSourceSegment';
      $$(`#${segmentId} button`).forEach(button => button.classList.toggle('active', button.dataset.source === mode));
      tool === 'tiling' ? refreshTilingPreview() : refreshAreaPreview();
    }

    function chooseDefaultArraySource(tool) {
      const mode = selection.items().length ? 'selected' : state.selectedAssetId && assets.has(state.selectedAssetId) ? 'library' : state[tool].source;
      state[tool].source = mode;
      const segmentId = tool === 'tiling' ? 'tilingSourceSegment' : 'areaSourceSegment';
      $$(`#${segmentId} button`).forEach(button => button.classList.toggle('active', button.dataset.source === mode));
    }

    const panelManager = {
      panels: new Map($$('.floating-panel').map(panel => [panel.dataset.panel, panel])),
      buttons: new Map([
        ['mesh-edit', $('#meshEditBtn')], ['select-area', $('#selectAreaBtn')], ['paint', $('#paintBtn')], ['tiling', $('#tilingBtn')], ['area-array', $('#areaArrayBtn')], ['camera', $('#cameraBtn')], ['lighting', $('#lightingBtn')],
        ['object-manager', $('#objectManagerBtn')], ['palette', $('#paletteBtn')], ['textures', $('#textureBtn')], ['import', $('#importBtn')], ['export', $('#exportBtn')], ['manifest', $('#manifestBtn')],
        ['settings', $('#settingsBtn')]
      ]),
      z: 300,
      open(name) {
        const panel = this.panels.get(name);
        if (!panel) return;
        if (['tiling','area-array','select-area','paint'].includes(name) && partSelection?.items().length) setSelectionScope('object');
        if (['select-area','area-array','paint'].includes(name) && state.meshEdit.active) this.close('mesh-edit');
        if (name === 'select-area') { this.close('area-array'); this.close('paint'); }
        if (name === 'area-array') { this.close('select-area'); this.close('paint'); }
        if (name === 'paint') { this.close('select-area'); this.close('area-array'); }
        panel.classList.add('open');
        this.buttons.get(name)?.classList.add('active');
        this.focus(panel);
        keepPanelInViewport(panel);
        if (name === 'tiling') { chooseDefaultArraySource('tiling'); refreshTilingPreview(); }
        if (name === 'area-array') { chooseDefaultArraySource('areaArray'); startAreaTool('array'); }
        if (name === 'select-area') { startAreaTool('select'); startAreaRedraw(); }
        if (name === 'paint') startPaintTool();
        if (name === 'mesh-edit') updateMeshEditUI();
        if (name === 'object-manager') refreshObjectManager();
        if (name === 'textures') { renderTextureLibrary(); updateTextureTargetUI(); }
        if (['position','rotation','scale'].includes(name)) updateTransformInputs();
        if (name === 'manifest') updateManifestCount();
      },
      toggle(name) {
        const panel = this.panels.get(name);
        if (!panel) return;
        panel.classList.contains('open') ? this.close(name) : this.open(name);
      },
      close(name) {
        this.panels.get(name)?.classList.remove('open');
        this.buttons.get(name)?.classList.remove('active');
        if (name === 'tiling') { clearPreviewGroup(tilingPreviewGroup); state.tiling.placements = []; $('#tilingPreviewCount').textContent = '0 copies'; }
        if (name === 'area-array') stopAreaTool('array');
        if (name === 'select-area') stopAreaTool('select');
        if (name === 'paint') stopPaintTool();
        if (name === 'mesh-edit') exitMeshEditMode();
      },
      focus(panel) { panel.style.zIndex = String(++this.z); }
    };

    panelManager.panels.forEach((panel, name) => {
      $('.panel-close', panel).addEventListener('click', () => panelManager.close(name));
      panel.addEventListener('pointerdown', () => panelManager.focus(panel));
      makeDraggable(panel);
    });

    function makeDraggable(panel) {
      const handle = $('.panel-head', panel);
      handle.addEventListener('pointerdown', event => {
        if (event.target.closest('button')) return;
        event.preventDefault();
        panelManager.focus(panel);
        const rect = panel.getBoundingClientRect();
        const start = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
        handle.setPointerCapture(event.pointerId);
        const move = moveEvent => {
          const left = clamp(start.left + moveEvent.clientX - start.x, 6, window.innerWidth - panel.offsetWidth - 6);
          const top = clamp(start.top + moveEvent.clientY - start.y, 54, window.innerHeight - 46);
          panel.style.left = `${left}px`;
          panel.style.right = 'auto';
          panel.style.top = `${top}px`;
        };
        const up = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); };
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', up);
      });
    }

    function keepPanelInViewport(panel) {
      requestAnimationFrame(() => {
        const rect = panel.getBoundingClientRect();
        if (rect.right > window.innerWidth - 6) { panel.style.left = `${Math.max(6, window.innerWidth - rect.width - 6)}px`; panel.style.right = 'auto'; }
        if (rect.left < 6) { panel.style.left = '6px'; panel.style.right = 'auto'; }
        if (rect.top < 54) panel.style.top = '54px';
      });
    }

    function bindToggleButton(buttonId, stateKey, onChange) {
      const button = $(`#${buttonId}`);
      button.addEventListener('click', () => {
        state[stateKey] = !state[stateKey];
        syncToggle(buttonId, state[stateKey]);
        onChange?.(state[stateKey]);
      });
    }

    function syncToggle(buttonId, enabled) { $(`#${buttonId}`).classList.toggle('active', Boolean(enabled)); }

    function bindPanelButton(buttonId, panelName) { $(`#${buttonId}`).addEventListener('click', () => panelManager.toggle(panelName)); }

    $('#selectBtn').addEventListener('click', () => {
      state.selectionEnabled = true;
      syncToggle('selectBtn', true);
      panelManager.toggle('selection');
    });
    [['moveBtn','translate'], ['rotateBtn','rotate'], ['scaleBtn','scale']].forEach(([buttonId, mode]) => {
      $(`#${buttonId}`).addEventListener('click', () => {
        const panelName = mode === 'translate' ? 'position' : mode === 'rotate' ? 'rotation' : 'scale';
        const panelOpen = panelManager.panels.get(panelName)?.classList.contains('open');
        if (state.transformEnabled[mode] && !panelOpen) {
          panelManager.open(panelName);
          updateTransformControls();
          return;
        }
        state.transformEnabled[mode] = !state.transformEnabled[mode];
        syncToggle(buttonId, state.transformEnabled[mode]);
        state.transformEnabled[mode] ? panelManager.open(panelName) : panelManager.close(panelName);
        updateTransformControls();
      });
    });
    $$('#selectionScopeSegment button').forEach(button => button.addEventListener('click', () => setSelectionScope(button.dataset.selectionScope)));
    $('#gridBtn').addEventListener('click', event => {
      if (event.detail > 1) return;
      state.gridVisible = !state.gridVisible;
      grid.visible = state.gridVisible;
      $('#gridVisibleInput').checked = state.gridVisible;
      syncToggle('gridBtn', state.gridVisible);
    });
    $('#gridBtn').addEventListener('dblclick', event => { event.preventDefault(); state.gridVisible = true; grid.visible = true; $('#gridVisibleInput').checked = true; syncToggle('gridBtn', true); panelManager.open('grid'); });
    $('#snapBtn').addEventListener('click', event => {
      if (event.detail > 1) return;
      state.snapEnabled = !state.snapEnabled;
      $('#snapEnabledInput').checked = state.snapEnabled;
      syncToggle('snapBtn', state.snapEnabled);
      if (!state.snapEnabled) clearAlignmentGuides();
      updateTransformControls();
    });
    $('#snapBtn').addEventListener('dblclick', event => { event.preventDefault(); state.snapEnabled = true; $('#snapEnabledInput').checked = true; syncToggle('snapBtn', true); updateTransformControls(); panelManager.open('snapping'); });
    $('#shadowsBtn').addEventListener('click', event => { if (event.detail > 1) return; setShadows(!state.shadows); });
    $('#shadowsBtn').addEventListener('dblclick', event => { event.preventDefault(); setShadows(true); panelManager.open('shadows'); });
    $('#multiBtn').addEventListener('click', () => { state.multiSelect = !state.multiSelect; syncToggle('multiBtn', state.multiSelect); });
    $('#duplicateBtn').addEventListener('click', duplicateSelection);
    $('#deleteBtn').addEventListener('click', deleteSelection);
    $('#undoBtn').addEventListener('click', () => history.undo());
    $('#redoBtn').addEventListener('click', () => history.redo());
    $('#tilingBtn').addEventListener('click', () => panelManager.toggle('tiling'));
    $('#areaArrayBtn').addEventListener('click', () => panelManager.toggle('area-array'));
    $('#selectAreaBtn').addEventListener('click', () => panelManager.toggle('select-area'));
    $('#paintBtn').addEventListener('click', () => panelManager.toggle('paint'));
    $('#meshEditBtn').addEventListener('click', () => panelManager.toggle('mesh-edit'));
    $('#objectManagerBtn').addEventListener('click', () => panelManager.toggle('object-manager'));
    bindPanelButton('cameraBtn', 'camera');
    bindPanelButton('lightingBtn', 'lighting');
    bindPanelButton('paletteBtn', 'palette');
    bindPanelButton('textureBtn', 'textures');
    bindPanelButton('importBtn', 'import');
    bindPanelButton('exportBtn', 'export');
    bindPanelButton('manifestBtn', 'manifest');
    bindPanelButton('settingsBtn', 'settings');

    $('#gridVisibleInput').addEventListener('change', event => { state.gridVisible = event.target.checked; grid.visible = state.gridVisible; syncToggle('gridBtn', state.gridVisible); });
    ['gridSizeInput','gridDivisionsInput'].forEach(id => $(`#${id}`).addEventListener('change', rebuildGrid));
    $('#gridOpacityInput').addEventListener('input', event => { $('#gridOpacityValue').textContent = `${event.target.value}%`; grid.material.opacity = Number(event.target.value) / 100; });
    $('#resetGridBtn').addEventListener('click', () => { $('#gridSizeInput').value = 1000; $('#gridDivisionsInput').value = 1000; $('#gridOpacityInput').value = 42; $('#gridOpacityValue').textContent = '42%'; state.gridVisible = true; $('#gridVisibleInput').checked = true; syncToggle('gridBtn', true); rebuildGrid(); });
    $('#convertEditableMeshBtn').addEventListener('click', convertSelectedToEditable);
    $('#toggleMeshEditModeBtn').addEventListener('click', toggleMeshEditMode);
    $('#clearMeshSelectionBtn').addEventListener('click', clearMeshFaceSelection);
    $('#extrudeMeshFacesBtn').addEventListener('click', extrudeSelectedMeshFaces);
    $$('#meshSelectionModeSegment button').forEach(button => button.addEventListener('click', () => {
      state.meshEdit.selectionMode = button.dataset.meshSelection;
      $$('#meshSelectionModeSegment button').forEach(item => item.classList.toggle('active', item === button));
      clearMeshFaceSelection();
    }));
    $('#applyTilingBtn').addEventListener('click', applyTiling);
    $$('#tilingSourceSegment button').forEach(button => button.addEventListener('click', () => setArraySource('tiling', button.dataset.source)));
    $$('#areaSourceSegment button').forEach(button => button.addEventListener('click', () => setArraySource('areaArray', button.dataset.source)));
    $$('#tilingTypeSegment button').forEach(button => button.addEventListener('click', () => {
      state.tiling.type = button.dataset.arrayType;
      $$('#tilingTypeSegment button').forEach(item => item.classList.toggle('active', item === button));
      $('#tilingGridFields').classList.toggle('hidden', state.tiling.type !== 'grid');
      $('#tilingRadialFields').classList.toggle('hidden', state.tiling.type !== 'radial');
      refreshTilingPreview();
    }));
    ['tileXInput','tileYInput','tileZInput','tileGapXInput','tileGapYInput','tileGapZInput','tileOffsetXInput','tileOffsetYInput','tileOffsetZInput','tileLayerOffsetXInput','tileLayerOffsetZInput','radialCountInput','radialRadiusInput','radialSpacingInput','radialOffsetInput','tileSeqPositionXInput','tileSeqPositionYInput','tileSeqPositionZInput','tileSeqRotationXInput','tileSeqRotationYInput','tileSeqRotationZInput','tileSeqScaleXInput','tileSeqScaleYInput','tileSeqScaleZInput'].forEach(id => $(`#${id}`).addEventListener('input', refreshTilingPreview));
    ['radialFaceCenterInput','tileAlternateLayerInput'].forEach(id => $(`#${id}`).addEventListener('change', refreshTilingPreview));
    [['tileDirectionXSegment','directionX'], ['tileDirectionYSegment','directionY'], ['tileDirectionZSegment','directionZ']].forEach(([segmentId, key]) => {
      $$(`#${segmentId} button`).forEach(button => button.addEventListener('click', () => {
        state.tiling[key] = button.dataset.direction;
        $$(`#${segmentId} button`).forEach(item => item.classList.toggle('active', item === button));
        refreshTilingPreview();
      }));
    });
    $$('#areaFillSegment button').forEach(button => button.addEventListener('click', () => {
      state.areaArray.fill = button.dataset.fill;
      $$('#areaFillSegment button').forEach(item => item.classList.toggle('active', item === button));
      $('#areaSpacingFields').classList.toggle('hidden', state.areaArray.fill !== 'spacing');
      $('#areaCountFields').classList.toggle('hidden', state.areaArray.fill !== 'count');
      refreshAreaPreview();
    }));
    ['areaSpacingXInput','areaSpacingYInput','areaSpacingZInput','areaColumnsInput','areaRowsInput','areaCountYInput','areaMarginInput','areaRotationInput','areaWidthInput','areaDepthInput','areaOffsetXInput','areaOffsetYInput','areaOffsetZInput','areaLayerOffsetXInput','areaLayerOffsetZInput','areaSeqPositionXInput','areaSeqPositionYInput','areaSeqPositionZInput','areaSeqRotationXInput','areaSeqRotationYInput','areaSeqRotationZInput','areaSeqScaleXInput','areaSeqScaleYInput','areaSeqScaleZInput'].forEach(id => $(`#${id}`).addEventListener('input', refreshAreaPreview));
    $('#areaAlternateLayerInput').addEventListener('change', refreshAreaPreview);
    $$('#areaDirectionYSegment button').forEach(button => button.addEventListener('click', () => {
      state.areaArray.directionY = button.dataset.direction;
      $$('#areaDirectionYSegment button').forEach(item => item.classList.toggle('active', item === button));
      refreshAreaPreview();
    }));
    $('#drawAreaBtn').addEventListener('click', startAreaRedraw);
    $('#drawSelectionAreaBtn').addEventListener('click', startAreaRedraw);
    $('#applyAreaArrayBtn').addEventListener('click', applyAreaArray);
    $$('#areaSelectionModeSegment button').forEach(button => button.addEventListener('click', () => {
      state.areaArray.selectionMode = button.dataset.selectionMode;
      $$('#areaSelectionModeSegment button').forEach(item => item.classList.toggle('active', item === button));
      updateAreaSelectionCandidates();
    }));
    $$('#areaReplacementSourceSegment button').forEach(button => button.addEventListener('click', () => {
      state.areaArray.replacementSource = button.dataset.source;
      $$('#areaReplacementSourceSegment button').forEach(item => item.classList.toggle('active', item === button));
      updateAreaReplacementUI();
    }));
    $$('#areaInclusionSegment button').forEach(button => button.addEventListener('click', () => {
      state.areaArray.inclusion = button.dataset.inclusion;
      $$('#areaInclusionSegment button').forEach(item => item.classList.toggle('active', item === button));
      updateAreaSelectionCandidates();
    }));
    $('#selectAreaObjectsBtn').addEventListener('click', applyAreaObjectOperation);
    $$('#paintModeSegment button').forEach(button => button.addEventListener('click', () => {
      state.paint.mode = button.dataset.paintMode;
      $$('#paintModeSegment button').forEach(item => item.classList.toggle('active', item === button));
      clearPaintErasePreview();
      updatePaintSourceUI();
    }));
    $$('#paintSourceSegment button').forEach(button => button.addEventListener('click', () => {
      state.paint.source = button.dataset.source;
      $$('#paintSourceSegment button').forEach(item => item.classList.toggle('active', item === button));
      updatePaintSourceUI();
    }));
    $$('#paintEraseTargetSegment button').forEach(button => button.addEventListener('click', () => {
      state.paint.eraseTarget = button.dataset.eraseTarget;
      $$('#paintEraseTargetSegment button').forEach(item => item.classList.toggle('active', item === button));
      clearPaintErasePreview();
      updatePaintSourceUI();
    }));
    $$('#paintSurfaceSegment button').forEach(button => button.addEventListener('click', () => {
      state.paint.surface = button.dataset.surface;
      $$('#paintSurfaceSegment button').forEach(item => item.classList.toggle('active', item === button));
      paintGuide.visible = false;
    }));
    $('#paintRadiusInput').addEventListener('input', () => { if (paintGuide.visible) paintGuide.scale.setScalar(paintRadius()); });
    $('#objectSearchInput').addEventListener('input', refreshObjectManager);
    $('#groupObjectsBtn').addEventListener('click', groupSelectedObjects);
    $('#ungroupObjectsBtn').addEventListener('click', ungroupSelectedObjects);
    $('#showAllObjectsBtn').addEventListener('click', () => {
      const objects = sceneEntities().filter(object => !object.visible);
      if (!objects.length) return;
      objects.forEach(object => { object.visible = true; });
      refreshObjectManager();
      history.push({ label: `Show ${objects.length} objects`, undo: () => { objects.forEach(object => { object.visible = false; }); selection.clear(); refreshObjectManager(); }, redo: () => { objects.forEach(object => { object.visible = true; }); refreshObjectManager(); } });
    });
    $('#unlockAllObjectsBtn').addEventListener('click', () => {
      const objects = sceneEntities().filter(object => object.userData.kamLocked);
      if (!objects.length) return;
      objects.forEach(object => { object.userData.kamLocked = false; });
      refreshObjectManager();
      history.push({ label: `Unlock ${objects.length} objects`, undo: () => { objects.forEach(object => { object.userData.kamLocked = true; }); selection.clear(); refreshObjectManager(); }, redo: () => { objects.forEach(object => { object.userData.kamLocked = false; }); refreshObjectManager(); } });
    });
    $('#snapEnabledInput').addEventListener('change', event => { state.snapEnabled = event.target.checked; syncToggle('snapBtn', state.snapEnabled); if (!state.snapEnabled) clearAlignmentGuides(); updateTransformControls(); });
    $('#moveSnapInput').addEventListener('change', event => { state.moveSnap = Math.max(.001, Number(event.target.value) || .5); updateTransformControls(); });
    $('#rotateSnapInput').addEventListener('change', event => { state.rotateSnap = clamp(Number(event.target.value) || 15, 1, 180); updateTransformControls(); });
    $('#scaleSnapInput').addEventListener('change', event => { state.scaleSnap = Math.max(.001, Number(event.target.value) || .1); updateTransformControls(); });
    $('#smartSnapEnabledInput').addEventListener('change', event => { state.smartSnap.enabled = event.target.checked; if (!state.smartSnap.enabled) clearAlignmentGuides(); });
    $('#alignmentGuidesInput').addEventListener('change', event => { state.smartSnap.guides = event.target.checked; if (!state.smartSnap.guides) clearAlignmentGuides(); });
    $('#snapEdgesInput').addEventListener('change', event => { state.smartSnap.edges = event.target.checked; });
    $('#snapCentersInput').addEventListener('change', event => { state.smartSnap.centers = event.target.checked; });
    $('#smartSnapDistanceInput').addEventListener('change', event => { state.smartSnap.distance = clamp(Number(event.target.value) || .35, .01, 10); event.target.value = trimNumber(state.smartSnap.distance); });
    $$('#spaceSegment button').forEach(button => button.addEventListener('click', () => { state.transformSpace = button.dataset.space; $$('#spaceSegment button').forEach(item => item.classList.toggle('active', item === button)); updateTransformControls(); }));
    $$('#cameraTypeSegment button').forEach(button => button.addEventListener('click', () => setCameraType(button.dataset.camera)));
    $$('.view-btn').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
    $('#focusBtn').addEventListener('click', focusSelection);
    $('#fovInput').addEventListener('input', event => { perspectiveCamera.fov = Number(event.target.value); perspectiveCamera.updateProjectionMatrix(); $('#fovValue').textContent = `${event.target.value}°`; });
    $('#shadowsEnabledInput').addEventListener('change', event => setShadows(event.target.checked));
    $('#shadowOpacityInput').addEventListener('input', event => { shadowGround.material.opacity = Number(event.target.value) / 100; $('#shadowOpacityValue').textContent = `${event.target.value}%`; });
    $('#shadowQualityInput').addEventListener('change', event => { const size = Number(event.target.value); keyLight.shadow.mapSize.set(size, size); keyLight.shadow.map?.dispose(); keyLight.shadow.map = null; });
    ['ambientInput','ambientSkyInput','ambientGroundInput','keyInput','keyColorInput','fillInput','fillColorInput','rimInput','rimColorInput','exposureInput'].forEach(id => $(`#${id}`).addEventListener('input', () => { state.lighting.preset = 'custom'; syncLightingFromUI(); }));
    ['fillEnabledInput','rimEnabledInput'].forEach(id => $(`#${id}`).addEventListener('change', () => { state.lighting.preset = 'custom'; syncLightingFromUI(); }));
    ['lightElevationInput','lightAzimuthInput'].forEach(id => $(`#${id}`).addEventListener('input', () => { state.lighting.preset = 'custom'; updateLightingPosition(); }));
    $('#toneMappingInput').addEventListener('change', () => { state.lighting.preset = 'custom'; syncLightingFromUI(); });
    $('#lightingPresetInput').addEventListener('change', event => applyLightingPreset(event.target.value));
    $('#resetLightingBtn').addEventListener('click', () => applyLightingPreset('neutral'));
    $('#addSceneLightBtn').addEventListener('click', () => {
      const light = addSceneLight($('#sceneLightTypeInput').value);
      panelManager.open('lighting');
      toast('Scene light added', `${light.name} is ready to position.`, 'lightbulb');
    });
    const lightEditBefore = new WeakMap();
    const selectedLightRoot = () => selection.items().length === 1 && isLightEntity(selection.items()[0]) ? selection.items()[0] : null;
    function lightPropertiesFromUI() {
      return {
        color: $('#sceneLightColorInput').value,
        intensity: Math.max(0, Number($('#sceneLightIntensityInput').value) || 0),
        range: Math.max(0, Number($('#sceneLightRangeInput').value) || 0),
        decay: clamp(Number($('#sceneLightDecayInput').value) || 0, 0, 4),
        angle: clamp(Number($('#sceneLightAngleInput').value) || 35, 1, 89),
        penumbra: clamp(Number($('#sceneLightPenumbraInput').value) || 0, 0, 1),
        width: Math.max(.05, Number($('#sceneLightWidthInput').value) || .05),
        height: Math.max(.05, Number($('#sceneLightHeightInput').value) || .05),
        castShadow: $('#sceneLightShadowInput').checked,
        shadowSize: Number($('#sceneLightShadowQualityInput').value) || 1024
      };
    }
    const lightPropertyControls = ['sceneLightColorInput','sceneLightIntensityInput','sceneLightRangeInput','sceneLightDecayInput','sceneLightAngleInput','sceneLightPenumbraInput','sceneLightWidthInput','sceneLightHeightInput','sceneLightShadowQualityInput'];
    lightPropertyControls.forEach(id => {
      const control = $(`#${id}`);
      control.addEventListener('input', () => {
        const root = selectedLightRoot(); if (!root) return;
        if (!lightEditBefore.has(control)) lightEditBefore.set(control, lightProperties(root));
        applyLightProperties(root, lightPropertiesFromUI(), false);
        updateLightHelpers();
      });
      control.addEventListener('change', () => {
        const root = selectedLightRoot(); if (!root) return;
        const before = lightEditBefore.get(control) || lightProperties(root);
        applyLightProperties(root, lightPropertiesFromUI(), false);
        const after = lightProperties(root);
        lightEditBefore.delete(control);
        if (JSON.stringify(before) !== JSON.stringify(after)) history.push({ label: `Edit ${root.name}`, undo: () => applyLightProperties(root, before), redo: () => applyLightProperties(root, after) });
        updateSelectedLightPanel(); updateLightHelpers();
      });
    });
    $('#sceneLightShadowInput').addEventListener('change', () => {
      const root = selectedLightRoot(); if (!root) return;
      const before = lightProperties(root);
      applyLightProperties(root, lightPropertiesFromUI(), false);
      const after = lightProperties(root);
      history.push({ label: `${after.castShadow ? 'Enable' : 'Disable'} ${root.name} shadows`, undo: () => applyLightProperties(root, before), redo: () => applyLightProperties(root, after) });
      updateSelectedLightPanel(); updateLightHelpers();
      const shadowLights = [...lightRegistry].filter(item => sceneLightObject(item)?.castShadow).length;
      if (after.castShadow && shadowLights > 4) toast('Many shadow lights', `${shadowLights} local lights now cast shadows and may reduce performance.`, 'triangle-alert');
    });
    $('#customColorInput').addEventListener('input', event => setCurrentColor(event.target.value));
    $('#applyColorBtn').addEventListener('click', applySelectedColor);
    $('#resetColorBtn').addEventListener('click', resetSelectedColors);
    $$('#paletteModeSegment button').forEach(button => button.addEventListener('click', () => {
      state.paletteMode = button.dataset.mode;
      $$('#paletteModeSegment button').forEach(item => item.classList.toggle('active', item === button));
    }));
    $$('#textureChannelSegment button').forEach(button => button.addEventListener('click', () => {
      state.textureChannel = button.dataset.textureChannel;
      $$('#textureChannelSegment button').forEach(item => item.classList.toggle('active', item === button));
      syncMaterialControlsFromSelection();
    }));
    $('#applyTextureBtn').addEventListener('click', () => applyTextureToSelection(false));
    $('#removeTextureBtn').addEventListener('click', () => applyTextureToSelection(true));
    $('#uniformScaleInput').addEventListener('change', event => { state.uniformScale = event.target.checked; });
    $('#chooseTexturesBtn').addEventListener('click', () => openFilePicker($('#textureFileInput')));
    $('#textureFileInput').addEventListener('change', event => importTextureFiles(event.target.files));
    $('#textureDropZone').addEventListener('dragover', event => { event.preventDefault(); event.currentTarget.classList.add('dragover'); });
    $('#textureDropZone').addEventListener('dragleave', event => event.currentTarget.classList.remove('dragover'));
    $('#textureDropZone').addEventListener('drop', event => { event.preventDefault(); event.stopPropagation(); event.currentTarget.classList.remove('dragover'); importTextureFiles(event.dataTransfer.files); });
    $('#textureDropZone').addEventListener('click', () => openFilePicker($('#textureFileInput')));
    $('#exportGlbBtn').addEventListener('click', exportSceneGLB);
    $('#exportManifestBtn').addEventListener('click', exportSceneManifest);
    $('#manifestHiddenInput').addEventListener('change', updateManifestCount);
    ['manifestFormatSegment','manifestUnitsSegment'].forEach(segmentId => {
      $$(`#${segmentId} button`).forEach(button => button.addEventListener('click', () => {
        $$(`#${segmentId} button`).forEach(item => item.classList.toggle('active', item === button));
      }));
    });
    $('#saveProjectBtn').addEventListener('click', saveProject);
    $('#createPrefabBtn').addEventListener('click', createPrefabFromSelection);
    $('#unpackPrefabBtn').addEventListener('click', unpackSelectedPrefabs);
    $$('#prefabPivotSegment button').forEach(button => button.addEventListener('click', () => {
      $$('#prefabPivotSegment button').forEach(item => item.classList.toggle('active', item === button));
    }));
    $('#axesInput').addEventListener('change', event => { axesHelper.visible = event.target.checked; });
    $('#dampingInput').addEventListener('change', event => { orbit.enableDamping = event.target.checked; });
    $('#gizmoSizeInput').addEventListener('input', event => { transformControls.forEach(control => control.setSize(Number(event.target.value))); $('#gizmoSizeValue').textContent = Number(event.target.value).toFixed(1); });
    $$('#backgroundModeSegment button').forEach(button => button.addEventListener('click', () => {
      state.background.mode = button.dataset.mode;
      $$('#backgroundModeSegment button').forEach(item => item.classList.toggle('active', item === button));
      updateSceneBackground();
    }));
    ['backgroundInput','gradientTopInput','gradientBottomInput','gradientHorizonInput'].forEach(id => $(`#${id}`).addEventListener('input', event => {
      if (id === 'gradientHorizonInput') $('#gradientHorizonValue').textContent = `${event.target.value}%`;
      updateSceneBackground();
    }));
    $('#fogEnabledInput').addEventListener('change', updateSceneBackground);
    $('#fogMatchInput').addEventListener('change', updateSceneBackground);
    ['fogColorInput','fogNearInput','fogFarInput','fogDensityInput'].forEach(id => $(`#${id}`).addEventListener('input', updateSceneBackground));
    $$('#fogTypeSegment button').forEach(button => button.addEventListener('click', () => {
      state.background.fogType = button.dataset.fog;
      $$('#fogTypeSegment button').forEach(item => item.classList.toggle('active', item === button));
      updateSceneBackground();
    }));
    $('#clearSceneBtn').addEventListener('click', () => clearWorkspace(true));
    $('#resetViewBtn').addEventListener('click', () => { perspectiveCamera.position.set(12,10,12); orthographicCamera.position.set(12,10,12); orbit.target.set(0,1.5,0); activeCamera.lookAt(orbit.target); orbit.update(); });

    function setCurrentColor(color, sourceButton = null) {
      state.currentColor = color.toLowerCase();
      $('#customColorInput').value = state.currentColor;
      $('#currentColorLabel').textContent = state.currentColor;
      $('#currentColorChip').style.setProperty('--current-color', state.currentColor);
      $$('.swatch').forEach(button => button.classList.toggle('active', button === sourceButton || button.dataset.color?.toLowerCase() === state.currentColor));
    }

    function openFilePicker(input) { input.value = ''; input.click(); }
    $('#shelfImportBtn').addEventListener('click', () => openFilePicker($('#glbFileInput')));
    $('#chooseFilesBtn').addEventListener('click', () => openFilePicker($('#glbFileInput')));
    $('#chooseFolderBtn').addEventListener('click', () => openFilePicker($('#folderInput')));
    $('#openProjectBtn').addEventListener('click', () => openFilePicker($('#projectInput')));
    $('#glbFileInput').addEventListener('change', event => importFiles(event.target.files));
    $('#folderInput').addEventListener('change', event => importFiles(event.target.files));
    $('#projectInput').addEventListener('change', event => openProject(event.target.files[0]));
    $('#panelDropZone').addEventListener('dragover', event => { event.preventDefault(); event.currentTarget.classList.add('dragover'); });
    $('#panelDropZone').addEventListener('dragleave', event => event.currentTarget.classList.remove('dragover'));
    $('#panelDropZone').addEventListener('drop', async event => { event.preventDefault(); event.stopPropagation(); event.currentTarget.classList.remove('dragover'); await importFiles(await getFilesFromDataTransfer(event.dataTransfer)); });
    $('#panelDropZone').addEventListener('click', () => openFilePicker($('#glbFileInput')));

    function trimNumber(value, precision = 4) {
      return String(Number(Number(value).toFixed(precision)));
    }

    function initNumberScrubbers() {
      $$('input[type="number"]').forEach(input => {
        if (input.closest('.number-control')) return;
        input.dataset.defaultValue = input.value;
        const wrapper = document.createElement('div');
        wrapper.className = 'number-control';
        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);
        const scrubber = document.createElement('button');
        scrubber.type = 'button';
        scrubber.className = 'number-scrubber';
        scrubber.title = 'Drag horizontally · Shift precise · Ctrl/Cmd fast · double-click reset';
        scrubber.setAttribute('aria-label', `Adjust ${input.getAttribute('aria-label') || input.id || 'value'}`);
        scrubber.innerHTML = '<i data-lucide="move-horizontal"></i>';
        wrapper.appendChild(scrubber);

        scrubber.addEventListener('pointerdown', event => {
          if (event.detail > 1) return;
          event.preventDefault();
          const startX = event.clientX;
          const startValue = Number(input.value) || 0;
          const step = Math.abs(Number(input.step)) || 1;
          const min = input.min === '' ? -Infinity : Number(input.min);
          const max = input.max === '' ? Infinity : Number(input.max);
          scrubber.classList.add('dragging');
          scrubber.setPointerCapture(event.pointerId);
          const move = moveEvent => {
            const modifier = moveEvent.altKey ? .01 : moveEvent.shiftKey ? .1 : (moveEvent.ctrlKey || moveEvent.metaKey) ? 10 : 1;
            const raw = startValue + ((moveEvent.clientX - startX) / 5) * step * modifier;
            const value = clamp(raw, min, max);
            input.value = trimNumber(value, Math.max(2, String(step).split('.')[1]?.length || 0));
            input.dispatchEvent(new Event('input', { bubbles: true }));
          };
          const up = () => {
            scrubber.classList.remove('dragging');
            scrubber.removeEventListener('pointermove', move);
            scrubber.removeEventListener('pointerup', up);
            input.dispatchEvent(new Event('change', { bubbles: true }));
          };
          scrubber.addEventListener('pointermove', move);
          scrubber.addEventListener('pointerup', up);
        });
        scrubber.addEventListener('dblclick', event => {
          event.preventDefault();
          input.value = input.dataset.defaultValue;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });
    }

    document.addEventListener('keydown', event => {
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (mod && key === 'f') {
        event.preventDefault();
        const input = $('[data-panel="object-manager"]')?.classList.contains('open') ? $('#objectSearchInput') : $('#assetSearchInput');
        input.focus(); input.select(); return;
      }
      if (event.target.matches('input, select, textarea') || event.repeat) return;
      if (mod && key === 'z') { event.preventDefault(); event.shiftKey ? history.redo() : history.undo(); return; }
      if (mod && key === 'y') { event.preventDefault(); history.redo(); return; }
      if (state.meshEdit.active && mod && key === 'd') { event.preventDefault(); return; }
      if (mod && key === 'd') { event.preventDefault(); duplicateSelection(); return; }
      if (state.meshEdit.active && (key === 'delete' || key === 'backspace')) { event.preventDefault(); clearMeshFaceSelection(); return; }
      if (key === 'delete' || key === 'backspace') { event.preventDefault(); deleteSelection(); return; }
      if (key === 'escape' && state.meshEdit.active) { exitMeshEditMode(); return; }
      if (key === 'escape' && state.areaArray.active && (state.areaArray.mode === 'armed' || state.areaArray.mode === 'drawing')) { cancelAreaRedraw(); return; }
      if (key === 'escape' && partSelection.items().length) { partSelection.clear(); return; }
      if (key === 'escape') { selection.clear(); panelManager.panels.forEach((_, name) => panelManager.close(name)); return; }
      if (key === 'f') { focusSelection(); return; }
      if (key === 'q') { $('#selectBtn').click(); return; }
      const modeKeys = { w: ['moveBtn','translate'], e: ['rotateBtn','rotate'], r: ['scaleBtn','scale'] };
      if (modeKeys[key]) {
        const [buttonId, mode] = modeKeys[key];
        state.transformEnabled[mode] = !state.transformEnabled[mode];
        syncToggle(buttonId, state.transformEnabled[mode]);
        const panelName = mode === 'translate' ? 'position' : mode === 'rotate' ? 'rotation' : 'scale';
        state.transformEnabled[mode] ? panelManager.open(panelName) : panelManager.close(panelName);
        updateTransformControls();
      }
    });

    function updateHistoryButtons() { $('#undoBtn').disabled = !history.undoStack.length; $('#redoBtn').disabled = !history.redoStack.length; }
    function updateToolAvailability() {
      const disabled = !selection.selected.length;
      const selectedModels = modelSelection();
      const modelsOnly = selectedModels.length && selectedModels.length === selection.selected.length;
      const partsSelected = Boolean(partSelection?.items().length);
      $('#duplicateBtn').disabled = disabled || state.meshEdit.active || (partsSelected && partSelection.items().some(part => part.isSkinnedMesh || part.morphTargetInfluences?.length));
      $('#deleteBtn').disabled = disabled || state.meshEdit.active;
      $('#applyColorBtn').disabled = !selectedModels.length || state.meshEdit.active;
      $('#resetColorBtn').disabled = !selectedModels.length || state.meshEdit.active;
      $('#applyTextureBtn').disabled = !materialTargetMeshes().length || !state.selectedTextureId || state.meshEdit.active;
      $('#removeTextureBtn').disabled = !materialTargetMeshes().length || state.meshEdit.active;
      $('#createPrefabBtn').disabled = !modelsOnly || state.meshEdit.active || partsSelected;
      $('#unpackPrefabBtn').disabled = partsSelected || !selection.items().some(object => assets.get(object.userData.assetId)?.prefab);
    }
    function updateSelectionBadge() {
      const badge = $('#selectionBadge');
      if (!selection.selected.length) { badge.hidden = true; return; }
      badge.hidden = false;
      const parts = partSelection?.items() || [];
      $('#selectionName').textContent = parts.length
        ? parts.length === 1 ? `${partLabel(parts[0])} · Part` : `${parts.length} parts selected`
        : selection.selected.length === 1 ? selection.selected[0].name : `${selection.selected.length} objects selected`;
    }
    function updateAssetCount() { filterAssetCards(); }
    function updateStats() {
      const selectedCount = partSelection?.items().length || selection.selected.length;
      $('#sceneStats').textContent = `${instanceRegistry.size} model${instanceRegistry.size === 1 ? '' : 's'} · ${lightRegistry.size} light${lightRegistry.size === 1 ? '' : 's'} · ${selectedCount} selected`;
      refreshObjectManager(); updateManifestCount();
    }
    function updateEmptyState() { $('#emptyState').classList.toggle('off', assets.size > 0 || instanceRegistry.size > 0 || lightRegistry.size > 0); }
    function updateAssetUsageBadges() {
      const counts = new Map();
      instanceRegistry.forEach(object => counts.set(object.userData.assetId, (counts.get(object.userData.assetId) || 0) + 1));
      $$('.asset-card').forEach(card => { $('.asset-uses', card).textContent = counts.get(card.dataset.assetId) || 0; });
    }
    function updateAllUI() { updateAssetCount(); updateAssetUsageBadges(); updateStats(); updateEmptyState(); updateSelectionBadge(); updateToolAvailability(); updateHistoryButtons(); updateMeshEditUI(); updateTransformInputs(); updateTextureTargetUI(); }

    function toast(title, message, icon = 'info') {
      const element = document.createElement('div');
      element.className = 'toast';
      element.innerHTML = `<i data-lucide="${icon}"></i><div><strong></strong><span></span></div>`;
      $('strong', element).textContent = title;
      $('span', element).textContent = message;
      $('#toastStack').appendChild(element);
      window.lucide?.createIcons?.({ attrs: { 'stroke-width': 1.8 } });
      setTimeout(() => { element.classList.add('out'); setTimeout(() => element.remove(), 200); }, 3300);
    }

    function setBusy(visible, title = 'Working…', detail = 'Please wait') {
      $('#busyOverlay').hidden = !visible;
      $('#busyTitle').textContent = title;
      $('#busyDetail').textContent = detail;
    }

    function stripExtension(name) { return name.replace(/\.[^.]+$/, ''); }
    function dateStamp() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }

    function initCursorTooltip() {
      const tooltip = $('#cursorTooltip');
      let target = null;
      const position = event => {
        const width = tooltip.offsetWidth || 120;
        const height = tooltip.offsetHeight || 24;
        const x = Math.min(event.clientX, window.innerWidth - width - 16);
        const y = event.clientY + height + 20 > window.innerHeight ? event.clientY - height - 18 : event.clientY;
        tooltip.style.left = `${Math.max(4, x)}px`;
        tooltip.style.top = `${Math.max(4, y)}px`;
      };
      document.addEventListener('pointerover', event => {
        const next = event.target.closest?.('[data-tooltip]');
        if (!next || next === target) return;
        target = next;
        tooltip.textContent = next.dataset.tooltip || next.getAttribute('aria-label') || '';
        position(event);
        tooltip.classList.toggle('visible', Boolean(tooltip.textContent));
      });
      document.addEventListener('pointermove', event => {
        if (!target) return;
        if (!target.matches(':hover')) { target = null; tooltip.classList.remove('visible'); return; }
        position(event);
      });
      document.addEventListener('pointerout', event => {
        if (!target || event.relatedTarget?.closest?.('[data-tooltip]') === target) return;
        if (!target.contains(event.relatedTarget)) { target = null; tooltip.classList.remove('visible'); }
      });
      window.addEventListener('blur', () => { target = null; tooltip.classList.remove('visible'); });
    }

    function onResize() {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      updateCameraProjection();
      panelManager.panels.forEach(panel => { if (panel.classList.contains('open')) keepPanelInViewport(panel); });
    }
    window.addEventListener('resize', onResize);

    function animate() {
      requestAnimationFrame(animate);
      orbit.update();
      selection.updateHelpers();
      updateLightHelpers();
      renderer.render(scene, activeCamera);
    }

    initNumberScrubbers();
    bindTransformInputs();
    bindMaterialControls();
    initAssetShelf();
    initColorPalette();
    initTextureLibrary();
    initCursorTooltip();
    window.lucide?.createIcons?.({ attrs: { 'stroke-width': 1.8 } });
    state.uiReady = true;
    updateSceneBackground();
    syncLightingFromUI();
    updateCameraProjection();
    updateTransformControls();
    updateAllUI();
    animate();
    window.__KAM3D_WB_READY__ = true;
    toast('KAM3D Live Editor ready', 'Drop GLB models or a folder to begin building.', 'box');
