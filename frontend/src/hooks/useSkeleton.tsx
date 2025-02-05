import { useCallback, useRef } from "react";
import { Stroke } from "../objects/stroke";
import { Hand, HAND_COLORS } from "../objects/hand";

interface ImageSize {
    width: number;
    height: number;
}

const getScaleFactors = (
    canvasWidth: number,
    canvasHeight: number,
    imageWidth: number,
    imageHeight: number
) => ({
    scaleX: canvasWidth / imageWidth,
    scaleY: canvasHeight / imageHeight,
});

const computeDistance = (
    p1: number[],
    p2: number[],
    scaleX: number,
    scaleY: number
) =>
    Math.sqrt(
        Math.pow((p1[0] - p2[0]) * scaleX, 2) +
            Math.pow((p1[1] - p2[1]) * scaleY, 2)
    );

const updateCursorPosition = (
    elementId: string,
    targetX: number,
    targetY: number,
    canvas: HTMLCanvasElement
) => {
    const cursor = document.getElementById(elementId);
    if (!cursor) return;

    const { top: yOffset } = canvas.getBoundingClientRect();

    // Store previous cursor positions
    const previousX = parseFloat(cursor.style.left) || 0;
    const previousY = parseFloat(cursor.style.top) || 0;

    // Smoothly interpolate to the target position
    const smoothingFactor = 0.5; // Reduced value for faster response
    const newX = previousX + (targetX - previousX) * smoothingFactor;
    const newY = previousY + (targetY - previousY) * smoothingFactor;

    cursor.style.left = `${newX}px`;
    cursor.style.top = `${newY + yOffset}px`;
};

const smoothValue = (
    previous: number | null,
    current: number,
    smoothingFactor: number
): number => {
    if (previous === null) return current;
    return previous * (1 - smoothingFactor) + current * smoothingFactor;
};

interface UseSkeletonProps {
    overlayCanvasRef: React.RefObject<HTMLCanvasElement>;
    debug?: boolean;
}

