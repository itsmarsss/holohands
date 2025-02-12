import { Hand } from "../../objects/hand";
import {
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
    return (
        <>
            {currentHandsDataRef.current.some(
                (hand) => hand.handedness === "Left"
            ) && (
                <Cursor
                    name="leftCursor"
                    hand={
                        interactionStateRef.current.Left
                            ? interactionStateRef.current.Left
                            : DEFAULT_INTERACTION_STATE_HAND
                    }
                    overlayCanvasRef={overlayCanvasRef}
                />
            )}
            {currentHandsDataRef.current.some(
                (hand) => hand.handedness === "Right"
            ) && (
                <Cursor
                    name="rightCursor"
                    hand={
                        interactionStateRef.current.Right
                            ? interactionStateRef.current.Right
                            : DEFAULT_INTERACTION_STATE_HAND
                    }
                    overlayCanvasRef={overlayCanvasRef}
                />
            )}
        </>
    );
}

export default Cursors;
