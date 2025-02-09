import { useEffect, useRef } from "react";
import * as THREE from "three";
import "./Cursor.css";
import { Coords } from "../../objects/coords";

interface CursorProps {
    name: string;
    coords: Coords;
    overlayCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
}

function Cursor({ name, coords, overlayCanvasRef }: CursorProps) {
    const cursorRef = useRef<HTMLDivElement>(null);

    // These refs track hover times and timers for simulated button hover.
    const hoverStartTimes = useRef(new WeakMap<Element, number>());
    const hoverTimers = useRef(new WeakMap<Element, number>());

    // Ref for the circular progress SVG circle.
    const progressRef = useRef<SVGCircleElement>(null);

    // Increase the progress circle radius so that it goes around the cursor.
    const progressRadius = 20; // Adjust as needed

    // NEW: A ref to store the target cursor position for smoothing.
    const targetCursorRef = useRef({ x: coords.x, y: coords.y });

    // Whenever the coords prop changes, update the target.
    useEffect(() => {
        targetCursorRef.current.x = coords.x;
        targetCursorRef.current.y = coords.y;
    }, [coords]);

    useEffect(() => {
        let animationFrameId: number;

        const updateCursor = () => {
            if (!cursorRef.current) {
                animationFrameId = requestAnimationFrame(updateCursor);
                return;
            }

            const cursor = cursorRef.current;
            // Use the target values from the ref.
            const targetX = targetCursorRef.current.x;
            const targetY = targetCursorRef.current.y;

            // Get the overlay canvas offset.
            const { left: xOffset, top: yOffset } =
                overlayCanvasRef.current?.getBoundingClientRect() || {
                    left: 0,
                    top: 0,
                };

            // Read the current cursor positions (if not set, default to target).
            const previousX = parseFloat(cursor.style.left) || targetX;
            const previousY = parseFloat(cursor.style.top) || targetY;

            // Smoothly interpolate toward the target using THREE.MathUtils.lerp.
            const smoothingFactor = 0.3; // Adjust for the desired smoothness
            const newX = THREE.MathUtils.lerp(
                previousX,
                targetX,
                smoothingFactor
            );
            const newY = THREE.MathUtils.lerp(
                previousY,
                targetY,
                smoothingFactor
            );

            cursor.style.left = `${newX}px`;
            cursor.style.top = `${newY + yOffset}px`;

            // Simulate button hover using the absolute position of the cursor.
            const absoluteCursorX = newX + xOffset;
            const absoluteCursorY = newY + yOffset;
            const buttons = document.querySelectorAll(".button-column .button");
            buttons.forEach((button) => {
                const rect = button.getBoundingClientRect();
                const toleranceX = rect.width * 0.2; // 20% tolerance on width
                const toleranceY = rect.height * 0.2; // 20% tolerance on height
                const isHovering =
                    absoluteCursorX >= rect.left - toleranceX &&
                    absoluteCursorX <= rect.right + toleranceX &&
                    absoluteCursorY >= rect.top - toleranceY &&
                    absoluteCursorY <= rect.bottom + toleranceY;

                if (isHovering) {
                    // If not already hovered, start hover detection.
                    if (!hoverStartTimes.current.has(button)) {
                        button.classList.add("simulated-hover");
                        const startTime = Date.now();
                        hoverStartTimes.current.set(button, startTime);
                        // Start a timer that triggers a click after 1000ms if still hovered.
                        const timerId = window.setTimeout(() => {
                            if (button.classList.contains("simulated-hover")) {
                                (button as HTMLButtonElement).click();
                            }
                            hoverTimers.current.delete(button);
                            hoverStartTimes.current.delete(button);
                        }, 1000);
                        hoverTimers.current.set(button, timerId);
                    }
                } else {
                    if (hoverStartTimes.current.has(button)) {
                        button.classList.remove("simulated-hover");
                        const timerId = hoverTimers.current.get(button);
                        if (timerId) {
                            clearTimeout(timerId);
                        }
                        hoverTimers.current.delete(button);
                        hoverStartTimes.current.delete(button);
                    }
                }
            });

            // Calculate the maximum progress value for the progress indicator.
            let maxProgress = 0;
            buttons.forEach((button) => {
                const startTime = hoverStartTimes.current.get(button);
                if (startTime) {
                    const progress = Math.min(
                        (Date.now() - startTime) / 1000,
                        1
                    );
                    if (progress > maxProgress) {
                        maxProgress = progress;
                    }
                }
            });

            if (progressRef.current) {
                // For a circle of radius `progressRadius`, the circumference is:
                const circumference = 2 * Math.PI * progressRadius;
                const offset = circumference * (1 - maxProgress);
                progressRef.current.style.strokeDashoffset = offset.toString();
                // Only show the progress indicator if any button is being hovered.
                progressRef.current.style.opacity = maxProgress > 0 ? "1" : "0";
            }

            animationFrameId = requestAnimationFrame(updateCursor);
        };

        updateCursor(); // Start the animation loop.
        return () => {
            cancelAnimationFrame(animationFrameId);
        };
    }, [overlayCanvasRef]);

    return (
        <div className="cursor" id={name} ref={cursorRef}>
            {/* SVG for the progress indicator (positioned around the cursor) */}
            <svg
                className="cursor-progress"
                viewBox="0 0 40 40"
                style={{
                    width: "40px",
                    height: "40px",
                    position: "absolute",
                    top: "-15px", // Adjust so the circle centers around the cursor
                    left: "-15px",
                }}
            >
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
        </div>
    );
}

export default Cursor;
