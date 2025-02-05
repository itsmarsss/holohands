import { useEffect, useRef } from "react";
import "./Cursor.css";

interface CursorProps {
    name: string;
    coords: React.MutableRefObject<{ x: number; y: number }>;
    overlayCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
}

function Cursor({ name, coords, overlayCanvasRef }: CursorProps) {
    const cursorRef = useRef<HTMLDivElement>(null);
    const hoverState = useRef<{ [key: string]: boolean }>({}); // Track hover state for buttons

    useEffect(() => {
        let animationFrameId: number;

        const updateCursor = () => {
            if (!cursorRef.current) {
                // Schedule next update if cursorRef is not yet ready.
                animationFrameId = requestAnimationFrame(updateCursor);
                return;
            }

            const cursor = cursorRef.current;
            // Use the current coordinates from the ref.
            const targetX = coords.current.x;
            const targetY = coords.current.y;

            const { left: xOffset, top: yOffset } =
                overlayCanvasRef.current?.getBoundingClientRect() || {
                    left: 0,
                    top: 0,
                };

            // Store previous cursor positions (or default to target if not set)
            const previousX = parseFloat(cursor.style.left) || targetX;
            const previousY = parseFloat(cursor.style.top) || targetY;

            // Smoothly interpolate to the target position
            const smoothingFactor = 0.9; // Adjusted for smoother response
            const newX = previousX + (targetX - previousX) * smoothingFactor;
            const newY = previousY + (targetY - previousY) * smoothingFactor;

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

                // Debounce hover state changes
                if (isHovering && !hoverState.current[button.id]) {
                    button.classList.add("simulated-hover");
                    hoverState.current[button.id] = true; // Mark as hovered
                } else if (!isHovering && hoverState.current[button.id]) {
                    button.classList.remove("simulated-hover");
                    hoverState.current[button.id] = false; // Mark as not hovered
                }
            });

            // Schedule the next frame.
            animationFrameId = requestAnimationFrame(updateCursor);
        };

        updateCursor(); // Start the animation loop.

        return () => {
            cancelAnimationFrame(animationFrameId);
        };
    }, [coords, overlayCanvasRef]);

    return <div className="cursor" id={name} ref={cursorRef}></div>;
}

export default Cursor;
