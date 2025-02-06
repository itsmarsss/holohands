import "./MiniDisplay.css";
import { useEffect } from "react";
import { useVideoStream } from "../../provider/VideoStreamContext";

function MiniDisplay() {
    const videoStreamContext = useVideoStream();
    const videoRef = videoStreamContext?.videoRef;
    const stream = videoStreamContext?.stream;

    useEffect(() => {
        if (videoRef?.current && stream) {
            // Set the stream as the video source.
            videoRef.current.srcObject = stream;
            // Force the video element to reload the source.
            videoRef.current.load();

            // Attach an onloadedmetadata handler to play the video once metadata is ready.
            videoRef.current.onloadedmetadata = () => {
                videoRef.current
                    ?.play()
                    .then(() => {
                        console.log("Video is playing (onloadedmetadata).");
                    })
                    .catch((error) => {
                        console.error(
                            "Error playing video on loadedmetadata:",
                            error
                        );
                    });
            };

            // Additionally, attempt to play after a short delay.
            const playTimeout = setTimeout(() => {
                videoRef.current
                    ?.play()
                    .then(() => {
                        console.log("Video is playing (timeout).");
                    })
                    .catch((error) => {
                        console.error("Timeout error playing video:", error);
                    });
            }, 300);

            // Cleanup: remove the timeout and the event handler.
            return () => {
                clearTimeout(playTimeout);
                if (videoRef.current) {
                    videoRef.current.onloadedmetadata = null;
                }
            };
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
