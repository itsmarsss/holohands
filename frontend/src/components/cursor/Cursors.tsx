import { useEffect, useState } from "react";
import { Hand } from "../../objects/hand";
import {
    DEFAULT_INTERACTION_STATE,
    DEFAULT_INTERACTION_STATE_HAND,
    InteractionState,
} from "../../objects/InteractionState";
import Cursor from "./Cursor";

interface CursorsProps {
    currentHandsDataRef: React.MutableRefObject<Hand[]>;
    interactionStateRef: React.MutableRefObject<InteractionState>;
    overlayCanvasRef: React.RefObject<HTMLCanvasElement>;
}

function Cursors({
    currentHandsDataRef,
    interactionStateRef,
    overlayCanvasRef,
}: CursorsProps) {
    const [currentHandsData, setCurrentHandsData] = useState<Hand[]>(
        currentHandsDataRef.current
    );
    const [interactionState, setInteractionState] = useState<InteractionState>(
        interactionStateRef.current
    );

    useEffect(() => {
        setInterval(() => {
            setCurrentHandsData(currentHandsDataRef.current);
            setInteractionState(interactionStateRef.current);
        }, 33);
    }, []);

    return (
        <>
            {currentHandsData.some((hand) => hand.handedness === "Left") && (
                <Cursor
                    name="leftCursor"
                    hand={
                        interactionState.Left
                            ? interactionState.Left
                            : DEFAULT_INTERACTION_STATE_HAND
                    }
                    overlayCanvasRef={overlayCanvasRef}
                />
            )}
            {currentHandsData.some((hand) => hand.handedness === "Right") && (
                <Cursor
                    name="rightCursor"
                    hand={
                        interactionState.Right
                            ? interactionState.Right
                            : DEFAULT_INTERACTION_STATE_HAND
                    }
                    overlayCanvasRef={overlayCanvasRef}
                />
            )}
        </>
    );
}

export default Cursors;
