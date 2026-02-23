import { useState, useEffect, useCallback } from 'react';
import { useUser, SignInButton, SignUpButton, UserButton, SignedIn, SignedOut } from '@insforge/react';

interface Props {
    role: 'teacher' | 'student';
    onJoinRoom: (roomCode: string, roomId: string, name: string, role: 'teacher' | 'student', roomName: string) => void;
    onBack: () => void;
}

interface ClassInfo {
    id: string;
    code: string;
    name: string;
    currentParticipants: number;
    max_participants: number;
    teacherPresent: boolean;
    created_at?: string;
}

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

function generateCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ── Stored joined-classes helpers ────────────────────────────────────────
function getStoredClasses(): { id: string; code: string; name: string }[] {
    try { return JSON.parse(localStorage.getItem('classmeet_joined_classes') || '[]'); } catch { return []; }
}

// ── Teacher Lobby ────────────────────────────────────────────────────────
function TeacherLobby({ onJoinRoom, onBack }: { onJoinRoom: Props['onJoinRoom']; onBack: () => void }) {
    const { user } = useUser();
    const [classes, setClasses] = useState<ClassInfo[]>([]);
    const [loadingClasses, setLoadingClasses] = useState(false);
    const [roomName, setRoomName] = useState('');
    const [createdCode, setCreatedCode] = useState('');
    const [createdRoomId, setCreatedRoomId] = useState('');
    const [createdName, setCreatedName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const displayName = user?.profile?.name || user?.email?.split('@')[0] || 'Teacher';

    const fetchClasses = useCallback(async () => {
        if (!user?.id) return;
        setLoadingClasses(true);
        try {
            const res = await fetch(`${SERVER_URL}/api/rooms/by-host/${user.id}`);
            if (res.ok) setClasses(await res.json());
        } catch { /* ignore */ }
        setLoadingClasses(false);
    }, [user?.id]);

    useEffect(() => { fetchClasses(); }, [fetchClasses]);

    const handleCreateClass = async () => {
        if (!roomName.trim()) return setError('Please enter a class name');
        if (!user) return setError('Please sign in first');
        setLoading(true); setError('');
        const code = generateCode();
        try {
            const res = await fetch(`${SERVER_URL}/api/rooms`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, name: roomName.trim(), hostId: user.id }),
            });
            const data = await res.json();
            if (!res.ok) { setLoading(false); return setError(data.error || 'Failed to create class'); }
            setCreatedCode(data.code);
            setCreatedRoomId(data.id);
            setCreatedName(roomName.trim());
            setRoomName('');
            fetchClasses();
        } catch { setError('Server unreachable. Is the server running?'); }
        setLoading(false);
    };

    const handleDeleteClass = async (cls: ClassInfo) => {
        if (!user?.id) return;
        if (!confirm(`Delete "${cls.name}"? All students will be removed.`)) return;
        setDeletingId(cls.id);
        try {
            await fetch(`${SERVER_URL}/api/rooms/${cls.id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hostId: user.id }),
            });
            setClasses((prev) => prev.filter((c) => c.id !== cls.id));
        } catch { /* ignore */ }
        setDeletingId(null);
    };

    return (
        <div className="lobby-container">
            <div className="landing-bg-orb orb-1" />
            <div className="landing-bg-orb orb-2" />
            <div className="lobby-wide">
                <div className="lobby-topbar">
                    <button className="back-btn" onClick={onBack}>← Back</button>
                    <div className="lobby-topbar-right">
                        <span className="user-greeting">👋 {displayName}</span>
                        <UserButton />
                    </div>
                </div>

                <div className="lobby-header">
                    <span className="role-badge badge-teacher">🎓 Teacher Dashboard</span>
                    <h1 className="lobby-title">Your Classes</h1>
                </div>

                {error && <div className="error-banner">{error}</div>}

                {/* Existing classes */}
                <SignedIn>
                    <div className="classes-section">
                        {loadingClasses ? (
                            <div className="classes-loading">Loading your classes…</div>
                        ) : classes.length === 0 ? (
                            <div className="classes-empty">
                                <div className="classes-empty-icon">📋</div>
                                <p>No active classes yet. Create one below.</p>
                            </div>
                        ) : (
                            <div className="classes-grid">
                                {classes.map((cls) => (
                                    <div key={cls.id} className="class-card">
                                        <div className="class-card-header">
                                            <div>
                                                <div className="class-card-name">{cls.name}</div>
                                                <div className="class-card-code">🔑 {cls.code}</div>
                                            </div>
                                            <div className={`class-presence-dot ${cls.teacherPresent ? 'presence-live' : 'presence-idle'}`} title={cls.teacherPresent ? 'You are live' : 'Not started'} />
                                        </div>
                                        <div className="class-card-meta">
                                            <span>👥 {cls.currentParticipants} / {cls.max_participants}</span>
                                            <span className={cls.teacherPresent ? 'status-live' : 'status-idle'}>
                                                {cls.teacherPresent ? '🔴 Live' : '⚪ Idle'}
                                            </span>
                                        </div>
                                        <div className="class-card-actions">
                                            <button
                                                className="btn btn-primary btn-sm"
                                                onClick={() => onJoinRoom(cls.code, cls.id, displayName, 'teacher', cls.name)}
                                            >
                                                {cls.teacherPresent ? 'Rejoin ↗' : 'Start Class →'}
                                            </button>
                                            <button
                                                className="btn btn-danger btn-sm"
                                                onClick={() => handleDeleteClass(cls)}
                                                disabled={deletingId === cls.id}
                                            >
                                                {deletingId === cls.id ? '…' : '🗑 Delete'}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Create new class */}
                    {!createdCode ? (
                        <div className="create-class-form">
                            <h3 className="create-class-title">Create a New Class</h3>
                            <div className="create-class-row">
                                <input
                                    id="input-room-name"
                                    className="form-input"
                                    type="text"
                                    placeholder="e.g. Math 101 – Period 3"
                                    value={roomName}
                                    onChange={(e) => setRoomName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleCreateClass()}
                                />
                                <button id="btn-create-room" className="btn btn-primary" onClick={handleCreateClass} disabled={loading}>
                                    {loading ? 'Creating…' : '+ Create'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="room-created">
                            <p className="room-created-label">Share this code with students:</p>
                            <div className="room-code-display">{createdCode}</div>
                            <p className="room-created-hint">Students can join with this code</p>
                            <button id="btn-enter-room" className="btn btn-primary btn-full" onClick={() => onJoinRoom(createdCode, createdRoomId, displayName, 'teacher', createdName)}>
                                Start Class →
                            </button>
                            <button className="btn btn-outline btn-full" style={{ marginTop: 8 }} onClick={() => setCreatedCode('')}>
                                Create Another
                            </button>
                        </div>
                    )}
                </SignedIn>

                <SignedOut>
                    <div className="auth-prompt">
                        <p className="auth-prompt-text">Sign in to manage your classes</p>
                        <div className="auth-buttons">
                            <SignInButton><button className="btn btn-primary">Sign In</button></SignInButton>
                            <SignUpButton><button className="btn btn-outline">Create Account</button></SignUpButton>
                        </div>
                    </div>
                </SignedOut>
            </div>
        </div>
    );
}

// ── Student Lobby ────────────────────────────────────────────────────────
function StudentLobby({ onJoinRoom, onBack }: { onJoinRoom: Props['onJoinRoom']; onBack: () => void }) {
    const { user } = useUser();
    const [joinCode, setJoinCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [previousClasses, setPreviousClasses] = useState<ClassInfo[]>([]);
    const [loadingPrev, setLoadingPrev] = useState(false);
    const [lastRefreshed, setLastRefreshed] = useState(0);

    const displayName = user?.profile?.name || user?.email?.split('@')[0] || 'Student';

    // Fetch enrolled classes — backend first (by userId), localStorage fallback
    const fetchEnrolledClasses = useCallback(async () => {
        setLoadingPrev(true);
        try {
            if (user?.id) {
                // Signed-in: pull from InsForge DB (filtered to still-active rooms)
                const res = await fetch(`${SERVER_URL}/api/enrollments/${user.id}`);
                if (res.ok) {
                    const data: ClassInfo[] = await res.json();
                    setPreviousClasses(data);
                    setLastRefreshed(Date.now());
                    setLoadingPrev(false);
                    return;
                }
            }
            // Fallback: localStorage + per-room status check
            const stored = getStoredClasses();
            if (stored.length === 0) { setLoadingPrev(false); return; }
            const results = await Promise.allSettled(
                stored.map((c) =>
                    fetch(`${SERVER_URL}/api/rooms/${c.code}`)
                        .then((r) => r.ok ? r.json() : null)
                )
            );
            const active: ClassInfo[] = [];
            results.forEach((r) => { if (r.status === 'fulfilled' && r.value) active.push(r.value); });
            setPreviousClasses(active);
        } catch { /* ignore */ }
        setLastRefreshed(Date.now());
        setLoadingPrev(false);
    }, [user?.id]);

    // Initial fetch + re-fetch when user signs in
    useEffect(() => { fetchEnrolledClasses(); }, [fetchEnrolledClasses]);

    // Refresh teacher-presence status every 30 seconds
    useEffect(() => {
        const interval = setInterval(fetchEnrolledClasses, 30_000);
        return () => clearInterval(interval);
    }, [fetchEnrolledClasses]);

    const handleJoinByCode = async () => {
        if (!joinCode.trim() || joinCode.length < 4) return setError('Please enter a valid class code');
        setLoading(true); setError('');
        try {
            const res = await fetch(`${SERVER_URL}/api/rooms/${joinCode.trim().toUpperCase()}`);
            const data = await res.json();
            if (!res.ok) { setError(data.error || 'Class not found'); setLoading(false); return; }
            if (data.currentParticipants >= data.max_participants) {
                setError('This class is full (max 5 participants)'); setLoading(false); return;
            }
            setLoading(false);
            onJoinRoom(data.code, data.id, displayName, 'student', data.name);
        } catch { setError('Server unreachable. Is the server running?'); setLoading(false); }
    };

    const handleJoinFromList = (cls: ClassInfo) => {
        onJoinRoom(cls.code, cls.id, displayName, 'student', cls.name);
    };

    return (
        <div className="lobby-container">
            <div className="landing-bg-orb orb-1" />
            <div className="landing-bg-orb orb-2" />
            <div className="lobby-wide">
                <div className="lobby-topbar">
                    <button className="back-btn" onClick={onBack}>← Back</button>
                    <div className="lobby-topbar-right">
                        <SignedIn>
                            <span className="user-greeting">👋 {displayName}</span>
                            <UserButton />
                        </SignedIn>
                    </div>
                </div>

                <div className="lobby-header">
                    <span className="role-badge badge-student">📚 Student</span>
                    <h1 className="lobby-title">Join a Class</h1>
                </div>

                {error && <div className="error-banner">{error}</div>}

                <SignedOut>
                    <div className="auth-prompt">
                        <p className="auth-prompt-text">Sign in to join a class</p>
                        <div className="auth-buttons">
                            <SignInButton><button className="btn btn-primary">Sign In</button></SignInButton>
                            <SignUpButton><button className="btn btn-outline">Create Account</button></SignUpButton>
                        </div>
                    </div>
                </SignedOut>

                <SignedIn>
                    {/* Previously joined / enrolled classes */}
                    {loadingPrev ? (
                        <div className="classes-loading">Checking your classes…</div>
                    ) : previousClasses.length > 0 && (
                        <div className="classes-section">
                            <div className="section-header-row">
                                <h3 className="section-label">Your Classes</h3>
                                <button className="btn-refresh" onClick={fetchEnrolledClasses} title="Refresh">
                                    ↻ Refresh
                                </button>
                            </div>
                            <div className="classes-grid">
                                {previousClasses.map((cls) => (
                                    <div
                                        key={cls.id}
                                        className={`class-card ${cls.teacherPresent ? 'class-card-live' : 'class-card-no-teacher'}`}
                                    >
                                        {/* Live now banner */}
                                        {cls.teacherPresent && (
                                            <div className="live-now-banner">
                                                <span className="live-dot" /> LIVE NOW
                                            </div>
                                        )}
                                        <div className="class-card-header">
                                            <div>
                                                <div className="class-card-name">{cls.name}</div>
                                                <div className="class-card-code">🔑 {cls.code}</div>
                                            </div>
                                            <div
                                                className={`class-presence-dot ${cls.teacherPresent ? 'presence-live' : 'presence-idle'}`}
                                                title={cls.teacherPresent ? 'Teacher is live!' : 'Teacher not present'}
                                            />
                                        </div>
                                        <div className="class-card-meta">
                                            <span>👥 {cls.currentParticipants} / {cls.max_participants}</span>
                                            <span className={cls.teacherPresent ? 'status-live' : 'status-idle'}>
                                                {cls.teacherPresent ? '🔴 Teacher is live' : '⚪ No teacher yet'}
                                            </span>
                                        </div>
                                        <div className="class-card-actions">
                                            <button
                                                className={`btn btn-sm ${cls.teacherPresent ? 'btn-live' : 'btn-primary'}`}
                                                onClick={() => handleJoinFromList(cls)}
                                            >
                                                {cls.teacherPresent ? '▶ Join Live Class' : 'Enter & Wait →'}
                                            </button>
                                        </div>
                                        {!cls.teacherPresent && (
                                            <div className="no-teacher-warning">
                                                ⚠️ Teacher hasn't started yet. You'll have 30s before being removed.
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                            {lastRefreshed > 0 && (
                                <p className="last-refreshed">
                                    Last checked {new Date(lastRefreshed).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                    {' · '}auto-refreshes every 30s
                                </p>
                            )}
                        </div>
                    )}

                    {/* Join by code */}
                    <div className="create-class-form">
                        <h3 className="create-class-title">
                            {previousClasses.length > 0 ? 'Or Join with a Code' : 'Enter Class Code'}
                        </h3>
                        <div className="create-class-row">
                            <input
                                id="input-room-code"
                                className="form-input form-input-code"
                                type="text"
                                placeholder="e.g. A1B2C3"
                                value={joinCode}
                                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                                maxLength={8}
                                onKeyDown={(e) => e.key === 'Enter' && handleJoinByCode()}
                            />
                            <button id="btn-join-room" className="btn btn-primary" onClick={handleJoinByCode} disabled={loading}>
                                {loading ? 'Joining…' : 'Join →'}
                            </button>
                        </div>
                    </div>
                </SignedIn>
            </div>
        </div>
    );
}

// ── Export ───────────────────────────────────────────────────────────────
export default function Lobby({ role, onJoinRoom, onBack }: Props) {
    if (role === 'teacher') return <TeacherLobby onJoinRoom={onJoinRoom} onBack={onBack} />;
    return <StudentLobby onJoinRoom={onJoinRoom} onBack={onBack} />;
}
