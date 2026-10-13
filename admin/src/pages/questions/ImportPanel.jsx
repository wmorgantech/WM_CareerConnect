import { useRef, useState } from "react";
import { Download, FileText } from "lucide-react";

import { questionsApi } from "../../api/modules.api.js";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import { CheckboxField, IconText } from "../../components/ui/Field.jsx";
import SidePanel from "../../components/ui/SidePanel.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { getErrorMessage } from "../../utils/errors.js";
import { saveBlob } from "../../utils/format.js";

const MAX_BYTES = 1_000_000;

export default function ImportPanel({ onClose, onImported }) {
  const toast = useToast();
  const input = useRef(null);
  const [file, setFile] = useState(null);
  const [activate, setActivate] = useState(false);
  const [check, setCheck] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);

  const ok = check && check.errors.length === 0 && check.total > 0;

  async function choose(event) {
    const chosen = event.target.files?.[0];

    setCheck(null);
    setError("");
    setFile(null);

    if (!chosen) return;
    if (chosen.size > MAX_BYTES) return setError("This file is larger than 1 MB. Split it into smaller files.");
    if (!/\.csv$/i.test(chosen.name)) return setError("Choose a .csv file (save the spreadsheet as CSV).");

    try {
      setFile({ name: chosen.name, text: await chosen.text() });
    } catch {
      setError("The file could not be read.");
    }
  }

  async function runCheck() {
    setBusy(true);
    setError("");
    setCheck(null);

    try {
      setCheck(await questionsApi.importCsv(file.text, { dryRun: true, activate }));
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    try {
      const result = await questionsApi.importCsv(file.text, { dryRun: false, activate });

      toast.success(`${result.imported} question${result.imported === 1 ? "" : "s"} imported${activate ? "" : " (inactive until you activate them)"}.`);
      onImported();
    } catch (e) {
      throw new Error(getErrorMessage(e));
    }
  }

  async function template() {
    try {
      const { blob, filename } = await questionsApi.importTemplate();

      saveBlob(blob, filename ?? "question-import-template.csv");
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  return (
    <SidePanel
      open
      title="Import questions"
      subtitle="From a CSV file"
      onClose={onClose}
      busy={busy}
      footer={(close) => (
        <>
          <button type="button" className="btn btn--outline" onClick={close}>Close</button>
          <button type="button" className="btn btn--primary" onClick={() => setConfirming(true)} disabled={!ok || busy}>
            Import {ok ? check.valid : ""} question{ok && check.valid === 1 ? "" : "s"}
          </button>
        </>
      )}
    >
      <div className="stack">
        <p className="field__hint">
          Each row is one single-answer question with four options. Columns: level, section, topic, difficulty, text, codeSnippet, optionA–D, correct (A–D), explanation.
          Nothing is saved until the check passes and you confirm.
        </p>

        <div>
          <button type="button" className="btn btn--outline btn--sm" onClick={template}>
            <Download size={14} aria-hidden="true" /> Download template
          </button>
        </div>

        <div className="field">
          <label htmlFor="import-file"><IconText icon={FileText}>CSV file</IconText></label>
          <input id="import-file" ref={input} type="file" accept=".csv,text/csv" onChange={choose} disabled={busy} />
          {file ? <p className="field__hint">{file.name}</p> : null}
        </div>

        <CheckboxField
          label="Make the imported questions active"
          name="activate"
          checked={activate}
          onChange={(_, value) => {
            setActivate(value);
            setCheck(null);
          }}
          hint="Off by default: imported questions stay inactive until someone reviews and activates them."
        />

        {error ? <p className="notice notice--error" role="alert"><span>{error}</span></p> : null}

        <div>
          <button type="button" className="btn btn--primary" onClick={runCheck} disabled={!file || busy}>
            {busy ? "Checking…" : "Check file"}
          </button>
        </div>

        {check ? (
          check.errors.length === 0 ? (
            <p className="notice notice--info"><span>{check.total} row{check.total === 1 ? "" : "s"} checked, all valid. Nothing has been saved yet.</span></p>
          ) : (
            <>
              <p className="notice notice--warn">
                <span>
                  {check.total - check.valid} of {check.total} row{check.total === 1 ? "" : "s"} have problems. Fix the file and check it again; a file with any problem imports nothing.
                </span>
              </p>
              <div className="tablewrap">
                <table className="table">
                  <caption className="sr-only">Problems found in the file</caption>
                  <thead>
                    <tr><th scope="col">Row</th><th scope="col">Column</th><th scope="col">Problem</th></tr>
                  </thead>
                  <tbody>
                    {check.errors.map((e, i) => (
                      <tr key={`${e.row}-${e.field}-${i}`}>
                        <td data-label="Row">{e.row}</td>
                        <td data-label="Column">{e.field}</td>
                        <td data-label="Problem">{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        ) : null}
      </div>

      <ConfirmDialog
        open={confirming}
        tone="primary"
        title={`Import ${check?.valid ?? 0} questions?`}
        message={`${file?.name ?? "The file"} passed the check. The questions will be added to the bank${activate ? " and made active" : " as inactive"}.`}
        confirmLabel="Import"
        onConfirm={runImport}
        onCancel={() => setConfirming(false)}
      />
    </SidePanel>
  );
}
