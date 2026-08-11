import * as THREE from "three";

import {
    GLTFLoader
} from "three/addons/loaders/GLTFLoader.js";


// =====================================================
// USER
// =====================================================

const username =
    sessionStorage.getItem(
        "ternixUsername"
    ) || "Player";


// =====================================================
// SETTINGS
// =====================================================

const SETTINGS = {

    speed: 7,

    acceleration: 55,

    deceleration: 75,

    gravity: 28,

    jumpPower: 10.8,

    playerHeight: 3,

    playerRadius: 0.45,

    cameraDistance: 7,

    cameraMinDistance: 2.5,

    cameraMaxDistance: 13,

    mouseSensitivity: 0.0035,

    chatTime: 5000,

    maxMessages: 10

};


// =====================================================
// SCENE
// =====================================================

const scene =
    new THREE.Scene();


scene.background =
    new THREE.Color(
        0x87CEEB
    );


scene.fog =
    new THREE.Fog(
        0x87CEEB,
        100,
        250
    );


// =====================================================
// CAMERA
// =====================================================

const camera =
    new THREE.PerspectiveCamera(

        70,

        window.innerWidth /
        window.innerHeight,

        0.1,

        500

    );


// =====================================================
// RENDERER
// =====================================================

const renderer =
    new THREE.WebGLRenderer({

        antialias: false,

        powerPreference:
            "high-performance",

        stencil: false

    });


renderer.setSize(

    window.innerWidth,

    window.innerHeight - 50

);


renderer.setPixelRatio(

    Math.min(

        window.devicePixelRatio,

        1

    )

);


renderer.outputColorSpace =
    THREE.SRGBColorSpace;


renderer.shadowMap.enabled =
    false;


document.body.appendChild(
    renderer.domElement
);


// =====================================================
// LIGHT
// =====================================================

const sunlight =
    new THREE.DirectionalLight(

        0xffffff,

        1.6

    );


sunlight.position.set(

    40,
    80,
    30

);


scene.add(
    sunlight
);


const ambient =
    new THREE.HemisphereLight(

        0xffffff,

        0x657080,

        1.2

    );


scene.add(
    ambient
);


// =====================================================
// BLOCK TEXTURE
// =====================================================

const loader =
    new THREE.TextureLoader();


const originalTexture =
    loader.load(

        "./Textures/TernixBlockTextures.png",

        () => {

            console.log(
                "Ternix block texture loaded."
            );

        },

        undefined,

        () => {

            console.warn(
                "Could not load TernixBlockTextures.png"
            );

        }

    );


originalTexture.colorSpace =
    THREE.SRGBColorSpace;


// =====================================================
// TEXTURE CACHE
// =====================================================

const textureCache =
    new Map();


// =====================================================
// COLOR HELPERS
// =====================================================

const BLOCK_COLORS = {

    blue: 0x4A9BD0,

    red: 0xD94B42,

    green: 0x4DAA58,

    yellow: 0xD8BD45,

    orange: 0xD77A3A,

    purple: 0x7959A8,

    grey: 0x929292,

    brown: 0x79513A

};


// =====================================================
// CREATE COLORED TEXTURE
// =====================================================

