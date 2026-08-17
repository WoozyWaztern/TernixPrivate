import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const SETTINGS = {
    flySpeed: 16,
    flyBoost: 2.5,
    playerSpeed: 16.0,
    acceleration: 120.0,
    deceleration: 100.0,
    gravity: 50.0,
    jumpPower: 16.0,
    playerRadius: 0.45,
    playerHeight: 3.0,
    cameraDistance: 10.0,
    mouseSensitivity: 0.0032,
    cameraMinPitch: -1.2,
    cameraMaxPitch: 1.35,
    studsPerUnit: 1.15,
    blockSize: 2
};

const gameContainer = document.getElementById("game-container");
const statusText = document.getElementById("status-text");
const placeTitle = document.getElementById("place-title");
const blocksHeader = document.getElementById("blocks-header");
const propertiesContent = document.getElementById("properties-content");
const btnPlay = document.getElementById("btn-play");
const btnExitPlay = document.getElementById("btn-exit-play");
const saveModal = document.getElementById("save-modal");
const publishModal = document.getElementById("publish-modal");
const saveNameInput = document.getElementById("save-name");
const publishNameInput = document.getElementById("publish-name");
const publishCover = document.getElementById("publish-cover");
const coverPreview = document.getElementById("cover-preview");

let currentTool = "select";
let isPlayMode = false;
let placeName = "Untitled Place";
let selectedBlock = null;
const placedBlocks = [];

const currentUser = localStorage.getItem("ternix_creators_user") || localStorage.getItem("ternix_user");
if (!currentUser || (localStorage.getItem("ternix_creators_logged") !== "true" && localStorage.getItem("ternix_logged_in") !== "true")) {
    window.location.href = "index.html";
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 50, 140);

const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 500);
let camYaw = Math.PI;
let camPitch = -0.35;
camera.position.set(0, 14, 22);
(function initLook() {
    const forward = new THREE.Vector3(
        Math.sin(camYaw) * Math.cos(camPitch),
        Math.sin(camPitch),
        Math.cos(camYaw) * Math.cos(camPitch)
    );
    camera.lookAt(camera.position.clone().add(forward));
})();

const renderer = new THREE.WebGLRenderer({
    antialias: false,
    powerPreference: "high-performance",
    stencil: false
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
renderer.outputColorSpace = THREE.SRGBColorSpace;
gameContainer.appendChild(renderer.domElement);

const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(40, 80, 30);
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xffffff, 0x657080, 1.1));

const textureLoader = new THREE.TextureLoader();
let blockTexture = null;
const materialCache = new Map();

const COLORS = {
    blue: 0x4A9BD0, red: 0xD94B42, green: 0x4DAA58,
    yellow: 0xD8BD45, brown: 0x79513A, grey: 0x929292,
    white: 0xD8D8D8, orange: 0xD77A3A, purple: 0x7959A8, black: 0x282828
};
const colorList = Object.values(COLORS);
let colorIndex = 0;

function getSolidMaterial(color) {
    const key = "solid_" + color;
    if (materialCache.has(key)) return materialCache.get(key);
    const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(color) });
    materialCache.set(key, mat);
    return mat;
}

