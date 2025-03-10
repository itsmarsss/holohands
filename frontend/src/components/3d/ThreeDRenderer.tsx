import * as THREE from "three";
import { InteractionState } from "../../objects/InteractionState";
import { useEffect, useRef } from "react";
import { Coords, DEFAULT_COORDS } from "../../objects/coords";
import React from "react";
import { useThreeD } from "../../provider/ThreeDContext";

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
    // NEW: Ref to store the currently hovered object (e.g. cube face or any interactive object)
    const hoveredObjectRef = useRef<THREE.Object3D | null>(null);

    // Refs for dragging a marker.
    const activeMarkerRef = useRef<THREE.Mesh | null>(null);
    const dragOffsetRef = useRef(new THREE.Vector3());
    const dragPlaneRef = useRef<THREE.Plane | null>(null);

    // NEW: Refs for right-click drag panning using mouse.
    const isRightDraggingRef = useRef(false);
    const lastRightPositionRef = useRef<{ x: number; y: number } | null>(null);

    // NEW: Ref to store the target position for the currently dragged marker.
    const targetMarkerPositionRef = useRef<THREE.Vector3>(new THREE.Vector3());

    // New ref for dragging the entire cube.
    const activeObjectRef =
        useRef<THREE.Object3D<THREE.Object3DEventMap> | null>(null);

    // Keep an up-to-date copy of the interaction state for hand–based gestures.
    const interactionStateRef = useRef<InteractionState | null>(
        interactionState.current
    );

    // NEW: Ref to store the initial hand depth at the start of a drag.
    const initialHandDepthRef = useRef<
        Record<"leftHand" | "rightHand", number | null>
    >({
        leftHand: null,
        rightHand: null,
    });

    // Get setScene from our context.
    const {
        setupScene,
        createCube,
        renderScene,
        mainGroupRef,
        cameraRef,
        cornerMarkersRef,
        zoomRef,
        rendererRef,
        resetCameraRef,
        objectsRef,
    } = useThreeD();

    // ────────────────────────────────────────────────────────────────
    // Set up scene, camera, renderer and add our editable cubes.
    // ────────────────────────────────────────────────────────────────

    // Create a target ref – we will update it after the camera is created.
    const targetCameraPositionRef = useRef<THREE.Vector3>(new THREE.Vector3());

    // (Optional) For dragging objects, you can add a target ref.
    const targetCubePositionRef = useRef<THREE.Vector3>(new THREE.Vector3());

    useEffect(() => {
        if (!mountRef.current) return;

        setupScene(mountRef);

        // IMPORTANT: After set up, update the target camera ref to match the actual camera position.
        if (cameraRef.current) {
            targetCameraPositionRef.current.copy(cameraRef.current.position);
        }

        const animate = () => {
            requestAnimationFrame(animate);

            renderScene();

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

            // Smoothly update camera position using a delta-based approach.
            if (cameraRef.current) {
                if (resetCameraRef.current) {
                    targetCameraPositionRef.current.copy(
                        cameraRef.current.position
                    );
                    targetZoomRef.current = 1;
                    targetRotationRef.current = { x: 0, y: 0 };
                    resetCameraRef.current = false;
                    return;
                }
                const lerpFactor = 0.1; // Adjust this smoothing factor as needed.
                const currPos = cameraRef.current.position;
                const delta = targetCameraPositionRef.current
                    .clone()
                    .sub(currPos);
                const distance = delta.length();

                const threshold = 0.01; // Increase threshold if needed.
                if (distance < threshold) {
                    cameraRef.current.position.copy(
                        targetCameraPositionRef.current
                    );
                } else {
                    // Move the camera fractionally toward the target.
                    cameraRef.current.position.add(
                        delta.multiplyScalar(lerpFactor)
                    );
                }

                cameraRef.current.updateProjectionMatrix();
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
                    newTargetZoom = Math.max(0.05, Math.min(10, newTargetZoom));
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

            // Smoothly update the cube's position when dragging.
            if (activeObjectRef.current) {
                activeObjectRef.current.position.lerp(
                    targetCubePositionRef.current,
                    0.1
                );
            }

            // NEW: Smoothly update the marker's (vertex) position when dragging.
            if (activeMarkerRef.current) {
                activeMarkerRef.current.position.lerp(
                    targetMarkerPositionRef.current,
                    0.1
                );
                // Optionally update cube geometry if this marker controls it.
                const cubeGroup = activeMarkerRef.current.parent?.parent;
                if (cubeGroup && cubeGroup.userData.updateGeometry) {
                    cubeGroup.userData.updateGeometry();
                }

                // if (
                //     activeMarkerRef.current &&
                //     activeMarkerRef.current.userData.isControlMarker
                // ) {
                //     // Assuming the marker is a child of the sphere group:
                //     const parentGroup = activeMarkerRef.current.parent;
                //     if (parentGroup && parentGroup.userData.updateGeometry) {
                //         console.log(
                //             "Updating sphere geometry for",
                //             parentGroup.name
                //         );
                //         parentGroup.userData.updateGeometry();
                //     }
                // }
            }

            // Update pointer from hand tracking if available.
            const handCursor = rightHand?.cursor || leftHand?.cursor;
            if (handCursor && mountRef.current) {
                const rect = mountRef.current.getBoundingClientRect();
                pointerRef.current.x =
                    (handCursor.coords.x / rect.width) * 2 - 1;
                pointerRef.current.y =
                    -(handCursor.coords.y / rect.height) * 2 + 1;
            }

            // ── Update marker highlighting via raycasting ──
            const TOLERANCE = 0.025 * (zoomRef.current || 1);
            let closestMarker: THREE.Mesh | null = null;
            let minDistanceMarker = Infinity;

            cornerMarkersRef.current.forEach((marker) => {
                const markerWorldPos = new THREE.Vector3();
                marker.getWorldPosition(markerWorldPos);
                markerWorldPos.project(cameraRef.current!);
                const markerPos2D = new THREE.Vector2(
                    markerWorldPos.x,
                    markerWorldPos.y
                );
                const distance = pointerRef.current.distanceTo(markerPos2D);
                if (distance < minDistanceMarker) {
                    minDistanceMarker = distance;
                    closestMarker = marker;
                }
            });

            cornerMarkersRef.current.forEach((marker) => {
                const material = marker.material as THREE.MeshBasicMaterial;
                if (marker === closestMarker && minDistanceMarker < TOLERANCE) {
                    material.color.set(0xffff00);
                } else {
                    material.color.set(0x0000ff);
                }
            });
            hoveredMarkerRef.current =
                minDistanceMarker < TOLERANCE ? closestMarker : null;

            const objectRaycaster = new THREE.Raycaster();
            objectRaycaster.setFromCamera(
                pointerRef.current,
                cameraRef.current!
            );
            let intersectedObject: THREE.Object3D | null = null;
            let closestIntersectionDistance = Infinity;

            Object.values(objectsRef.current).forEach((object) => {
                object.children.forEach((child) => {
                    if (
                        child.name === "faceMesh" &&
                        "material" in child &&
                        child instanceof THREE.Mesh &&
                        child.material instanceof THREE.MeshBasicMaterial
                    ) {
                        const intersections =
                            objectRaycaster.intersectObject(child);
                        if (
                            intersections.length > 0 &&
                            intersections[0].distance <
                                closestIntersectionDistance
                        ) {
                            closestIntersectionDistance =
                                intersections[0].distance;
                            intersectedObject = object;
                        }
                    }
                });
            });

            Object.values(objectsRef.current).forEach((object) => {
                object.children.forEach((child) => {
                    if (
                        child.name === "faceMesh" &&
                        "material" in child &&
                        child instanceof THREE.Mesh &&
                        child.material instanceof THREE.MeshBasicMaterial
                    ) {
                        const material =
                            child.material as THREE.MeshBasicMaterial;
                        if (object === intersectedObject) {
                            material.color.set(0xffff00);
                        } else {
                            material.color.set(0x00ff00);
                        }
                    }
                });
            });

            hoveredObjectRef.current = intersectedObject;

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
            resizeObserver.disconnect();
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
        // If the input is from a hand and both hands are holding, disable drag actions.
        if (
            source !== "mouse" &&
            interactionStateRef.current &&
            interactionStateRef.current.Left?.isHolding &&
            interactionStateRef.current.Right?.isHolding
        ) {
            return;
        }

        const rect = mountRef.current.getBoundingClientRect();
        const normalizedX =
            source === "mouse"
                ? ((x - rect.left) / rect.width) * 2 - 1
                : (x / rect.width) * 2 - 1;
        const normalizedY =
            source === "mouse"
                ? -((y - rect.top) / rect.height) * 2 + 1
                : -(y / rect.height) * 2 + 1;
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2(normalizedX, normalizedY);
        raycaster.setFromCamera(mouse, cameraRef.current!);
        // If a marker is hovered, begin dragging it.
        if (hoveredMarkerRef.current) {
            activeMarkerRef.current = hoveredMarkerRef.current;
            const markerWorldPos = new THREE.Vector3();
            activeMarkerRef.current.getWorldPosition(markerWorldPos);

            if (activeMarkerRef.current.parent) {
                const localPos = markerWorldPos.clone();
                activeMarkerRef.current.parent.worldToLocal(localPos);
                targetMarkerPositionRef.current.copy(localPos);
            } else {
                targetMarkerPositionRef.current.copy(markerWorldPos);
            }

            // Create a plane perpendicular to the camera's direction through the marker.
            const plane = new THREE.Plane();
            const camDir = new THREE.Vector3();
            cameraRef.current!.getWorldDirection(camDir);
            plane.setFromNormalAndCoplanarPoint(camDir, markerWorldPos);
            dragPlaneRef.current = plane;

            const intersectionPoint = new THREE.Vector3();
            if (raycaster.ray.intersectPlane(plane, intersectionPoint)) {
                dragOffsetRef.current
                    .copy(markerWorldPos)
                    .sub(intersectionPoint);
            }
            // NEW: For hand input, record the starting depth.
            if (source !== "mouse") {
                const hand =
                    interactionStateRef.current?.[
                        source === "rightHand" ? "Right" : "Left"
                    ];
                if (hand && typeof hand.depth === "number") {
                    initialHandDepthRef.current[source] = hand.depth;
                }
            }
            return; // Exit early – we're now dragging a marker.
        }

        // If the intersected object is the cube's face (named "faceMesh") or its child.
        if (hoveredObjectRef.current) {
            activeObjectRef.current = hoveredObjectRef.current;
            const objectWorldPos = new THREE.Vector3();
            hoveredObjectRef.current.getWorldPosition(objectWorldPos);

            if (hoveredObjectRef.current.parent) {
                const localPos = objectWorldPos.clone();
                hoveredObjectRef.current.parent.worldToLocal(localPos);
                targetCubePositionRef.current.copy(localPos);
            } else {
                targetCubePositionRef.current.copy(objectWorldPos);
            }

            const plane = new THREE.Plane();
            const camDir = new THREE.Vector3();
            cameraRef.current!.getWorldDirection(camDir);
            plane.setFromNormalAndCoplanarPoint(camDir, objectWorldPos);
            dragPlaneRef.current = plane;

            const intersectionPoint = new THREE.Vector3();
            if (raycaster.ray.intersectPlane(plane, intersectionPoint)) {
                dragOffsetRef.current
                    .copy(objectWorldPos)
                    .sub(intersectionPoint);
            }

            // NEW: Record the initial hand depth if using hand input.
            if (source !== "mouse") {
                const hand =
                    interactionStateRef.current?.[
                        source === "rightHand" ? "Right" : "Left"
                    ];
                if (hand && typeof hand.depth === "number") {
                    initialHandDepthRef.current[source] = hand.depth;
                }
            }

            return;
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

        // If both hand inputs are holding, pan the camera accordingly.
        if (
            source !== "mouse" &&
            interactionStateRef.current &&
            interactionStateRef.current.Left?.isHolding &&
            interactionStateRef.current.Right?.isHolding
        ) {
            // Initialize the pointer position if needed.
            if (
                lastMousePosition.current[source].x === 0 &&
                lastMousePosition.current[source].y === 0
            ) {
                lastMousePosition.current[source] = { x, y };
                console.log("Initializing lastMousePosition for", source, {
                    x,
                    y,
                });
                return;
            }

            const dx = x - lastMousePosition.current[source].x;
            const dy = y - lastMousePosition.current[source].y;
            const panSensitivity = 0.1; // Adjust sensitivity as needed

            // NEW: Update the target camera position using lerping.
            if (cameraRef.current) {
                const panDelta = new THREE.Vector3(
                    -dx * panSensitivity,
                    dy * panSensitivity,
                    0
                );
                const desiredTarget = targetCameraPositionRef.current
                    .clone()
                    .add(panDelta);
                const panLerpFactor = 0.1; // Adjust lerp factor as needed.
                targetCameraPositionRef.current.lerp(
                    desiredTarget,
                    panLerpFactor
                );
            }

            // Update pointer position for next frame.
            lastMousePosition.current[source] = { x, y };
            return;
        }

        const rect = mountRef.current.getBoundingClientRect();
        if (source === "mouse") {
            pointerRef.current.x = ((x - rect.left) / rect.width) * 2 - 1;
            pointerRef.current.y = -((y - rect.top) / rect.height) * 2 + 1;
        } else {
            pointerRef.current.x = x;
            pointerRef.current.y = y;
        }

        // ── DRAGGING A CUBE ──
        if (activeObjectRef.current && dragPlaneRef.current) {
            const raycaster = new THREE.Raycaster();
            const normalizedX =
                source === "mouse"
                    ? ((x - rect.left) / rect.width) * 2 - 1
                    : (x / rect.width) * 2 - 1;
            const normalizedY =
                source === "mouse"
                    ? -((y - rect.top) / rect.height) * 2 + 1
                    : -(y / rect.height) * 2 + 1;
            const mouse = new THREE.Vector2(normalizedX, normalizedY);
            raycaster.setFromCamera(mouse, cameraRef.current!);
            const intersectionPoint = new THREE.Vector3();

            if (source !== "mouse") {
                // For hand input, use the change in hand depth.
                const hand =
                    interactionStateRef.current?.[
                        source === "rightHand" ? "Right" : "Left"
                    ];
                if (hand && typeof hand.depth === "number") {
                    const initialDepth =
                        initialHandDepthRef.current[source] ?? hand.depth;
                    const deltaDepth = initialDepth - hand.depth;
                    const depthSensitivity = 50; // Adjust sensitivity constant as needed

                    // Use the usual drag-plane intersection as the base.
                    if (
                        raycaster.ray.intersectPlane(
                            dragPlaneRef.current,
                            intersectionPoint
                        )
                    ) {
                        intersectionPoint.add(dragOffsetRef.current);
                    }
                    // Compute an additional offset along the ray direction.
                    const additionalOffset = raycaster.ray.direction
                        .clone()
                        .multiplyScalar(deltaDepth * depthSensitivity);
                    const newPosition = intersectionPoint.add(additionalOffset);
                    const parent = activeObjectRef.current.parent;
                    if (parent) {
                        parent.worldToLocal(newPosition);
                    }
                    targetCubePositionRef.current.copy(newPosition);
                } else {
                    // Fallback to drag plane intersection.
                    if (
                        raycaster.ray.intersectPlane(
                            dragPlaneRef.current,
                            intersectionPoint
                        )
                    ) {
                        intersectionPoint.add(dragOffsetRef.current);
                        const parent = activeObjectRef.current.parent;
                        if (parent) {
                            parent.worldToLocal(intersectionPoint);
                        }
                        targetCubePositionRef.current.copy(intersectionPoint);
                    }
                }
            } else {
                // For mouse input, use drag plane intersection.
                if (
                    raycaster.ray.intersectPlane(
                        dragPlaneRef.current,
                        intersectionPoint
                    )
                ) {
                    intersectionPoint.add(dragOffsetRef.current);
                    const parent = activeObjectRef.current.parent;
                    if (parent) {
                        parent.worldToLocal(intersectionPoint);
                    }
                    targetCubePositionRef.current.copy(intersectionPoint);
                }
            }
            return;
        }

        // ── DRAGGING A MARKER (VERTEX) ──
        if (activeMarkerRef.current && dragPlaneRef.current) {
            const raycaster = new THREE.Raycaster();
            const normalizedX =
                source === "mouse"
                    ? ((x - rect.left) / rect.width) * 2 - 1
                    : (x / rect.width) * 2 - 1;
            const normalizedY =
                source === "mouse"
                    ? -((y - rect.top) / rect.height) * 2 + 1
                    : -(y / rect.height) * 2 + 1;
            const mouse = new THREE.Vector2(normalizedX, normalizedY);
            raycaster.setFromCamera(mouse, cameraRef.current!);
            const intersectionPoint = new THREE.Vector3();

            if (source !== "mouse") {
                // For hand input, use the change in hand depth.
                const hand =
                    interactionStateRef.current?.[
                        source === "rightHand" ? "Right" : "Left"
                    ];
                if (hand && typeof hand.depth === "number") {
                    const initialDepth =
                        initialHandDepthRef.current[source] ?? hand.depth;
                    const deltaDepth = initialDepth - hand.depth;
                    const depthSensitivity = 50; // Adjust as needed

                    if (
                        raycaster.ray.intersectPlane(
                            dragPlaneRef.current,
                            intersectionPoint
                        )
                    ) {
                        intersectionPoint.add(dragOffsetRef.current);
                    }
                    const additionalOffset = raycaster.ray.direction
                        .clone()
                        .multiplyScalar(deltaDepth * depthSensitivity);
                    const newPosition = intersectionPoint.add(additionalOffset);
                    if (activeMarkerRef.current.parent) {
                        activeMarkerRef.current.parent.worldToLocal(
                            newPosition
                        );
                    }
                    targetMarkerPositionRef.current.copy(newPosition);
                } else {
                    // Fallback to drag plane intersection.
                    if (
                        raycaster.ray.intersectPlane(
                            dragPlaneRef.current,
                            intersectionPoint
                        )
                    ) {
                        intersectionPoint.add(dragOffsetRef.current);
                        if (activeMarkerRef.current.parent) {
                            activeMarkerRef.current.parent.worldToLocal(
                                intersectionPoint
                            );
                        }
                        targetMarkerPositionRef.current.copy(intersectionPoint);
                    }
                }
            } else {
                // For mouse input, use drag plane intersection.
                if (
                    raycaster.ray.intersectPlane(
                        dragPlaneRef.current,
                        intersectionPoint
                    )
                ) {
                    intersectionPoint.add(dragOffsetRef.current);
                    if (activeMarkerRef.current.parent) {
                        activeMarkerRef.current.parent.worldToLocal(
                            intersectionPoint
                        );
                    }
                    targetMarkerPositionRef.current.copy(intersectionPoint);
                }
            }
            return;
        }

        // When dragging the scene, update target rotation.
        if (isDraggingRef.current) {
            const dx = x - lastMousePosition.current[source].x;
            const dy = y - lastMousePosition.current[source].y;
            const sensitivity = 0.01;
            targetRotationRef.current.x += dy * sensitivity;
            targetRotationRef.current.y += dx * sensitivity;
        }

        lastMousePosition.current[source] = { x, y };
    };

    const cursorUp = () => {
        isDraggingRef.current = false;
        activeMarkerRef.current = null;
        activeObjectRef.current = null;
        dragPlaneRef.current = null;
        // Clear stored initial depths.
        initialHandDepthRef.current.leftHand = null;
        initialHandDepthRef.current.rightHand = null;
    };

    // ────────────────────────────────────────────────────────────────
    // Mouse event listeners for marker dragging and scene rotation.
    // ────────────────────────────────────────────────────────────────
    useEffect(() => {
        const element = mountRef.current;
        if (!element) return;

        // NEW: Handler to prevent the context menu.
        const onContextMenu = (e: MouseEvent) => {
            e.preventDefault();
        };

        const onMouseDown = (e: MouseEvent) => {
            if (e.button === 2) {
                // Right-click
                e.preventDefault();
                isRightDraggingRef.current = true;
                lastRightPositionRef.current = { x: e.clientX, y: e.clientY };
            } else if (e.button === 0) {
                // Left-click
                cursorDown(e.clientX, e.clientY, "mouse");
            }
        };

        const onMouseMove = (e: MouseEvent) => {
            if (isRightDraggingRef.current) {
                if (lastRightPositionRef.current && cameraRef.current) {
                    const dx = e.clientX - lastRightPositionRef.current.x;
                    const dy = e.clientY - lastRightPositionRef.current.y;
                    const panSensitivity = 0.01; // Adjust pan sensitivity as needed
                    const panDelta = new THREE.Vector3(
                        -dx * panSensitivity,
                        dy * panSensitivity,
                        0
                    );
                    targetCameraPositionRef.current.add(panDelta);
                    lastRightPositionRef.current = {
                        x: e.clientX,
                        y: e.clientY,
                    };
                }
            } else {
                cursorMove(e.clientX, e.clientY, "mouse");
            }
        };

        const onMouseUp = (e: MouseEvent) => {
            if (e.button === 2) {
                isRightDraggingRef.current = false;
                lastRightPositionRef.current = null;
                e.preventDefault();
            } else {
                cursorUp();
            }
        };

        // Add wheel event for zooming.
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            if (mainGroupRef.current) {
                const sensitivity = 0.002;
                let currentZoom = mainGroupRef.current.scale.x;
                let newZoom = currentZoom - e.deltaY * sensitivity;
                newZoom = Math.max(0.05, Math.min(10, newZoom));
                // Update both the main group's scale and the target zoom.
                mainGroupRef.current.scale.set(newZoom, newZoom, newZoom);
                targetZoomRef.current = newZoom;
            }
        };

        element.addEventListener("contextmenu", onContextMenu);
        element.addEventListener("mousedown", onMouseDown);
        element.addEventListener("mousemove", onMouseMove);
        element.addEventListener("mouseup", onMouseUp);
        element.addEventListener("mouseleave", onMouseUp);
        element.addEventListener("wheel", onWheel, { passive: false });

        return () => {
            element.removeEventListener("contextmenu", onContextMenu);
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
