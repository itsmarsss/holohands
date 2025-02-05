import React from "react";
import "./Controls.css";

interface Hand {
    handedness: string;
    landmarks: number[][];
    connections: number[][];
    detected_symbols?: [string, number][];
}

interface ControlsProps {
    currentHandsData: Hand[];
}

const Controls: React.FC<ControlsProps> = ({ currentHandsData }) => {
    const saveHandSymbol = async (handedness: string) => {
        const name = (
            document.getElementById(
                handedness === "Left" ? "leftHandName" : "rightHandName"
            ) as HTMLInputElement
        )?.value;

        if (!name) {
            alert("Please enter a name for the hand symbol.");
            return;
        }

        const handData = currentHandsData.find(
            (hand) => hand.handedness === handedness
        );

        if (!handData) {
            alert(`No ${handedness} hand detected.`);
            return;
        }

        try {
            const response = await fetch(
                "http://localhost:6969/save_handsymbol",
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
                alert(`${handedness} hand symbol saved successfully.`);
            } else {
                alert(`Failed to save ${handedness} hand symbol.`);
            }
        } catch (error) {
            console.error("Error:", error);
            alert(`Failed to save ${handedness} hand symbol.`);
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
