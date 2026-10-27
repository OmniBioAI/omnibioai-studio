import React from "react";

export default function PageHeader({ title, description, actions, headingId }) {
  return (
    <header className="studio-page-header">
      <div>
        <h1 id={headingId}>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="studio-page-header__actions">{actions}</div>}
    </header>
  );
}