function createColoredTexture(
    color
) {

    const key =
        color.toString(16);


    if (
        textureCache.has(key)
    ) {

        return textureCache.get(key);

    }


    const image =
        originalTexture.image;


    if (!image) {

        return originalTexture;

    }


    const canvas =
        document.createElement(
            "canvas"
        );


    canvas.width =
        image.width;


    canvas.height =
        image.height;


    const ctx =
        canvas.getContext(
            "2d"
        );


    /*
    -----------------------------------------------------
    Рисуем оригинальную текстуру.

    Image smoothing выключен,
    чтобы сохранить старый pixel-like вид.
    -----------------------------------------------------
    */

    ctx.imageSmoothingEnabled =
        false;


    ctx.drawImage(

        image,

        0,

        0,

        canvas.width,

        canvas.height

    );


    const data =
        ctx.getImageData(

            0,

            0,

            canvas.width,

            canvas.height

        );


    const pixels =
        data.data;


    const rgb =
        hexToRGB(
            color
        );


    /*
    -----------------------------------------------------
    Берём цвет верхнего левого угла как цвет фона
    текстуры.

    Всё достаточно светлое / цветное перекрашиваем,
    а чёрный T и круг оставляем тёмными.
    -----------------------------------------------------
    */

    for (
        let i = 0;

        i < pixels.length;

        i += 4
    ) {

        const r =
            pixels[i];

        const g =
            pixels[i + 1];

        const b =
            pixels[i + 2];


        const brightness =
            (
                r +
                g +
                b
            ) / 3;


        /*
        Чёрный логотип сохраняем.
        */

        if (
            brightness < 90
        ) {

            continue;

        }


        /*
        Чем ближе пиксель к белому/серому фону,
        тем сильнее заменяем его цветом блока.
        */

        const amount =
            Math.min(

                1,

                Math.max(

                    0,

                    (
                        brightness -
                        90
                    ) / 130

                )

            );


        pixels[i] =
            Math.round(

                r * (1 - amount) +
                rgb.r * amount

            );


        pixels[i + 1] =
            Math.round(

                g * (1 - amount) +
                rgb.g * amount

            );


        pixels[i + 2] =
            Math.round(

                b * (1 - amount) +
                rgb.b * amount

            );

    }


    ctx.putImageData(
        data,
        0,
        0
    );


    const texture =
        new THREE.CanvasTexture(
            canvas
        );


    texture.colorSpace =
        THREE.SRGBColorSpace;


    texture.wrapS =
        THREE.RepeatWrapping;


    texture.wrapT =
        THREE.RepeatWrapping;


    /*
    -----------------------------------------------------
    ВОТ ГЛАВНОЕ.

    4 × 2 = 8 логотипов.

          T     T
        T     T
          T     T
        T     T

    -----------------------------------------------------
    */

    texture.repeat.set(
        4,
        2
    );


    texture.magFilter =
        THREE.NearestFilter;


    texture.minFilter =
        THREE.NearestMipmapLinearFilter;


    texture.anisotropy =
        1;


    textureCache.set(
        key,
        texture
    );


    return texture;
}


// =====================================================
// HEX TO RGB
// =====================================================

function hexToRGB(
    hex
) {

    return {

        r:
            (hex >> 16) & 255,

        g:
            (hex >> 8) & 255,

        b:
            hex & 255

    };

}


// =====================================================
// BLOCKS
// =====================================================

const blocks = [];


// =====================================================
// CREATE BLOCK
// =====================================================

function createBlock({

    x = 0,

    y = 0,

    z = 0,

    width = 2,

    height = 2,

    depth = 2,

    color = BLOCK_COLORS.blue

} = {}) {


    const geometry =
        new THREE.BoxGeometry(

            width,

            height,

            depth

        );


    const texture =
        createColoredTexture(
            color
        );


    const material =
        new THREE.MeshLambertMaterial({

            map: texture

        });


    const mesh =
        new THREE.Mesh(

            geometry,

            material

        );


    mesh.position.set(

        x,

        y,

        z

    );


    scene.add(
        mesh
    );


    blocks.push({

        minX:
            x - width / 2,

        maxX:
            x + width / 2,

        minY:
            y - height / 2,

        maxY:
            y + height / 2,

        minZ:
            z - depth / 2,

        maxZ:
            z + depth / 2

    });


    return mesh;

}


// =====================================================
// MAP
// =====================================================

createBlock({

    x: 0,

    y: -0.5,

    z: 0,

    width: 100,

    height: 1,

    depth: 100,

    color:
        BLOCK_COLORS.green

});


createBlock({

    x: 0,

    y: 1,

    z: -6,

    color:
        BLOCK_COLORS.blue

});


