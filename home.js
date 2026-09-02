import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

const canvas = document.querySelector('.webgl');
const particleStage = document.querySelector('.particle-stage');
const loaderElement = document.querySelector('.loader');
const loaderValue = document.querySelector('.loader-value');
const loaderBar = document.querySelector('.loader-track i');
const experience = document.querySelector('.experience');
const chapters = [...document.querySelectorAll('.chapter')];
const stageDots = [...document.querySelectorAll('.stage-dot')];
const modelNumber = document.querySelector('.model-number');
const modelName = document.querySelector('.model-name');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

document.body.classList.add('is-loading');
const assetBase = import.meta.env.BASE_URL;

const models = [
  {
    name: 'VECTOR M4',
    url: `${assetBase}mouse/Med_PC_Mouse_GLB/Med_PC_Mouse.glb`,
    size: 3.6,
    // Un peu de matière dans le creux de la souris pour garder son volume lisible.
    interiorWeight: .28,
    // Face supérieure visible, avec une légère ouverture sur le côté gauche.
    rotation: [Math.PI / 2, 0.08, 0.18],
  },
  {
    name: 'AXIOM K75',
    url: `${assetBase}keyboard/scene.gltf`,
    size: 3.7,
    interiorWeight: .1,
    // Face de frappe vers la caméra, dans le bon sens avec la barre d'espace en bas.
    rotation: [1.82, 0.04, -0.12],
  },
  {
    name: 'NOVA H9',
    url: `${assetBase}earphone.glb`,
    size: 3.65,
    interiorWeight: .16,
    rotation: [0, 0.15, -0.04],
  },
  {
    name: 'PULSE X',
    url: `${assetBase}controller/scene.gltf`,
    size: 3.35,
    // La façade de la manette reçoit davantage de points que le clavier.
    interiorWeight: .28,
    rotation: [0, 0.04, -0.06],
  },
];

const pointCount = window.innerWidth < 700 ? 16000 : window.innerWidth < 1100 ? 26000 : 42000;
const gltfLoader = new GLTFLoader();
let loadedModels = 0;

function setLoading(value) {
  const bounded = Math.min(100, Math.round(value));
  loaderValue.textContent = bounded;
  loaderBar.style.width = `${bounded}%`;
}

function dismissLoader() {
  setLoading(100);
  window.setTimeout(() => {
    loaderElement.classList.add('is-done');
    document.body.classList.remove('is-loading');
  }, 420);
}

