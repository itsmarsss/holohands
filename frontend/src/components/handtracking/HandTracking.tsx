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
    InteractionStateHand,
} from "../../objects/InteractionState";
import Cursors from "../cursor/Cursors";

function HandTracking() {
    const fpsRef = useRef<number>(0);
    const frameCountRef = useRef<number>(0);
    const lastTimeRef = useRef<number>(Date.now());

    const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    // Add a debug toggle state.
    const { debug } = useDebug();

    const interactionStateRef = useRef<InteractionState>(
        DEFAULT_INTERACTION_STATE
    );

    const updateInteractionState = (interactionState: InteractionState) => {
        interactionStateRef.current = interactionState;
    };

    // Pass the new onPinchMove callback into useSkeleton along with updateCursorPosition.
    const { processHands, drawStrokes } = useSkeleton({
        overlayCanvasRef,
        fpsRef,
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
        const leftCursor = interactionStateRef.current
            .Left as InteractionStateHand;
        const rightCursor = interactionStateRef.current
            .Right as InteractionStateHand;

        const leftCursorX = leftCursor?.cursor?.coords.x;
        const rightCursorX = rightCursor?.cursor?.coords.x;

        // Check if cursors are within 250px of the left or right borders
        const canvasWidth = overlayCanvasRef.current?.offsetWidth;

        let leftPeek = false;
        let rightPeek = false;

        if (
            currentHandsDataRef.current.some(
                (hand) => hand.handedness === "Left"
            ) &&
            leftCursorX &&
            !leftCursor.isPinching
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
            rightCursorX &&
            !rightCursor.isHolding
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
                    console.log(`\t${index}: ${camera.label}`);
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

    const videoStreamTask = (frame: string): boolean => {
        const payload = JSON.stringify({ image: frame });

        return webSocketContext.sendFrame(payload);
    };

    const acknowledgeFrameTask = (): string | null => {
        if (!webSocketContext.getAcknowledged()) {
            return null;
        }

        const capturedFrame = captureFrame();

        if (!capturedFrame || capturedFrame.length < 100) {
            return null;
        }

        // console.log("Captured frame:", capturedFrame.length);
        return capturedFrame;
    };

    useEffect(() => {
        setupVideoStreamTask();

        // Run the master loop once using a setInterval.
        const masterLoop = setInterval(() => {
            const capturedFrame = acknowledgeFrameTask();

            if (!capturedFrame) {
                // console.log("Failed to capture frame.");
                return;
            }

            const sent = videoStreamTask(capturedFrame);

            if (!sent) {
                // console.log("Failed to send frame via websocket.");
                return;
            }

            // console.log("Sent frame via websocket:", capturedFrame.length);

            const canvas = overlayCanvasRef.current;
            if (!canvas) {
                return;
            }

            const ctx = canvas.getContext("2d");
            if (!ctx) {
                return;
            }

            const data = webSocketContext.getData();
            if (!data || !("hands" in data)) {
                return;
            }

            currentHandsDataRef.current = data["hands"] as Hand[];
            // Clear the canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            // Use the fixed reference size.
            const imageSize = { width: 640, height: 360 };

            // Draw each hand
            processHands(currentHandsDataRef.current, imageSize, ctx);
            // Draw any strokes accumulated (if in debug mode)
            if (debug) {
                drawStrokes(ctx);
            }

            calculateButtonColumnOffset();

            frameCountRef.current = frameCountRef.current + 1;
            const now = Date.now();
            const delta = now - lastTimeRef.current;
            if (delta >= 1000) {
                fpsRef.current = frameCountRef.current;
                frameCountRef.current = 0;
                lastTimeRef.current = now;
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
