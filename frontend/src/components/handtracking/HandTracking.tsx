import React, { useEffect, useRef, useState, useCallback } from "react";
import VideoStream from "./VideoStream";
import Controls from "./Controls";
import "./HandTracking.css";

interface Hand {
    handedness: string;
    landmarks: number[][];
    connections: number[][];
    detected_symbols?: [string, number][];
}

const WEBSOCKET_URL = "ws://localhost:6969/ws";
const RECONNECT_DELAY = 3000; // 3 seconds

const HandTracking: React.FC = () => {
    const videoCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const ws = useRef<WebSocket | null>(null);
    const [currentHandsData, setCurrentHandsData] = useState<Hand[]>([]);
    const previousPointerAngle = useRef<number | null>(null);
    const previousHandAngle = useRef<number | null>(null);
    const drawnPoints = useRef<{ [key: string]: { x: number; y: number }[][] }>(
        {
            Left: [],
            Right: [],
        }
    );
    const isDrawing = useRef<{ [key: string]: boolean }>({
        Left: false,
        Right: false,
    });
    const [connectionStatus, setConnectionStatus] = useState<
        "connecting" | "connected" | "disconnected"
    >("disconnected");
    const reconnectTimeout = useRef<number>();

    const handColors = {
        Left: "#FF0000", // Red
        Right: "#00FF00", // Green
    };

    const previousDimensions = useRef<{ width: number; height: number }>({
        width: 0,
        height: 0,
    });

    const smoothingFactor = 0.5;

    const drawHand = (
        hand: Hand,
        imgWidth: number,
        imgHeight: number,
        ctx: CanvasRenderingContext2D
    ) => {
        const canvas = overlayCanvasRef.current;
        if (!canvas) return;

        ctx.save();

        // Scale coordinates to video feed size
        const scaleX = canvas.width / imgWidth;
        const scaleY = canvas.height / imgHeight;

        // Draw connections with thicker lines and semi-transparency
        ctx.strokeStyle =
            handColors[hand.handedness as keyof typeof handColors];
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.8;

        hand.connections.forEach(([start, end]) => {
            const startX = hand.landmarks[start][0] * scaleX;
            const startY = hand.landmarks[start][1] * scaleY;
            const endX = hand.landmarks[end][0] * scaleX;
            const endY = hand.landmarks[end][1] * scaleY;

            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        });

        // Draw landmarks with larger radius
        ctx.fillStyle = handColors[hand.handedness as keyof typeof handColors];
        ctx.globalAlpha = 1.0;
        hand.landmarks.forEach((lm) => {
            ctx.beginPath();
            ctx.arc(lm[0] * scaleX, lm[1] * scaleY, 4, 0, 2 * Math.PI);
            ctx.fill();
        });

        // Draw index-thumb finger line
        const indexFinger = hand.landmarks[8];
        const thumb = hand.landmarks[4];
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 2;
        ctx.globalAlpha = 1.0;
        ctx.beginPath();
        ctx.moveTo(indexFinger[0] * scaleX, indexFinger[1] * scaleY);
        ctx.lineTo(thumb[0] * scaleX, thumb[1] * scaleY);
        ctx.stroke();

        // Calculate the distance between the index finger and thumb
        let distanceIndexThumb = Math.sqrt(
            Math.pow((indexFinger[0] - thumb[0]) * scaleX, 2) +
                Math.pow((indexFinger[1] - thumb[1]) * scaleY, 2)
        );

        // Define a threshold for holding
        const holdingThreshold = 50; // Adjust this value as needed

        // Check if fingers are considered holding
        const isHolding = distanceIndexThumb < holdingThreshold;

        // Draw the distance on the canvas
        ctx.fillStyle = "#FFFFFF"; // White color for the distance text
        ctx.font = "16px Arial";
        ctx.fillText(
            `Distance: ${distanceIndexThumb.toFixed(2)} px`,
            ((indexFinger[0] + thumb[0]) / 2) * scaleX,
            ((indexFinger[1] + thumb[1]) / 2) * scaleY - 10
        );

        // Indicate holding state
        if (isHolding) {
            ctx.fillText(
                "Holding",
                ((indexFinger[0] + thumb[0]) / 2) * scaleX,
                ((indexFinger[1] + thumb[1]) / 2) * scaleY + 10
            );
        }

        // Calculate the angle between the wrist and the line connecting index and middle fingers
        const wrist = hand.landmarks[0];
        const middleFinger = hand.landmarks[12];

        const palmAngle =
            Math.atan2(middleFinger[1] - wrist[1], middleFinger[0] - wrist[0]) *
            (180 / Math.PI); // Convert to degrees

        // Draw the palm angle on the canvas
        ctx.fillStyle = "#FFFFFF"; // White color for the angle text
        ctx.font = "16px Arial";
        ctx.fillText(
            `Palm Angle: ${palmAngle.toFixed(2)}°`,
            wrist[0] * scaleX,
            wrist[1] * scaleY - 10
        );

        // Calculate the angle between the index finger and thumb
        const indexThumbAngle =
            Math.atan2(indexFinger[1] - thumb[1], indexFinger[0] - thumb[0]) *
            (180 / Math.PI); // Convert to degrees

        // Draw the index-thumb angle on the canvas
        ctx.fillText(
            `Index-Thumb Angle: ${indexThumbAngle.toFixed(2)}°`,
            indexFinger[0] * scaleX,
            indexFinger[1] * scaleY - 30
        );

        const currentPointerAngle =
            Math.atan2(
                (indexFinger[1] - thumb[1]) * scaleY,
                (indexFinger[0] - thumb[0]) * scaleX
            ) *
            (180 / Math.PI);

        // Smooth the angle
        const pointerAngle =
            previousPointerAngle.current === null
                ? currentPointerAngle
                : previousPointerAngle.current * (1 - smoothingFactor) +
                  currentPointerAngle * smoothingFactor;

        previousPointerAngle.current = pointerAngle;

        // Draw cursor position
        const cursorX = ((indexFinger[0] + thumb[0]) / 2) * scaleX;
        const cursorY = ((indexFinger[1] + thumb[1]) / 2) * scaleY;

        const xOffset = canvas.getBoundingClientRect().left;
        const yOffset = canvas.getBoundingClientRect().top;

        // Update cursor elements
        const cursor = document.getElementById(
            `${hand.handedness.toLowerCase()}Cursor`
        );
        if (cursor) {
            cursor.style.left = `${cursorX - 10 + xOffset}px`;
            cursor.style.top = `${cursorY - 10 + yOffset}px`;
        }

        // Handle drawing
        const leftmost = Math.min(...hand.landmarks.map((lm) => lm[0]));
        const rightmost = Math.max(...hand.landmarks.map((lm) => lm[0]));
        const topmost = Math.min(...hand.landmarks.map((lm) => lm[1]));
        const bottommost = Math.max(...hand.landmarks.map((lm) => lm[1]));

        const avgDistance = (rightmost - leftmost + bottommost - topmost) / 2;
        const touchThreshold = avgDistance / 3;

        if (distanceIndexThumb < touchThreshold) {
            if (!isDrawing.current[hand.handedness]) {
                drawnPoints.current[hand.handedness].push([]);
                isDrawing.current[hand.handedness] = true;
            }
            drawnPoints.current[hand.handedness][
                drawnPoints.current[hand.handedness].length - 1
            ].push({ x: cursorX, y: cursorY });
        } else {
            isDrawing.current[hand.handedness] = false;
        }

        // Draw detected symbols
        if (hand.detected_symbols && hand.detected_symbols.length > 0) {
            ctx.fillStyle = "#FFFFFF";
            ctx.font = "16px Arial";
            hand.detected_symbols.forEach((symbol, index) => {
                ctx.fillText(
                    `${symbol[0]} (${(symbol[1] * 100).toFixed(2)}%)`,
                    hand.landmarks[0][0] * scaleX,
                    hand.landmarks[0][1] * scaleY + 20 + index * 20
                );
            });
        }

        ctx.restore();
    };

    const drawPoints = (ctx: CanvasRenderingContext2D) => {
        ctx.save();
        ctx.globalAlpha = 0.8;

        Object.entries(drawnPoints.current).forEach(([handedness, strokes]) => {
            ctx.strokeStyle = handColors[handedness as keyof typeof handColors];
            ctx.lineWidth = 3;
            strokes.forEach((stroke) => {
                if (stroke.length < 2) return;
                ctx.beginPath();
                ctx.moveTo(stroke[0].x, stroke[0].y);
                for (let i = 1; i < stroke.length - 1; i++) {
                    const cp = {
                        x: (stroke[i].x + stroke[i + 1].x) / 2,
                        y: (stroke[i].y + stroke[i + 1].y) / 2,
                    };
                    ctx.quadraticCurveTo(stroke[i].x, stroke[i].y, cp.x, cp.y);
                }
                ctx.stroke();
            });
        });

        ctx.restore();
    };

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
                const ctx = overlayCanvas?.getContext("2d");
                if (!ctx || !overlayCanvas) return;

                try {
                    const data = JSON.parse(event.data);

                    // Clear the overlay canvas
                    ctx.clearRect(
                        0,
                        0,
                        overlayCanvas.width,
                        overlayCanvas.height
                    );

                    if (data.hands && data.hands.length > 0) {
                        setCurrentHandsData(data.hands);
                        data.hands.forEach((hand: Hand) => {
                            drawHand(
                                hand,
                                data.image_size.width,
                                data.image_size.height,
                                ctx
                            );
                        });
                    }

                    drawPoints(ctx);
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
    }, []);

    const resizeCanvases = () => {
        const video = videoCanvasRef.current;
        if (!video) return;

        const aspectRatio = video.width / video.height; // Get the aspect ratio from the video feed
        const windowAspectRatio = window.innerWidth / window.innerHeight;

        let width, height;
        if (windowAspectRatio > aspectRatio) {
            // Window is wider than the video aspect ratio
            width = window.innerHeight * aspectRatio;
            height = window.innerHeight;
        } else {
            // Window is taller than the video aspect ratio
            width = window.innerWidth;
            height = window.innerWidth / aspectRatio;
        }

        if (
            previousDimensions.current.width == width ||
            previousDimensions.current.height == height
        ) {
            return;
        }

        // Set both canvases to the same size
        if (videoCanvasRef.current && overlayCanvasRef.current) {
            videoCanvasRef.current.width = width;
            videoCanvasRef.current.height = height;
            overlayCanvasRef.current.width = width;
            overlayCanvasRef.current.height = height;

            // Update previous dimensions
            previousDimensions.current.width = width;
            previousDimensions.current.height = height;
        }
    };

    useEffect(() => {
        const resizeInterval = setInterval(resizeCanvases, 1000); // Resize canvases every second

        return () => {
            clearInterval(resizeInterval); // Clear the interval on unmount
        };
    }, []);

    useEffect(() => {
        const videoCanvas = videoCanvasRef.current;
        const overlayCanvas = overlayCanvasRef.current;
        if (!videoCanvas || !overlayCanvas) return;

        const videoCtx = videoCanvas.getContext("2d");
        const overlayCtx = overlayCanvas.getContext("2d");
        if (!videoCtx || !overlayCtx) return;

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

    return (
        <div id="container">
            <VideoStream canvasRef={videoCanvasRef} wsRef={ws} />
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
