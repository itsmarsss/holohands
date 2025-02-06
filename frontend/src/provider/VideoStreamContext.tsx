import React, {
    createContext,
    useContext,
    useState,
    useEffect,
    useRef,
    useMemo,
} from "react";

interface VideoStreamProps {
    children: React.ReactNode;
}

interface VideoStreamContextType {
    status: string;
    stream: MediaStream | null;
    videoRef: React.RefObject<HTMLVideoElement>;
    getAvailableCameras: () => Promise<MediaDeviceInfo[]>;
    captureFrame: () => string | null;
    setActiveCamera: (cameraId: string) => void;
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
    const [activeCamera, setActiveCamera] = useState<string | null>(null);
    const [streamStatus, setStreamStatus] = useState<
        "idle" | "loading" | "error" | "streaming" | "stopped"
    >("idle");
    const [stream, setStream] = useState<MediaStream | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);

    // Auto-select a camera on mount if none is selected.
    useEffect(() => {
        const initCamera = async () => {
            const cameras = await getAvailableCameras();
            if (cameras.length > 0 && !activeCamera) {
                console.log(
                    "Auto-selecting first camera:",
                    cameras[0].deviceId
                );
                setActiveCamera(cameras[0].deviceId);
            }
        };
        initCamera();
    }, []); // empty dependency: run once on mount

    useEffect(() => {
        if (activeCamera) {
            startStream(activeCamera);
        }
    }, [activeCamera]);

    useEffect(() => {
        console.log("Stream status:", streamStatus);
    }, [streamStatus]);

    const getAvailableCameras = async (): Promise<MediaDeviceInfo[]> => {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter((device) => device.kind === "videoinput");
    };

    const startStream = async (deviceId: string) => {
        console.log("Starting stream");

        stopStream(); // Stop any existing stream before starting a new one

        setStreamStatus("loading");

        try {
            const newStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    deviceId,
                    width: { ideal: 640 }, // Set ideal width
                    height: { ideal: 360 }, // Set ideal height
                },
            });
            setStream(newStream);
            setActiveCamera(deviceId);
            if (videoRef.current) {
                videoRef.current.srcObject = newStream;
            }
            setStreamStatus("streaming");
        } catch (error) {
            console.error("Error accessing camera:", error);
            setStreamStatus("error");
        }
    };

    const stopStream = () => {
        if (stream) {
            stream.getTracks().forEach((track) => track.stop());
            setStream(null);
            setStreamStatus("stopped");
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
            status: streamStatus,
            stream,
            setActiveCamera,
            videoRef,
            getAvailableCameras,
            captureFrame,
        }),
        [
            streamStatus,
            stream,
            setActiveCamera,
            videoRef,
            getAvailableCameras,
            captureFrame,
        ]
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
