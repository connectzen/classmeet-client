import { useState, useEffect } from 'react';
import MeetingBanner, { AdminMeeting } from './MeetingBanner';

const SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

interface SessionByCode {
    id: string;
    room_code: string;
    room_id: string;
    title: string;
    description: string;
    scheduled_at: string;
    session_image_url?: string | null;
    created_by: string;
    max_participants: number;
    creator_name?: string | null;
}

interface Props {
    code: string;
    onJoin: (roomCode: string, roomId: string, name: string, role: 'teacher' | 'student' | 'guest', roomName: string) => void;
}

export default function GuestJoin({ code, onJoin }: Props) {
    const [session, setSession] = useState<SessionByCode | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [guestName, setGuestName] = useState('');
    const [nameError, setNameError] = useState('');

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError('');
        fetch(`${SERVER}/api/session-by-code/${encodeURIComponent(code)}`)
            .then((r) => {
                if (!r.ok) {
                    if (r.status === 404) throw new Error('Invalid or expired link');
                    return r.json().then((d) => { throw new Error(d.error || 'Failed to load session'); });
                }
                return r.json();
            })
            .then((data: SessionByCode) => { if (!cancelled) setSession(data); })
            .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Invalid or expired link'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [code]);

    const meetingForBanner: AdminMeeting = session ? {
        id: session.id,
        room_code: session.room_code,
        room_id: session.room_id,
        title: session.title,
        description: session.description || '',
        scheduled_at: session.scheduled_at,
        created_by: session.created_by,
        max_participants: session.max_participants ?? 30,
        is_active: true,
        session_image_url: session.session_image_url || undefined,
    } : null!;

    const handleJoinAsGuest = (roomCode: string, roomId: string, _displayName: string, _role: 'teacher' | 'student', title: string) => {
        const name = guestName.trim();
        if (!name) { setNameError('Please enter your name to join.'); return; }
        setNameError('');
        onJoin(roomCode, roomId, name, 'guest', title);
    };

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg, #0a0a0f)', display: 'flex', flexDirection: 'column', fontFamily: 'inherit' }}>

            {/* ── Decorative orbs ── */}
            <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
                <div style={{ position: 'absolute', top: '-15%', right: '-10%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)' }} />
                <div style={{ position: 'absolute', bottom: '-10%', left: '-5%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%)' }} />
            </div>

            {/* ── Navbar ── */}
            <nav style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', gap: 16, padding: '0 24px', height: 64, borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(10,10,15,0.8)', backdropFilter: 'blur(12px)', flexShrink: 0 }}>
                {/* Logo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <svg viewBox="0 0 32 32" fill="none" width="28" height="28">
                        <circle cx="16" cy="16" r="16" fill="url(#glg)" />
                        <path d="M9 22V13l7-4 7 4v9" stroke="white" strokeWidth="2" strokeLinejoin="round" />
                        <defs>
                            <linearGradient id="glg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                                <stop stopColor="#6366f1" /><stop offset="1" stopColor="#8b5cf6" />
                            </linearGradient>
                        </defs>
                    </svg>
                    <span style={{ fontSize: 18, fontWeight: 800, background: 'linear-gradient(135deg,#818cf8,#a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>ClassMeet</span>
                </div>
                {/* Pill */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 100, padding: '5px 12px', fontSize: 12, fontWeight: 600, color: '#a5b4fc' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', flexShrink: 0, boxShadow: '0 0 6px #22c55e' }} />
                    Live · Real-time · Secure
                </div>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 12, color: 'var(--text-muted, #64748b)', fontWeight: 500 }}>Guest join</span>
            </nav>

            {/* ── Main content ── */}
            <div style={{ flex: 1, position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 16px' }}>

                {loading && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                        <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid rgba(99,102,241,0.2)', borderTop: '3px solid #6366f1', animation: 'spin 0.9s linear infinite' }} />
                        <p style={{ fontSize: 14, color: 'var(--text-muted, #64748b)', margin: 0 }}>Loading session…</p>
                        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    </div>
                )}

                {!loading && (error || !session) && (
                    <div style={{ maxWidth: 400, width: '100%', background: 'var(--surface-2, #13131a)', borderRadius: 20, border: '1px solid rgba(239,68,68,0.3)', padding: 40, textAlign: 'center', boxShadow: '0 8px 40px rgba(0,0,0,0.4)' }}>
                        <div style={{ fontSize: 52, marginBottom: 16 }}>⚠️</div>
                        <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800, color: 'var(--text, #e8e8f0)' }}>Invalid or expired link</h2>
                        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted, #64748b)' }}>{error || 'This session link is no longer valid.'}</p>
                    </div>
                )}

                {!loading && session && (
                    <div style={{ width: '100%', maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 20 }}>

                        {/* Heading */}
                        <div style={{ textAlign: 'center' }}>
                            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted, #64748b)', fontWeight: 500 }}>
                                You've been invited to join a session — no account required.
                            </p>
                        </div>

                        {/* Name input */}
                        <div style={{ background: 'var(--surface, #13131a)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '20px 24px', boxShadow: '0 4px 24px rgba(0,0,0,0.3)' }}>
                            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                                Your name
                            </label>
                            <input
                                type="text"
                                value={guestName}
                                onChange={(e) => { setGuestName(e.target.value); setNameError(''); }}
                                onKeyDown={(e) => { if (e.key === 'Enter' && session) handleJoinAsGuest(session.room_code, session.room_id, '', 'student', session.title); }}
                                placeholder="Enter your name to join"
                                autoFocus
                                style={{
                                    width: '100%', boxSizing: 'border-box',
                                    padding: '12px 14px', borderRadius: 10,
                                    background: 'rgba(255,255,255,0.05)',
                                    border: nameError ? '1.5px solid rgba(239,68,68,0.6)' : '1.5px solid rgba(99,102,241,0.35)',
                                    color: 'var(--text, #e8e8f0)', fontSize: 14, outline: 'none',
                                }}
                            />
                            {nameError && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#f87171' }}>{nameError}</p>}
                        </div>

                        {/* Session banner */}
                        <MeetingBanner
                            meeting={meetingForBanner}
                            displayName={guestName.trim()}
                            userRole="student"
                            isCreator={false}
                            sessionType="teacher"
                            teacherName={session.creator_name || undefined}
                            onJoin={handleJoinAsGuest}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
