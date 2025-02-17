import { useEffect, useRef, useState } from "react";
import "./Cursor.css";
import { InteractionStateHand } from "../../objects/InteractionState";
import { gsap } from "gsap";
import React from "react";

interface CursorProps {
    name: string;
    handRef: React.MutableRefObject<InteractionStateHand | null>;
    overlayCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
    speed: number; // New prop for customizable speed
}

function Cursor({ name, handRef, overlayCanvasRef, speed }: CursorProps) {
    const cursorRef = useRef<HTMLDivElement>(null);

    // These refs track hover times and timers for simulated button hover.
    const hoverStartTimes = useRef(new WeakMap<Element, number>());
    const hoverTimers = useRef(new WeakMap<Element, number>());

    // Ref for the circular progress SVG circle.
    const progressRef = useRef<SVGCircleElement>(null);

    // Increase the progress circle radius so that it goes around the cursor.
    const progressRadius = 20; // Adjust as needed

    // NEW: A ref to store the target cursor position for smoothing.
    const targetCursorRef = useRef({
        x: handRef.current?.cursor?.coords.x,
        y: handRef.current?.cursor?.coords.y,
    });

    const [status, setStatus] = useState<string>(
        handRef.current?.isPinching
            ? "Pinching"
            : handRef.current?.isHolding
            ? "Holding"
            : "Idle"
    );

    // Instead of local state updates, use GSAP ticker to always update the target coordinates from handRef.
    useEffect(() => {
        const updateTarget = () => {
            if (!handRef.current) return;

            targetCursorRef.current.x = handRef.current.cursor?.coords.x || 0;
            targetCursorRef.current.y = handRef.current.cursor?.coords.y || 0;
            setStatus(
                handRef.current.isPinching
                    ? "Pinching"
                    : handRef.current.isHolding
                    ? "Holding"
                    : "Idle"
            );
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

            // Get the overlay canvas offset.
            const { left: xOffset, top: yOffset } =
                overlayCanvasRef.current?.getBoundingClientRect() || {
                    left: 0,
                    top: 0,
                };

            // Use GSAP to animate the cursor's position.
            cursorRef.current.style.left = `${targetX}px`;
            cursorRef.current.style.top = `${targetY + yOffset}px`;
            // gsap.to(cursorRef.current, {
            //     left: `${targetX}px`,
            //     top: `${targetY + yOffset}px`,
            //     duration: speed, // Use the customizable speed
            //     ease: "power2.out", // Easing function for smoothness
            // });

            // Simulate button hover using the absolute position of the cursor.
            const absoluteCursorX = targetX + xOffset;
            const absoluteCursorY = targetY + yOffset;
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
        };

        gsap.ticker.add(updateCursor);
        return () => {
            gsap.ticker.remove(updateCursor);
        };
    }, [overlayCanvasRef]);

    return (
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
                <p>{status}</p>
            </div>
        </div>
    );
}

export default Cursor;
