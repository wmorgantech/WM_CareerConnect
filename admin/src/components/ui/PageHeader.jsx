export default function PageHeader({ title, description, actions }) {
  return (
    <div className="page__head">
      <div>
        <h1 className="page__title">{title}</h1>
        {description ? <p className="page__sub">{description}</p> : null}
      </div>
      {actions ? <div className="page__actions">{actions}</div> : null}
    </div>
  );
}