createBlock({

    x: 3,

    y: 1,

    z: -6,

    color:
        BLOCK_COLORS.red

});


createBlock({

    x: -3,

    y: 1,

    z: -6,

    color:
        BLOCK_COLORS.yellow

});


createBlock({

    x: 6,

    y: 1,

    z: -9,

    color:
        BLOCK_COLORS.green

});


createBlock({

    x: -6,

    y: 1,

    z: -9,

    color:
        BLOCK_COLORS.orange

});


createBlock({

    x: 0,

    y: 3,

    z: -10,

    color:
        BLOCK_COLORS.red

});


createBlock({

    x: 3,

    y: 3,

    z: -10,

    color:
        BLOCK_COLORS.blue

});


createBlock({

    x: 6,

    y: 5,

    z: -10,

    color:
        BLOCK_COLORS.green

});


// =====================================================
// PLAYER
// =====================================================

const player =
    new THREE.Group();


scene.add(
    player
);


const playerPosition =
    new THREE.Vector3(

        0,
        0,
        5

    );


const velocity =
    new THREE.Vector3();


let verticalVelocity =
    0;


let onGround =
    false;


// =====================================================
// PLAYER NAME
// =====================================================

function createNameTag(
    name
) {

    const canvas =
        document.createElement(
            "canvas"
        );


    canvas.width =
        512;


    canvas.height =
        96;


    const ctx =
        canvas.getContext(
            "2d"
        );


    ctx.clearRect(

        0,
        0,
        512,
        96

    );


    ctx.font =
        "bold 40px Arial";


    ctx.textAlign =
        "center";


    ctx.textBaseline =
        "middle";


    /*
    Чёрная тень.
    */

    ctx.fillStyle =
        "rgba(0,0,0,0.75)";


    ctx.fillText(

        name,

        258,
        50

    );


    /*
    Белый текст.
    */

    ctx.fillStyle =
        "white";


    ctx.fillText(

        name,

        256,
        48

    );


    const texture =
        new THREE.CanvasTexture(
            canvas
        );


    texture.colorSpace =
        THREE.SRGBColorSpace;


    const material =
        new THREE.SpriteMaterial({

            map: texture,

            transparent: true,

            depthTest: false

        });


    const sprite =
        new THREE.Sprite(
            material
        );


    sprite.position.set(

        0,

        4.8,

        0

    );


    sprite.scale.set(

        3.2,

        0.6,

        1

    );


    sprite.renderOrder =
        1000;


    player.add(
        sprite
    );

}


createNameTag(
    username
);


// =====================================================
// CHARACTER
// =====================================================

let character = null;

let mixer = null;

let walkAction = null;

let jumpAction = null;


const gltfLoader =
    new GLTFLoader();


gltfLoader.load(

    "./TernixGuy.glb",

    (gltf) => {

        character =
            gltf.scene;


        character.traverse(

            (object) => {

                if (
                    object.isMesh
                ) {

                    object.castShadow =
                        false;

                    object.receiveShadow =
                        false;

                    object.frustumCulled =
                        true;

                }

            }

        );


        const box =
            new THREE.Box3()
                .setFromObject(
                    character
                );


        const size =
            new THREE.Vector3();


        box.getSize(
            size
        );


        if (
            size.y > 0
        ) {

            const scale =
                SETTINGS.playerHeight /
                size.y;


            character.scale.setScalar(
                scale
            );

        }


        const newBox =
            new THREE.Box3()
                .setFromObject(
                    character
                );


        const center =
            new THREE.Vector3();


        newBox.getCenter(
            center
        );


        character.position.x -=
            center.x;


        character.position.z -=
            center.z;


        character.position.y -=
            newBox.min.y;


        player.add(
            character
        );


        if (
            gltf.animations.length
        ) {

            mixer =
                new THREE.AnimationMixer(
                    character
                );


            for (
                const clip
                of gltf.animations
            ) {

                const action =
                    mixer.clipAction(
                        clip
                    );


                const name =
                    clip.name.toLowerCase();


                if (
                    name.includes("walk") ||
                    name.includes("run")
                ) {

                    walkAction =
                        action;

                }


                if (
                    name.includes("jump")
                ) {

                    jumpAction =
                        action;

                }

            }

        }

    },

    undefined,

    (error) => {

        console.error(
            "TernixGuy loading error:",
            error
        );

    }

);