function binarySearch(cumulative, target) {
  let low = 0;
  let high = cumulative.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (cumulative[middle] < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

function sampleSurface(root, config) {
  root.updateWorldMatrix(true, true);
  const triangles = [];
  const triangleEdges = [];
  const cumulative = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const bounds = new THREE.Box3();
  const rotation = new THREE.Euler(...config.rotation, 'XYZ');
  let totalArea = 0;

  root.traverse((node) => {
    if (!node.isMesh || !node.geometry?.attributes?.position) return;
    const geometry = node.geometry;
    const positions = geometry.attributes.position;
    const indices = geometry.index;
    const triangleCount = indices ? Math.floor(indices.count / 3) : Math.floor(positions.count / 3);

    for (let index = 0; index < triangleCount; index += 1) {
      const ia = indices ? indices.getX(index * 3) : index * 3;
      const ib = indices ? indices.getX(index * 3 + 1) : index * 3 + 1;
      const ic = indices ? indices.getX(index * 3 + 2) : index * 3 + 2;
      a.fromBufferAttribute(positions, ia).applyMatrix4(node.matrixWorld);
      b.fromBufferAttribute(positions, ib).applyMatrix4(node.matrixWorld);
      c.fromBufferAttribute(positions, ic).applyMatrix4(node.matrixWorld);
      edgeA.subVectors(b, a);
      edgeB.subVectors(c, a);
      const area = normal.crossVectors(edgeA, edgeB).length() * 0.5;
      if (!Number.isFinite(area) || area < 1e-10) continue;
      const faceNormal = normal.clone().normalize().applyEuler(rotation);
      // Les faces qui regardent le profil de l'objet servent de masque de bord.
      // Elles reçoivent beaucoup plus de points que les surfaces frontales.
      const silhouette = 1 - Math.abs(faceNormal.z);
      triangles.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      triangleEdges.push(Math.pow(silhouette, 1.18));
      // La pondération adoucie réserve les points aux bords et aux petits détails
      // (touches, molette, boutons) sans perdre complètement la surface.
      const interiorWeight = config.interiorWeight ?? .16;
      totalArea += Math.pow(area, 0.72) * (interiorWeight + 3.15 * Math.pow(silhouette, 1.45));
      cumulative.push(totalArea);
      bounds.expandByPoint(a);
      bounds.expandByPoint(b);
      bounds.expandByPoint(c);
    }
  });

  if (!triangles.length || !totalArea) throw new Error(`Le modèle ${config.name} ne contient aucune surface exploitable.`);

  const center = bounds.getCenter(new THREE.Vector3());
  const dimensions = bounds.getSize(new THREE.Vector3());
  const scale = config.size / Math.max(dimensions.x, dimensions.y, dimensions.z);
  const sampled = new Float32Array(pointCount * 3);
  const edgeValues = new Float32Array(pointCount);
  const point = new THREE.Vector3();

  for (let index = 0; index < pointCount; index += 1) {
    const triangleIndex = binarySearch(cumulative, Math.random() * totalArea);
    const triangle = triangleIndex * 9;
    let r1 = Math.random();
    let r2 = Math.random();
    if (r1 + r2 > 1) {
      r1 = 1 - r1;
      r2 = 1 - r2;
    }
    const r3 = 1 - r1 - r2;
    point.set(
      triangles[triangle] * r1 + triangles[triangle + 3] * r2 + triangles[triangle + 6] * r3,
      triangles[triangle + 1] * r1 + triangles[triangle + 4] * r2 + triangles[triangle + 7] * r3,
      triangles[triangle + 2] * r1 + triangles[triangle + 5] * r2 + triangles[triangle + 8] * r3,
    );
    point.sub(center).multiplyScalar(scale).applyEuler(rotation);
    sampled[index * 3] = point.x;
    sampled[index * 3 + 1] = point.y;
    sampled[index * 3 + 2] = point.z;
    edgeValues[index] = Math.min(1, triangleEdges[triangleIndex] + Math.random() * .08);
  }

  return { positions: sampled, edge: edgeValues };
}

function fallbackShape(stage) {
  const result = new Float32Array(pointCount * 3);
  const edge = new Float32Array(pointCount);
  for (let index = 0; index < pointCount; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const elevation = Math.acos(2 * Math.random() - 1);
    let x = Math.sin(elevation) * Math.cos(angle);
    let y = Math.cos(elevation);
    let z = Math.sin(elevation) * Math.sin(angle);
    if (stage === 0) { x *= 1.05; y *= 1.65; z *= .7; }
    if (stage === 1) { x *= 2.1; y *= .72; z *= .28; }
    if (stage === 2) { const ring = 1.15 + Math.random() * .35; x = Math.cos(angle) * ring; y = Math.sin(angle) * 1.25; z *= .38; }
    if (stage === 3) { x *= 1.8; y *= .8; z *= .55; }
    result[index * 3] = x;
    result[index * 3 + 1] = y;
    result[index * 3 + 2] = z;
    edge[index] = .35 + Math.random() * .45;
  }
  return { positions: result, edge };
}

async function loadShape(config, index) {
  try {
    const gltf = await gltfLoader.loadAsync(config.url);
    const points = sampleSurface(gltf.scene, config);
    loadedModels += 1;
    setLoading(4 + loadedModels * 22);
    return points;
  } catch (error) {
    console.warn(`Modèle de secours utilisé pour ${config.name}.`, error);
    loadedModels += 1;
    setLoading(4 + loadedModels * 22);
    return fallbackShape(index);
  }
}

function makeAmbientLayer(scene, sharedUniforms, options) {
  const positions = new Float32Array(options.count * 3);
  const seeds = new Float32Array(options.count * 4);
  const sizes = new Float32Array(options.count);
  const hues = new Float32Array(options.count);
  const aspect = window.innerWidth / window.innerHeight;
  const halfFov = THREE.MathUtils.degToRad(43 * .5);

  for (let index = 0; index < options.count; index += 1) {
    const z = THREE.MathUtils.lerp(options.zMin, options.zMax, Math.random());
    const distanceFromCamera = Math.max(1.25, 7.1 - z);
    const halfHeight = Math.tan(halfFov) * distanceFromCamera * 1.12;
    const halfWidth = halfHeight * aspect;
    positions[index * 3] = (Math.random() * 2 - 1) * halfWidth;
    positions[index * 3 + 1] = (Math.random() * 2 - 1) * halfHeight;
    positions[index * 3 + 2] = z;
    seeds[index * 4] = Math.random();
    seeds[index * 4 + 1] = Math.random();
    seeds[index * 4 + 2] = Math.random();
    seeds[index * 4 + 3] = Math.random();
    sizes[index] = THREE.MathUtils.lerp(options.sizeMin, options.sizeMax, Math.pow(Math.random(), .72));
    hues[index] = Math.random();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aHue', new THREE.BufferAttribute(hues, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...sharedUniforms,
      uOpacity: { value: options.opacity },
      uMotion: { value: options.motion },
      uColorfulness: { value: options.colorfulness },
    },
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    vertexShader: `
      uniform float uTime;
      uniform vec2 uMouse;
      uniform float uPointerActive;
      uniform float uPixelRatio;
      uniform float uOpacity;
      uniform float uMotion;
      uniform vec2 uPivot;
      attribute vec4 aSeed;
      attribute float aSize;
      attribute float aHue;
      varying float vHue;
      varying float vAlpha;
      varying float vCore;

      void main() {
        float direction = step(.5, aSeed.w) * 2.0 - 1.0;
        float localTime = uTime * (.14 + aSeed.x * .42) * direction;
        vec3 animatedPosition = position;

        // Chaque grain suit une orbite différente sur les trois axes.
        animatedPosition.x += (sin(localTime + aSeed.y * 6.28318) + cos(localTime * .43 + aSeed.z * 8.1) * .45) * (.09 + aSeed.z * .31) * uMotion;
        animatedPosition.y += (cos(localTime * .78 + aSeed.z * 6.28318) + sin(localTime * .37 + aSeed.x * 7.4) * .5) * (.08 + aSeed.y * .27) * uMotion;
        animatedPosition.z += (sin(localTime * .61 + aSeed.x * 6.28318) + cos(localTime * .29 + aSeed.w * 5.7) * .4) * (.1 + aSeed.x * .38) * uMotion;

        // Le nuage tourne autour du centre de l'objet affiché, même lorsque celui-ci
        // est décalé à gauche ou à droite par la mise en page.
        vec2 pointer = uMouse * uPointerActive;
        float yaw = pointer.x * .34;
        float pitch = -pointer.y * .27;
        mat2 yawTurn = mat2(cos(yaw), -sin(yaw), sin(yaw), cos(yaw));
        mat2 pitchTurn = mat2(cos(pitch), -sin(pitch), sin(pitch), cos(pitch));
        vec3 pivot = vec3(uPivot, 0.0);
        animatedPosition -= pivot;
        animatedPosition.xz = yawTurn * animatedPosition.xz;
        animatedPosition.yz = pitchTurn * animatedPosition.yz;
        animatedPosition += pivot;
        animatedPosition.x += pointer.x * (.035 + aSeed.y * .09);
        animatedPosition.y += pointer.y * (.025 + aSeed.z * .07);

        vec4 viewPosition = viewMatrix * modelMatrix * vec4(animatedPosition, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        float depthScale = clamp(7.1 / max(1.35, -viewPosition.z), .68, 1.8);
        gl_PointSize = clamp(uPixelRatio * aSize * depthScale, 1.8 * uPixelRatio, 7.8 * uPixelRatio);
        vHue = fract(aHue + animatedPosition.x * .018 + animatedPosition.y * .026 + uTime * .007);
        vAlpha = uOpacity * mix(.48, 1.0, aSeed.z);
        vCore = aSeed.w;
      }
    `,
    fragmentShader: `
      varying float vHue;
      varying float vAlpha;
      varying float vCore;
      uniform float uColorfulness;

      vec3 spectrum(float value) {
        vec3 rgb = .5 + .5 * cos(6.28318 * (value + vec3(.02, .34, .67)));
        return pow(rgb, vec3(1.22)) * 1.12;
      }

      void main() {
        float distanceToCenter = length(gl_PointCoord - .5);
        float alpha = smoothstep(.5, .16, distanceToCenter) * vAlpha;
        float core = smoothstep(.2, 0.0, distanceToCenter);
        // Les grains libres restent majoritairement bleu acier/cyan. Quelques
        // accents RGB très atténués suffisent à les relier visuellement au modèle.
        float coolVariation = .5 + .5 * sin(vHue * 6.28318);
        vec3 coolColor = mix(vec3(.09, .14, .22), vec3(.2, .4, .5), coolVariation);
        float rareAccent = smoothstep(.88, 1.0, vCore);
        float rgbAmount = uColorfulness * mix(.55, 1.65, rareAccent);
        vec3 color = mix(coolColor, spectrum(vHue), rgbAmount);
        color = mix(color, vec3(.78, .9, 1.0), core * .08);
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });

  const particles = new THREE.Points(geometry, material);
  particles.frustumCulled = false;
  particles.renderOrder = options.renderOrder;
  scene.add(particles);
  return particles;
}

function makeAmbientParticles(scene) {
  const mobile = window.innerWidth < 700;
  const sharedUniforms = {
    uTime: { value: 0 },
    uMouse: { value: new THREE.Vector2(5, 5) },
    uPointerActive: { value: 0 },
    uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    uPivot: { value: new THREE.Vector2() },
  };

  // Un volume profond se dessine sous le modèle ; un second, plus léger,
  // passe réellement devant lui pour supprimer l'effet de fond plat.
  const layers = [
    makeAmbientLayer(scene, sharedUniforms, {
      count: mobile ? 900 : 2200,
      zMin: -4.8,
      zMax: 2.35,
      sizeMin: 1.85,
      sizeMax: 4.35,
      opacity: .48,
      motion: 1,
      colorfulness: .1,
      renderOrder: 0,
    }),
    makeAmbientLayer(scene, sharedUniforms, {
      count: mobile ? 220 : 560,
      zMin: 2.45,
      zMax: 5.35,
      sizeMin: 1.75,
      sizeMax: 4.65,
      opacity: .4,
      motion: 1.2,
      colorfulness: .14,
      renderOrder: 2,
    }),
  ];

  return { layers, uniforms: sharedUniforms };
}

function createParticleSystem(shapes, scene) {
  const geometry = new THREE.BufferGeometry();
  const random = new Float32Array(pointCount * 3);
  for (let index = 0; index < pointCount; index += 1) {
    random[index * 3] = Math.random();
    random[index * 3 + 1] = Math.random();
    random[index * 3 + 2] = Math.random();
  }
  shapes.forEach((shape, index) => {
    geometry.setAttribute(`aPosition${index}`, new THREE.BufferAttribute(shape.positions, 3));
    geometry.setAttribute(`aEdge${index}`, new THREE.BufferAttribute(shape.edge, 1));
  });
  geometry.setAttribute('position', new THREE.BufferAttribute(shapes[0].positions, 3));
  geometry.setAttribute('aRandom', new THREE.BufferAttribute(random, 3));

  const uniforms = {
    uTime: { value: 0 },
    uProgress: { value: 0 },
    uMouse: { value: new THREE.Vector2(5, 5) },
    uPointerActive: { value: 0 },
    uSize: { value: Math.min(window.devicePixelRatio, 2) * (window.innerWidth < 700 ? 2.95 : 3.35) },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    // Le mélange normal évite que les couleurs RGB se somment jusqu'au blanc
    // quand les particules de contour se superposent.
    blending: THREE.NormalBlending,
    vertexShader: `
      uniform float uTime;
      uniform float uProgress;
      uniform vec2 uMouse;
      uniform float uPointerActive;
      uniform float uSize;
      attribute vec3 aPosition0;
      attribute vec3 aPosition1;
      attribute vec3 aPosition2;
      attribute vec3 aPosition3;
      attribute float aEdge0;
      attribute float aEdge1;
      attribute float aEdge2;
      attribute float aEdge3;
      attribute vec3 aRandom;
      varying float vHue;
      varying float vEnergy;
      varying float vEdge;
      varying float vVisibility;

      float ease(float t) { return t * t * (3.0 - 2.0 * t); }

      void main() {
        float section = floor(min(uProgress, 2.999));
        float rawMix = fract(min(uProgress, 2.999));
        float stagger = aRandom.x * 0.17;
        float localMix = ease(clamp((rawMix - stagger) / 0.83, 0.0, 1.0));
        vec3 fromPosition = aPosition0;
        vec3 toPosition = aPosition1;
        float fromEdge = aEdge0;
        float toEdge = aEdge1;
        if (section > 0.5) { fromPosition = aPosition1; toPosition = aPosition2; fromEdge = aEdge1; toEdge = aEdge2; }
        if (section > 1.5) { fromPosition = aPosition2; toPosition = aPosition3; fromEdge = aEdge2; toEdge = aEdge3; }

        vec3 position = mix(fromPosition, toPosition, localMix);
        float edge = mix(fromEdge, toEdge, localMix);
        float burst = sin(localMix * 3.14159265);
        vec3 scatterDirection = normalize(aRandom - 0.5 + vec3(0.001));
        float spiral = sin(position.y * 2.8 + uTime * 0.85 + aRandom.z * 9.0);
        // Au milieu d'un morphing, le nuage se désagrège vraiment avant de
        // reconstruire l'objet suivant au lieu de rester dans une masse compacte.
        float explosion = pow(burst, .72);
        position += scatterDirection * explosion * (1.25 + aRandom.y * 3.75);
        position += vec3(
          sin(aRandom.z * 17.0 + uTime * .7),
          cos(aRandom.x * 15.0 - uTime * .55),
          sin(aRandom.y * 13.0 + uTime * .42)
        ) * explosion * (.12 + aRandom.x * .3);

        // Éclaircir fortement le nuage au sommet de l'explosion est essentiel :
        // avec 42 000 points affichés ensemble, augmenter le rayon ne suffit pas
        // et produit seulement une masse plus grande mais toujours compacte.
        float thinning = smoothstep(.12, .86, explosion);
        float keepLimit = mix(1.0, .14, thinning);
        float selectedParticle = 1.0 - smoothstep(keepLimit - .055, keepLimit, aRandom.z);
        vVisibility = mix(1.0, selectedParticle, thinning);
        position.xz += vec2(cos(uTime * .25 + aRandom.x * 6.28), sin(uTime * .22 + aRandom.z * 6.28)) * .018;
        position += scatterDirection * spiral * .025;

        // Le modèle suit vraiment le curseur sur ses deux axes, pas seulement le décor.
        vec2 pointer = uMouse * uPointerActive;
        float yaw = pointer.x * .34;
        float pitch = -pointer.y * .27;
        mat2 yawTurn = mat2(cos(yaw), -sin(yaw), sin(yaw), cos(yaw));
        mat2 pitchTurn = mat2(cos(pitch), -sin(pitch), sin(pitch), cos(pitch));
        position.xz = yawTurn * position.xz;
        position.yz = pitchTurn * position.yz;
        position.x += pointer.x * .07;
        position.y += pointer.y * .055;

        vec4 modelPosition = modelMatrix * vec4(position, 1.0);
        vec4 viewPosition = viewMatrix * modelPosition;
        vec4 projectedPosition = projectionMatrix * viewPosition;
        vec2 ndc = projectedPosition.xy / projectedPosition.w;
        vec2 delta = ndc - uMouse;
        float pointerDistance = length(delta * vec2(1.0, .75));
        // Une large bosse avance vers la caméra : aucune particule n'est repoussée
        // latéralement, la zone ne forme donc plus de trou sous le curseur.
        float pointerForce = smoothstep(.27, 0.0, pointerDistance);
        viewPosition.z += pointerForce * (.58 + aRandom.y * .42);
        projectedPosition = projectionMatrix * viewPosition;

        gl_Position = projectedPosition;
        gl_PointSize = uSize * (8.0 / max(1.0, -viewPosition.z)) * mix(.78, 1.5, aRandom.y) * (.7 + edge * .75) * (1.0 + pointerForce * .34);
        // Le dégradé vient surtout de la position : chaque objet garde une vraie
        // bande arc-en-ciel lisible, avec juste une petite variation aléatoire.
        vHue = fract(position.x * .2 + position.y * .14 + position.z * .12 + aRandom.x * .22 + uProgress * .08 + uTime * .012);
        vEnergy = .42 + aRandom.z * .35 + edge * .38 + pointerForce * .55 + burst * .08;
        vEdge = edge;
      }
    `,
    fragmentShader: `
      varying float vHue;
      varying float vEnergy;
      varying float vEdge;
      varying float vVisibility;

      vec3 spectrum(float value) {
        // Une palette plus saturée rend le dégradé RGB lisible même sur les faces claires.
        vec3 rgb = .5 + .5 * cos(6.28318 * (value + vec3(.02, .34, .67)));
        return pow(rgb, vec3(1.35)) * 1.16;
      }

      void main() {
        float distanceToCenter = length(gl_PointCoord - .5);
        float alpha = smoothstep(.5, .12, distanceToCenter);
        float core = smoothstep(.22, 0.0, distanceToCenter);
        vec3 color = spectrum(vHue);
        color = mix(color, vec3(1.0), core * (.1 + vEdge * .08) + vEdge * .015);
        gl_FragColor = vec4(color * vEnergy, alpha * (.3 + vEdge * .43 + core * .18) * vVisibility);
      }
    `,
  });

  const particles = new THREE.Points(geometry, material);
  particles.frustumCulled = false;
  particles.renderOrder = 1;
  scene.add(particles);
  return { particles, uniforms };
}

async function init() {
  setLoading(4);
  const shapes = await Promise.all(models.map(loadShape));
  setLoading(92);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(43, window.innerWidth / window.innerHeight, .1, 100);
  camera.position.set(0, 0, 7.1);
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const ambientParticles = makeAmbientParticles(scene);
  const { particles, uniforms } = createParticleSystem(shapes, scene);
  const lenis = new Lenis({
    autoRaf: false,
    // Un lissage plus progressif évite les à-coups de la molette et du tactile.
    lerp: .08,
    smoothWheel: true,
    syncTouch: true,
    syncTouchLerp: .06,
    wheelMultiplier: .7,
    anchors: { lerp: .18 },
    stopInertiaOnNavigate: true,
  });
  const clock = new THREE.Clock();
  const pointer = new THREE.Vector2(5, 5);
  const smoothPointer = new THREE.Vector2(5, 5);
  const baseSidePositions = [1.22, -1.75, 1.15, -1.45];
  const wideSidePositions = [2.1, -2.1, 1.8, -1.8];
  // Sur mobile, les modèles restent près du centre pour éviter qu'une moitié
  // de l'objet disparaisse derrière les bords de l'écran étroit.
  const mobileSidePositions = [.18, -.22, .16, -.2];
  let sidePositions = [];
  function updateSidePositions() {
    if (window.innerWidth < 980) {
      sidePositions = mobileSidePositions.slice();
      return;
    }
    // La scène s'ouvre progressivement, puis reste dans une largeur utile fixe.
    const wideLayoutProgress = THREE.MathUtils.clamp((window.innerWidth - 1800) / 600, 0, 1);
    sidePositions = baseSidePositions.map((position, index) => (
      THREE.MathUtils.lerp(position, wideSidePositions[index], wideLayoutProgress)
    ));
  }
  updateSidePositions();
  const glowPosition = new THREE.Vector3();
  let targetProgress = 0;
  let currentProgress = 0;
  let activeStage = -1;

  function updateStage() {
    const top = experience.offsetTop;
    const travel = Math.max(1, experience.offsetHeight - window.innerHeight);
    targetProgress = THREE.MathUtils.clamp((window.scrollY - top) / travel, 0, 1) * 3;
    const stage = Math.round(targetProgress);
    const rect = experience.getBoundingClientRect();
    document.body.classList.toggle('outside-experience', rect.bottom <= window.innerHeight * .2 || rect.top >= window.innerHeight);
    if (stage === activeStage) return;
    activeStage = stage;
    chapters.forEach((chapter, index) => chapter.classList.toggle('is-active', index === stage));
    stageDots.forEach((dot, index) => dot.classList.toggle('is-active', index === stage));
    modelNumber.textContent = String(stage + 1).padStart(2, '0');
    modelName.textContent = models[stage].name;
  }

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    updateSidePositions();
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    uniforms.uSize.value = pixelRatio * (window.innerWidth < 700 ? 2.95 : 3.35);
    ambientParticles.uniforms.uPixelRatio.value = pixelRatio;
  }

  function render(time) {
    lenis.raf(time);
    const elapsed = reduceMotion ? 0 : clock.getElapsedTime();
    // Lenis lisse déjà la position native : cette seconde interpolation reste
    // légère pour que le morphing ne donne pas une impression de retard.
    currentProgress += (targetProgress - currentProgress) * (reduceMotion ? 1 : .22);
    smoothPointer.lerp(pointer, .075);
    uniforms.uTime.value = elapsed;
    uniforms.uProgress.value = currentProgress;
    uniforms.uMouse.value.copy(smoothPointer);
    ambientParticles.uniforms.uTime.value = elapsed;
    ambientParticles.uniforms.uMouse.value.copy(smoothPointer);
    ambientParticles.uniforms.uPointerActive.value = uniforms.uPointerActive.value;
    const fromStage = Math.min(2, Math.floor(currentProgress));
    const stageMix = THREE.MathUtils.smoothstep(currentProgress - fromStage, 0, 1);
    const targetX = THREE.MathUtils.lerp(sidePositions[fromStage], sidePositions[fromStage + 1], stageMix);
    particles.position.x += (targetX - particles.position.x) * .065;
    particles.position.y = window.innerWidth < 980 ? .82 : 0;
    ambientParticles.uniforms.uPivot.value.set(particles.position.x, particles.position.y);
    glowPosition.set(particles.position.x, particles.position.y, 0).project(camera);
    particleStage.style.setProperty('--model-glow-x', `${THREE.MathUtils.clamp(glowPosition.x * 50 + 50, 12, 88)}%`);
    particleStage.style.setProperty('--model-glow-y', `${THREE.MathUtils.clamp(-glowPosition.y * 50 + 50, 12, 88)}%`);
    particles.rotation.z = Math.sin(elapsed * .16) * .025;
    renderer.render(scene, camera);
    window.requestAnimationFrame(render);
  }

  window.addEventListener('scroll', updateStage, { passive: true });
  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', (event) => {
    const nextX = (event.clientX / window.innerWidth) * 2 - 1;
    const nextY = -(event.clientY / window.innerHeight) * 2 + 1;
    // À la première entrée dans la fenêtre, on évite un saut depuis la position hors écran.
    if (!uniforms.uPointerActive.value) smoothPointer.set(nextX, nextY);
    pointer.set(nextX, nextY);
    uniforms.uPointerActive.value = 1;
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => {
    pointer.set(5, 5);
    uniforms.uPointerActive.value = 0;
  });
  stageDots.forEach((dot) => dot.addEventListener('click', () => {
    lenis.scrollTo(document.getElementById(dot.dataset.target), { lerp: reduceMotion ? 1 : .18 });
  }));

  updateStage();
  dismissLoader();
  window.requestAnimationFrame(render);
}

document.querySelectorAll('.heart-button').forEach((button) => {
  button.addEventListener('click', () => {
    const active = button.classList.toggle('is-favorite');
    button.textContent = active ? '♥' : '♡';
  });
});

document.querySelector('.search-trigger')?.addEventListener('click', () => { window.location.href = 'shop.html#selection'; });

init().catch((error) => {
  console.error('Impossible d’initialiser la scène WebGL.', error);
  document.body.classList.add('webgl-fallback');
  dismissLoader();
});
