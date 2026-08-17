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
    netHz: 8
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
const mySessionId = myName.replace(/\W/g, "_") + "_" + Math.random().toString(36).slice(2, 9);

let lastActiveWrite = 0;
function setActivePlayers(n) {
    const now = performance.now();
    if (now - lastActiveWrite < 2500) return;
    lastActiveWrite = now;
    try {
        if (window.ternixDB && gameData.id) {
            window.ternixDB.ref("ternix_games/" + gameData.id + "/activePlayers").set(n);
        }
    } catch (e) {}
}

document.getElementById("game-exit").addEventListener("click", () => {
    leaveSession();
    window.location.href = "game.html";
});

/* ===== THREE ===== */
const gameContainer = document.getElementById("game-container");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 50, 105);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 500);
const renderer = new THREE.WebGLRenderer({
    antialias: false,
    powerPreference: "high-performance",
    stencil: false
});
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

function tryFullscreen() {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) {
        el.requestFullscreen().catch(() => {});
    }
}
setTimeout(tryFullscreen, 500);

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
    const repeatX = Math.max(1, width * SETTINGS.studsPerUnit);
    const repeatY = Math.max(1, depth * SETTINGS.studsPerUnit);
    const key = "sh_" + color + "_" + repeatX + "x" + repeatY;
    if (materialCache.has(key)) return materialCache.get(key);
    const mat = new THREE.ShaderMaterial({
        uniforms: {
            map: { value: blockTexture },
            color: { value: new THREE.Color(color) },
            darkFactor: { value: 0.42 },
            repeat: { value: new THREE.Vector2(repeatX, repeatY) }
        },
        vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
        fragmentShader: `
            uniform sampler2D map;uniform vec3 color;uniform float darkFactor;uniform vec2 repeat;varying vec2 vUv;
            void main(){vec2 uv=fract(vUv*repeat);float mask=texture2D(map,uv).r;
            gl_FragColor=vec4(mix(color*darkFactor,color,mask),1.0);}`
    });
    materialCache.set(key, mat);
    return mat;
}

function createBlock({ x = 0, y = 1, z = 0, width = 2, height = 2, depth = 2, color = 0x4A9BD0, useTexture = true } = {}) {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const wantTex = useTexture !== false;
    const material = wantTex ? getShaderMaterial(color, width, depth) : getSolidMaterial(color);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.frustumCulled = true;
    mesh.userData = { width, height, depth, color, useTexture: wantTex };
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
    tryFullscreen();
}

function upgradeTextures() {
    for (const mesh of blockMeshes) {
        const d = mesh.userData;
        if (!d || d.useTexture === false) continue;
        mesh.material = getShaderMaterial(d.color, d.width, d.depth);
    }
}

textureLoader.load("./Textures/TernixBlockTextures.png", (tex) => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    blockTexture = tex;
    if (!mapBuilt) buildMap();
    else upgradeTextures();
}, undefined, () => { blockTexture = null; buildMap(); });
setTimeout(() => { if (!mapBuilt) buildMap(); }, 2000);

/* ===== CHARACTER (TernixGuy for everyone) ===== */
let sharedGuyTemplate = null;

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
    return sprite;
}

function makeBoxAvatar(group) {
    const skin = 0xc4a000;
    const parts = [
        [new THREE.BoxGeometry(1.1, 1.2, 0.55), 0x6a6a6a, 0, 1.5, 0],
        [new THREE.BoxGeometry(0.85, 0.85, 0.85), skin, 0, 2.45, 0],
        [new THREE.BoxGeometry(0.4, 1.1, 0.4), skin, -0.75, 1.5, 0],
        [new THREE.BoxGeometry(0.4, 1.1, 0.4), skin, 0.75, 1.5, 0],
        [new THREE.BoxGeometry(0.45, 1.2, 0.45), skin, -0.3, 0.6, 0],
        [new THREE.BoxGeometry(0.45, 1.2, 0.45), skin, 0.3, 0.6, 0]
    ];
    for (const [geo, col, x, y, z] of parts) {
        const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: col }));
        m.position.set(x, y, z);
        group.add(m);
    }
}

