import { useEffect, useReducer, useRef } from "react";
import "./Cursor.css";
import { InteractionStateHand } from "../../objects/InteractionState";
import { gsap } from "gsap";
import React from "react";
import { useThreeD } from "../../provider/ThreeDContext";
import * as THREE from "three";

interface CursorProps {
    name: string;
    handRef: React.MutableRefObject<InteractionStateHand | null>;
    overlayCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
}

function Cursor({ name, handRef, overlayCanvasRef }: CursorProps) {
    const cursorRef = useRef<HTMLDivElement>(null);
    const statusRef = useRef<HTMLParagraphElement>(null);

    // Ref for the circular progress SVG circle.
    const progressRef = useRef<SVGCircleElement>(null);

    // Increase the progress circle radius so that it goes around the cursor.
    const progressRadius = 20; // Adjust as needed

    // NEW: A ref to store the target cursor position for smoothing.
    const targetCursorRef = useRef({
        x: handRef.current?.cursor?.coords.x,
        y: handRef.current?.cursor?.coords.y,
    });

    // NEW: Refs for menu buttons
    const resetBtnRef = useRef<HTMLButtonElement>(null);
    const insertBtnRef = useRef<HTMLButtonElement>(null);
    const insertSphereBtnRef = useRef<HTMLButtonElement>(null);

    // NEW: Refs for hover timers for each menu option
    const resetHoverTimerRef = useRef<number | null>(null);
    const resetHoverStartRef = useRef<number | null>(null);
    const insertHoverTimerRef = useRef<number | null>(null);
    const insertHoverStartRef = useRef<number | null>(null);
    const insertSphereHoverStartRef = useRef<number | null>(null);
    const insertSphereHoverTimerRef = useRef<number | null>(null);

    // NEW: State for showing a menu when pinching starts
    const menuRef = useRef<{ x: number; y: number } | null>(null);
    // NEW: Ref for menu cooldown to prevent immediate reappearance
    const menuCooldownRef = useRef<boolean>(false);
    // NEW: Ref to track when the menu was activated for timer animation on the circle
    const menuStartTimeRef = useRef<number | null>(null);

    const { resetCamera, createCube, createSphere } = useThreeD();

    const [_, forceUpdate] = useReducer((x) => x + 1, 0);

    // NEW: Handlers for menu options
    const handleResetCamera = () => {
        resetCamera();

        menuRef.current = null;
        // Activate cooldown to prevent immediate reappearance
        menuCooldownRef.current = true;
        forceUpdate();
        setTimeout(() => {
            menuCooldownRef.current = false;
            forceUpdate();
        }, 1000);
    };

    const handleInsertCube = () => {
        createCube(
            `cube-${Math.random().toString(36).substring(2, 9)}`,
            new THREE.Vector3(0, 0, 0),
            Math.random() * 0xffffff
        );

        menuRef.current = null;
        // Activate cooldown to prevent immediate reappearance
        menuCooldownRef.current = true;
        forceUpdate();
        setTimeout(() => {
            menuCooldownRef.current = false;
            forceUpdate();
        }, 1000);
    };

    // NEW: Handler to insert a sphere.
    const handleInsertSphere = () => {
        createSphere(
            `sphere-${Math.random().toString(36).substring(2, 9)}`,
            new THREE.Vector3(0, 0, 0),
            0.75, // You can adjust the sphere radius as needed.
            Math.random() * 0xffffff
        );

        menuRef.current = null;
        // Activate cooldown to prevent immediate reappearance
        menuCooldownRef.current = true;
        forceUpdate();
        setTimeout(() => {
            menuCooldownRef.current = false;
            forceUpdate();
        }, 1000);
    };

    // Instead of local state updates, use GSAP ticker to always update the target coordinates from handRef.
    useEffect(() => {
        const updateTarget = () => {
            if (!handRef.current) return;

            targetCursorRef.current.x = handRef.current.cursor?.coords.x || 0;
            targetCursorRef.current.y = handRef.current.cursor?.coords.y || 0;

            if (statusRef.current) {
                statusRef.current.textContent = handRef.current.isPinching
                    ? "Pinching"
                    : handRef.current.isHolding
                    ? "Holding"
                    : "Idle";
            }
        };
        gsap.ticker.add(updateTarget);
        return () => {
            gsap.ticker.remove(updateTarget);
        };
    }, [handRef]);

    useEffect(() => {
        const updateCursor = () => {
            if (!cursorRef.current) return;

            // Use the target values from the ref.
            const targetX = targetCursorRef.current.x || 0;
            const targetY = targetCursorRef.current.y || 0;

            if (
                handRef.current?.isPinching &&
                !menuRef.current &&
                !menuCooldownRef.current
            ) {
                menuRef.current = {
                    x: targetX,
                    y: targetY,
                };
                // Record the time when the menu is activated
                menuStartTimeRef.current = Date.now();
                forceUpdate();
            } else if (!handRef.current?.isPinching && menuRef.current) {
                menuRef.current = null;
                menuStartTimeRef.current = null;
                // Activate cooldown to prevent immediate reappearance
                menuCooldownRef.current = true;
                forceUpdate();
                setTimeout(() => {
                    menuCooldownRef.current = false;
                    forceUpdate();
                }, 1000);
            }

            // Get the overlay canvas offset.
            const { left: xOffset, top: yOffset } =
                overlayCanvasRef.current?.getBoundingClientRect() || {
                    left: 0,
                    top: 0,
                };

            // Use GSAP to animate the cursor's position.
            cursorRef.current.style.left = `${targetX}px`;
            cursorRef.current.style.top = `${targetY + yOffset}px`;

            // Simulate button hover using the absolute position of the cursor.
            const absoluteCursorX = targetX + xOffset;
            const absoluteCursorY = targetY + yOffset;

            // Calculate the progress value from menu button hover only.
            let resetProgress = 0;
            let insertProgress = 0;
            let insertSphereProgress = 0;

            if (resetHoverStartRef.current) {
                resetProgress = Math.min(
                    (Date.now() - resetHoverStartRef.current) / 1000,
                    1
                );
            }
            if (insertHoverStartRef.current) {
                insertProgress = Math.min(
                    (Date.now() - insertHoverStartRef.current) / 1000,
                    1
                );
            }
            if (insertSphereHoverStartRef.current) {
                insertSphereProgress = Math.min(
                    (Date.now() - insertSphereHoverStartRef.current) / 1000,
                    1
                );
            }

            const maxProgress = Math.max(resetProgress, insertProgress);

            if (progressRef.current) {
                // For a circle of radius `progressRadius`, compute the circumference.
                const circumference = 2 * Math.PI * progressRadius;
                const offset = circumference * (1 - maxProgress);
                progressRef.current.style.strokeDashoffset = offset.toString();
                // Show the progress indicator if there is progress (from buttons or the menu).
                progressRef.current.style.opacity = maxProgress > 0 ? "1" : "0";
            }

            // NEW: Simulate menu button hover when the menu is displayed.
            // absoluteCursor coordinates already computed above.
            if (menuRef.current) {
                // Process Reset Camera button
                if (resetBtnRef.current) {
                    const btnRect = resetBtnRef.current.getBoundingClientRect();
                    if (
                        absoluteCursorX >= btnRect.left &&
                        absoluteCursorX <= btnRect.right &&
                        absoluteCursorY >= btnRect.top &&
                        absoluteCursorY <= btnRect.bottom
                    ) {
                        if (!resetHoverStartRef.current) {
                            resetHoverStartRef.current = Date.now();
                            resetHoverTimerRef.current = window.setTimeout(
                                () => {
                                    handleResetCamera();
                                    resetHoverStartRef.current = null;
                                    resetHoverTimerRef.current = null;
                                    if (resetBtnRef.current) {
                                        resetBtnRef.current.style.background =
                                            "";
                                    }
                                },
                                1000
                            );
                        }
                        const progress = Math.min(
                            (Date.now() - resetHoverStartRef.current) / 1000,
                            1
                        );
                        resetBtnRef.current.style.background = `linear-gradient(to right, rgba(255,255,255,0.3) ${
                            progress * 100
                        }%, transparent ${progress * 100}%)`;
                    } else {
                        if (resetHoverTimerRef.current) {
                            clearTimeout(resetHoverTimerRef.current);
                            resetHoverTimerRef.current = null;
                            resetHoverStartRef.current = null;
                        }
                        resetBtnRef.current.style.background = "";
                    }
                }

                // Process Insert Cube button
                if (insertBtnRef.current) {
                    const btnRect =
                        insertBtnRef.current.getBoundingClientRect();
                    if (
                        absoluteCursorX >= btnRect.left &&
                        absoluteCursorX <= btnRect.right &&
                        absoluteCursorY >= btnRect.top &&
                        absoluteCursorY <= btnRect.bottom
                    ) {
                        if (!insertHoverStartRef.current) {
                            insertHoverStartRef.current = Date.now();
                            insertHoverTimerRef.current = window.setTimeout(
                                () => {
                                    handleInsertCube();
                                    insertHoverStartRef.current = null;
                                    insertHoverTimerRef.current = null;
                                    if (insertBtnRef.current) {
                                        insertBtnRef.current.style.background =
                                            "";
                                    }
                                },
                                1000
                            );
                        }
                        const progress = Math.min(
                            (Date.now() - insertHoverStartRef.current) / 1000,
                            1
                        );
                        insertBtnRef.current.style.background = `linear-gradient(to right, rgba(255,255,255,0.3) ${
                            progress * 100
                        }%, transparent ${progress * 100}%)`;
                    } else {
                        if (insertHoverTimerRef.current) {
                            clearTimeout(insertHoverTimerRef.current);
                            insertHoverTimerRef.current = null;
                            insertHoverStartRef.current = null;
                        }
                        insertBtnRef.current.style.background = "";
                    }
                }

                // Process Insert Sphere button
                if (insertSphereBtnRef.current) {
                    const btnRect =
                        insertSphereBtnRef.current.getBoundingClientRect();
                    if (
                        absoluteCursorX >= btnRect.left &&
                        absoluteCursorX <= btnRect.right &&
                        absoluteCursorY >= btnRect.top &&
                        absoluteCursorY <= btnRect.bottom
                    ) {
                        if (!insertSphereHoverStartRef.current) {
                            insertSphereHoverStartRef.current = Date.now();
                            insertSphereHoverTimerRef.current =
                                window.setTimeout(() => {
                                    handleInsertSphere();
                                    insertSphereHoverStartRef.current = null;
                                    insertSphereHoverTimerRef.current = null;
                                    if (insertSphereBtnRef.current) {
                                        insertSphereBtnRef.current.style.background =
                                            "";
                                    }
                                }, 1000);
                        }
                        const progress = Math.min(
                            (Date.now() - insertSphereHoverStartRef.current) /
                                1000,
                            1
                        );
                        insertSphereBtnRef.current.style.background = `linear-gradient(to right, rgba(255,255,255,0.3) ${
                            progress * 100
                        }%, transparent ${progress * 100}%)`;
                    } else {
                        if (insertSphereHoverTimerRef.current) {
                            clearTimeout(insertSphereHoverTimerRef.current);
                            insertSphereHoverTimerRef.current = null;
                            insertSphereHoverStartRef.current = null;
                        }
                        insertSphereBtnRef.current.style.background = "";
                    }
                }
            } else {
                if (insertHoverTimerRef.current) {
                    clearTimeout(insertHoverTimerRef.current);
                    insertHoverTimerRef.current = null;
                    insertHoverStartRef.current = null;
                }
                if (resetHoverTimerRef.current) {
                    clearTimeout(resetHoverTimerRef.current);
                    resetHoverTimerRef.current = null;
                    resetHoverStartRef.current = null;
                }
            }
        };

        gsap.ticker.add(updateCursor);
        return () => {
            gsap.ticker.remove(updateCursor);
        };
    }, [overlayCanvasRef]);

    return (
        <>
            <div className="cursor" id={name} ref={cursorRef}>
                {/* SVG for the progress indicator (positioned around the cursor) */}
                <svg className="cursor-progress" viewBox="0 0 40 40">
                    <circle
                        className="cursor-progress-background"
                        cx="20"
                        cy="20"
                        r={15}
                        fill="none"
                        stroke="#ccc"
                        strokeWidth="3"
                    />
                    <circle
                        ref={progressRef}
                        className="cursor-progress-bar"
                        cx="20"
                        cy="20"
                        r={15}
                        fill="none"
                        stroke="#646cff"
                        strokeWidth="3"
                        strokeDasharray={2 * Math.PI * progressRadius}
                        strokeDashoffset={2 * Math.PI * progressRadius}
                    />
                </svg>
                <div className="cursor-status">
                    <p ref={statusRef}>Status</p>
                </div>
            </div>
            {menuRef.current && (
                <div
                    className="cursor-menu"
                    style={{
                        left: menuRef.current.x,
                        top: menuRef.current.y,
                    }}
                >
                    <button ref={resetBtnRef} onClick={handleResetCamera}>
                        Reset Camera
                    </button>
                    <button ref={insertBtnRef} onClick={handleInsertCube}>
                        Insert Cube
                    </button>
                    <button
                        ref={insertSphereBtnRef}
                        onClick={handleInsertSphere}
                    >
                        Insert Sphere
                    </button>
                </div>
            )}
        </>
    );
}

export default Cursor;
