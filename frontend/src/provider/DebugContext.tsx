import { createContext, useContext } from "react";
import { useState } from "react";

interface DebugContextProviderProps {
    children: React.ReactNode;
    defaultDebug: boolean;
}

interface DebugContextType {
    debug: boolean;
    setDebug: (debug: boolean) => void;
}

const DebugContext = createContext<DebugContextType | null>(null);

export function DebugContextProvider({
    children,
    defaultDebug,
}: DebugContextProviderProps) {
    const [debug, setDebug] = useState(defaultDebug);

    const debugContextValue: DebugContextType = {
        debug,
        setDebug,
    };

    return (
        <DebugContext.Provider value={debugContextValue}>
            {children}
        </DebugContext.Provider>
    );
}

export const useDebug = () => {
    return useContext(DebugContext);
};
