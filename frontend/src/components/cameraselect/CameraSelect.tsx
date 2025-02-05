import React from "react";

interface CameraSelectProps {
    selectedDeviceId: string | null;
    setSelectedDeviceId: (deviceId: string | null) => void;
    videoDevices: MediaDeviceInfo[];
}

const CameraSelect: React.FC<CameraSelectProps> = ({
    selectedDeviceId,
    setSelectedDeviceId,
    videoDevices,
}) => {
    return (
        <div className="camera-select">
            <select
                value={selectedDeviceId || ""}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
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
