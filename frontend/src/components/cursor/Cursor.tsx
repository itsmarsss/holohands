import "./Cursor.css";

interface CursorProps {
    name: string;
}

function Cursor({ name }: CursorProps) {
    return <div className="cursor" id={name}></div>;
}

export default Cursor;
