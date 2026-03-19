import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

const canvas = document.querySelector('#game');
const menuEl = document.querySelector('#menu');
const menuLeadEl = document.querySelector('#menuLead');
const startButtonEl = document.querySelector('#startButton');
const hudEl = document.querySelector('#hud');
const promptEl = document.querySelector('#prompt');
const inventoryEl = document.querySelector('#inventory');
const moneyEl = document.querySelector('#money');
const toastEl = document.querySelector('#toast');
const dialogueEl = document.querySelector('#dialogue');
const flashEl = document.querySelector('#flash');
const noteOverlayEl = document.querySelector('#noteOverlay');
const closeNoteButtonEl = document.querySelector('#closeNoteButton');
const endingOverlayEl = document.querySelector('#endingOverlay');
const endingTitleEl = document.querySelector('#endingTitle');
const endingTextEl = document.querySelector('#endingText');
const restartButtonEl = document.querySelector('#restartButton');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0b10);
scene.fog = new THREE.FogExp2(0x07080d, 0.09);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 160);
camera.position.set(0, 1.65, 3.7);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const controls = new PointerLockControls(camera, document.body);
scene.add(controls.object);

const raycaster = new THREE.Raycaster();
const centerScreen = new THREE.Vector2(0, 0);
const clock = new THREE.Clock();

const room = {
  width: 9,
  height: 3.2,
  depth: 8.5,
  playerRadius: 0.45,
  doorwayWidth: 1.35,
  doorwayHeight: 2.3
};

const corridor = {
  width: 3.5,
  height: 3,
  length: 24,
  startZ: room.depth / 2 + 0.04,
  exitDoorWidth: 1.35,
  exitDoorHeight: 2.25
};

const keys = {
  forward: false,
  backward: false,
  left: false,
  right: false
};

const SOUND_ASSET_URLS = {
  doorCreak: 'https://actions.google.com/sounds/v1/doors/creaking_wooden_door.ogg',
  knock: 'https://actions.google.com/sounds/v1/doors/knock_on_wooden_door.ogg',
  footsteps: 'https://actions.google.com/sounds/v1/foley/distant_footsteps_on_wood.ogg',
  sneeze: 'https://actions.google.com/sounds/v1/human_voices/male_sneezing_into_arm.ogg',
  typing: 'https://actions.google.com/sounds/v1/office/keyboard_typing_fast.ogg'
};
const BACKGROUND_MUSIC_URL = 'https://actions.google.com/sounds/v1/horror/ambient_hum_pitched.ogg';

const gameState = {
  hasStarted: false,
  isReadingNote: false,
  noteRead: false,
  doorUnlocked: false,
  doorOpened: false,
  hasKeycard: false,
  exitOpened: false,
  activePrompt: null,
  maxZ: room.depth / 2 - room.playerRadius,
  money: 0,
  hits: 0,
  gameEnded: false,
  activeJump: null
};

const interactive = {
  noteMesh: null,
  worldSuitcase: null,
  heldSuitcase: null,
  entryDoor: null,
  keycard: null,
  exitDoor: null
};

const corridorState = {
  doorSlots: [],
  keycardSlot: null,
  jumpEvents: []
};

let velocityX = 0;
let velocityZ = 0;
let toastTimeoutId;
let flashTimeoutId;
let dialogueIntervalId;
let dialogueChain = Promise.resolve();

let entryDoorPivot;
let entryDoorTargetAngle = 0;
let entryDoorCurrentAngle = 0;

let exitDoorPivot;
let exitDoorTargetAngle = 0;
let exitDoorCurrentAngle = 0;

let soundUnlocked = false;
let footstepsTimer = 0;
let footstepsDistance = 0;
let lastFootstepX = null;
let lastFootstepZ = null;
let gameStartTimestampMs = 0;
let sneezePlayed = false;
let sneezeDueSec = 0;
let activeTypingAudio = null;
let mainDoorCreakPlayed = false;

const noteTexture = createNoteTexture();
const euroTexture = createEuroTexture();
const keycardTexture = createKeycardTexture();
const soundBank = createSoundBank();
const backgroundMusic = createBackgroundMusic();

buildScene();
registerEvents();
animate();

function buildScene() {
  const wallTexture = createNoiseTexture('#343946', 0.16);
  wallTexture.repeat.set(2.4, 1.25);

  const floorTexture = createNoiseTexture('#40392f', 0.24);
  floorTexture.repeat.set(3.2, 3.2);

  const ceilingTexture = createNoiseTexture('#2f3340', 0.1);
  ceilingTexture.repeat.set(2.3, 2.3);

  const roomFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(room.width, room.depth),
    new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.93, metalness: 0.08 })
  );
  roomFloor.rotation.x = -Math.PI / 2;
  roomFloor.receiveShadow = true;
  scene.add(roomFloor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(room.width, room.depth),
    new THREE.MeshStandardMaterial({ map: ceilingTexture, roughness: 0.95, metalness: 0.02 })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = room.height;
  scene.add(ceiling);

  buildWalls(wallTexture);

  const ambient = new THREE.AmbientLight(0x4f5770, 0.42);
  scene.add(ambient);

  const fill = new THREE.HemisphereLight(0x3a4665, 0x1a1714, 0.38);
  scene.add(fill);

  const moonLight = new THREE.DirectionalLight(0x7a87af, 0.34);
  moonLight.position.set(-2.6, 3, 2.8);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(1024, 1024);
  scene.add(moonLight);

  addWindow();
  addNatlexLogo();
  scene.add(createBed());
  scene.add(createNightstand());
  scene.add(createTableWithLampAndSuitcase());
  scene.add(createCorridor());
}

