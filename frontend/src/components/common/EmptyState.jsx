export default function EmptyState({ title = "Nothing here yet", description }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
      <h2 className="font-semibold text-gray-800">{title}</h2>
      {description && <p className="mt-2 text-sm text-gray-500">{description}</p>}
    </div>
  );
}
