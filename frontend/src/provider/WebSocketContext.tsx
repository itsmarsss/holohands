import {
    createContext,
    useContext,
    useRef,
    ReactNode,
    useEffect,
    useMemo,
} from "react";
import { SocketStatus } from "../objects/socketstatus";

interface WebSocketProps {
    url: string;
    children: ReactNode;
}

interface WebSocketContextType {
    sendFrame: (frame: ArrayBuffer) => boolean;
    getWebSocket: () => WebSocket | null;
    getConnectionStatus: () => SocketStatus;
    getAcknowledged: () => boolean;
    getData: () => object | null;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export const WebSocketProvider = ({ url, children }: WebSocketProps) => {
    const wsRef = useRef<WebSocket | null>(null);
    const connectionStatusRef = useRef<SocketStatus>("Connecting...");
    const retryTimeoutRef = useRef<number | null>(null);
    const acknowledgedRef = useRef<boolean>(true);
    const dataRef = useRef<object | null>(null);
    const fallbackCounterRef = useRef<number>(0);
    const RECONNECT_INTERVAL = 3000;

    const connectWebSocket = () => {
        connectionStatusRef.current = "Connecting...";
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
            console.warn("WebSocket connection opened.");
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
        };

        ws.onerror = (error) => {
            console.error("WebSocket error:", error);
            connectionStatusRef.current = "Error";
            ws.close();
        };

        ws.onmessage = async (event) => {
            let messageText = "";
            if (typeof event.data === "string") {
                messageText = event.data;
            } else if (event.data instanceof Blob) {
                messageText = await event.data.text();
            }

            try {
                const data = JSON.parse(messageText);
                if (data) {
                    dataRef.current = data;
                    acknowledgedRef.current = true;
                }
            } catch (error) {
                console.error("Error parsing websocket message:", error);
            }
        };
    };

    const retryConnection = () => {
        if (retryTimeoutRef.current) return;

        const timeout = setInterval(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                retryTimeoutRef.current = null;
                clearInterval(timeout);
                return;
            }
            connectionStatusRef.current = "Connecting...";

            if (!wsRef.current) {
                connectWebSocket();
            }
        }, RECONNECT_INTERVAL);
        retryTimeoutRef.current = timeout;
    };

    useEffect(() => {
        if (!wsRef.current) {
            connectWebSocket();
        }

        const fallbackTimeout = setInterval(() => {
            if (!wsRef.current && !retryTimeoutRef.current) {
                connectionStatusRef.current = "Connecting...";
                retryConnection();
            }

            fallbackCounterRef.current += 66;
            if (fallbackCounterRef.current > 5000) {
                acknowledgedRef.current = true;
                fallbackCounterRef.current = 0;
            }
        }, 66);

        return () => {
            clearInterval(fallbackTimeout);
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, []);

    const sendFrame = (frame: ArrayBuffer): boolean => {
        const socket = wsRef.current;

        if (!socket || socket.readyState !== WebSocket.OPEN) {
            //console.warn("WebSocket is not connected. Cannot send frame.");
            return false;
        }

        socket.send(frame);
        acknowledgedRef.current = false;
        return true;
    };

    const websocketContextValue = useMemo(() => {
        return {
            sendFrame,
            getWebSocket: () => wsRef.current,
            getConnectionStatus: () => connectionStatusRef.current,
            getAcknowledged: () => acknowledgedRef.current,
            getData: () => dataRef.current,
        };
    }, [connectionStatusRef.current]);

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
