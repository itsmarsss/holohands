import "./App.css";
import HandTracking from "./components/handtracking/HandTracking";
import SideBar from "./components/sidebar/SideBar";
import { WebSocketProvider } from "./provider/WebSocketContext";
import { DebugContextProvider } from "./provider/DebugContext";

function App() {
    return (
        <div className="app-container">
            <DebugContextProvider defaultDebug={true}>
                <WebSocketProvider url={"ws://localhost:6969/ws"}>
                    {/* Left side: SideBar */}
                    <SideBar />

                    {/* Right side: HandTracking */}
                    <HandTracking />
                </WebSocketProvider>
            </DebugContextProvider>
        </div>
    );
}

export default App;
