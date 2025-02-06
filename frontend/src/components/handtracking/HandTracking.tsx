import { useEffect, useRef, useState, useCallback } from "react";
import Controls from "../controls/Controls";
import "./HandTracking.css";
import Editable3DObject from "../3d/Editable3DObject";
import { Hand } from "../../objects/hand";
import useSkeleton from "../../hooks/useSkeleton";
import CameraSelect from "../cameraselect/CameraSelect";
import ButtonColumn from "../buttoncolumn/ButtonColumn";
import Cursor from "../cursor/Cursor";
import { useDebug } from "../../provider/DebugContext";
import { toast } from "react-toastify";
import { Device } from "../../objects/device";
import { useWebSocket } from "../../provider/WebSocketContext";
import { useVideoStream } from "../../provider/VideoStreamContext";

function HandTracking() {
    const [frame, setFrame] = useState<string | null>(null);
    const [fps, setFps] = useState<number>(0);
    const frameCount = useRef<number>(0);
    const lastTime = useRef<number>(Date.now());

    const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    // Add a debug toggle state.
    const debugContext = useDebug();
    const debug = debugContext?.debug;

    const leftCursorCoords = useRef<{ x: number; y: number }>({
        x: 0,
        y: 0,
    });
    const rightCursorCoords = useRef<{ x: number; y: number }>({
        x: 0,
        y: 0,
    });

    const cursorMap = useRef<{
        [key: string]: React.MutableRefObject<{
            x: number;
            y: number;
        }>;
    }>({
        leftCursor: leftCursorCoords,
        rightCursor: rightCursorCoords,
    });

    const updateCursorPosition = (
        elementId: string,
        targetX: number,
        targetY: number
    ) => {
        const cursor = cursorMap.current[elementId];
        console.log("Cursor:", cursor);
        if (cursor) {
            cursor.current.x = targetX;
            cursor.current.y = targetY;
        }
    };

    // New state for 3D object rotation (angles in degrees)
    const [objectRotation, setObjectRotation] = useState({ x: 0, y: 0, z: 0 });

    // Define onPinchMove callback to update 3D object rotation.
    const handlePinchMove = useCallback(
        (handedness: "Left" | "Right", deltaX: number, deltaY: number) => {
            // For example, only update rotation for the right hand.
            if (handedness === "Right") {
                const rotationFactor = 0.01; // adjust sensitivity as needed
                setObjectRotation((prev) => ({
                    x: prev.x + deltaY * rotationFactor,
                    y: prev.y + deltaX * rotationFactor,
                    z: prev.z,
                }));
            }
        },
        []
    );

    // Pass the new onPinchMove callback into useSkeleton along with updateCursorPosition.
    const { drawHand, drawStrokes } = useSkeleton({
        overlayCanvasRef,
        debug,
        updateCursorPosition,
        onPinchMove: handlePinchMove,
    });

    const previousDimensions = useRef<{ width: number; height: number }>({
        width: 0,
        height: 0,
    });

    const [currentHandsData, setCurrentHandsData] = useState<Hand[]>([]);
    const [acknowledged, setAcknowledged] = useState(false);

    // State to keep track of available cameras and the selected camera
    const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);

    const webSocketContext = useWebSocket();
    const webSocketStatus = webSocketContext?.status;
    const websocket = webSocketContext?.websocket;

    const videoStreamContext = useVideoStream();
    const videoStreamStatus = videoStreamContext?.status;
    const captureFrame = videoStreamContext?.captureFrame;
    const getAvailableCameras = videoStreamContext?.getAvailableCameras;
    const setActiveCamera = videoStreamContext?.setActiveCamera;
    const videoRef = videoStreamContext?.videoRef;

    const [leftButtonColumnPeek, setLeftButtonColumnPeek] = useState(false);
    const [rightButtonColumnPeek, setRightButtonColumnPeek] = useState(false);

    // Function to calculate button column offset based on cursor positions
    const calculateButtonColumnOffset = () => {
        const leftCursorX = leftCursorCoords.current.x;
        const rightCursorX = rightCursorCoords.current.x;

        // Check if cursors are within 250px of the left or right borders
        const canvasWidth = overlayCanvasRef.current?.offsetWidth;

        let leftPeek = false;
        let rightPeek = false;

        if (currentHandsData.some((hand) => hand.handedness === "Left")) {
            if (leftCursorX <= 200) {
                leftPeek = leftPeek || true;
            } else if (leftCursorX > 200) {
                leftPeek = leftPeek || false;
            }

            if (canvasWidth) {
                if (leftCursorX >= canvasWidth - 200) {
                    rightPeek = rightPeek || true;
                } else if (leftCursorX < canvasWidth - 200) {
                    rightPeek = rightPeek || false;
                }
            }
        }

        if (currentHandsData.some((hand) => hand.handedness === "Right")) {
            if (canvasWidth) {
                if (rightCursorX >= canvasWidth - 200) {
                    rightPeek = rightPeek || true;
                } else if (rightCursorX < canvasWidth - 200) {
                    rightPeek = rightPeek || false;
                }
            }

            if (rightCursorX <= 200) {
                leftPeek = leftPeek || true;
            } else if (rightCursorX > 200) {
                leftPeek = leftPeek || false;
            }
        }

        // Update the state based on the flags
        setLeftButtonColumnPeek(leftPeek);
        setRightButtonColumnPeek(rightPeek);
    };

    // Function to handle camera selection
    const handleDeviceSelection = (device: Device | null) => {
        if (device) {
            setSelectedDevice(device);
            toast.info(`Using ${device.label}`);
            setActiveCamera(device.deviceId);
        }
    };

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
                setSelectedDevice({
                    deviceId: defaultDeviceId,
                    label: cameras[0].label,
                });
                setActiveCamera(defaultDeviceId);
            } else {
                console.error("No cameras available");
            }
        });
    }, []);

    useEffect(() => {
        console.log("Frame:", frame?.length);
        if (frame && videoStreamStatus === "streaming") {
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
    }, [frame, videoStreamStatus, websocket]);

    // Updated effect: new frame is captured only when previous one is acknowledged.
    useEffect(() => {
        if (acknowledged && videoStreamStatus === "streaming") {
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
    }, [acknowledged, videoStreamStatus, captureFrame]);

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

        calculateButtonColumnOffset();
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
        <div ref={containerRef} className="handtracking-container">
            {/* Display the WebSocket connection status */}
            <div className="connection-status">{webSocketStatus}</div>
            {debug && <div className="fps-display">{fps} FPS</div>}
            <Controls currentHandsData={currentHandsData} />
            <Editable3DObject rotation={objectRotation} />
            <canvas className="overlay-canvas" ref={overlayCanvasRef} />
            <video
                ref={videoRef}
                autoPlay
                playsInline
                style={{
                    display: "none", // Hide the video element
                }}
            />

            {/* Render left cursor if left hand is detected */}
            {currentHandsData.some((hand) => hand.handedness === "Left") && (
                <Cursor
                    name="leftCursor"
                    coords={cursorMap.current.leftCursor}
                    overlayCanvasRef={overlayCanvasRef}
                />
            )}

            {/* Render right cursor if right hand is detected */}
            {currentHandsData.some((hand) => hand.handedness === "Right") && (
                <Cursor
                    name="rightCursor"
                    coords={cursorMap.current.rightCursor}
                    overlayCanvasRef={overlayCanvasRef}
                />
            )}
            <ButtonColumn side="left" count={5} peek={leftButtonColumnPeek} />
            <ButtonColumn side="right" count={5} peek={rightButtonColumnPeek} />
            <CameraSelect
                selectedDevice={selectedDevice}
                setSelectedDevice={handleDeviceSelection}
                videoDevices={videoDevices}
            />
        </div>
    );
}

export default HandTracking;
