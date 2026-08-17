import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const SETTINGS = {
    playerSpeed: 9.0,
    acceleration: 70.0,
    deceleration: 80.0,
    gravity: 48.0,
    jumpPower: 14.0,
    playerRadius: 0.5,
    playerHeight: 3.0,
    cameraDistance: 10.0,
    cameraMinDistance: 4.0,
    cameraMaxDistance: 18.0,
    mouseSensitivity: 0.0025,
    cameraMinPitch: -0.7,
    cameraMaxPitch: 1.2,
    bubbleTime: 4500,
    maxChatMessages: 8,
    maxBubbles: 3,
    studsPerUnit: 1.15,
    netHz: 12,
    staleMs: 8000
};

const gameData = JSON.parse(localStorage.getItem("ternix_current_game") || "null");
if (!gameData) {
    alert("No game selected");
    window.location.href = "game.html";
}

function getUsername() {
    return localStorage.getItem("ternix_user") ||
           localStorage.getItem("ternix_registered_user") ||
           localStorage.getItem("ternix_creators_user") || "Player";
}

const myName = getUsername();
// УНИКАЛЬНЫЙ id на КАЖДУЮ загрузку страницы (не из localStorage)
const mySessionId = myName.replace(/\W/g, "_") + "_" + Math.random().toString(36).slice(2, 11) + "_" + Date.now().toString(36);

function getAccountKey() {
    const user = localStorage.getItem("ternix_user") ||
                 localStorage.getItem("ternix_registered_user") ||
                 localStorage.getItem("ternix_creators_user");
    return user ? String(user).toLowerCase() : null;
}

/* ===== KICK / ERRORS (как Roblox: 1 аккаунт = 1 клиент) ===== */
function showDisconnectError(code, message, scary) {
    const ov = document.getElementById("disc-overlay");
    if (!ov) {
        alert(code + "\n" + message);
        window.location.href = "login.html";
        return;
    }
    ov.classList.add("show");
    if (scary) ov.classList.add("scary");
    else ov.classList.remove("scary");
    const codeEl = document.getElementById("disc-code");
    const msgEl = document.getElementById("disc-msg");
    if (codeEl) codeEl.textContent = code;
    if (msgEl) msgEl.textContent = message;
    const ok = document.getElementById("disc-ok");
    if (ok) {
        ok.onclick = () => {
            localStorage.removeItem("ternix_session");
            localStorage.removeItem("ternix_logged_in");
            localStorage.removeItem("ternix_creators_logged");
            window.location.href = "login.html";
        };
    }
}

function forceKick() {
    try { leaveSession(); } catch (e) {}
    if (Math.random() < 0.05) {
        showDisconnectError(
            "!!!ERROR 333!!!",
            "You have been disconnected. Someone logged into your account.\n\n(Joke error — inspired by old Roblox. Nobody needs to call emergency services.)",
            true
        );
    } else {
        showDisconnectError(
            "!ERROR 002!",
            "You have been disconnected. Someone logged into your account.",
            false
        );
    }
}

function claimAndWatchAccountSession() {
    const key = getAccountKey();
    if (!key || !window.ternixDB) return;

    const userRef = window.ternixDB.ref("ternix_users/" + key);

    // Перезаписываем sessionId — старый клиент получит кик
    userRef.update({
        sessionId: mySessionId,
        playGameId: gameData.id || null,
        playT: Date.now()
    }).catch((e) => console.warn("claim failed (Firebase Rules?):", e.message));

    // Если вкладку закрыли — чистим, только пока мы владельцы
    userRef.onDisconnect().update({
        sessionId: null,
        playGameId: null,
        playT: null
    });

    userRef.child("sessionId").on("value", (snap) => {
        const remote = snap.val();
        if (remote === null || remote === undefined) return;
        if (remote !== mySessionId) forceKick();
    });
}

window.addEventListener("offline", () => {
    showDisconnectError(
        "!ERROR 780!",
        "You have been disconnected due to a network error. Check your internet connection.",
        false
    );
});

claimAndWatchAccountSession();

/* ===== ACTIVE PLAYERS ===== */
let lastActiveWrite = 0;
function setActivePlayers(n) {
    n = Math.max(0, n | 0);
    const now = performance.now();
    if (now - lastActiveWrite < 1000) return;
    lastActiveWrite = now;
    try {
        if (window.ternixDB && gameData.id) {
            window.ternixDB.ref("ternix_games/" + gameData.id + "/activePlayers").set(n);
        }
    } catch (e) {}
}

const exitBtn = document.getElementById("game-exit");
if (exitBtn) {
    exitBtn.addEventListener("click", () => {
        leaveSession();
        window.location.href = "game.html";
    });
}