// =====================================================
// INPUT
// =====================================================

const keys = {

    w: false,

    a: false,

    s: false,

    d: false

};


let chatOpen =
    false;


function clearKeys() {

    keys.w = false;

    keys.a = false;

    keys.s = false;

    keys.d = false;

}


window.addEventListener(

    "blur",

    clearKeys

);


window.addEventListener(

    "keydown",

    (event) => {

        if (
            chatOpen
        ) {

            return;

        }


        if (
            event.code === "KeyW"
        ) keys.w = true;


        if (
            event.code === "KeyA"
        ) keys.a = true;


        if (
            event.code === "KeyS"
        ) keys.s = true;


        if (
            event.code === "KeyD"
        ) keys.d = true;


        if (
            event.code === "Space"
        ) {

            event.preventDefault();

            jump();

        }

    }

);


window.addEventListener(

    "keyup",

    (event) => {

        if (
            event.code === "KeyW"
        ) keys.w = false;


        if (
            event.code === "KeyA"
        ) keys.a = false;


        if (
            event.code === "KeyS"
        ) keys.s = false;


        if (
            event.code === "KeyD"
        ) keys.d = false;

    }

);


// =====================================================
// SOUNDS
// =====================================================

const jumpSound =
    new Audio(
        "./sounds/jump.mp3"
    );


jumpSound.volume =
    0.5;


const walkSound =
    new Audio(
        "./sounds/walk.mp3"
    );


walkSound.volume =
    0.18;


walkSound.loop =
    true;


function playJumpSound() {

    jumpSound.currentTime =
        0;


    jumpSound.play()
        .catch(
            () => {}
        );

}


function startWalkSound() {

    if (
        walkSound.paused
    ) {

        walkSound.play()
            .catch(
                () => {}
            );

    }

}


function stopWalkSound() {

    walkSound.pause();

    walkSound.currentTime =
        0;

}


// =====================================================
// JUMP
// =====================================================

function jump() {

    if (
        !onGround
    ) {

        return;

    }


    verticalVelocity =
        SETTINGS.jumpPower;


    onGround =
        false;


    playJumpSound();


    if (
        jumpAction
    ) {

        jumpAction
            .reset()
            .play();

    }

}


// =====================================================
// CAMERA
// =====================================================

let cameraYaw =
    0;


let cameraPitch =
    0.25;


let cameraDistance =
    SETTINGS.cameraDistance;


let rotatingCamera =
    false;


renderer.domElement.addEventListener(

    "contextmenu",

    (event) => {

        event.preventDefault();

    }

);


renderer.domElement.addEventListener(

    "mousedown",

    (event) => {

        if (
            event.button === 2
        ) {

            rotatingCamera =
                true;


            renderer.domElement
                .requestPointerLock()
                .catch(
                    () => {}
                );

        }

    }

);


window.addEventListener(

    "mouseup",

    (event) => {

        if (
            event.button === 2
        ) {

            rotatingCamera =
                false;


            if (
                document.pointerLockElement ===
                renderer.domElement
            ) {

                document.exitPointerLock();

            }

        }

    }

);


document.addEventListener(

    "mousemove",

    (event) => {

        if (
            !rotatingCamera
        ) {

            return;

        }


        cameraYaw -=
            event.movementX *
            SETTINGS.mouseSensitivity;


        cameraPitch -=
            event.movementY *
            SETTINGS.mouseSensitivity;


        cameraPitch =
            THREE.MathUtils.clamp(

                cameraPitch,

                -0.55,

                1.05

            );

    }

);


