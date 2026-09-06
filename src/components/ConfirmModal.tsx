import { useState } from 'react';
import { Icon } from './Icon';
import { Modal } from './primitives';

/**
 * Strong confirmation for destructive/emergency Owner actions — removing
 * a host, permanently delisting a vehicle, flipping on maintenance mode.
 * Requires literally typing a confirmation phrase (not just a click),
 * the same friction Settings.tsx's account-deletion flow already uses —
 * a click-through confirm is too easy to fire by muscle memory on a
 * dashboard used daily.
 */
export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmWord = 'CONFIRM',
  confirmLabel = 'Confirm',
  danger = true,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmWord?: string;
  confirmLabel?: string;
  danger?: boolean;
}) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    await onConfirm();
    setBusy(false);
    setTyped('');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} className="max-w-sm rounded-2xl p-6" labelledBy="confirm-title">
      <span className={`grid h-11 w-11 place-items-center rounded-full ${danger ? 'bg-danger/10 text-danger' : 'bg-accent-050 text-accent-600'}`}>
        <Icon name={danger ? 'shield' : 'checkCircle'} size={20} />
      </span>
      <h2 id="confirm-title" className="mt-3 font-display text-lg font-semibold text-ink">{title}</h2>
      <p className="mt-1.5 text-body text-muted">{description}</p>
      <label className="mt-4 flex flex-col gap-1.5 text-detail font-medium text-ink-soft">
        Type <span className="font-mono text-ink">{confirmWord}</span> to proceed
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="input"
          autoFocus
          autoComplete="off"
        />
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="btn btn-secondary btn-sm">Cancel</button>
        <button
          onClick={handleConfirm}
          disabled={typed !== confirmWord || busy}
          className={`btn btn-sm disabled:opacity-40 ${danger ? 'bg-danger text-white hover:bg-danger/90' : 'btn-primary'}`}
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