/* ===== THREE ===== */
const gameContainer = document.getElementById("game-container");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 50, 105);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 500);
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance", stencil: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
gameContainer.appendChild(renderer.domElement);

function forceLayout() {
    document.documentElement.style.cssText = "margin:0;padding:0;width:100%;height:100%;overflow:hidden;";
    document.body.style.cssText = "margin:0;padding:0;width:100%;height:100%;overflow:hidden;";
    gameContainer.style.cssText = "position:fixed;left:0;top:0;width:100%;height:100%;";
    renderer.domElement.style.cssText = "display:block;width:100%;height:100%;";
}
forceLayout();
// без авто-requestFullscreen

const sun = new THREE.DirectionalLight(0xffffff, 1.55);
sun.position.set(40, 80, 30);
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xffffff, 0x657080, 1.15));

/* ===== BLOCKS ===== */
const textureLoader = new THREE.TextureLoader();
let blockTexture = null;
const materialCache = new Map();
const blocks = [];
const blockMeshes = [];
let mapBuilt = false;

function getSolidMaterial(color) {
    const key = "solid_" + color;
    if (materialCache.has(key)) return materialCache.get(key);
    const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(color) });
    materialCache.set(key, mat);
    return mat;
}

function getShaderMaterial(color, width, depth) {
    if (!blockTexture || !blockTexture.image) return getSolidMaterial(color);
    const rx = Math.max(1, width * SETTINGS.studsPerUnit);
    const ry = Math.max(1, depth * SETTINGS.studsPerUnit);
    const key = "sh_" + color + "_" + rx + "x" + ry;
    if (materialCache.has(key)) return materialCache.get(key);
    const mat = new THREE.ShaderMaterial({
        uniforms: {
            map: { value: blockTexture },
            color: { value: new THREE.Color(color) },
            darkFactor: { value: 0.42 },
            repeat: { value: new THREE.Vector2(rx, ry) }
        },
        vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
        fragmentShader: `uniform sampler2D map;uniform vec3 color;uniform float darkFactor;uniform vec2 repeat;varying vec2 vUv;
        void main(){vec2 uv=fract(vUv*repeat);float m=texture2D(map,uv).r;gl_FragColor=vec4(mix(color*darkFactor,color,m),1.0);}`
    });
    materialCache.set(key, mat);
    return mat;
}

function createBlock(o = {}) {
    const { x = 0, y = 1, z = 0, width = 2, height = 2, depth = 2, color = 0x4A9BD0, useTexture = true } = o;
    const geo = new THREE.BoxGeometry(width, height, depth);
    const want = useTexture !== false;
    const mat = want ? getShaderMaterial(color, width, depth) : getSolidMaterial(color);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.frustumCulled = true;
    mesh.userData = { width, height, depth, color, useTexture: want };
    scene.add(mesh);
    blockMeshes.push(mesh);
    blocks.push({
        minX: x - width / 2, maxX: x + width / 2,
        minY: y - height / 2, maxY: y + height / 2,
        minZ: z - depth / 2, maxZ: z + depth / 2
    });
}

function buildMap() {
    if (mapBuilt) return;
    mapBuilt = true;
    if (gameData.blocks && gameData.blocks.length) {
        for (const b of gameData.blocks) {
            createBlock({
                x: b.x, y: b.y, z: b.z,
                width: b.width, height: b.height, depth: b.depth,
                color: b.color, useTexture: b.useTexture !== false
            });
        }
    } else {
        createBlock({ x: 0, y: -0.5, z: 0, width: 40, height: 1, depth: 40, color: 0x4DAA58 });
    }
    const loading = document.getElementById("mp-loading");
    if (loading) loading.style.display = "none";
}

function upgradeTextures() {
    for (const mesh of blockMeshes) {
        const d = mesh.userData;
        if (!d || d.useTexture === false) continue;
        mesh.material = getShaderMaterial(d.color, d.width, d.depth);
    }
}

textureLoader.load("Textures/TernixBlockTextures.png", (tex) => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    blockTexture = tex;
    if (!mapBuilt) buildMap();
    else upgradeTextures();
}, undefined, () => {
    blockTexture = null;
    buildMap();
});
setTimeout(() => { if (!mapBuilt) buildMap(); }, 2000);

/* ===== PLAYER ===== */
let sharedGuyTemplate = null;
const player = new THREE.Group();
scene.add(player);
const playerPosition = new THREE.Vector3(0, 2, 8);
const velocity = new THREE.Vector3();
let verticalVelocity = 0;
let onGround = false;

let localAnimParts = { leftArm: null, rightArm: null, leftLeg: null, rightLeg: null };
let localUseLimbAnim = false;
let animTime = 0;

