import {
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
    const wsRef = useRef<WebSocket | null>(null);
    const [connectionStatus, setConnectionStatus] =
        useState<string>("Connecting...");
    const [retryTimeout, setRetryTimeout] = useState<number | null>(null);

    const connect = () => {
        if (wsRef.current) {
            console.warn("WebSocket already exists, skipping new connection.");
            return;
        }
        setConnectionStatus((_prev) => "Connecting...");
        const ws = new WebSocket(url);
        wsRef.current = ws;

        initWebSocket(ws);
    };

    const initWebSocket = (ws: WebSocket) => {
        ws.onopen = () => {
            console.log("WebSocket connection established.");
            setConnectionStatus((_prev) => "Connected");
            if (retryTimeout) {
                clearTimeout(retryTimeout);
                setRetryTimeout(null);
            }
        };

        ws.onclose = () => {
            console.warn("WebSocket connection closed.");
            setConnectionStatus((_prev) => "Disconnected");
            wsRef.current = null;
            retryConnection();
        };

        ws.onerror = (error) => {
            console.error("WebSocket error:", error);
            setConnectionStatus((_prev) => "Error");
            ws.close();
        };
    };

    const retryConnection = () => {
        if (retryTimeout) return; // Prevent multiple timeouts
        const timeout = setTimeout(() => {
            console.log("Retrying WebSocket connection...");
            connect();
        }, 1000); // Adjust the timeout as needed
        setRetryTimeout(timeout);
    };

    useEffect(() => {
        if (!wsRef.current) {
            connect();
        }
        return () => {
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
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
    const context = useContext(WebSocketContext);
    if (!context) {
        throw new Error("useWebSocket must be used within a WebSocketProvider");
    }
    return context;
};