function buildWalls(wallTexture) {
  const wallMaterial = new THREE.MeshStandardMaterial({ map: wallTexture, roughness: 0.88, metalness: 0.04 });

  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(room.width, room.height), wallMaterial);
  backWall.position.set(0, room.height / 2, -room.depth / 2);
  scene.add(backWall);

  const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(room.depth, room.height), wallMaterial);
  leftWall.position.set(-room.width / 2, room.height / 2, 0);
  leftWall.rotation.y = Math.PI / 2;
  scene.add(leftWall);

  const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(room.depth, room.height), wallMaterial);
  rightWall.position.set(room.width / 2, room.height / 2, 0);
  rightWall.rotation.y = -Math.PI / 2;
  scene.add(rightWall);

  const frontZ = room.depth / 2;
  const thickness = 0.08;
  const sideWidth = (room.width - room.doorwayWidth) / 2;

  const leftFront = new THREE.Mesh(
    new THREE.BoxGeometry(sideWidth, room.height, thickness),
    new THREE.MeshStandardMaterial({ color: 0x373b48, roughness: 0.9 })
  );
  leftFront.position.set(-(room.doorwayWidth + sideWidth) / 2, room.height / 2, frontZ);

  const rightFront = new THREE.Mesh(
    new THREE.BoxGeometry(sideWidth, room.height, thickness),
    new THREE.MeshStandardMaterial({ color: 0x373b48, roughness: 0.9 })
  );
  rightFront.position.set((room.doorwayWidth + sideWidth) / 2, room.height / 2, frontZ);

  const topFront = new THREE.Mesh(
    new THREE.BoxGeometry(room.doorwayWidth, room.height - room.doorwayHeight, thickness),
    new THREE.MeshStandardMaterial({ color: 0x353949, roughness: 0.88 })
  );
  topFront.position.set(0, room.doorwayHeight + (room.height - room.doorwayHeight) / 2, frontZ);

  scene.add(leftFront, rightFront, topFront);

  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0xcccfd6, roughness: 0.55 });

  const frameTop = new THREE.Mesh(
    new THREE.BoxGeometry(room.doorwayWidth + 0.16, 0.08, 0.12),
    frameMaterial
  );
  frameTop.position.set(0, room.doorwayHeight + 0.04, frontZ - 0.015);

  const frameLeft = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, room.doorwayHeight, 0.12),
    frameMaterial
  );
  frameLeft.position.set(-room.doorwayWidth / 2 - 0.04, room.doorwayHeight / 2, frontZ - 0.015);

  const frameRight = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, room.doorwayHeight, 0.12),
    frameMaterial
  );
  frameRight.position.set(room.doorwayWidth / 2 + 0.04, room.doorwayHeight / 2, frontZ - 0.015);

  scene.add(frameTop, frameLeft, frameRight);

  entryDoorPivot = new THREE.Group();
  entryDoorPivot.position.set(-room.doorwayWidth / 2, 0, frontZ - 0.025);

  const door = new THREE.Mesh(
    new THREE.BoxGeometry(room.doorwayWidth, room.doorwayHeight, 0.06),
    new THREE.MeshStandardMaterial({ color: 0xf3f4f7, roughness: 0.56, metalness: 0.04 })
  );
  door.position.set(room.doorwayWidth / 2, room.doorwayHeight / 2, 0);
  door.castShadow = true;
  door.receiveShadow = true;

  const handle = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0x5f6065, metalness: 0.75, roughness: 0.25 })
  );
  handle.position.set(room.doorwayWidth - 0.14, room.doorwayHeight / 2, -0.02);

  entryDoorPivot.add(door, handle);
  scene.add(entryDoorPivot);

  interactive.entryDoor = door;
}

function addWindow() {
  const frame = new THREE.Group();
  const windowWidth = 1.14;
  const windowHeight = 0.84;
  const windowX = -1.45;
  const windowY = 1.75;
  const windowZ = -room.depth / 2 + 0.04;

  const borderMaterial = new THREE.MeshStandardMaterial({ color: 0xc8ced9, roughness: 0.48, metalness: 0.08 });
  const glassMaterial = new THREE.MeshBasicMaterial({
    color: 0x6f86a5,
    transparent: true,
    opacity: 0.28
  });

  const top = new THREE.Mesh(new THREE.BoxGeometry(windowWidth + 0.12, 0.06, 0.05), borderMaterial);
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(windowWidth + 0.12, 0.06, 0.05), borderMaterial);
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.06, windowHeight + 0.12, 0.05), borderMaterial);
  const right = new THREE.Mesh(new THREE.BoxGeometry(0.06, windowHeight + 0.12, 0.05), borderMaterial);
  const middleVertical = new THREE.Mesh(new THREE.BoxGeometry(0.04, windowHeight + 0.02, 0.04), borderMaterial);
  const middleHorizontal = new THREE.Mesh(new THREE.BoxGeometry(windowWidth + 0.02, 0.04, 0.04), borderMaterial);

  top.position.y = windowHeight / 2 + 0.03;
  bottom.position.y = -windowHeight / 2 - 0.03;
  left.position.x = -windowWidth / 2 - 0.03;
  right.position.x = windowWidth / 2 + 0.03;

  const glass = new THREE.Mesh(new THREE.PlaneGeometry(windowWidth, windowHeight), glassMaterial);

  frame.add(top, bottom, left, right, middleVertical, middleHorizontal, glass);
  frame.position.set(windowX, windowY, windowZ);
  frame.rotation.y = Math.PI;
  scene.add(frame);

  const outsideDark = new THREE.Mesh(
    new THREE.PlaneGeometry(windowWidth + 0.55, windowHeight + 0.42),
    new THREE.MeshBasicMaterial({ color: 0x0b111d })
  );
  outsideDark.position.set(windowX, windowY, windowZ - 0.26);
  outsideDark.rotation.y = Math.PI;
  scene.add(outsideDark);

  const moonBeam = new THREE.SpotLight(0x8ea6c7, 0.34, 10, Math.PI / 7, 0.45, 1.4);
  moonBeam.position.set(windowX - 0.3, windowY + 0.35, windowZ - 0.35);
  moonBeam.target.position.set(windowX - 0.75, 0.35, -2.0);
  scene.add(moonBeam, moonBeam.target);
}

function addNatlexLogo() {
  const logoCanvas = document.createElement('canvas');
  logoCanvas.width = 1024;
  logoCanvas.height = 256;

  const ctx = logoCanvas.getContext('2d');
  ctx.clearRect(0, 0, logoCanvas.width, logoCanvas.height);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fillRect(0, 0, logoCanvas.width, logoCanvas.height);
  ctx.font = 'bold 170px Trebuchet MS';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#90ff9f';
  ctx.shadowBlur = 36;
  ctx.fillStyle = '#adffb2';
  ctx.fillText('NATLEX', logoCanvas.width / 2, logoCanvas.height / 2);

  const logoTexture = new THREE.CanvasTexture(logoCanvas);
  logoTexture.colorSpace = THREE.SRGBColorSpace;

  const logo = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 0.45),
    new THREE.MeshBasicMaterial({ map: logoTexture, transparent: true })
  );
  logo.position.set(-room.width / 2 + 0.02, 1.88, -2.2);
  logo.rotation.y = Math.PI / 2;
  scene.add(logo);

  const logoGlow = new THREE.PointLight(0x8cf2a4, 0.38, 2.5, 2);
  logoGlow.position.set(-room.width / 2 + 0.5, 1.84, -2.2);
  scene.add(logoGlow);
}