function createNameTag(group, name, y = 3.2) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = 256;
    canvas.height = 64;
    ctx.font = "bold 26px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.lineWidth = 4;
    ctx.fillStyle = "#fff";
    ctx.strokeText(name, 128, 32);
    ctx.fillText(name, 128, 32);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.2, 0.55, 1);
    sprite.position.set(0, y, 0);
    sprite.renderOrder = 1000;
    group.add(sprite);
}

function makeBoxAvatar(group) {
    const skin = 0xc4a000;
    const parts = [
        [new THREE.BoxGeometry(1.1, 1.2, 0.55), 0x6a6a6a, 0, 1.5, 0, "torso"],
        [new THREE.BoxGeometry(0.85, 0.85, 0.85), skin, 0, 2.45, 0, "head"],
        [new THREE.BoxGeometry(0.4, 1.1, 0.4), skin, -0.75, 1.5, 0, "leftArm"],
        [new THREE.BoxGeometry(0.4, 1.1, 0.4), skin, 0.75, 1.5, 0, "rightArm"],
        [new THREE.BoxGeometry(0.45, 1.2, 0.45), skin, -0.3, 0.6, 0, "leftLeg"],
        [new THREE.BoxGeometry(0.45, 1.2, 0.45), skin, 0.3, 0.6, 0, "rightLeg"]
    ];
    const result = { leftArm: null, rightArm: null, leftLeg: null, rightLeg: null };
    for (const [geo, col, x, y, z, role] of parts) {
        const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: col }));
        m.position.set(x, y, z);
        m.name = role;
        m.userData.baseRotX = 0;
        m.userData.baseRotY = 0;
        m.userData.baseRotZ = 0;
        group.add(m);
        if (role === "leftArm") result.leftArm = m;
        if (role === "rightArm") result.rightArm = m;
        if (role === "leftLeg") result.leftLeg = m;
        if (role === "rightLeg") result.rightLeg = m;
    }
    return result;
}

function fitCharacter(root) {
    root.traverse((o) => {
        if (!o.isMesh) return;
        o.frustumCulled = true;
        if (o.material) {
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach((m) => {
                if (m.map && !m.map.image) {
                    m.map = null;
                    m.needsUpdate = true;
                }
            });
        }
    });
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);
    if (size.y > 0.01) root.scale.setScalar(SETTINGS.playerHeight / size.y);
    const fb = new THREE.Box3().setFromObject(root);
    const c = new THREE.Vector3();
    fb.getCenter(c);
    root.position.x -= c.x;
    root.position.z -= c.z;
    root.position.y -= fb.min.y;
    return root;
}

function classifyLimbs(root) {
    const parts = { leftArm: null, rightArm: null, leftLeg: null, rightLeg: null };
    if (!root) return parts;

    root.updateMatrixWorld(true);

    const byName = {};
    root.traverse((o) => {
        const n = (o.name || "").toLowerCase().replace(/[_\s-]/g, "");
        if (!n) return;
        if (n === "leftarm" || n === "armleft" || n === "larm") byName.leftArm = o;
        if (n === "rightarm" || n === "armright" || n === "rarm") byName.rightArm = o;
        if (n === "leftleg" || n === "legleft" || n === "lleg") byName.leftLeg = o;
        if (n === "rightleg" || n === "legright" || n === "rleg") byName.rightLeg = o;
    });
    if (byName.leftArm || byName.rightArm || byName.leftLeg || byName.rightLeg) {
        root.traverse((o) => {
            if (o.userData.baseRotX === undefined) {
                o.userData.baseRotX = o.rotation.x;
                o.userData.baseRotY = o.rotation.y;
                o.userData.baseRotZ = o.rotation.z;
            }
        });
        return {
            leftArm: byName.leftArm || null,
            rightArm: byName.rightArm || null,
            leftLeg: byName.leftLeg || null,
            rightLeg: byName.rightLeg || null
        };
    }

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
    if (meshes.length < 3) return parts;

    meshes.sort((a, b) => b.userData.localCenter.y - a.userData.localCenter.y);
    const body = meshes.slice(1);
    body.sort((a, b) => a.userData.localCenter.y - b.userData.localCenter.y);
    const legPool = body.slice(0, Math.min(2, body.length));
    if (legPool.length >= 2) {
        legPool.sort((a, b) => a.userData.localCenter.x - b.userData.localCenter.x);
        parts.leftLeg = legPool[0];
        parts.rightLeg = legPool[legPool.length - 1];
    }
    const legSet = new Set([parts.leftLeg, parts.rightLeg]);
    const rest = body.filter((m) => !legSet.has(m));
    rest.sort((a, b) => Math.abs(b.userData.localCenter.x) - Math.abs(a.userData.localCenter.x));
    if (rest.length >= 2) {
        const arms = rest.slice(0, 2).sort((a, b) => a.userData.localCenter.x - b.userData.localCenter.x);
        parts.leftArm = arms[0];
        parts.rightArm = arms[arms.length - 1];
    }
    return parts;
}

