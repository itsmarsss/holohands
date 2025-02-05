interface Stroke {
    hand: "Left" | "Right";
    color: string;
    points: { x: number; y: number }[];
}

export type { Stroke };
