import EmptyState from "../common/EmptyState.jsx";
import PageHeader from "./PageHeader.jsx";

export default function PageContent({ title, description }) {
  return (
    <div>
      <PageHeader title={title} description={description} />
      <EmptyState description="This section is ready for its feature workflow." />
    </div>
  );
}
