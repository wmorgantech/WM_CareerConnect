export default function LoadingState({ label = "Loading…", fullscreen = false }) {
  return (
    <div
      className={fullscreen ? "state state--fullscreen" : "state"}
      role="status"
      aria-live="polite"
    >
      <span className="spinner" aria-hidden="true" />
      <span className="state__text">{label}</span>
    </div>
  );
}
