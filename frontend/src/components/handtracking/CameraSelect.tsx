import React from "react";

interface CameraSelectProps {
    selectedDeviceId: string | null;
    setSelectedDeviceId: (deviceId: string | null) => void;
    videoDevices: MediaDeviceInfo[];
}

const CameraSelect: React.FC<CameraSelectProps> = React.memo(
    ({ selectedDeviceId, setSelectedDeviceId, videoDevices }) => {
        return (
            <select
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                value={selectedDeviceId || ""}
            >
                {videoDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Camera ${device.deviceId}`}
                    </option>
                ))}
            </select>
        );
    }
);

export default CameraSelect;
