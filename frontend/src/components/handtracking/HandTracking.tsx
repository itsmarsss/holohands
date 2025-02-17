import { useEffect, useRef, useState, useCallback } from "react";
import Controls from "../controls/Controls";
import "./HandTracking.css";
import { Hand } from "../../objects/hand";
import useSkeleton from "../../hooks/useSkeleton";
import CameraSelect from "../cameraselect/CameraSelect";
import ThreeDRenderer from "../3d/ThreeDRenderer";
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
import React from "react";

function HandTracking() {
    const fpsRef = useRef<number>(0);
    const frameCountRef = useRef<number>(0);
    const lastTimeRef = useRef<number>(Date.now());

    const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    const connectionStatusRef = useRef<HTMLDivElement | null>(null);

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

    const videoStreamTask = (frame: ArrayBuffer): boolean => {
        // Directly send the binary frame data via WebSocket.
        return webSocketContext.sendFrame(frame);
    };

    const acknowledgeFrameTask = async (): Promise<ArrayBuffer | null> => {
        if (!webSocketContext.getAcknowledged()) {
            return null;
        }

        const capturedFrame = await captureFrame();

        if (!capturedFrame || capturedFrame.byteLength < 100) {
            return null;
        }

        // console.log("Captured frame (byteLength):", capturedFrame.byteLength);
        return capturedFrame;
    };

    useEffect(() => {
        setupVideoStreamTask();

        let animationFrameId: number;

        const loop = async () => {
            if (connectionStatusRef.current) {
                connectionStatusRef.current.innerHTML =
                    webSocketContext.getConnectionStatus();
            }

            const capturedFrame = await acknowledgeFrameTask();

            if (!capturedFrame) {
                return;
            }

            const sent = videoStreamTask(capturedFrame);

            if (!sent) {
                return;
            }

            const canvas = overlayCanvasRef.current;

            if (!canvas) {
                return;
            }

            const ctx = canvas.getContext("2d");

            if (!ctx) {
                return;
            }

            const data = webSocketContext.getData();

            // console.log("sent");
            if (!data || !("hands" in data)) {
                return;
            }

            currentHandsDataRef.current = data["hands"] as Hand[];

            if (data && "hands" in data) {
                currentHandsDataRef.current = data["hands"] as Hand[];
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                const imageSize = { width: 640, height: 360 };

                processHands(currentHandsDataRef.current, imageSize, ctx);
                if (debug) {
                    drawStrokes(ctx);
                }
            }

            frameCountRef.current += 1;
            const delta = Date.now() - lastTimeRef.current;
            if (delta >= 1000) {
                fpsRef.current = frameCountRef.current;
                frameCountRef.current = 0;
                lastTimeRef.current = Date.now();
            }
        };

        const masterLoop = async () => {
            await loop();

            animationFrameId = requestAnimationFrame(masterLoop);
        };

        animationFrameId = requestAnimationFrame(masterLoop);

        return () => cancelAnimationFrame(animationFrameId);
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
            <div className="connection-status" ref={connectionStatusRef}>
                Status
            </div>
            <Controls currentHandsDataRef={currentHandsDataRef} />
            <ThreeDRenderer interactionStateRef={interactionStateRef} />
            <canvas className="overlay-canvas" ref={overlayCanvasRef} />
            <Cursors
                currentHandsData={currentHandsDataRef}
                interactionState={interactionStateRef}
                overlayCanvasRef={overlayCanvasRef}
            />
            <CameraSelect
                selectedDevice={selectedDevice}
                setSelectedDevice={handleDeviceSelection}
                videoDevices={videoDevices}
            />
        </div>
    );
}

export default React.memo(HandTracking);
