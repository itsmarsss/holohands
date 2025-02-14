import { useEffect, useRef, useState } from "react";
import { Hand } from "../../objects/hand";
import {
    DEFAULT_INTERACTION_STATE_HAND,
    InteractionState,
    InteractionStateHand,
} from "../../objects/InteractionState";
import Cursor from "./Cursor";
import React from "react";

interface CursorsProps {
    currentHandsData: React.MutableRefObject<Hand[]>;
    interactionState: React.MutableRefObject<InteractionState>;
    overlayCanvasRef: React.RefObject<HTMLCanvasElement>;
}

function Cursors({
    currentHandsData,
    interactionState,
    overlayCanvasRef,
}: CursorsProps) {
    // Create refs to track the latest data.
    const currentHandsDataRef = useRef<Hand[]>(currentHandsData.current);
    const interactionStateRef = useRef<InteractionState>(
        interactionState.current
    );
    const leftCursorRef = useRef<InteractionStateHand | null>(
        interactionStateRef.current.Left
    );
    const rightCursorRef = useRef<InteractionStateHand | null>(
        interactionStateRef.current.Right
    );

    // Create local state to trigger re-render when hand presence changes.
    const [hasLeftHand, setHasLeftHand] = useState(false);
    const [hasRightHand, setHasRightHand] = useState(false);

    // Update refs at a high frequency.
    useEffect(() => {
        const interval = setInterval(() => {
            currentHandsDataRef.current = currentHandsData.current;
            interactionStateRef.current = interactionState.current;
            leftCursorRef.current = interactionStateRef.current.Left || null;
            rightCursorRef.current = interactionStateRef.current.Right || null;
        }, 33);

        return () => {
            clearInterval(interval);
        };
    }, []);

    // Update hand presence state at a lower frequency to trigger re-render.
    useEffect(() => {
        const checkHands = () => {
            const leftPresent = currentHandsDataRef.current.some(
                (hand) => hand.handedness === "Left"
            );
            const rightPresent = currentHandsDataRef.current.some(
                (hand) => hand.handedness === "Right"
            );
            setHasLeftHand(leftPresent);
            setHasRightHand(rightPresent);
        };

        const interval = setInterval(checkHands, 500);
        return () => clearInterval(interval);
    }, []);

    return (
        <>
            {hasLeftHand && (
                <Cursor
                    name="leftCursor"
                    handRef={leftCursorRef}
                    overlayCanvasRef={overlayCanvasRef}
                    speed={0.1}
                />
            )}
            {hasRightHand && (
                <Cursor
                    name="rightCursor"
                    handRef={rightCursorRef}
                    overlayCanvasRef={overlayCanvasRef}
                    speed={0.1}
                />
            )}
        </>
    );
}

export default Cursors;
