import { useEffect, useState } from "react";

import { collegesApi, userCollegesApi } from "../../api/modules.api.js";
import ErrorState from "../../components/feedback/ErrorState.jsx";
import LoadingState from "../../components/feedback/LoadingState.jsx";
import SidePanel from "../../components/ui/SidePanel.jsx";
import { getErrorMessage, isAbortError } from "../../utils/errors.js";

export default function UserColleges({ user, onClose, onSaved }) {
  const [state, setState] = useState({ phase: "loading", colleges: [], error: null });
  const [chosen, setChosen] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([collegesApi.list({ limit: 100, isActive: "true" }, controller.signal), userCollegesApi.get(user.id, controller.signal)])
      .then(([{ items }, assigned]) => {
        // A college that has since been deactivated or deleted is not in the active list, but it is still
        // assigned. Show it (marked) so the admin can see it and untick it.
        const known = new Set(items.map((c) => c.id));
        const dormant = assigned
          .filter((a) => !known.has(a.collegeId))
          .map((a) => ({ id: a.collegeId, name: a.name ?? "Unknown college", city: "", dormant: true }));

        setState({ phase: "ready", colleges: [...items, ...dormant], error: null });
        setChosen(new Set(assigned.map((a) => a.collegeId)));
      })
      .catch((e) => !isAbortError(e) && setState({ phase: "error", colleges: [], error: e }));

    return () => controller.abort();
  }, [user.id]);

  function toggle(id) {
    setDirty(true);
    setChosen((current) => {
      const next = new Set(current);

      if (next.has(id)) next.delete(id);
      else next.add(id);

      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError("");

    try {
      await userCollegesApi.set(user.id, [...chosen]);
      onSaved("Colleges updated");
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SidePanel
      open
      title="College access"
      subtitle={user.name}
      onClose={onClose}
      dirty={dirty}
      busy={saving}
      footer={(requestClose) => (
        <>
          <button type="button" className="btn btn--outline" onClick={requestClose} disabled={saving}>Cancel</button>
          <button type="button" className="btn btn--primary" onClick={save} disabled={saving || state.phase !== "ready"}>{saving ? "Saving…" : "Save"}</button>
        </>
      )}
    >
      {state.phase === "loading" ? <LoadingState label="Loading colleges…" /> : null}
      {state.phase === "error" ? <ErrorState title="Couldn't load colleges" message={getErrorMessage(state.error)} /> : null}
      {state.phase === "ready" ? (
        <div className="stack">
          {error ? <p className="notice notice--error" role="alert"><span>{error}</span></p> : null}
          <p className="panel__note">This account sees assessment results only for the colleges ticked here.</p>
          {state.colleges.map((c) => (
            <div className="field field--check" key={c.id}>
              <label>
                <input type="checkbox" checked={chosen.has(c.id)} onChange={() => toggle(c.id)} />
                <span>{c.name} <span className="sub">{c.dormant ? "Inactive college: untick to remove it" : c.city}</span></span>
              </label>
            </div>
          ))}
          {chosen.size === 0 ? <p className="notice notice--warn"><span>No college selected: this account will see no results.</span></p> : null}
        </div>
      ) : null}
    </SidePanel>
  );
}
