import "./App.css";
import HandTracking from "./components/handtracking/HandTracking";
import SideBar from "./components/sidebar/SideBar";
import { WebSocketProvider } from "./provider/WebSocketContext";

function App() {
    return (
        <div className="app-container">
            <WebSocketProvider url={"ws://localhost:6969/ws"}>
                {/* Left side: SideBar */}
                <div className="sidebar-container">
                    <SideBar />
                </div>

                <div className="handtracking-container">
                    <HandTracking />
                </div>
            </WebSocketProvider>
        </div>
    );
}

export default App;
