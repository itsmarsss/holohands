import * as THREE from "three";
import { InteractionState } from "../../objects/InteractionState";
import { useEffect, useRef } from "react";
import { Coords, DEFAULT_COORDS } from "../../objects/coords";

interface Editable3DObjectProps {
    interactionState: InteractionState;
}

function Editable3DObject({ interactionState }: Editable3DObjectProps) {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer>();
    const cameraRef = useRef<THREE.PerspectiveCamera>();
    const sceneRef = useRef<THREE.Scene>();
    const mainGroupRef = useRef<THREE.Group>();
    const zoomRef = useRef(1);

    const isDraggingRef = useRef(false);
    const lastMousePosition = useRef<{
        mouse: Coords;
        leftHand: Coords;
        rightHand: Coords;
    }>({
        mouse: DEFAULT_COORDS,
        leftHand: DEFAULT_COORDS,
        rightHand: DEFAULT_COORDS,
    });

    // Global refs for the mouse pointer and the cube's corner markers.
    const pointerRef = useRef(new THREE.Vector2(0, 0));
    const cornerMarkersRef = useRef<THREE.Mesh[]>([]);
    // Track the currently hovered marker.
    const hoveredMarkerRef = useRef<THREE.Mesh | null>(null);

    // Refs for dragging a marker.
    const activeMarkerRef = useRef<THREE.Mesh | null>(null);
    const dragOffsetRef = useRef(new THREE.Vector3());
    const dragPlaneRef = useRef<THREE.Plane | null>(null);

    // Keep an up-to-date copy of the interaction state for hand-based gestures.
    const interactionStateRef = useRef(interactionState);
    useEffect(() => {
        interactionStateRef.current = interactionState;
    }, [interactionState]);

    // Refs for computing gesture deltas.
    const pinchPrevPosRef = useRef<
        Record<"Left" | "Right", { x: number; y: number } | null>
    >({
        Left: null,
        Right: null,
    });
    const previousPinchDistanceRef = useRef<number | null>(null);

    // ────────────────────────────────────────────────────────────────
    // Utility functions for creating and updating our editable cube.
    // ────────────────────────────────────────────────────────────────

    // Given 8 vertices, create a BufferGeometry for a hexahedron.
    const createHexahedronGeometry = (
        vertices: THREE.Vector3[]
    ): THREE.BufferGeometry => {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array([
            vertices[0].x,
            vertices[0].y,
            vertices[0].z,
            vertices[1].x,
            vertices[1].y,
            vertices[1].z,
            vertices[2].x,
            vertices[2].y,
            vertices[2].z,
            vertices[3].x,
            vertices[3].y,
            vertices[3].z,
            vertices[4].x,
            vertices[4].y,
            vertices[4].z,
            vertices[5].x,
            vertices[5].y,
            vertices[5].z,
            vertices[6].x,
            vertices[6].y,
            vertices[6].z,
            vertices[7].x,
            vertices[7].y,
            vertices[7].z,
        ]);
        geometry.setAttribute(
            "position",
            new THREE.BufferAttribute(positions, 3)
        );

        // Define the faces (two triangles per face).
        const indices = [
            // Face 1: "min x" face: markers 0,1,3,2
            0, 1, 3, 0, 3, 2,
            // Face 2: "max x" face: markers 4,6,7,5
            4, 6, 7, 4, 7, 5,
            // Face 3: "min y" face: markers 0,4,5,1
            0, 4, 5, 0, 5, 1,
            // Face 4: "max y" face: markers 2,3,7,6
            2, 3, 7, 2, 7, 6,
            // Face 5: "min z" face: markers 0,2,6,4
            0, 2, 6, 0, 6, 4,
            // Face 6: "max z" face: markers 1,5,7,3
            1, 5, 7, 1, 7, 3,
        ];
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        return geometry;
    };

    // Update the cube geometry (both face and wireframe) from its corner markers.
    const updateCubeGeometry = (faceMesh: THREE.Mesh) => {
        const markers = faceMesh.children.filter(
            (child) => child.userData.isCornerMarker
        );
        if (markers.length !== 8) return; // safety check
        // Sort markers by their stored corner index.
        markers.sort((a, b) => a.userData.cornerIndex - b.userData.cornerIndex);
        const vertices = markers.map((marker) => marker.position.clone());
        const newGeometry = createHexahedronGeometry(vertices);
        faceMesh.geometry.dispose();
        faceMesh.geometry = newGeometry;
    };

    // Create an editable cube from an offset and a face color.
    const createEditableCube = (offset: THREE.Vector3, faceColor: number) => {
        // Define the initial cube bounds.
        const min = new THREE.Vector3(-0.5, -0.5, -0.5);
        const max = new THREE.Vector3(0.5, 0.5, 0.5);
        // Create the eight corner vertices.
        const v0 = new THREE.Vector3(min.x, min.y, min.z);
        const v1 = new THREE.Vector3(min.x, min.y, max.z);
        const v2 = new THREE.Vector3(min.x, max.y, min.z);
        const v3 = new THREE.Vector3(min.x, max.y, max.z);
        const v4 = new THREE.Vector3(max.x, min.y, min.z);
        const v5 = new THREE.Vector3(max.x, min.y, max.z);
        const v6 = new THREE.Vector3(max.x, max.y, min.z);
        const v7 = new THREE.Vector3(max.x, max.y, max.z);
        const vertices = [v0, v1, v2, v3, v4, v5, v6, v7];

        // Build the initial geometry.
        const geometry = createHexahedronGeometry(vertices);

        // Create the face mesh.
        const faceMaterial = new THREE.MeshBasicMaterial({
            color: faceColor,
            opacity: 0.5,
            transparent: true,
        });
        const faceMesh = new THREE.Mesh(geometry.clone(), faceMaterial);
        faceMesh.name = "faceMesh";

        // Add eight corner markers to the face mesh.
        for (let i = 0; i < 8; i++) {
            const markerMaterial = new THREE.MeshBasicMaterial({
                color: 0x0000ff,
            });
            const marker = new THREE.Mesh(
                new THREE.SphereGeometry(0.05, 8, 8),
                markerMaterial
            );
            marker.position.copy(vertices[i]);
            marker.userData.isCornerMarker = true;
            marker.userData.cornerIndex = i;
            faceMesh.add(marker);
            // Also add the marker to our global marker list.
            cornerMarkersRef.current.push(marker);
        }

        // Create a wireframe mesh from the same geometry.
        const wireframeGeom = new THREE.WireframeGeometry(geometry.clone());
        const wireframeMaterial = new THREE.LineBasicMaterial({
            color: 0x000000,
        });
        const wireframeMesh = new THREE.LineSegments(
            wireframeGeom,
            wireframeMaterial
        );
        wireframeMesh.name = "wireframeMesh";

        // Group the face mesh and the wireframe.
        const cubeGroup = new THREE.Group();
        cubeGroup.add(faceMesh);
        cubeGroup.add(wireframeMesh);
        cubeGroup.position.copy(offset);

        // Store an update function in the group's userData.
        cubeGroup.userData.updateGeometry = () => {
            updateCubeGeometry(faceMesh);
            const newWireframe = new THREE.WireframeGeometry(faceMesh.geometry);
            wireframeMesh.geometry.dispose();
            wireframeMesh.geometry = newWireframe;
        };

        return cubeGroup;
    };

    // ────────────────────────────────────────────────────────────────
    // Set up scene, camera, renderer and add our editable cubes.
    // ────────────────────────────────────────────────────────────────

    const cursorDown = (
        x: number,
        y: number,
        source: "mouse" | "leftHand" | "rightHand"
    ) => {
        if (!mountRef.current) return;

        const rect = mountRef.current.getBoundingClientRect();
        // If a marker is hovered, begin dragging it.
        if (hoveredMarkerRef.current) {
            activeMarkerRef.current = hoveredMarkerRef.current;
            const markerWorldPos = new THREE.Vector3();
            activeMarkerRef.current.getWorldPosition(markerWorldPos);
            // Create a plane perpendicular to the camera's direction through the marker.
            const plane = new THREE.Plane();
            const camDir = new THREE.Vector3();
            cameraRef.current!.getWorldDirection(camDir);
            plane.setFromNormalAndCoplanarPoint(camDir, markerWorldPos);
            dragPlaneRef.current = plane;
            // Compute the drag offset.
            const raycaster = new THREE.Raycaster();
            const mouse = new THREE.Vector2(
                ((x - rect.left) / rect.width) * 2 - 1,
                -((y - rect.top) / rect.height) * 2 + 1
            );
            raycaster.setFromCamera(mouse, cameraRef.current!);
            const intersectionPoint = new THREE.Vector3();
            if (raycaster.ray.intersectPlane(plane, intersectionPoint)) {
                dragOffsetRef.current
                    .copy(markerWorldPos)
                    .sub(intersectionPoint);
            }
            return; // Exit early – we're now dragging a marker.
        }
        // Otherwise, start rotating the scene.
        isDraggingRef.current = true;
        lastMousePosition.current[source] = { x, y };
    };

    const cursorMove = (
        x: number,
        y: number,
        source: "mouse" | "leftHand" | "rightHand"
    ) => {
        if (!mountRef.current) return;

        const rect = mountRef.current.getBoundingClientRect();
        pointerRef.current.x = ((x - rect.left) / rect.width) * 2 - 1;
        pointerRef.current.y = -((y - rect.top) / rect.height) * 2 + 1;

        // If dragging a marker, update its position.
        if (activeMarkerRef.current && dragPlaneRef.current) {
            const raycaster = new THREE.Raycaster();
            const mouse = new THREE.Vector2(
                ((x - rect.left) / rect.width) * 2 - 1,
                -((y - rect.top) / rect.height) * 2 + 1
            );
            raycaster.setFromCamera(mouse, cameraRef.current!);
            const intersectionPoint = new THREE.Vector3();
            if (
                raycaster.ray.intersectPlane(
                    dragPlaneRef.current,
                    intersectionPoint
                )
            ) {
                intersectionPoint.add(dragOffsetRef.current);
                const parent = activeMarkerRef.current.parent; // should be the face mesh
                if (parent) {
                    const localPos = parent.worldToLocal(
                        intersectionPoint.clone()
                    );
                    activeMarkerRef.current.position.copy(localPos);
                    // Update the cube's geometry.
                    const cubeGroup = parent.parent;
                    if (cubeGroup && cubeGroup.userData.updateGeometry) {
                        cubeGroup.userData.updateGeometry();
                    }
                } else {
                    activeMarkerRef.current.position.copy(intersectionPoint);
                }
            }
            return;
        }

        if (!isDraggingRef.current) return;

        // Rotate the main group (scene) with mouse movement.
        const dx = x - lastMousePosition.current[source].x;
        const dy = y - lastMousePosition.current[source].y;
        const sensitivity = 0.005;
        if (mainGroupRef.current) {
            mainGroupRef.current.rotation.y += dx * sensitivity;
            mainGroupRef.current.rotation.x += dy * sensitivity;
        }
        lastMousePosition.current[source] = { x, y };
    };

    const cursorUp = () => {
        isDraggingRef.current = false;
        activeMarkerRef.current = null;
        dragPlaneRef.current = null;
    };

    useEffect(() => {
        if (!mountRef.current) return;

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

        const mainGroup = new THREE.Group();
        mainGroup.add(new THREE.GridHelper(25, 25));

        // Create two editable cubes.
        const cube1 = createEditableCube(new THREE.Vector3(0, 0, 0), 0x00ff00);
        mainGroup.add(cube1);

        const cube2 = createEditableCube(new THREE.Vector3(3, 0, 0), 0xff0000);
        mainGroup.add(cube2);

        mainGroupRef.current = mainGroup;
        scene.add(mainGroup);

        const raycaster = new THREE.Raycaster();
        let zoom = zoomRef.current;

        const animate = () => {
            requestAnimationFrame(animate);

            // NEW: Update pointerRef based on hand tracking if available.
            const leftHand = interactionStateRef.current.Left;
            const rightHand = interactionStateRef.current.Right;
            // Prefer Right hand cursor, fallback to Left hand.
            const handCursor = rightHand?.cursor || leftHand?.cursor;
            if (handCursor && mountRef.current) {
                const rect = mountRef.current.getBoundingClientRect();
                // Convert hand tracking coordinates to normalized device coordinates.
                pointerRef.current.x =
                    (handCursor.coords.x / rect.width) * 2 - 1;
                pointerRef.current.y =
                    -((handCursor.coords.y - rect.top) / rect.height) * 2 + 1;
            }

            // ── Update marker highlighting via raycasting (mouse pointer) ──
            const hoveredMarkers = new Set<THREE.Object3D>();
            const pointers: THREE.Vector2[] = [];
            // Always include the pointerRef.
            pointers.push(pointerRef.current);
            // (Optionally add additional pointer vectors if you want.)

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

            const TOLERANCE = 0.2 * (zoom || 1);
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
                    material.color.set(0xffff00);
                } else {
                    material.color.set(0x0000ff);
                }
            });
            hoveredMarkerRef.current =
                minDistance < TOLERANCE ? closestMarker : null;

            // ── Handle hand–gesture interactions ──
            // Use dual–pinch for zoom and a single right–hand pinch for camera rotation.
            // Dual pinch: both hands are pinching and have valid cursor coordinates.

            // if (
            //     leftHand.isPinching &&
            //     rightHand.isPinching &&
            //     leftHand.cursor &&
            //     rightHand.cursor
            // ) {
            //     const dx = rightHand.cursor.coords.x - leftHand.cursor.coords.x;
            //     const dy = rightHand.cursor.coords.y - leftHand.cursor.coords.y;

            //     const currentDistance = Math.sqrt(dx * dx + dy * dy);

            //     if (previousPinchDistanceRef.current === null) {
            //         previousPinchDistanceRef.current = currentDistance;
            //     } else {
            //         const distanceDelta =
            //             currentDistance - previousPinchDistanceRef.current;
            //         const zoomSensitivity = 0.005;
            //         if (mainGroupRef.current) {
            //             let currentZoom = mainGroupRef.current.scale.x;
            //             currentZoom += distanceDelta * zoomSensitivity;
            //             currentZoom = Math.max(0.5, Math.min(5, currentZoom));
            //             mainGroupRef.current.scale.set(
            //                 currentZoom,
            //                 currentZoom,
            //                 currentZoom
            //             );
            //         }
            //         previousPinchDistanceRef.current = currentDistance;
            //     }
            //     // When dual–pinching, clear any rotation tracking.
            //     pinchPrevPosRef.current["Right"] = null;
            // }
            // // Single right–hand pinch: use its movement delta to rotate the camera.
            // else if (rightHand.isPinching && rightHand.cursor) {
            //     if (pinchPrevPosRef.current["Right"]) {
            //         const prevPos = pinchPrevPosRef.current["Right"]!;
            //         const deltaX = rightHand.cursor.coords.x - prevPos.x;
            //         const deltaY = rightHand.cursor.coords.y - prevPos.y;
            //         const rotationSensitivity = 0.005;
            //         if (cameraRef.current) {
            //             cameraRef.current.rotation.y +=
            //                 deltaX * rotationSensitivity;
            //             cameraRef.current.rotation.x +=
            //                 deltaY * rotationSensitivity;
            //         }
            //     }
            //     pinchPrevPosRef.current["Right"] = {
            //         x: rightHand.cursor.coords.x,
            //         y: rightHand.cursor.coords.y,
            //     };
            //     // Ensure dual–pinch zoom is reset.
            //     previousPinchDistanceRef.current = null;
            // } else {
            //     // Reset when no pinch gesture is active.
            //     pinchPrevPosRef.current["Right"] = null;
            //     previousPinchDistanceRef.current = null;
            // }

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
            if (mountRef.current) {
                mountRef.current.removeChild(renderer.domElement);
            }
        };
    }, []);

    // ────────────────────────────────────────────────────────────────
    // Mouse event listeners for marker dragging and scene rotation.
    // ────────────────────────────────────────────────────────────────
    useEffect(() => {
        const element = mountRef.current;
        if (!element) return;

        const onMouseDown = (e: MouseEvent) => {
            cursorDown(e.clientX, e.clientY, "mouse");
        };

        const onMouseMove = (e: MouseEvent) => {
            cursorMove(e.clientX, e.clientY, "mouse");
        };

        const onMouseUp = () => {
            cursorUp();
        };

        // Add wheel event for zooming.
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            if (mainGroupRef.current) {
                const sensitivity = 0.002;
                let currentZoom = mainGroupRef.current.scale.x;
                let newZoom = currentZoom - e.deltaY * sensitivity;
                newZoom = Math.max(0.5, Math.min(5, newZoom));
                mainGroupRef.current.scale.set(newZoom, newZoom, newZoom);
            }
        };

        element.addEventListener("mousedown", onMouseDown);
        element.addEventListener("mousemove", onMouseMove);
        element.addEventListener("mouseup", onMouseUp);
        element.addEventListener("mouseleave", onMouseUp);
        element.addEventListener("wheel", onWheel, { passive: false });

        return () => {
            element.removeEventListener("mousedown", onMouseDown);
            element.removeEventListener("mousemove", onMouseMove);
            element.removeEventListener("mouseup", onMouseUp);
            element.removeEventListener("mouseleave", onMouseUp);
            element.removeEventListener("wheel", onWheel);
        };
    }, []);

    return <div ref={mountRef} style={{ width: "100%", height: "100%" }} />;
}

export default Editable3DObject;
