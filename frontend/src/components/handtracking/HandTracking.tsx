import React, { useEffect, useRef, useState, useCallback } from "react";
import Controls from "../controls/Controls";
import "./HandTracking.css";
import Editable3DObject from "../3d/Editable3DObject";
import useVideoStream from "../../hooks/useVideoStream";
import { Hand } from "../../objects/hand";
import { useWebSocket } from "../../provider/WebSocketContext";
import useSkeleton from "../../hooks/useSkeleton";
import CameraSelect from "../cameraselect/CameraSelect";

function HandTracking() {
    const {
        videoRef,
        startStream,
        stopStream,
        captureFrame,
        getAvailableCameras,
        streamStatus,
    } = useVideoStream();

    const [frame, setFrame] = useState<string | null>(null);
    const [fps, setFps] = useState<number>(0);
    const frameCount = useRef<number>(0);
    const lastTime = useRef<number>(Date.now());

    const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    // NEW: Add a debug toggle state.
    const [debug, setDebug] = useState(false);

    // Pass the debug flag to the useSkeleton hook.
    const { drawHand, drawStrokes } = useSkeleton({ overlayCanvasRef, debug });

    const previousDimensions = useRef<{ width: number; height: number }>({
        width: 0,
        height: 0,
    });

    const [currentHandsData, setCurrentHandsData] = useState<Hand[]>([]);
    const [acknowledged, setAcknowledged] = useState(false);

    // NEW: State to keep track of available cameras and the selected camera
    const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(
        null
    );

    const webSocketContext = useWebSocket();
    const status = webSocketContext?.status;
    const websocket = webSocketContext?.websocket;

    // --- Update available cameras and initial stream ---
    useEffect(() => {
        getAvailableCameras().then((cameras: MediaDeviceInfo[]) => {
            if (cameras.length > 0) {
                console.log("Available cameras:");
                cameras.forEach((camera, index) => {
                    console.log(`${index}: ${camera.label}`);
                });
                setVideoDevices(cameras);
                // Select a default camera (if 2nd available, otherwise first).
                const defaultDeviceId = cameras[0].deviceId;
                setSelectedDeviceId(defaultDeviceId);
                startStream(defaultDeviceId);
            } else {
                console.error("No cameras available");
            }
        });

        return () => {
            stopStream();
        };
    }, []);

    // NEW: Handler that stops current stream and starts new one when selection changes.
    const handleDeviceSelection = (deviceId: string | null) => {
        if (deviceId && deviceId !== selectedDeviceId) {
            stopStream();
            startStream(deviceId);
            setSelectedDeviceId(deviceId);
        }
    };

    useEffect(() => {
        console.log("Frame:", frame?.length);
        if (frame && streamStatus === "streaming") {
            if (websocket && websocket.readyState === WebSocket.OPEN) {
                const payload = JSON.stringify({ image: frame });
                websocket.send(payload);
                console.log("Sent frame via websocket:", frame.length);
                // Reset acknowledged until a response arrives.
                setAcknowledged(false);
            } else {
                console.log("WebSocket not open. Frame not sent.");
            }
        } else {
            console.log("No frame to send.");
        }
    }, [frame, streamStatus, websocket]);

    // Updated effect: new frame is captured only when previous one is acknowledged.
    useEffect(() => {
        if (acknowledged && streamStatus === "streaming") {
            const capturedFrame = captureFrame();
            if (capturedFrame?.length && capturedFrame.length > 100) {
                console.log("Captured frame:", capturedFrame.length);
                setFrame(capturedFrame);
            } else {
                console.log("Failed to capture frame.");
                setFrame(null);
            }
            // Prevent sending a new frame until the backend ack is received.
            setAcknowledged(false);
        }
        // Fallback: if no ack is received within 1 second, re-enable capture.
        const fallbackTimeout = setTimeout(() => {
            if (!acknowledged) {
                console.log("Fallback: Triggering acknowledgment timeout.");
                setAcknowledged(true);
            }
        }, 1000);
        return () => clearTimeout(fallbackTimeout);
    }, [acknowledged, streamStatus, captureFrame]);

    const resizeCanvases = useCallback(() => {
        const overlayCanvas = overlayCanvasRef.current;
        const container = containerRef.current;
        if (!overlayCanvas || !container) return;

        // Get the dimensions of the right-hand container
        const { width, height } = container.getBoundingClientRect();

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

    // Replace the following lines (previously using setInterval):
    // useEffect(() => {
    //     const resizeInterval = setInterval(resizeCanvases, 1000);
    //     return () => clearInterval(resizeInterval);
    // }, [resizeCanvases]);

    // With this ResizeObserver-based effect:
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const resizeObserver = new ResizeObserver(() => {
            resizeCanvases();
        });
        resizeObserver.observe(container);
        return () => {
            resizeObserver.disconnect();
        };
    }, [resizeCanvases]);

    useEffect(() => {
        if (websocket) {
            const handleMessage = (event: MessageEvent) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log("Received data from websocket:", data);
                    if (data.hands) {
                        setCurrentHandsData(data.hands);
                        setAcknowledged(true);
                    }
                } catch (error) {
                    console.error("Error parsing websocket message:", error);
                }
            };
            websocket.addEventListener("message", handleMessage);
            return () => {
                websocket.removeEventListener("message", handleMessage);
            };
        }
    }, [websocket]);

    useEffect(() => {
        const canvas = overlayCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        // Clear the canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Instead of using the canvas dimensions, use the capture resolution (640 x 360)
        // to compute proper scale factors.
        const imageSize = { width: 640, height: 360 };

        // Draw each hand using useSkeleton's drawHand with the fixed reference dimensions.
        currentHandsData.forEach((hand) => {
            drawHand(hand, imageSize, ctx);
        });
        // Draw any strokes accumulated so far
        drawStrokes(ctx);
    }, [currentHandsData, drawHand, drawStrokes]);

    useEffect(() => {
        frameCount.current += 1;
        const now = Date.now();
        const delta = now - lastTime.current;
        if (delta >= 1000) {
            setFps(frameCount.current);
            frameCount.current = 0;
            lastTime.current = now;
        }
    }, [frame]);

    return (
        <div className="handtracking-container" ref={containerRef}>
            <div className="fps-display">{fps} FPS</div>
            {/* NEW: Debug toggle switch */}
            <div className="debug-toggle">
                <label>
                    <input
                        type="checkbox"
                        checked={debug}
                        onChange={(e) => setDebug(e.target.checked)}
                    />
                    Debug
                </label>
            </div>
            <Controls currentHandsData={currentHandsData} />
            <Editable3DObject />
            <canvas className="overlay-canvas" ref={overlayCanvasRef} />
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
            <CameraSelect
                selectedDeviceId={selectedDeviceId}
                setSelectedDeviceId={handleDeviceSelection}
                videoDevices={videoDevices}
            />
        </div>
    );
}

export default HandTracking;
