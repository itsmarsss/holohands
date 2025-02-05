import React, {
    createContext,
    useContext,
    useRef,
    useEffect,
    ReactNode,
    useState,
    useMemo,
} from "react";

interface WebSocketProps {
    url: string;
    children: ReactNode;
}

interface WebSocketContextType {
    status: string;
    websocket: WebSocket | null;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export const WebSocketProvider = ({ url, children }: WebSocketProps) => {
    console.log("RESTARDEDDADEDEA");

    const wsRef = useRef<WebSocket | null>(null);
    const [connectionStatus, setConnectionStatus] =
        useState<string>("Connecting...");

    const connect = () => {
        if (wsRef.current) {
            console.warn("WebSocket already exists, skipping new connection.");
            return;
        }
        setConnectionStatus("Connecting...");
        console.log("Connecting to WebSocket:", url);
        const ws = new WebSocket(url);
        wsRef.current = ws;

        initWebSocket(ws);
    };

    const initWebSocket = (ws: WebSocket) => {
        ws.onopen = () => {
            console.log("WebSocket connection established.");
            setConnectionStatus("Connected");
        };

        ws.onclose = () => {
            console.warn("WebSocket connection closed.");
            setConnectionStatus("Disconnected");
            wsRef.current = null;
        };

        ws.onerror = (error) => {
            console.error("WebSocket error:", error);
            setConnectionStatus("Error");
            ws.close();
            setTimeout(() => {
                setConnectionStatus("Connecting...");
                console.log("Retrying WebSocket connection...");
                const ws = new WebSocket(url);
                wsRef.current = ws;
            }, 1000);
        };

        return () => {
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    };

    useEffect(() => {
        if (!wsRef.current) {
            connect();
        }
    }, []);

    const websocketContextValue = useMemo(
        () => ({
            status: connectionStatus,
            websocket: wsRef.current,
        }),
        [connectionStatus]
    );

    return (
        <WebSocketContext.Provider value={websocketContextValue}>
            {children}
        </WebSocketContext.Provider>
    );
};

export const useWebSocket = () => {
    return useContext(WebSocketContext);
};
