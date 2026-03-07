import { useState } from 'react';

interface Props {
    onDone: () => void;
}

export default function NotificationPrompt({ onDone }: Props) {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<NotificationPermission | null>(null);

    const handleAllow = async () => {
        setLoading(true);
        try {
            const perm = await Notification.requestPermission();
            setResult(perm);
        } catch {
            setResult('denied');
        } finally {
            setLoading(false);
            // Brief pause so user sees the result, then dismiss
            setTimeout(onDone, 1200);
        }
    };

    const handleSkip = () => {
        onDone();
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 99999,
            background: 'rgba(10, 9, 22, 0.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        }}>
            <div style={{
                background: 'linear-gradient(160deg, #1e1b4b 0%, #1a1740 60%, #0f172a 100%)',
                border: '1px solid rgba(99,102,241,0.3)',
                borderRadius: 24,
                padding: '36px 28px',
                width: '100%',
                maxWidth: 380,
                boxShadow: '0 32px 96px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)',
                textAlign: 'center',
                animation: 'npSlideUp 0.3s cubic-bezier(0.34,1.56,0.64,1) both',
            }}>
                <style>{`
                    @keyframes npSlideUp {
                        from { opacity: 0; transform: translateY(28px) scale(0.96); }
                        to   { opacity: 1; transform: translateY(0)   scale(1);    }
                    }
                `}</style>

                {/* Icon */}
                <div style={{
                    width: 72, height: 72, borderRadius: 20,
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 20px',
                    boxShadow: '0 8px 32px rgba(99,102,241,0.45)',
                }}>
                    <img src="/pwa-192x192.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 20 }} />
                </div>

                {result === null ? (
                    <>
                        <div style={{ fontSize: 28, marginBottom: 6 }}>🔔</div>
                        <h2 style={{
                            margin: '0 0 10px',
                            fontSize: 20, fontWeight: 800,
                            color: '#e0e7ff', lineHeight: 1.3,
                        }}>
                            Stay in the loop
                        </h2>
                        <p style={{
                            margin: '0 0 28px',
                            fontSize: 14, color: '#94a3b8', lineHeight: 1.7,
                        }}>
                            Allow ClassMeet to send you notifications so you never miss a live class or important update from your teacher.
                        </p>

                        <button
                            onClick={handleAllow}
                            disabled={loading}
                            style={{
                                width: '100%',
                                padding: '14px 20px',
                                borderRadius: 14,
                                border: 'none',
                                background: loading
                                    ? 'rgba(99,102,241,0.5)'
                                    : 'linear-gradient(135deg, #6366f1, #4f46e5)',
                                color: '#fff',
                                fontWeight: 700,
                                fontSize: 15,
                                cursor: loading ? 'not-allowed' : 'pointer',
                                marginBottom: 12,
                                boxShadow: loading ? 'none' : '0 6px 24px rgba(99,102,241,0.5)',
                                transition: 'opacity 0.2s',
                            }}
                        >
                            {loading ? '⏳  Asking permission…' : '🔔  Allow Notifications'}
                        </button>

                        <button
                            onClick={handleSkip}
                            disabled={loading}
                            style={{
                                width: '100%',
                                padding: '12px 20px',
                                borderRadius: 14,
                                border: '1px solid rgba(255,255,255,0.08)',
                                background: 'transparent',
                                color: '#64748b',
                                fontWeight: 600,
                                fontSize: 14,
                                cursor: loading ? 'not-allowed' : 'pointer',
                            }}
                        >
                            Not now
                        </button>
                    </>
                ) : (
                    <div style={{ paddingTop: 8 }}>
                        <div style={{ fontSize: 48, marginBottom: 12 }}>
                            {result === 'granted' ? '🎉' : '👍'}
                        </div>
                        <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#e0e7ff' }}>
                            {result === 'granted' ? 'Notifications on!' : 'No problem'}
                        </h2>
                        <p style={{ margin: 0, fontSize: 14, color: '#94a3b8', lineHeight: 1.6 }}>
                            {result === 'granted'
                                ? "We'll alert you when class is about to start."
                                : 'You can enable notifications later in your device settings.'}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
