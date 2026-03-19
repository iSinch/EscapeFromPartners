import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

const canvas = document.querySelector('#game');
const menuEl = document.querySelector('#menu');
const startButtonEl = document.querySelector('#startButton');
const hudEl = document.querySelector('#hud');
const promptEl = document.querySelector('#prompt');
const inventoryEl = document.querySelector('#inventory');
const toastEl = document.querySelector('#toast');
const dialogueEl = document.querySelector('#dialogue');
const noteOverlayEl = document.querySelector('#noteOverlay');
const closeNoteButtonEl = document.querySelector('#closeNoteButton');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0b10);
scene.fog = new THREE.FogExp2(0x07080d, 0.09);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 140);
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
  height: 3.0,
  length: 24,
  startZ: room.depth / 2 + 0.04
};

const keys = {
  forward: false,
  backward: false,
  left: false,
  right: false
};

const gameState = {
  hasStarted: false,
  isReadingNote: false,
  noteRead: false,
  doorUnlocked: false,
  doorOpened: false,
  activePrompt: null,
  maxZ: room.depth / 2 - room.playerRadius,
  activeJump: null
};

let velocityX = 0;
let velocityZ = 0;
let toastTimeoutId;
let dialogueIntervalId;
let dialogueChain = Promise.resolve();
let audioContext;
let masterAudioGain;
let doorPivot;
let doorTargetAngle = 0;
let doorCurrentAngle = 0;

const interactive = {
  noteMesh: null,
  worldSuitcase: null,
  heldSuitcase: null,
  entryDoor: null
};

const corridorState = {
  doorSlots: [],
  jumpEvents: []
};

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

  const ambient = new THREE.AmbientLight(0x4a5168, 0.27);
  scene.add(ambient);

  const fill = new THREE.HemisphereLight(0x35415f, 0x1a1714, 0.24);
  scene.add(fill);

  const moonLight = new THREE.DirectionalLight(0x7481a5, 0.22);
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

  doorPivot = new THREE.Group();
  doorPivot.position.set(-room.doorwayWidth / 2, 0, frontZ - 0.025);

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

  doorPivot.add(door, handle);
  scene.add(doorPivot);

  interactive.entryDoor = door;
}

function addWindow() {
  const frame = new THREE.Group();
  const windowX = room.width / 2 - 0.03;
  const windowY = 1.85;
  const windowZ = -1.2;

  const borderMaterial = new THREE.MeshStandardMaterial({ color: 0xd6dbe6, roughness: 0.5, metalness: 0.08 });
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x9db1c8,
    transmission: 0.5,
    transparent: true,
    opacity: 0.42,
    roughness: 0.08,
    metalness: 0
  });

  const verticalA = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1, 0.62), borderMaterial);
  const verticalB = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1, 0.62), borderMaterial);
  verticalA.position.set(0, 0, -0.29);
  verticalB.position.set(0, 0, 0.29);

  const horizontalA = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.62, 0.02), borderMaterial);
  const horizontalB = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.62, 0.02), borderMaterial);
  horizontalA.position.set(0, 0.49, 0);
  horizontalB.position.set(0, -0.49, 0);

  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.95), glassMaterial);
  glass.rotation.y = -Math.PI / 2;

  frame.add(verticalA, verticalB, horizontalA, horizontalB, glass);
  frame.position.set(windowX, windowY, windowZ);
  scene.add(frame);

  const moonBeam = new THREE.SpotLight(0x8ea6c7, 0.35, 12, Math.PI / 7, 0.5, 1.4);
  moonBeam.position.set(windowX + 1.6, windowY + 0.4, windowZ - 0.1);
  moonBeam.target.position.set(windowX - 1.5, 0.2, windowZ - 0.4);
  moonBeam.castShadow = false;
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

  const logoGlow = new THREE.PointLight(0x8cf2a4, 0.35, 2.5, 2);
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
    new THREE.MeshStandardMaterial({ color: 0xfff8d5, emissive: 0xffe3aa, emissiveIntensity: 1.1 })
  );
  lampBulb.position.set(-0.39, 1.27, -0.12);

  const lampLight = new THREE.PointLight(0xffdea0, 2.05, 8.2, 2);
  lampLight.position.set(-0.39, 1.27, -0.12);
  lampLight.castShadow = true;
  lampLight.shadow.mapSize.set(1024, 1024);

  const worldSuitcase = createSuitcaseMesh();
  worldSuitcase.position.set(0.17, 1.05, 0);

  const noteMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.33, 0.2),
    new THREE.MeshStandardMaterial({ color: 0xf1e8d1, roughness: 0.8, side: THREE.DoubleSide })
  );
  noteMesh.position.set(0.17, 1.235, 0.01);
  noteMesh.rotation.x = -Math.PI / 2;
  noteMesh.rotation.z = 0.02;
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

  group.add(caseBody, edge, handle);
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
    const light = new THREE.PointLight(0xa4b7cb, 0.22, 7.5, 2.2);
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
      sideDoor.rotation.y = side === 1 ? Math.PI / 2 : -Math.PI / 2;
      corridorGroup.add(sideDoor);

      corridorState.doorSlots.push({ side, z });
    });
  }

  createPartnerEvents(corridorGroup);

  return corridorGroup;
}