function createNoiseTexture(hexColor, noiseStrength) {
  const size = 256;
  const canvasTexture = document.createElement('canvas');
  canvasTexture.width = size;
  canvasTexture.height = size;

  const context = canvasTexture.getContext('2d');
  const base = new THREE.Color(hexColor);

  context.fillStyle = `rgb(${Math.floor(base.r * 255)}, ${Math.floor(base.g * 255)}, ${Math.floor(base.b * 255)})`;
  context.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const jitter = (Math.random() - 0.5) * noiseStrength * 255;
      const red = THREE.MathUtils.clamp(base.r * 255 + jitter, 0, 255);
      const green = THREE.MathUtils.clamp(base.g * 255 + jitter, 0, 255);
      const blue = THREE.MathUtils.clamp(base.b * 255 + jitter, 0, 255);
      context.fillStyle = `rgb(${red}, ${green}, ${blue})`;
      context.fillRect(x, y, 1, 1);
    }
  }

  const texture = new THREE.CanvasTexture(canvasTexture);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createNoteTexture() {
  const noteCanvas = document.createElement('canvas');
  noteCanvas.width = 1024;
  noteCanvas.height = 512;

  const ctx = noteCanvas.getContext('2d');
  ctx.fillStyle = '#f1e8d1';
  ctx.fillRect(0, 0, noteCanvas.width, noteCanvas.height);

  ctx.fillStyle = '#8d826e';
  for (let i = 0; i < 600; i += 1) {
    ctx.fillRect(Math.random() * noteCanvas.width, Math.random() * noteCanvas.height, 1, 1);
  }

  ctx.fillStyle = '#332b22';
  ctx.font = '34px Georgia';
  const lines = [
    'Привет, учредитель Natlex.',
    'Спасибо за работу, но пора',
    'платить по счетам партнёрам.',
    'Мы скоро придём......'
  ];

  lines.forEach((line, index) => {
    ctx.fillText(line, 50, 90 + index * 95);
  });

  const texture = new THREE.CanvasTexture(noteCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createEuroTexture() {
  const euroCanvas = document.createElement('canvas');
  euroCanvas.width = 320;
  euroCanvas.height = 320;

  const ctx = euroCanvas.getContext('2d');
  ctx.clearRect(0, 0, 320, 320);
  ctx.fillStyle = '#e9d7a1';
  ctx.font = 'bold 245px Georgia';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#c69a3d';
  ctx.shadowBlur = 24;
  ctx.fillText('€', 160, 174);

  const texture = new THREE.CanvasTexture(euroCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createKeycardTexture() {
  const cardCanvas = document.createElement('canvas');
  cardCanvas.width = 512;
  cardCanvas.height = 320;

  const ctx = cardCanvas.getContext('2d');
  ctx.fillStyle = '#d4e6ff';
  ctx.fillRect(0, 0, 512, 320);

  ctx.fillStyle = '#9ab2ce';
  ctx.fillRect(0, 0, 512, 72);

  ctx.fillStyle = '#1f2f45';
  ctx.font = 'bold 48px Trebuchet MS';
  ctx.fillText('NATLEX ACCESS', 22, 49);

  ctx.fillStyle = '#3a4e6a';
  ctx.font = '30px Trebuchet MS';
  ctx.fillText('SERVICE LEVEL', 22, 126);
  ctx.fillText('AUTHORIZED', 22, 170);

  const texture = new THREE.CanvasTexture(cardCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createBed() {
  const bed = new THREE.Group();

  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.35, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x2b221b, roughness: 0.9 })
  );
  frame.position.y = 0.18;
  frame.castShadow = true;
  frame.receiveShadow = true;

  const mattress = new THREE.Mesh(
    new THREE.BoxGeometry(2.05, 0.3, 1.1),
    new THREE.MeshStandardMaterial({ color: 0xbab5a4, roughness: 0.95 })
  );
  mattress.position.y = 0.5;
  mattress.castShadow = true;

  const pillow = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.14, 0.42),
    new THREE.MeshStandardMaterial({ color: 0xd8d4c5, roughness: 0.8 })
  );
  pillow.position.set(-0.64, 0.71, 0.25);
  pillow.castShadow = true;

  bed.add(frame, mattress, pillow);
  bed.position.set(-2.35, 0, -2.15);
  return bed;
}

function createNightstand() {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.72, 0.52),
    new THREE.MeshStandardMaterial({ color: 0x463428, roughness: 0.84 })
  );
  body.position.y = 0.36;
  body.castShadow = true;
  body.receiveShadow = true;

  const drawerLine = new THREE.Mesh(
    new THREE.BoxGeometry(0.52, 0.04, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x1f1812, roughness: 0.9 })
  );
  drawerLine.position.set(0, 0.36, 0.26);

  group.add(body, drawerLine);
  group.position.set(-1.2, 0, -2.08);
  return group;
}

function createTableWithLampAndSuitcase() {
  const group = new THREE.Group();

  const top = new THREE.Mesh(
    new THREE.BoxGeometry(1.35, 0.1, 0.8),
    new THREE.MeshStandardMaterial({ color: 0x4f3928, roughness: 0.84 })
  );
  top.position.y = 0.88;
  top.castShadow = true;

  const legGeometry = new THREE.BoxGeometry(0.1, 0.82, 0.1);
  const legMaterial = new THREE.MeshStandardMaterial({ color: 0x3c2e21, roughness: 0.88 });
  const legPositions = [
    [-0.58, 0.41, -0.33],
    [0.58, 0.41, -0.33],
    [-0.58, 0.41, 0.33],
    [0.58, 0.41, 0.33]
  ];

  legPositions.forEach((position) => {
    const leg = new THREE.Mesh(legGeometry, legMaterial);
    leg.position.set(position[0], position[1], position[2]);
    leg.castShadow = true;
    group.add(leg);
  });

  const lampBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.15, 0.07, 22),
    new THREE.MeshStandardMaterial({ color: 0x2b2524, metalness: 0.65, roughness: 0.35 })
  );
  lampBase.position.set(-0.39, 0.94, -0.12);

  const lampStand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 0.55, 16),
    new THREE.MeshStandardMaterial({ color: 0x474039, metalness: 0.5, roughness: 0.35 })
  );
  lampStand.position.set(-0.39, 1.21, -0.12);

  const lampShade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.18, 0.24, 24, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xe8dfbe, roughness: 0.58, side: THREE.DoubleSide })
  );
  lampShade.position.set(-0.39, 1.35, -0.12);

  const lampBulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.043, 18, 18),
    new THREE.MeshStandardMaterial({ color: 0xfff8d5, emissive: 0xffe3aa, emissiveIntensity: 1.3 })
  );
  lampBulb.position.set(-0.39, 1.28, -0.12);

  const lampLight = new THREE.PointLight(0xffdea0, 3.18, 10.4, 2);
  lampLight.position.set(-0.39, 1.28, -0.12);
  lampLight.castShadow = true;
  lampLight.shadow.mapSize.set(1024, 1024);

  const worldSuitcase = createSuitcaseMesh();
  worldSuitcase.position.set(0.17, 1.05, 0);

  const noteMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.37, 0.23),
    new THREE.MeshStandardMaterial({
      map: noteTexture,
      color: 0xffffff,
      roughness: 0.79,
      side: THREE.DoubleSide
    })
  );
  noteMesh.position.set(0.17, 1.237, 0.01);
  noteMesh.rotation.x = -Math.PI / 2;
  noteMesh.rotation.z = 0.015;
  noteMesh.castShadow = true;

  interactive.noteMesh = noteMesh;
  interactive.worldSuitcase = worldSuitcase;

  interactive.heldSuitcase = createSuitcaseMesh(0.35);
  interactive.heldSuitcase.position.set(0.34, -0.25, -0.66);
  interactive.heldSuitcase.rotation.set(0.12, -0.32, -0.06);
  interactive.heldSuitcase.visible = false;
  camera.add(interactive.heldSuitcase);

  group.add(top, lampBase, lampStand, lampShade, lampBulb, lampLight, worldSuitcase, noteMesh);
  group.position.set(2.55, 0, -2.35);

  return group;
}