function setLimbX(mesh, extraX) {
    if (!mesh || mesh.userData.baseRotX === undefined) return;
    mesh.rotation.x = mesh.userData.baseRotX + extraX;
}

function applyAnim(parts, time, moving, airborne, vertVel) {
    if (!parts) return;
    const swing = moving ? Math.sin(time) * 0.85 : 0;
    const armSwing = moving ? Math.sin(time) * 0.95 : 0;
    if (airborne && vertVel > 2.0) {
        setLimbX(parts.leftArm, -2.9);
        setLimbX(parts.rightArm, -2.9);
        setLimbX(parts.leftLeg, 0.25);
        setLimbX(parts.rightLeg, 0.25);
    } else if (airborne) {
        setLimbX(parts.leftArm, -0.55);
        setLimbX(parts.rightArm, -0.55);
        setLimbX(parts.leftLeg, 0.45);
        setLimbX(parts.rightLeg, 0.35);
    } else {
        setLimbX(parts.leftLeg, swing);
        setLimbX(parts.rightLeg, -swing);
        setLimbX(parts.leftArm, -armSwing);
        setLimbX(parts.rightArm, armSwing);
    }
}

function updateAnimation(delta) {
    const moving = onGround && (keys.W || keys.A || keys.S || keys.D) && velocity.lengthSq() > 0.12;
    const airborne = !onGround;
    if (moving) animTime += delta * 10.5;
    else animTime *= 0.7;

    if (!localUseLimbAnim) {
        const bob = Math.abs(Math.sin(animTime)) * 0.08;
        for (let i = 0; i < player.children.length; i++) {
            const ch = player.children[i];
            if (ch.isSprite) continue;
            if (ch.userData && ch.userData._baseY === undefined) ch.userData._baseY = ch.position.y;
            ch.position.y = (ch.userData._baseY || 0) + (moving ? bob : 0);
        }
        return;
    }
    applyAnim(localAnimParts, animTime, moving, airborne, verticalVelocity);
}

function addGuyToGroup(group) {
    if (sharedGuyTemplate) {
        const clone = sharedGuyTemplate.clone(true);
        group.add(clone);
        return classifyLimbs(clone);
    }
    return makeBoxAvatar(group);
}

new GLTFLoader().load("TernixGuy.glb", (gltf) => {
    sharedGuyTemplate = fitCharacter(gltf.scene);
    const local = sharedGuyTemplate.clone(true);
    player.add(local);
    localAnimParts = classifyLimbs(local);
    localUseLimbAnim = !!(localAnimParts.leftArm || localAnimParts.rightArm || localAnimParts.leftLeg || localAnimParts.rightLeg);
    createNameTag(player, myName);
}, undefined, () => {
    localAnimParts = makeBoxAvatar(player);
    localUseLimbAnim = true;
    createNameTag(player, myName);
});

/* ===== REMOTES ===== */
const remotes = new Map();

function ensureRemote(sessionId, user) {
    if (sessionId === mySessionId) return null;
    if (remotes.has(sessionId)) {
        const r = remotes.get(sessionId);
        if (user) r.user = user;
        return r;
    }
    const group = new THREE.Group();
    const parts = addGuyToGroup(group);
    createNameTag(group, user || "Player");
    scene.add(group);
    const entry = {
        group,
        user: user || "Player",
        targetPos: new THREE.Vector3(),
        targetRot: 0,
        animParts: parts,
        animTime: 0,
        lastPos: new THREE.Vector3()
    };
    remotes.set(sessionId, entry);
    return entry;
}

function removeRemote(sessionId) {
    const r = remotes.get(sessionId);
    if (!r) return;
    scene.remove(r.group);
    remotes.delete(sessionId);
}

function updateRemotes(delta) {
    remotes.forEach((r) => {
        r.group.position.lerp(r.targetPos, Math.min(1, delta * 10));
        let d = r.targetRot - r.group.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        r.group.rotation.y += d * Math.min(1, delta * 10);

        const dist = r.group.position.distanceTo(r.lastPos);
        r.lastPos.copy(r.group.position);
        const moving = dist > 0.02;
        if (moving) r.animTime += delta * 10.5;
        else r.animTime *= 0.7;
        applyAnim(r.animParts, r.animTime, moving, false, 0);
    });
}

/* ===== INPUT ===== */
const keys = { W: false, A: false, S: false, D: false };
let chatOpen = false;
let spaceHeld = false;

