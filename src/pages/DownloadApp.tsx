import { useState, useEffect } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type Platform = 'ios' | 'android' | 'desktop' | 'other';
type Phase = 'landing' | 'modal' | 'success';

interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPlatform(): Platform {
    const ua = navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(ua) && !(window as unknown as Record<string, unknown>)['MSStream']) return 'ios';
    if (/Android/.test(ua)) return 'android';
    return 'desktop';
}

function isAlreadyInstalled(): boolean {
    return (
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function DownloadApp() {
    const [platform]       = useState<Platform>(getPlatform);
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [phase,          setPhase]          = useState<Phase>('landing');
    const [installing,     setInstalling]     = useState(false);
    const [alreadyInstalled] = useState(isAlreadyInstalled);

    useEffect(() => {
        const onPrompt = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
        };
        const onInstalled = () => {
            setDeferredPrompt(null);
            setPhase('success');
        };
        window.addEventListener('beforeinstallprompt', onPrompt);
        window.addEventListener('appinstalled', onInstalled);
        return () => {
            window.removeEventListener('beforeinstallprompt', onPrompt);
            window.removeEventListener('appinstalled', onInstalled);
        };
    }, []);

    const triggerInstall = async () => {
        if (!deferredPrompt) return;
        setInstalling(true);
        try {
            await deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') setPhase('success');
            else setPhase('landing');
        } finally {
            setInstalling(false);
            setDeferredPrompt(null);
        }
    };

    if (alreadyInstalled) return <AlreadyInstalledScreen />;
    if (phase === 'success')  return <SuccessScreen />;

    const canInstall = !!deferredPrompt; // Android / Chrome desktop only

    return (
        <div style={styles.page}>

            {/* ── Header ── */}
            <div style={styles.appIcon}>
                <img src="/pwa-192x192.png" alt="ClassMeet icon" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>

            <h1 style={styles.appName}>ClassMeet</h1>
            <p style={styles.tagline}>Virtual Classroom — Better as an App</p>

            {/* ── Feature list ── */}
            <div style={styles.featureList}>
                {FEATURES.map(f => (
                    <div key={f.icon} style={styles.featureRow}>
                        <span style={styles.featureIcon}>{f.icon}</span>
                        <span style={styles.featureText}>{f.text}</span>
                    </div>
                ))}
            </div>

            {/* ── CTA — platform-aware ── */}
            {platform === 'ios' ? (
                <IosGuide />
            ) : canInstall ? (
                <button
                    style={styles.ctaBtn}
                    onClick={() => setPhase('modal')}
                    onMouseOver={e => (e.currentTarget.style.opacity = '0.9')}
                    onMouseOut={e  => (e.currentTarget.style.opacity = '1')}
                >
                    📲&nbsp; Install ClassMeet — Free
                </button>
            ) : (
                <OtherBrowserHint platform={platform} />
            )}

            <p style={styles.legalNote}>
                Free · No account needed to install · Sign up inside the app
            </p>

            {/* ── Install confirmation modal ── */}
            {phase === 'modal' && (
                <InstallModal
                    installing={installing}
                    onConfirm={triggerInstall}
                    onClose={() => setPhase('landing')}
                />
            )}
        </div>
    );
}

// ── Install Modal ─────────────────────────────────────────────────────────────

function InstallModal({ installing, onConfirm, onClose }: {
    installing: boolean;
    onConfirm: () => void;
    onClose: () => void;
}) {
    return (
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.modal} onClick={e => e.stopPropagation()}>

                {/* Close X */}
                <button style={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>

                {/* Icon */}
                <div style={{ ...styles.appIcon, width: 72, height: 72, borderRadius: 16, margin: '0 auto 20px' }}>
                    <img src="/pwa-192x192.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>

                <h2 style={styles.modalTitle}>Install ClassMeet</h2>
                <p style={styles.modalSubtitle}>
                    Add ClassMeet to your device for the best experience —
                    works just like a downloaded app, no app store needed.
                </p>

                {/* Benefits */}
                <ul style={styles.benefitList}>
                    {MODAL_BENEFITS.map(item => (
                        <li key={item} style={styles.benefitItem}>
                            <span style={styles.checkCircle}>✓</span>
                            {item}
                        </li>
                    ))}
                </ul>

                {/* Buttons */}
                <button
                    style={{ ...styles.installBtn, opacity: installing ? 0.7 : 1, cursor: installing ? 'not-allowed' : 'pointer' }}
                    onClick={onConfirm}
                    disabled={installing}
                >
                    {installing ? '⏳  Installing…' : '🚀  Install Now'}
                </button>

                <button style={styles.laterBtn} onClick={onClose}>
                    Maybe later
                </button>

                <p style={{ marginTop: 16, fontSize: 11, color: '#475569', textAlign: 'center' }}>
                    Your browser will show a small confirmation prompt — just click <strong style={{ color: '#94a3b8' }}>Install</strong>.
                </p>
            </div>
        </div>
    );
}

// ── iOS Guide ─────────────────────────────────────────────────────────────────

function IosGuide() {
    return (
        <div style={{ width: '100%', maxWidth: 380 }}>
            <div style={styles.iosBanner}>
                <span style={{ fontSize: 20 }}>🍎</span>
                <span style={{ fontSize: 14, color: '#fbbf24', fontWeight: 600 }}>Open this page in Safari to install</span>
            </div>

            <p style={{ textAlign: 'center', fontSize: 14, color: '#94a3b8', margin: '0 0 16px' }}>
                Then follow these 4 steps:
            </p>

            {IOS_STEPS.map((s, i) => (
                <div key={i} style={styles.iosStep}>
                    <span style={styles.stepNum}>{i + 1}</span>
                    <div>
                        <p style={{ margin: 0, fontSize: 14, color: '#c7d2fe', lineHeight: 1.5 }}>{s.line1}</p>
                        {s.line2 && <p style={{ margin: '2px 0 0', fontSize: 13, color: '#64748b' }}>{s.line2}</p>}
                    </div>
                </div>
            ))}
        </div>
    );
}

// ── Other Browser Hint ────────────────────────────────────────────────────────

function OtherBrowserHint({ platform }: { platform: Platform }) {
    const [copied, setCopied] = useState(false);

    const copyLink = () => {
        navigator.clipboard?.writeText(window.location.href).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        }).catch(() => {});
    };

    return (
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🌐</div>
            <p style={{ fontSize: 14, color: '#94a3b8', marginBottom: 16, lineHeight: 1.6 }}>
                {platform === 'desktop'
                    ? <>Open this page in <strong style={{ color: '#a5b4fc' }}>Google Chrome</strong> or <strong style={{ color: '#a5b4fc' }}>Microsoft Edge</strong> and click the install icon <strong style={{ color: '#a5b4fc' }}>⊕</strong> in the address bar.</>
                    : <>Open this page in <strong style={{ color: '#a5b4fc' }}>Chrome</strong> on your Android device to install.</>
                }
            </p>
            <button onClick={copyLink} style={styles.copyBtn}>
                {copied ? '✅  Link Copied!' : '📋  Copy Link to Share'}
            </button>
        </div>
    );
}

