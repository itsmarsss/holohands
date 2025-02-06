import { useEffect, useRef } from "react";
import * as THREE from "three";

// Define the prop type for external rotation.
interface Editable3DObjectProps {
    rotation: { x: number; y: number; z: number };
}

function Editable3DObject({ rotation }: Editable3DObjectProps) {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer>();
    const cameraRef = useRef<THREE.PerspectiveCamera>();
    const sceneRef = useRef<THREE.Scene>();
    // New ref to keep track of the cube group.
    const cubeGroupRef = useRef<THREE.Group>();

    useEffect(() => {
        if (!mountRef.current) return;

        // Get initial dimensions from the container.
        const width = mountRef.current.clientWidth;
        const height = mountRef.current.clientHeight;

        // Create the renderer.
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(width, height);
        rendererRef.current = renderer;

        // Append the renderer's canvas to the container.
        mountRef.current.appendChild(renderer.domElement);

        // Create the scene.
        const scene = new THREE.Scene();
        sceneRef.current = scene;

        // Create the camera.
        const camera = new THREE.PerspectiveCamera(
            75,
            width / height,
            0.1,
            1000
        );
        camera.position.z = 5;
        cameraRef.current = camera;

        // Create geometry once.
        const geometry = new THREE.BoxGeometry();

        // Create a face material with 0.25 opacity.
        const faceMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            opacity: 0.25,
            transparent: true,
            wireframe: false,
        });

        // Create a wireframe material.
        const wireframeMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            wireframe: true,
        });

        // Create the face mesh.
        const faceMesh = new THREE.Mesh(geometry, faceMaterial);
        // Create the wireframe mesh.
        const wireframeMesh = new THREE.Mesh(geometry, wireframeMaterial);

        // Create a group and add both meshes.
        const cubeGroup = new THREE.Group();
        cubeGroup.add(faceMesh);
        cubeGroup.add(wireframeMesh);
        cubeGroupRef.current = cubeGroup;
        scene.add(cubeGroup);

        // Animation loop - render continuously.
        const animate = () => {
            requestAnimationFrame(animate);
            renderer.render(scene, camera);
        };
        animate();

        // ResizeObserver to update renderer and camera on container resize.
        const resizeObserver = new ResizeObserver((entries) => {
            for (let entry of entries) {
                const { width, height } = entry.contentRect;
                renderer.setSize(width, height);
                camera.aspect = width / height;
                camera.updateProjectionMatrix();
            }
        });
        resizeObserver.observe(mountRef.current);

        // Cleanup: disconnect observer and dispose renderer resources.
        return () => {
            resizeObserver.disconnect();
            renderer.dispose();
        };
    }, []);

    // Update the cube group's rotation whenever the external rotation prop changes.
    useEffect(() => {
        if (cubeGroupRef.current) {
            cubeGroupRef.current.rotation.x = rotation.x;
            cubeGroupRef.current.rotation.y = rotation.y;
            cubeGroupRef.current.rotation.z = rotation.z;
        }
    }, [rotation]);

    return <div ref={mountRef} style={{ width: "100%", height: "100%" }} />;
}

export default Editable3DObject;
