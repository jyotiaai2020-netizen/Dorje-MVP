'use client';

type ConfirmModalProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm?: () => void;
};

export default function ConfirmModal({ open, title, message, confirmLabel = 'Understood', onClose, onConfirm }: ConfirmModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-3xl border border-emerald-400/20 bg-slate-900 p-6 shadow-2xl">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-xl">🔐</div>
        <h2 className="mt-4 text-xl font-semibold text-white">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-300">{message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300">Close</button>
          <button type="button" onClick={() => { onConfirm?.(); onClose(); }} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950">{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
