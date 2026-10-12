export default function Loader({ label = "Loading..." }) {
  return (
    <div aria-live="polite" className="py-10 text-center text-sm text-gray-500" role="status">
      {label}
    </div>
  );
}
