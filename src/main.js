import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";
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

const PLY_FOLDER = "/PointCloud Bite The Buffalo";
const PLY_FILES = ["1.ply", "2.ply", "3.ply", "4.ply", "5.ply"].map(
  (name) => `${PLY_FOLDER}/${name}`,
);

const SOURCES = {
  gltf: "/OP_1/OP_1_Model.gltf",
};

// Debug
const gui = new GUI();
const debugObject = {
  usePLY: true,
  plyIndex: 0,
  useSurfaceSampler: false,
  surfaceSampleCount: 1000,
  noiseAmp: 10.5,
  noiseSpeed: 0.8,
  noiseStrength: 0.015,
  bloomStrength: 1.43,
  bloomRadius: 0.08,
  bloomThreshold: 0.05,
  filmIntensity: 1,
  filmGrayscale: false,
  exposure: 0.9,
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

function extractPositionsFromPLY(geometry, { includeSurfaceSamples = false, sampleCount = 0 } = {}) {
  const pos = geometry.attributes.position;
  let positions = new Float32Array(pos.array);

  if (includeSurfaceSamples && sampleCount > 0) {
    positions = appendPointCloudSamples(positions, sampleCount);
  }

  return positions;
}

function appendPointCloudSamples(positions, sampleCount) {
  const pointCount = positions.length / 3;
  const combined = new Float32Array(positions.length + sampleCount * 3);
  combined.set(positions);

  for (let i = 0; i < sampleCount; i++) {
    const srcIdx = Math.floor(Math.random() * pointCount) * 3;
    const dstIdx = positions.length + i * 3;
    combined[dstIdx] = positions[srcIdx];
    combined[dstIdx + 1] = positions[srcIdx + 1];
    combined[dstIdx + 2] = positions[srcIdx + 2];
  }

  return combined;
}

function appendGLTFSurfaceSamples(gltf, positions, sampleCount) {
  const meshes = [];
  gltf.scene.traverse((child) => {
    if (child.isMesh) meshes.push(child);
  });
  if (meshes.length === 0) return;

  const temp = new THREE.Vector3();
  let remaining = sampleCount;

  for (const mesh of meshes) {
    const sampler = new MeshSurfaceSampler(mesh);
    if (mesh.geometry.attributes.color) sampler.setWeightAttribute("color");
    sampler.build();

    const meshSamples = Math.min(remaining, Math.ceil(sampleCount / meshes.length));
    for (let i = 0; i < meshSamples; i++) {
      sampler.sample(temp);
      temp.applyMatrix4(mesh.matrixWorld);
      positions.push(temp.x, temp.y, temp.z);
    }

    remaining -= meshSamples;
    if (remaining <= 0) break;
  }
}

function extractPositionsFromGLTF(gltf, { includeSurfaceSamples = false, sampleCount = 0 } = {}) {
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

  if (includeSurfaceSamples && sampleCount > 0) {
    appendGLTFSurfaceSamples(gltf, positions, sampleCount);
  }

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

function rotatePositions(positions, axis, angle) {
  const rotated = new Float32Array(positions.length);
  const point = new THREE.Vector3();
  const matrix = new THREE.Matrix4();

  if (axis === "x") matrix.makeRotationX(angle);
  else if (axis === "y") matrix.makeRotationY(angle);
  else matrix.makeRotationZ(angle);

  for (let i = 0; i < positions.length; i += 3) {
    point.set(positions[i], positions[i + 1], positions[i + 2]);
    point.applyMatrix4(matrix);
    rotated[i] = point.x;
    rotated[i + 1] = point.y;
    rotated[i + 2] = point.z;
  }

  return rotated;
}

async function ensureGltfReference() {
  if (gltfReferenceMaxDim !== null) return;
  const positions = await loadGLTFPositions(SOURCES.gltf, { includeSurfaceSamples: false });
  const { maxDim } = getCenteredMaxDim(positions);
  gltfReferenceMaxDim = maxDim;
}

function getSamplerOptions() {
  return {
    includeSurfaceSamples: debugObject.useSurfaceSampler,
    sampleCount: debugObject.surfaceSampleCount,
  };
}

function preparePositions(positions, usePLY) {
  if (usePLY) {
    // Polycam PLY is Z-up; rotate to Three.js Y-up for a side view
    positions = rotatePositions(positions, "x", -Math.PI / 2);
  }

  const { centered, maxDim } = getCenteredMaxDim(positions);
  if (!usePLY) return centered;

  const scale = gltfReferenceMaxDim / maxDim;
  return scaleCenteredPositions(centered, scale);
}

function loadPLYPositions(path, options = getSamplerOptions()) {
  return new Promise((resolve, reject) => {
    plyLoader.load(
      path,
      (geometry) => resolve(extractPositionsFromPLY(geometry, options)),
      undefined,
      reject,
    );
  });
}

function loadGLTFPositions(path, options = getSamplerOptions()) {
  return new Promise((resolve, reject) => {
    gltfLoader.load(
      path,
      (gltf) => resolve(extractPositionsFromGLTF(gltf, options)),
      undefined,
      reject,
    );
  });
}

function updateNoiseUniforms() {
  if (!particles?.material) return;
  particles.material.uniforms.uNoisePeriod.value = debugObject.noiseAmp;
  particles.material.uniforms.uNoiseSpeed.value = debugObject.noiseSpeed;
  particles.material.uniforms.uNoiseStrength.value = debugObject.noiseStrength;
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
      uNoisePeriod: { value: debugObject.noiseAmp },
      uNoiseSpeed: { value: debugObject.noiseSpeed },
      uNoiseStrength: { value: debugObject.noiseStrength },
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
    ? await loadPLYPositions(PLY_FILES[debugObject.plyIndex])
    : await loadGLTFPositions(SOURCES.gltf);
  particles = buildParticles(preparePositions(positions, usePLY));
  scene.add(particles);
}

function reloadPointCloud() {
  loadPointCloud(debugObject.usePLY);
}

const plyController = gui
  .add(debugObject, "plyIndex", 0, PLY_FILES.length - 1, 1)
  .name("PLY: 1.ply")
  .onChange(() => {
    plyController.name(`PLY: ${PLY_FILES[debugObject.plyIndex].split("/").pop()}`);
    if (debugObject.usePLY) reloadPointCloud();
  });

gui.add(debugObject, "usePLY").name("Use PLY").onChange(reloadPointCloud);

const sampleCountController = gui
  .add(debugObject, "surfaceSampleCount", 0, 20000, 100)
  .name("Sample count")
  .onFinishChange(reloadPointCloud);

gui
  .add(debugObject, "useSurfaceSampler")
  .name("Surface sampler")
  .onChange((enabled) => {
    sampleCountController.enable(enabled);
    reloadPointCloud();
  });

sampleCountController.enable(debugObject.useSurfaceSampler);

const noiseFolder = gui.addFolder("Noise");
noiseFolder
  .add(debugObject, "noiseStrength", 0, 0.15, 0.001)
  .name("Strength")
  .onChange(updateNoiseUniforms);
noiseFolder
  .add(debugObject, "noiseSpeed", 0, 2, 0.01)
  .name("Speed")
  .onChange(updateNoiseUniforms);
noiseFolder
  .add(debugObject, "noiseAmp", 0.5, 15, 0.1)
  .name("Frequency")
  .onChange(updateNoiseUniforms);

reloadPointCloud();

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
  debugObject.bloomStrength,
  debugObject.bloomRadius,
  debugObject.bloomThreshold,
);
effectComposer.addPass(unrealBloomPass);

const filmPass = new FilmPass(debugObject.filmIntensity, debugObject.filmGrayscale);
effectComposer.addPass(filmPass);

const outputPass = new OutputPass();
effectComposer.addPass(outputPass);

function updatePostProcessing() {
  unrealBloomPass.strength = debugObject.bloomStrength;
  unrealBloomPass.radius = debugObject.bloomRadius;
  unrealBloomPass.threshold = debugObject.bloomThreshold;
  filmPass.uniforms.intensity.value = debugObject.filmIntensity;
  filmPass.uniforms.grayscale.value = debugObject.filmGrayscale;
  renderer.toneMappingExposure = debugObject.exposure;
}

const postFolder = gui.addFolder("Post Processing");
postFolder
  .add(debugObject, "bloomStrength", 0, 2, 0.01)
  .name("Bloom strength")
  .onChange(updatePostProcessing);
postFolder
  .add(debugObject, "bloomRadius", 0, 1, 0.01)
  .name("Bloom radius")
  .onChange(updatePostProcessing);
postFolder
  .add(debugObject, "bloomThreshold", 0, 1, 0.01)
  .name("Bloom threshold")
  .onChange(updatePostProcessing);
postFolder
  .add(debugObject, "filmIntensity", 0, 1, 0.01)
  .name("Film grain")
  .onChange(updatePostProcessing);
postFolder
  .add(debugObject, "filmGrayscale")
  .name("Film grayscale")
  .onChange(updatePostProcessing);
postFolder
  .add(debugObject, "exposure", 0, 3, 0.01)
  .name("Exposure")
  .onChange(updatePostProcessing);

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
  unrealBloomPass.resolution.set(sizes.width, sizes.height);
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
