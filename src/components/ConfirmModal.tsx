interface ConfirmModalProps {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'default' | 'warning' | 'danger';
    onConfirm: () => void;
    onCancel: () => void;
}

export default function ConfirmModal({
    open,
    title,
    message,
    confirmLabel = 'OK',
    cancelLabel = 'Cancel',
    variant = 'default',
    onConfirm,
    onCancel,
}: ConfirmModalProps) {
    if (!open) return null;

    const variantStyles = {
        default: { bg: 'var(--primary)', hover: 'rgba(99,102,241,0.9)' },
        warning: { bg: '#f59e0b', hover: '#d97706' },
        danger: { bg: '#ef4444', hover: '#dc2626' },
    };
    const style = variantStyles[variant];

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 100000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(4px)',
                animation: 'confirmModalFadeIn 0.15s ease-out',
            }}
            onClick={onCancel}
        >
            <div
                style={{
                    background: 'var(--surface-2)',
                    borderRadius: 16,
                    border: '1px solid var(--border)',
                    padding: 24,
                    maxWidth: 400,
                    width: '90%',
                    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                }}
                onClick={e => e.stopPropagation()}
            >
                <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{title}</h3>
                <p style={{ margin: '0 0 24px', fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5 }}>{message}</p>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                    <button
                        type="button"
                        onClick={onCancel}
                        style={{
                            padding: '10px 20px',
                            borderRadius: 10,
                            border: '1px solid var(--border)',
                            background: 'transparent',
                            color: 'var(--text-muted)',
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        style={{
                            padding: '10px 20px',
                            borderRadius: 10,
                            border: 'none',
                            background: style.bg,
                            color: '#fff',
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
