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
    updateCursorPosition: (
        name: string,
        targetX: number,
        targetY: number
    ) => void;
    onPinchMove?: (
        handedness: "Left" | "Right",
        deltaX: number,
        deltaY: number
    ) => void;
}

function useSkeleton({
    overlayCanvasRef,
    debug = false,
    updateCursorPosition,
    onPinchMove,
}: UseSkeletonProps) {
    const previousPointerAngle = useRef<number | null>(null);

    // Global strokes array, storing all strokes from either hand in order.
    const strokes = useRef<Stroke[]>([]);
    // Keep track of the current (active) stroke for each hand.
    const currentStroke = useRef<Record<"Left" | "Right", Stroke | null>>({
        Left: null,
        Right: null,
    });

    // Add pinch start tracking for each hand for a new hold detection system.
    const pinchStartRef = useRef<Record<"Left" | "Right", number | null>>({
        Left: null,
        Right: null,
    });
    // New ref to track the previous pinch position for delta computation.
    const pinchPrevPosRef = useRef<
        Record<"Left" | "Right", { x: number; y: number } | null>
    >({
        Left: null,
        Right: null,
    });
    // New ref to store smoothed pinch delta for each hand.
    const pinchDeltaSmoothingRef = useRef<
        Record<"Left" | "Right", { deltaX: number; deltaY: number } | null>
    >({
        Left: null,
        Right: null,
    });
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
                midY
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

            // --- Improved Hold (Pinch) Detection Logic ---
            const distanceIndexThumb = computeDistance(
                indexFinger,
                thumb,
                scaleX,
                scaleY
            );
            const currentTime = Date.now();

            // Compute hand spread to determine a relative pinch threshold.
            const xValues = hand.landmarks.map((lm) => lm[0]);
            const yValues = hand.landmarks.map((lm) => lm[1]);
            const avgDistance =
                (Math.max(...xValues) -
                    Math.min(...xValues) +
                    Math.max(...yValues) -
                    Math.min(...yValues)) /
                2;
            const pinchThreshold = 0.35 * avgDistance;

            let isHolding = false;
            if (distanceIndexThumb < pinchThreshold) {
                if (!pinchStartRef.current[hand.handedness]) {
                    pinchStartRef.current[hand.handedness] = currentTime;
                } else if (
                    currentTime - pinchStartRef.current[hand.handedness]! >
                    100
                ) {
                    isHolding = true;
                }
            } else {
                pinchStartRef.current[hand.handedness] = null;
                isHolding = false;
            }

            // Determine mode: rotation if thumb, index and middle finger are together.
            // Compute the distance between the index and middle finger.
            const middleFinger = hand.landmarks[12];
            const distanceIndexMiddle = computeDistance(
                indexFinger,
                middleFinger,
                scaleX,
                scaleY
            );
            // Use the same threshold for simplicity.
            const isRotate = distanceIndexMiddle < pinchThreshold;

            // Display mode information in debug text.
            ctx.fillStyle = "#FFFFFF";
            ctx.font = "16px Arial";
            if (debug) {
                ctx.fillText(
                    `Distance: ${distanceIndexThumb.toFixed(
                        2
                    )} px, Threshold: ${pinchThreshold.toFixed(2)} px`,
                    midX,
                    midY - 10
                );
            }
            ctx.fillText(
                isRotate ? "Rotating" : "Drawing",
                midX + 20,
                midY + 10
            );

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

            // --- Stroke Drawing Logic ---
            if (isHolding) {
                if (isRotate && typeof onPinchMove === "function") {
                    // --- Rotation mode: trigger onPinchMove with smoothed delta ---
                    const prevPos = pinchPrevPosRef.current[hand.handedness];
                    if (prevPos) {
                        const rawDeltaX = midX - prevPos.x;
                        const rawDeltaY = midY - prevPos.y;
                        const pinchSmoothingFactor = 0.2; // Adjust sensitivity as needed

                        let smoothedDelta = {
                            deltaX: rawDeltaX,
                            deltaY: rawDeltaY,
                        };
                        const prevSmoothed =
                            pinchDeltaSmoothingRef.current[hand.handedness];
                        if (prevSmoothed) {
                            smoothedDelta = {
                                deltaX:
                                    prevSmoothed.deltaX *
                                        (1 - pinchSmoothingFactor) +
                                    rawDeltaX * pinchSmoothingFactor,
                                deltaY:
                                    prevSmoothed.deltaY *
                                        (1 - pinchSmoothingFactor) +
                                    rawDeltaY * pinchSmoothingFactor,
                            };
                        }
                        pinchDeltaSmoothingRef.current[hand.handedness] =
                            smoothedDelta;
                        onPinchMove(
                            hand.handedness,
                            smoothedDelta.deltaX,
                            smoothedDelta.deltaY
                        );
                    }
                    // Update the previous pinch position for rotation mode.
                    pinchPrevPosRef.current[hand.handedness] = {
                        x: midX,
                        y: midY,
                    };
                } else {
                    // --- Drawing mode: update stroke drawing logic ---
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
                    currentStroke.current[hand.handedness]!.points.push({
                        x: midX,
                        y: midY,
                    });
                }
            } else {
                currentStroke.current[hand.handedness] = null;
                pinchPrevPosRef.current[hand.handedness] = null;
                pinchDeltaSmoothingRef.current[hand.handedness] = null;
            }

            // --- Compute and display additional hand angles ---
            const wrist = hand.landmarks[0];
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
        [debug, overlayCanvasRef, onPinchMove]
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
