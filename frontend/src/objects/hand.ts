interface Hand {
    handedness: "Left" | "Right";
    landmarks: number[][];
    connections: number[][];
    detected_symbols?: [string, number][];
}

export const HAND_COLORS: Record<"Left" | "Right", string> = {
    Left: "#FF0000", // Red
    Right: "#00FF00", // Green
};

export type { Hand };
