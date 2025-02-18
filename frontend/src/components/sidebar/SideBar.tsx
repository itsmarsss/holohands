import React, { useReducer, useState, useEffect, useRef } from "react";
import "./SideBar.css";
import { useDebug } from "../../provider/DebugContext";
import MiniDisplay from "../minidisplay/MiniDisplay";
import { useThreeD } from "../../provider/ThreeDContext";
import * as THREE from "three";

const SideBar: React.FC = () => {
    const [isExtended, setIsExtended] = useState(false); // State to manage sidebar visibility
    const {
        selectObject,
        setObjectVisibility,
        renameObject,
        createCube,
        createSphere,
        objectsRef,
    } = useThreeD();
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

    const handleRenameObject = (
        objectName: string,
        e:
            | React.FocusEvent<HTMLSpanElement>
            | React.KeyboardEvent<HTMLSpanElement>
    ) => {
        const target = e.target as HTMLSpanElement;
        const newName = (target.textContent ?? "")
            .replace("\n", "")
            .slice(0, 16);
        if (newName === objectName) {
            target.blur();
            target.textContent = objectName;
            return;
        }
        if (newName === "") {
            target.textContent = objectName;
            return;
        }

        target.textContent = newName;
        renameObject(objectName, newName);

        forceUpdate();
    };

    const handleAddObject = (objectType: "cube" | "sphere") => {
        if (objectType === "cube") {
            createCube(
                `cube-${Math.random().toString(36).substring(2, 9)}`,
                new THREE.Vector3(0, 0, 0),
                Math.random() * 0xffffff
            );
        } else if (objectType === "sphere") {
            createSphere(
                `sphere-${Math.random().toString(36).substring(2, 9)}`,
                new THREE.Vector3(0, 0, 0),
                0.75,
                Math.random() * 0xffffff
            );
        }
    };

    // Function to compute a version string for the current objects.
    const getObjectsVersion = () => {
        // We assume each object has 'name' and 'visible' properties.
        const keys = Object.keys(objectsRef.current).sort();
        let version = "";
        keys.forEach((key) => {
            const obj = objectsRef.current[key];
            version += key + ":" + obj.name + ":" + obj.visible + ";";
        });
        return version;
    };

    // Store the last known version.
    const versionRef = useRef(getObjectsVersion());

    // Poll periodically and force an update only when the version changes.
    useEffect(() => {
        const intervalId = setInterval(() => {
            const newVersion = getObjectsVersion();
            if (newVersion !== versionRef.current) {
                versionRef.current = newVersion;
                forceUpdate();
            }
        }, 200); // Adjust the polling interval as needed.
        return () => clearInterval(intervalId);
    }, [objectsRef]);

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
                    <div className="sidebar-header">
                        <h2>HoloHands</h2>
                        <div className="object-entries-container">
                            {Object.keys(objectsRef.current).map(
                                (objectName) => {
                                    const object =
                                        objectsRef.current[objectName];
                                    return (
                                        <div
                                            key={objectName}
                                            className="object-entry"
                                        >
                                            <div className="object-entry-header">
                                                <span
                                                    className="object-name-input"
                                                    contentEditable
                                                    suppressContentEditableWarning={
                                                        true
                                                    }
                                                    onBlur={(e) =>
                                                        handleRenameObject(
                                                            objectName,
                                                            e as React.FocusEvent<HTMLSpanElement>
                                                        )
                                                    }
                                                    onKeyUp={(e) => {
                                                        if (e.key === "Enter") {
                                                            e.preventDefault();
                                                            handleRenameObject(
                                                                objectName,
                                                                e as React.KeyboardEvent<HTMLSpanElement>
                                                            );
                                                        } else {
                                                            (
                                                                e as React.KeyboardEvent<HTMLSpanElement>
                                                            ).currentTarget.textContent =
                                                                (
                                                                    e as React.KeyboardEvent<HTMLSpanElement>
                                                                )?.currentTarget.textContent?.slice(
                                                                    0,
                                                                    16
                                                                ) ?? "";
                                                        }
                                                    }}
                                                >
                                                    {object.name}
                                                </span>
                                            </div>
                                            <div className="object-entry-actions">
                                                <button
                                                    className="object-btn visibility-btn"
                                                    onClick={() =>
                                                        handleToggleVisibility(
                                                            objectName,
                                                            !object.visible
                                                        )
                                                    }
                                                >
                                                    {object.visible
                                                        ? "Hide"
                                                        : "Show"}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                }
                            )}
                        </div>
                        <button
                            className="object-btn"
                            onClick={() => {
                                handleAddObject("cube");
                            }}
                        >
                            Add Cube
                        </button>
                        <button
                            className="object-btn"
                            onClick={() => {
                                handleAddObject("sphere");
                            }}
                        >
                            Add Sphere
                        </button>
                    </div>
                    <MiniDisplay />

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
                </div>
            </div>
        </>
    );
};

export default SideBar;