window.addEventListener("keydown", (e) => {
    if ((e.key === "/" || e.code === "Slash" || e.key === ".") && !chatOpen) {
        const t = e.target;
        const tag = (t && t.tagName) ? t.tagName.toUpperCase() : "";
        if (tag !== "INPUT" && tag !== "TEXTAREA") {
            e.preventDefault();
            e.stopPropagation();
            openChat();
            return;
        }
    }
    if (chatOpen) return;
    if (e.code === "KeyW") keys.W = true;
    if (e.code === "KeyA") keys.A = true;
    if (e.code === "KeyS") keys.S = true;
    if (e.code === "KeyD") keys.D = true;
    if (e.code === "Space") {
        e.preventDefault();
        if (!spaceHeld && onGround) {
            verticalVelocity = SETTINGS.jumpPower;
            onGround = false;
            playJumpSound();
        }
        spaceHeld = true;
    }
});

window.addEventListener("keyup", (e) => {
    if (e.code === "KeyW") keys.W = false;
    if (e.code === "KeyA") keys.A = false;
    if (e.code === "KeyS") keys.S = false;
    if (e.code === "KeyD") keys.D = false;
    if (e.code === "Space") spaceHeld = false;
});

function clearKeys() {
    keys.W = keys.A = keys.S = keys.D = false;
    spaceHeld = false;
    velocity.x = 0;
    velocity.z = 0;
}
window.addEventListener("blur", clearKeys);

/* ===== SOUNDS ===== */
let jumpSound = null;
let walkSound = null;
let walkSoundFailed = false;
try {
    jumpSound = new Audio("Sounds/Jump.mp3");
    jumpSound.volume = 0.45;
} catch (e) {}
try {
    walkSound = new Audio("Sounds/Walk.mp3");
    walkSound.loop = true;
    walkSound.volume = 0.15;
    walkSound.addEventListener("error", () => { walkSoundFailed = true; walkSound = null; });
} catch (e) { walkSoundFailed = true; }

function playJumpSound() {
    if (!jumpSound) return;
    jumpSound.currentTime = 0;
    jumpSound.play().catch(() => {});
}
function startWalkSound() {
    if (!walkSound || walkSoundFailed) return;
    if (walkSound.paused) walkSound.play().catch(() => { walkSoundFailed = true; });
}
function stopWalkSound() {
    if (walkSound && !walkSound.paused) {
        walkSound.pause();
        walkSound.currentTime = 0;
    }
}

/* ===== CAMERA ===== */
let cameraYaw = 0;
let cameraPitch = 0.25;
let cameraDistance = SETTINGS.cameraDistance;
let rotatingCamera = false;
let cameraCurrentYaw = 0;
let cameraCurrentPitch = 0.25;

renderer.domElement.addEventListener("mousedown", (e) => {
    if (e.button === 2) {
        rotatingCamera = true;
        e.preventDefault();
    }
});
document.addEventListener("mouseup", (e) => {
    if (e.button === 2) rotatingCamera = false;
});
renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("mousemove", (e) => {
    if (!rotatingCamera) return;
    cameraYaw -= e.movementX * SETTINGS.mouseSensitivity;
    cameraPitch = THREE.MathUtils.clamp(
        cameraPitch - e.movementY * SETTINGS.mouseSensitivity,
        SETTINGS.cameraMinPitch,
        SETTINGS.cameraMaxPitch
    );
});
renderer.domElement.addEventListener("wheel", (e) => {
    cameraDistance = THREE.MathUtils.clamp(
        cameraDistance + e.deltaY * 0.01,
        SETTINGS.cameraMinDistance,
        SETTINGS.cameraMaxDistance
    );
    e.preventDefault();
}, { passive: false });

