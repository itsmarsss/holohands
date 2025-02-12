import React from "react";
import "./Controls.css";
import { toast } from "react-toastify";

interface Hand {
    handedness: string;
    landmarks: number[][];
    connections: number[][];
    detected_symbols?: [string, number][];
}

interface ControlsProps {
    currentHandsDataRef: React.MutableRefObject<Hand[]>;
}

const Controls: React.FC<ControlsProps> = ({ currentHandsDataRef }) => {
    const saveHandSymbol = async (handedness: string) => {
        const name = (
            document.getElementById(
                handedness === "Left" ? "leftHandName" : "rightHandName"
            ) as HTMLInputElement
        )?.value;

        if (!name) {
            toast.error("Please enter a symbol name.");
            return;
        }

        const handData = currentHandsDataRef.current.find(
            (hand) => hand.handedness === handedness
        );

        if (!handData) {
            toast.error(`No ${handedness} hand detected.`);
            return;
        }

        try {
            const response = await fetch(
                `http://${import.meta.env.VITE_BASE_URL}/save_handsymbol`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        name: name,
                        handedness: handedness,
                        landmarks: handData.landmarks,
                    }),
                }
            );

            const data = await response.json();
            if (data.status === "success") {
                toast.success(`${handedness} symbol saved successfully.`);
            } else {
                toast.error(`Failed to save ${handedness} symbol.`);
            }
        } catch (error) {
            console.error("Error:", error);
            toast.error(`Failed to save ${handedness} symbol.`);
        }
    };

    return (
        <div id="controls">
            <div className="control-group">
                <input
                    type="text"
                    id="leftHandName"
                    placeholder="L-H Sym Name"
                />
                <button onClick={() => saveHandSymbol("Left")}>
                    Save L-H Sym
                </button>
            </div>
            <div className="control-group">
                <input
                    type="text"
                    id="rightHandName"
                    placeholder="R-H Sym Name"
                />
                <button onClick={() => saveHandSymbol("Right")}>
                    Save R-H Sym
                </button>
            </div>
        </div>
    );
};

export default Controls;
