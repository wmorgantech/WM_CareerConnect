import { useCallback, useEffect, useRef, useState } from "react";

import { studentApi } from "./api.js";
import { fullscreenSupported, inFullscreen } from "./fullscreen.js";

export function useCountdown(initialSeconds, onZero) {
  const base = useRef({ seconds: initialSeconds, at: performance.now() });
  const fired = useRef(false);
  const onZeroRef = useRef(onZero);
  const [remaining, setRemaining] = useState(initialSeconds);

  useEffect(() => {
    onZeroRef.current = onZero;
  }, [onZero]);

  useEffect(() => {
    const tick = () => {
      const left = Math.max(0, Math.ceil(base.current.seconds - (performance.now() - base.current.at) / 1000));

      setRemaining(left);

      if (left === 0 && !fired.current) {
        fired.current = true;
        onZeroRef.current?.();
      }
    };

    tick();

    const timer = setInterval(tick, 500);

    return () => clearInterval(timer);
  }, []);

  const resync = useCallback((seconds) => {
    if (typeof seconds === "number" && seconds >= 0) {
      base.current = { seconds, at: performance.now() };
    }
  }, []);

  return { remaining, resync };
}

export function useAnswerSync({ attemptId, initialAnswers, onRemaining, onClosed }) {
  const [answers, setAnswers] = useState(initialAnswers);
  const answersRef = useRef(initialAnswers);
  const [state, setState] = useState("saved");
  const pending = useRef(new Map());
  const seqs = useRef(new Map(Object.entries(initialAnswers).map(([q, a]) => [q, a.seq ?? 0])));
  const inflight = useRef(false);
  const timer = useRef(null);
  const retryDelay = useRef(2000);
  const callbacks = useRef({ onRemaining, onClosed });

  useEffect(() => {
    callbacks.current = { onRemaining, onClosed };
  }, [onRemaining, onClosed]);

  const flush = useCallback(async () => {
    if (inflight.current || pending.current.size === 0) return pending.current.size === 0;

    inflight.current = true;
    setState("saving");

    const sent = [...pending.current.entries()].slice(0, 100);

    try {
      const result = await studentApi.saveAnswers(
        attemptId,
        sent.map(([questionId, a]) => ({ questionId, selectedOptionId: a.selectedOptionId, markedForReview: a.markedForReview, seq: a.seq })),
      );

      for (const [questionId, a] of sent) {
        if (pending.current.get(questionId)?.seq === a.seq) pending.current.delete(questionId);
      }

      retryDelay.current = 2000;
      callbacks.current.onRemaining?.(result.remainingSeconds);
      setState(pending.current.size === 0 ? "saved" : "saving");
    } catch (error) {
      if (error.code === "ATTEMPT_CLOSED" || error.code === "ATTEMPT_EXPIRED") {
        callbacks.current.onClosed?.();
      } else if (error.status === 400 || error.status === 404) {

        for (const [questionId, a] of sent) {
          if (pending.current.get(questionId)?.seq === a.seq) pending.current.delete(questionId);
        }
        setState("offline");
      } else {
        setState("offline");
        clearTimeout(timer.current);
        timer.current = setTimeout(() => flush(), retryDelay.current);
        retryDelay.current = Math.min(retryDelay.current * 2, 10000);
      }
    } finally {
      inflight.current = false;
    }

    if (pending.current.size > 0 && !timer.current) timer.current = setTimeout(() => flush(), 300);

    return pending.current.size === 0;
  }, [attemptId]);

  const save = useCallback(
    (questionId, patch) => {
      const seq = (seqs.current.get(questionId) ?? 0) + 1;

      seqs.current.set(questionId, seq);

      const next = { selectedOptionId: null, markedForReview: false, ...answersRef.current[questionId], ...patch, seq };

      answersRef.current = { ...answersRef.current, [questionId]: next };
      pending.current.set(questionId, next);
      setAnswers(answersRef.current);

      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        flush();
      }, 250);
    },
    [flush],
  );

const flushAll = useCallback(
    async (tries = 5) => {
      for (let i = 0; i < tries; i += 1) {
        clearTimeout(timer.current);
        timer.current = null;

        if (await flush()) return true;

        await new Promise((resolve) => setTimeout(resolve, 600));
      }

      return pending.current.size === 0;
    },
    [flush],
  );

  useEffect(() => {
    const online = () => flush();

    window.addEventListener("online", online);

    return () => {
      window.removeEventListener("online", online);
      clearTimeout(timer.current);
    };
  }, [flush]);

  return { answers, state, save, flushAll, hasPending: () => pending.current.size > 0 };
}

export function useIntegrity({ attemptId, active }) {
  const [warning, setWarning] = useState(null);
  const [fullscreenMissing, setFullscreenMissing] = useState(() => fullscreenSupported() && !inFullscreen());
  const queue = useRef([]);
  const sending = useRef(false);
  const last = useRef({ type: null, at: 0 });

  const drain = useCallback(async () => {
    if (sending.current) return;

    sending.current = true;

    while (queue.current.length > 0) {
      const event = queue.current[0];

      try {
        const result = await studentApi.event(attemptId, event);

        queue.current.shift();

        if (result.message) setWarning({ message: result.message, count: result.warnings });
      } catch (error) {
        if (error.status >= 400 && error.status < 500) queue.current.shift();
        else break;
      }
    }

    sending.current = false;
  }, [attemptId]);

  const report = useCallback(
    (type, details) => {
      const now = Date.now();

if (type === "WINDOW_BLUR" && now - last.current.at < 1000 && last.current.type !== "WINDOW_BLUR") return;

      last.current = { type, at: now };
      queue.current.push({ type, clientAt: new Date(now).toISOString(), ...(details ? { details } : {}) });
      drain();
    },
    [drain],
  );

  useEffect(() => {
    if (!active) return undefined;

    const onVisibility = () => {
      if (document.visibilityState === "hidden") report("TAB_HIDDEN");
    };
    const onBlur = () => report("WINDOW_BLUR");
    const onFullscreen = () => {
      const missing = fullscreenSupported() && !inFullscreen();

      setFullscreenMissing(missing);

      if (missing) report("FULLSCREEN_EXIT");
    };
    const block = (event) => {
      event.preventDefault();
      report("SHORTCUT_BLOCKED", event.type);
    };
    const onKey = (event) => {
      const key = event.key?.toLowerCase();
      const mod = event.ctrlKey || event.metaKey;
      const blocked =
        (mod && ["c", "v", "x", "a", "p", "s", "u", "f", "g", "r"].includes(key)) ||
        (mod && event.shiftKey && ["i", "j", "c", "r"].includes(key)) ||
        key === "f12" || key === "f5" || (event.altKey && ["arrowleft", "arrowright"].includes(key));

      if (blocked) {
        event.preventDefault();
        report("SHORTCUT_BLOCKED", `${mod ? "ctrl+" : ""}${key}`);
      }
    };
    const onOnline = () => {
      report("RECONNECTED");
      drain();
    };
    const beforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("contextmenu", block);
    document.addEventListener("copy", block);
    document.addEventListener("cut", block);
    document.addEventListener("paste", block);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("online", onOnline);
    window.addEventListener("beforeunload", beforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("copy", block);
      document.removeEventListener("cut", block);
      document.removeEventListener("paste", block);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [active, report, drain]);

  return {
    warning,
    dismissWarning: () => setWarning(null),
    fullscreenMissing,
    setFullscreenMissing,
    report,
  };
}
