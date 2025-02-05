import { useState, useEffect, useRef } from "react";

function useVideoStream() {
    const [activeCamera, setActiveCamera] = useState<string | null>(null);
    const [streamStatus, setStreamStatus] = useState<
        "idle" | "loading" | "error" | "streaming" | "stopped"
    >("idle");
    const [stream, setStream] = useState<MediaStream | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);

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

        setStreamStatus((_) => "loading");

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
            setStreamStatus((_) => "streaming");
        } catch (error) {
            console.error("Error accessing camera:", error);
            setStreamStatus((_) => "error");
        }
    };

    const stopStream = () => {
        if (stream) {
            stream.getTracks().forEach((track) => track.stop());
            setStream(null);
            setStreamStatus((_) => "stopped");
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

    return {
        activeCamera,
        getAvailableCameras,
        streamStatus,
        startStream,
        stopStream,
        captureFrame,
        videoRef,
    };
}

export default useVideoStream;
