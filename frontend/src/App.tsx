import "./App.css";
import HandTracking from "./components/handtracking/HandTracking";
import SideBar from "./components/sidebar/SideBar";
import { WebSocketProvider } from "./provider/WebSocketContext";
import { DebugContextProvider } from "./provider/DebugContext";
import { VideoStreamProvider } from "./provider/VideoStreamContext";

function App() {
    return (
        <div className="app-container">
            <DebugContextProvider defaultDebug={false}>
                <WebSocketProvider
                    url={`ws://${import.meta.env.VITE_BASE_URL}/ws`}
                >
                    <VideoStreamProvider>
                        {/* Left side: SideBar */}
                        <SideBar />

                        {/* Right side: HandTracking */}
                        <HandTracking />
                    </VideoStreamProvider>
                </WebSocketProvider>
            </DebugContextProvider>
        </div>
    );
}

export default App;
