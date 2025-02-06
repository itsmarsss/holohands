import { useEffect, useRef } from "react";
import * as THREE from "three";

interface Editable3DObjectProps {
    rotation: { x: number; y: number; z: number };
    zoom?: number; // new optional zoom prop
    onRotationChange?: (rotation: { x: number; y: number; z: number }) => void; // new callback prop for mouse rotation
    onZoomChange?: (newZoom: number) => void; // new callback prop for zoom change
    leftHandCursor: { x: number; y: number };
    rightHandCursor: { x: number; y: number };
}

function Editable3DObject({
    rotation,
    zoom,
    onRotationChange,
    onZoomChange,
    leftHandCursor,
    rightHandCursor,
}: Editable3DObjectProps) {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer>();
    const cameraRef = useRef<THREE.PerspectiveCamera>();
    const sceneRef = useRef<THREE.Scene>();
    const mainGroupRef = useRef<THREE.Group>();
    // New refs for pointer tracking and corner marker storage.
    const pointerRef = useRef(new THREE.Vector2(0, 0));
    const cornerMarkersRef = useRef<THREE.Mesh[]>([]);

    // Refs to store hand cursor positions.
    const leftHandCursorRef = useRef<THREE.Vector2 | undefined>(
        new THREE.Vector2(leftHandCursor.x, leftHandCursor.y)
    );
    const rightHandCursorRef = useRef<THREE.Vector2 | undefined>(
        new THREE.Vector2(rightHandCursor.x, rightHandCursor.y)
    );
    useEffect(() => {
        leftHandCursorRef.current = new THREE.Vector2(
            leftHandCursor.x,
            leftHandCursor.y
        );
        rightHandCursorRef.current = new THREE.Vector2(
            rightHandCursor.x,
            rightHandCursor.y
        );
    }, [leftHandCursor, rightHandCursor]);

    useEffect(() => {
        if (!mountRef.current) return;

        // Use offset dimensions to include padding and borders
        const width = mountRef.current.offsetWidth;
        const height = mountRef.current.offsetHeight;

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(width, height);
        rendererRef.current = renderer;
        mountRef.current.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        sceneRef.current = scene;

        const camera = new THREE.PerspectiveCamera(
            75,
            width / height,
            0.1,
            1000
        );
        camera.position.set(0, 3, 5);
        camera.lookAt(0, 0, 0);
        cameraRef.current = camera;

        // Create cube with more visible materials
        // Helper function to add markers at the corners of a mesh.
        const addCornerMarkers = (mesh: THREE.Mesh) => {
            // Ensure the geometry's bounding box is computed.
            mesh.geometry.computeBoundingBox();
            const box = mesh.geometry.boundingBox;
            if (!box) return;
            const min = box.min;
            const max = box.max;
            // Define the 8 corners of the bounding box.
            const corners = [
                new THREE.Vector3(min.x, min.y, min.z),
                new THREE.Vector3(min.x, min.y, max.z),
                new THREE.Vector3(min.x, max.y, min.z),
                new THREE.Vector3(min.x, max.y, max.z),
                new THREE.Vector3(max.x, min.y, min.z),
                new THREE.Vector3(max.x, min.y, max.z),
                new THREE.Vector3(max.x, max.y, min.z),
                new THREE.Vector3(max.x, max.y, max.z),
            ];
            // For each corner, create a small sphere marker with its own material.
            corners.forEach((corner) => {
                const markerMaterial = new THREE.MeshBasicMaterial({
                    color: 0x0000ff,
                });
                const marker = new THREE.Mesh(
                    new THREE.SphereGeometry(0.05, 8, 8),
                    markerMaterial
                );
                marker.position.copy(corner);
                mesh.add(marker);
                // Store the marker for later raycasting.
                cornerMarkersRef.current.push(marker);
            });
        };
        const geometry = new THREE.BoxGeometry();
        const faceMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            opacity: 0.5, // Increased opacity for better visibility
            transparent: true,
        });
        const wireframeMaterial = new THREE.MeshBasicMaterial({
            color: 0x000000, // Changed wireframe color to black for contrast
            wireframe: true,
        });
        const cube = new THREE.Mesh(geometry, [
            faceMaterial,
            wireframeMaterial,
        ]);
        addCornerMarkers(cube);

        const mainGroup = new THREE.Group();
        mainGroup.add(new THREE.GridHelper(25, 25)); // Add grid helper
        mainGroup.add(cube);

        // Add a second cube to the environment.
        // Using the same geometry but a different material (red) for contrast.
        const secondCube = new THREE.Mesh(
            geometry,
            new THREE.MeshBasicMaterial({
                color: 0xff0000,
                opacity: 0.5,
                transparent: true,
            })
        );
        // Position the second cube offset from the original cube.
        secondCube.position.set(3, 0, 0);
        addCornerMarkers(secondCube);
        mainGroup.add(secondCube);

        mainGroupRef.current = mainGroup;
        scene.add(mainGroup);

        const raycaster = new THREE.Raycaster();
        const animate = () => {
            requestAnimationFrame(animate);
            // Convert raw hand cursor coordinates (in pixels) to normalized device coordinates.
            if (mountRef.current) {
                const rect = mountRef.current.getBoundingClientRect();
                if (leftHandCursor) {
                    leftHandCursorRef.current?.set(
                        (leftHandCursor.x / rect.width) * 2 - 1,
                        -((leftHandCursor.y - rect.top) / rect.height) * 2 + 1
                    );
                }
                if (rightHandCursor) {
                    rightHandCursorRef.current?.set(
                        (rightHandCursor.x / rect.width) * 2 - 1,
                        -((rightHandCursor.y - rect.top) / rect.height) * 2 + 1
                    );
                }
            }

            const hoveredMarkers = new Set<THREE.Object3D>();
            const pointers: THREE.Vector2[] = [];
            // Always include the mouse pointer.
            pointers.push(pointerRef.current);
            // Include normalized hand cursor pointers if available.
            if (leftHandCursorRef.current)
                pointers.push(leftHandCursorRef.current);
            if (rightHandCursorRef.current)
                pointers.push(rightHandCursorRef.current);

            pointers.forEach((pointer) => {
                raycaster.setFromCamera(pointer, camera);
                const intersects = raycaster.intersectObjects(
                    cornerMarkersRef.current,
                    false
                );
                intersects.forEach((intersect) =>
                    hoveredMarkers.add(intersect.object)
                );
            });

            // Highlight only the closest marker among all pointers if within tolerance.
            const TOLERANCE = 0.1 * (zoom || 1);
            let closestMarker: THREE.Mesh | null = null;
            let minDistance = Infinity;
            pointers.forEach((pointer) => {
                cornerMarkersRef.current.forEach((marker) => {
                    const markerWorldPos = new THREE.Vector3();
                    marker.getWorldPosition(markerWorldPos);
                    markerWorldPos.project(camera);
                    const markerPos2D = new THREE.Vector2(
                        markerWorldPos.x,
                        markerWorldPos.y
                    );
                    const distance = pointer.distanceTo(markerPos2D);
                    if (distance < minDistance) {
                        minDistance = distance;
                        closestMarker = marker;
                    }
                });
            });

            cornerMarkersRef.current.forEach((marker) => {
                const material = marker.material as THREE.MeshBasicMaterial;
                if (marker === closestMarker && minDistance < TOLERANCE) {
                    material.color.set(0xffff00); // Highlight closest marker.
                } else {
                    material.color.set(0x0000ff); // Default blue.
                }
            });

            renderer.render(scene, camera);
        };
        animate();

        const resizeObserver = new ResizeObserver((entries) => {
            const { width, height } = entries[0].contentRect;
            renderer.setSize(width, height);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
        });
        resizeObserver.observe(mountRef.current);

        return () => {
            resizeObserver.disconnect();
            renderer.dispose();
            mountRef.current?.removeChild(renderer.domElement);
        };
    }, []);

    // Update the main group's rotation and scale whenever the external props change.
    useEffect(() => {
        if (mainGroupRef.current) {
            mainGroupRef.current.rotation.set(
                rotation.x,
                rotation.y,
                rotation.z
            );
            if (typeof zoom === "number") {
                mainGroupRef.current.scale.set(zoom, zoom, zoom);
            }
        }
    }, [rotation, zoom]);

    // Add mouse event listeners for interactive rotation.
    useEffect(() => {
        const element = mountRef.current;
        if (!element) return;

        // Use refs to track the drag state.
        const isDragging = { current: false };
        const lastMousePosition = { x: 0, y: 0 };

        const onMouseDown = (e: MouseEvent) => {
            isDragging.current = true;
            lastMousePosition.x = e.clientX;
            lastMousePosition.y = e.clientY;
        };

        const onMouseMove = (e: MouseEvent) => {
            // Update pointer for raycasting.
            const rect = element.getBoundingClientRect();
            pointerRef.current.x =
                ((e.clientX - rect.left) / rect.width) * 2 - 1;
            pointerRef.current.y =
                -((e.clientY - rect.top) / rect.height) * 2 + 1;

            if (!isDragging.current) {
                return;
            }

            const dx = e.clientX - lastMousePosition.x;
            const dy = e.clientY - lastMousePosition.y;
            const sensitivity = 0.005; // Adjust sensitivity as needed.

            if (mainGroupRef.current) {
                mainGroupRef.current.rotation.y += dx * sensitivity;
                mainGroupRef.current.rotation.x += dy * sensitivity;

                // Synchronize the rotation with parent's state.
                if (onRotationChange) {
                    onRotationChange({
                        x: mainGroupRef.current.rotation.x,
                        y: mainGroupRef.current.rotation.y,
                        z: mainGroupRef.current.rotation.z,
                    });
                }
            }

            lastMousePosition.x = e.clientX;
            lastMousePosition.y = e.clientY;
        };

        const onMouseUp = () => {
            isDragging.current = false;
        };

        element.addEventListener("mousedown", onMouseDown);
        element.addEventListener("mousemove", onMouseMove);
        element.addEventListener("mouseup", onMouseUp);
        element.addEventListener("mouseleave", onMouseUp);

        // Add scroll-wheel event listener for zooming in/out.
        const onWheel = (e: WheelEvent) => {
            // Prevent page scroll
            e.preventDefault();
            if (mainGroupRef.current) {
                const sensitivity = 0.002; // Adjust sensitivity as needed.
                // Read the current uniform scale (assuming uniform scale is used)
                let currentZoom = mainGroupRef.current.scale.x;
                // Scrolling up (deltaY negative) should zoom in, scrolling down zoom out.
                let newZoom = currentZoom - e.deltaY * sensitivity;
                // Clamp the zoom level between 0.5 and 5.
                newZoom = Math.max(0.5, Math.min(5, newZoom));
                // Propagate the new zoom to the parent.
                if (onZoomChange) {
                    onZoomChange(newZoom);
                }
                // Optionally update the group's scale immediately.
                mainGroupRef.current.scale.set(newZoom, newZoom, newZoom);
            }
        };
        element.addEventListener("wheel", onWheel, { passive: false });

        return () => {
            element.removeEventListener("mousedown", onMouseDown);
            element.removeEventListener("mousemove", onMouseMove);
            element.removeEventListener("mouseup", onMouseUp);
            element.removeEventListener("mouseleave", onMouseUp);
            element.removeEventListener("wheel", onWheel);
        };
    }, [onRotationChange, onZoomChange]);

    return <div ref={mountRef} style={{ width: "100%", height: "100%" }} />;
}

export default Editable3DObject;
