import { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import type { Component } from "../../types/circuit";
import { buildComponentForGallery } from "./buildScene";

interface Props {
  comp: Component;
  label: string;
  /** When true, renders a full interactive 3D view with orbit controls.
   *  When false (default), renders a single-frame snapshot as a static image
   *  to avoid exhausting WebGL contexts in the grid. */
  interactive?: boolean;
}

/** Build scene, camera, etc. shared by both modes */
function buildPreviewScene(comp: Component, w: number, h: number) {
  const scene = new THREE.Scene();

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(30, 50, 30);
  scene.add(dirLight);
  const backLight = new THREE.DirectionalLight(0xffffff, 0.3);
  backLight.position.set(-20, 30, -20);
  scene.add(backLight);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshPhongMaterial({
      color: 0x2d6b35,
      specular: 0x111111,
      shininess: 30,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  scene.add(ground);

  const group = buildComponentForGallery(comp);
  scene.add(group);

  const box = new THREE.Box3().setFromObject(group);
  const center = new THREE.Vector3();
  box.getCenter(center);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z, 1);
  const fov = 45;
  const fitDistance = (maxDim / (2 * Math.tan((fov * Math.PI) / 360))) * 1.8;

  const camera = new THREE.PerspectiveCamera(fov, w / h, 0.1, 500);

  // Default viewing angle
  const theta = Math.PI / 4;
  const phi = Math.PI / 4;
  camera.position.set(
    center.x + fitDistance * Math.sin(phi) * Math.cos(theta),
    center.y + fitDistance * Math.cos(phi),
    center.z + fitDistance * Math.sin(phi) * Math.sin(theta)
  );
  camera.lookAt(center);

  return { scene, camera, center, maxDim, fitDistance };
}

// ── Snapshot sub-component (grid thumbnails) ─────────────────────

function SnapshotCell({ comp }: { comp: Component }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    // Render a single frame off-screen and capture as image
    const w = 400;
    const h = 300;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1); // 1x is fine for thumbnails
    renderer.setClearColor(0xf0f0f0);
    renderer.setSize(w, h);

    const { scene, camera } = buildPreviewScene(comp, w, h);
    renderer.render(scene, camera);

    const url = renderer.domElement.toDataURL("image/png");
    setDataUrl(url);

    // Immediately dispose — frees the WebGL context
    renderer.dispose();
    renderer.forceContextLoss();
  }, [comp]);

  if (!dataUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50">
        <div className="text-gray-300 text-xs">Rendering...</div>
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      alt=""
      className="w-full h-full object-cover"
      draggable={false}
    />
  );
}

// ── Interactive sub-component (detail view) ──────────────────────

function InteractiveCell({ comp, label }: { comp: Component; label: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0xf0f0f0);
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    container.appendChild(renderer.domElement);

    const { scene, camera, center, maxDim, fitDistance } = buildPreviewScene(comp, w, h);

    // Orbit state
    const orbitTarget = center.clone();
    let theta = Math.PI / 4;
    let phi = Math.PI / 4;
    let radius = fitDistance;

    function updateCamera() {
      camera.position.set(
        orbitTarget.x + radius * Math.sin(phi) * Math.cos(theta),
        orbitTarget.y + radius * Math.cos(phi),
        orbitTarget.z + radius * Math.sin(phi) * Math.sin(theta)
      );
      camera.lookAt(orbitTarget);
    }
    updateCamera();

    // Orbit controls
    let isDragging = false;
    let prevMouse = { x: 0, y: 0 };

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      prevMouse = { x: e.clientX, y: e.clientY };
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - prevMouse.x;
      const dy = e.clientY - prevMouse.y;
      theta -= dx * 0.01;
      phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi + dy * 0.01));
      prevMouse = { x: e.clientX, y: e.clientY };
      updateCamera();
    };
    const onMouseUp = () => {
      isDragging = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      radius = Math.max(
        maxDim * 0.5,
        Math.min(maxDim * 8, radius + e.deltaY * 0.05)
      );
      updateCamera();
    };

    const canvas = renderer.domElement;
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    // Animation loop
    let animId = 0;
    function animate() {
      animId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    }
    animate();

    // Resize handling
    const onResize = () => {
      const rw = container.clientWidth;
      const rh = container.clientHeight;
      renderer.setSize(rw, rh);
      camera.aspect = rw / rh;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animId);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("wheel", onWheel);
      resizeObserver.disconnect();
      renderer.dispose();
      if (container.contains(canvas)) {
        container.removeChild(canvas);
      }
    };
  }, [comp, label]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full cursor-grab active:cursor-grabbing"
    />
  );
}

// ── Main export ──────────────────────────────────────────────────

export default function GalleryCell({ comp, label, interactive = false }: Props) {
  if (interactive) {
    return <InteractiveCell comp={comp} label={label} />;
  }
  return <SnapshotCell comp={comp} />;
}
