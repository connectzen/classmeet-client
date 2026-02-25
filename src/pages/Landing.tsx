import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { useUser } from '../lib/AuthContext';
import ChatDrawer from '../components/ChatDrawer';
import AuthModal from '../components/AuthModal';
import UserMenu from '../components/UserMenu';
import MeetingBanner, { AdminMeeting } from '../components/MeetingBanner';

interface ResumeSession {
    roomCode: string;
    roomId: string;
    roomName: string;
    role: 'teacher' | 'student';
    name: string;
}

interface ClassInfo {
    id: string;
    code: string;
    name: string;
    currentParticipants: number;
    max_participants: number;
    teacherPresent: boolean;
}

interface Props {
    onJoinRoom: (roomCode: string, roomId: string, name: string, role: 'teacher' | 'student', roomName: string) => void;
    onResumeSession: (session: ResumeSession) => void;
    onAdminView: () => void;
}

function generateCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getStoredClasses(): { id: string; code: string; name: string }[] {
    try { return JSON.parse(localStorage.getItem('classmeet_joined_classes') || '[]'); } catch { return []; }
}

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

export default function Landing({ onJoinRoom, onResumeSession, onAdminView }: Props) {
    const { user } = useUser();
    const [authModal, setAuthModal] = useState<'signin' | 'signup' | null>(null);
    const [userRole, setUserRole] = useState<'admin' | 'teacher' | 'student' | 'pending' | null>(null);
    const [resumeSession, setResumeSession] = useState<ResumeSession | null>(null);

    // â”€â”€ Teacher state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const [teacherClasses, setTeacherClasses] = useState<ClassInfo[]>([]);
    const [loadingTeacher, setLoadingTeacher] = useState(false);
    const [createMode, setCreateMode] = useState(false);
    const [newClassName, setNewClassName] = useState('');
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState('');
    const [createdClass, setCreatedClass] = useState<{ code: string; id: string; name: string } | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const createInputRef = useRef<HTMLInputElement>(null);

    // Edit class state
    const [editMode, setEditMode] = useState(false);
    const [editingClass, setEditingClass] = useState<ClassInfo | null>(null);
    const [editClassName, setEditClassName] = useState('');
    const [editEnrolledStudents, setEditEnrolledStudents] = useState<string[]>([]);
    const [allStudentsForEdit, setAllStudentsForEdit] = useState<{ user_id: string; name: string; email: string }[]>([]);
    const [updating, setUpdating] = useState(false);
    const [updateError, setUpdateError] = useState('');
    const [loadingEditStudents, setLoadingEditStudents] = useState(false);

    const [studentClasses, setStudentClasses] = useState<ClassInfo[]>([]);
    const [loadingStudent, setLoadingStudent] = useState(false);
    const [joinMode, setJoinMode] = useState(false);
    const [joinCode, setJoinCode] = useState('');
    const [joining, setJoining] = useState(false);
    const [joinError, setJoinError] = useState('');
    const [lastRefreshed, setLastRefreshed] = useState(0);
    const joinInputRef = useRef<HTMLInputElement>(null);

    const displayName = user?.profile?.name || user?.email?.split('@')[0] || '';
    const [chatOpen, setChatOpen] = useState(false);
    const [unreadChatCount, setUnreadChatCount] = useState(0);

    // ── Admin Meetings (banners shown to targeted users) ─────────────────
    const [adminMeetings, setAdminMeetings] = useState<AdminMeeting[]>([]);

    const fetchAdminMeetings = useCallback(async () => {
        if (!user?.id || !userRole || userRole === 'pending') return;
        try {
            const r = await fetch(`${SERVER_URL}/api/admin/meetings/for-user/${user.id}`);
            if (r.ok) setAdminMeetings(await r.json());
        } catch { /* ignore */ }
    }, [user?.id, userRole]);

    // Fetch meetings on mount and every 30s; also subscribe to socket events
    useEffect(() => {
        if (!user?.id || !userRole || userRole === 'pending') return;
        fetchAdminMeetings();
        const pollId = setInterval(fetchAdminMeetings, 30_000);
        const sock = io(SERVER_URL, { transports: ['websocket'] });
        sock.on('admin:meeting-created', () => fetchAdminMeetings());
        sock.on('admin:meeting-ended', ({ meetingId }: { meetingId: string }) => {
            setAdminMeetings(prev => prev.filter(m => m.id !== meetingId));
        });
        sock.on('admin:meeting-updated', () => fetchAdminMeetings());
        return () => {
            clearInterval(pollId);
            sock.disconnect();
        };
    }, [user?.id, userRole, fetchAdminMeetings]);

    // ── Teacher Sessions ──────────────────────────────────────────────────
    const [teacherSessions, setTeacherSessions] = useState<AdminMeeting[]>([]);
    const [studentTeacherSessions, setStudentTeacherSessions] = useState<AdminMeeting[]>([]);

    // Schedule modal state
    const [scheduleMode, setScheduleMode] = useState(false);
    const [sessionTitle, setSessionTitle] = useState('');
    const [sessionDesc, setSessionDesc] = useState('');
    const [sessionDateTime, setSessionDateTime] = useState('');
    const [targetStudentIds, setTargetStudentIds] = useState<string[]>([]);
    const [allStudents, setAllStudents] = useState<{ user_id: string; name: string; email: string }[]>([]);
    const [scheduling, setScheduling] = useState(false);
    const [scheduleError, setScheduleError] = useState('');
    const [loadingStudentsList, setLoadingStudentsList] = useState(false);

    const fetchTeacherSessions = useCallback(async () => {
        if (!user?.id || userRole !== 'teacher') return;
        try {
            const r = await fetch(`${SERVER_URL}/api/teacher/sessions/by-host/${user.id}`);
            if (r.ok) setTeacherSessions(await r.json());
        } catch { /* ignore */ }
    }, [user?.id, userRole]);

    const fetchStudentTeacherSessions = useCallback(async () => {
        if (!user?.id || userRole !== 'student') return;
        try {
            const r = await fetch(`${SERVER_URL}/api/teacher/sessions/for-student/${user.id}`);
            if (r.ok) setStudentTeacherSessions(await r.json());
        } catch { /* ignore */ }
    }, [user?.id, userRole]);

    const fetchAllStudents = useCallback(async () => {
        if (userRole !== 'teacher') return;
        setLoadingStudentsList(true);
        try {
            const r = await fetch(`${SERVER_URL}/api/students`);
            if (r.ok) setAllStudents(await r.json());
        } catch { /* ignore */ }
        setLoadingStudentsList(false);
    }, [userRole]);

    useEffect(() => {
        if (!user?.id || !userRole || userRole === 'pending') return;
        fetchTeacherSessions();
        fetchStudentTeacherSessions();
        const pollIdT = setInterval(fetchTeacherSessions, 30_000);
        const pollIdS = setInterval(fetchStudentTeacherSessions, 30_000);
        const sock2 = io(SERVER_URL, { transports: ['websocket'] });
        sock2.on('teacher:session-created', () => { fetchTeacherSessions(); fetchStudentTeacherSessions(); });
        sock2.on('teacher:session-ended', ({ sessionId }: { sessionId: string }) => {
            setTeacherSessions(prev => prev.filter(s => s.id !== sessionId));
            setStudentTeacherSessions(prev => prev.filter(s => s.id !== sessionId));
        });
        return () => {
            clearInterval(pollIdT);
            clearInterval(pollIdS);
            sock2.disconnect();
        };
    }, [user?.id, userRole, fetchTeacherSessions, fetchStudentTeacherSessions]);

    // Role check — redirect to AdminDashboard if role is admin
    useEffect(() => {
        if (!user?.id) { setUserRole(null); return; }
        const emailParam = user.email ? `?email=${encodeURIComponent(user.email)}` : '';
        fetch(`${SERVER_URL}/api/user-role/${user.id}${emailParam}`)
            .then((r) => r.json())
            .then((d) => {
                setUserRole(d.role);
                if (d.role === 'admin') onAdminView();
            })
            .catch(() => setUserRole('pending'));
    }, [user?.id, onAdminView]);

    // Resume session check
    useEffect(() => {
        const raw = localStorage.getItem('classmeet_last_room');
        if (!raw) return;
        try {
            const session: ResumeSession & { joinedAt: number } = JSON.parse(raw);
            if (Date.now() - session.joinedAt > 2 * 60 * 60 * 1000) {
                localStorage.removeItem('classmeet_last_room'); return;
            }
            fetch(`${SERVER_URL}/api/rooms/${session.roomCode}`)
                .then((r) => r.ok ? r.json() : null)
                .then((data) => { if (data?.id) setResumeSession(session); })
                .catch(() => { });
        } catch { localStorage.removeItem('classmeet_last_room'); }
    }, []);

    // Fetch teacher's classes (only when teacher)
    const fetchTeacherClasses = useCallback(async () => {
        if (!user?.id || userRole !== 'teacher') return;
        setLoadingTeacher(true);
        try {
            const res = await fetch(`${SERVER_URL}/api/rooms/by-host/${user.id}`);
            if (res.ok) setTeacherClasses(await res.json());
        } catch { /* ignore */ }
        setLoadingTeacher(false);
    }, [user?.id, userRole]);

    useEffect(() => { fetchTeacherClasses(); }, [fetchTeacherClasses]);

    // Fetch student enrolled classes
    const fetchStudentClasses = useCallback(async () => {
        if (!user?.id || userRole !== 'student') return;
        setLoadingStudent(true);
        try {
            const res = await fetch(`${SERVER_URL}/api/enrollments/${user.id}`);
            if (res.ok) {
                setStudentClasses(await res.json());
                setLastRefreshed(Date.now());
                setLoadingStudent(false);
                return;
            }
        } catch { /* ignore */ }
        // Fallback: localStorage
        const stored = getStoredClasses();
        if (stored.length === 0) { setLoadingStudent(false); return; }
        const results = await Promise.allSettled(
            stored.map((c) => fetch(`${SERVER_URL}/api/rooms/${c.code}`).then((r) => r.ok ? r.json() : null))
        );
        const active: ClassInfo[] = [];
        results.forEach((r) => { if (r.status === 'fulfilled' && r.value) active.push(r.value); });
        setStudentClasses(active);
        setLastRefreshed(Date.now());
        setLoadingStudent(false);
    }, [user?.id, userRole]);

    useEffect(() => { fetchStudentClasses(); }, [fetchStudentClasses]);

    // Auto-refresh student classes every 30s
    useEffect(() => {
        if (userRole !== 'student') return;
        const interval = setInterval(fetchStudentClasses, 30_000);
        return () => clearInterval(interval);
    }, [fetchStudentClasses, userRole]);

    // Auto-focus inputs when modes activate
    useEffect(() => { if (createMode) setTimeout(() => createInputRef.current?.focus(), 50); }, [createMode]);
    useEffect(() => { if (joinMode) setTimeout(() => joinInputRef.current?.focus(), 50); }, [joinMode]);

    const dismissResume = () => { localStorage.removeItem('classmeet_last_room'); setResumeSession(null); };

    const handleCreateClass = async () => {
        if (!newClassName.trim() || !user) return;
        setCreating(true); setCreateError('');
        const code = generateCode();
        try {
            const res = await fetch(`${SERVER_URL}/api/rooms`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, name: newClassName.trim(), hostId: user.id }),
            });
            const data = await res.json();
            if (!res.ok) { setCreateError(data.error || 'Failed to create class'); setCreating(false); return; }
            setCreatedClass({ code: data.code, id: data.id, name: newClassName.trim() });
            setNewClassName('');
            setCreateMode(false);
            fetchTeacherClasses();
        } catch { setCreateError('Server unreachable'); }
        setCreating(false);
    };

    const handleDeleteClass = async (cls: ClassInfo) => {
        if (!user?.id) return;
        console.log(`[Delete] Attempting to delete class: ${cls.name} (id: ${cls.id})`);
        setDeletingId(cls.id);
        try {
            const res = await fetch(`${SERVER_URL}/api/rooms/${cls.id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hostId: user.id }),
            });
            console.log(`[Delete] Response status: ${res.status}`);
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                console.error(`[Delete] Failed:`, err);
                setCreateError(err.error || `Failed to delete "${cls.name}"`);
            } else {
                console.log(`[Delete] Success! Removing from UI`);
                setTeacherClasses((prev) => prev.filter((c) => c.id !== cls.id));
                if (createdClass?.id === cls.id) setCreatedClass(null);
            }
        } catch (err) {
            console.error(`[Delete] Network error:`, err);
            setCreateError('Server unreachable — could not delete class');
        }
        setDeletingId(null);
    };

    // Edit class functions
    const fetchAllStudentsForEdit = async () => {
        setLoadingEditStudents(true);
        try {
            const r = await fetch(`${SERVER_URL}/api/students`);
            if (r.ok) setAllStudentsForEdit(await r.json());
        } catch { /* ignore */ }
        setLoadingEditStudents(false);
    };

    const handleEditClass = async (cls: ClassInfo) => {
        setEditingClass(cls);
        setEditClassName(cls.name);
        setUpdateError('');
        // Fetch currently enrolled students
        try {
            const r = await fetch(`${SERVER_URL}/api/enrollments/class/${cls.id}`);
            if (r.ok) {
                const enrollments = await r.json();
                setEditEnrolledStudents(enrollments.map((e: { user_id: string }) => e.user_id));
            }
        } catch { /* ignore */ }
        await fetchAllStudentsForEdit();
        setEditMode(true);
    };

    const handleUpdateClass = async () => {
        if (!editingClass || !user?.id || !editClassName.trim()) return;
        setUpdating(true); setUpdateError('');
        try {
            const res = await fetch(`${SERVER_URL}/api/rooms/${editingClass.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: editClassName.trim(),
                    enrolledStudentIds: editEnrolledStudents,
                    hostId: user.id,
                }),
            });
            const data = await res.json();
            if (!res.ok) { setUpdateError(data.error || 'Failed to update class'); setUpdating(false); return; }
            setEditMode(false);
            setEditingClass(null);
            fetchTeacherClasses();
        } catch { setUpdateError('Server unreachable'); }
        setUpdating(false);
    };

    const toggleEditStudent = (userId: string) => {
        setEditEnrolledStudents(prev =>
            prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
        );
    };

    const handleScheduleSession = async () => {
        if (!sessionTitle.trim() || !sessionDateTime || !user?.id) return;
        setScheduling(true); setScheduleError('');
        try {
            const res = await fetch(`${SERVER_URL}/api/teacher/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: sessionTitle.trim(),
                    description: sessionDesc.trim(),
                    scheduledAt: new Date(sessionDateTime).toISOString(),
                    maxParticipants: 30,
                    targetStudentIds,
                    createdBy: user.id,
                }),
            });
            const data = await res.json();
            if (!res.ok) { setScheduleError(data.error || 'Failed to schedule session'); setScheduling(false); return; }
            setScheduleMode(false);
            setSessionTitle(''); setSessionDesc(''); setSessionDateTime(''); setTargetStudentIds([]);
            fetchTeacherSessions();
        } catch { setScheduleError('Server unreachable'); }
        setScheduling(false);
    };

    const handleDeleteSession = async (session: AdminMeeting) => {
        if (!user?.id) return;
        try {
            await fetch(`${SERVER_URL}/api/teacher/sessions/${session.id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ teacherId: user.id }),
            });
            setTeacherSessions(prev => prev.filter(s => s.id !== session.id));
        } catch { /* ignore */ }
    };

    const toggleTargetStudent = (id: string) => {
        setTargetStudentIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const saveEnrollment = async (roomId: string, roomCode: string, roomName: string) => {
        if (!user?.id) return;
        try {
            await fetch(`${SERVER_URL}/api/enrollments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, roomId, roomCode, roomName }),
            });
        } catch { /* best-effort */ }
    };

    const handleJoinByCode = async () => {
        if (!joinCode.trim() || joinCode.length < 4) return;
        setJoining(true); setJoinError('');
        try {
            const res = await fetch(`${SERVER_URL}/api/rooms/${joinCode.trim().toUpperCase()}`);
            const data = await res.json();
            if (!res.ok) { setJoinError(data.error || 'Class not found'); setJoining(false); return; }
            if (data.currentParticipants >= data.max_participants) {
                setJoinError('Class is full'); setJoining(false); return;
            }
            await saveEnrollment(data.id, data.code, data.name);
            onJoinRoom(data.code, data.id, displayName || 'Student', 'student', data.name);
        } catch { setJoinError('Server unreachable'); setJoining(false); }
    };

    return (
        <div className="landing-container">
            <div className="landing-bg-orb orb-1" />
            <div className="landing-bg-orb orb-2" />
            <div className="landing-bg-orb orb-3" />

            {/* â”€â”€ Top nav â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <nav className="landing-nav">
                <div className="landing-nav-logo">
                    <svg viewBox="0 0 32 32" fill="none" width="28" height="28">
                        <circle cx="16" cy="16" r="16" fill="url(#navlg)" />
                        <path d="M9 22V13l7-4 7 4v9" stroke="white" strokeWidth="2" strokeLinejoin="round" />
                        <path d="M13 22v-5h6v5" stroke="white" strokeWidth="2" strokeLinejoin="round" />
                        <circle cx="24" cy="10" r="3" fill="#7c3aed" />
                        <path d="M22.5 10h3M24 8.5v3" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
                        <defs>
                            <linearGradient id="navlg" x1="0" y1="0" x2="32" y2="32">
                                <stop stopColor="#6366f1" /><stop offset="1" stopColor="#8b5cf6" />
                            </linearGradient>
                        </defs>
                    </svg>
                    <span className="landing-nav-brand">ClassMeet</span>
                </div>
                <div className="landing-nav-actions">
                    {!user && (
                        <>
                            <button className="btn-ghost-nav" onClick={() => setAuthModal('signin')}>Sign In</button>
                            <button className="btn-primary-nav" onClick={() => setAuthModal('signup')}>Get Started</button>
                        </>
                    )}
                    {user && (
                        <>
                            <div className="nav-user-info">
                                {userRole === 'admin' && <span className="admin-badge">Admin</span>}
                                {userRole === 'teacher' && <span className="admin-badge" style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}>Teacher</span>}
                                {userRole === 'pending' && <span className="admin-badge" style={{ background: 'rgba(234,179,8,0.12)', color: '#f59e0b', border: '1px solid rgba(234,179,8,0.3)' }}>Pending</span>}
                                <span className="nav-welcome">{displayName}</span>
                            </div>
                            {user?.id && userRole && userRole !== 'pending' && userRole !== 'admin' && (
                                <button onClick={() => setChatOpen(true)} title="Messages"
                                    style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 22, lineHeight: 1, padding: 4 }}>
                                    💬
                                    {unreadChatCount > 0 && (
                                        <span style={{ position: 'absolute', top: 0, right: 0, background: '#6366f1', color: '#fff', borderRadius: '50%', width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>
                                            {unreadChatCount > 9 ? '9+' : unreadChatCount}
                                        </span>
                                    )}
                                </button>
                            )}
                            <UserMenu />
                        </>
                    )}
                </div>
            </nav>

            {/* â”€â”€ Scrollable body â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <div className="landing-scroll-body">

                {/* â”€â”€ Hero â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                <div className="landing-hero">
                    <div className="hero-pill">
                        <span className="hero-pill-dot" />
                        Live · Real-time · Secure
                    </div>

                    {!user && (
                        <>
                            <h1 className="hero-title">
                                Start learning with<br />
                                <span className="hero-title-accent">ClassMeet</span>
                            </h1>
                            <p className="hero-subtitle">
                                Connect with your teacher, join live sessions, and collaborate in real time – from anywhere.
                            </p>
                            <div className="hero-cta-group">
                                <button className="btn-hero-primary" onClick={() => setAuthModal('signin')}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                                        <polyline points="10 17 15 12 10 7" />
                                        <line x1="15" y1="12" x2="3" y2="12" />
                                    </svg>
                                    Sign In to Join
                                </button>
                                <button className="btn-hero-secondary" onClick={() => setAuthModal('signup')}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                        <circle cx="12" cy="7" r="4" />
                                        <line x1="19" y1="8" x2="19" y2="14" />
                                        <line x1="22" y1="11" x2="16" y2="11" />
                                    </svg>
                                    Create Account
                                </button>
                            </div>
                            <div className="hero-features">
                                <div className="feature-chip"><span>🎥</span> HD Video</div>
                                <div className="feature-chip"><span>💬</span> Live Chat</div>
                                <div className="feature-chip"><span>🎙️</span> Audio</div>
                                <div className="feature-chip"><span>👥</span> Up to 5 participants</div>
                            </div>
                        </>
                    )}

                    {user && (
                        <>
                        <h1 className="hero-title hero-title-sm">
                            Welcome back,{' '}
                            <span className="hero-title-accent">{displayName || 'there'}</span>
                        </h1>
                        <p className="hero-subtitle">
                            {userRole === 'teacher'
                                ? 'Manage your classes below, or create a new one.'
                                : userRole === 'pending'
                                ? 'Your account is pending admin approval.'
                                : 'Your enrolled classes are below. Join any live class or enter a code.'}
                        </p>
                        {/* Resume session banner */}
                        {resumeSession && (
                            <div className="resume-banner">
                                <div className="resume-info">
                                    <div className="resume-icon">🔄</div>
                                    <div>
                                        <div className="resume-title">Resume Session</div>
                                        <div className="resume-subtitle">
                                            <span className={`role-badge ${resumeSession.role === 'teacher' ? 'badge-teacher' : 'badge-student'} badge-sm`}>
                                                {resumeSession.role}
                                            </span>
                                            {resumeSession.roomName} · <span className="resume-code">{resumeSession.roomCode}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="resume-actions">
                                    <button className="btn btn-primary btn-sm" onClick={() => onResumeSession(resumeSession)}>Rejoin</button>
                                    <button className="btn-ghost btn-sm" onClick={dismissResume}>Dismiss</button>
                                </div>
                            </div>
                        )}
                        </>
                    )}
                </div>

                {/* â”€â”€ Dashboard panels (signed in only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                {user && (
                    <>
                    {/* ── Admin Meeting Banners ─────────────────────────────────── */}
                    {adminMeetings.length > 0 && userRole && userRole !== 'pending' && (
                        <div style={{ padding: '0 24px', maxWidth: 860, margin: '0 auto', width: '100%' }}>
                            {adminMeetings.map(m => (
                                <MeetingBanner
                                    key={m.id}
                                    meeting={m}
                                    displayName={displayName}
                                    userRole={userRole as 'teacher' | 'student' | 'admin'}                                    isCreator={userRole === 'admin'}
                                    sessionType="admin"                                    onJoin={(code, id, name, role, title) => onJoinRoom(code, id, name, role, title)}
                                />
                            ))}
                        </div>
                    )}

                    {/* PENDING APPROVAL SCREEN */}
                    {userRole === 'pending' && (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 16px' }}>
                            <div style={{
                                background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.05))',
                                border: '1px solid rgba(99,102,241,0.25)',
                                borderRadius: 24,
                                padding: '48px 40px',
                                maxWidth: 480,
                                width: '100%',
                                textAlign: 'center',
                            }}>
                                <div style={{ fontSize: 64, marginBottom: 20, lineHeight: 1 }}>⏳</div>
                                <h2 style={{ margin: '0 0 12px', fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text)' }}>
                                    Awaiting Admin Approval
                                </h2>
                                <p style={{ margin: '0 0 24px', fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                                    Your account has been created and is waiting for an administrator
                                    to approve your access. You'll be able to join classes once approved.
                                </p>
                                <div style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    background: 'rgba(234,179,8,0.12)',
                                    border: '1px solid rgba(234,179,8,0.3)',
                                    borderRadius: 100,
                                    padding: '8px 20px',
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: '#f59e0b',
                                }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
                                    Pending Approval
                                </div>
                                <p style={{ margin: '20px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                                    Contact your administrator if you believe this is taking too long.
                                </p>
                            </div>
                        </div>
                    )}

                    {userRole === 'teacher' && (
                        <div className="dashboard-panel">
                            <div className="dashboard-panel-header">
                                <div className="dashboard-panel-title-group">
                                    <span className="role-badge badge-teacher">🎓 Teacher Dashboard</span>
                                    <h2 className="dashboard-panel-title">Your Classes</h2>
                                </div>

                                {/* Schedule Class button */}
                                <button
                                    className="btn-dashboard-create"
                                    onClick={() => {
                                        setScheduleMode(true);
                                        setScheduleError('');
                                        setSessionTitle('');
                                        setSessionDesc('');
                                        setSessionDateTime('');
                                        setTargetStudentIds([]);
                                        fetchAllStudents();
                                    }}
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                                    </svg>
                                    Schedule Class
                                </button>
                            </div>

                            {/* Teacher-owned session banners */}
                            {teacherSessions.length > 0 && (
                                <div style={{ marginBottom: 8 }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Scheduled Sessions</div>
                                    {teacherSessions.map(s => (
                                        <div key={s.id} style={{ position: 'relative' }}>
                                            <MeetingBanner
                                                meeting={s}
                                                displayName={displayName}
                                                userRole="teacher"
                                                isCreator={true}
                                                sessionType="teacher"
                                                onJoin={(code, id, name, role, title) => onJoinRoom(code, id, name, role, title)}
                                            />
                                            <button
                                                onClick={() => handleDeleteSession(s)}
                                                title="Delete session"
                                                style={{
                                                    position: 'absolute', top: 14, right: 14,
                                                    background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)',
                                                    borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 600,
                                                    color: '#fca5a5', cursor: 'pointer',
                                                }}
                                            >Delete</button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {createError && <div className="error-banner" style={{ marginBottom: 12 }}>{createError}</div>}

                            {/* Newly-created class highlight */}
                            {createdClass && (
                                <div className="created-class-banner">
                                    <div className="created-class-info">
                                        <span className="created-class-name">✅ {createdClass.name}</span>
                                        <span className="created-class-share">Share this code with students:</span>
                                        <span className="code-chip">{createdClass.code}</span>
                                    </div>
                                    <button
                                        className="btn btn-primary btn-sm"
                                        onClick={() => onJoinRoom(createdClass.code, createdClass.id, displayName || 'Teacher', 'teacher', createdClass.name)}
                                    >
                                        Start Class →
                                    </button>
                                </div>
                            )}

                            {/* Classes grid */}
                            {loadingTeacher ? (
                                <div className="classes-loading">Loading your classes…</div>
                            ) : teacherClasses.length === 0 ? (
                                <div className="classes-empty">
                                    <div className="classes-empty-icon">📋</div>
                                    <p>No active classes yet. Click <strong>Schedule Class</strong> to create one.</p>
                                </div>
                            ) : (
                                <div className="classes-grid">
                                    {teacherClasses.map((cls) => (
                                        <div key={cls.id} className={`class-card ${cls.teacherPresent ? 'class-card-live' : ''}`}>
                                            {cls.teacherPresent && (
                                                <div className="live-now-banner"><span className="live-dot" /> LIVE NOW</div>
                                            )}
                                            <div className="class-card-header">
                                                <div>
                                                    <div className="class-card-name">{cls.name}</div>
                                                    <div className="class-card-code">🔑 {cls.code}</div>
                                                </div>
                                                <div className={`class-presence-dot ${cls.teacherPresent ? 'presence-live' : 'presence-idle'}`} />
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
                                                    onClick={() => onJoinRoom(cls.code, cls.id, displayName || 'Teacher', 'teacher', cls.name)}
                                                >
                                                    {cls.teacherPresent ? 'Rejoin ↗' : 'Start Class →'}
                                                </button>
                                                <button
                                                    className="btn btn-sm"
                                                    onClick={() => handleEditClass(cls)}
                                                    style={{
                                                        background: 'var(--surface-3)',
                                                        color: 'var(--text-1)',
                                                        border: '1px solid var(--surface-4)',
                                                    }}
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    className="btn btn-danger btn-sm"
                                                    onClick={() => handleDeleteClass(cls)}
                                                    disabled={deletingId === cls.id}
                                                >
                                                    {deletingId === cls.id ? 'Deleting...' : 'Delete'}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* STUDENT DASHBOARD */}
                    {userRole === 'student' && (
                        <div className="dashboard-panel">
                            <div className="dashboard-panel-header">
                                <div className="dashboard-panel-title-group">
                                    <span className="role-badge badge-student">📚 Student Dashboard</span>
                                    <h2 className="dashboard-panel-title">Your Classes</h2>
                                </div>
                            </div>

                            {/* Student scheduled sessions (teacher sessions they're targeted for) */}
                            {studentTeacherSessions.length > 0 && (
                                <div style={{ marginBottom: 8 }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Scheduled Sessions</div>
                                    {studentTeacherSessions.map(s => (
                                        <MeetingBanner
                                            key={s.id}
                                            meeting={s}
                                            displayName={displayName}
                                            userRole="student"
                                            isCreator={false}
                                            sessionType="teacher"
                                            onJoin={(code, id, name, role, title) => onJoinRoom(code, id, name, role, title)}
                                        />
                                    ))}
                                </div>
                            )}

                            {/* Enrolled classes grid */}
                            {loadingStudent ? (
                                <div className="classes-loading">Loading your classes…</div>
                            ) : studentClasses.length === 0 ? (
                                <div className="classes-empty">
                                    <div className="classes-empty-icon">📋</div>
                                    <p>No enrolled classes yet.</p>
                                </div>
                            ) : (
                                <div className="classes-grid">
                                        {studentClasses.map((cls) => (
                                            <div key={cls.id} className={`class-card ${cls.teacherPresent ? 'class-card-live' : ''}`}>
                                                {cls.teacherPresent && (
                                                    <div className="live-now-banner"><span className="live-dot" /> LIVE NOW</div>
                                                )}
                                                <div className="class-card-header">
                                                    <div>
                                                        <div className="class-card-name">{cls.name}</div>
                                                        <div className="class-card-code">🔑 {cls.code}</div>
                                                    </div>
                                                    <div className={`class-presence-dot ${cls.teacherPresent ? 'presence-live' : 'presence-idle'}`} />
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
                                                        onClick={() => onJoinRoom(cls.code, cls.id, displayName || 'Student', 'student', cls.name)}
                                                    >
                                                        {cls.teacherPresent ? 'Join Now →' : 'Join Class'}
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                            )}
                        </div>
                    )}
                    </>
                )}


                <p className="landing-footer">Secure · Real-time · Up to 5 participants per session</p>
            </div>
            {/* Schedule Class Modal */}
            {scheduleMode && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 1000,
                    background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
                }} onClick={() => setScheduleMode(false)}>
                    <div style={{
                        background: 'linear-gradient(135deg, #1e1b4b 0%, #1e2a4a 100%)',
                        border: '1px solid rgba(99,102,241,0.4)',
                        borderRadius: 20, padding: '32px 28px', width: '100%', maxWidth: 520,
                        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#f1f5f9' }}>Schedule a Class</h3>
                            <button onClick={() => setScheduleMode(false)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
                        </div>

                        {scheduleError && <div className="error-banner" style={{ marginBottom: 16 }}>{scheduleError}</div>}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Class Title *</label>
                                <input
                                    className="form-input"
                                    type="text"
                                    placeholder="e.g. Math 101 — Chapter 5"
                                    value={sessionTitle}
                                    onChange={e => setSessionTitle(e.target.value)}
                                    style={{ width: '100%', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Description (optional)</label>
                                <textarea
                                    className="form-input"
                                    placeholder="What will be covered in this class?"
                                    value={sessionDesc}
                                    onChange={e => setSessionDesc(e.target.value)}
                                    rows={2}
                                    style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Date & Time *</label>
                                <input
                                    className="form-input"
                                    type="datetime-local"
                                    value={sessionDateTime}
                                    onChange={e => setSessionDateTime(e.target.value)}
                                    style={{ width: '100%', boxSizing: 'border-box', colorScheme: 'dark' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                    Target Students {targetStudentIds.length > 0 && <span style={{ color: '#818cf8' }}>({targetStudentIds.length} selected)</span>}
                                </label>
                                {loadingStudentsList ? (
                                    <div style={{ fontSize: 13, color: '#64748b' }}>Loading students…</div>
                                ) : allStudents.length === 0 ? (
                                    <div style={{ fontSize: 13, color: '#64748b' }}>No approved students found.</div>
                                ) : (
                                    <div style={{
                                        maxHeight: 180, overflowY: 'auto',
                                        border: '1px solid rgba(99,102,241,0.3)', borderRadius: 10,
                                        background: 'rgba(99,102,241,0.05)',
                                    }}>
                                        {allStudents.map(s => (
                                            <label key={s.user_id} style={{
                                                display: 'flex', alignItems: 'center', gap: 10,
                                                padding: '8px 12px', cursor: 'pointer',
                                                borderBottom: '1px solid rgba(99,102,241,0.1)',
                                                background: targetStudentIds.includes(s.user_id) ? 'rgba(99,102,241,0.15)' : 'transparent',
                                            }}>
                                                <input
                                                    type="checkbox"
                                                    checked={targetStudentIds.includes(s.user_id)}
                                                    onChange={() => toggleTargetStudent(s.user_id)}
                                                    style={{ accentColor: '#6366f1' }}
                                                />
                                                <div>
                                                    <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{s.name || s.email}</div>
                                                    {s.name && <div style={{ fontSize: 11, color: '#64748b' }}>{s.email}</div>}
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
                            <button
                                className="btn-ghost btn-sm"
                                onClick={() => setScheduleMode(false)}
                                disabled={scheduling}
                            >Cancel</button>
                            <button
                                className="btn btn-primary"
                                onClick={handleScheduleSession}
                                disabled={scheduling || !sessionTitle.trim() || !sessionDateTime}
                            >
                                {scheduling ? 'Scheduling…' : 'Schedule Class'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Class Modal */}
            {editMode && editingClass && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 1000,
                    background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
                }} onClick={() => setEditMode(false)}>
                    <div style={{
                        background: 'linear-gradient(135deg, #1e1b4b 0%, #1e2a4a 100%)',
                        border: '1px solid rgba(99,102,241,0.4)',
                        borderRadius: 20, padding: '32px 28px', width: '100%', maxWidth: 520,
                        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#f1f5f9' }}>Edit Class</h3>
                            <button onClick={() => setEditMode(false)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
                        </div>

                        {updateError && <div className="error-banner" style={{ marginBottom: 16 }}>{updateError}</div>}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Class Name *</label>
                                <input
                                    className="form-input"
                                    type="text"
                                    placeholder="e.g. Math 101 — Period 3"
                                    value={editClassName}
                                    onChange={e => setEditClassName(e.target.value)}
                                    style={{ width: '100%', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                    Class Code (read-only)
                                </label>
                                <input
                                    className="form-input"
                                    type="text"
                                    value={editingClass.code}
                                    readOnly
                                    style={{ width: '100%', boxSizing: 'border-box', opacity: 0.6, cursor: 'not-allowed' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                    Enrolled Students {editEnrolledStudents.length > 0 && <span style={{ color: '#818cf8' }}>({editEnrolledStudents.length} selected)</span>}
                                </label>
                                {loadingEditStudents ? (
                                    <div style={{ fontSize: 13, color: '#64748b' }}>Loading students…</div>
                                ) : allStudentsForEdit.length === 0 ? (
                                    <div style={{ fontSize: 13, color: '#64748b' }}>No students found.</div>
                                ) : (
                                    <div style={{
                                        maxHeight: 200, overflowY: 'auto',
                                        border: '1px solid rgba(99,102,241,0.3)', borderRadius: 10,
                                        background: 'rgba(99,102,241,0.05)',
                                    }}>
                                        {allStudentsForEdit.map(s => (
                                            <label key={s.user_id} style={{
                                                display: 'flex', alignItems: 'center', gap: 10,
                                                padding: '8px 12px', cursor: 'pointer',
                                                borderBottom: '1px solid rgba(99,102,241,0.1)',
                                                background: editEnrolledStudents.includes(s.user_id) ? 'rgba(99,102,241,0.15)' : 'transparent',
                                            }}>
                                                <input
                                                    type="checkbox"
                                                    checked={editEnrolledStudents.includes(s.user_id)}
                                                    onChange={() => toggleEditStudent(s.user_id)}
                                                    style={{ accentColor: '#6366f1' }}
                                                />
                                                <div>
                                                    <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{s.name || s.email}</div>
                                                    {s.name && <div style={{ fontSize: 11, color: '#64748b' }}>{s.email}</div>}
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
                            <button
                                className="btn-ghost btn-sm"
                                onClick={() => setEditMode(false)}
                                disabled={updating}
                            >Cancel</button>
                            <button
                                className="btn btn-primary"
                                onClick={handleUpdateClass}
                                disabled={updating || !editClassName.trim()}
                            >
                                {updating ? 'Updating…' : 'Update Class'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {authModal && <AuthModal defaultTab={authModal} onClose={() => setAuthModal(null)} />}
            {user?.id && userRole && userRole !== 'pending' && userRole !== 'admin' && (
                <ChatDrawer
                    userId={user.id}
                    userName={displayName}
                    userRole={userRole}
                    open={chatOpen}
                    onClose={() => setChatOpen(false)}
                    onUnreadChange={setUnreadChatCount}
                />
            )}
        </div>
    );
}