function createSuitcaseMesh(scale = 1) {
  const group = new THREE.Group();

  const caseBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.9 * scale, 0.34 * scale, 0.54 * scale),
    new THREE.MeshStandardMaterial({ color: 0x2b2724, roughness: 0.72, metalness: 0.16 })
  );
  caseBody.castShadow = true;
  caseBody.receiveShadow = true;

  const edge = new THREE.Mesh(
    new THREE.BoxGeometry(0.92 * scale, 0.07 * scale, 0.56 * scale),
    new THREE.MeshStandardMaterial({ color: 0x5e544b, roughness: 0.62 })
  );
  edge.position.y = 0.17 * scale;

  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.12 * scale, 0.018 * scale, 12, 20, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0x1f1c19, roughness: 0.47, metalness: 0.62 })
  );
  handle.position.set(0, 0.24 * scale, 0);
  handle.rotation.x = Math.PI;

  const euroMark = new THREE.Mesh(
    new THREE.PlaneGeometry(0.25 * scale, 0.25 * scale),
    new THREE.MeshBasicMaterial({ map: euroTexture, transparent: true })
  );
  euroMark.position.set(0, 0.17 * scale, 0.2745 * scale);

  group.add(caseBody, edge, handle, euroMark);
  return group;
}

function createCorridor() {
  const corridorGroup = new THREE.Group();
  corridorGroup.position.z = corridor.startZ;

  const floorTexture = createNoiseTexture('#2e2d2f', 0.24);
  floorTexture.repeat.set(2.6, 11);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(corridor.width, corridor.length),
    new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.95, metalness: 0.03 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = corridor.length / 2;
  floor.receiveShadow = true;
  corridorGroup.add(floor);

  const outerPad = new THREE.Mesh(
    new THREE.PlaneGeometry(corridor.width, 4),
    new THREE.MeshStandardMaterial({ color: 0x10151d, roughness: 0.92 })
  );
  outerPad.rotation.x = -Math.PI / 2;
  outerPad.position.z = corridor.length + 2;
  outerPad.receiveShadow = true;
  corridorGroup.add(outerPad);

  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x2d3039, roughness: 0.9 });

  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.08, corridor.height, corridor.length), wallMaterial);
  leftWall.position.set(-corridor.width / 2, corridor.height / 2, corridor.length / 2);

  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.08, corridor.height, corridor.length), wallMaterial);
  rightWall.position.set(corridor.width / 2, corridor.height / 2, corridor.length / 2);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(corridor.width, corridor.length),
    new THREE.MeshStandardMaterial({ color: 0x242830, roughness: 0.95 })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, corridor.height, corridor.length / 2);

  corridorGroup.add(leftWall, rightWall, ceiling);

  for (let i = 0; i < 5; i += 1) {
    const light = new THREE.PointLight(0xa4b7cb, 0.24, 7.7, 2.2);
    light.position.set(0, corridor.height - 0.3, 2.1 + i * 4.8);
    corridorGroup.add(light);
  }

  const doorMaterial = new THREE.MeshStandardMaterial({ color: 0x979faa, roughness: 0.7 });
  const slotStep = 3.2;
  const slotCountPerSide = 6;

  for (let i = 0; i < slotCountPerSide; i += 1) {
    const z = 2 + i * slotStep;

    [1, -1].forEach((side) => {
      const sideDoor = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.1, 0.05), doorMaterial);
      sideDoor.position.set(side * (corridor.width / 2 - 0.025), 1.05, z);
      const closedRotation = side === 1 ? Math.PI / 2 : -Math.PI / 2;
      sideDoor.rotation.y = closedRotation;
      corridorGroup.add(sideDoor);

      corridorState.doorSlots.push({
        side,
        z,
        doorMesh: sideDoor,
        closedRotation,
        openRotation: closedRotation + (side === 1 ? -1 : 1) * 0.95,
        currentRotation: closedRotation,
        targetRotation: closedRotation
      });
    });
  }

  placeKeycard(corridorGroup);
  buildExitDoor(corridorGroup);
  createPartnerEvents();

  return corridorGroup;
}

function placeKeycard(corridorGroup) {
  const candidates = corridorState.doorSlots.filter((slot) => slot.z > 6 && slot.z < 14);
  corridorState.keycardSlot = candidates[Math.floor(Math.random() * candidates.length)] ?? corridorState.doorSlots[2];

  const pedestal = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.8, 0.22),
    new THREE.MeshStandardMaterial({ color: 0x3a3f4c, roughness: 0.84 })
  );
  pedestal.position.set(
    corridorState.keycardSlot.side * (corridor.width / 2 - 0.23),
    0.4,
    corridorState.keycardSlot.z
  );

  const keycard = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.14, 0.02),
    new THREE.MeshStandardMaterial({ map: keycardTexture, roughness: 0.5, metalness: 0.06 })
  );
  keycard.position.set(
    corridorState.keycardSlot.side * (corridor.width / 2 - 0.23),
    0.87,
    corridorState.keycardSlot.z
  );
  keycard.rotation.y = corridorState.keycardSlot.side > 0 ? -Math.PI / 2 : Math.PI / 2;
  keycard.rotation.x = -0.12;
  keycard.castShadow = true;

  const cardGlow = new THREE.PointLight(0x9dc4ff, 0.42, 2.4, 2.3);
  cardGlow.position.copy(keycard.position);

  corridorGroup.add(pedestal, keycard, cardGlow);
  interactive.keycard = keycard;
}

