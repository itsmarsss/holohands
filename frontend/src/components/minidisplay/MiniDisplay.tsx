import "./MiniDisplay.css";
import { useEffect } from "react";
import { useVideoStream } from "../../provider/VideoStreamContext";

function MiniDisplay() {
    const videoStreamContext = useVideoStream();
    const videoRef = videoStreamContext?.videoRef;
    const stream = videoStreamContext?.stream;

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch((error) => {
                console.error("Error attempting to play the video:", error);
            });
        }
    }, [stream, videoRef]);

    return (
        <div className="minidisplay-container">
            <video
                className="minidisplay-video"
                ref={videoRef}
                autoPlay
                playsInline
                muted
            />
        </div>
    );
}

export default MiniDisplay;
