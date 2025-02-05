import "./ButtonColumn.css";

interface ButtonColumnProps {
    side: "left" | "right";
    count: number;
}

function ButtonColumn({ side, count }: ButtonColumnProps) {
    return (
        <div className={`button-column ${side}`}>
            {Array.from({ length: count }).map((_, index) => (
                <button key={index} className="button">
                    Button {index + 1}
                </button>
            ))}
        </div>
    );
}

export default ButtonColumn;
