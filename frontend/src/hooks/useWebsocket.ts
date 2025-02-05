import { useState, useEffect, useRef } from "react";

const useWebSocket = () => {
    const [wsUrl, setWsUrl] = useState<string | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<
        "connecting" | "connected" | "disconnected"
    >("disconnected");
    const [lastMessage, setLastMessage] = useState<string | null>(null);
    const wsRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        console.log("Connection status:", connectionStatus);
    }, [connectionStatus]);

    const connect = () => {
        if (wsRef.current || !wsUrl) return;

        setConnectionStatus((_) => "connecting");

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log("WebSocket connection established");
            setConnectionStatus((_) => "connected");
        };
        ws.onmessage = (event) => setLastMessage(event.data);
        ws.onclose = () => {
            console.log("WebSocket connection closed");
            setConnectionStatus((_) => "disconnected");
            wsRef.current = null;
        };
        ws.onerror = (error) => {
            console.error("WebSocket Error:", error);
            setConnectionStatus((_) => "disconnected");
            ws.close();
        };
    };

    const disconnect = () => {
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
            setConnectionStatus((_) => "disconnected");
        }
    };

    const sendDataUrl = (dataUrl: string): Promise<string | null> => {
        return new Promise((resolve) => {
            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
                console.error("WebSocket is not connected.");
                resolve(null);
                return;
            }

            wsRef.current.send(dataUrl);
            wsRef.current.onmessage = (event) => resolve(event.data);
        });
    };

    return {
        wsUrl,
        setWsUrl,
        connectionStatus,
        lastMessage,
        connect,
        disconnect,
        sendDataUrl,
    };
};

export default useWebSocket;

// const overlayCanvas = overlayCanvasRef.current;
// if (!overlayCanvas) return;
// const ctx = overlayCanvas.getContext("2d");
// if (!ctx) return;

// try {
//     const data = JSON.parse(event.data);
//     // Clear overlay canvas before drawing new frame.
//     ctx.clearRect(
//         0,
//         0,
//         overlayCanvas.width,
//         overlayCanvas.height
//     );

//     if (data.hands && data.hands.length > 0) {
//         setCurrentHandsData(data.hands);
//         // Draw each hand.
//         data.hands.forEach((hand: Hand) => {
//             drawHand(hand, data.image_size as ImageSize, ctx);
//         });
//     }
//     // Draw all stored strokes.
//     drawStrokes(ctx);

//     setAcknowledged(false);
// } catch (error) {
//     console.error("Error processing message:", error);
// }