// =====================================================
// ZOOM
// =====================================================

renderer.domElement.addEventListener(

    "wheel",

    (event) => {

        cameraDistance +=
            event.deltaY *
            0.01;


        cameraDistance =
            THREE.MathUtils.clamp(

                cameraDistance,

                SETTINGS.cameraMinDistance,

                SETTINGS.cameraMaxDistance

            );


        event.preventDefault();

    },

    {
        passive: false
    }

);


// =====================================================
// COLLISION
// =====================================================

function collides(

    x,
    z,
    y

) {

    const radius =
        SETTINGS.playerRadius;


    const bottom =
        y;


    const top =
        y +
        SETTINGS.playerHeight;


    for (
        const block
        of blocks
    ) {

        if (
            top <= block.minY ||
            bottom >= block.maxY
        ) {

            continue;

        }


        const closestX =
            Math.max(

                block.minX,

                Math.min(
                    x,
                    block.maxX
                )

            );


        const closestZ =
            Math.max(

                block.minZ,

                Math.min(
                    z,
                    block.maxZ
                )

            );


        const dx =
            x -
            closestX;


        const dz =
            z -
            closestZ;


        if (
            dx * dx +
            dz * dz <
            radius * radius
        ) {

            return true;

        }

    }


    return false;

}


// =====================================================
// FLOOR
// =====================================================

function getFloor(

    x,
    z

) {

    let floor =
        0;


    const radius =
        SETTINGS.playerRadius;


    for (
        const block
        of blocks
    ) {

        if (
            x + radius <
            block.minX
        ) continue;


        if (
            x - radius >
            block.maxX
        ) continue;


        if (
            z + radius <
            block.minZ
        ) continue;


        if (
            z - radius >
            block.maxZ
        ) continue;


        floor =
            Math.max(

                floor,

                block.maxY

            );

    }


    return floor;

}


// =====================================================
// MOVEMENT
// =====================================================

const moveDirection =
    new THREE.Vector3();


const yAxis =
    new THREE.Vector3(
        0,
        1,
        0
    );


function updateMovement(
    delta
) {

    moveDirection.set(
        0,
        0,
        0
    );


    if (
        keys.w
    ) moveDirection.z -= 1;


    if (
        keys.s
    ) moveDirection.z += 1;


    if (
        keys.a
    ) moveDirection.x -= 1;


    if (
        keys.d
    ) moveDirection.x += 1;


    const moving =
        moveDirection.lengthSq() > 0;


    if (
        moving
    ) {

        moveDirection.normalize();


        moveDirection.applyAxisAngle(

            yAxis,

            cameraYaw

        );

    }


    const targetX =
        moving
            ? moveDirection.x *
              SETTINGS.speed
            : 0;


    const targetZ =
        moving
            ? moveDirection.z *
              SETTINGS.speed
            : 0;


    const rate =
        moving
            ? SETTINGS.acceleration
            : SETTINGS.deceleration;


    velocity.x =
        approach(

            velocity.x,

            targetX,

            rate * delta

        );


    velocity.z =
        approach(

            velocity.z,

            targetZ,

            rate * delta

        );


    const nextX =
        playerPosition.x +
        velocity.x *
        delta;


    if (
        !collides(

            nextX,

            playerPosition.z,

            playerPosition.y

        )
    ) {

        playerPosition.x =
            nextX;

    } else {

        velocity.x =
            0;

    }


    const nextZ =
        playerPosition.z +
        velocity.z *
        delta;


    if (
        !collides(

            playerPosition.x,

            nextZ,

            playerPosition.y

        )
    ) {

        playerPosition.z =
            nextZ;

    } else {

        velocity.z =
            0;

    }


    if (
        moving
    ) {

        const rotation =
            Math.atan2(

                moveDirection.x,

                moveDirection.z

            );


        let difference =
            rotation -
            player.rotation.y;


        difference =
            Math.atan2(

                Math.sin(
                    difference
                ),

                Math.cos(
                    difference
                )

            );


        player.rotation.y +=
            difference *
            Math.min(
                1,
                delta * 18
            );


        if (
            onGround
        ) {

            startWalkSound();

        }

    } else {

        stopWalkSound();

    }

}