function buildExitDoor(corridorGroup) {
  const frontZ = corridor.length;
  const wallThickness = 0.08;

  const sideWidth = (corridor.width - corridor.exitDoorWidth) / 2;

  const leftFront = new THREE.Mesh(
    new THREE.BoxGeometry(sideWidth, corridor.height, wallThickness),
    new THREE.MeshStandardMaterial({ color: 0x343946, roughness: 0.86 })
  );
  leftFront.position.set(-(corridor.exitDoorWidth + sideWidth) / 2, corridor.height / 2, frontZ);

  const rightFront = new THREE.Mesh(
    new THREE.BoxGeometry(sideWidth, corridor.height, wallThickness),
    new THREE.MeshStandardMaterial({ color: 0x343946, roughness: 0.86 })
  );
  rightFront.position.set((corridor.exitDoorWidth + sideWidth) / 2, corridor.height / 2, frontZ);

  const topFront = new THREE.Mesh(
    new THREE.BoxGeometry(corridor.exitDoorWidth, corridor.height - corridor.exitDoorHeight, wallThickness),
    new THREE.MeshStandardMaterial({ color: 0x343946, roughness: 0.86 })
  );
  topFront.position.set(
    0,
    corridor.exitDoorHeight + (corridor.height - corridor.exitDoorHeight) / 2,
    frontZ
  );

  corridorGroup.add(leftFront, rightFront, topFront);

  exitDoorPivot = new THREE.Group();
  exitDoorPivot.position.set(-corridor.exitDoorWidth / 2, 0, frontZ - 0.025);

  const exitDoor = new THREE.Mesh(
    new THREE.BoxGeometry(corridor.exitDoorWidth, corridor.exitDoorHeight, 0.06),
    new THREE.MeshStandardMaterial({ color: 0xdde6f4, roughness: 0.54, metalness: 0.04 })
  );
  exitDoor.position.set(corridor.exitDoorWidth / 2, corridor.exitDoorHeight / 2, 0);
  exitDoor.castShadow = true;
  exitDoor.receiveShadow = true;

  const exitLabel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.64, 0.22),
    new THREE.MeshBasicMaterial({ color: 0x95ff9b })
  );
  exitLabel.position.set(corridor.exitDoorWidth / 2, corridor.exitDoorHeight + 0.2, -0.03);

  exitDoorPivot.add(exitDoor, exitLabel);
  corridorGroup.add(exitDoorPivot);
  interactive.exitDoor = exitDoor;
}

function createPartnerEvents() {
  const eventCount = 2 + Math.floor(Math.random() * 3);

  const blockedKey = `${corridorState.keycardSlot.side}:${corridorState.keycardSlot.z}`;
  const availableSlots = corridorState.doorSlots.filter((slot) => `${slot.side}:${slot.z}` !== blockedKey);

  const selectedSlots = [...availableSlots]
    .sort(() => Math.random() - 0.5)
    .slice(0, eventCount)
    .sort((a, b) => a.z - b.z);

  const names = generatePartnerNames(selectedSlots.length);

  selectedSlots.forEach((slot, index) => {
    const faceMesh = createScreamerFace();
    faceMesh.visible = false;
    faceMesh.position.set(slot.side * (corridor.width / 2 - 0.08), 1.25, slot.z + corridor.startZ);
    faceMesh.rotation.y = slot.side === 1 ? -Math.PI / 2 : Math.PI / 2;
    scene.add(faceMesh);

    corridorState.jumpEvents.push({
      slot,
      triggerZ: slot.z + corridor.startZ - 0.35,
      name: names[index],
      faceMesh,
      triggered: false
    });
  });
}

function generatePartnerNames(count) {
  const germanPool = ['Klaus', 'Hans', 'Friedrich', 'Wolfgang', 'Matthias', 'Johann', 'Dieter', 'Heinrich', 'Otto', 'Karl'];
  const names = ['Leo'];

  while (names.length < count) {
    const candidate = germanPool[Math.floor(Math.random() * germanPool.length)];

    if (!names.includes(candidate) || names.length >= germanPool.length) {
      names.push(candidate);
    }
  }

  return names;
}

