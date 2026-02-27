interface AlertModalProps {
    open: boolean;
    title: string;
    message: string;
    onClose: () => void;
}

export default function AlertModal({ open, title, message, onClose }: AlertModalProps) {
    if (!open) return null;

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
            onClick={onClose}
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
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            padding: '10px 20px',
                            borderRadius: 10,
                            border: 'none',
                            background: 'var(--primary)',
                            color: '#fff',
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >
                        OK
                    </button>
                </div>
            </div>
        </div>
    );
}
