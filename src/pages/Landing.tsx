import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { useUser } from '../lib/AuthContext';
import { insforge } from '../lib/insforge';
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
    const [teacherProfiles, setTeacherProfiles] = useState<Record<string, { name: string; avatar_url?: string }>>({});

    // Schedule modal state
    const [scheduleMode, setScheduleMode] = useState(false);
    const [sessionTitle, setSessionTitle] = useState('');
    const [sessionDesc, setSessionDesc] = useState('');
    const [sessionDateTime, setSessionDateTime] = useState('');
    const [sessionImageUrl, setSessionImageUrl] = useState('');
    const [sessionImageFile, setSessionImageFile] = useState<File | null>(null);
    const [uploadingSessionImage, setUploadingSessionImage] = useState(false);
    const [targetStudentIds, setTargetStudentIds] = useState<string[]>([]);
    const [allStudents, setAllStudents] = useState<{ user_id: string; name: string; email: string }[]>([]);
    const [scheduling, setScheduling] = useState(false);
    const [scheduleError, setScheduleError] = useState('');
    const [loadingStudentsList, setLoadingStudentsList] = useState(false);

    // Edit session state
    const [editSessionMode, setEditSessionMode] = useState(false);
    const [editingSession, setEditingSession] = useState<AdminMeeting | null>(null);
    const [editSessionTitle, setEditSessionTitle] = useState('');
    const [editSessionDesc, setEditSessionDesc] = useState('');
    const [editSessionDateTime, setEditSessionDateTime] = useState('');
    const [editSessionImageUrl, setEditSessionImageUrl] = useState('');
    const [editSessionImageFile, setEditSessionImageFile] = useState<File | null>(null);
    const [uploadingEditSessionImage, setUploadingEditSessionImage] = useState(false);
    const [editTargetStudentIds, setEditTargetStudentIds] = useState<string[]>([]);
    const [updatingSession, setUpdatingSession] = useState(false);
    const [updateSessionError, setUpdateSessionError] = useState('');

    // Fetch teacher profiles - must be declared first since other functions depend on it
    const fetchTeacherProfiles = useCallback(async (sessions: AdminMeeting[]) => {
        const uniqueTeacherIds = Array.from(new Set(sessions.map(s => s.created_by)));
        const profilesMap: Record<string, { name: string; avatar_url?: string }> = {};
        
        for (const teacherId of uniqueTeacherIds) {
            try {
                // Fetch user profile from InsForge
                const { data, error } = await insforge.auth.getProfile(teacherId);
                if (!error && data && data.profile) {
                    profilesMap[teacherId] = {
                        name: (data.profile as any).name || 'Teacher',
                        avatar_url: (data.profile as any).avatar_url,
                    };
                }
            } catch (err) {
                console.error('Error fetching teacher profile:', err);
            }
        }
        
        setTeacherProfiles(prev => ({ ...prev, ...profilesMap }));
    }, []);

    const fetchTeacherSessions = useCallback(async () => {
        if (!user?.id || userRole !== 'teacher') return;
        try {
            const r = await fetch(`${SERVER_URL}/api/teacher/sessions/by-host/${user.id}`);
            if (r.ok) {
                const sessions = await r.json();
                setTeacherSessions(sessions);
                // Fetch profiles for these sessions
                await fetchTeacherProfiles(sessions);
            }
        } catch { /* ignore */ }
    }, [user?.id, userRole, fetchTeacherProfiles]);

    const fetchStudentTeacherSessions = useCallback(async () => {
        if (!user?.id || userRole !== 'student') return;
        try {
            const r = await fetch(`${SERVER_URL}/api/teacher/sessions/for-student/${user.id}`);
            if (r.ok) {
                const sessions = await r.json();
                setStudentTeacherSessions(sessions);
                // Fetch profiles for these sessions
                await fetchTeacherProfiles(sessions);
            }
        } catch { /* ignore */ }
    }, [user?.id, userRole, fetchTeacherProfiles]);

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

    const dismissResume = () => { localStorage.removeItem('classmeet_last_room'); setResumeSession(null); };

    const handleSessionImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            alert('Please select an image file');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            alert('File size must be less than 5MB');
            return;
        }

        setUploadingSessionImage(true);

        try {
            // Create preview
            const reader = new FileReader();
            reader.onloadend = () => {
                setSessionImageFile(file);
            };
            reader.readAsDataURL(file);

            // Upload to backend
            const formData = new FormData();
            formData.append('file', file);

            const res = await fetch(`${SERVER_URL}/api/teacher/upload-session-image`, {
                method: 'POST',
                body: formData,
            });

            if (!res.ok) {
                const err = await res.json();
                console.error('Upload error:', err);
                alert('Failed to upload image. Please try again.');
                setSessionImageFile(null);
                return;
            }

            const data = await res.json();
            setSessionImageUrl(data.url);
        } catch (err) {
            console.error('Upload error:', err);
            alert('Failed to upload image. Please try again.');
            setSessionImageFile(null);
        } finally {
            setUploadingSessionImage(false);
        }
    };

    const handleEditSessionImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            alert('Please select an image file');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            alert('File size must be less than 5MB');
            return;
        }

        setUploadingEditSessionImage(true);

        try {
            // Create preview
            const reader = new FileReader();
            reader.onloadend = () => {
                setEditSessionImageFile(file);
            };
            reader.readAsDataURL(file);

            // Upload to backend
            const formData = new FormData();
            formData.append('file', file);

            const res = await fetch(`${SERVER_URL}/api/teacher/upload-session-image`, {
                method: 'POST',
                body: formData,
            });

            if (!res.ok) {
                const err = await res.json();
                console.error('Upload error:', err);
                alert('Failed to upload image. Please try again.');
                setEditSessionImageFile(null);
                return;
            }

            const data = await res.json();
            setEditSessionImageUrl(data.url);
        } catch (err) {
            console.error('Upload error:', err);
            alert('Failed to upload image. Please try again.');
            setEditSessionImageFile(null);
        } finally {
            setUploadingEditSessionImage(false);
        }
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
                    sessionImageUrl,
                }),
            });
            const data = await res.json();
            if (!res.ok) { setScheduleError(data.error || 'Failed to schedule session'); setScheduling(false); return; }
            setScheduleMode(false);
            setSessionTitle(''); setSessionDesc(''); setSessionDateTime(''); setTargetStudentIds([]);
            setSessionImageUrl(''); setSessionImageFile(null);
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

    const handleEditSession = async (session: AdminMeeting) => {
        setEditingSession(session);
        setEditSessionTitle(session.title);
        setEditSessionDesc(session.description || '');
        
        // Format datetime for datetime-local input (keep local timezone)
        const date = new Date(session.scheduled_at);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        setEditSessionDateTime(`${year}-${month}-${day}T${hours}:${minutes}`);
        
        setEditSessionImageUrl(session.session_image_url || '');
        setEditSessionImageFile(null);
        setUpdateSessionError('');
        
        // Fetch current targets
        try {
            const res = await fetch(`${SERVER_URL}/api/teacher/sessions/${session.id}/targets`);
            if (res.ok) {
                const targets = await res.json();
                setEditTargetStudentIds(targets.map((t: any) => t.target_user_id));
            }
        } catch { /* ignore */ }
        
        // Fetch all students
        await fetchAllStudents();
        
        // Open modal after state is set (let React batching complete)
        setTimeout(() => setEditSessionMode(true), 0);
    };

    const handleUpdateSession = async () => {
        if (!editSessionTitle.trim() || !editSessionDateTime || !user?.id || !editingSession) return;
        setUpdatingSession(true); setUpdateSessionError('');
        try {
            const res = await fetch(`${SERVER_URL}/api/teacher/sessions/${editingSession.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    teacherId: user.id,
                    title: editSessionTitle.trim(),
                    description: editSessionDesc.trim(),
                    sessionImageUrl: editSessionImageUrl,
                    scheduledAt: new Date(editSessionDateTime).toISOString(),
                    targetStudentIds: editTargetStudentIds,
                }),
            });
            const data = await res.json();
            if (!res.ok) { setUpdateSessionError(data.error || 'Failed to update session'); setUpdatingSession(false); return; }
            console.log('✅ Session updated, fetching fresh data...');
            await fetchTeacherSessions();
            console.log('✅ Fresh data loaded, closing modal');
            setEditSessionMode(false);
        } catch { setUpdateSessionError('Server unreachable'); }
        setUpdatingSession(false);
    };

    const toggleEditTargetStudent = (id: string) => {
        setEditTargetStudentIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const toggleTargetStudent = (id: string) => {
        setTargetStudentIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
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
                                    <div className={`session-grid ${teacherSessions.length > 1 ? 'session-grid-multi' : ''}`}>
                                    {teacherSessions.map(s => (
                                        <div key={s.id} style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%' }}>
                                            <MeetingBanner
                                                key={s.id}
                                                meeting={s}
                                                displayName={displayName}
                                                userRole="teacher"
                                                isCreator={true}
                                                sessionType="teacher"
                                                onJoin={(code, id, name, role, title) => onJoinRoom(code, id, name, role, title)}
                                            />
                                            <div style={{ position: 'absolute', top: 14, right: 14, display: 'flex', gap: 6, zIndex: 10 }}>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleEditSession(s); }}
                                                    title="Edit session"
                                                    style={{
                                                        background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)',
                                                        borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 600,
                                                        color: '#a5b4fc', cursor: 'pointer',
                                                    }}
                                                >Edit</button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteSession(s); }}
                                                    title="Delete session"
                                                    style={{
                                                        background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)',
                                                        borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 600,
                                                        color: '#fca5a5', cursor: 'pointer',
                                                    }}
                                                >Delete</button>
                                            </div>
                                        </div>
                                    ))}
                                    </div>
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
                                    <div className={`session-grid ${studentTeacherSessions.length > 1 ? 'session-grid-multi' : ''}`}>
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
                    overflowY: 'auto',
                }} onClick={() => setScheduleMode(false)}>
                    <div style={{
                        background: 'linear-gradient(135deg, #1e1b4b 0%, #1e2a4a 100%)',
                        border: '1px solid rgba(99,102,241,0.4)',
                        borderRadius: 20, padding: '32px 28px', width: '100%', maxWidth: 520,
                        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
                        margin: 'auto',
                        maxHeight: '90vh',
                        overflowY: 'auto',
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
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Session Image (optional)</label>
                                {(sessionImageUrl || sessionImageFile) && (
                                    <div style={{ marginBottom: 10 }}>
                                        <img
                                            src={sessionImageUrl || (sessionImageFile ? URL.createObjectURL(sessionImageFile) : '')}
                                            alt="Session preview"
                                            style={{
                                                width: '100%',
                                                maxHeight: 180,
                                                objectFit: 'cover',
                                                borderRadius: 12,
                                                border: '2px solid rgba(99,102,241,0.3)',
                                            }}
                                        />
                                    </div>
                                )}
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleSessionImageUpload}
                                    disabled={uploadingSessionImage}
                                    style={{
                                        width: '100%',
                                        padding: '10px',
                                        background: 'rgba(99,102,241,0.1)',
                                        border: '1px solid rgba(99,102,241,0.3)',
                                        borderRadius: 10,
                                        color: '#e2e8f0',
                                        fontSize: 13,
                                        cursor: uploadingSessionImage ? 'wait' : 'pointer',
                                    }}
                                />
                                {uploadingSessionImage && <div style={{ fontSize: 12, color: '#818cf8', marginTop: 6 }}>Uploading...</div>}
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

            {/* Edit Session Modal */}
            {editSessionMode && editingSession && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 1000,
                    background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
                    overflowY: 'auto',
                }} onClick={() => setEditSessionMode(false)}>
                    <div style={{
                        background: 'linear-gradient(135deg, #1e1b4b 0%, #1e2a4a 100%)',
                        border: '1px solid rgba(99,102,241,0.4)',
                        borderRadius: 20, padding: '32px 28px', width: '100%', maxWidth: 520,
                        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
                        margin: 'auto',
                        maxHeight: '90vh',
                        overflowY: 'auto',
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#f1f5f9' }}>Edit Scheduled Class</h3>
                            <button onClick={() => setEditSessionMode(false)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
                        </div>

                        {updateSessionError && <div className="error-banner" style={{ marginBottom: 16 }}>{updateSessionError}</div>}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Class Title *</label>
                                <input
                                    className="form-input"
                                    type="text"
                                    placeholder="e.g. Math 101 — Chapter 5"
                                    value={editSessionTitle}
                                    onChange={e => setEditSessionTitle(e.target.value)}
                                    style={{ width: '100%', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Session Image (optional)</label>
                                {(editSessionImageUrl || editSessionImageFile) && (
                                    <div style={{ marginBottom: 10 }}>
                                        <img
                                            src={editSessionImageUrl || (editSessionImageFile ? URL.createObjectURL(editSessionImageFile) : '')}
                                            alt="Session preview"
                                            style={{
                                                width: '100%',
                                                maxHeight: 180,
                                                objectFit: 'cover',
                                                borderRadius: 12,
                                                border: '2px solid rgba(99,102,241,0.3)',
                                            }}
                                        />
                                    </div>
                                )}
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleEditSessionImageUpload}
                                    disabled={uploadingEditSessionImage}
                                    style={{
                                        width: '100%',
                                        padding: '10px',
                                        background: 'rgba(99,102,241,0.1)',
                                        border: '1px solid rgba(99,102,241,0.3)',
                                        borderRadius: 10,
                                        color: '#e2e8f0',
                                        fontSize: 13,
                                        cursor: uploadingEditSessionImage ? 'wait' : 'pointer',
                                    }}
                                />
                                {uploadingEditSessionImage && <div style={{ fontSize: 12, color: '#818cf8', marginTop: 6 }}>Uploading...</div>}
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Date & Time *</label>
                                <input
                                    className="form-input"
                                    type="datetime-local"
                                    value={editSessionDateTime}
                                    onChange={e => setEditSessionDateTime(e.target.value)}
                                    style={{ width: '100%', boxSizing: 'border-box', colorScheme: 'dark' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                    Target Students {editTargetStudentIds.length > 0 && <span style={{ color: '#818cf8' }}>({editTargetStudentIds.length} selected)</span>}
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
                                                background: editTargetStudentIds.includes(s.user_id) ? 'rgba(99,102,241,0.15)' : 'transparent',
                                            }}>
                                                <input
                                                    type="checkbox"
                                                    checked={editTargetStudentIds.includes(s.user_id)}
                                                    onChange={() => toggleEditTargetStudent(s.user_id)}
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
                                onClick={() => setEditSessionMode(false)}
                                disabled={updatingSession}
                            >Cancel</button>
                            <button
                                className="btn btn-primary"
                                onClick={handleUpdateSession}
                                disabled={updatingSession || !editSessionTitle.trim() || !editSessionDateTime}
                            >
                                {updatingSession ? 'Updating…' : 'Update Class'}
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

