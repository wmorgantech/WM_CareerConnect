import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { studentApi } from "../api.js";
import { useStudent } from "../auth.jsx";
import Shell from "../components/Shell.jsx";
import { enterFullscreen, leaveFullscreen } from "../fullscreen.js";
import { useAnswerSync, useCountdown, useIntegrity } from "../hooks.js";

const clock = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const two = (n) => String(n).padStart(2, "0");

  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
};

const SAVE_LABEL = { saved: "All answers saved", saving: "Saving…", offline: "Connection problem: your answers are kept and will be saved when you are back online" };

function Loader({ onReady }) {
  const navigate = useNavigate();
  const [state, setState] = useState({ phase: "loading", error: "" });

  useEffect(() => {
    const controller = new AbortController();

    studentApi
      .current(controller.signal)
      .then((data) => {
        if (data.status !== "IN_PROGRESS") navigate("/submitted", { replace: true });
        else onReady(data);
      })
      .catch((e) => {
        if (e.name === "AbortError") return;

        if (e.code === "NO_ATTEMPT") navigate("/", { replace: true });
        else setState({ phase: "error", error: e.message });
      });

    return () => controller.abort();
  }, [navigate, onReady]);

  return (
    <Shell bare>
      {state.phase === "loading" ? <p role="status" className="muted">Loading your assessment…</p> : null}
      {state.phase === "error" ? (
        <div className="card stack">
          <p className="notice notice--error" role="alert">{state.error}</p>
          <button type="button" className="btn btn--outline" onClick={() => window.location.reload()}>Try again</button>
        </div>
      ) : null}
    </Shell>
  );
}

