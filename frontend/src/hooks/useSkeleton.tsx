import { useCallback, useRef, useEffect } from "react";
import { Stroke } from "../objects/stroke";
import { Hand, HAND_COLORS } from "../objects/hand";
import {
    DEFAULT_INTERACTION_STATE,
    InteractionState,
    InteractionStateHand,
} from "../objects/InteractionState";
import { Coords } from "../objects/coords";

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

const computeAngle = (p1x: number, p1y: number, p2x: number, p2y: number) =>
    Math.atan2(p2y - p1y, p2x - p1x) * (180 / Math.PI);

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
    updateInteractionState: (interactionState: InteractionState) => void;
}

function useSkeleton({
    overlayCanvasRef,
    debug = false,
    updateInteractionState,
}: UseSkeletonProps) {
    const previousPointerAngle = useRef<number | null>(null);

    // Global strokes array, storing all strokes from either hand in order.
    const strokes = useRef<Stroke[]>([]);
    // Keep track of the current (active) stroke for each hand.
    const currentStroke = useRef<Record<"Left" | "Right", Stroke | null>>({
        Left: null,
        Right: null,
    });

    const distanceHistoryIndexThumb = useRef<number[]>([]);
    const distanceHistoryMiddleThumb = useRef<number[]>([]);

    const historyTimeIndexThumb = useRef<number[]>([]);
    const historyTimeMiddleThumb = useRef<number[]>([]);

    // Add pinch start tracking for each hand for a new hold detection system.
    const pinchStartRef = useRef<Record<"Left" | "Right", number | null>>({
        Left: null,
        Right: null,
    });

    const interactionStateRef = useRef<InteractionState>(
        DEFAULT_INTERACTION_STATE
    );

    const smoothingFactor = 0.5;

    const paintHands = useCallback(
        (
            hand: Hand,
            scaleX: number,
            scaleY: number,
            ctx: CanvasRenderingContext2D
        ) => {
            if (!debug) {
                return;
            }
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
        },
        [debug]
    );

    const paintConnection = useCallback(
        (
            start: number[],
            end: number[],
            scaleX: number,
            scaleY: number,
            ctx: CanvasRenderingContext2D
        ) => {
            ctx.strokeStyle = "#FFFFFF";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(start[0] * scaleX, start[1] * scaleY);
            ctx.lineTo(end[0] * scaleX, end[1] * scaleY);
            ctx.stroke();
        },
        []
    );

    const calculateHolding = useCallback((hand: Hand) => {
        // Moving average of index-thumb distance
        const movingAverageIndexThumb =
            distanceHistoryIndexThumb.current.reduce(
                (sum, val) => sum + val,
                0
            ) / distanceHistoryIndexThumb.current.length;

        // Variance of index-thumb distance
        const varianceIndexThumb =
            distanceHistoryIndexThumb.current.reduce(
                (sum, val) => sum + Math.pow(val - movingAverageIndexThumb, 2),
                0
            ) / distanceHistoryIndexThumb.current.length;

        const stdDevIndexThumb = Math.sqrt(varianceIndexThumb);

        // Compute hand spread to determine a relative pinch threshold.
        const xValues = hand.landmarks.map((lm) => lm[0]);
        const yValues = hand.landmarks.map((lm) => lm[1]);
        const avgDistance =
            (Math.max(...xValues) -
                Math.min(...xValues) +
                Math.max(...yValues) -
                Math.min(...yValues)) /
            2;

        // Thresholds
        const holdThreshold = 0.5 * avgDistance;
        const stabilityThreshold = 0.05 * avgDistance;

        return {
            isHolding:
                movingAverageIndexThumb < holdThreshold &&
                stdDevIndexThumb < stabilityThreshold,
            holdThreshold,
            stabilityThreshold,
        };
    }, []);

    const calculatePinching = useCallback((hand: Hand) => {
        // Moving average of index-thumb distance
        const movingAverageIndexThumb =
            distanceHistoryIndexThumb.current.reduce(
                (sum, val) => sum + val,
                0
            ) / distanceHistoryIndexThumb.current.length;

        // Moving average of middle-thumb distance
        const movingAverageMiddleThumb =
            distanceHistoryMiddleThumb.current.reduce(
                (sum, val) => sum + val,
                0
            ) / distanceHistoryMiddleThumb.current.length;

        // Variance of index-thumb distance
        const varianceIndexThumb =
            distanceHistoryIndexThumb.current.reduce(
                (sum, val) => sum + Math.pow(val - movingAverageIndexThumb, 2),
                0
            ) / distanceHistoryIndexThumb.current.length;

        const stdDevIndexThumb = Math.sqrt(varianceIndexThumb);

        // Variance of middle-thumb distance
        const varianceMiddleThumb =
            distanceHistoryMiddleThumb.current.reduce(
                (sum, val) => sum + Math.pow(val - movingAverageMiddleThumb, 2),
                0
            ) / distanceHistoryMiddleThumb.current.length;

        const stdDevMiddleThumb = Math.sqrt(varianceMiddleThumb);

        // Compute hand spread to determine a relative pinch threshold.
        const xValues = hand.landmarks.map((lm) => lm[0]);
        const yValues = hand.landmarks.map((lm) => lm[1]);
        const avgDistance =
            (Math.max(...xValues) -
                Math.min(...xValues) +
                Math.max(...yValues) -
                Math.min(...yValues)) /
            2;

        // Thresholds
        const pinchThreshold = 0.35 * avgDistance;
        const stabilityThreshold = 0.05 * avgDistance;

        let isPinching =
            movingAverageIndexThumb < pinchThreshold &&
            stdDevIndexThumb < stabilityThreshold &&
            movingAverageMiddleThumb < pinchThreshold &&
            stdDevMiddleThumb < stabilityThreshold;

        const currentTime = Date.now();
        if (isPinching) {
            if (!pinchStartRef.current[hand.handedness]) {
                pinchStartRef.current[hand.handedness] = currentTime;
            } else if (
                currentTime - pinchStartRef.current[hand.handedness]! >
                100
            ) {
                isPinching = true;
            }
        } else {
            pinchStartRef.current[hand.handedness] = null;
            isPinching = false;
        }

        return {
            isPinching,
            pinchThreshold,
            stabilityThreshold,
        };
    }, []);

    const debugText = useCallback(
        (x: number, y: number, text: string, ctx: CanvasRenderingContext2D) => {
            if (!debug) return;
            ctx.fillStyle = "#FFFFFF";
            ctx.font = "16px Arial";
            ctx.fillText(text, x, y);
        },
        [debug]
    );

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
            const wrist = hand.landmarks[0];
            const thumbFinger = hand.landmarks[4];
            const indexFinger = hand.landmarks[8];
            const middleFinger = hand.landmarks[12];

            // Calculate cursor position
            const cursorX = ((indexFinger[0] + thumbFinger[0]) / 2) * scaleX;
            const cursorY = ((indexFinger[1] + thumbFinger[1]) / 2) * scaleY;

            // Paint hand connections
            paintHands(hand, scaleX, scaleY, ctx);

            // Paint index-thumb connection
            paintConnection(indexFinger, thumbFinger, scaleX, scaleY, ctx);

            // Index-thumb distance
            const distanceIndexThumb = computeDistance(
                indexFinger,
                thumbFinger,
                scaleX,
                scaleY
            );

            // Middle-thumb distance
            const distanceMiddleThumb = computeDistance(
                middleFinger,
                thumbFinger,
                scaleX,
                scaleY
            );

            const currentTime = Date.now();
            distanceHistoryIndexThumb.current.push(distanceIndexThumb);
            historyTimeIndexThumb.current.push(currentTime);

            // Remove old index-thumb history entries (> 200ms)
            while (
                historyTimeIndexThumb.current.length > 0 &&
                currentTime - historyTimeIndexThumb.current[0] > 100
            ) {
                distanceHistoryIndexThumb.current.shift();
                historyTimeIndexThumb.current.shift();
            }

            distanceHistoryMiddleThumb.current.push(distanceMiddleThumb);
            historyTimeMiddleThumb.current.push(currentTime);

            // Remove old middle-thumb history entries (> 200ms)
            while (
                historyTimeMiddleThumb.current.length > 0 &&
                currentTime - historyTimeMiddleThumb.current[0] > 100
            ) {
                distanceHistoryMiddleThumb.current.shift();
                historyTimeMiddleThumb.current.shift();
            }

            const { isHolding, holdThreshold } = calculateHolding(hand);
            const { isPinching, pinchThreshold } = calculatePinching(hand);

            // Display mode information in debug text.
            debugText(
                cursorX,
                cursorY - 30,
                `Distance: ${distanceIndexThumb.toFixed(
                    2
                )} px, Hold Threshold: ${holdThreshold.toFixed(
                    2
                )} px, Pinch Threshold: ${pinchThreshold.toFixed(2)} px`,
                ctx
            );
            debugText(
                cursorX + 20,
                cursorY + 10,
                isPinching ? "Pinching" : isHolding ? "Holding" : "Idle",
                ctx
            );

            // Smooth pointer angle and update cursor position.
            const currentPointerAngle = computeAngle(
                indexFinger[0] * scaleX,
                indexFinger[1] * scaleY,
                thumbFinger[0] * scaleX,
                thumbFinger[1] * scaleY
            );
            const pointerAngle = smoothValue(
                previousPointerAngle.current,
                currentPointerAngle,
                smoothingFactor
            );
            previousPointerAngle.current = pointerAngle;

            // Compute palm angle
            const palmAngle = computeAngle(
                middleFinger[0],
                middleFinger[1],
                wrist[0],
                wrist[1]
            );
            debugText(
                wrist[0] * scaleX,
                wrist[1] * scaleY - 10,
                `Palm Angle: ${palmAngle.toFixed(2)}°`,
                ctx
            );

            // Compute index-thumb angle
            const indexThumbAngle = computeAngle(
                indexFinger[0],
                indexFinger[1],
                thumbFinger[0],
                thumbFinger[1]
            );
            debugText(
                indexFinger[0] * scaleX,
                indexFinger[1] * scaleY - 30,
                `Index-Thumb Angle: ${indexThumbAngle.toFixed(2)}°`,
                ctx
            );

            // Draw detected symbols if available.
            if (hand.detected_symbols && hand.detected_symbols.length > 0) {
                hand.detected_symbols.forEach((symbol, index) => {
                    debugText(
                        debug ? wrist[0] * scaleX : cursorX,
                        (debug ? wrist[1] * scaleY : cursorY) + 20 + index * 20,
                        `${symbol[0]} (${(symbol[1] * 100).toFixed(2)}%)`,
                        ctx
                    );
                });
            }

            // Compute the angle between left and right cursors if available.
            let angleBetween = 0;
            if (
                interactionStateRef.current.Left?.cursor &&
                interactionStateRef.current.Right?.cursor
            ) {
                const leftCursor = interactionStateRef.current.Left.cursor;
                const rightCursor = interactionStateRef.current.Right.cursor;
                if (leftCursor && rightCursor) {
                    angleBetween = computeAngle(
                        leftCursor.coords.x,
                        leftCursor.coords.y,
                        rightCursor.coords.x,
                        rightCursor.coords.y
                    );
                }
            }

            // Update the interaction state for the current hand.
            const newCoords: Coords = { x: cursorX, y: cursorY };

            const newInteractionStateHand: InteractionStateHand = {
                isHolding,
                isPinching,
                cursor: {
                    coords: newCoords,
                    angle: pointerAngle,
                },
            };

            // Ensure that the handedness is typed correctly
            const handedness: "Left" | "Right" = hand.handedness;

            interactionStateRef.current = {
                ...interactionStateRef.current,
                [handedness]: newInteractionStateHand,
                angleBetween,
            };

            ctx.restore();
        },
        [debug, overlayCanvasRef, updateInteractionState]
    );

    const drawHands = useCallback(
        (
            hands: Hand[],
            imageSize: ImageSize,
            ctx: CanvasRenderingContext2D
        ) => {
            interactionStateRef.current = {
                ...interactionStateRef.current,
                Left: null,
                Right: null,
            };

            hands.forEach((hand) => {
                drawHand(hand, imageSize, ctx);
            });

            updateInteractionState(interactionStateRef.current);
        },
        [debug, overlayCanvasRef, updateInteractionState]
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
    return { drawHands, drawStrokes };
}

export default useSkeleton;
