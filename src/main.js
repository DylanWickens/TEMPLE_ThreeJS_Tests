import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GammaCorrectionShader } from 'three/examples/jsm/shaders/GammaCorrectionShader.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FilmPass } from "three/addons/postprocessing/FilmPass.js";
import GUI from "lil-gui";
import particleVertexShader from "./shaders/particles/vert.glsl";
import particleFragShader from "./shaders/particles/frag.glsl";

const SOURCES = {
  ply: "/PointCloud Bite The Buffalo/2.ply",
  gltf: "/OP_1/OP_1_Model.gltf",
};

// Debug
const gui = new GUI();
const debugObject = {
  usePLY: true,
  noiseAmp: 10,
  noiseSpeed: 1.0,
  noiseStrength: 0.06,
};

// Canvas tag
const canvas = document.querySelector("canvas.webgl");

// Scene
const scene = new THREE.Scene();

/* 
  Particles 
*/
let particles = null;

// Sizes
const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
};

// Render
const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
});
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

/*
 * Models
 */
const gltfLoader = new GLTFLoader();
const plyLoader = new PLYLoader();
let gltfReferenceMaxDim = null;

function extractPositionsFromPLY(geometry) {
  const pos = geometry.attributes.position;
  return new Float32Array(pos.array);
}

function extractPositionsFromGLTF(gltf) {
  const root = gltf.scene.children[0];
  root.scale.set(0.095, 0.095, 0.095);
  root.updateMatrixWorld(true);

  const positions = [];
  const temp = new THREE.Vector3();

  gltf.scene.traverse((child) => {
    if (!child.isMesh) return;

    const pos = child.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      temp.fromBufferAttribute(pos, i);
      temp.applyMatrix4(child.matrixWorld);
      positions.push(temp.x, temp.y, temp.z);
    }
  });

  return new Float32Array(positions);
}

function getCenteredMaxDim(positions) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.computeBoundingBox();
  geo.center();

  const size = new THREE.Vector3();
  geo.boundingBox.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  const centered = new Float32Array(geo.attributes.position.array);

  geo.dispose();
  return { centered, maxDim };
}

function scaleCenteredPositions(centered, scale) {
  const scaled = new Float32Array(centered.length);
  for (let i = 0; i < centered.length; i++) {
    scaled[i] = centered[i] * scale;
  }
  return scaled;
}

async function ensureGltfReference() {
  if (gltfReferenceMaxDim !== null) return;
  const positions = await loadGLTFPositions(SOURCES.gltf);
  const { maxDim } = getCenteredMaxDim(positions);
  gltfReferenceMaxDim = maxDim;
}

function preparePositions(positions, usePLY) {
  const { centered, maxDim } = getCenteredMaxDim(positions);
  if (!usePLY) return centered;

  const scale = gltfReferenceMaxDim / maxDim;
  return scaleCenteredPositions(centered, scale);
}

function loadPLYPositions(path) {
  return new Promise((resolve, reject) => {
    plyLoader.load(
      path,
      (geometry) => resolve(extractPositionsFromPLY(geometry)),
      undefined,
      reject,
    );
  });
}

function loadGLTFPositions(path) {
  return new Promise((resolve, reject) => {
    gltfLoader.load(
      path,
      (gltf) => resolve(extractPositionsFromGLTF(gltf)),
      undefined,
      reject,
    );
  });
}

function buildParticles(positions) {
  const totalPoints = positions.length / 3;
  const scales = new Float32Array(totalPoints);
  for (let i = 0; i < totalPoints; i++) {
    scales[i] = Math.random();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aScale", new THREE.BufferAttribute(scales, 1));

  const material = new THREE.ShaderMaterial({
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: particleVertexShader,
    fragmentShader: particleFragShader,
    uniforms: {
      uSize: { value: 10.0 * renderer.getPixelRatio() },
      uTime: { value: 0 },
      uNoisePeriod: { value: 1 },
      uNoiseSpeed: { value: 1.0 },
      uNoiseStrength: { value: 0.06 },
    },
  });

  return new THREE.Points(geometry, material);
}

function disposeParticles() {
  if (!particles) return;
  scene.remove(particles);
  particles.geometry.dispose();
  particles.material.dispose();
  particles = null;
}

async function loadPointCloud(usePLY) {
  disposeParticles();
  await ensureGltfReference();
  const positions = usePLY
    ? await loadPLYPositions(SOURCES.ply)
    : await loadGLTFPositions(SOURCES.gltf);
  particles = buildParticles(preparePositions(positions, usePLY));
  scene.add(particles);
}

gui.add(debugObject, "usePLY").name("Use PLY").onChange(() => {
  loadPointCloud(debugObject.usePLY);
});

loadPointCloud(debugObject.usePLY);

// Camera
const camera = new THREE.PerspectiveCamera(45, sizes.width / sizes.height, 0.001, 1000);
camera.position.z = 3;
scene.add(camera);

// Controls
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

// Light
const light = new THREE.AmbientLight(0xffffff, 0.1);
scene.add(light);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(1, -3, -2);
scene.add(directionalLight);

/* 
* Post Processing
*/
const effectComposer = new EffectComposer(renderer);
effectComposer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
effectComposer.setSize(sizes.width, sizes.height);

const renderPass = new RenderPass(scene, camera);
effectComposer.addPass(renderPass);

const unrealBloomPass = new UnrealBloomPass(
  new THREE.Vector2(sizes.width, sizes.height),
  0.5, // strength
  0.8, // radius
  0.2, // threshold
);
effectComposer.addPass(unrealBloomPass);

const filmPass = new FilmPass(0.9, false); // low intensity
effectComposer.addPass(filmPass); // before OutputPass

const outputPass = new OutputPass();
effectComposer.addPass(outputPass);

// Update viewport
window.addEventListener("resize", () => {
  // Update Sizes
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;

  // Update Camera
  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();

  // Update Renderer
  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Update Effect Composer
  effectComposer.setSize(sizes.width, sizes.height);
  effectComposer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// Timer
const timer = new THREE.Timer();

// Animate
const tick = () => {
  // Timer
  timer.update();
  const elapsedTime = timer.getElapsed();
  const deltaTime = timer.getDelta();

  // Update Objects
  controls.update();

  // Update Shaders
  if (particles?.material) {
    particles.material.uniforms.uTime.value = elapsedTime;
  }

  // Update Passes

  // Render
  // renderer.render(scene, camera);
  effectComposer.render();

  window.requestAnimationFrame(tick);
};

tick();
