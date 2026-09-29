import React from "react";

/**
 * Render the finite, read-only informational descriptor vocabulary.
 * Content is text data only; this component intentionally has no HTML or URL
 * execution path.
 */
export default function InformationalRenderer({ descriptor }) {
  const content = descriptor?.content || {};
  return (
    <section className="informational-renderer" aria-label="Plugin information">
      {content.summary && <p>{content.summary}</p>}
      {(content.sections || []).map(section => (
        <section key={section.heading} aria-labelledby={`informational-${section.heading}`}>
          <h2 id={`informational-${section.heading}`}>{section.heading}</h2>
          {section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
        </section>
      ))}
    </section>
  );
}