/* ===== PHYSICS ===== */
function collision(x, z, y) {
    const r = SETTINGS.playerRadius;
    const bottom = y;
    const top = y + SETTINGS.playerHeight;
    for (const b of blocks) {
        if (top <= b.minY || bottom >= b.maxY) continue;
        const cx = Math.max(b.minX, Math.min(x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
        if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return true;
    }
    return false;
}

function getFloor(x, z) {
    let floor = -5;
    const r = SETTINGS.playerRadius;
    for (const b of blocks) {
        if (x + r < b.minX || x - r > b.maxX) continue;
        if (z + r < b.minZ || z - r > b.maxZ) continue;
        floor = Math.max(floor, b.maxY);
    }
    return floor;
}

const direction = new THREE.Vector3();
function approach(c, t, a) {
    if (c < t) return Math.min(c + a, t);
    if (c > t) return Math.max(c - a, t);
    return t;
}

function updateMovement(delta) {
    direction.set(0, 0, 0);
    if (keys.W) {
        direction.x -= Math.sin(cameraYaw);
        direction.z -= Math.cos(cameraYaw);
    }
    if (keys.S) {
        direction.x += Math.sin(cameraYaw);
        direction.z += Math.cos(cameraYaw);
    }
    if (keys.A) {
        direction.x -= Math.cos(cameraYaw);
        direction.z += Math.sin(cameraYaw);
    }
    if (keys.D) {
        direction.x += Math.cos(cameraYaw);
        direction.z -= Math.sin(cameraYaw);
    }
    const moving = direction.lengthSq() > 0;
    if (moving) direction.normalize();
    const accel = moving ? SETTINGS.acceleration : SETTINGS.deceleration;
    velocity.x = approach(velocity.x, moving ? direction.x * SETTINGS.playerSpeed : 0, accel * delta);
    velocity.z = approach(velocity.z, moving ? direction.z * SETTINGS.playerSpeed : 0, accel * delta);
    const nx = playerPosition.x + velocity.x * delta;
    if (!collision(nx, playerPosition.z, playerPosition.y)) playerPosition.x = nx;
    else velocity.x = 0;
    const nz = playerPosition.z + velocity.z * delta;
    if (!collision(playerPosition.x, nz, playerPosition.y)) playerPosition.z = nz;
    else velocity.z = 0;
    if (moving) {
        const tr = Math.atan2(direction.x, direction.z);
        let d = tr - player.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        player.rotation.y += d * Math.min(1, delta * 16);
        if (onGround) startWalkSound();
    } else stopWalkSound();
}

function updatePhysics(delta) {
    verticalVelocity = Math.max(verticalVelocity - SETTINGS.gravity * delta, -35);
    playerPosition.y += verticalVelocity * delta;
    const floor = getFloor(playerPosition.x, playerPosition.z);
    if (playerPosition.y <= floor) {
        playerPosition.y = floor;
        verticalVelocity = 0;
        onGround = true;
    } else onGround = false;
}

function updateCamera(delta) {
    const t = 1 - Math.exp(-16 * delta);
    cameraCurrentYaw = THREE.MathUtils.lerp(cameraCurrentYaw, cameraYaw, t);
    cameraCurrentPitch = THREE.MathUtils.lerp(cameraCurrentPitch, cameraPitch, t);
    const target = new THREE.Vector3(playerPosition.x, playerPosition.y + 1.6, playerPosition.z);
    const hd = Math.cos(cameraCurrentPitch) * cameraDistance;
    const vd = Math.sin(cameraCurrentPitch) * cameraDistance;
    camera.position.set(
        target.x + Math.sin(cameraCurrentYaw) * hd,
        target.y + vd,
        target.z + Math.cos(cameraCurrentYaw) * hd
    );
    camera.lookAt(target);
}

/* ===== CHAT ===== */
const chatBar = document.getElementById("chat-bar");
const chatInput = document.getElementById("chat-input");
const chatPlaceholder = document.getElementById("chat-placeholder");
const chatMessages = document.getElementById("chat-messages");

function openChat() {
    if (chatOpen) return;
    chatOpen = true;
    clearKeys();
    const bar = document.getElementById("chat-bar");
    const input = document.getElementById("chat-input");
    const ph = document.getElementById("chat-placeholder");
    if (bar) bar.classList.add("active");
    if (ph) ph.style.display = "none";
    if (input) {
        input.style.display = "block";
        input.style.visibility = "visible";
        input.value = "";
        setTimeout(() => { try { input.focus(); } catch (err) {} }, 10);
    } else {
        console.warn("chat-input not found in HTML");
    }
}

function closeChat() {
    chatOpen = false;
    if (chatBar) chatBar.classList.remove("active");
    if (chatInput) {
        chatInput.style.display = "none";
        chatInput.blur();
    }
    if (chatPlaceholder) chatPlaceholder.style.display = "block";
    clearKeys();
}

if (chatBar) chatBar.addEventListener("click", openChat);
if (chatInput) {
    chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            const msg = chatInput.value.trim();
            if (msg) sendChat(msg);
            closeChat();
        }
        if (e.key === "Escape") {
            e.preventDefault();
            closeChat();
        }
    });
}

function addChatHistory(text) {
    if (!chatMessages) return;
    const el = document.createElement("div");
    el.className = "chat-history-message";
    el.textContent = text;
    chatMessages.appendChild(el);
    while (chatMessages.children.length > SETTINGS.maxChatMessages) {
        chatMessages.firstElementChild.remove();
    }
}

const activeBubbles = [];
function layoutBubbles() {
    let y = 3.45;
    for (let i = 0; i < activeBubbles.length; i++) {
        activeBubbles[i].sprite.position.set(0, y, 0);
        y += activeBubbles[i].height + 0.04;
    }
}

function removeBubble(entry) {
    const idx = activeBubbles.indexOf(entry);
    if (idx === -1) return;
    if (entry.timer) clearTimeout(entry.timer);
    if (entry.sprite.parent) entry.sprite.parent.remove(entry.sprite);
    try {
        entry.texture.dispose();
        entry.material.dispose();
    } catch (e) {}
    activeBubbles.splice(idx, 1);
    layoutBubbles();
}

