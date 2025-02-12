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
    sendFrame: (frame: string) => boolean;
    getAcknowledged: () => boolean;
    getData: () => object | null;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export const WebSocketProvider = ({ url, children }: WebSocketProps) => {
    const wsRef = useRef<WebSocket | null>(null);
    const connectionStatusRef = useRef<SocketStatus>("Connecting...");
    const retryTimeoutRef = useRef<number | null>(null);
    const acknowledgedRef = useRef<boolean>(false);
    const dataRef = useRef<object | null>(null);
    const fallbackCounterRef = useRef<number>(0);

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

        ws.onmessage = async (event) => {
            let messageText = "";
            if (typeof event.data === "string") {
                messageText = event.data;
            } else if (event.data instanceof Blob) {
                messageText = await event.data.text();
            }

            try {
                const data = JSON.parse(messageText);
                // console.log("Received data from websocket:", data);
                if (data) {
                    dataRef.current = data;
                    acknowledgedRef.current = true;
                    console.log("Acknowledged frame.");
                }
            } catch (error) {
                console.error("Error parsing websocket message:", error);
            }
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

        const fallbackTimeout = setInterval(() => {
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

    const sendFrame = (frame: string): boolean => {
        if (!wsRef.current) {
            return false;
        }

        wsRef.current.send(frame);
        acknowledgedRef.current = false;

        return true;
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
