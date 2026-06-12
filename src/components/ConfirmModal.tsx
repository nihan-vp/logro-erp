import React from 'react';
import { AlertTriangle, Info, X } from 'lucide-react';

export type ConfirmVariant = 'danger' | 'warning' | 'default';

export interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const variantStyles: Record<ConfirmVariant, { icon: typeof AlertTriangle; iconWrap: string; button: string }> = {
  danger: {
    icon: AlertTriangle,
    iconWrap: 'bg-rose-50 text-rose-600',
    button: 'bg-rose-600 hover:bg-rose-700 text-white',
  },
  warning: {
    icon: AlertTriangle,
    iconWrap: 'bg-amber-50 text-amber-600',
    button: 'bg-amber-600 hover:bg-amber-700 text-white',
  },
  default: {
    icon: Info,
    iconWrap: 'bg-zinc-100 text-zinc-700',
    button: 'bg-zinc-950 hover:bg-zinc-800 text-white',
  },
};

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null;

  const styles = variantStyles[variant];
  const Icon = styles.icon;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-zinc-950/45 backdrop-blur-[2px]"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-zinc-200/80 animate-fade-in font-sans"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-message"
      >
        <div className="flex items-start justify-between gap-3 p-5 border-b border-zinc-100">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-xl shrink-0 ${styles.iconWrap}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <h3 id="confirm-modal-title" className="text-sm font-extrabold text-zinc-950">
                {title}
              </h3>
              <p id="confirm-modal-message" className="text-xs text-zinc-500 mt-1 leading-relaxed">
                {message}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 rounded-lg hover:bg-zinc-100 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-2 p-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-colors disabled:opacity-50 ${styles.button}`}
          >
            {loading ? 'Please wait...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
