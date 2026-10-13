import { TriangleAlert } from "lucide-react";

export default function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  retryLabel = "Try again",
  fullscreen = false,
}) {
  return (
    <div
      className={fullscreen ? "state state--fullscreen" : "state"}
      role="alert"
    >
      <TriangleAlert className="state__icon state__icon--danger" size={28} aria-hidden="true" />
      <h2 className="state__title">{title}</h2>
      {message ? <p className="state__text">{message}</p> : null}
      {onRetry ? (
        <button type="button" className="btn btn--outline" onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
