import { useState, useEffect, useRef } from 'react';
import { insforge } from '../lib/insforge';

interface Props {
    defaultTab: 'signin' | 'signup';
    onClose: () => void;
}

export default function AuthModal({ defaultTab, onClose }: Props) {
    const [tab, setTab] = useState<'signin' | 'signup'>(defaultTab);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const overlayRef = useRef<HTMLDivElement>(null);

    // Close on Escape key
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    // Prevent body scroll while open
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    const handleOverlayClick = (e: React.MouseEvent) => {
        if (e.target === overlayRef.current) onClose();
    };

    const resetForm = () => { setName(''); setEmail(''); setPassword(''); setError(''); };

    const switchTab = (t: 'signin' | 'signup') => { setTab(t); resetForm(); };

    const handleSignIn = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim() || !password) return setError('Please fill in all fields.');
        setLoading(true); setError('');
        const { error: err } = await insforge.auth.signInWithPassword({ email: email.trim(), password });
        setLoading(false);
        if (err) { setError(err.message || 'Invalid email or password.'); return; }
        window.location.reload();
    };

    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !email.trim() || !password) return setError('Please fill in all fields.');
        if (password.length < 8) return setError('Password must be at least 8 characters.');
        setLoading(true); setError('');
        const { error: err } = await insforge.auth.signUp({ email: email.trim(), password, name: name.trim() });
        setLoading(false);
        if (err) { setError(err.message || 'Could not create account. Try again.'); return; }
        window.location.reload();
    };

    return (
        <div
            ref={overlayRef}
            onClick={handleOverlayClick}
            style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '16px',
            }}
        >
            <div style={{
                background: 'var(--surface-2, #18181f)',
                border: '1px solid rgba(99,102,241,0.2)',
                borderRadius: 20,
                padding: '36px 32px 32px',
                width: '100%', maxWidth: 420,
                boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
                position: 'relative',
            }}>
                {/* Close button */}
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute', top: 16, right: 16,
                        background: 'rgba(255,255,255,0.06)', border: 'none',
                        color: 'var(--text-muted, #7b7b99)', cursor: 'pointer',
                        width: 32, height: 32, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 18, lineHeight: 1, transition: 'background 0.2s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                >×</button>

                {/* Logo + Brand */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 28 }}>
                    <svg width="48" height="48" viewBox="0 0 32 32" fill="none" style={{ marginBottom: 10 }}>
                        <rect width="32" height="32" rx="10" fill="url(#modalg)" />
                        <path d="M6 22v-8a4 4 0 0 1 4-4h4v12H6Z" fill="white" fillOpacity=".9" />
                        <path d="M14 10h4a4 4 0 0 1 4 4v3h-8V10Z" fill="white" fillOpacity=".6" />
                        <path d="M13 22v-5h6v5" stroke="white" strokeWidth="2" strokeLinejoin="round" />
                        <circle cx="24" cy="10" r="3" fill="#7c3aed" />
                        <path d="M22.5 10h3M24 8.5v3" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
                        <defs>
                            <linearGradient id="modalg" x1="0" y1="0" x2="32" y2="32">
                                <stop stopColor="#6366f1" /><stop offset="1" stopColor="#8b5cf6" />
                            </linearGradient>
                        </defs>
                    </svg>
                    <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text, #e8e8f0)' }}>
                        ClassMeet
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--text-muted, #7b7b99)', marginTop: 4 }}>
                        {tab === 'signin' ? 'Welcome back' : 'Create your account'}
                    </span>
                </div>

                {/* Tab switcher */}
                <div style={{
                    display: 'flex', background: 'rgba(255,255,255,0.04)',
                    borderRadius: 10, padding: 4, marginBottom: 24, gap: 4,
                }}>
                    {(['signin', 'signup'] as const).map(t => (
                        <button key={t} onClick={() => switchTab(t)} style={{
                            flex: 1, padding: '8px 0', border: 'none', borderRadius: 8, cursor: 'pointer',
                            fontWeight: 600, fontSize: 14, transition: 'all 0.2s',
                            background: tab === t ? 'var(--primary, #6366f1)' : 'transparent',
                            color: tab === t ? '#fff' : 'var(--text-muted, #7b7b99)',
                            boxShadow: tab === t ? '0 2px 12px rgba(99,102,241,0.4)' : 'none',
                        }}>
                            {t === 'signin' ? 'Sign In' : 'Sign Up'}
                        </button>
                    ))}
                </div>

                {/* Form */}
                <form onSubmit={tab === 'signin' ? handleSignIn : handleSignUp} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {tab === 'signup' && (
                        <div>
                            <label style={labelStyle}>Full Name</label>
                            <input
                                type="text" value={name} onChange={e => setName(e.target.value)}
                                placeholder="Your name" autoFocus style={inputStyle}
                                onFocus={e => Object.assign(e.target.style, inputFocusStyle)}
                                onBlur={e => Object.assign(e.target.style, inputBlurStyle)}
                            />
                        </div>
                    )}
                    <div>
                        <label style={labelStyle}>Email</label>
                        <input
                            type="email" value={email} onChange={e => setEmail(e.target.value)}
                            placeholder="you@example.com" autoFocus={tab === 'signin'} style={inputStyle}
                            onFocus={e => Object.assign(e.target.style, inputFocusStyle)}
                            onBlur={e => Object.assign(e.target.style, inputBlurStyle)}
                        />
                    </div>
                    <div>
                        <label style={labelStyle}>Password</label>
                        <input
                            type="password" value={password} onChange={e => setPassword(e.target.value)}
                            placeholder={tab === 'signup' ? 'Min. 8 characters' : '••••••••'} style={inputStyle}
                            onFocus={e => Object.assign(e.target.style, inputFocusStyle)}
                            onBlur={e => Object.assign(e.target.style, inputBlurStyle)}
                        />
                    </div>

                    {error && (
                        <div style={{
                            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                            borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#f87171',
                        }}>{error}</div>
                    )}

                    <button
                        type="submit" disabled={loading}
                        style={{
                            marginTop: 4, padding: '13px 0', border: 'none', borderRadius: 12,
                            background: loading ? 'rgba(99,102,241,0.5)' : 'var(--primary, #6366f1)',
                            color: '#fff', fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer',
                            boxShadow: loading ? 'none' : '0 4px 20px rgba(99,102,241,0.4)',
                            transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        }}
                        onMouseEnter={e => { if (!loading) e.currentTarget.style.background = 'var(--primary-hover, #4f52d9)'; }}
                        onMouseLeave={e => { if (!loading) e.currentTarget.style.background = 'var(--primary, #6366f1)'; }}
                    >
                        {loading
                            ? <><Spinner />{tab === 'signin' ? 'Signing in…' : 'Creating account…'}</>
                            : tab === 'signin' ? 'Sign In →' : 'Create Account →'
                        }
                    </button>
                </form>

                {/* Switch link */}
                <p style={{ textAlign: 'center', marginTop: 20, marginBottom: 0, fontSize: 13, color: 'var(--text-muted, #7b7b99)' }}>
                    {tab === 'signin' ? "Don't have an account? " : 'Already have an account? '}
                    <button onClick={() => switchTab(tab === 'signin' ? 'signup' : 'signin')} style={{
                        background: 'none', border: 'none', color: 'var(--accent, #a78bfa)',
                        cursor: 'pointer', fontWeight: 600, fontSize: 13, padding: 0,
                    }}>
                        {tab === 'signin' ? 'Sign up' : 'Sign in'}
                    </button>
                </p>
            </div>
        </div>
    );
}

function Spinner() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" style={{ animation: 'spin 0.8s linear infinite' }}>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        </svg>
    );
}

const labelStyle: React.CSSProperties = {
    display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600,
    color: 'var(--text-muted, #7b7b99)', textTransform: 'uppercase', letterSpacing: '0.06em',
};

const inputStyle: React.CSSProperties = {
    width: '100%', padding: '11px 14px', borderRadius: 10,
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    color: 'var(--text, #e8e8f0)', fontSize: 14, outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 0.2s, box-shadow 0.2s',
};

const inputFocusStyle: React.CSSProperties = {
    borderColor: 'rgba(99,102,241,0.6)',
    boxShadow: '0 0 0 3px rgba(99,102,241,0.15)',
};

const inputBlurStyle: React.CSSProperties = {
    borderColor: 'rgba(255,255,255,0.1)',
    boxShadow: 'none',
};