function useSkeleton({ overlayCanvasRef, debug = false }: UseSkeletonProps) {
    const previousPointerAngle = useRef<number | null>(null);

    // Global strokes array, storing all strokes from either hand in order.
    const strokes = useRef<Stroke[]>([]);
    // Keep track of the current (active) stroke for each hand.
    const currentStroke = useRef<Record<"Left" | "Right", Stroke | null>>({
        Left: null,
        Right: null,
    });

    const distanceHistory = useRef<number[]>([]);
    const historyTime = useRef<number[]>([]);
    const smoothingFactor = 0.5;

    const drawHand = useCallback(
        (hand: Hand, imageSize: ImageSize, ctx: CanvasRenderingContext2D) => {
            const overlayCanvas = overlayCanvasRef.current;
            if (!overlayCanvas) return;

            ctx.save();
            const { scaleX, scaleY } = getScaleFactors(
                overlayCanvas.width,
                overlayCanvas.height,
                imageSize.width,
                imageSize.height
            );

            // Calculate midpoints for cursor position
            const indexFinger = hand.landmarks[8];
            const thumb = hand.landmarks[4];
            const midX = ((indexFinger[0] + thumb[0]) / 2) * scaleX;
            const midY = ((indexFinger[1] + thumb[1]) / 2) * scaleY;

            // Update cursor position smoothly
            updateCursorPosition(
                `${hand.handedness.toLowerCase()}Cursor`,
                midX,
                midY,
                overlayCanvas
            );

            // --- Conditionally draw hand connections ---
            if (debug) {
                ctx.strokeStyle = HAND_COLORS[hand.handedness];
                ctx.lineWidth = 3;
                ctx.globalAlpha = 0.8;
                hand.connections.forEach(([start, end]) => {
                    ctx.beginPath();
                    ctx.moveTo(
                        hand.landmarks[start][0] * scaleX,
                        hand.landmarks[start][1] * scaleY
                    );
                    ctx.lineTo(
                        hand.landmarks[end][0] * scaleX,
                        hand.landmarks[end][1] * scaleY
                    );
                    ctx.stroke();
                });

                // Draw hand landmarks.
                ctx.fillStyle = HAND_COLORS[hand.handedness];
                ctx.globalAlpha = 1.0;
                hand.landmarks.forEach((lm) => {
                    ctx.beginPath();
                    ctx.arc(lm[0] * scaleX, lm[1] * scaleY, 4, 0, 2 * Math.PI);
                    ctx.fill();
                });
            }

            // Draw index-thumb connection.
            ctx.strokeStyle = "#FFFFFF";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(indexFinger[0] * scaleX, indexFinger[1] * scaleY);
            ctx.lineTo(thumb[0] * scaleX, thumb[1] * scaleY);
            ctx.stroke();

            // Compute and display index-thumb distance and holding state.
            const distanceIndexThumb = computeDistance(
                indexFinger,
                thumb,
                scaleX,
                scaleY
            );
            const currentTime = Date.now();
            distanceHistory.current.push(distanceIndexThumb);
            historyTime.current.push(currentTime);

            // Remove old history entries (> 100ms)
            while (
                historyTime.current.length > 0 &&
                currentTime - historyTime.current[0] > 100
            ) {
                distanceHistory.current.shift();
                historyTime.current.shift();
            }
            const movingAverage =
                distanceHistory.current.reduce((sum, val) => sum + val, 0) /
                distanceHistory.current.length;
            const variance =
                distanceHistory.current.reduce(
                    (sum, val) => sum + Math.pow(val - movingAverage, 2),
                    0
                ) / distanceHistory.current.length;
            const stdDev = Math.sqrt(variance);

            // Drawing logic based on hand gesture.
            const xValues = hand.landmarks.map((lm) => lm[0]);
            const yValues = hand.landmarks.map((lm) => lm[1]);
            const avgDistance =
                (Math.max(...xValues) -
                    Math.min(...xValues) +
                    (Math.max(...yValues) - Math.min(...yValues))) /
                2;
            const touchThreshold = avgDistance / 2;

            const stabilityThreshold = 10;
            const isHolding =
                stdDev < stabilityThreshold &&
                distanceIndexThumb < touchThreshold;

            ctx.fillStyle = "#FFFFFF";
            ctx.font = "16px Arial";
            if (debug) {
                ctx.fillText(
                    `Distance: ${distanceIndexThumb.toFixed(2)} px`,
                    midX,
                    midY - 10
                );
            }
            ctx.fillText(isHolding ? "+" : "-", midX + 20, midY + 10);

            // Compute and display palm angle.
            const wrist = hand.landmarks[0];
            const middleFinger = hand.landmarks[12];
            const palmAngle =
                (Math.atan2(
                    middleFinger[1] - wrist[1],
                    middleFinger[0] - wrist[0]
                ) *
                    180) /
                Math.PI;
            if (debug) {
                ctx.fillText(
                    `Palm Angle: ${palmAngle.toFixed(2)}°`,
                    wrist[0] * scaleX,
                    wrist[1] * scaleY - 10
                );
            }

            // Compute and display index-thumb angle.
            const indexThumbAngle =
                (Math.atan2(
                    indexFinger[1] - thumb[1],
                    indexFinger[0] - thumb[0]
                ) *
                    180) /
                Math.PI;
            if (debug) {
                ctx.fillText(
                    `Index-Thumb Angle: ${indexThumbAngle.toFixed(2)}°`,
                    indexFinger[0] * scaleX,
                    indexFinger[1] * scaleY - 30
                );
            }

            // Smooth pointer angle and update cursor position.
            const currentPointerAngle =
                (Math.atan2(
                    (indexFinger[1] - thumb[1]) * scaleY,
                    (indexFinger[0] - thumb[0]) * scaleX
                ) *
                    180) /
                Math.PI;
            const pointerAngle = smoothValue(
                previousPointerAngle.current,
                currentPointerAngle,
                smoothingFactor
            );
            previousPointerAngle.current = pointerAngle;

            // --- Stroke Drawing Logic (for separate strokes in one array) ---
            if (isHolding) {
                // If no active stroke exists for this hand, create one and add it to the global strokes array.
                if (!currentStroke.current[hand.handedness]) {
                    currentStroke.current[hand.handedness] = {
                        hand: hand.handedness,
                        color: HAND_COLORS[hand.handedness],
                        points: [],
                    };
                    strokes.current.push(
                        currentStroke.current[hand.handedness]!
                    );
                }
                // Append the current point to the active stroke.
                currentStroke.current[hand.handedness]!.points.push({
                    x: midX,
                    y: midY,
                });
            } else {
                // Finalize the stroke for this hand.
                currentStroke.current[hand.handedness] = null;
            }

            // Draw detected symbols if available.
            if (hand.detected_symbols && hand.detected_symbols.length > 0) {
                hand.detected_symbols.forEach((symbol, index) => {
                    ctx.fillText(
                        `${symbol[0]} (${(symbol[1] * 100).toFixed(2)}%)`,
                        debug ? wrist[0] * scaleX : midX,
                        (debug ? wrist[1] * scaleY : midY) + 20 + index * 20
                    );
                });
            }
            ctx.restore();
        },
        [debug, overlayCanvasRef]
    );

    // Draw each stroke separately from the global strokes array.
    const drawStrokes = useCallback((ctx: CanvasRenderingContext2D) => {
        ctx.save();
        ctx.globalAlpha = 0.8;
        strokes.current.forEach((stroke) => {
            if (stroke.points.length < 2) return;
            ctx.strokeStyle = stroke.color;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
            for (let i = 1; i < stroke.points.length; i++) {
                const cp = {
                    x: (stroke.points[i - 1].x + stroke.points[i].x) / 2,
                    y: (stroke.points[i - 1].y + stroke.points[i].y) / 2,
                };
                ctx.quadraticCurveTo(
                    stroke.points[i - 1].x,
                    stroke.points[i - 1].y,
                    cp.x,
                    cp.y
                );
            }
            ctx.stroke();
        });
        ctx.restore();
    }, []);

    // Return the necessary drawing functions
    return { drawHand, drawStrokes };
}

export default useSkeleton;
