import { useState, useRef, useEffect } from "react";

function useWebSocket() {
    const [connectionStatus, setConnectionStatus] = useState<
        "connecting" | "connected" | "disconnected"
    >("disconnected");
    const [lastMessage, setLastMessage] = useState<string | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const [wsUrl, setWsUrl] = useState<string | null>(null);

    useEffect(() => {
        console.log("\tReloaded");
    }, []);

    const connect = (url: string) => {
        if (wsRef.current) {
            console.warn("WebSocket already exists, skipping new connection.");
            return;
        }

        console.log("Connecting to WebSocket:", url);
        setConnectionStatus("connecting");

        const ws = new WebSocket(url);
        wsRef.current = ws;
        setWsUrl(url);
        ws.onopen = () => {
            console.log("WebSocket connection established.");
            setConnectionStatus("connected");
        };

        // Use the onmessage handler to update the lastMessage state.
        ws.onmessage = (event) => {
            setLastMessage(event.data);
        };

        ws.onclose = () => {
            console.warn("WebSocket connection closed.");
            setConnectionStatus("disconnected");
            wsRef.current = null;
        };

        ws.onerror = (error) => {
            console.error("WebSocket error:", error);
            setConnectionStatus("disconnected");
            ws.close();
        };
    };

    const disconnect = () => {
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
            setConnectionStatus("disconnected");
        }
    };

    const sendDataUrl = (dataUrl: string): Promise<string | null> => {
        return new Promise((resolve, reject) => {
            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
                console.log(wsRef.current, wsRef.current?.readyState);
                console.error("WebSocket is not connected.");
                reject(new Error("WebSocket is not connected."));
                return;
            }

            // Create a one-time message handler for the response.
            const handleMessage = (event: MessageEvent) => {
                wsRef.current?.removeEventListener("message", handleMessage);
                resolve(event.data);
            };

            wsRef.current.addEventListener("message", handleMessage);
            wsRef.current.send(dataUrl);
        });
    };

    // Optionally, clean up the WebSocket on unmount.
    useEffect(() => {
        connect("ws://localhost:6969/ws");

        return () => {
            disconnect();
        };
    }, []);

    return {
        wsUrl,
        connectionStatus,
        lastMessage,
        connect,
        disconnect,
        sendDataUrl,
    };
}

export default useWebSocket;
