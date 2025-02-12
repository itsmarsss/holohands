import {
    createContext,
    useContext,
    useRef,
    ReactNode,
    useMemo,
    useEffect,
} from "react";
import { SocketStatus } from "../objects/socketstatus";

interface WebSocketProps {
    url: string;
    children: ReactNode;
}

interface WebSocketContextType {
    getWebSocket: () => WebSocket | null;
    getStatus: () => SocketStatus;
    sendFrame: (frame: string) => void;
    getAcknowledged: () => boolean;
    getData: () => JSON | null;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export const WebSocketProvider = ({ url, children }: WebSocketProps) => {
    const wsRef = useRef<WebSocket | null>(null);
    const connectionStatusRef = useRef<SocketStatus>("Connecting...");
    const retryTimeoutRef = useRef<number | null>(null);
    const acknowledgedRef = useRef<boolean>(false);
    const dataRef = useRef<JSON | null>(null);

    const connect = () => {
        connectionStatusRef.current = "Connecting...";
        const ws = new WebSocket(url);
        wsRef.current = ws;

        initWebSocket(ws);
    };

    const initWebSocket = (ws: WebSocket) => {
        console.log("Initializing WebSocket");
        ws.onopen = () => {
            connectionStatusRef.current = "Connected";

            if (retryTimeoutRef.current) {
                clearTimeout(retryTimeoutRef.current);
                retryTimeoutRef.current = null;
            }
        };

        ws.onclose = () => {
            console.warn("WebSocket connection closed.");
            connectionStatusRef.current = "Disconnected";
            wsRef.current = null;
            retryConnection();
        };

        ws.onerror = (error) => {
            console.error("WebSocket error:", error);
            connectionStatusRef.current = "Error";
            ws.close();
        };
    };

    const retryConnection = () => {
        if (retryTimeoutRef.current) return; // Prevent multiple timeouts
        const timeout = setTimeout(() => {
            console.log("Retrying WebSocket connection...");
            connect();
        }, 1000); // Adjust the timeout as needed
        retryTimeoutRef.current = timeout;
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

    const sendFrame = (frame: string) => {
        if (wsRef.current) {
            wsRef.current.send(frame);
            acknowledgedRef.current = false;
        }
    };

    const websocketContextValue = useMemo(
        () => ({
            getWebSocket: () => wsRef.current,
            getStatus: () => connectionStatusRef.current,
            sendFrame,
            getAcknowledged: () => acknowledgedRef.current,
            getData: () => dataRef.current,
        }),
        []
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
