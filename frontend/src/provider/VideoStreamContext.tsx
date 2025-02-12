import React, {
    createContext,
    useContext,
    useEffect,
    useRef,
    useMemo,
    useCallback,
} from "react";
import { StreamStatus } from "../objects/streamstatus";

interface VideoStreamProps {
    children: React.ReactNode;
}

interface VideoStreamContextType {
    videoRef: React.RefObject<HTMLVideoElement>;
    getAvailableCameras: () => Promise<MediaDeviceInfo[]>;
    captureFrame: () => string | null;
    setActiveCamera: (cameraId: string) => void;
    getStatus: () => StreamStatus;
    getStream: () => MediaStream | null;
}

// activeCamera: string | null;
// getAvailableCameras: () => Promise<MediaDeviceInfo[]>;
// streamStatus: "idle" | "loading" | "error" | "streaming" | "stopped";
// startStream: (deviceId: string) => Promise<void>;
// stopStream: () => void;
// captureFrame: () => string | null;
// videoRef: React.RefObject<HTMLVideoElement>;

const VideoStreamContext = createContext<VideoStreamContextType | null>(null);

export const VideoStreamProvider = ({ children }: VideoStreamProps) => {
    const activeCameraRef = useRef<string | null>(null);
    const streamStatusRef = useRef<StreamStatus>("idle");
    const streamRef = useRef<MediaStream | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);

    // Auto-select a camera on mount if none is selected.
    useEffect(() => {
        const initCamera = async () => {
            const cameras = await getAvailableCameras();
            if (cameras.length > 0 && !activeCameraRef.current) {
                console.log(
                    "Auto-selecting first camera:",
                    cameras[0].deviceId
                );
                activeCameraRef.current = cameras[0].deviceId;
                // Start the stream immediately if a camera is available.
                startStream(cameras[0].deviceId);
            }
        };
        initCamera();
    }, []);

    useEffect(() => {
        console.log("Stream status:", streamStatusRef.current);
    }, [streamStatusRef.current]);

    const getAvailableCameras = useCallback(async (): Promise<
        MediaDeviceInfo[]
    > => {
        try {
            // Request camera access so that device labels become available.
            await navigator.mediaDevices.getUserMedia({ video: true });
        } catch (error) {
            console.error("Camera permission error:", error);
        }
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter((device) => device.kind === "videoinput");
    }, []);

    const startStream = async (deviceId: string) => {
        console.log("Starting stream");

        stopStream(); // Stop any existing stream before starting a new one

        streamStatusRef.current = "loading";

        try {
            const newStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    deviceId,
                    width: { ideal: 640 },
                    height: { ideal: 360 },
                },
            });
            streamRef.current = newStream;
            activeCameraRef.current = deviceId;
            if (videoRef.current) {
                videoRef.current.srcObject = newStream;
            }
            streamStatusRef.current = "streaming";
        } catch (error) {
            console.error("Error accessing camera:", error);
            streamStatusRef.current = "error";
        }
    };

    const stopStream = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
            streamStatusRef.current = "stopped";
        }
    };

    const captureFrame = (): string | null => {
        if (!videoRef.current) {
            console.error("Video reference is null.");
            return null;
        }
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) {
            console.error("Failed to get canvas context.");
            return null;
        }
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        context.scale(-1, 1);

        context.drawImage(
            videoRef.current,
            -canvas.width,
            0,
            canvas.width,
            canvas.height
        );
        return canvas.toDataURL("image/png", 0.5);
    };

    const videoStreamContextValue = useMemo(
        () => ({
            getStatus: () => streamStatusRef.current,
            getStream: () => streamRef.current,
            videoRef,
            getAvailableCameras,
            captureFrame,
            setActiveCamera: (cameraId: string) => {
                activeCameraRef.current = cameraId;
                startStream(cameraId);
            },
        }),
        []
    );
    return (
        <VideoStreamContext.Provider value={videoStreamContextValue}>
            {children}
        </VideoStreamContext.Provider>
    );
};

export const useVideoStream = () => {
    const context = useContext(VideoStreamContext);
    if (!context) {
        throw new Error(
            "useVideoStreamContext must be used within a VideoStreamProvider"
        );
    }
    return context;
};