// =====================================================
// APPROACH
// =====================================================

function approach(

    current,
    target,
    amount

) {

    if (
        current < target
    ) {

        return Math.min(

            current + amount,

            target

        );

    }


    if (
        current > target
    ) {

        return Math.max(

            current - amount,

            target

        );

    }


    return target;

}


// =====================================================
// PHYSICS
// =====================================================

function updatePhysics(
    delta
) {

    verticalVelocity -=
        SETTINGS.gravity *
        delta;


    verticalVelocity =
        Math.max(

            verticalVelocity,

            -35

        );


    playerPosition.y +=
        verticalVelocity *
        delta;


    const floor =
        getFloor(

            playerPosition.x,

            playerPosition.z

        );


    if (
        playerPosition.y <=
        floor
    ) {

        playerPosition.y =
            floor;


        verticalVelocity =
            0;


        onGround =
            true;

    } else {

        onGround =
            false;

    }

}


// =====================================================
// PLAYER UPDATE
// =====================================================

function updatePlayer() {

    player.position.copy(
        playerPosition
    );

}


// =====================================================
// CAMERA UPDATE
// =====================================================

function updateCamera() {

    const target =
        new THREE.Vector3(

            playerPosition.x,

            playerPosition.y + 1.6,

            playerPosition.z

        );


    const offset =
        new THREE.Vector3(

            0,

            0,

            cameraDistance

        );


    offset.applyAxisAngle(

        new THREE.Vector3(
            1,
            0,
            0
        ),

        cameraPitch

    );


    offset.applyAxisAngle(

        yAxis,

        cameraYaw

    );


    camera.position.copy(

        target.clone()
            .add(offset)

    );


    camera.lookAt(
        target
    );

}


// =====================================================
// ANIMATION
// =====================================================

function updateAnimation(
    delta
) {

    if (
        mixer
    ) {

        mixer.update(
            delta
        );

    }


    if (
        walkAction
    ) {

        const walking =
            velocity.lengthSq() >
            0.1 &&
            onGround;


        if (
            walking
        ) {

            if (
                !walkAction.isRunning()
            ) {

                walkAction
                    .reset()
                    .play();

            }

        } else {

            walkAction.stop();

        }

    }

}


// =====================================================
// CHAT
// =====================================================

const chatBar =
    document.getElementById(
        "chat-bar"
    );


const chatInput =
    document.getElementById(
        "chat-input"
    );


const chatPlaceholder =
    document.getElementById(
        "chat-placeholder"
    );


const chatMessages =
    document.getElementById(
        "chat-messages"
    );


chatBar.addEventListener(

    "click",

    openChat

);


window.addEventListener(

    "keydown",

    (event) => {

        if (
            event.key === "/" &&
            !chatOpen
        ) {

            event.preventDefault();

            openChat();

        }

    }

);


function openChat() {

    chatOpen =
        true;


    clearKeys();


    chatBar.classList.add(
        "active"
    );


    chatPlaceholder.style.display =
        "none";


    chatInput.style.display =
        "block";


    chatInput.value =
        "";


    chatInput.focus();

}


function closeChat() {

    chatOpen =
        false;


    chatBar.classList.remove(
        "active"
    );


    chatPlaceholder.style.display =
        "block";


    chatInput.style.display =
        "none";


    chatInput.blur();

}


chatInput.addEventListener(

    "keydown",

    (event) => {

        if (
            event.key === "Enter"
        ) {

            event.preventDefault();


            const message =
                chatInput.value.trim();


            if (
                message
            ) {

                sendChat(
                    message
                );

            }


            closeChat();

        }


        if (
            event.key === "Escape"
        ) {

            event.preventDefault();

            closeChat();

        }

    }

);