// ── Success Screen ────────────────────────────────────────────────────────────

function SuccessScreen() {
    return (
        <div style={styles.fullPage}>
            <div style={styles.successRing}>
                <span style={{ fontSize: 52 }}>✅</span>
            </div>

            <h1 style={{ ...styles.appName, marginTop: 28 }}>ClassMeet is Installed!</h1>

            <p style={{ fontSize: 16, color: '#94a3b8', maxWidth: 300, margin: '12px auto 36px', lineHeight: 1.7, textAlign: 'center' }}>
                Your app is ready to go.
            </p>

            {/* Instruction card */}
            <div style={styles.successCard}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>🏠</div>
                <p style={{ margin: 0, fontSize: 15, color: '#c7d2fe', lineHeight: 1.7 }}>
                    <strong>Close this browser</strong> and open the{' '}
                    <strong style={{ color: '#a5b4fc' }}>ClassMeet</strong> icon from your
                    home screen or desktop to launch the app.
                </p>
            </div>

            {/* Secondary step */}
            <div style={{ ...styles.successCard, marginTop: 12, background: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.25)' }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>👤</div>
                <p style={{ margin: 0, fontSize: 15, color: '#6ee7b7', lineHeight: 1.7 }}>
                    Inside the app, sign up or log in to join or host your first live class session.
                </p>
            </div>
        </div>
    );
}

// ── Already Installed Screen ──────────────────────────────────────────────────

function AlreadyInstalledScreen() {
    return (
        <div style={styles.fullPage}>
            <div style={{ fontSize: 72, marginBottom: 16 }}>📱</div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: '#e0e7ff', margin: '0 0 12px', textAlign: 'center' }}>
                You're in the App!
            </h1>
            <p style={{ fontSize: 15, color: '#94a3b8', maxWidth: 300, textAlign: 'center', lineHeight: 1.6 }}>
                ClassMeet is already installed and running. You're good to go — no action needed.
            </p>
        </div>
    );
}

