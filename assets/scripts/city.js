(function init3DCity() {
    const container = document.getElementById('city-canvas-container');
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: "high-performance"
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    if (container.clientWidth > 800) {
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    container.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(25, container.clientWidth / container.clientHeight, 1, 500);
    camera.position.set(0, 13, 16);

    const scene = new THREE.Scene();
    const city = new THREE.Object3D();
    const smoke = new THREE.Object3D();
    const town = new THREE.Object3D();

    scene.add(city);
    city.add(smoke);
    city.add(town);

    const baseColor = new THREE.Color(0xF02050);
    scene.background = baseColor;
    scene.fog = new THREE.FogExp2(baseColor, 0.05);

    function mathRandom(num = 8) {
        return -Math.random() * num + Math.random() * num;
    }

    function buildCity() {
        const segments = 2;
        const buildingMat = new THREE.MeshStandardMaterial({
            color: 0x0a0a0a,
            roughness: 0.4,
            metalness: 0.8,
            side: THREE.DoubleSide
        });

        const wireframeMat = new THREE.MeshLambertMaterial({
            color: 0xFFFFFF,
            wireframe: true,
            transparent: true,
            opacity: 0.03,
            side: THREE.DoubleSide
        });

        for (let i = 1; i < 120; i++) {
            const geometry = new THREE.BoxGeometry(1, 1, 1, segments, segments, segments);
            const cube = new THREE.Mesh(geometry, buildingMat);
            const wire = new THREE.Mesh(geometry, wireframeMat);
            const floor = new THREE.Mesh(geometry, buildingMat);

            cube.add(wire);
            cube.castShadow = true;
            cube.receiveShadow = true;

            floor.scale.y = 0.05;
            cube.scale.y = 0.1 + Math.abs(mathRandom(8));

            const cubeWidth = 0.9;
            cube.scale.x = cube.scale.z = cubeWidth + mathRandom(1 - cubeWidth);
            cube.position.x = Math.round(mathRandom(6));
            cube.position.z = Math.round(mathRandom(6));

            floor.position.set(cube.position.x, 0, cube.position.z);

            town.add(floor);
            town.add(cube);
        }

        const particleMat = new THREE.MeshToonMaterial({
            color: 0xFFFF00,
            side: THREE.DoubleSide
        });
        const particleGeo = new THREE.CircleGeometry(0.015, 3);

        for (let h = 0; h < 350; h++) {
            const particle = new THREE.Mesh(particleGeo, particleMat);
            particle.position.set(mathRandom(6), mathRandom(6), mathRandom(6));
            particle.rotation.set(mathRandom(), mathRandom(), mathRandom());
            smoke.add(particle);
        }

        const planeMat = new THREE.MeshPhongMaterial({
            color: 0x050505,
            side: THREE.DoubleSide,
            opacity: 0.95,
            transparent: true
        });
        const planeGeo = new THREE.PlaneGeometry(80, 80);
        const plane = new THREE.Mesh(planeGeo, planeMat);
        plane.rotation.x = -Math.PI / 2;
        plane.position.y = -0.001;
        plane.receiveShadow = true;

        city.add(plane);
    }

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    const lightFront = new THREE.SpotLight(0xff2255, 15, 30);
    const lightBack = new THREE.PointLight(0xffffff, 0.8);

    lightFront.position.set(5, 8, 5);
    lightFront.castShadow = true;
    lightFront.shadow.mapSize.width = 2048;
    lightFront.shadow.mapSize.height = 2048;

    lightBack.position.set(0, 6, 0);

    scene.add(ambientLight);
    city.add(lightFront);
    scene.add(lightBack);

    const gridHelper = new THREE.GridHelper(60, 120, 0xFF0055, 0x222222);
    gridHelper.position.y = 0.001;
    city.add(gridHelper);

    function createTraffic() {
        const carMat = new THREE.MeshToonMaterial({
            color: 0xFFFF00
        });
        const carGeo = new THREE.BoxGeometry(1, 0.05, 0.05);

        for (let i = 0; i < 40; i++) {
            const car = new THREE.Mesh(carGeo, carMat);
            const posLimit = 15;
            const isXAxis = i % 2 === 0;

            if (isXAxis) {
                car.position.set(-posLimit, Math.abs(mathRandom(4)), mathRandom(4));
                gsap.to(car.position, {
                    x: posLimit,
                    duration: 3 + Math.random() * 3,
                    repeat: -1,
                    yoyo: true,
                    ease: "sine.inOut",
                    delay: Math.random() * 2
                });
            } else {
                car.position.set(mathRandom(4), Math.abs(mathRandom(4)), -posLimit);
                car.rotation.y = Math.PI / 2;
                gsap.to(car.position, {
                    z: posLimit,
                    duration: 4 + Math.random() * 3,
                    repeat: -1,
                    yoyo: true,
                    ease: "sine.inOut",
                    delay: Math.random() * 2
                });
            }
            city.add(car);
        }
    }

    // Wszystkie pozycje y >= 9
    const cameraShots = [
        {
            pos: {
                x: 0,
                y: 13,
                z: 16
            },
            lookAt: {
                x: 0,
                y: 0,
                z: 0
            },
            duration: 8
        },
        {
            pos: {
                x: 9,
                y: 9.5,
                z: 10
            },
            lookAt: {
                x: 0,
                y: 1,
                z: 0
            },
            duration: 7
        },
        {
            pos: {
                x: -11,
                y: 11,
                z: -11
            },
            lookAt: {
                x: 0,
                y: 1,
                z: 0
            },
            duration: 8
        },
        {
            pos: {
                x: 3,
                y: 9.0,
                z: 14
            },
            lookAt: {
                x: 0,
                y: 1,
                z: -2
            },
            duration: 7
        }
        ];

    let currentShot = 0;
    const targetLookAt = new THREE.Vector3();

    function triggerNextShot() {
        const shot = cameraShots[currentShot];

        gsap.to(camera.position, {
            x: shot.pos.x,
            y: shot.pos.y,
            z: shot.pos.z,
            duration: shot.duration,
            ease: "power2.inOut"
        });

        gsap.to(targetLookAt, {
            x: shot.lookAt.x,
            y: shot.lookAt.y,
            z: shot.lookAt.z,
            duration: shot.duration,
            ease: "power2.inOut",
            onUpdate: () => camera.lookAt(targetLookAt)
        });

        const nextHue = (0.95 + Math.random() * 0.1) % 1;
        const newColor = new THREE.Color().setHSL(nextHue, 0.8, 0.4);
        gsap.to(scene.fog.color, {
            r: newColor.r,
            g: newColor.g,
            b: newColor.b,
            duration: shot.duration
        });
        gsap.to(scene.background, {
            r: newColor.r,
            g: newColor.g,
            b: newColor.b,
            duration: shot.duration
        });

        currentShot = (currentShot + 1) % cameraShots.length;
        gsap.delayedCall(shot.duration - 0.5, triggerNextShot);
    }

    let clock = new THREE.Clock();

    function animate() {
        requestAnimationFrame(animate);

        const elapsedTime = clock.getElapsedTime();
        city.rotation.y = elapsedTime * 0.04;
        smoke.rotation.y = elapsedTime * 0.02;
        smoke.rotation.x = Math.sin(elapsedTime * 0.1) * 0.05;
        lightFront.intensity = 12 + Math.sin(elapsedTime * 3) * 4;

        camera.lookAt(targetLookAt);
        renderer.render(scene, camera);
    }

    window.addEventListener('resize', () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });

    buildCity();
    createTraffic();
    animate();
    triggerNextShot();
})();