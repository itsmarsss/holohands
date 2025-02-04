import React, { useEffect, useRef, useState, useCallback } from "react";
import VideoStream from "./VideoStream";
import Controls from "./Controls";
import "./HandTracking.css";

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

const WEBSOCKET_URL = "ws://localhost:6969/ws";
const RECONNECT_DELAY = 3000; // milliseconds

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
    const videoCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const ws = useRef<WebSocket | null>(null);
    const reconnectTimeout = useRef<number>();

    const [currentHandsData, setCurrentHandsData] = useState<Hand[]>([]);
    const [connectionStatus, setConnectionStatus] = useState<
        "connecting" | "connected" | "disconnected"
    >("disconnected");

    const previousPointerAngle = useRef<number | null>(null);
    const previousDimensions = useRef<{ width: number; height: number }>({
        width: 0,
        height: 0,
    });
    const drawnPoints = useRef<
        { color: string; points: { x: number; y: number }[] }[]
    >([]);
    const isDrawing = useRef<Record<"Left" | "Right", boolean>>({
        Left: false,
        Right: false,
    });
    const distanceHistory = useRef<number[]>([]);
    const historyTime = useRef<number[]>([]);
    const smoothingFactor = 0.5;
    const [acknowledged, setAcknowledged] = useState(false);

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

            // Draw hand connections
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

            // Draw hand landmarks
            ctx.fillStyle = HAND_COLORS[hand.handedness];
            ctx.globalAlpha = 1.0;
            hand.landmarks.forEach((lm) => {
                ctx.beginPath();
                ctx.arc(lm[0] * scaleX, lm[1] * scaleY, 4, 0, 2 * Math.PI);
                ctx.fill();
            });

            // Draw index-thumb connection
            const indexFinger = hand.landmarks[8];
            const thumb = hand.landmarks[4];
            ctx.strokeStyle = "#FFFFFF";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(indexFinger[0] * scaleX, indexFinger[1] * scaleY);
            ctx.lineTo(thumb[0] * scaleX, thumb[1] * scaleY);
            ctx.stroke();

            // Compute and display index-thumb distance and holding state
            const distanceIndexThumb = computeDistance(
                indexFinger,
                thumb,
                scaleX,
                scaleY
            );
            const currentTime = Date.now();
            distanceHistory.current.push(distanceIndexThumb);
            historyTime.current.push(currentTime);

            // Remove old history entries (> 500ms)
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

            // Drawing logic based on hand gesture
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

            // Compute and display palm angle
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

            // Compute and display index-thumb angle
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

            // Smooth pointer angle and update cursor position
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

            if (isHolding) {
                if (!isDrawing.current[hand.handedness]) {
                    drawnPoints.current.push({
                        color: HAND_COLORS[hand.handedness],
                        points: [],
                    });
                    isDrawing.current[hand.handedness] = true;
                }
                const strokes =
                    drawnPoints.current[drawnPoints.current.length - 1].points;
                strokes.push({ x: midX, y: midY });
            } else {
                isDrawing.current[hand.handedness] = false;
            }

            // Draw detected symbols if available
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

    const drawStrokes = useCallback((ctx: CanvasRenderingContext2D) => {
        ctx.save();
        ctx.globalAlpha = 0.8;
        drawnPoints.current.forEach(({ color, points }) => {
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            if (points.length < 2) return;
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                const cp = {
                    x: (points[i - 1].x + points[i].x) / 2,
                    y: (points[i - 1].y + points[i].y) / 2,
                };
                ctx.quadraticCurveTo(
                    points[i - 1].x,
                    points[i - 1].y,
                    cp.x,
                    cp.y
                );
            }
            ctx.stroke();
        });
        ctx.restore();
    }, []);

    const connectWebSocket = useCallback(() => {
        if (ws.current?.readyState === WebSocket.OPEN) return;

        try {
            ws.current = new WebSocket(WEBSOCKET_URL);

            ws.current.onopen = () => {
                console.log("WebSocket connection established");
                setConnectionStatus("connected");
            };

            ws.current.onerror = (error) => {
                console.error("WebSocket error:", error);
                setConnectionStatus("disconnected");
            };

            ws.current.onclose = () => {
                console.log("WebSocket connection closed");
                setConnectionStatus("disconnected");
                reconnectTimeout.current = window.setTimeout(
                    connectWebSocket,
                    RECONNECT_DELAY
                );
            };

            ws.current.onmessage = (event) => {
                const overlayCanvas = overlayCanvasRef.current;
                if (!overlayCanvas) return;
                const ctx = overlayCanvas.getContext("2d");
                if (!ctx) return;

                try {
                    const data = JSON.parse(event.data);
                    // Clear overlay canvas before drawing new frame
                    ctx.clearRect(
                        0,
                        0,
                        overlayCanvas.width,
                        overlayCanvas.height
                    );

                    if (data.hands && data.hands.length > 0) {
                        setCurrentHandsData(data.hands);
                        data.hands.forEach((hand: Hand) =>
                            drawHand(hand, data.image_size as ImageSize, ctx)
                        );
                    }
                    drawStrokes(ctx);

                    setAcknowledged(false);
                } catch (error) {
                    console.error("Error processing message:", error);
                }
            };
        } catch (error) {
            console.error("Error creating WebSocket:", error);
            setConnectionStatus("disconnected");
            reconnectTimeout.current = window.setTimeout(
                connectWebSocket,
                RECONNECT_DELAY
            );
        }
    }, [drawHand, drawStrokes]);

    const resizeCanvases = useCallback(() => {
        const videoCanvas = videoCanvasRef.current;
        const overlayCanvas = overlayCanvasRef.current;
        if (!videoCanvas || !overlayCanvas) return;

        // Use the intrinsic video dimensions to compute the aspect ratio
        const aspectRatio = videoCanvas.width / videoCanvas.height;
        const windowAspectRatio = window.innerWidth / window.innerHeight;

        let width: number, height: number;
        if (windowAspectRatio > aspectRatio) {
            width = window.innerHeight * aspectRatio;
            height = window.innerHeight;
        } else {
            width = window.innerWidth;
            height = window.innerWidth / aspectRatio;
        }

        // Only update if dimensions have changed
        if (
            previousDimensions.current.width === width &&
            previousDimensions.current.height === height
        )
            return;

        videoCanvas.width = width;
        videoCanvas.height = height;
        overlayCanvas.width = width;
        overlayCanvas.height = height;
        previousDimensions.current = { width, height };
    }, []);

    // Resize canvases periodically (or consider using a ResizeObserver)
    useEffect(() => {
        const resizeInterval = setInterval(resizeCanvases, 1000);
        return () => clearInterval(resizeInterval);
    }, [resizeCanvases]);

    useEffect(() => {
        setConnectionStatus("connecting");
        connectWebSocket();

        return () => {
            if (reconnectTimeout.current) {
                clearTimeout(reconnectTimeout.current);
            }
            if (ws.current) {
                ws.current.close();
            }
        };
    }, [connectWebSocket]);

    const handleAcknowledgment = () => {
        setAcknowledged(true);
    };

    return (
        <div id="container">
            <VideoStream
                canvasRef={videoCanvasRef}
                wsRef={ws}
                acknowledged={acknowledged}
                onAcknowledge={handleAcknowledgment}
            />
            <Controls currentHandsData={currentHandsData} />
            <canvas ref={videoCanvasRef} />
            <canvas
                ref={overlayCanvasRef}
                style={{ backgroundColor: "transparent" }}
            />
            <div id="leftCursor" className="cursor" />
            <div id="rightCursor" className="cursor" />
            {connectionStatus !== "connected" && (
                <div className="connection-status">
                    {connectionStatus === "connecting"
                        ? "Connecting..."
                        : "Disconnected - Retrying..."}
                </div>
            )}
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
