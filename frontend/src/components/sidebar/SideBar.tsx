import React, { useState } from "react";
import "./SideBar.css";
import { useDebug } from "../../provider/DebugContext";
import MiniDisplay from "../minidisplay/MiniDisplay";
const SideBar: React.FC = () => {
    const [isExtended, setIsExtended] = useState(true); // State to manage sidebar visibility

    const toggleSidebar = () => {
        setIsExtended((prev) => !prev); // Toggle the state
    };

    const debugContext = useDebug();
    const debug = debugContext.getDebug();

    return (
        <>
            <button onClick={toggleSidebar} className="toggle-button">
                {isExtended ? "<" : ">"}
            </button>
            <div
                className={`sidebar-container ${
                    isExtended ? "extended" : "retracted"
                }`}
            >
                <div className="sidebar-content">
                    <h2>SideBar</h2>
                    <ul>
                        <li>Option 1</li>
                        <li>Option 2</li>
                        <li>Option 3</li>
                    </ul>
                    {/* Debug toggle switch */}
                    <div className="debug-toggle">
                        <label>
                            <input
                                type="checkbox"
                                checked={debug.current}
                                onChange={(e) =>
                                    (debug.current = e.target.checked)
                                }
                            />
                            Debug
                        </label>
                    </div>
                    <MiniDisplay />
                </div>
            </div>
        </>
    );
};

export default SideBar;
