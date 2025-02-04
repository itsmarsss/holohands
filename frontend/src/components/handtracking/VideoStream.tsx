import React, { useEffect, useRef, useState } from "react";

interface VideoStreamProps {
    canvasRef: React.RefObject<HTMLCanvasElement>;
    wsRef: React.RefObject<WebSocket | null>;
    acknowledged: boolean;
    onAcknowledge: () => void;
}

const VideoStream: React.FC<VideoStreamProps> = ({
    canvasRef,
    wsRef,
    acknowledged,
    onAcknowledge,
}) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const animationFrameRef = useRef<number>();
    const previousDimensions = useRef<{ width: number; height: number }>({
        width: 0,
        height: 0,
    });
    const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(
        null
    );

    useEffect(() => {
        const getVideoDevices = async () => {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoInputs = devices.filter(
                (device) => device.kind === "videoinput"
            );
            setVideoDevices(videoInputs);
            if (videoInputs.length > 0) {
                setSelectedDeviceId(videoInputs[0].deviceId); // Select the first camera by default
            }
        };
        getVideoDevices();
    }, []);

    useEffect(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const resizeCanvas = () => {
            const aspectRatio = video.videoWidth / video.videoHeight; // Get the aspect ratio from the video feed
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

            // Check if dimensions have changed
            if (
                previousDimensions.current.width !== width ||
                previousDimensions.current.height !== height
            ) {
                // Set canvas dimensions
                canvas.width = width;
                canvas.height = height;

                // Apply styles
                canvas.style.width = `${width}px`;
                canvas.style.height = `${height}px`;

                // Update previous dimensions
                previousDimensions.current.width = width;
                previousDimensions.current.height = height;
            }
        };

        const drawVideoFrame = () => {
            if (video.readyState === video.HAVE_ENOUGH_DATA) {
                // Clear the canvas
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                // Draw the video frame
                ctx.save();
                ctx.scale(-1, 1); // Mirror the video horizontally
                ctx.drawImage(
                    video,
                    -canvas.width,
                    0,
                    canvas.width,
                    canvas.height
                );
                ctx.restore();
            }
            animationFrameRef.current = requestAnimationFrame(drawVideoFrame);
        };

        const startVideoStream = async () => {
            if (selectedDeviceId) {
                // Stop previous stream if it exists
                if (video.srcObject) {
                    const tracks = (video.srcObject as MediaStream).getTracks();
                    tracks.forEach((track) => track.stop());
                }

                await navigator.mediaDevices
                    .getUserMedia({
                        video: { deviceId: { exact: selectedDeviceId } },
                    })
                    .then((stream) => {
                        video.srcObject = stream;
                        video.onloadedmetadata = () => {
                            video.play();
                            resizeCanvas(); // Resize canvas when video is loaded
                            drawVideoFrame();

                            const sendFrame = async () => {
                                if (acknowledged) return;

                                const offscreenCanvas =
                                    document.createElement("canvas");
                                const scaleFactor = 0.5; // Scale down for performance
                                offscreenCanvas.width =
                                    video.videoWidth * scaleFactor;
                                offscreenCanvas.height =
                                    video.videoHeight * scaleFactor;
                                const offscreenCtx =
                                    offscreenCanvas.getContext("2d");

                                if (offscreenCtx) {
                                    offscreenCtx.scale(-1, 1);
                                    offscreenCtx.drawImage(
                                        video,
                                        -offscreenCanvas.width,
                                        0,
                                        offscreenCanvas.width,
                                        offscreenCanvas.height
                                    );
                                    wsRef.current!.send(
                                        offscreenCanvas.toDataURL(
                                            "image/webp",
                                            1
                                        )
                                    );
                                }

                                onAcknowledge();

                                setTimeout(sendFrame, 33);
                            };
                            sendFrame();
                        };
                    });
            }
        };

        startVideoStream();

        // Set interval to resize canvas every second
        const resizeInterval = setInterval(resizeCanvas, 1000);

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            const tracks = video.srcObject as MediaStream;
            tracks?.getTracks().forEach((track) => track.stop());
            clearInterval(resizeInterval); // Clear the interval on unmount
        };
    }, [canvasRef, wsRef, selectedDeviceId]);

    const handleDeviceChange = (
        event: React.ChangeEvent<HTMLSelectElement>
    ) => {
        setSelectedDeviceId(event.target.value);
    };

    return (
        <div className="dropdown-container">
            <select
                onChange={handleDeviceChange}
                value={selectedDeviceId || ""}
            >
                {videoDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Camera ${device.deviceId}`}
                    </option>
                ))}
            </select>
            <video
                ref={videoRef}
                autoPlay
                playsInline
                style={{
                    display: "none", // Hide the video element
                }}
            />
        </div>
    );
};

export default VideoStream;