function fitCharacter(root) {
    root.traverse((o) => {
        if (!o.isMesh) return;
        o.frustumCulled = true;
        if (o.material) {
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach((m) => {
                if (m.map && !m.map.image) { m.map = null; m.needsUpdate = true; }
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

function addGuyToGroup(group) {
    if (sharedGuyTemplate) {
        const clone = sharedGuyTemplate.clone(true);
        group.add(clone);
        return;
    }
    makeBoxAvatar(group);
}

const player = new THREE.Group();
scene.add(player);
const playerPosition = new THREE.Vector3(0, 2, 8);
const velocity = new THREE.Vector3();
let verticalVelocity = 0;
let onGround = false;

new GLTFLoader().load("./TernixGuy.glb", (gltf) => {
    sharedGuyTemplate = fitCharacter(gltf.scene);
    // local player
    const local = sharedGuyTemplate.clone(true);
    player.add(local);
    createNameTag(player, myName);
}, undefined, () => {
    makeBoxAvatar(player);
    createNameTag(player, myName);
});

/* ===== REMOTES (same TernixGuy) ===== */
const remotes = new Map();

function ensureRemote(sessionId, user) {
    if (sessionId === mySessionId) return null;
    if (remotes.has(sessionId)) {
        const r = remotes.get(sessionId);
        if (user && r.user !== user) r.user = user;
        return r;
    }
    const group = new THREE.Group();
    addGuyToGroup(group);
    createNameTag(group, user || "Player");
    scene.add(group);
    const entry = {
        group,
        user: user || "Player",
        targetPos: new THREE.Vector3(0, 2, 0),
        targetRot: 0
    };
    remotes.set(sessionId, entry);
    setActivePlayers(1 + remotes.size);
    return entry;
}

function removeRemote(sessionId) {
    const r = remotes.get(sessionId);
    if (!r) return;
    scene.remove(r.group);
    remotes.delete(sessionId);
    setActivePlayers(1 + remotes.size);
}

function updateRemotes(delta) {
    remotes.forEach((r) => {
        r.group.position.lerp(r.targetPos, Math.min(1, delta * 10));
        let d = r.targetRot - r.group.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        r.group.rotation.y += d * Math.min(1, delta * 10);
    });
}

/* ===== INPUT ===== */
const keys = { W: false, A: false, S: false, D: false };
let chatOpen = false;
let spaceHeld = false;

window.addEventListener("keydown", (e) => {
    // chat /
    if (e.key === "/" && !chatOpen && e.target.tagName !== "INPUT") {
        e.preventDefault();
        openChat();
        return;
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
    velocity.x = velocity.z = 0;
}
window.addEventListener("blur", clearKeys);

let jumpSound = null, walkSound = null, walkSoundFailed = false;
try {
    jumpSound = new Audio("./Sounds/Jump.mp3");
    jumpSound.volume = 0.45;
} catch (e) {}
try {
    walkSound = new Audio("./Sounds/Walk (1).mp3");
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

let cameraYaw = 0, cameraPitch = 0.25, cameraDistance = SETTINGS.cameraDistance;
let rotatingCamera = false, cameraCurrentYaw = 0, cameraCurrentPitch = 0.25;

renderer.domElement.addEventListener("mousedown", (e) => {
    if (e.button === 2) { rotatingCamera = true; e.preventDefault(); }
});
document.addEventListener("mouseup", (e) => { if (e.button === 2) rotatingCamera = false; });
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

function collision(x, z, y) {
    const r = SETTINGS.playerRadius, bottom = y, top = y + SETTINGS.playerHeight;
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
    if (keys.W) { direction.x -= Math.sin(cameraYaw); direction.z -= Math.cos(cameraYaw); }
    if (keys.S) { direction.x += Math.sin(cameraYaw); direction.z += Math.cos(cameraYaw); }
    if (keys.A) { direction.x -= Math.cos(cameraYaw); direction.z += Math.sin(cameraYaw); }
    if (keys.D) { direction.x += Math.cos(cameraYaw); direction.z -= Math.sin(cameraYaw); }
    const moving = direction.lengthSq() > 0;
    if (moving) direction.normalize();
    const accel = moving ? SETTINGS.acceleration : SETTINGS.deceleration;
    velocity.x = approach(velocity.x, moving ? direction.x * SETTINGS.playerSpeed : 0, accel * delta);
    velocity.z = approach(velocity.z, moving ? direction.z * SETTINGS.playerSpeed : 0, accel * delta);
    const nx = playerPosition.x + velocity.x * delta;
    if (!collision(nx, playerPosition.z, playerPosition.y)) playerPosition.x = nx; else velocity.x = 0;
    const nz = playerPosition.z + velocity.z * delta;
    if (!collision(playerPosition.x, nz, playerPosition.y)) playerPosition.z = nz; else velocity.z = 0;
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
    chatBar.classList.add("active");
    chatPlaceholder.style.display = "none";
    chatInput.style.display = "block";
    chatInput.value = "";
    setTimeout(() => chatInput.focus(), 0);
}
function closeChat() {
    chatOpen = false;
    chatBar.classList.remove("active");
    chatInput.style.display = "none";
    chatPlaceholder.style.display = "block";
    chatInput.blur();
    clearKeys();
}
chatBar.addEventListener("click", openChat);
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

function addChatHistory(text) {
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
    try { entry.texture.dispose(); entry.material.dispose(); } catch (e) {}
    activeBubbles.splice(idx, 1);
    layoutBubbles();
}
function createBubble(parentGroup, message) {
    while (activeBubbles.length >= SETTINGS.maxBubbles) removeBubble(activeBubbles[0]);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const fontSize = 26;
    ctx.font = fontSize + "px Arial";
    const pad = 10, maxW = 360, lineH = 30;
    const words = String(message).split(" ");
    const lines = [];
    let line = "";
    for (const w of words) {
        const t = line ? line + " " + w : w;
        if (ctx.measureText(t).width > maxW) { if (line) lines.push(line); line = w; }
        else line = t;
    }
    if (line) lines.push(line);
    let textW = 0;
    lines.forEach(l => { textW = Math.max(textW, ctx.measureText(l).width); });
    const boxW = textW + pad * 2;
    const boxH = lines.length * lineH + pad * 2;
    const tailH = 14;
    canvas.width = Math.ceil(boxW + 8);
    canvas.height = Math.ceil(boxH + tailH + 4);
    ctx.font = fontSize + "px Arial";
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
    const cx = canvas.width / 2, ty = y + boxH;
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
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
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
                user: myName,
                text: message,
                t: Date.now()
            });
        }
    } catch (e) {}
}

/* ===== FIREBASE MULTIPLAYER (positions) ===== */
let lastNetSend = 0;
let sessionRef = null;
let sessionsListener = null;
let chatListener = null;
const seenChatKeys = new Set();

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
        const alive = new Set();
        Object.keys(val).forEach((sid) => {
            if (sid === mySessionId) return;
            alive.add(sid);
            const p = val[sid];
            const r = ensureRemote(sid, p.user);
            if (!r) return;
            r.targetPos.set(p.x || 0, p.y || 0, p.z || 0);
            r.targetRot = p.ry || 0;
        });
        remotes.forEach((_, sid) => {
            if (!alive.has(sid)) removeRemote(sid);
        });
        setActivePlayers(1 + remotes.size);
    });

    // chat from others
    chatListener = window.ternixDB.ref(base + "/chat").limitToLast(20);
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

    setActivePlayers(1);
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
        }
        if (sessionsListener) sessionsListener.off();
        if (chatListener) chatListener.off();
        setActivePlayers(Math.max(0, remotes.size));
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
resizeCursorImage("./cursor/Ternix 3 cursor.png", (url3) => {
    resizeCursorImage("./cursor/Ternix 1 cursor.png", (urlDef) => {
        const s = document.createElement("style");
        s.innerHTML = `*{cursor:url('${urlDef}') 0 0,auto!important;}
        a,a*,button,button*,input,img{cursor:url('${url3}') 0 0,pointer!important;}`;
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