function createScreamerFace() {
  const faceCanvas = document.createElement('canvas');
  faceCanvas.width = 512;
  faceCanvas.height = 512;

  const ctx = faceCanvas.getContext('2d');
  ctx.fillStyle = 'rgba(12, 12, 16, 0.0)';
  ctx.fillRect(0, 0, 512, 512);

  ctx.fillStyle = '#0c0d11';
  ctx.beginPath();
  ctx.ellipse(256, 260, 150, 185, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#171922';
  ctx.beginPath();
  ctx.ellipse(256, 260, 128, 165, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ff3d3d';
  ctx.beginPath();
  ctx.arc(206, 230, 22, 0, Math.PI * 2);
  ctx.arc(306, 230, 22, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#0a0000';
  ctx.beginPath();
  ctx.ellipse(256, 318, 46, 66, 0, 0, Math.PI * 2);
  ctx.fill();

  const faceTexture = new THREE.CanvasTexture(faceCanvas);
  faceTexture.colorSpace = THREE.SRGBColorSpace;

  const faceMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.56, 0.72),
    new THREE.MeshBasicMaterial({ map: faceTexture, transparent: true })
  );

  return faceMesh;
}

function registerEvents() {
  startButtonEl.addEventListener('click', () => {
    if (gameState.gameEnded) {
      return;
    }

    gameState.hasStarted = true;
    hudEl.classList.remove('hidden');
    menuEl.classList.add('hidden');
    unlockAudio();
    startBackgroundMusic();

    if (gameStartTimestampMs === 0) {
      gameStartTimestampMs = performance.now();
      sneezePlayed = false;
      sneezeDueSec = THREE.MathUtils.randFloat(22, 62);
    }

    controls.lock();
    showToast('Осмотрись. На столе лежит чемодан и записка.');
  });

  restartButtonEl.addEventListener('click', () => {
    window.location.reload();
  });

  controls.addEventListener('unlock', () => {
    if (gameState.isReadingNote || gameState.gameEnded) {
      return;
    }

    menuLeadEl.textContent = 'Пауза. Нажми "Продолжить", чтобы вернуться в игру.';
    menuEl.classList.remove('hidden');
    startButtonEl.textContent = gameState.hasStarted ? 'Продолжить' : 'Начать игру';
  });

  controls.addEventListener('lock', () => {
    menuEl.classList.add('hidden');
  });

  closeNoteButtonEl.addEventListener('click', () => {
    closeNote();
  });

  window.addEventListener('keydown', (event) => {
    unlockAudio();

    if (event.code === 'KeyW') keys.forward = true;
    if (event.code === 'KeyS') keys.backward = true;
    if (event.code === 'KeyA') keys.left = true;
    if (event.code === 'KeyD') keys.right = true;

    if (event.code === 'Tab' && controls.isLocked && !gameState.isReadingNote && !gameState.gameEnded) {
      event.preventDefault();
      controls.unlock();
      showToast('Курсор освобожден. Можно переключиться между окнами (Cmd+Tab).');
      return;
    }

    if (event.code === 'KeyF') {
      event.preventDefault();

      if (gameState.gameEnded) {
        return;
      }

      if (gameState.isReadingNote) {
        closeNote();
        return;
      }

      if (!controls.isLocked || !gameState.activePrompt) {
        return;
      }

      if (gameState.activePrompt.type === 'note') {
        openNote();
      }

      if (gameState.activePrompt.type === 'entryDoor') {
        openEntryDoor();
      }

      if (gameState.activePrompt.type === 'keycard') {
        pickUpKeycard();
      }

      if (gameState.activePrompt.type === 'exitDoor') {
        tryOpenExitDoor();
      }
    }
  });

  window.addEventListener('keyup', (event) => {
    if (event.code === 'KeyW') keys.forward = false;
    if (event.code === 'KeyS') keys.backward = false;
    if (event.code === 'KeyA') keys.left = false;
    if (event.code === 'KeyD') keys.right = false;
  });

  window.addEventListener('resize', onWindowResize);
}

function openNote() {
  gameState.isReadingNote = true;
  noteOverlayEl.classList.remove('hidden');
  promptEl.classList.add('hidden');
  controls.unlock();
}

function closeNote() {
  noteOverlayEl.classList.add('hidden');

  if (!gameState.noteRead) {
    gameState.noteRead = true;
    gameState.money = 1_000_000;
    gameState.hits = 0;
    pickUpSuitcase();
    runPostNoteSequence();
  }

  gameState.isReadingNote = false;
  controls.lock();
}

function pickUpSuitcase() {
  if (interactive.worldSuitcase) {
    interactive.worldSuitcase.visible = false;
  }

  if (interactive.noteMesh) {
    interactive.noteMesh.visible = false;
  }

  if (interactive.heldSuitcase) {
    interactive.heldSuitcase.visible = true;
  }

  updateInventoryText();
  updateMoneyHud();

  inventoryEl.classList.remove('hidden');
  moneyEl.classList.remove('hidden');

  showToast('Чемодан у тебя. Баланс: 1.000.000 €');
}

function pickUpKeycard() {
  if (gameState.hasKeycard || !interactive.keycard || !interactive.keycard.visible) {
    return;
  }

  gameState.hasKeycard = true;
  interactive.keycard.visible = false;
  updateInventoryText();
  showToast('Служебная карта найдена. Теперь можно открыть аварийный выход.');
}

function runPostNoteSequence() {
  enqueueDialogue('"Хренушки вам,а не деньги, дорогие ПАРТНЁРЫ"', 35, 1000).then(() => {
    playKnockSound();
    unlockEntryDoor();
  });
}

function unlockEntryDoor() {
  if (gameState.doorUnlocked) {
    return;
  }

  gameState.doorUnlocked = true;
  showToast('Стук в дверь... Подойди и открой дверь кнопкой F.');
}

function openEntryDoor() {
  if (!gameState.doorUnlocked || gameState.doorOpened) {
    return;
  }

  gameState.doorOpened = true;
  entryDoorTargetAngle = -Math.PI / 2.15;
  gameState.maxZ = corridor.startZ + corridor.length - room.playerRadius;

  if (!mainDoorCreakPlayed) {
    playDoorCreakSound(1);
    mainDoorCreakPlayed = true;
  }
  showToast('Дверь открыта. Впереди длинный слабоосвещенный коридор.');
}

function tryOpenExitDoor() {
  if (gameState.exitOpened) {
    return;
  }

  if (!gameState.hasKeycard) {
    showToast('Дверь закрыта. Нужна служебная карта.');
    enqueueDialogue('Где-то в боковых комнатах должна быть карта...', 30, 800);
    return;
  }

  gameState.exitOpened = true;
  exitDoorTargetAngle = Math.PI / 2.2;
  gameState.maxZ = corridor.startZ + corridor.length + 3.2;

  showToast('Аварийный выход открыт. Беги!');
}

function updateInventoryText() {
  if (!gameState.noteRead) {
    inventoryEl.textContent = 'Инвентарь: пусто';
    return;
  }

  if (gameState.hasKeycard) {
    inventoryEl.textContent = 'Инвентарь: чемодан, служебная карта';
    return;
  }

  inventoryEl.textContent = 'Инвентарь: чемодан с деньгами';
}

function updateMoneyHud() {
  moneyEl.textContent = `Баланс: ${formatEuro(gameState.money)} €`;
}

function formatEuro(value) {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function enqueueDialogue(text, charDelay = 30, holdMs = 1100) {
  dialogueChain = dialogueChain.then(() => typeDialogue(text, charDelay, holdMs));
  return dialogueChain;
}

function typeDialogue(text, charDelay, holdMs) {
  return new Promise((resolve) => {
    clearInterval(dialogueIntervalId);
    stopDialogueTypingSound();
    dialogueEl.classList.remove('hidden');
    dialogueEl.textContent = '';
    startDialogueTypingSound();

    let index = 0;
    dialogueIntervalId = setInterval(() => {
      index += 1;
      dialogueEl.textContent = text.slice(0, index);

      if (index >= text.length) {
        clearInterval(dialogueIntervalId);
        stopDialogueTypingSound();
        setTimeout(() => {
          dialogueEl.classList.add('hidden');
          resolve();
        }, holdMs);
      }
    }, charDelay);
  });
}

function updateMovement(delta) {
  if (!controls.isLocked || gameState.isReadingNote || gameState.gameEnded) {
    return;
  }

  const acceleration = 18;
  const damping = 7.5;

  velocityX -= velocityX * damping * delta;
  velocityZ -= velocityZ * damping * delta;

  const inputX = Number(keys.right) - Number(keys.left);
  const inputZ = Number(keys.forward) - Number(keys.backward);

  if (inputX !== 0 || inputZ !== 0) {
    const length = Math.hypot(inputX, inputZ);
    velocityX += (inputX / length) * acceleration * delta;
    velocityZ += (inputZ / length) * acceleration * delta;
  }

  controls.moveRight(velocityX * delta);
  controls.moveForward(velocityZ * delta);

  camera.position.y = 1.65;

  const roomMaxX = room.width / 2 - room.playerRadius;
  const corridorMaxX = corridor.width / 2 - room.playerRadius;
  const isInCorridor = camera.position.z > corridor.startZ + 0.15;

  const maxX = isInCorridor ? corridorMaxX : roomMaxX;
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -maxX, maxX);

  const minZ = -room.depth / 2 + room.playerRadius;
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, minZ, gameState.maxZ);
}

