import * as THREE from "three";
import { InteractionState } from "../../objects/InteractionState";
import { useEffect, useRef } from "react";
import { Coords, DEFAULT_COORDS } from "../../objects/coords";
import React from "react";
import { useEditable3D } from "../../provider/Editable3DContext";
import { ThreeMFLoader } from "three/examples/jsm/Addons.js";

interface Editable3DObjectProps {
    interactionStateRef: React.MutableRefObject<InteractionState>;
}

function Editable3DObject({
    interactionStateRef: interactionState,
}: Editable3DObjectProps) {
    const mountRef = useRef<HTMLDivElement | null>(null);

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

    // Global refs for the pointer and the cube's corner markers.
    const pointerRef = useRef<THREE.Vector2>(new THREE.Vector2(0, 0));
    // Track the currently hovered marker.
    const hoveredMarkerRef = useRef<THREE.Mesh | null>(null);

    // Refs for dragging a marker.
    const activeMarkerRef = useRef<THREE.Mesh | null>(null);
    const dragOffsetRef = useRef(new THREE.Vector3());
    const dragPlaneRef = useRef<THREE.Plane | null>(null);

    // Keep an up-to-date copy of the interaction state for hand–based gestures.
    const interactionStateRef = useRef<InteractionState | null>(
        interactionState.current
    );

    // Get setScene from our context
    const {
        registerObject,
        unregisterObject,
        setupScene,
        createCube,
        renderScene,
        mainGroupRef,
        cameraRef,
        cornerMarkersRef,
        zoomRef,
        rendererRef,
    } = useEditable3D();

    // ────────────────────────────────────────────────────────────────
    // Set up scene, camera, renderer and add our editable cubes.
    // ────────────────────────────────────────────────────────────────

    useEffect(() => {
        if (!mountRef.current) return;

        setupScene(mountRef);

        const animate = () => {
            requestAnimationFrame(animate);

            renderScene();

            const raycaster = new THREE.Raycaster();

            // Smoothly interpolate the main group's rotation toward the target.
            if (mainGroupRef.current) {
                const smoothingFactor = 0.1; // Adjust for desired smoothness
                mainGroupRef.current.rotation.x = THREE.MathUtils.lerp(
                    mainGroupRef.current.rotation.x,
                    targetRotationRef.current.x,
                    smoothingFactor
                );
                mainGroupRef.current.rotation.y = THREE.MathUtils.lerp(
                    mainGroupRef.current.rotation.y,
                    targetRotationRef.current.y,
                    smoothingFactor
                );
            }

            // ── Handle dual–pinch zoom: Only when both hands are holding (pinching) ──
            const leftHand = interactionStateRef.current?.Left;
            const rightHand = interactionStateRef.current?.Right;
            if (
                leftHand?.isHolding &&
                rightHand?.isHolding &&
                leftHand.cursor &&
                rightHand.cursor
            ) {
                const dx = rightHand.cursor.coords.x - leftHand.cursor.coords.x;
                const dy = rightHand.cursor.coords.y - leftHand.cursor.coords.y;
                const currentDistance = Math.sqrt(dx * dx + dy * dy);
                if (previousPinchDistanceRef.current === null) {
                    previousPinchDistanceRef.current = currentDistance;
                } else {
                    const distanceDelta =
                        currentDistance - previousPinchDistanceRef.current;
                    const zoomSensitivity = 0.005;
                    // Update the target zoom instead of directly setting scale.
                    let newTargetZoom =
                        targetZoomRef.current + distanceDelta * zoomSensitivity;
                    newTargetZoom = Math.max(0.5, Math.min(5, newTargetZoom));
                    targetZoomRef.current = newTargetZoom;
                    previousPinchDistanceRef.current = currentDistance;
                }
            } else {
                // Reset previous pinch distance when both hands are not holding.
                previousPinchDistanceRef.current = null;
            }

            // Smoothly interpolate the main group's zoom (scale) toward targetZoomRef.
            if (mainGroupRef.current) {
                const smoothingFactorZoom = 0.05; // Adjust for desired zoom smoothness
                const currentZoom = mainGroupRef.current.scale.x;
                const newZoom = THREE.MathUtils.lerp(
                    currentZoom,
                    targetZoomRef.current,
                    smoothingFactorZoom
                );
                mainGroupRef.current.scale.set(newZoom, newZoom, newZoom);
            }

            // Update pointer from hand tracking if available.
            const handCursor = rightHand?.cursor || leftHand?.cursor;
            if (handCursor && mountRef.current) {
                const rect = mountRef.current.getBoundingClientRect();
                pointerRef.current.x =
                    (handCursor.coords.x / rect.width) * 2 - 1;
                pointerRef.current.y =
                    -((handCursor.coords.y - rect.top) / rect.height) * 2 + 1;
            }

            // ── Update marker highlighting via raycasting ──
            const hoveredMarkers = new Set<THREE.Object3D>();
            const pointers: THREE.Vector2[] = [];
            pointers.push(pointerRef.current);
            pointers.forEach((pointer) => {
                raycaster.setFromCamera(pointer, cameraRef.current!);
                const intersects = raycaster.intersectObjects(
                    cornerMarkersRef.current,
                    false
                );
                intersects.forEach((intersect) =>
                    hoveredMarkers.add(intersect.object)
                );
            });
            const TOLERANCE = 0.05 * (zoomRef.current || 1);
            let closestMarker: THREE.Mesh | null = null;
            let minDistance = Infinity;
            pointers.forEach((pointer) => {
                cornerMarkersRef.current.forEach((marker) => {
                    const markerWorldPos = new THREE.Vector3();
                    marker.getWorldPosition(markerWorldPos);
                    markerWorldPos.project(cameraRef.current!);
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

            // Handle right-hand interactions.
            if (rightHand?.isHolding && rightHand.cursor) {
                if (
                    lastMousePosition.current["rightHand"].x ===
                        DEFAULT_COORDS.x &&
                    lastMousePosition.current["rightHand"].y ===
                        DEFAULT_COORDS.y
                ) {
                    cursorDown(
                        rightHand.cursor.coords.x,
                        rightHand.cursor.coords.y,
                        "rightHand"
                    );
                } else {
                    cursorMove(
                        rightHand.cursor.coords.x,
                        rightHand.cursor.coords.y,
                        "rightHand"
                    );
                }
                lastMousePosition.current["rightHand"] = {
                    ...rightHand.cursor.coords,
                };
            } else if (
                lastMousePosition.current["rightHand"].x !== DEFAULT_COORDS.x ||
                lastMousePosition.current["rightHand"].y !== DEFAULT_COORDS.y
            ) {
                cursorUp();
                lastMousePosition.current["rightHand"] = DEFAULT_COORDS;
            }

            // Handle left-hand interactions.
            if (leftHand?.isHolding && leftHand.cursor) {
                if (
                    lastMousePosition.current["leftHand"].x ===
                        DEFAULT_COORDS.x &&
                    lastMousePosition.current["leftHand"].y === DEFAULT_COORDS.y
                ) {
                    cursorDown(
                        leftHand.cursor.coords.x,
                        leftHand.cursor.coords.y,
                        "leftHand"
                    );
                } else {
                    cursorMove(
                        leftHand.cursor.coords.x,
                        leftHand.cursor.coords.y,
                        "leftHand"
                    );
                }
                lastMousePosition.current["leftHand"] = {
                    ...leftHand.cursor.coords,
                };
            } else if (
                lastMousePosition.current["leftHand"].x !== DEFAULT_COORDS.x ||
                lastMousePosition.current["leftHand"].y !== DEFAULT_COORDS.y
            ) {
                cursorUp();
                lastMousePosition.current["leftHand"] = DEFAULT_COORDS;
            }
        };
        animate();

        const resizeObserver = new ResizeObserver((entries) => {
            const { width, height } = entries[0].contentRect;
            rendererRef.current!.setSize(width, height);
            cameraRef.current!.aspect = width / height;
            cameraRef.current!.updateProjectionMatrix();
        });
        resizeObserver.observe(mountRef.current);

        return () => {
            // resizeObserver.disconnect();
            rendererRef.current!.dispose();
            if (mountRef.current) {
                mountRef.current.removeChild(rendererRef.current!.domElement);
            }
        };
    }, []);

    useEffect(() => {
        const interval = setInterval(() => {
            interactionStateRef.current = interactionState.current;
            // console.log("Interaction state:", interactionStateRef.current);
        }, 33);

        return () => {
            clearInterval(interval);
        };
    }, []);

    // Refs for computing gesture deltas.
    const pinchPrevPosRef = useRef<
        Record<"Left" | "Right", { x: number; y: number } | null>
    >({
        Left: null,
        Right: null,
    });
    // This ref holds the previous distance between the two hand cursors.
    const previousPinchDistanceRef = useRef<number | null>(null);

    // NEW: A ref to store the target rotation for smoothing.
    const targetRotationRef = useRef({ x: 0, y: 0 });

    // NEW: A ref to store the target zoom (scale) for smoothing.
    const targetZoomRef = useRef(1);

    // ────────────────────────────────────────────────────────────────
    // Interaction handlers for pointer/hand events.
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
                const parent = activeMarkerRef.current.parent;
                const dragSmoothing = 0.1; // Adjust for desired smoothness
                if (parent) {
                    const localPos = parent.worldToLocal(
                        intersectionPoint.clone()
                    );
                    activeMarkerRef.current.position.lerp(
                        localPos,
                        dragSmoothing
                    );
                    // Update the cube's geometry.
                    const cubeGroup = parent.parent;
                    if (cubeGroup && cubeGroup.userData.updateGeometry) {
                        cubeGroup.userData.updateGeometry();
                    }
                } else {
                    activeMarkerRef.current.position.lerp(
                        intersectionPoint,
                        dragSmoothing
                    );
                }
            }
            return;
        }

        // When dragging the scene (i.e. no marker is active), update the target rotation.
        if (isDraggingRef.current) {
            const dx = x - lastMousePosition.current[source].x;
            const dy = y - lastMousePosition.current[source].y;
            const sensitivity = 0.01;
            targetRotationRef.current.y += dx * sensitivity;
            targetRotationRef.current.x += dy * sensitivity;
        }
        lastMousePosition.current[source] = { x, y };
    };

    const cursorUp = () => {
        isDraggingRef.current = false;
        activeMarkerRef.current = null;
        dragPlaneRef.current = null;
    };

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
                // Update both the main group's scale and the target zoom.
                mainGroupRef.current.scale.set(newZoom, newZoom, newZoom);
                targetZoomRef.current = newZoom;
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

export default React.memo(Editable3DObject);
