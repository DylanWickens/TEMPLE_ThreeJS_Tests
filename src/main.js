import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';


import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

import { GammaCorrectionShader } from 'three/examples/jsm/shaders/GammaCorrectionShader.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import GUI from "lil-gui";
import particleVertexShader from "./shaders/particles/vert.glsl";
import particleFragShader from "./shaders/particles/frag.glsl";

// Debug
const gui = new GUI();
const debugObject = {
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
let particles = {};

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

/*
 * Models
 */
const gltfLoader = new GLTFLoader();
let scales = null;

gltfLoader.load("/OP_1/OP_1_Model.gltf", (gltf) => {
  const root = gltf.scene.children[0];
  root.scale.set(0.095, 0.095, 0.095);
  root.updateMatrixWorld(true);

  particles = {};
  const positions = [];

  // Traverse to access file meshes
  gltf.scene.traverse((child) => {
    if (!child.isMesh) return;

    // Get Accurate Points form Subdivision
    const pos = child.geometry.attributes.position;
    const temp = new THREE.Vector3();

    /* If you know the total point count ahead of time,
    you can pre-allocate totalPoints for opimisation */

    const POINTS_COUNT = Math.min(5000, pos.count);
    for (let i = 0; i < POINTS_COUNT; i++) {
      temp.fromBufferAttribute(pos, i);
      temp.applyMatrix4(child.matrixWorld);
      positions.push(temp.x, temp.y, temp.z);
    }

    // Create Random Points Across Model
    const sampler = new MeshSurfaceSampler(child).setWeightAttribute("color").build();

    for (let i = 0; i < 1000; i++) {
      sampler.sample(temp);
      temp.applyMatrix4(child.matrixWorld);
      positions.push(temp.x, temp.y, temp.z);
    }

    // Random Scale Value for each Point
    const totalPoints = positions.length / 3;
    scales = new Float32Array(totalPoints);
    // Fill array with 0-1 values
    for (let i = 0; i < totalPoints; i++) {
      scales[i] = Math.random();
    }
  });

  /* 
    Geometry
  */
  particles.geometry = new THREE.BufferGeometry();
  particles.geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  particles.geometry.setAttribute("aScale", new THREE.BufferAttribute(scales, 1));

  /* 
     Material
  */
  particles.material = new THREE.ShaderMaterial({
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

  particles = new THREE.Points(particles.geometry, particles.material);
  scene.add(particles);

  // Add to debug controls// Add to debug controls
  const folder = gui.addFolder("Noise");
  folder
    .add(particles.material.uniforms.uNoisePeriod, "value")
    .min(0)
    .max(5)
    .step(0.01)
    .name("Period");

  folder
    .add(particles.material.uniforms.uNoiseSpeed, "value")
    .min(0)
    .max(10)
    .step(0.01)
    .name("Speed");

  folder
    .add(particles.material.uniforms.uNoiseStrength, "value")
    .min(0)
    .max(10)
    .step(0.001)
    .name("Strength");
});

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

const unrealBloomPass = new UnrealBloomPass();
unrealBloomPass.strength = 0.4
unrealBloomPass.radius = 0.01
unrealBloomPass.threshold = 0.2
effectComposer.addPass(unrealBloomPass);

// Gamma Correction – FINAL PASS 
const gammaCorrectionPass = new ShaderPass(GammaCorrectionShader);
effectComposer.addPass(gammaCorrectionPass);

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
  if(particles.material) {
    particles.material.uniforms.uTime.value = elapsedTime;
  }

  // Update Passes

  // Render
  // renderer.render(scene, camera);
  effectComposer.render();

  window.requestAnimationFrame(tick);
};

tick();