function updateDoorAnimation(delta) {
  if (entryDoorPivot) {
    entryDoorCurrentAngle += (entryDoorTargetAngle - entryDoorCurrentAngle) * Math.min(8 * delta, 1);
    entryDoorPivot.rotation.y = entryDoorCurrentAngle;
  }

  if (exitDoorPivot) {
    exitDoorCurrentAngle += (exitDoorTargetAngle - exitDoorCurrentAngle) * Math.min(8 * delta, 1);
    exitDoorPivot.rotation.y = exitDoorCurrentAngle;
  }

  corridorState.doorSlots.forEach((slot) => {
    if (!slot.doorMesh) {
      return;
    }

    slot.currentRotation += (slot.targetRotation - slot.currentRotation) * Math.min(10 * delta, 1);
    slot.doorMesh.rotation.y = slot.currentRotation;
  });
}

function updateInteractionPrompt() {
  gameState.activePrompt = null;

  if (!controls.isLocked || gameState.isReadingNote || gameState.gameEnded) {
    promptEl.classList.add('hidden');
    return;
  }

  const candidates = [];

  if (!gameState.noteRead && interactive.noteMesh?.visible) {
    candidates.push({ type: 'note', mesh: interactive.noteMesh, text: 'F — прочитать записку' });
  }

  if (gameState.doorUnlocked && !gameState.doorOpened && interactive.entryDoor) {
    candidates.push({ type: 'entryDoor', mesh: interactive.entryDoor, text: 'F — открыть дверь' });
  }

  if (gameState.doorOpened && !gameState.hasKeycard && interactive.keycard?.visible) {
    candidates.push({ type: 'keycard', mesh: interactive.keycard, text: 'F — взять служебную карту' });
  }

  if (gameState.doorOpened && !gameState.gameEnded && interactive.exitDoor) {
    const label = gameState.hasKeycard
      ? 'F — открыть аварийный выход'
      : 'F — дверь закрыта (нужна карта)';

    candidates.push({ type: 'exitDoor', mesh: interactive.exitDoor, text: label });
  }

  if (candidates.length === 0) {
    promptEl.classList.add('hidden');
    return;
  }

  raycaster.setFromCamera(centerScreen, camera);

  let best = null;

  candidates.forEach((candidate) => {
    const hit = raycaster.intersectObject(candidate.mesh, true)[0];
    if (!hit || hit.distance > 2.4) {
      return;
    }

    if (!best || hit.distance < best.distance) {
      best = { distance: hit.distance, candidate };
    }
  });

  if (!best) {
    promptEl.classList.add('hidden');
    return;
  }

  gameState.activePrompt = { type: best.candidate.type };
  promptEl.textContent = best.candidate.text;
  promptEl.classList.remove('hidden');
}

function updateNarrativeProgress() {
  if (gameState.exitOpened && camera.position.z > corridor.startZ + corridor.length + 1.5) {
    triggerWinEnding();
  }
}

function updateJumpscares(delta) {
  if (!gameState.doorOpened || gameState.gameEnded) {
    return;
  }

  if (!gameState.activeJump) {
    const nextEvent = corridorState.jumpEvents.find(
      (event) => !event.triggered && camera.position.z > event.triggerZ
    );

    if (nextEvent) {
      triggerJumpEvent(nextEvent);
    }

    return;
  }

  const jump = gameState.activeJump;
  jump.timer += delta;

  const event = jump.event;
  const faceMesh = event.faceMesh;
  const doorSlot = event.slot;

  const openDuration = 0.18;
  const approachDuration = 0.22;
  const holdDuration = 0.85;
  const retreatDuration = 0.42;
  const closeDelay = 0.15;
  const total = openDuration + approachDuration + holdDuration + retreatDuration + closeDelay;

  const startX = doorSlot.side * (corridor.width / 2 - 0.08);
  const peakX = doorSlot.side * 0.48;

  if (jump.timer <= openDuration + approachDuration + holdDuration + retreatDuration) {
    doorSlot.targetRotation = doorSlot.openRotation;
  }

  if (jump.timer < openDuration + approachDuration) {
    const t = Math.max(0, (jump.timer - openDuration) / approachDuration);
    faceMesh.position.x = THREE.MathUtils.lerp(startX, peakX, t);
  } else if (jump.timer < openDuration + approachDuration + holdDuration) {
    faceMesh.position.x = peakX;
  } else {
    const t = Math.min((jump.timer - openDuration - approachDuration - holdDuration) / retreatDuration, 1);
    faceMesh.position.x = THREE.MathUtils.lerp(peakX, startX, t);
  }

  faceMesh.position.z = event.slot.z + corridor.startZ;
  faceMesh.lookAt(camera.position.x, 1.25, camera.position.z);

  if (jump.timer >= total) {
    faceMesh.visible = false;
    doorSlot.targetRotation = doorSlot.closedRotation;
    gameState.activeJump = null;
  }
}

function triggerJumpEvent(event) {
  event.triggered = true;
  event.faceMesh.visible = true;
  event.slot.targetRotation = event.slot.openRotation;
  gameState.activeJump = { event, timer: 0 };

  triggerFlash();
  playJumpscareSound();
  enqueueDialogue(`${event.name}: ГДЕ НАШИ ДЕНЬГИ?!`, 30, 2300);

  applyJumpscarePenalty(event.name);
}

function applyJumpscarePenalty(name) {
  if (gameState.money <= 0) {
    return;
  }

  gameState.hits += 1;
  gameState.money = Math.max(0, gameState.money - 300_000);
  updateMoneyHud();

  showToast(`${name} отжал 300.000 €. Осталось ${formatEuro(gameState.money)} €`);

  if (gameState.hits >= 3 || gameState.money <= 0) {
    setTimeout(() => {
      triggerLoseEnding();
    }, 900);
  }
}

