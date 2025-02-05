import React from "react";
import "./CameraSelect.css";
import { Device } from "../../objects/device";

interface CameraSelectProps {
    selectedDevice: Device | null;
    setSelectedDevice: (device: Device | null) => void;
    videoDevices: MediaDeviceInfo[];
}

const CameraSelect: React.FC<CameraSelectProps> = ({
    selectedDevice,
    setSelectedDevice,
    videoDevices,
}) => {
    return (
        <div className="camera-select">
            <select
                value={selectedDevice?.deviceId || ""}
                onChange={(e) =>
                    setSelectedDevice({
                        deviceId: e.target.value,
                        label:
                            (e.target as HTMLSelectElement).selectedOptions[0]
                                ?.textContent || "Unknown",
                    })
                }
            >
                {videoDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Camera ${device.deviceId}`}
                    </option>
                ))}
            </select>
        </div>
    );
};

export default CameraSelect;
