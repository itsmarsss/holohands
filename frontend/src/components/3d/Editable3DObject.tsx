import { useEffect, useRef } from "react";
import * as THREE from "three";

function Editable3DObject() {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer>();
    const cameraRef = useRef<THREE.PerspectiveCamera>();
    const sceneRef = useRef<THREE.Scene>();

    useEffect(() => {
        if (!mountRef.current) return;

        // Get initial dimensions from the container
        const width = mountRef.current.clientWidth;
        const height = mountRef.current.clientHeight;

        // Create the renderer
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(width, height);
        rendererRef.current = renderer;

        // Append the renderer's canvas to the container
        mountRef.current.appendChild(renderer.domElement);

        // Create the scene
        const scene = new THREE.Scene();
        sceneRef.current = scene;

        // Create the camera
        const camera = new THREE.PerspectiveCamera(
            75,
            width / height,
            0.1,
            1000
        );
        camera.position.z = 5;
        cameraRef.current = camera;

        // Example: create a cube and add it to the scene
        const geometry = new THREE.BoxGeometry();
        const material = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            wireframe: true,
        });
        const cube = new THREE.Mesh(geometry, material);
        scene.add(cube);

        // Animation loop
        const animate = () => {
            requestAnimationFrame(animate);
            cube.rotation.x += 0.01;
            cube.rotation.y += 0.01;
            renderer.render(scene, camera);
        };
        animate();

        // Use ResizeObserver to update renderer and camera on container resize,
        // similar to how the overlay canvas scales.
        const resizeObserver = new ResizeObserver((entries) => {
            for (let entry of entries) {
                const { width, height } = entry.contentRect;
                renderer.setSize(width, height);
                camera.aspect = width / height;
                camera.updateProjectionMatrix();
            }
        });
        resizeObserver.observe(mountRef.current);

        // Cleanup: disconnect observer and dispose renderer resources
        return () => {
            resizeObserver.disconnect();
            renderer.dispose();
        };
    }, []);

    return <div ref={mountRef} style={{ width: "100%", height: "100%" }} />;
}

export default Editable3DObject;