function createBubble(parentGroup, message) {
    while (activeBubbles.length >= SETTINGS.maxBubbles) removeBubble(activeBubbles[0]);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    ctx.font = "26px Arial";
    const pad = 10;
    const maxW = 360;
    const lineH = 30;
    const words = String(message).split(" ");
    const lines = [];
    let line = "";
    for (const w of words) {
        const t = line ? line + " " + w : w;
        if (ctx.measureText(t).width > maxW) {
            if (line) lines.push(line);
            line = w;
        } else line = t;
    }
    if (line) lines.push(line);
    let textW = 0;
    lines.forEach((l) => { textW = Math.max(textW, ctx.measureText(l).width); });
    const boxW = textW + pad * 2;
    const boxH = lines.length * lineH + pad * 2;
    const tailH = 14;
    canvas.width = Math.ceil(boxW + 8);
    canvas.height = Math.ceil(boxH + tailH + 4);
    ctx.font = "26px Arial";
    ctx.fillStyle = "#F2F2F2";
    ctx.strokeStyle = "rgba(30,30,30,0.75)";
    ctx.lineWidth = 2;
    const x = 4, y = 4, r = 8;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + boxW - r, y);
    ctx.quadraticCurveTo(x + boxW, y, x + boxW, y + r);
    ctx.lineTo(x + boxW, y + boxH - r);
    ctx.quadraticCurveTo(x + boxW, y + boxH, x + boxW - r, y + boxH);
    ctx.lineTo(x + r, y + boxH);
    ctx.quadraticCurveTo(x, y + boxH, x, y + boxH - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const cx = canvas.width / 2;
    const ty = y + boxH;
    ctx.beginPath();
    ctx.moveTo(cx - 9, ty);
    ctx.lineTo(cx, ty + tailH);
    ctx.lineTo(cx + 9, ty);
    ctx.closePath();
    ctx.fillStyle = "#F2F2F2";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - 9, ty);
    ctx.lineTo(cx, ty + tailH);
    ctx.lineTo(cx + 9, ty);
    ctx.stroke();
    ctx.fillStyle = "#111";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const startY = y + pad + lineH / 2;
    lines.forEach((l, i) => ctx.fillText(l, canvas.width / 2, startY + i * lineH));
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({
        map: texture, transparent: true, depthTest: false, depthWrite: false
    });
    const sprite = new THREE.Sprite(material);
    const scale = 0.0085;
    const worldH = canvas.height * scale;
    sprite.scale.set(canvas.width * scale, worldH, 1);
    sprite.renderOrder = 999;
    parentGroup.add(sprite);
    const entry = {
        sprite, texture, material, height: worldH,
        timer: setTimeout(() => removeBubble(entry), SETTINGS.bubbleTime)
    };
    activeBubbles.push(entry);
    layoutBubbles();
}

function sendChat(message) {
    addChatHistory(myName + ": " + message);
    createBubble(player, message);
    try {
        if (window.ternixDB && gameData.id) {
            window.ternixDB.ref("ternix_games/" + gameData.id + "/chat").push({
                user: myName, text: message, t: Date.now()
            });
        }
    } catch (e) {}
}

/* ===== MULTIPLAYER + ANTI-GHOST ===== */
let lastNetSend = 0;
let sessionRef = null;
let sessionsListener = null;
let chatListener = null;
const seenChatKeys = new Set();

function countAliveSessions(val, now) {
    let n = 0;
    Object.keys(val || {}).forEach((sid) => {
        const p = val[sid];
        if (p && now - (p.t || 0) <= SETTINGS.staleMs) n++;
    });
    return n;
}

