import React, { useEffect, useRef, useState, useCallback } from "react";
import Controls from "./Controls";
import "./HandTracking.css";
import Editable3DObject from "../3d/Editable3DObject";
import useWebSocket from "../../hooks/useWebsocket";
import useVideoStream from "../../hooks/useVideoStream";

interface Hand {
    handedness: "Left" | "Right";
    landmarks: number[][];
    connections: number[][];
    detected_symbols?: [string, number][];
}

interface ImageSize {
    width: number;
    height: number;
}

interface Stroke {
    hand: "Left" | "Right";
    color: string;
    points: { x: number; y: number }[];
}

const HAND_COLORS: Record<"Left" | "Right", string> = {
    Left: "#FF0000", // Red
    Right: "#00FF00", // Green
};

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
    x: number,
    y: number,
    canvas: HTMLCanvasElement
) => {
    const cursor = document.getElementById(elementId);
    if (!cursor) return;
    const { left: xOffset, top: yOffset } = canvas.getBoundingClientRect();
    cursor.style.left = `${x - 10 + xOffset}px`;
    cursor.style.top = `${y - 10 + yOffset}px`;
};

const smoothValue = (
    previous: number | null,
    current: number,
    smoothingFactor: number
): number => {
    if (previous === null) return current;
    return previous * (1 - smoothingFactor) + current * smoothingFactor;
};

const HandTracking: React.FC = () => {
    const {
        wsUrl,
        setWsUrl,
        connectionStatus,
        connect,
        disconnect,
        sendDataUrl,
    } = useWebSocket();
    const {
        videoRef,
        startStream,
        stopStream,
        captureFrame,
        getAvailableCameras,
        streamStatus,
    } = useVideoStream();

    const [frame, setFrame] = useState<string | null>(null);

    const [currentHandsData, setCurrentHandsData] = useState<Hand[]>([]);

    const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

    const previousPointerAngle = useRef<number | null>(null);
    const previousDimensions = useRef<{ width: number; height: number }>({
        width: 0,
        height: 0,
    });

    // Global strokes array, storing all strokes from either hand in order.
    const strokes = useRef<Stroke[]>([]);
    // Keep track of the current (active) stroke for each hand.
    const currentStroke = useRef<Record<"Left" | "Right", Stroke | null>>({
        Left: null,
        Right: null,
    });

    // Whether each hand is currently drawing.
    const isDrawing = useRef<Record<"Left" | "Right", boolean>>({
        Left: false,
        Right: false,
    });

    const distanceHistory = useRef<number[]>([]);
    const historyTime = useRef<number[]>([]);
    const smoothingFactor = 0.5;

    useEffect(() => {
        setWsUrl("ws://localhost:6969/ws");
        connect();

        getAvailableCameras().then((cameras: MediaDeviceInfo[]) => {
            if (cameras.length > 0) {
                console.log("Available cameras:");
                cameras.forEach((camera, index) => {
                    console.log(`${index}: ${camera.label}`);
                });
                startStream(cameras[1].deviceId);
            } else {
                console.error("No cameras available");
            }
        });

        return () => {
            disconnect();
            stopStream();
        };
    }, []);

    useEffect(() => {
        if (streamStatus === "streaming" && connectionStatus === "connected") {
            const frame = captureFrame();
            if (frame?.length && frame.length > 100) {
                console.log("Captured frame:", frame.length);
                setFrame(frame);
            } else {
                console.log("Failed to capture frame.");
            }
        }
    }, [streamStatus, connectionStatus]);

    useEffect(() => {
        console.log("Frame:", frame?.length);
        sendDataUrl(frame);
    }, [frame]);

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

            // Draw hand connections.
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

            // Draw index-thumb connection.
            const indexFinger = hand.landmarks[8];
            const thumb = hand.landmarks[4];
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
            const touchThreshold = avgDistance / 3;

            const stabilityThreshold = 10;
            const isHolding =
                stdDev < stabilityThreshold &&
                distanceIndexThumb < touchThreshold;

            const midX = ((indexFinger[0] + thumb[0]) / 2) * scaleX;
            const midY = ((indexFinger[1] + thumb[1]) / 2) * scaleY;
            ctx.fillStyle = "#FFFFFF";
            ctx.font = "16px Arial";
            ctx.fillText(
                `Distance: ${distanceIndexThumb.toFixed(2)} px`,
                midX,
                midY - 10
            );
            ctx.fillText(
                isHolding ? "Holding" : "Not Holding",
                midX,
                midY + 10
            );

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
            ctx.fillText(
                `Palm Angle: ${palmAngle.toFixed(2)}°`,
                wrist[0] * scaleX,
                wrist[1] * scaleY - 10
            );

            // Compute and display index-thumb angle.
            const indexThumbAngle =
                (Math.atan2(
                    indexFinger[1] - thumb[1],
                    indexFinger[0] - thumb[0]
                ) *
                    180) /
                Math.PI;
            ctx.fillText(
                `Index-Thumb Angle: ${indexThumbAngle.toFixed(2)}°`,
                indexFinger[0] * scaleX,
                indexFinger[1] * scaleY - 30
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
            updateCursorPosition(
                `${hand.handedness.toLowerCase()}Cursor`,
                midX,
                midY,
                overlayCanvas
            );

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
                        wrist[0] * scaleX,
                        wrist[1] * scaleY + 20 + index * 20
                    );
                });
            }
            ctx.restore();
        },
        []
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

    const resizeCanvases = useCallback(() => {
        const overlayCanvas = overlayCanvasRef.current;
        if (!overlayCanvas) return;

        // Use the intrinsic video dimensions to compute the aspect ratio.
        const aspectRatio = overlayCanvas.width / overlayCanvas.height;
        const windowAspectRatio = window.innerWidth / window.innerHeight;

        let width: number, height: number;
        if (windowAspectRatio > aspectRatio) {
            width = window.innerHeight * aspectRatio;
            height = window.innerHeight;
        } else {
            width = window.innerWidth;
            height = window.innerWidth / aspectRatio;
        }

        // Only update if dimensions have changed.
        if (
            previousDimensions.current.width === width &&
            previousDimensions.current.height === height
        )
            return;

        overlayCanvas.width = width;
        overlayCanvas.height = height;
        previousDimensions.current = { width, height };
    }, []);

    // Resize canvases periodically (or consider using a ResizeObserver).
    useEffect(() => {
        const resizeInterval = setInterval(resizeCanvases, 1000);
        return () => clearInterval(resizeInterval);
    }, [resizeCanvases]);

    return (
        <div id="container">
            <Controls currentHandsData={currentHandsData} />
            <Editable3DObject />
            <canvas
                className="overlay-canvas"
                ref={overlayCanvasRef}
                style={{ backgroundColor: "transparent" }}
            />
            <video
                ref={videoRef}
                autoPlay
                playsInline
                style={{
                    display: "none", // Hide the video element
                }}
            />
            <div id="leftCursor" className="cursor" />
            <div id="rightCursor" className="cursor" />
            <div className="connection-status">
                {connectionStatus === "connected"
                    ? "Connected"
                    : connectionStatus === "connecting"
                    ? "Connecting..."
                    : "Disconnected - Retrying..."}
                <br />
                <i>{wsUrl || "No URL"}</i>
            </div>
            <div id="left-buttons" className="button-column">
                <button className="button">Button 1</button>
                <button className="button">Button 2</button>
                <button className="button">Button 3</button>
            </div>
            <div id="right-buttons" className="button-column">
                <button className="button">Button 4</button>
                <button className="button">Button 5</button>
                <button className="button">Button 6</button>
            </div>
        </div>
    );
};

export default HandTracking;
