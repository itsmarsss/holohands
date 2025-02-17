import React, { useReducer, useState } from "react";
import "./SideBar.css";
import { useDebug } from "../../provider/DebugContext";
import MiniDisplay from "../minidisplay/MiniDisplay";
import { useEditable3D } from "../../provider/Editable3DContext";

const SideBar: React.FC = () => {
    const [isExtended, setIsExtended] = useState(false); // State to manage sidebar visibility
    const { selectObject, setObjectVisibility, renameObject, objectsRef } =
        useEditable3D();
    // New state to force re-render when toggling visibility
    const [_, forceUpdate] = useReducer((x) => x + 1, 0);

    const toggleSidebar = () => {
        setIsExtended((prev) => !prev); // Toggle the state
    };

    const { debug, setDebug } = useDebug();

    const handleSelect = (objectName: string) => {
        selectObject(objectName);
    };

    // New: Toggle the visible property of the object using hideObject
    const handleToggleVisibility = (objectName: string, visible: boolean) => {
        setObjectVisibility(objectName, visible);

        forceUpdate();
    };

    const handleRenameObject = (objectName: string, newName: string) => {
        renameObject(objectName, newName);

        forceUpdate();
    };

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
                        {Object.keys(objectsRef.current).map((objectName) => {
                            const object = objectsRef.current[objectName];
                            return (
                                <li key={objectName} className="object-entry">
                                    <div className="object-entry-header">
                                        <input
                                            type="text"
                                            defaultValue={object.name}
                                            className="object-name-input"
                                            onBlur={(e) =>
                                                handleRenameObject(
                                                    objectName,
                                                    e.target.value
                                                )
                                            }
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                    handleRenameObject(
                                                        objectName,
                                                        (
                                                            e.target as HTMLInputElement
                                                        ).value
                                                    );
                                                }
                                            }}
                                        />
                                    </div>
                                    <div className="object-entry-actions">
                                        <button
                                            className="object-btn select-btn"
                                            onClick={() =>
                                                handleSelect(objectName)
                                            }
                                        >
                                            Select
                                        </button>
                                        <button
                                            className="object-btn visibility-btn"
                                            onClick={() =>
                                                handleToggleVisibility(
                                                    objectName,
                                                    !object.visible
                                                )
                                            }
                                        >
                                            {object.visible ? "Hide" : "Show"}
                                        </button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                    {/* Debug toggle switch */}
                    <div className="debug-toggle">
                        <label>
                            <input
                                type="checkbox"
                                checked={debug}
                                onChange={(e) => {
                                    setDebug(e.target.checked);
                                }}
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