// =====================================================
// SEND CHAT
// =====================================================

function sendChat(
    text
) {

    const fullMessage =
        `${username}: ${text}`;


    addHistory(
        fullMessage
    );


    createBubble(
        fullMessage
    );

}


// =====================================================
// HISTORY
// =====================================================

function addHistory(
    message
) {

    const element =
        document.createElement(
            "div"
        );


    element.className =
        "chat-history-message";


    element.textContent =
        message;


    chatMessages.appendChild(
        element
    );


    while (
        chatMessages.children.length >
        SETTINGS.maxMessages
    ) {

        chatMessages.firstElementChild
            .remove();

    }


    setTimeout(

        () => {

            if (
                element.parentNode
            ) {

                element.remove();

            }

        },

        SETTINGS.chatTime

    );

}


// =====================================================
// BUBBLE
// =====================================================

function createBubble(
    text
) {

    const canvas =
        document.createElement(
            "canvas"
        );


    const ctx =
        canvas.getContext(
            "2d"
        );


    const fontSize =
        26;


    const paddingX =
        12;


    const paddingY =
        8;


    const maxWidth =
        360;


    ctx.font =
        `${fontSize}px Arial`;


    /*
    -----------------------------------------------------
    Разбиваем текст на строки.
    -----------------------------------------------------
    */

    const words =
        text.split(" ");


    const lines = [];

    let current =
        "";


    for (
        const word
        of words
    ) {

        const test =
            current
                ? `${current} ${word}`
                : word;


        if (
            ctx.measureText(
                test
            ).width >
            maxWidth
        ) {

            lines.push(
                current
            );


            current =
                word;

        } else {

            current =
                test;

        }

    }


    if (
        current
    ) {

        lines.push(
            current
        );

    }


    let textWidth =
        0;


    for (
        const line
        of lines
    ) {

        textWidth =
            Math.max(

                textWidth,

                ctx.measureText(
                    line
                ).width

            );

    }


    /*
    -----------------------------------------------------
    ВОТ ИСПРАВЛЕНИЕ ПУСТОГО МЕСТА.

    Bubble теперь практически равен размеру текста.
    -----------------------------------------------------
    */

    const width =
        Math.ceil(

            textWidth +
            paddingX * 2

        );


    const lineHeight =
        30;


    const height =
        lines.length *
        lineHeight +
        paddingY * 2;


    canvas.width =
        width + 8;


    canvas.height =
        height + 20;


    ctx.font =
        `${fontSize}px Arial`;


    ctx.textAlign =
        "center";


    ctx.textBaseline =
        "middle";


    const x = 4;

    const y = 4;

    const w =
        canvas.width - 8;

    const h =
        height;


    /*
    -----------------------------------------------------
    Тёмная внешняя граница
    -----------------------------------------------------
    */

    roundRect(

        ctx,

        x,

        y,

        w,

        h,

        9

    );


    ctx.fillStyle =
        "#F2F2F2";


    ctx.fill();


    ctx.lineWidth =
        3;


    ctx.strokeStyle =
        "rgba(30,30,30,0.75)";


    ctx.stroke();


    /*
    -----------------------------------------------------
    TEXT
    -----------------------------------------------------
    */

    ctx.fillStyle =
        "#111";


    const startY =
        h / 2 -
        (
            lines.length - 1
        ) *
        lineHeight /
        2;


    for (
        let i = 0;

        i < lines.length;

        i++
    ) {

        ctx.fillText(

            lines[i],

            canvas.width / 2,

            startY +
            i * lineHeight

        );

    }


    /*
    -----------------------------------------------------
    Tail
    -----------------------------------------------------
    */

    ctx.beginPath();


    ctx.moveTo(

        canvas.width / 2 - 10,

        h

    );


    ctx.lineTo(

        canvas.width / 2,

        h + 15

    );


    ctx.lineTo(

        canvas.width / 2 + 10,

        h

    );


    ctx.closePath();


    ctx.fillStyle =
        "#F2F2F2";


    ctx.fill();


    ctx.strokeStyle =
        "rgba(30,30,30,0.75)";


    ctx.lineWidth =
        2;


    ctx.stroke();


    const texture =
        new THREE.CanvasTexture(
            canvas
        );


    texture.colorSpace =
        THREE.SRGBColorSpace;


    texture.minFilter =
        THREE.LinearFilter;


    texture.magFilter =
        THREE.LinearFilter;


    const material =
        new THREE.SpriteMaterial({

            map: texture,

            transparent: true,

            depthTest: false,

            depthWrite: false

        });


    const sprite =
        new THREE.Sprite(
            material
        );


    /*
    -----------------------------------------------------
    Bubble находится над именем,
    а имя уже находится над головой.
    -----------------------------------------------------
    */

    sprite.position.set(

        0,

        5.6,

        0

    );


    const scale =
        0.0065;


    sprite.scale.set(

        canvas.width *
        scale,

        canvas.height *
        scale,

        1

    );


    sprite.renderOrder =
        2000;


    player.add(
        sprite
    );


    setTimeout(

        () => {

            player.remove(
                sprite
            );


            texture.dispose();


            material.dispose();

        },

        SETTINGS.chatTime

    );

}