function triggerFlash() {
  clearTimeout(flashTimeoutId);
  flashEl.classList.remove('hidden');

  flashTimeoutId = setTimeout(() => {
    flashEl.classList.add('hidden');
  }, 170);
}

function triggerWinEnding() {
  if (gameState.gameEnded) {
    return;
  }

  if (!sneezePlayed) {
    sneezePlayed = true;
    playSneezeSound();
  }

  gameState.gameEnded = true;
  promptEl.classList.add('hidden');
  controls.unlock();

  enqueueDialogue('......Ну это мне и ребятами на зарплату', 32, 1300).then(() => {
    endingTitleEl.textContent = 'Ты сбежал';
    endingTextEl.textContent = `Ты выбрался через аварийный выход с чемоданом. На руках осталось ${formatEuro(gameState.money)} €.`;
    endingOverlayEl.classList.remove('hidden');
    menuEl.classList.add('hidden');
    showToast('Ветка: Убежал');
  });
}

function triggerLoseEnding() {
  if (gameState.gameEnded) {
    return;
  }

  if (!sneezePlayed) {
    sneezePlayed = true;
    playSneezeSound();
  }

  gameState.gameEnded = true;
  gameState.money = 0;
  updateMoneyHud();

  if (interactive.heldSuitcase) {
    interactive.heldSuitcase.visible = false;
  }

  inventoryEl.textContent = 'Инвентарь: пусто';

  controls.unlock();

  endingTitleEl.textContent = 'Партнёры перехватили тебя';
  endingTextEl.textContent = 'После трёх скример-встреч деньги ушли партнёрам. Чемодан потерян. Плохая концовка.';
  endingOverlayEl.classList.remove('hidden');
  menuEl.classList.add('hidden');
  promptEl.classList.add('hidden');

  showToast('Ветка: Потерял деньги');
}

function showToast(text) {
  clearTimeout(toastTimeoutId);
  toastEl.textContent = text;
  toastEl.classList.remove('hidden');

  toastTimeoutId = setTimeout(() => {
    toastEl.classList.add('hidden');
  }, 3000);
}

function createSoundBank() {
  const bank = {};

  Object.entries(SOUND_ASSET_URLS).forEach(([name, url]) => {
    const sound = new Audio(url);
    sound.preload = 'auto';
    bank[name] = sound;
  });

  return bank;
}

function createBackgroundMusic() {
  const music = new Audio(BACKGROUND_MUSIC_URL);
  music.preload = 'auto';
  music.loop = true;
  music.volume = 0.08;
  return music;
}

function unlockAudio() {
  if (soundUnlocked) {
    return;
  }

  soundUnlocked = true;
  Object.values(soundBank).forEach((sound) => sound.load());
  backgroundMusic.load();
}

function startBackgroundMusic() {
  if (!soundUnlocked) {
    return;
  }

  if (!backgroundMusic.paused) {
    return;
  }

  backgroundMusic.volume = 0.08;
  backgroundMusic.play().catch(() => {});
}

function playSound(name, { volume = 0.7, rate = 1 } = {}) {
  if (!soundUnlocked) {
    return;
  }

  const baseSound = soundBank[name];
  if (!baseSound) {
    return;
  }

  const instance = baseSound.cloneNode();
  instance.volume = THREE.MathUtils.clamp(volume, 0, 1);
  instance.playbackRate = rate;
  instance.play().catch(() => {});
}

function startDialogueTypingSound() {
  if (!soundUnlocked) {
    return;
  }

  const baseSound = soundBank.typing;
  if (!baseSound) {
    return;
  }

  stopDialogueTypingSound();
  activeTypingAudio = baseSound.cloneNode();
  activeTypingAudio.volume = 0.24;
  activeTypingAudio.playbackRate = 1;
  activeTypingAudio.loop = true;
  activeTypingAudio.play().catch(() => {});
}

function stopDialogueTypingSound() {
  if (!activeTypingAudio) {
    return;
  }

  activeTypingAudio.pause();
  activeTypingAudio.currentTime = 0;
  activeTypingAudio = null;
}

function playKnockSound() {
  playSound('knock', { volume: 0.72, rate: 0.95 });
  setTimeout(() => playSound('knock', { volume: 0.66, rate: 1.03 }), 255);
}

function playDoorCreakSound(intensity = 1) {
  playSound('doorCreak', {
    volume: THREE.MathUtils.clamp(0.58 * intensity, 0, 1),
    rate: THREE.MathUtils.randFloat(0.9, 1.08)
  });
}

function playJumpscareSound() {
  playSound('knock', { volume: 0.76, rate: 0.82 });
}

function playSneezeSound() {
  playSound('sneeze', {
    volume: 0.34,
    rate: THREE.MathUtils.randFloat(0.96, 1.04)
  });
}

function updateRandomSneeze() {
  if (!gameState.hasStarted || gameState.gameEnded || !soundUnlocked || sneezePlayed || gameStartTimestampMs === 0) {
    return;
  }

  const elapsedSec = (performance.now() - gameStartTimestampMs) / 1000;
  if (elapsedSec < sneezeDueSec) {
    return;
  }

  sneezePlayed = true;
  playSneezeSound();
}

function updateFootsteps(delta) {
  if (!controls.isLocked || gameState.isReadingNote || gameState.gameEnded) {
    footstepsTimer = 0;
    footstepsDistance = 0;
    lastFootstepX = null;
    lastFootstepZ = null;
    return;
  }

  if (lastFootstepX === null || lastFootstepZ === null) {
    lastFootstepX = camera.position.x;
    lastFootstepZ = camera.position.z;
    footstepsTimer = 0;
    footstepsDistance = 0;
    return;
  }

  const dx = camera.position.x - lastFootstepX;
  const dz = camera.position.z - lastFootstepZ;
  const movedDistance = Math.hypot(dx, dz);
  lastFootstepX = camera.position.x;
  lastFootstepZ = camera.position.z;

  if (movedDistance < 0.0008) {
    footstepsTimer = 0;
    return;
  }

  footstepsTimer += delta;
  footstepsDistance += movedDistance;

  if (footstepsDistance >= 0.5 && footstepsTimer >= 0.22) {
    footstepsTimer = 0;
    footstepsDistance = 0;
    playSound('footsteps', { volume: 0.2, rate: THREE.MathUtils.randFloat(0.92, 1.08) });
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.1);

  updateMovement(delta);
  updateRandomSneeze();
  updateFootsteps(delta);
  updateDoorAnimation(delta);
  updateInteractionPrompt();
  updateNarrativeProgress();
  updateJumpscares(delta);

  renderer.render(scene, camera);
}
