import "./App.css";
import HandTracking from "./components/handtracking/HandTracking";
import SideBar from "./components/sidebar/SideBar";
import { WebSocketProvider } from "./provider/WebSocketContext";

function App() {
    return (
        <div className="app-container">
            <WebSocketProvider url={"ws://localhost:6969/ws"}>
                {/* Left side: SideBar */}
                <SideBar />

                {/* Right side: HandTracking */}
                <HandTracking />
            </WebSocketProvider>
        </div>
    );
}

export default App;