function createPartnerEvents(parentGroup) {
  const eventCount = 3 + Math.floor(Math.random() * 5);
  const shuffledSlots = [...corridorState.doorSlots].sort(() => Math.random() - 0.5);
  const selectedSlots = shuffledSlots.slice(0, eventCount);
  const names = generatePartnerNames(eventCount);

  selectedSlots.forEach((slot, index) => {
    const partnerMesh = createPartnerMesh();
    partnerMesh.visible = false;
    partnerMesh.position.set(slot.side * (corridor.width / 2 - 0.2), 0, slot.z + corridor.startZ);
    scene.add(partnerMesh);

    corridorState.jumpEvents.push({
      slot,
      triggerZ: slot.z + corridor.startZ - 0.35,
      name: names[index],
      partnerMesh,
      triggered: false
    });
  });
}

function generatePartnerNames(count) {
  const options = ['Leo', 'Maks', 'Artem', 'Ilya', 'Nikita', 'Dima', 'Roman'];
  const names = [];

  if (Math.random() < 0.85) {
    names.push('Leo');
  }

  while (names.length < count) {
    names.push(options[Math.floor(Math.random() * options.length)]);
  }

  if (!names.includes('Leo') && Math.random() < 0.9) {
    names[Math.floor(Math.random() * names.length)] = 'Leo';
  }

  return names.sort(() => Math.random() - 0.5);
}

function createPartnerMesh() {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 1.15, 0.28),
    new THREE.MeshStandardMaterial({ color: 0x0f1116, roughness: 0.7 })
  );
  body.position.y = 0.58;

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 18, 18),
    new THREE.MeshStandardMaterial({ color: 0x23252b, roughness: 0.62 })
  );
  head.position.y = 1.3;

  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xff3d3d });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), eyeMaterial);
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), eyeMaterial);
  eyeL.position.set(-0.06, 1.32, 0.16);
  eyeR.position.set(0.06, 1.32, 0.16);

  group.add(body, head, eyeL, eyeR);
  return group;
}

