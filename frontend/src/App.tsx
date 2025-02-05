import "./App.css";
import HandTracking from "./components/handtracking/HandTracking";
import { WebSocketProvider } from "./provider/WebSocketContext";

function App() {
    return (
        <>
            <WebSocketProvider url={"ws://localhost:6969/ws"}>
                <HandTracking />
            </WebSocketProvider>
        </>
    );
}

export default App;
