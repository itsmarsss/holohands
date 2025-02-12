import { createContext, useContext, useState } from "react";

interface DebugContextProviderProps {
    children: React.ReactNode;
    defaultDebug: boolean;
}

interface DebugContextType {
    debug: boolean;
    setDebug: React.Dispatch<React.SetStateAction<boolean>>;
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
    const debugContext = useContext(DebugContext);
    if (!debugContext) {
        throw new Error("useDebug must be used within a DebugContextProvider");
    }
    return debugContext;
};
