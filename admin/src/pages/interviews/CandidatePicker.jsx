import { useEffect, useId, useState } from "react";
import { UserRound } from "lucide-react";

import { IconText } from "../../components/ui/Field.jsx";

import { candidatesApi } from "../../api/modules.api.js";
import { useDebouncedValue } from "../../hooks/useDebouncedValue.js";
import { getErrorMessage, isAbortError } from "../../utils/errors.js";

export default function CandidatePicker({ value, onChange, error }) {
  const id = useId();
  const [term, setTerm] = useState("");
  const debounced = useDebouncedValue(term);
  const [state, setState] = useState({ phase: "idle", items: [], error: null });

  useEffect(() => {
    if (value || debounced.trim().length < 2) {
      return undefined;
    }

    const controller = new AbortController();

    setState((current) => ({ ...current, phase: "loading", error: null }));

    candidatesApi
      .list({ search: debounced.trim(), isActive: "true", limit: 8 }, controller.signal)
      .then(({ items }) => setState({ phase: "ready", items, error: null }))
      .catch((failure) => {
        if (!isAbortError(failure)) setState({ phase: "error", items: [], error: failure });
      });

    return () => controller.abort();
  }, [debounced, value]);

  if (value) {
    return (
      <div className="field">
        <span className="field__label" id={`${id}-label`}>
          <IconText icon={UserRound}>Candidate</IconText>
        </span>
        <div className="picked" aria-labelledby={`${id}-label`}>
          <span>
            <strong>{value.name}</strong>
            <span className="sub">{value.email}</span>
          </span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => onChange(null)}>
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="field">
      <label htmlFor={id}>
        <IconText icon={UserRound}>
          Candidate<span className="field__req" aria-hidden="true"> *</span>
        </IconText>
      </label>
      <input
        id={id}
        type="search"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder="Type a name, email or phone (2+ characters)"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        autoComplete="off"
      />

      {state.phase === "loading" ? <p className="field__hint">Searching…</p> : null}
      {state.phase === "error" ? <p className="field__error">{getErrorMessage(state.error)}</p> : null}
      {state.phase === "ready" && state.items.length === 0 ? <p className="field__hint">No active candidates found.</p> : null}

      {state.phase === "ready" && state.items.length > 0 ? (
        <ul className="results" aria-label="Matching candidates">
          {state.items.map((candidate) => (
            <li key={candidate.id}>
              <button type="button" onClick={() => onChange({ id: candidate.id, name: candidate.name, email: candidate.email })}>
                <strong>{candidate.name}</strong>
                <span className="sub">
                  {candidate.email}
                  {candidate.college ? ` · ${candidate.college.name}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p className="field__error" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