function getBlockMaterial(color, width, depth) {
    if (!blockTexture || !blockTexture.image) return getSolidMaterial(color);
    const repeatX = width * SETTINGS.studsPerUnit;
    const repeatY = depth * SETTINGS.studsPerUnit;
    const key = color + "_" + repeatX + "x" + repeatY;
    if (materialCache.has(key)) return materialCache.get(key);
    const mat = new THREE.ShaderMaterial({
        uniforms: {
            map: { value: blockTexture },
            color: { value: new THREE.Color(color) },
            darkFactor: { value: 0.38 },
            repeat: { value: new THREE.Vector2(repeatX, repeatY) }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D map;
            uniform vec3 color;
            uniform float darkFactor;
            uniform vec2 repeat;
            varying vec2 vUv;
            void main() {
                vec2 uv = fract(vUv * repeat);
                vec4 tex = texture2D(map, uv);
                float mask = tex.r;
                vec3 bright = color;
                vec3 dark = color * darkFactor;
                vec3 finalColor = mix(dark, bright, mask);
                gl_FragColor = vec4(finalColor, 1.0);
            }
        `
    });
    materialCache.set(key, mat);
    return mat;
}

function createBlockMesh({ x = 0, y = 1, z = 0, width = 2, height = 2, depth = 2, color = COLORS.blue } = {}) {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = getBlockMaterial(color, width, depth);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.frustumCulled = true;
    mesh.userData = { width, height, depth, color, isBlock: true, x, y, z };
    return mesh;
}

blockTexture = textureLoader.load(
    "../Textures/TernixBlockTextures.png",
    (tex) => {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        blockTexture = tex;
        materialCache.forEach((mat) => {
            if (mat.uniforms && mat.uniforms.map) {
                mat.uniforms.map.value = tex;
                mat.needsUpdate = true;
            }
        });
    },
    undefined,
    () => { blockTexture = null; }
);

function createBasePlatform() {
    const mesh = createBlockMesh({
        x: 0, y: -0.5, z: 0,
        width: 40, height: 1, depth: 40,
        color: COLORS.green
    });
    mesh.userData.isBase = true;
    scene.add(mesh);
    placedBlocks.push({
        mesh,
        data: { x: 0, y: -0.5, z: 0, width: 40, height: 1, depth: 40, color: COLORS.green, isBase: true }
    });
}
createBasePlatform();

let isRightMouse = false;
let isDraggingBlock = false;
const flyKeys = { W: false, A: false, S: false, D: false, Space: false, Shift: false };

const player = new THREE.Group();
scene.add(player);
player.visible = false;

const playerPosition = new THREE.Vector3(0, 1, 6);
const velocity = new THREE.Vector3();
let verticalVelocity = 0;
let onGround = false;

let character = null;
let animParts = { leftArm: null, rightArm: null, leftLeg: null, rightLeg: null };
let useLimbAnim = false;
let animTime = 0;

function setupCharacter(root) {
    character = root;
    character.traverse((obj) => {
        if (obj.isMesh) {
            obj.frustumCulled = true;
            if (obj.material) {
                const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                mats.forEach((m) => {
                    if (m.map && !m.map.image) { m.map = null; m.needsUpdate = true; }
                });
            }
        }
    });
    const box = new THREE.Box3().setFromObject(character);
    const size = new THREE.Vector3();
    box.getSize(size);
    if (size.y > 0) character.scale.setScalar(SETTINGS.playerHeight / size.y);
    const fixedBox = new THREE.Box3().setFromObject(character);
    const center = new THREE.Vector3();
    fixedBox.getCenter(center);
    character.position.x -= center.x;
    character.position.z -= center.z;
    character.position.y -= fixedBox.min.y;
    player.add(character);
    classifyLimbs(character);
}

function classifyLimbs(root) {
    animParts = { leftArm: null, rightArm: null, leftLeg: null, rightLeg: null };
    if (!root) return;
    root.updateMatrixWorld(true);
    const meshes = [];
    root.traverse((o) => {
        if (!o.isMesh) return;
        const n = (o.name || "").toLowerCase();
        if (n.includes("head") || n.includes("face") || n.includes("eye")) return;
        const box = new THREE.Box3().setFromObject(o);
        const c = new THREE.Vector3();
        box.getCenter(c);
        root.worldToLocal(c);
        o.userData.baseRotX = o.rotation.x;
        o.userData.baseRotY = o.rotation.y;
        o.userData.baseRotZ = o.rotation.z;
        o.userData.localCenter = c.clone();
        meshes.push(o);
    });
    if (meshes.length < 3) return;
    meshes.sort((a, b) => b.userData.localCenter.y - a.userData.localCenter.y);
    const body = meshes.slice(1);
    body.sort((a, b) => a.userData.localCenter.y - b.userData.localCenter.y);
    const legPool = body.slice(0, Math.min(2, body.length));
    if (legPool.length >= 2) {
        legPool.sort((a, b) => a.userData.localCenter.x - b.userData.localCenter.x);
        animParts.leftLeg = legPool[0];
        animParts.rightLeg = legPool[legPool.length - 1];
    }
    const legSet = new Set([animParts.leftLeg, animParts.rightLeg]);
    const rest = body.filter((m) => !legSet.has(m));
    rest.sort((a, b) => Math.abs(b.userData.localCenter.x) - Math.abs(a.userData.localCenter.x));
    if (rest.length >= 2) {
        const arms = rest.slice(0, 2).sort((a, b) => a.userData.localCenter.x - b.userData.localCenter.x);
        animParts.leftArm = arms[0];
        animParts.rightArm = arms[arms.length - 1];
    }
    useLimbAnim = !!(animParts.leftArm || animParts.rightArm || animParts.leftLeg || animParts.rightLeg);
}

function setLimbX(mesh, extraX) {
    if (!mesh || mesh.userData.baseRotX === undefined) return;
    mesh.rotation.x = mesh.userData.baseRotX + extraX;
}

const gltfLoader = new GLTFLoader();
gltfLoader.load("../TernixGuy.glb", (gltf) => {
    setupCharacter(gltf.scene);
}, undefined, () => {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1.4, 0.65), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    body.position.y = 0.7;
    player.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.85, 0.85), new THREE.MeshLambertMaterial({ color: 0xe2bd91 }));
    head.position.y = 1.8;
    player.add(head);
});

function getColliders() {
    return placedBlocks.map(b => {
        const d = b.data;
        return {
            minX: d.x - d.width / 2, maxX: d.x + d.width / 2,
            minY: d.y - d.height / 2, maxY: d.y + d.height / 2,
            minZ: d.z - d.depth / 2, maxZ: d.z + d.depth / 2
        };
    });
}

function collision(x, z, y) {
    const r = SETTINGS.playerRadius;
    const bottom = y;
    const top = y + SETTINGS.playerHeight;
    for (const block of getColliders()) {
        if (top <= block.minY || bottom >= block.maxY) continue;
        const cx = Math.max(block.minX, Math.min(x, block.maxX));
        const cz = Math.max(block.minZ, Math.min(z, block.maxZ));
        if ((x - cx) * (x - cx) + (z - cz) * (z - cz) < r * r) return true;
    }
    return false;
}

function getFloor(x, z) {
    let floor = -10;
    const r = SETTINGS.playerRadius;
    for (const block of getColliders()) {
        if (x + r < block.minX || x - r > block.maxX) continue;
        if (z + r < block.minZ || z - r > block.maxZ) continue;
        floor = Math.max(floor, block.maxY);
    }
    return floor;
}
function updatePlayPhysics(delta) {
    verticalVelocity -= SETTINGS.gravity * delta;
    let newY = playerPosition.y + verticalVelocity * delta;
    const floor = getFloor(playerPosition.x, playerPosition.z);
    if (newY <= floor) {
        newY = floor;
        verticalVelocity = 0;
        onGround = true;
    } else {
        onGround = false;
    }
    playerPosition.y = newY;
}

function updatePlayMovement(delta) {
    const input = new THREE.Vector3();
    if (flyKeys.W) input.z -= 1;
    if (flyKeys.S) input.z += 1;
    if (flyKeys.A) input.x -= 1;
    if (flyKeys.D) input.x += 1;
    if (input.lengthSq() > 0) input.normalize();

    const forward = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
    const right = new THREE.Vector3(Math.cos(camYaw), 0, -Math.sin(camYaw));
    const wish = new THREE.Vector3()
        .addScaledVector(forward, -input.z)
        .addScaledVector(right, input.x);

    if (wish.lengthSq() > 0) {
        wish.normalize();
        velocity.x += wish.x * SETTINGS.acceleration * delta;
        velocity.z += wish.z * SETTINGS.acceleration * delta;
        const hSpeed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
        if (hSpeed > SETTINGS.playerSpeed) {
            const s = SETTINGS.playerSpeed / hSpeed;
            velocity.x *= s;
            velocity.z *= s;
        }
        player.rotation.y = Math.atan2(wish.x, wish.z);
    } else {
        const hSpeed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
        if (hSpeed > 0) {
            const decel = SETTINGS.deceleration * delta;
            const newSpeed = Math.max(0, hSpeed - decel);
            const s = newSpeed / hSpeed;
            velocity.x *= s;
            velocity.z *= s;
        }
    }

    let newX = playerPosition.x + velocity.x * delta;
    let newZ = playerPosition.z + velocity.z * delta;
    if (!collision(newX, playerPosition.z, playerPosition.y)) playerPosition.x = newX;
    else velocity.x = 0;
    if (!collision(playerPosition.x, newZ, playerPosition.y)) playerPosition.z = newZ;
    else velocity.z = 0;
}

function updatePlayCamera() {
    const offset = new THREE.Vector3(
        Math.sin(camYaw) * Math.cos(camPitch),
        Math.sin(camPitch),
        Math.cos(camYaw) * Math.cos(camPitch)
    ).multiplyScalar(SETTINGS.cameraDistance);
    camera.position.copy(playerPosition).add(new THREE.Vector3(0, 1.6, 0)).add(offset);
    camera.lookAt(playerPosition.x, playerPosition.y + 1.4, playerPosition.z);
}

function updateFly(delta) {
    const speed = SETTINGS.flySpeed * (flyKeys.Shift ? SETTINGS.flyBoost : 1);
    const forward = new THREE.Vector3(
        Math.sin(camYaw) * Math.cos(camPitch),
        Math.sin(camPitch),
        Math.cos(camYaw) * Math.cos(camPitch)
    );
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    if (flyKeys.W) camera.position.addScaledVector(forward, speed * delta);
    if (flyKeys.S) camera.position.addScaledVector(forward, -speed * delta);
    if (flyKeys.A) camera.position.addScaledVector(right, -speed * delta);
    if (flyKeys.D) camera.position.addScaledVector(right, speed * delta);
    if (flyKeys.Space) camera.position.y += speed * delta;
    if (flyKeys.Shift && !flyKeys.W && !flyKeys.S) camera.position.y -= speed * delta;
    camera.lookAt(camera.position.clone().add(forward));
}

function setLimbX(mesh, extraX) {
    if (!mesh || mesh.userData.baseRotX === undefined) return;
    mesh.rotation.x = mesh.userData.baseRotX + extraX;
}

function updateAnims(delta) {
    if (!useLimbAnim || !isPlayMode) return;
    const moving = onGround && (flyKeys.W || flyKeys.A || flyKeys.S || flyKeys.D) && velocity.lengthSq() > 0.12;
    const airborne = !onGround;

    if (moving) animTime += delta * 10.5;
    else animTime *= 0.7;

    const swing = moving ? Math.sin(animTime) * 0.85 : 0;
    const armSwing = moving ? Math.sin(animTime) * 0.95 : 0;

    if (airborne && verticalVelocity > 2.0) {
        setLimbX(animParts.leftArm, -2.9);
        setLimbX(animParts.rightArm, -2.9);
        setLimbX(animParts.leftLeg, 0.25);
        setLimbX(animParts.rightLeg, 0.25);
    } else if (airborne) {
        setLimbX(animParts.leftArm, -0.55);
        setLimbX(animParts.rightArm, -0.55);
        setLimbX(animParts.leftLeg, 0.45);
        setLimbX(animParts.rightLeg, 0.35);
    } else {
        setLimbX(animParts.leftLeg, swing);
        setLimbX(animParts.rightLeg, -swing);
        setLimbX(animParts.leftArm, -armSwing);
        setLimbX(animParts.rightArm, armSwing);
    }
}

function selectBlock(blockEntry) {
    selectedBlock = blockEntry;
    if (!blockEntry) {
        propertiesContent.innerHTML = "Select an object";
        return;
    }
    const d = blockEntry.data;
    propertiesContent.innerHTML = `
        <div>Position: ${d.x.toFixed(1)}, ${d.y.toFixed(1)}, ${d.z.toFixed(1)}</div>
        <div style="margin-top:6px;">Size: ${d.width} × ${d.height} × ${d.depth}</div>
        <div style="margin-top:6px;">Color: #${d.color.toString(16).padStart(6,"0")}</div>
        <button type="button" id="btn-delete-sel" style="margin-top:10px;width:100%;padding:4px;">Delete</button>
    `;
    const del = document.getElementById("btn-delete-sel");
    if (del) del.onclick = () => removeSelected();
}

function removeSelected() {
    if (!selectedBlock || selectedBlock.data.isBase) return;
    scene.remove(selectedBlock.mesh);
    const idx = placedBlocks.indexOf(selectedBlock);
    if (idx >= 0) placedBlocks.splice(idx, 1);
    selectedBlock = null;
    propertiesContent.innerHTML = "Select an object";
    updateBlocksCount();
}

function updateBlocksCount() {
    const count = placedBlocks.filter(b => !b.data.isBase).length;
    if (blocksHeader) blocksHeader.textContent = "Blocks (" + count + ")";
}

function placeBlock(point, normal) {
    const size = SETTINGS.blockSize;
    const offset = normal.clone().multiplyScalar(size / 2);
    let x = Math.round((point.x + offset.x) / size) * size;
    let y = Math.round((point.y + offset.y) / size) * size;
    let z = Math.round((point.z + offset.z) / size) * size;
    if (y < 0) y = size / 2;

    const color = colorList[colorIndex % colorList.length];
    const mesh = createBlockMesh({ x, y, z, width: size, height: size, depth: size, color });
    scene.add(mesh);
    const entry = { mesh, data: { x, y, z, width: size, height: size, depth: size, color } };
    placedBlocks.push(entry);
    selectBlock(entry);
    updateBlocksCount();
    statusText.textContent = "Block placed";
}

function removeBlockAt(point) {
    let closest = null;
    let closestDist = 1.5;
    for (const b of placedBlocks) {
        if (b.data.isBase) continue;
        const dist = b.mesh.position.distanceTo(point);
        if (dist < closestDist) {
            closestDist = dist;
            closest = b;
        }
    }
    if (closest) {
        scene.remove(closest.mesh);
        const idx = placedBlocks.indexOf(closest);
        if (idx >= 0) placedBlocks.splice(idx, 1);
        if (selectedBlock === closest) {
            selectedBlock = null;
            propertiesContent.innerHTML = "Select an object";
        }
        updateBlocksCount();
        statusText.textContent = "Block removed";
    }
}

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function onPointerDown(e) {
    if (isPlayMode) return;
    if (e.button === 2) {
        isRightMouse = true;
        return;
    }
    if (e.button !== 0) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const meshes = placedBlocks.map(b => b.mesh);
    const hits = raycaster.intersectObjects(meshes, false);
    if (!hits.length) {
        selectBlock(null);
        return;
    }
    const hit = hits[0];
    const entry = placedBlocks.find(b => b.mesh === hit.object);

    if (currentTool === "select") {
        selectBlock(entry || null);
    } else if (currentTool === "block") {
        placeBlock(hit.point, hit.face.normal);
    } else if (currentTool === "delete") {
        if (entry && !entry.data.isBase) {
            scene.remove(entry.mesh);
            const idx = placedBlocks.indexOf(entry);
            if (idx >= 0) placedBlocks.splice(idx, 1);
            selectedBlock = null;
            propertiesContent.innerHTML = "Select an object";
            updateBlocksCount();
        }
    } else if (currentTool === "move" && entry && !entry.data.isBase) {
        isDraggingBlock = true;
        selectedBlock = entry;
        selectBlock(entry);
    }
}

function onPointerMove(e) {
    if (isPlayMode) {
        if (document.pointerLockElement === renderer.domElement) {
            camYaw -= e.movementX * SETTINGS.mouseSensitivity;
            camPitch -= e.movementY * SETTINGS.mouseSensitivity;
            camPitch = Math.max(SETTINGS.cameraMinPitch, Math.min(SETTINGS.cameraMaxPitch, camPitch));
        }
        return;
    }
    if (isRightMouse) {
        camYaw -= e.movementX * SETTINGS.mouseSensitivity;
        camPitch -= e.movementY * SETTINGS.mouseSensitivity;
        camPitch = Math.max(-1.4, Math.min(1.4, camPitch));
        return;
    }
    if (isDraggingBlock && selectedBlock && !selectedBlock.data.isBase) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -selectedBlock.data.y);
        const target = new THREE.Vector3();
        raycaster.ray.intersectPlane(plane, target);
        if (target) {
            const size = SETTINGS.blockSize;
            const x = Math.round(target.x / size) * size;
            const z = Math.round(target.z / size) * size;
            selectedBlock.mesh.position.x = x;
            selectedBlock.mesh.position.z = z;
            selectedBlock.data.x = x;
            selectedBlock.data.z = z;
        }
    }
}

function onPointerUp(e) {
    if (e.button === 2) isRightMouse = false;
    if (e.button === 0) isDraggingBlock = false;
}

function onKeyDown(e) {
    const k = e.code;
    if (k === "KeyW") flyKeys.W = true;
    if (k === "KeyA") flyKeys.A = true;
    if (k === "KeyS") flyKeys.S = true;
    if (k === "KeyD") flyKeys.D = true;
    if (k === "Space") {
        flyKeys.Space = true;
        if (isPlayMode && onGround) {
            verticalVelocity = SETTINGS.jumpPower;
            onGround = false;
        }
        e.preventDefault();
    }
    if (k === "ShiftLeft" || k === "ShiftRight") flyKeys.Shift = true;

    if (!isPlayMode) {
        if (k === "Delete" || k === "Backspace") removeSelected();
        if (k === "KeyR") {
            colorIndex = (colorIndex + 1) % colorList.length;
            statusText.textContent = "Color: " + colorIndex;
        }
        if (k === "BracketRight" && selectedBlock && !selectedBlock.data.isBase) {
            resizeSelected(1);
        }
        if (k === "BracketLeft" && selectedBlock && !selectedBlock.data.isBase) {
            resizeSelected(-1);
        }
    }
}

function onKeyUp(e) {
    const k = e.code;
    if (k === "KeyW") flyKeys.W = false;
    if (k === "KeyA") flyKeys.A = false;
    if (k === "KeyS") flyKeys.S = false;
    if (k === "KeyD") flyKeys.D = false;
    if (k === "Space") flyKeys.Space = false;
    if (k === "ShiftLeft" || k === "ShiftRight") flyKeys.Shift = false;
}

function resizeSelected(dir) {
    if (!selectedBlock || selectedBlock.data.isBase) return;
    const d = selectedBlock.data;
    const step = SETTINGS.blockSize;
    d.width = Math.max(step, d.width + dir * step);
    d.height = Math.max(step, d.height + dir * step);
    d.depth = Math.max(step, d.depth + dir * step);
    scene.remove(selectedBlock.mesh);
    const mesh = createBlockMesh(d);
    scene.add(mesh);
    selectedBlock.mesh = mesh;
    selectBlock(selectedBlock);
}

// —— Tools UI ——
document.querySelectorAll(".tool-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".tool-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentTool = btn.dataset.tool || "select";
        statusText.textContent = "Tool: " + currentTool;
    });
});

// —— Play / Exit ——
function enterPlayMode() {
    isPlayMode = true;
    player.visible = true;
    playerPosition.set(0, 3, 8);
    velocity.set(0, 0, 0);
    verticalVelocity = 0;
    onGround = false;
    camYaw = Math.PI;
    camPitch = -0.3;
    btnPlay.style.display = "none";
    btnExitPlay.style.display = "inline-block";
    statusText.textContent = "Play Mode — WASD move, Space jump, Right-click look";
    renderer.domElement.requestPointerLock();
}

function exitPlayMode() {
    isPlayMode = false;
    player.visible = false;
    btnPlay.style.display = "inline-block";
    btnExitPlay.style.display = "none";
    statusText.textContent = "Build Mode";
    document.exitPointerLock();
}

btnPlay.addEventListener("click", enterPlayMode);
btnExitPlay.addEventListener("click", exitPlayMode);

// —— Save ——
function savePlaceToStorage(name) {
    const data = {
        name: name || placeName,
        blocks: placedBlocks.map(b => ({ ...b.data })),
        saved: Date.now()
    };
    localStorage.setItem("ternix_place_" + currentUser, JSON.stringify(data));
    placeName = data.name;
    placeTitle.textContent = "Ternix Creators - " + placeName;
}

document.getElementById("save-confirm")?.addEventListener("click", () => {
    const name = saveNameInput.value.trim() || "Untitled Place";
    savePlaceToStorage(name);
    saveModal.classList.remove("show");
    statusText.textContent = "Saved: " + name;
});

document.getElementById("save-cancel")?.addEventListener("click", () => {
    saveModal.classList.remove("show");
});

// —— Publish (1 game per author, overwrite) ——
let coverDataUrl = null;
publishCover?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        coverDataUrl = reader.result;
        coverPreview.innerHTML = `<img src="${coverDataUrl}" alt="cover">`;
    };
    reader.readAsDataURL(file);
});

document.getElementById("publish-confirm")?.addEventListener("click", async () => {
    const name = publishNameInput.value.trim();
    if (!name) {
        alert("Please enter a game title");
        return;
    }
    const author = currentUser;
    if (!author) {
        alert("You must be logged in to publish");
        window.location.href = "index.html";
        return;
    }

    placeName = name;
    placeTitle.textContent = "Ternix Creators - " + name;
    savePlaceToStorage(name);

    const id = "game_" + String(author).replace(/\W/g, "_").toLowerCase();
    const gameData = {
        id: id,
        title: name,
        author: author,
        cover: coverDataUrl || null,
        blocks: placedBlocks.map(b => ({ ...b.data })),
        created: Date.now(),
        activePlayers: 0
    };

    if (!window.ternixDB) {
        alert("Firebase not found — check studio.html scripts.");
        return;
    }

    try {
        const snap = await window.ternixDB.ref("ternix_games").once("value");
        const all = snap.val() || {};
        const removes = [];
        Object.keys(all).forEach((key) => {
            if (all[key] && String(all[key].author).toLowerCase() === String(author).toLowerCase() && key !== id) {
                removes.push(window.ternixDB.ref("ternix_games/" + key).remove());
            }
        });
        await Promise.all(removes);
        await window.ternixDB.ref("ternix_games/" + id).set(gameData);

        try {
            let games = JSON.parse(localStorage.getItem("ternix_published_games") || "[]");
            if (!Array.isArray(games)) games = [];
            games = games.filter(g => String(g.author).toLowerCase() !== String(author).toLowerCase());
            games.unshift(gameData);
            localStorage.setItem("ternix_published_games", JSON.stringify(games));
        } catch (e) {}

        publishModal.classList.remove("show");
        statusText.textContent = "Published: " + name;
        alert('Game "' + name + '" published!\nPrevious game of this account was replaced.');
    } catch (err) {
        console.error(err);
        alert("Publish failed: " + err.message);
    }
});

document.getElementById("publish-cancel")?.addEventListener("click", () => {
    publishModal.classList.remove("show");
});

// —— Menu actions ——
document.getElementById("menu-save")?.addEventListener("click", () => {
    saveNameInput.value = placeName;
    saveModal.classList.add("show");
});
document.getElementById("menu-publish")?.addEventListener("click", () => {
    publishNameInput.value = placeName;
    publishModal.classList.add("show");
});
document.getElementById("menu-new")?.addEventListener("click", () => {
    if (!confirm("Clear current place?")) return;
    placedBlocks.slice().forEach(b => {
        if (!b.data.isBase) scene.remove(b.mesh);
    });
    placedBlocks.length = 0;
    createBasePlatform();
    selectedBlock = null;
    propertiesContent.innerHTML = "Select an object";
    placeName = "Untitled Place";
    placeTitle.textContent = "Ternix Creators - Untitled Place";
    updateBlocksCount();
});
document.getElementById("btn-close-studio")?.addEventListener("click", () => {
    window.location.href = "index.html";
});

// —— Load saved place ——
function loadPlaceFromStorage() {
    try {
        const raw = localStorage.getItem("ternix_place_" + currentUser);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (!data || !Array.isArray(data.blocks)) return;
        placedBlocks.slice().forEach(b => scene.remove(b.mesh));
        placedBlocks.length = 0;
        data.blocks.forEach(d => {
            const mesh = createBlockMesh(d);
            scene.add(mesh);
            placedBlocks.push({ mesh, data: { ...d } });
        });
        placeName = data.name || "Untitled Place";
        placeTitle.textContent = "Ternix Creators - " + placeName;
        updateBlocksCount();
        statusText.textContent = "Loaded: " + placeName;
    } catch (e) {
        console.warn("Load place failed", e);
    }
}
loadPlaceFromStorage();

// —— Events ——
renderer.domElement.addEventListener("pointerdown", onPointerDown);
window.addEventListener("pointermove", onPointerMove);
window.addEventListener("pointerup", onPointerUp);
window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);
renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());

function resize() {
    const w = gameContainer.clientWidth;
    const h = gameContainer.clientHeight;
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
}
window.addEventListener("resize", resize);
resize();

// —— Cursor ——
function resizeCursorImage(imgUrl, callback) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imgUrl;
    img.onload = function () {
        const c = document.createElement("canvas");
        c.width = 90;
        c.height = 90;
        const ctx = c.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, 90, 90);
        callback(c.toDataURL("image/png"));
    };
    img.onerror = function () {
        img.removeAttribute("crossOrigin");
        img.src = imgUrl;
    };
}
window.addEventListener("DOMContentLoaded", () => {
    resizeCursorImage("../cursor/Ternix 3 cursor.png", (url3) => {
        resizeCursorImage("../cursor/Ternix 1 cursor.png", (urlDef) => {
            const s = document.createElement("style");
            s.innerHTML = `
                * { cursor: url('${urlDef}') 0 0, auto !important; }
                a, a *, button, button *, input, select, textarea, img,
                .tool-btn, .menu-item, .dropdown-item {
                    cursor: url('${url3}') 0 0, pointer !important;
                }
            `;
            document.head.appendChild(s);
        });
    });
});

// —— Main loop ——
const clock = new THREE.Clock();
function loop() {
    requestAnimationFrame(loop);
    const delta = Math.min(clock.getDelta(), 0.05);

    if (isPlayMode) {
        updatePlayMovement(delta);
        updatePlayPhysics(delta);
        player.position.copy(playerPosition);
        updatePlayCamera();
        updateAnims(delta);
    } else {
        updateFly(delta);
    }
    renderer.render(scene, camera);
}
loop();