// =====================================================
// ROUND RECT
// =====================================================

function roundRect(

    ctx,

    x,

    y,

    width,

    height,

    radius

) {

    ctx.beginPath();


    ctx.moveTo(

        x + radius,

        y

    );


    ctx.lineTo(

        x + width - radius,

        y

    );


    ctx.quadraticCurveTo(

        x + width,

        y,

        x + width,

        y + radius

    );


    ctx.lineTo(

        x + width,

        y + height - radius

    );


    ctx.quadraticCurveTo(

        x + width,

        y + height,

        x + width - radius,

        y + height

    );


    ctx.lineTo(

        x + radius,

        y + height

    );


    ctx.quadraticCurveTo(

        x,

        y + height,

        x,

        y + height - radius

    );


    ctx.lineTo(

        x,

        y + radius

    );


    ctx.quadraticCurveTo(

        x,

        y,

        x + radius,

        y

    );


    ctx.closePath();

}


// =====================================================
// EXIT
// =====================================================

document
    .getElementById(
        "exit-button"
    )
    .addEventListener(

        "click",

        () => {

            clearKeys();


            /*
            Выходим из игровой сессии.
            */

            sessionStorage.removeItem(
                "ternixLoggedIn"
            );


            sessionStorage.removeItem(
                "ternixUsername"
            );


            window.location.href =
                "page2.html";

        }

    );


// =====================================================
// GAME LOOP
// =====================================================

const clock =
    new THREE.Clock();


function gameLoop() {

    requestAnimationFrame(
        gameLoop
    );


    /*
    -----------------------------------------------------
    Если браузер подвис на несколько кадров,
    delta не станет огромным.
    -----------------------------------------------------
    */

    const delta =
        Math.min(

            clock.getDelta(),

            0.033

        );


    updateMovement(
        delta
    );


    updatePhysics(
        delta
    );


    updatePlayer();


    updateCamera();


    updateAnimation(
        delta
    );


    renderer.render(
        scene,
        camera
    );

}


gameLoop();


// =====================================================
// RESIZE
// =====================================================

window.addEventListener(

    "resize",

    () => {

        camera.aspect =
            window.innerWidth /
            (window.innerHeight - 50);


        camera.updateProjectionMatrix();


        renderer.setSize(

            window.innerWidth,

            window.innerHeight - 50

        );


        renderer.setPixelRatio(

            Math.min(

                window.devicePixelRatio,

                1

            )

        );

    }

);