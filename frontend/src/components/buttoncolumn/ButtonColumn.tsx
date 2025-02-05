import "./ButtonColumn.css";
import { toast } from "react-toastify";

interface ButtonColumnProps {
    side: "left" | "right";
    count: number;
    peek: boolean;
}

function ButtonColumn({ side, count, peek }: ButtonColumnProps) {
    const handleClick = (index: number) => {
        toast.info(`Button ${index + 1} clicked!`);
    };

    return (
        <div className={`button-column ${side}`}>
            {Array.from({ length: count }).map((_, index) => (
                <button
                    key={index}
                    className={`button${peek ? " peek" : ""}`}
                    onClick={() => handleClick(index)}
                >
                    Button {index + 1}
                </button>
            ))}
        </div>
    );
}

export default ButtonColumn;
