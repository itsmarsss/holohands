import React from "react";
import "./SideBar.css";
const SideBar: React.FC = () => {
    return (
        <div className="sidebar-container">
            <h2>SideBar</h2>
            <ul>
                <li>Option 1</li>
                <li>Option 2</li>
                <li>Option 3</li>
            </ul>
        </div>
    );
};

export default SideBar;