function registerEvents() {
  startButtonEl.addEventListener('click', () => {
    gameState.hasStarted = true;
    hudEl.classList.remove('hidden');
    menuEl.classList.add('hidden');
    controls.lock();
    showToast('Осмотрись. На столе лежит чемодан и записка.');
    startAmbientAudio();
  });

  controls.addEventListener('unlock', () => {
    if (gameState.isReadingNote) {
      return;
    }

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
    if (event.code === 'KeyW') keys.forward = true;
    if (event.code === 'KeyS') keys.backward = true;
    if (event.code === 'KeyA') keys.left = true;
    if (event.code === 'KeyD') keys.right = true;

    if (event.code === 'Tab' && controls.isLocked && !gameState.isReadingNote) {
      event.preventDefault();
      controls.unlock();
      showToast('Курсор освобожден. Можно переключиться между окнами (Cmd+Tab).');
      return;
    }

    if (event.code === 'KeyF') {
      event.preventDefault();

      if (gameState.isReadingNote) {
        closeNote();
        return;
      }

      if (!controls.isLocked || !gameState.activePrompt) {
        return;
      }

      ensureAudioContext();

      if (gameState.activePrompt.type === 'note') {
        openNote();
      }

      if (gameState.activePrompt.type === 'door') {
        openEntryDoor();
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

  inventoryEl.textContent = 'Инвентарь: чемодан с деньгами';
  inventoryEl.classList.remove('hidden');
  showToast('Чемодан у тебя. Кажется, за дверью кто-то есть.');
}

function runPostNoteSequence() {
  enqueueDialogue('"Хренушки вам,а не деньги, дорогие ПАРТНЁРЫ"', 36, 1000).then(() => {
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
  doorTargetAngle = -Math.PI / 2.15;
  gameState.maxZ = corridor.startZ + corridor.length - room.playerRadius;
  playDoorCreakSound();
  showToast('Дверь открыта. Впереди длинный тёмный коридор.');
}

function enqueueDialogue(text, charDelay = 30, holdMs = 1100) {
  dialogueChain = dialogueChain.then(() => typeDialogue(text, charDelay, holdMs));
  return dialogueChain;
}

function typeDialogue(text, charDelay, holdMs) {
  return new Promise((resolve) => {
    clearInterval(dialogueIntervalId);
    dialogueEl.classList.remove('hidden');
    dialogueEl.textContent = '';

    let index = 0;
    dialogueIntervalId = setInterval(() => {
      index += 1;
      dialogueEl.textContent = text.slice(0, index);

      if (index >= text.length) {
        clearInterval(dialogueIntervalId);
        setTimeout(() => {
          dialogueEl.classList.add('hidden');
          resolve();
        }, holdMs);
      }
    }, charDelay);
  });
}

function updateMovement(delta) {
  if (!controls.isLocked || gameState.isReadingNote) {
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
  if (!doorPivot) {
    return;
  }

  doorCurrentAngle += (doorTargetAngle - doorCurrentAngle) * Math.min(8 * delta, 1);
  doorPivot.rotation.y = doorCurrentAngle;
}

function updateInteractionPrompt() {
  gameState.activePrompt = null;

  if (!controls.isLocked || gameState.isReadingNote) {
    promptEl.classList.add('hidden');
    return;
  }

  const candidates = [];

  if (!gameState.noteRead && interactive.noteMesh && interactive.noteMesh.visible) {
    candidates.push({ type: 'note', mesh: interactive.noteMesh, text: 'F — прочитать записку' });
  }

  if (gameState.doorUnlocked && !gameState.doorOpened && interactive.entryDoor) {
    candidates.push({ type: 'door', mesh: interactive.entryDoor, text: 'F — открыть дверь' });
  }

  if (candidates.length === 0) {
    promptEl.classList.add('hidden');
    return;
  }

  raycaster.setFromCamera(centerScreen, camera);

  let best = null;
  candidates.forEach((candidate) => {
    const hit = raycaster.intersectObject(candidate.mesh, true)[0];
    if (!hit) {
      return;
    }

    if (hit.distance > 2.25) {
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

function updateJumpscares(delta) {
  if (!gameState.doorOpened) {
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
  const mesh = event.partnerMesh;

  const approachDuration = 0.45;
  const retreatDuration = 0.5;
  const startX = event.slot.side * (corridor.width / 2 - 0.22);
  const peakX = event.slot.side * 0.72;

  if (jump.timer < approachDuration) {
    const t = jump.timer / approachDuration;
    mesh.position.x = THREE.MathUtils.lerp(startX, peakX, t);
  } else {
    const t = Math.min((jump.timer - approachDuration) / retreatDuration, 1);
    mesh.position.x = THREE.MathUtils.lerp(peakX, startX, t);
  }

  mesh.position.z = event.slot.z + corridor.startZ + Math.sin(jump.timer * 28) * 0.015;
  mesh.lookAt(camera.position.x, 1.2, camera.position.z);

  if (jump.timer >= 1.05) {
    mesh.visible = false;
    gameState.activeJump = null;
  }
}

function triggerJumpEvent(event) {
  event.triggered = true;
  event.partnerMesh.visible = true;
  gameState.activeJump = { event, timer: 0 };

  playJumpscareSound();
  enqueueDialogue(`${event.name}: ГДЕ НАШИ ДЕНЬГИ?!`, 24, 900);
}

function showToast(text) {
  clearTimeout(toastTimeoutId);
  toastEl.textContent = text;
  toastEl.classList.remove('hidden');

  toastTimeoutId = setTimeout(() => {
    toastEl.classList.add('hidden');
  }, 2800);
}

function ensureAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    masterAudioGain = audioContext.createGain();
    masterAudioGain.gain.value = 0.08;
    masterAudioGain.connect(audioContext.destination);
  }

  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
}

function startAmbientAudio() {
  ensureAudioContext();

  if (startAmbientAudio.started) {
    return;
  }
  startAmbientAudio.started = true;

  const oscA = audioContext.createOscillator();
  oscA.type = 'sine';
  oscA.frequency.value = 57;

  const oscB = audioContext.createOscillator();
  oscB.type = 'triangle';
  oscB.frequency.value = 92;

  const gainA = audioContext.createGain();
  gainA.gain.value = 0.22;

  const gainB = audioContext.createGain();
  gainB.gain.value = 0.14;

  const lowPass = audioContext.createBiquadFilter();
  lowPass.type = 'lowpass';
  lowPass.frequency.value = 240;

  oscA.connect(gainA);
  oscB.connect(gainB);
  gainA.connect(lowPass);
  gainB.connect(lowPass);
  lowPass.connect(masterAudioGain);

  oscA.start();
  oscB.start();
}

function playKnockSound() {
  ensureAudioContext();

  const now = audioContext.currentTime;

  for (let i = 0; i < 3; i += 1) {
    const hitTime = now + i * 0.32;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'square';
    osc.frequency.value = 120 - i * 10;

    gain.gain.setValueAtTime(0, hitTime);
    gain.gain.linearRampToValueAtTime(0.17, hitTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, hitTime + 0.12);

    osc.connect(gain);
    gain.connect(masterAudioGain);

    osc.start(hitTime);
    osc.stop(hitTime + 0.14);
  }
}

function playDoorCreakSound() {
  ensureAudioContext();

  const now = audioContext.currentTime;
  const osc = audioContext.createOscillator();
  osc.type = 'sawtooth';

  const filter = audioContext.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 450;

  const gain = audioContext.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.08);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.72);

  osc.frequency.setValueAtTime(300, now);
  osc.frequency.exponentialRampToValueAtTime(80, now + 0.72);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(masterAudioGain);

  osc.start(now);
  osc.stop(now + 0.76);
}

function playJumpscareSound() {
  ensureAudioContext();

  const now = audioContext.currentTime;

  const osc = audioContext.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.exponentialRampToValueAtTime(430, now + 0.22);

  const gain = audioContext.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);

  osc.connect(gain);
  gain.connect(masterAudioGain);
  osc.start(now);
  osc.stop(now + 0.35);
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
  updateDoorAnimation(delta);
  updateInteractionPrompt();
  updateJumpscares(delta);

  renderer.render(scene, camera);
}
