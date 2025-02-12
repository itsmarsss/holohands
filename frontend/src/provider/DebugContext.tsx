import { createContext, MutableRefObject, useContext, useRef } from "react";

interface DebugContextProviderProps {
    children: React.ReactNode;
    defaultDebug: boolean;
}

interface DebugContextType {
    getDebug: () => MutableRefObject<boolean>;
}

const DebugContext = createContext<DebugContextType | null>(null);

export function DebugContextProvider({
    children,
    defaultDebug,
}: DebugContextProviderProps) {
    const debug = useRef(defaultDebug);

    const debugContextValue: DebugContextType = {
        getDebug: () => debug,
    };

    return (
        <DebugContext.Provider value={debugContextValue}>
            {children}
        </DebugContext.Provider>
    );
}

export const useDebug = () => {
    const debugContext = useContext(DebugContext);
    if (!debugContext) {
        throw new Error("useDebug must be used within a DebugContextProvider");
    }
    return debugContext;
};