function Paper({ data }) {
  const navigate = useNavigate();
  const { user } = useStudent();
  const { questions } = data;
  const attemptId = data.attempt.id;
  const [index, setIndex] = useState(0);
  const [view, setView] = useState("question");
  const [confirming, setConfirming] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const drawerRef = useRef(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const submittingRef = useRef(false);
  const finishedRef = useRef(false);
  const submitRef = useRef(null);

  const finish = useCallback(() => {
    finishedRef.current = true;
    leaveFullscreen();
    navigate("/submitted", { replace: true });
  }, [navigate]);

  const countdown = useCountdown(data.attempt.remainingSeconds, () => submitRef.current?.(true));
  const { remaining, resync } = countdown;
  const sync = useAnswerSync({ attemptId, initialAnswers: data.answers, onRemaining: resync, onClosed: finish });
  const integrity = useIntegrity({ attemptId, active: true });

  const submit = useCallback(
    async (auto = false) => {
      if (submittingRef.current || finishedRef.current) return;

      submittingRef.current = true;
      setSubmitting(true);
      setSubmitError("");

await sync.flushAll(auto ? 3 : 6);

      try {
        await studentApi.submit(attemptId);
        finish();
      } catch (error) {
        if (error.code === "ATTEMPT_CLOSED" || error.code === "ATTEMPT_EXPIRED") {
          finish();

          return;
        }

        if (auto) {

          finish();

          return;
        }

        setSubmitError(error.message);
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [attemptId, finish, sync],
  );

  useEffect(() => {
    submitRef.current = submit;
  }, [submit]);

useEffect(() => {
    window.history.pushState(null, "", window.location.href);

    const onPop = () => window.history.pushState(null, "", window.location.href);

    window.addEventListener("popstate", onPop);

    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const current = questions[index];
  const answerOf = (id) => sync.answers[id] ?? { selectedOptionId: null, markedForReview: false };
  const answeredCount = useMemo(() => questions.filter((q) => sync.answers[q.questionId]?.selectedOptionId).length, [questions, sync.answers]);
  const markedCount = useMemo(() => questions.filter((q) => sync.answers[q.questionId]?.markedForReview).length, [questions, sync.answers]);
  const unanswered = questions.map((q, i) => ({ q, i })).filter(({ q }) => !sync.answers[q.questionId]?.selectedOptionId);
  const low = remaining <= 300;

  useEffect(() => {
    if (!paletteOpen) return undefined;

    const onKey = (event) => {
      if (event.key === "Escape") setPaletteOpen(false);
    };

    window.addEventListener("keydown", onKey);
    drawerRef.current?.querySelector("button")?.focus();

    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen]);

  async function backToFullscreen() {
    await enterFullscreen();
    integrity.setFullscreenMissing(false);
    integrity.dismissWarning();
  }

  const paletteBody = (onPick) => (
    <>
      <div className="palette__title">
        <h2>Question navigator</h2>
        <span className="palette__count">{answeredCount} of {questions.length} answered</span>
      </div>
      <div className="palette__grid">
        {questions.map((q, i) => {
          const a = answerOf(q.questionId);
          const cls = ["palette__btn", a.selectedOptionId ? "is-answered" : "", a.markedForReview ? "is-marked" : "", i === index && view === "question" ? "is-current" : ""].join(" ");

          return (
            <button
              key={q.questionId}
              type="button"
              className={cls}
              onClick={() => { setIndex(i); setView("question"); onPick?.(); }}
              aria-label={`Question ${i + 1}${a.selectedOptionId ? ", answered" : ", not answered"}${a.markedForReview ? ", marked for review" : ""}${i === index && view === "question" ? ", current question" : ""}`}
              aria-current={i === index && view === "question" ? "true" : undefined}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <div className="palette__key">
        <span><i className="dot dot--answered" />Answered</span>
        <span><i className="dot dot--marked" />Marked for review</span>
        <span><i className="dot" />Not answered</span>
        <span><i className="dot dot--current" />Current</span>
      </div>
      <div className="palette__submit">
        <button type="button" className="btn btn--outline btn--block" onClick={() => { setView("review"); onPick?.(); }}>Review answers and submit</button>
      </div>
    </>
  );

  return (
    <div className="assess" onDragStart={(e) => e.preventDefault()}>
      <header className="assess__bar" role="banner">
        <div className="assess__barinner">
          <div className="assess__title">
            <strong>{user?.drive?.title ?? "Online assessment"}</strong>
            <span>Technical assessment · {view === "review" ? "Review" : `Question ${index + 1} of ${questions.length}`} · {answeredCount} answered</span>
          </div>
          <div className={low ? "timer timer--low" : "timer"} role="timer" aria-label="Time remaining">
            <span className="timer__label">Time left</span>
            <span className="timer__value" aria-live="off">{clock(remaining)}</span>
          </div>
        </div>
        <div className="assess__meter" aria-hidden="true"><i style={{ width: `${(answeredCount / questions.length) * 100}%` }} /></div>
      </header>

      <p className={`assess__status assess__save--${sync.state}`} role="status" aria-live="polite">{SAVE_LABEL[sync.state]}</p>

      {integrity.fullscreenMissing ? (
        <div className="notice notice--warn assess__notice" role="status">
          <span>Please use full screen for the assessment.</span>
          <button type="button" className="btn btn--outline btn--sm" onClick={backToFullscreen}>Enter full screen</button>
        </div>
      ) : null}

      <main className="assess__main" id="main">
        <div className="stack">
          {view === "question" && current ? (
            <section className="card stack qcard" aria-labelledby="q-title">
              <div className="qcard__head">
                <p className="chip">{current.sectionTitle}</p>
                <p className="q__num">Question {index + 1} of {questions.length}</p>
              </div>
              <h1 id="q-title" className="q__text">{current.text}</h1>
              {current.codeSnippet ? <pre className="code"><code>{current.codeSnippet}</code></pre> : null}

              <fieldset className="options">
                <legend className="sr-only">Choose one answer</legend>
                {current.options.map((option, i) => (
                  <label key={option.id} className={answerOf(current.questionId).selectedOptionId === option.id ? "option option--chosen" : "option"}>
                    <input
                      type="radio"
                      name={`q-${current.questionId}`}
                      checked={answerOf(current.questionId).selectedOptionId === option.id}
                      onChange={() => sync.save(current.questionId, { selectedOptionId: option.id })}
                    />
                    <span className="option__letter" aria-hidden="true">{"ABCD"[i]}</span>
                    <span className="option__text">{option.text}</span>
                  </label>
                ))}
              </fieldset>

              <div className="qtools">
                <label className={answerOf(current.questionId).markedForReview ? "reviewtoggle is-on" : "reviewtoggle"}>
                  <input
                    type="checkbox"
                    checked={answerOf(current.questionId).markedForReview}
                    onChange={(e) => sync.save(current.questionId, { markedForReview: e.target.checked })}
                  />
                  <span>Mark for review</span>
                </label>
                {answerOf(current.questionId).selectedOptionId ? (
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => sync.save(current.questionId, { selectedOptionId: null })}>Clear answer</button>
                ) : null}
              </div>

              <div className="qnav">
                <button type="button" className="btn btn--outline" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>Previous</button>
                {index < questions.length - 1 ? (
                  <button type="button" className="btn btn--primary" onClick={() => setIndex((i) => i + 1)}>Next</button>
                ) : (
                  <button type="button" className="btn btn--primary" onClick={() => setView("review")}>Review answers</button>
                )}
              </div>
            </section>
          ) : null}

          {view === "review" ? (
            <section className="card stack" aria-labelledby="r-title">
              <h1 id="r-title">Review your assessment</h1>
              <dl className="facts">
                <div><dt>Answered</dt><dd>{answeredCount} of {questions.length}</dd></div>
                <div><dt>Not answered</dt><dd>{unanswered.length}</dd></div>
                <div><dt>Marked for review</dt><dd>{markedCount}</dd></div>
              </dl>
              {unanswered.length > 0 ? (
                <div>
                  <p className="muted" style={{ marginBottom: 6 }}>Not answered. Select a number to go to that question:</p>
                  {unanswered.map(({ i }) => (
                    <button key={i} type="button" className="linkbtn" onClick={() => { setIndex(i); setView("question"); }}>{i + 1}</button>
                  ))}
                </div>
              ) : null}
              {submitError ? <p className="notice notice--error" role="alert">{submitError}</p> : null}
              <div className="qnav">
                <button type="button" className="btn btn--outline" onClick={() => setView("question")} disabled={submitting}>Back to questions</button>
                <button type="button" className="btn btn--primary" onClick={() => setConfirming(true)} disabled={submitting}>Submit assessment</button>
              </div>
            </section>
          ) : null}
        </div>

        <nav className="palette card" aria-label="Question navigator">
          {paletteBody()}
        </nav>
      </main>

      <div className="assess__dock">
        <button type="button" className="btn btn--outline" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0 || view !== "question"}>Previous</button>
        <button type="button" className="btn btn--outline" onClick={() => setPaletteOpen(true)} aria-haspopup="dialog" aria-expanded={paletteOpen}>
          Questions ({answeredCount}/{questions.length})
        </button>
        <button type="button" className="btn btn--primary" onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))} disabled={index >= questions.length - 1 || view !== "question"}>Next</button>
      </div>

      {paletteOpen ? (
        <div className="drawer" role="dialog" aria-modal="true" aria-label="Question navigator" onClick={(e) => { if (e.target === e.currentTarget) setPaletteOpen(false); }}>
          <div className="drawer__box" ref={drawerRef}>
            <div className="drawer__head">
              <strong>Jump to a question</strong>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPaletteOpen(false)}>Close</button>
            </div>
            {paletteBody(() => setPaletteOpen(false))}
          </div>
        </div>
      ) : null}

      {integrity.warning ? (
        <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="w-title">
          <div className="modal__box stack">
            <h2 id="w-title">Warning {integrity.warning.count ? `(${integrity.warning.count})` : ""}</h2>
            <p>{integrity.warning.message}</p>
            <p className="muted">Your timer is still running and your answers are saved.</p>
            <button type="button" className="btn btn--primary" onClick={backToFullscreen}>Return to the assessment</button>
          </div>
        </div>
      ) : null}

      {confirming ? (
        <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="c-title">
          <div className="modal__box stack">
            <h2 id="c-title">Submit your assessment?</h2>
            <p>
              You have answered {answeredCount} of {questions.length} questions
              {unanswered.length > 0 ? ` (${unanswered.length} not answered)` : ""}. After you submit you cannot reopen it.
            </p>
            <div className="row row--between">
              <button type="button" className="btn btn--outline" onClick={() => setConfirming(false)} disabled={submitting}>Keep working</button>
              <button type="button" className="btn btn--primary" onClick={() => { setConfirming(false); submit(false); }} disabled={submitting}>Yes, submit</button>
            </div>
          </div>
        </div>
      ) : null}

      {submitting ? <div className="modal" role="status"><div className="modal__box"><p>Submitting your assessment…</p></div></div> : null}
    </div>
  );
}

export default function Assessment() {
  const [data, setData] = useState(null);
  const ready = useCallback((d) => setData(d), []);

  return data ? <Paper data={data} /> : <Loader onReady={ready} />;
}