// ── Static Data ───────────────────────────────────────────────────────────────

const FEATURES = [
    { icon: '📺', text: 'Full-screen live classes — no browser chrome in the way' },
    { icon: '⚡', text: 'Instant launch from your home screen or desktop' },
    { icon: '📶', text: 'App shell loads offline between sessions' },
    { icon: '🔒', text: 'Feels and behaves exactly like a native app' },
];

const MODAL_BENEFITS = [
    'Full-screen video sessions without browser bars',
    'One-tap launch from home screen',
    'Fast offline app shell',
    'No app store — installs directly from browser',
];

const IOS_STEPS = [
    {
        line1: 'Make sure you opened this page in Safari (not Chrome).',
        line2: null,
    },
    {
        line1: 'Tap the Share ⬆️ button at the bottom of your screen.',
        line2: 'It looks like a square with an arrow pointing up.',
    },
    {
        line1: 'Scroll down and tap "Add to Home Screen".',
        line2: null,
    },
    {
        line1: 'Tap "Add" in the top-right corner.',
        line2: 'ClassMeet will appear on your home screen like any other app.',
    },
];

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
    page: {
        minHeight: '100dvh',
        background: 'linear-gradient(145deg, #0f0e1a 0%, #1a1740 40%, #2d2a6e 80%, #312e81 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        color: '#e0e7ff',
        position: 'relative',
    },
    fullPage: {
        minHeight: '100dvh',
        background: 'linear-gradient(145deg, #0f0e1a 0%, #1a1740 40%, #2d2a6e 80%, #312e81 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        color: '#e0e7ff',
    },
    appIcon: {
        width: 96,
        height: 96,
        borderRadius: 22,
        overflow: 'hidden',
        boxShadow: '0 8px 40px rgba(99,102,241,0.55), 0 2px 8px rgba(0,0,0,0.4)',
        marginBottom: 20,
        flexShrink: 0,
    },
    appName: {
        fontSize: 36,
        fontWeight: 800,
        margin: '0 0 8px',
        background: 'linear-gradient(90deg, #e0e7ff 30%, #a5b4fc 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        letterSpacing: -0.5,
    },
    tagline: {
        fontSize: 15,
        color: '#94a3b8',
        margin: '0 0 36px',
        textAlign: 'center',
    },
    featureList: {
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        width: '100%',
        maxWidth: 380,
        marginBottom: 36,
    },
    featureRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        background: 'rgba(99,102,241,0.08)',
        border: '1px solid rgba(99,102,241,0.18)',
        borderRadius: 12,
        padding: '12px 16px',
    },
    featureIcon: { fontSize: 22, flexShrink: 0 },
    featureText: { fontSize: 14, color: '#c7d2fe', lineHeight: 1.4 },
    ctaBtn: {
        width: '100%',
        maxWidth: 380,
        padding: '18px 24px',
        background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
        border: 'none',
        borderRadius: 16,
        fontSize: 17,
        fontWeight: 700,
        color: '#fff',
        cursor: 'pointer',
        boxShadow: '0 6px 32px rgba(99,102,241,0.55)',
        letterSpacing: 0.2,
        transition: 'opacity 0.15s',
        marginBottom: 16,
    },
    legalNote: {
        marginTop: 8,
        fontSize: 12,
        color: '#475569',
        textAlign: 'center',
        maxWidth: 320,
    },
    overlay: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.80)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: 20,
    },
    modal: {
        background: 'linear-gradient(160deg, #1e1b4b 0%, #18164a 100%)',
        border: '1px solid rgba(99,102,241,0.35)',
        borderRadius: 24,
        padding: '36px 28px 28px',
        maxWidth: 400,
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
        position: 'relative',
    },
    closeBtn: {
        position: 'absolute',
        top: 16,
        right: 16,
        background: 'rgba(255,255,255,0.07)',
        border: 'none',
        borderRadius: '50%',
        width: 32,
        height: 32,
        fontSize: 14,
        color: '#64748b',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalTitle: {
        fontSize: 24,
        fontWeight: 800,
        margin: '0 0 10px',
        color: '#e0e7ff',
    },
    modalSubtitle: {
        fontSize: 14,
        color: '#94a3b8',
        margin: '0 0 24px',
        lineHeight: 1.6,
    },
    benefitList: {
        listStyle: 'none',
        padding: 0,
        margin: '0 0 28px',
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
    },
    benefitItem: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontSize: 14,
        color: '#c7d2fe',
    },
    checkCircle: {
        width: 22,
        height: 22,
        borderRadius: '50%',
        background: 'rgba(99,102,241,0.25)',
        border: '1px solid rgba(99,102,241,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        fontWeight: 700,
        color: '#a5b4fc',
        flexShrink: 0,
    },
    installBtn: {
        width: '100%',
        padding: '15px',
        background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
        border: 'none',
        borderRadius: 14,
        fontSize: 16,
        fontWeight: 700,
        color: '#fff',
        marginBottom: 10,
        boxShadow: '0 4px 20px rgba(99,102,241,0.45)',
        letterSpacing: 0.2,
    },
    laterBtn: {
        width: '100%',
        padding: '13px',
        background: 'transparent',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 14,
        fontSize: 14,
        color: '#64748b',
        cursor: 'pointer',
    },
    iosBanner: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: 'rgba(251,191,36,0.1)',
        border: '1px solid rgba(251,191,36,0.3)',
        borderRadius: 12,
        padding: '12px 16px',
        marginBottom: 20,
        justifyContent: 'center',
    },
    iosStep: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
        background: 'rgba(99,102,241,0.07)',
        border: '1px solid rgba(99,102,241,0.15)',
        borderRadius: 12,
        padding: '14px 16px',
        marginBottom: 10,
    },
    stepNum: {
        width: 28,
        height: 28,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
        fontWeight: 700,
        color: '#fff',
        flexShrink: 0,
    },
    copyBtn: {
        padding: '12px 24px',
        background: 'rgba(99,102,241,0.12)',
        border: '1px solid rgba(99,102,241,0.3)',
        borderRadius: 12,
        fontSize: 14,
        color: '#a5b4fc',
        cursor: 'pointer',
        fontWeight: 600,
    },
    successRing: {
        width: 120,
        height: 120,
        borderRadius: '50%',
        background: 'rgba(16,185,129,0.12)',
        border: '2px solid rgba(16,185,129,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 0 40px rgba(16,185,129,0.2)',
    },
    successCard: {
        background: 'rgba(99,102,241,0.08)',
        border: '1px solid rgba(99,102,241,0.2)',
        borderRadius: 16,
        padding: '20px 24px',
        maxWidth: 340,
        width: '100%',
        textAlign: 'center',
    },
};
