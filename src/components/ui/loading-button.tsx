import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { haptics } from '../../lib/native';

/* Adapted from 21st.dev "Loading Button" (ddoemonn): the label morphs through idle → pending → success /
 * error without the button changing size, and the status is announced to screen readers. Restyled to the
 * CX button classes and extended so it can wrap existing buttons (ActionLabel) as well as stand alone. */

const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;
const INSTANT = { duration: 0 } as const;

export type AsyncActionStatus = 'idle' | 'pending' | 'success' | 'error';

/** Runs an async action and exposes its status. The action counts as failed when it throws, resolves
 *  `false`, or resolves an object with a truthy `error` (the shape most CX data helpers return). */
export function useAsyncAction({
  action,
  resetAfter = 1400,
  onError,
}: {
  action: () => unknown;
  resetAfter?: number;
  onError?: (error: unknown) => void;
}) {
  const [status, setStatus] = useState<AsyncActionStatus>('idle');
  const phase = useRef<AsyncActionStatus>('idle');
  const runId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  const act = useRef(action);
  const fail = useRef(onError);
  useEffect(() => {
    act.current = action;
    fail.current = onError;
  });

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const run = useCallback(() => {
    if (phase.current === 'pending') return;
    clear();
    const id = ++runId.current;
    phase.current = 'pending';
    setStatus('pending');

    const settle = (next: 'success' | 'error') => {
      if (!alive.current || id !== runId.current) return;
      phase.current = next;
      setStatus(next);
      if (next === 'success') haptics.success();
      else haptics.error();
      timer.current = setTimeout(() => {
        if (!alive.current || id !== runId.current) return;
        phase.current = 'idle';
        setStatus('idle');
      }, resetAfter);
    };

    Promise.resolve()
      .then(() => act.current())
      .then(
        (result) => {
          const failed = result === false || (typeof result === 'object' && result !== null && Boolean((result as { error?: unknown }).error));
          if (failed) {
            fail.current?.((result as { error?: unknown } | false) === false ? undefined : (result as { error?: unknown }).error);
            settle('error');
          } else settle('success');
        },
        (error: unknown) => {
          fail.current?.(error);
          settle('error');
        },
      );
  }, [clear, resetAfter]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clear();
    };
  }, [clear]);

  return { status, run, pending: status === 'pending' };
}

function Spinner({ still }: { still: boolean }) {
  return (
    <motion.svg
      width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden="true" className="shrink-0"
      animate={still ? undefined : { rotate: 360 }}
      transition={still ? undefined : { duration: 0.85, repeat: Infinity, ease: 'linear' }}
    >
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.25" />
      <path d="M10.5 6A4.5 4.5 0 0 0 6 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </motion.svg>
  );
}
const Check = () => (
  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden="true" className="shrink-0">
    <path d="M2.6 6.3 4.9 8.6 9.4 3.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const Alert = () => (
  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden="true" className="shrink-0">
    <path d="M6 2.9v3.5M6 9.05h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

interface Face { key: AsyncActionStatus; node: ReactNode; icon: ReactNode }

/** The stacked label: every face sits in the same grid cell, so the button is always as wide as its
 *  widest face and nothing jumps when the state changes. Put it inside any existing button. */
export function StateLabel({ status, idle, pending, success, error }: {
  status: AsyncActionStatus;
  idle: ReactNode;
  pending?: ReactNode;
  success?: ReactNode;
  error?: ReactNode;
}) {
  const reduced = useReducedMotion();
  const fade = reduced ? INSTANT : CROSSFADE;
  const faces: Face[] = [
    { key: 'idle', node: idle, icon: null },
    { key: 'pending', node: pending ?? idle, icon: <Spinner still={reduced === true || status !== 'pending'} /> },
    ...(success !== undefined ? [{ key: 'success' as const, node: success, icon: <Check /> }] : []),
    ...(error !== undefined ? [{ key: 'error' as const, node: error, icon: <Alert /> }] : []),
  ];
  return (
    <span className="relative inline-grid place-items-center">
      {faces.map((f) => (
        <motion.span
          key={f.key}
          aria-hidden={f.key !== status}
          initial={false}
          animate={f.key === status ? { opacity: 1, y: 0, filter: 'blur(0px)' } : { opacity: 0, y: 3, filter: 'blur(3px)' }}
          transition={fade}
          className="col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
        >
          {f.icon}
          {f.node}
        </motion.span>
      ))}
    </span>
  );
}

/** Drop-in for the common `{busy ? 'Saving…' : 'Save'}` label: same button, no size change, a spinner
 *  while busy and (when `done` is given) a check once it has landed. */
export function ActionLabel({ busy, busyLabel, done, doneLabel, children }: {
  busy: boolean;
  busyLabel?: ReactNode;
  done?: boolean;
  doneLabel?: ReactNode;
  children: ReactNode;
}) {
  const status: AsyncActionStatus = busy ? 'pending' : done ? 'success' : 'idle';
  return (
    <StateLabel
      status={status}
      idle={children}
      pending={busyLabel ?? children}
      success={done !== undefined ? (doneLabel ?? children) : undefined}
    />
  );
}

/** A standalone async button using the CX button classes. */
export function LoadingButton({
  onAction, children, pendingLabel, successLabel = 'Done', errorLabel = 'Try again',
  resetAfter, disabled = false, onError, className = 'btn btn-primary', type = 'button',
}: {
  onAction: () => unknown;
  children: ReactNode;
  pendingLabel?: ReactNode;
  successLabel?: ReactNode;
  errorLabel?: ReactNode;
  resetAfter?: number;
  disabled?: boolean;
  onError?: (error: unknown) => void;
  className?: string;
  type?: 'button' | 'submit';
}) {
  const { status, run, pending } = useAsyncAction({ action: onAction, resetAfter, onError });
  return (
    <>
      <button
        type={type}
        disabled={disabled}
        aria-busy={pending || undefined}
        onClick={(e) => {
          if (pending) { e.preventDefault(); return; }
          run();
        }}
        className={className}
      >
        <StateLabel status={status} idle={children} pending={pendingLabel ?? children} success={successLabel} error={errorLabel} />
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {status === 'success' ? successLabel : status === 'error' ? errorLabel : ''}
      </span>
    </>
  );
}