function startFirebaseMultiplayer() {
    if (!window.ternixDB || !gameData.id) {
        const loading = document.getElementById("mp-loading");
        if (loading) loading.style.display = "none";
        return;
    }
    const base = "ternix_games/" + gameData.id;

    sessionRef = window.ternixDB.ref(base + "/sessions/" + mySessionId);
    sessionRef.set({
        user: myName,
        x: playerPosition.x,
        y: playerPosition.y,
        z: playerPosition.z,
        ry: player.rotation.y,
        t: Date.now()
    });
    sessionRef.onDisconnect().remove();

    sessionsListener = window.ternixDB.ref(base + "/sessions");
    sessionsListener.on("value", (snap) => {
        const val = snap.val() || {};
        const now = Date.now();
        const alive = new Set();

        Object.keys(val).forEach((sid) => {
            const p = val[sid];
            if (!p) return;

            // призрак — удаляем
            if (now - (p.t || 0) > SETTINGS.staleMs) {
                window.ternixDB.ref(base + "/sessions/" + sid).remove();
                return;
            }

            // тот же ник в другой сессии — оставляем только более свежую
            if (p.user === myName && sid !== mySessionId) {
                if ((p.t || 0) >= (val[mySessionId] && val[mySessionId].t || 0)) {
                    // нас уже заменили в этой же игре — кик
                    forceKick();
                    return;
                }
                window.ternixDB.ref(base + "/sessions/" + sid).remove();
                return;
            }

            if (sid === mySessionId) return;
            alive.add(sid);
            const r = ensureRemote(sid, p.user);
            if (!r) return;
            r.targetPos.set(p.x || 0, p.y || 0, p.z || 0);
            r.targetRot = p.ry || 0;
        });

        remotes.forEach((_, sid) => {
            if (!alive.has(sid)) removeRemote(sid);
        });

        // activePlayers = только живые (включая нас, если наша сессия жива)
        const totalAlive = countAliveSessions(val, now);
        setActivePlayers(totalAlive);
    });

    chatListener = window.ternixDB.ref(base + "/chat").limitToLast(15);
    chatListener.on("child_added", (snap) => {
        const key = snap.key;
        if (seenChatKeys.has(key)) return;
        seenChatKeys.add(key);
        const m = snap.val();
        if (!m || m.user === myName) return;
        if (Date.now() - (m.t || 0) > 60000) return;
        addChatHistory(m.user + ": " + m.text);
        remotes.forEach((r) => {
            if (r.user === m.user) createBubble(r.group, m.text);
        });
    });
}

function netTick(now) {
    if (!sessionRef) return;
    if (now - lastNetSend < 1000 / SETTINGS.netHz) return;
    lastNetSend = now;
    sessionRef.update({
        user: myName,
        x: playerPosition.x,
        y: playerPosition.y,
        z: playerPosition.z,
        ry: player.rotation.y,
        t: Date.now()
    });
}
function leaveSession() {
    try {
        if (sessionRef) {
            sessionRef.onDisconnect().cancel();
            sessionRef.remove();
            sessionRef = null;
        }
        if (sessionsListener) {
            sessionsListener.off();
            sessionsListener = null;
        }
        if (chatListener) {
            chatListener.off();
            chatListener = null;
        }

        const key = getAccountKey();
        if (key && window.ternixDB) {
            window.ternixDB.ref("ternix_users/" + key + "/sessionId").once("value").then((snap) => {
                if (snap.val() === mySessionId) {
                    window.ternixDB.ref("ternix_users/" + key).update({
                        sessionId: null,
                        playGameId: null,
                        playT: null
                    });
                }
            }).catch(() => {});
        }

        if (window.ternixDB && gameData.id) {
            const base = "ternix_games/" + gameData.id;
            // сразу убрать себя
            window.ternixDB.ref(base + "/sessions/" + mySessionId).remove();
            // пересчитать живых и записать
            window.ternixDB.ref(base + "/sessions").once("value").then((snap) => {
                const val = snap.val() || {};
                const now = Date.now();
                let n = 0;
                Object.keys(val).forEach((sid) => {
                    if (sid === mySessionId) return;
                    const p = val[sid];
                    if (p && (now - (p.t || 0)) <= SETTINGS.staleMs) n++;
                });
                window.ternixDB.ref(base + "/activePlayers").set(n);
            }).catch(() => {
                window.ternixDB.ref(base + "/activePlayers").set(0);
            });
        }
    } catch (e) {}
}

window.addEventListener("beforeunload", leaveSession);
startFirebaseMultiplayer();

/* ===== CURSOR ===== */
function resizeCursorImage(imgUrl, callback) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imgUrl;
    img.onload = function () {
        const c = document.createElement("canvas");
        c.width = 90; c.height = 90;
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
resizeCursorImage("cursor/Ternix 3 cursor.png", (url3) => {
    resizeCursorImage("cursor/Ternix 1 cursor.png", (urlDef) => {
        const s = document.createElement("style");
        s.innerHTML = `*{cursor:url('${urlDef}') 0 0,auto!important;}a,button,input,img{cursor:url('${url3}') 0 0,pointer!important;}`;
        document.head.appendChild(s);
    });
});

/* ===== LOOP ===== */
const clock = new THREE.Clock();
function gameLoop(now) {
    requestAnimationFrame(gameLoop);
    const delta = Math.min(clock.getDelta(), 0.05);
    updateMovement(delta);
    updatePhysics(delta);
    updateAnimation(delta);
    player.position.copy(playerPosition);
    updateCamera(delta);
    updateRemotes(delta);
    netTick(now || performance.now());
    renderer.render(scene, camera);
}
gameLoop();

window.addEventListener("resize", () => {
    forceLayout();
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(1);
});