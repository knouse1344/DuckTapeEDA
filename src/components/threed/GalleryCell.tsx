import { useRef, useEffect } from "react";
import * as THREE from "three";
import type { Component } from "../../types/circuit";
import { buildComponentForGallery } from "./buildScene";

interface Props {
  comp: Component;
  label: string;
}

export default function GalleryCell({ comp, label }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // --- Renderer ---
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0xf0f0f0);
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    container.appendChild(renderer.domElement);

    // --- Scene ---
    const scene = new THREE.Scene();

    // Lighting (match ThreeDRenderer)
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(30, 50, 30);
    scene.add(dirLight);
    const backLight = new THREE.DirectionalLight(0xffffff, 0.3);
    backLight.position.set(-20, 30, -20);
    scene.add(backLight);

    // Small green ground plane for context
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

    // --- Build component model ---
    const group = buildComponentForGallery(comp);
    scene.add(group);

    // --- Camera auto-fit ---
    const box = new THREE.Box3().setFromObject(group);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 1);
    const fov = 45;
    const fitDistance = (maxDim / (2 * Math.tan((fov * Math.PI) / 360))) * 1.8;

    const camera = new THREE.PerspectiveCamera(fov, w / h, 0.1, 500);

    // Orbit state — orbit around model center
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

    // --- Orbit controls (scoped to this canvas) ---
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

    // --- Animation loop ---
    let animId = 0;
    function animate() {
      animId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    }
    animate();

    // --- Resize handling ---
    const onResize = () => {
      const rw = container.clientWidth;
      const rh = container.clientHeight;
      renderer.setSize(rw, rh);
      camera.aspect = rw / rh;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    // --- Cleanup ---
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
      className="w-full h-64 cursor-grab active:cursor-grabbing"
    />
  );
}
