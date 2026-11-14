import React, { useEffect, useState } from "react";
import { Spinner } from "@omnibioai/ui";
import { useAccountDateTime } from "../PreferencesProvider";
import { searchDatasets } from "../../lib/biorepoApi";
import { errorText } from "./messages";

const PAGE_SIZE = 25;
// [facet key in the response, filter key in the request, heading]
const FACETS = [
  ["type", "type", "Type"], ["assay", "assay", "Assay"], ["organism_taxid", "organism", "Organism (taxid)"],
  ["reference_build", "reference_build", "Reference build"], ["tag", "tag", "Tag"], ["project", "project", "Project"],
];

function Facet({ heading, values, selected, onSelect }) {
  if (!values?.length) return null;
  return <fieldset className="biorepo__facet">
    <legend>{heading}</legend>
    {values.slice(0, 12).map(({ value, count }) => {
      const key = String(value);
      const on = selected === key;
      return <button key={key} type="button" aria-pressed={on} className="biorepo__facet-value"
        onClick={() => onSelect(on ? "" : key)}>{key} <span>{count}</span></button>;
    })}
  </fieldset>;
}

export default function RepositoryBrowse({ onOpen, onNew, canWrite }) {
  const formatDate = useAccountDateTime();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({});
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ status: "loading", data: null, error: null });

  useEffect(() => {
    const controller = new AbortController();
    setState(previous => ({ ...previous, status: "loading" }));
    searchDatasets(filters, { page, pageSize: PAGE_SIZE, signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setState({ status: "success", data, error: null }); })
      .catch(error => {
        if (controller.signal.aborted || error?.name === "AbortError") return;
        setState({ status: "error", data: null, error });
      });
    return () => controller.abort();
  }, [filters, page]);

  const setFilter = (key, value) => { setPage(1); setFilters(current => ({ ...current, [key]: value })); };
  const submit = event => { event.preventDefault(); setFilter("q", query); };
  const data = state.data;
  const results = Array.isArray(data?.results) ? data.results : [];
  const total = Number(data?.total) || 0;

  return <section className="biorepo" aria-labelledby="biorepo-browse-heading">
    <header className="biorepo__header">
      <div><h2 id="biorepo-browse-heading">Repository</h2>
        <p>Versioned datasets in your organization, with checksums, lineage and DRS ids.</p></div>
      {canWrite && <button type="button" className="omni-btn omni-btn--primary omni-btn--sm" onClick={onNew}>New dataset</button>}
    </header>
    <form className="biorepo__search" role="search" onSubmit={submit}>
      <label htmlFor="biorepo-q" className="biorepo__sr-only">Search datasets</label>
      <input id="biorepo-q" type="search" value={query} maxLength={200} placeholder="Search titles and descriptions"
        onChange={event => setQuery(event.target.value)} />
      <button type="submit" className="omni-btn omni-btn--secondary omni-btn--sm">Search</button>
    </form>
    <div className="biorepo__browse">
      <aside className="biorepo__facets" aria-label="Filters">
        {FACETS.map(([facet, filter, heading]) => <Facet key={facet} heading={heading} values={data?.facets?.[facet]}
          selected={filters[filter] || ""} onSelect={value => setFilter(filter, value)} />)}
      </aside>
      <div className="biorepo__results">
        {state.status === "error" ? <div className="account-state account-state--error" role="alert">
          <strong>Couldn’t search the repository</strong><span>{errorText(state.error)}</span>
          <button type="button" onClick={() => setFilters(current => ({ ...current }))}>Retry</button>
        </div> : state.status === "loading" && !data ? <p role="status"><Spinner size="sm" /> Searching…</p>
          : results.length === 0 ? <p role="status" className="biorepo__muted">No datasets match.</p>
            : <>
              <div className="biorepo__table-wrap"><table className="biorepo__table" aria-busy={state.status === "loading"}>
                <thead><tr><th scope="col">Title</th><th scope="col">Type</th><th scope="col">Latest</th>
                  <th scope="col">Assay / build</th><th scope="col">Visibility</th><th scope="col">Updated</th></tr></thead>
                <tbody>{results.map(d => <tr key={d.id}>
                  <th scope="row"><button type="button" className="biorepo__link" onClick={() => onOpen(d.id)}>{d.title}</button></th>
                  <td>{d.type}</td>
                  <td>{d.latest_version ? `v${d.latest_version}` : "—"}</td>
                  <td>{[d.facets?.assay, d.facets?.reference_build].filter(Boolean).join(" · ") || "—"}</td>
                  <td>{d.visibility}</td>
                  <td><time dateTime={d.updated_at}>{formatDate(d.updated_at)}</time></td>
                </tr>)}</tbody>
              </table></div>
              <nav className="biorepo__pager" aria-label="Result pages">
                <span>{(page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + results.length} of {total}</span>
                <button type="button" className="omni-btn omni-btn--secondary omni-btn--sm" disabled={page === 1}
                  onClick={() => setPage(page - 1)}>Previous</button>
                <button type="button" className="omni-btn omni-btn--secondary omni-btn--sm"
                  disabled={page * PAGE_SIZE >= total} onClick={() => setPage(page + 1)}>Next</button>
              </nav>
            </>}
      </div>
    </div>
  </section>;
}
