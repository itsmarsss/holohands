import "./MiniDisplay.css";
import { useEffect, useReducer } from "react";
import { useVideoStream } from "../../provider/VideoStreamContext";

function MiniDisplay() {
    const videoStreamContext = useVideoStream();
    const videoRef = videoStreamContext.videoRef;

    const [dep, forceUpdate] = useReducer((x) => x + 1, 0);

    useEffect(() => {
        const stream = videoStreamContext.getStream();

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
        } else {
            setTimeout(() => {
                forceUpdate();
            }, 100);
        }
    }, [dep]);

    return (
        <div className="minidisplay-container">
            <video
                className="minidisplay-video"
                ref={videoRef}
                autoPlay
                playsInline
                muted
                preload="auto"
            />
        </div>
    );
}

export default MiniDisplay;
