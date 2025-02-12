import { useEffect, useRef, useState, useCallback } from "react";
import Controls from "../controls/Controls";
import "./HandTracking.css";
import Editable3DObject from "../3d/Editable3DObject";
import { Hand } from "../../objects/hand";
import useSkeleton from "../../hooks/useSkeleton";
import CameraSelect from "../cameraselect/CameraSelect";
import ButtonColumn from "../buttoncolumn/ButtonColumn";
import { useDebug } from "../../provider/DebugContext";
import { toast } from "react-toastify";
import { Device } from "../../objects/device";
import { useWebSocket } from "../../provider/WebSocketContext";
import { useVideoStream } from "../../provider/VideoStreamContext";
import {
    InteractionState,
    DEFAULT_INTERACTION_STATE,
} from "../../objects/InteractionState";
import Cursors from "../cursor/Cursors";

function HandTracking() {
    const [fps, setFps] = useState<number>(0);
    const [frameCount, setFrameCount] = useState<number>(0);
    const [lastTime, setLastTime] = useState<number>(Date.now());

    const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    // Add a debug toggle state.
    const debugContext = useDebug();
    const debugRef = debugContext.getDebug();

    const interactionStateRef = useRef<InteractionState>(
        DEFAULT_INTERACTION_STATE
    );

    const updateInteractionState = (interactionState: InteractionState) => {
        interactionStateRef.current = interactionState;
    };

    // Pass the new onPinchMove callback into useSkeleton along with updateCursorPosition.
    const { drawHands, drawStrokes } = useSkeleton({
        overlayCanvasRef,
        debug: debugRef.current,
        fps,
        updateInteractionState,
    });

    const previousDimensions = useRef<{ width: number; height: number }>({
        width: 0,
        height: 0,
    });

    const currentHandsDataRef = useRef<Hand[]>([]);
    // Replace high-frequency state with a ref so that HandTracking does not re-render every update.

    // State to keep track of available cameras and the selected camera
    const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);

    const webSocketContext = useWebSocket();

    const videoStreamContext = useVideoStream();
    const captureFrame = videoStreamContext.captureFrame;
    const getAvailableCameras = videoStreamContext.getAvailableCameras;
    const setActiveCamera = videoStreamContext.setActiveCamera;

    const [leftButtonColumnPeek, setLeftButtonColumnPeek] = useState(false);
    const [rightButtonColumnPeek, setRightButtonColumnPeek] = useState(false);

    // Function to calculate button column offset based on cursor positions
    const calculateButtonColumnOffset = () => {
        const leftCursorX = interactionStateRef.current.Left?.cursor?.coords.x;
        const rightCursorX =
            interactionStateRef.current.Right?.cursor?.coords.x;

        // Check if cursors are within 250px of the left or right borders
        const canvasWidth = overlayCanvasRef.current?.offsetWidth;

        let leftPeek = false;
        let rightPeek = false;

        if (
            currentHandsDataRef.current.some(
                (hand) => hand.handedness === "Left"
            ) &&
            leftCursorX
        ) {
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

        if (
            currentHandsDataRef.current.some(
                (hand) => hand.handedness === "Right"
            ) &&
            rightCursorX
        ) {
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

    const setupVideoStreamTask = () => {
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
            } else {
                console.error("No cameras available");
            }
        });
    };

    const setupWebsocketTask = (websocket: WebSocket) => {
        console.log("Setting up websocket task.");
        const handleMessage = async (message: MessageEvent) => {
            console.log("Received message from websocket");
            let messageText = "";
            if (typeof message.data === "string") {
                messageText = message.data;
            } else if (message.data instanceof Blob) {
                messageText = await message.data.text();
            }
            try {
                const data = JSON.parse(messageText);
                // console.log("Received data from websocket:", data);
                if (data.hands) {
                    currentHandsDataRef.current = data.hands;
                    acknowledgedRef.current = true;
                    console.log("Acknowledged frame.");
                }
            } catch (error) {
                console.error("Error parsing websocket message:", error);
            }
        };

        websocket.addEventListener("message", handleMessage);
    };

    const videoStreamTask = (frame: string) => {
        const websocket = webSocketContext.getWebSocket();
        // console.log("Frame:", frame?.length);
        if (frame && videoStreamContext.getStatus() === "streaming") {
            if (websocket && websocket.readyState === WebSocket.OPEN) {
                const payload = JSON.stringify({ image: frame });
                webSocketContext.sendFrame(payload);
                console.log("Sent frame via websocket:", frame.length);
            } else {
                console.log("WebSocket not open. Frame not sent.");
            }
        } else {
            console.log("No frame to send.");
        }
    };

    const fallbackCounter = useRef<number>(0);

    const acknowledgeFrameTask = (): string | null => {
        fallbackCounter.current += 33;

        // Use a mutable ref so that we do not trigger re-renders.
        if (!acknowledgedRef.current && fallbackCounter.current > 5000) {
            acknowledgedRef.current = true;
            fallbackCounter.current = 0;
        }

        if (
            acknowledgedRef.current &&
            videoStreamContext.getStatus() === "streaming"
        ) {
            const capturedFrame = captureFrame();
            if (capturedFrame?.length && capturedFrame.length > 100) {
                console.log("Captured frame:", capturedFrame.length);

                acknowledgedRef.current = false;
                fallbackCounter.current = 0;
                return capturedFrame;
            } else {
                console.log("Failed to capture frame.");
            }
        }

        return null;
    };

    const websocketWatch = useRef<WebSocket | null>(null);

    useEffect(() => {
        if (
            webSocketContext.getStatus() === "Connected" &&
            websocketWatch.current
        ) {
            setupWebsocketTask(websocketWatch.current);
        }
    }, []);

    useEffect(() => {
        setupVideoStreamTask();

        // Run the master loop once using a setInterval.
        const masterLoop = setInterval(() => {
            websocketWatch.current = webSocketContext.getWebSocket();

            const capturedFrame = acknowledgeFrameTask();
            if (capturedFrame) {
                videoStreamTask(capturedFrame);

                setFrameCount(frameCount + 1);
                const now = Date.now();
                const delta = now - lastTime;
                if (delta >= 1000) {
                    setFps(frameCount);
                    setFrameCount(0);
                    setLastTime(now);
                }
            }
        }, 66);

        return () => clearInterval(masterLoop);
    }, []);

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

    // Replace the following lines;

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
        const draw = () => {
            const canvas = overlayCanvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            // Clear the canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            // Use the fixed reference size.
            const imageSize = { width: 640, height: 360 };
            // Draw each hand
            drawHands(currentHandsDataRef.current, imageSize, ctx);
            // Draw any strokes accumulated (if in debug mode)
            if (debugRef.current) {
                drawStrokes(ctx);
            }
            calculateButtonColumnOffset();
        };
        const animationFrameId = requestAnimationFrame(draw);

        return () => cancelAnimationFrame(animationFrameId);
    }, [currentHandsDataRef, drawHands, drawStrokes]);

    return (
        <div ref={containerRef} className="handtracking-container">
            {/* Display the WebSocket connection status */}
            <div className="connection-status">
                {webSocketContext.getStatus()}
            </div>
            <Controls currentHandsDataRef={currentHandsDataRef} />
            <Editable3DObject
                interactionStateRef={interactionStateRef}
                //rotation={objectRotation}
                //zoom={objectZoom}
                //onRotationChange={setObjectRotation}
                //onZoomChange={setObjectZoom}
            />
            <canvas className="overlay-canvas" ref={overlayCanvasRef} />
            <Cursors
                currentHandsDataRef={currentHandsDataRef}
                interactionStateRef={interactionStateRef}
                overlayCanvasRef={overlayCanvasRef}
            />
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
