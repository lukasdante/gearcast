export function Placeholder({ title, text }: { title: string; text: string }) {
  return (
    <div className="placeholder">
      <h1>{title}</h1>
      <p>{text}</p>
      <span className="placeholder-tag">Coming next</span>
    </div>
  );
}
