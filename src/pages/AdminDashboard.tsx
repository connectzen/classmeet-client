import { useState, useEffect, useCallback, useRef } from 'react';
import { useUser } from '../lib/AuthContext';
import UserMenu from '../components/UserMenu';
import ChatDrawer from '../components/ChatDrawer';
import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

interface Teacher { user_id: string; name: string; email: string; created_at: string; room_count: number; }
interface Student { user_id: string; name: string; email: string; created_at: string; enrollment_count: number; }
interface Member { user_id: string; name: string; email: string; created_at: string; }
interface InboxMsg { id?: string; [key: string]: unknown; }
interface Meeting {
    id: string; room_code: string; room_id: string; title: string; description: string;
    scheduled_at: string; created_by: string; max_participants: number; is_active: boolean;
    created_at: string; targets: Array<{ type: string; value: string }>;
}
interface AdminStats { membersCount: number; teachersCount: number; studentsCount: number; liveGuestCount: number; }
interface BackendStats { plan: string | null; storageTotal: number | null; storageUsed: number | null; storageRemaining: number | null; usageTrends?: unknown[]; warnings?: string[]; }
interface HealthStatus { status: 'ok' | 'degraded'; database?: string; error?: string; }
type Tab = 'overview' | 'members' | 'teachers' | 'students' | 'messages' | 'pending' | 'meetings';

const NAV_ITEMS: { key: Tab; icon: string; label: string }[] = [
    { key: 'overview',  icon: '◈', label: 'Overview'  },
    { key: 'members',   icon: '👤', label: 'Members'  },
    { key: 'teachers',  icon: '◎', label: 'Teachers'  },
    { key: 'students',  icon: '◉', label: 'Students'  },
    { key: 'pending',   icon: '⏳', label: 'Pending'   },
    { key: 'meetings',  icon: '📅', label: 'Meetings'  },
    { key: 'messages',  icon: '◆', label: 'Messages'  },
];

interface Props {
    onJoinRoom: (roomCode: string, roomId: string, name: string, role: 'teacher' | 'student', roomName: string) => void;
}

export default function AdminDashboard({ onJoinRoom }: Props) {
    const { user } = useUser();
    const [tab, setTab] = useState<Tab>('overview');

    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const [loadingTeachers, setLoadingTeachers] = useState(false);
    const [showAddTeacher, setShowAddTeacher] = useState(false);
    const [teacherForm, setTeacherForm] = useState({ name: '', email: '', tempPassword: '' });
    const [showTempPassword, setShowTempPassword] = useState(true);
    const [teacherError, setTeacherError] = useState('');
    const [editTeacher, setEditTeacher] = useState<Teacher | null>(null);

    const [students, setStudents] = useState<Student[]>([]);
    const [loadingStudents, setLoadingStudents] = useState(false);

    const [members, setMembers] = useState<Member[]>([]);
    const [loadingMembers, setLoadingMembers] = useState(false);
    const [showAddMember, setShowAddMember] = useState(false);
    const [memberForm, setMemberForm] = useState({ name: '', email: '', tempPassword: '' });
    const [memberError, setMemberError] = useState('');
    const [showMemberTempPassword, setShowMemberTempPassword] = useState(true);
    const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
    const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
    const [backendStats, setBackendStats] = useState<BackendStats | null>(null);
    const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);

    const [pendingUsers, setPendingUsers] = useState<{ id: string; name: string; email: string; created_at: string | null }[]>([]);
    const [loadingPending, setLoadingPending] = useState(false);
    const [approvingId, setApprovingId] = useState<string | null>(null);
    const [rejectingId, setRejectingId] = useState<string | null>(null);
    const [approveError, setApproveError] = useState<string>('');

    const [sentMessages, setSentMessages] = useState<InboxMsg[]>([]);

    // ── Meetings state ────────────────────────────────────────────────────
    const [meetings, setMeetings] = useState<Meeting[]>([]);
    const [loadingMeetings, setLoadingMeetings] = useState(false);
    const [showCreateMeeting, setShowCreateMeeting] = useState(false);
    const [meetingError, setMeetingError] = useState('');
    const [endingMeetingId, setEndingMeetingId] = useState<string | null>(null);
    const [meetingForm, setMeetingForm] = useState({
        title: '', description: '', scheduledAt: '', maxParticipants: 30,
    });
    const [meetingTargets, setMeetingTargets] = useState<{ type: string; value: string; label: string }[]>([]);
    const [allRooms, setAllRooms] = useState<{ id: string; code: string; name: string; host_id: string }[]>([]);
    const [allUsers, setAllUsers] = useState<{ id: string; name: string; email: string; role: string }[]>([]);
    const [userSearch, setUserSearch] = useState('');
    const [creatingMeeting, setCreatingMeeting] = useState(false);
    const [editingMeetingId, setEditingMeetingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({ title: '', description: '', scheduledAt: '', maxParticipants: 30 });
    const [editTargets, setEditTargets] = useState<{ type: string; value: string; label: string }[]>([]);
    const [editError, setEditError] = useState('');
    const [savingEdit, setSavingEdit] = useState(false);
    const [deletingMeetingId, setDeletingMeetingId] = useState<string | null>(null);

    const displayName = user?.profile?.name || user?.email?.split('@')[0] || 'Admin';

    // Mobile detection (sidebar → bottom tab bar below 640 px)
    const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    useEffect(() => {
        const handler = () => setIsMobile(window.innerWidth < 640);
        window.addEventListener('resize', handler);
        return () => window.removeEventListener('resize', handler);
    }, []);

    // ── Fetch helpers ─────────────────────────────────────────────────────
    const fetchTeachers = useCallback(async () => {
        setLoadingTeachers(true);
        try { const r = await fetch(`${SERVER_URL}/api/teachers`); if (r.ok) setTeachers(await r.json()); } catch {}
        setLoadingTeachers(false);
    }, []);

    const fetchStudents = useCallback(async () => {
        setLoadingStudents(true);
        try { const r = await fetch(`${SERVER_URL}/api/students`); if (r.ok) setStudents(await r.json()); } catch {}
        setLoadingStudents(false);
    }, []);

    const fetchMembers = useCallback(async () => {
        setLoadingMembers(true);
        try { const r = await fetch(`${SERVER_URL}/api/members`); if (r.ok) setMembers(await r.json()); } catch {}
        setLoadingMembers(false);
    }, []);

    const fetchAdminStats = useCallback(async () => {
        if (!user?.id) return;
        try {
            const r = await fetch(`${SERVER_URL}/api/admin/stats?adminId=${encodeURIComponent(user.id)}`);
            if (r.ok) setAdminStats(await r.json());
        } catch {}
    }, [user?.id]);

    const fetchHealth = useCallback(async () => {
        if (!user?.id) return;
        try {
            const r = await fetch(`${SERVER_URL}/api/admin/health?adminId=${encodeURIComponent(user.id)}`);
            const data = await r.json();
            setHealthStatus(data);
        } catch { setHealthStatus({ status: 'degraded', error: 'Request failed' }); }
    }, [user?.id]);

    const fetchBackendStats = useCallback(async () => {
        if (!user?.id) return;
        try {
            const r = await fetch(`${SERVER_URL}/api/admin/backend-stats?adminId=${encodeURIComponent(user.id)}`);
            if (r.ok) setBackendStats(await r.json());
        } catch { setBackendStats(null); }
    }, [user?.id]);

    const fetchSentMessages = useCallback(async () => {
        if (!user?.id) return;
        try { const r = await fetch(`${SERVER_URL}/api/messages/sent/${user.id}`); if (r.ok) setSentMessages(await r.json()); } catch {}
    }, [user?.id]);

    const fetchPendingUsers = useCallback(async () => {
        setLoadingPending(true);
        try { const r = await fetch(`${SERVER_URL}/api/pending-users`); if (r.ok) setPendingUsers(await r.json()); } catch {}
        setLoadingPending(false);
    }, []);

    const fetchMeetings = useCallback(async () => {
        setLoadingMeetings(true);
        try { const r = await fetch(`${SERVER_URL}/api/admin/meetings`); if (r.ok) setMeetings(await r.json()); } catch {}
        setLoadingMeetings(false);
    }, []);

    const fetchAllRooms = useCallback(async () => {
        try { const r = await fetch(`${SERVER_URL}/api/admin/all-rooms`); if (r.ok) setAllRooms(await r.json()); } catch {}
    }, []);

    const fetchAllUsers = useCallback(async () => {
        try { const r = await fetch(`${SERVER_URL}/api/all-users`); if (r.ok) setAllUsers(await r.json()); } catch {}
    }, []);

    // ── Real-time auto-refresh via socket.io ─────────────────────────────
    const refreshCurrentTab = useCallback(() => {
        if (tab === 'overview') { fetchTeachers(); fetchStudents(); fetchMembers(); fetchAdminStats(); fetchBackendStats(); fetchPendingUsers(); fetchSentMessages(); fetchMeetings(); }
        else if (tab === 'members') fetchMembers();
        else if (tab === 'teachers') fetchTeachers();
        else if (tab === 'students') fetchStudents();
        else if (tab === 'pending')  fetchPendingUsers();
        else if (tab === 'meetings') { fetchMeetings(); fetchAllRooms(); fetchAllUsers(); }
    }, [tab, fetchTeachers, fetchStudents, fetchPendingUsers, fetchSentMessages, fetchMeetings, fetchAllRooms, fetchAllUsers]);

    // 30-second polling for the active tab
    useEffect(() => {
        const id = setInterval(refreshCurrentTab, 30_000);
        return () => clearInterval(id);
    }, [refreshCurrentTab]);

    // Socket.io — listen for `admin:refresh` events emitted by server on data changes
    const socketRef = useRef<ReturnType<typeof io> | null>(null);
    useEffect(() => {
        const sock = io(SERVER_URL, { transports: ['websocket'] });
        socketRef.current = sock;
        sock.on('admin:refresh', ({ type }: { type: string }) => {
            if (type === 'teachers' || type === 'overview') { fetchTeachers(); fetchStudents(); }
            if (type === 'students') fetchStudents();
            if (type === 'members') fetchMembers();
            if (type === 'pending')  { fetchPendingUsers(); fetchTeachers(); fetchStudents(); fetchMembers(); }
            fetchTeachers();
            fetchStudents();
            fetchPendingUsers();
        });
        sock.on('admin:meeting-created', () => fetchMeetings());
        sock.on('admin:meeting-ended', ({ meetingId }: { meetingId: string }) => {
            setMeetings(prev => prev.filter(m => m.id !== meetingId));
        });
        sock.on('admin:meeting-updated', () => fetchMeetings());
        return () => { sock.disconnect(); };
    }, [fetchTeachers, fetchStudents, fetchPendingUsers, fetchMeetings, setMeetings]);

    const handleApproveUser = async (userId: string, name: string, email: string, role: 'member' | 'teacher' | 'student' = 'student') => {
        setApprovingId(userId); setApproveError('');
        const r = await fetch(`${SERVER_URL}/api/approve-user/${userId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, role }),
        });
        if (r.ok) { fetchPendingUsers(); fetchStudents(); fetchTeachers(); fetchMembers(); }
        else { const d = await r.json(); setApproveError(d.error || 'Failed to approve.'); }
        setApprovingId(null);
    };

    const handleRejectUser = async (userId: string) => {
        if (!user?.id) return;
        setRejectingId(userId); setApproveError('');
        try {
            const r = await fetch(`${SERVER_URL}/api/reject-user/${userId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ adminId: user.id }),
            });
            if (r.ok) fetchPendingUsers();
            else { const d = await r.json(); setApproveError(d.error || 'Failed to reject.'); }
        } finally {
            setRejectingId(null);
        }
    };

    useEffect(() => {
        if (tab === 'overview') { fetchTeachers(); fetchStudents(); fetchMembers(); fetchAdminStats(); fetchBackendStats(); fetchHealth(); fetchSentMessages(); fetchPendingUsers(); fetchMeetings(); }
        if (tab === 'members') fetchMembers();
        if (tab === 'teachers') fetchTeachers();
        if (tab === 'students') { fetchStudents(); }
        if (tab === 'pending')  fetchPendingUsers();
        if (tab === 'meetings') { fetchMeetings(); fetchAllRooms(); fetchAllUsers(); }
        if (tab === 'messages') { /* ChatDrawer handles its own data */ }
    }, [tab, fetchTeachers, fetchStudents, fetchMembers, fetchAdminStats, fetchBackendStats, fetchHealth, fetchSentMessages, fetchPendingUsers, fetchMeetings, fetchAllRooms, fetchAllUsers]);

    // Always fetch sidebar stats on mount regardless of starting tab
    useEffect(() => {
        fetchTeachers();
        fetchStudents();
        fetchMembers();
        fetchAdminStats();
        fetchPendingUsers();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleAddTeacher = async () => {
        setTeacherError('');
        if (!teacherForm.name || !teacherForm.email || !teacherForm.tempPassword) { setTeacherError('All fields are required.'); return; }
        const r = await fetch(`${SERVER_URL}/api/teachers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(teacherForm) });
        if (r.ok) { setShowAddTeacher(false); setTeacherForm({ name: '', email: '', tempPassword: '' }); fetchTeachers(); }
        else { const d = await r.json(); setTeacherError(d.error || 'Failed.'); }
    };

    const handleUpdateTeacher = async () => {
        if (!editTeacher) return;
        const r = await fetch(`${SERVER_URL}/api/teachers/${editTeacher.user_id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: editTeacher.name, email: editTeacher.email }) });
        if (r.ok) { setEditTeacher(null); fetchTeachers(); }
    };

    const handleDeleteTeacher = async (userId: string) => {
        if (!confirm('Remove this teacher? This will also delete their account.')) return;
        await fetch(`${SERVER_URL}/api/teachers/${userId}`, { method: 'DELETE' });
        fetchTeachers();
    };

    const handleDeleteStudent = async (userId: string) => {
        if (!confirm('Remove this student? This will delete their account and all enrollments.')) return;
        await fetch(`${SERVER_URL}/api/students/${userId}`, { method: 'DELETE' });
        fetchStudents();
    };

    const handleAddMember = async () => {
        setMemberError('');
        if (!memberForm.name || !memberForm.email || !memberForm.tempPassword) { setMemberError('All fields are required.'); return; }
        if (!user?.id) { setMemberError('You must be logged in.'); return; }
        const r = await fetch(`${SERVER_URL}/api/members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...memberForm, adminId: user.id }),
        });
        if (r.ok) { setShowAddMember(false); setMemberForm({ name: '', email: '', tempPassword: '' }); fetchMembers(); }
        else { const d = await r.json(); setMemberError(d.error || 'Failed.'); }
    };

    const ROLES = ['member', 'teacher', 'student'] as const;
    const handleEditRole = async (userId: string, role: string) => {
        if (!user?.id || !ROLES.includes(role as typeof ROLES[number])) return;
        setEditingRoleId(userId);
        const r = await fetch(`${SERVER_URL}/api/user-role/${userId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role, adminId: user.id }),
        });
        setEditingRoleId(null);
        if (r.ok) { fetchMembers(); fetchTeachers(); fetchStudents(); }
        else { const d = await r.json(); alert(d.error || 'Failed to update role'); }
    };

    const handleCreateMeeting = async () => {
        setMeetingError('');
        if (!meetingForm.title.trim()) { setMeetingError('Title is required.'); return; }
        if (!meetingForm.scheduledAt) { setMeetingError('Scheduled date/time is required.'); return; }
        if (meetingTargets.length === 0) { setMeetingError('Add at least one target audience.'); return; }
        if (!user?.id) return;
        setCreatingMeeting(true);
        const r = await fetch(`${SERVER_URL}/api/admin/meetings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: meetingForm.title.trim(),
                description: meetingForm.description.trim(),
                scheduledAt: new Date(meetingForm.scheduledAt).toISOString(),
                maxParticipants: meetingForm.maxParticipants,
                targets: meetingTargets.map(t => ({ type: t.type, value: t.value })),
                createdBy: user.id,
            }),
        });
        setCreatingMeeting(false);
        if (r.ok) {
            setShowCreateMeeting(false);
            setMeetingForm({ title: '', description: '', scheduledAt: '', maxParticipants: 30 });
            setMeetingTargets([]);
            fetchMeetings();
        } else {
            const d = await r.json();
            setMeetingError(d.error || 'Failed to create meeting.');
        }
    };

    const handleEndMeeting = async (meetingId: string) => {
        if (!confirm('End this meeting? The room will be closed and the banner will disappear for all users.')) return;
        if (!user?.id) return;
        setEndingMeetingId(meetingId);
        await fetch(`${SERVER_URL}/api/admin/meetings/${meetingId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminId: user.id }),
        });
        setEndingMeetingId(null);
        fetchMeetings();
    };

    const addTargetRole = (role: 'teacher' | 'student') => {
        const key = `role:${role}`;
        if (meetingTargets.some(t => t.type === 'role' && t.value === role)) return;
        setMeetingTargets(prev => [...prev, { type: 'role', value: role, label: `All ${role.charAt(0).toUpperCase() + role.slice(1)}s` }]);
    };

    const addTargetRoom = (room: { id: string; name: string }) => {
        if (meetingTargets.some(t => t.type === 'room' && t.value === room.id)) return;
        setMeetingTargets(prev => [...prev, { type: 'room', value: room.id, label: `Class: ${room.name}` }]);
    };

    const addTargetUser = (u: { id: string; name: string; email: string }) => {
        if (meetingTargets.some(t => t.type === 'user' && t.value === u.id)) return;
        setMeetingTargets(prev => [...prev, { type: 'user', value: u.id, label: `${u.name || u.email}` }]);
        setUserSearch('');
    };

    const removeTarget = (idx: number) => setMeetingTargets(prev => prev.filter((_, i) => i !== idx));

    const startEditMeeting = (m: Meeting) => {
        setEditingMeetingId(m.id);
        const localDt = new Date(m.scheduled_at);
        const pad = (n: number) => String(n).padStart(2, '0');
        const localStr = `${localDt.getFullYear()}-${pad(localDt.getMonth() + 1)}-${pad(localDt.getDate())}T${pad(localDt.getHours())}:${pad(localDt.getMinutes())}`;
        setEditForm({ title: m.title, description: m.description || '', scheduledAt: localStr, maxParticipants: m.max_participants });
        if (Array.isArray(m.targets)) {
            setEditTargets(m.targets.map(t => ({
                type: t.type,
                value: t.value,
                label: t.type === 'role'
                    ? `All ${t.value.charAt(0).toUpperCase() + t.value.slice(1)}s`
                    : t.type === 'room'
                    ? `Class: ${allRooms.find(r => r.id === t.value)?.name || t.value}`
                    : allUsers.find(u => u.id === t.value)?.name || t.value,
            })));
        } else {
            setEditTargets([]);
        }
        setEditError('');
    };

    const handleSaveEdit = async () => {
        setEditError('');
        if (!editForm.title.trim()) { setEditError('Title is required.'); return; }
        if (!editForm.scheduledAt) { setEditError('Scheduled date/time is required.'); return; }
        if (!user?.id) return;
        setSavingEdit(true);
        const r = await fetch(`${SERVER_URL}/api/admin/meetings/${editingMeetingId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                adminId: user.id,
                title: editForm.title.trim(),
                description: editForm.description.trim(),
                scheduledAt: new Date(editForm.scheduledAt).toISOString(),
                maxParticipants: editForm.maxParticipants,
                targets: editTargets.map(t => ({ type: t.type, value: t.value })),
            }),
        });
        setSavingEdit(false);
        if (r.ok) {
            setEditingMeetingId(null);
            fetchMeetings();
        } else {
            const d = await r.json();
            setEditError(d.error || 'Failed to save.');
        }
    };

    const handleDeleteMeeting = async (meetingId: string, title: string) => {
        if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
        if (!user?.id) return;
        setDeletingMeetingId(meetingId);
        await fetch(`${SERVER_URL}/api/admin/meetings/${meetingId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminId: user.id }),
        });
        setDeletingMeetingId(null);
        fetchMeetings();
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', overflow: 'hidden' }}>

            {/* ── TOP HEADER ── */}
            <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', height: 64, background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexShrink: 0, zIndex: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {isMobile && (
                        <button onClick={() => setMobileSidebarOpen(v => !v)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--text)', padding: '4px 6px', lineHeight: 1, marginRight: 4 }}>☰</button>
                    )}
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🏫</div>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em' }}>ClassMeet Admin</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Welcome, {displayName}</div>
                    </div>
                </div>
                <UserMenu />
            </header>

            {/* ── BODY: sidebar + content ── */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>

                {/* Mobile sidebar backdrop */}
                {isMobile && mobileSidebarOpen && (
                    <div onClick={() => setMobileSidebarOpen(false)}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40, top: 64 }} />
                )}

                {/* ── SIDEBAR ── */}
                <aside style={{
                    width: 220, background: 'var(--surface)', borderRight: '1px solid var(--border)',
                    display: 'flex', flexDirection: 'column', padding: '20px 12px', gap: 4, flexShrink: 0,
                    ...(isMobile ? {
                        position: 'fixed', top: 64, bottom: 0, left: 0, zIndex: 50,
                        transform: mobileSidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
                        transition: 'transform 0.25s ease',
                        boxShadow: mobileSidebarOpen ? '4px 0 20px rgba(0,0,0,0.3)' : 'none',
                    } : {}),
                }}>
                    {isMobile && (
                        <button onClick={() => setMobileSidebarOpen(false)}
                            style={{ alignSelf: 'flex-end', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 20, marginBottom: 8, padding: '2px 4px' }}>✕</button>
                    )}
                    {NAV_ITEMS.map(n => (
                        <button key={n.key} onClick={() => setTab(n.key)} style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none', fontSize: 14, fontWeight: tab === n.key ? 600 : 500, transition: 'all 0.15s',
                            background: tab === n.key ? 'linear-gradient(135deg,rgba(99,102,241,0.25),rgba(139,92,246,0.15))' : 'transparent',
                            color: tab === n.key ? '#a5b4fc' : 'var(--text-muted)',
                            boxShadow: tab === n.key ? 'inset 0 0 0 1px rgba(99,102,241,0.3)' : 'none',
                        }}>
                            <span style={{ fontSize: 16, opacity: tab === n.key ? 1 : 0.6 }}>{n.icon}</span>
                            {n.label}
                        </button>
                    ))}

                    <div style={{ marginTop: 'auto', fontSize: 11, color: 'var(--text-muted)', padding: '12px 14px 0', borderTop: '1px solid var(--border)' }}>
                        <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text)' }}>Platform Stats</div>
                        <div>{members.length} member{members.length !== 1 ? 's' : ''}</div>
                        <div>{teachers.length} teacher{teachers.length !== 1 ? 's' : ''}</div>
                        <div>{students.length} student{students.length !== 1 ? 's' : ''}</div>
                        {pendingUsers.length > 0 && <div style={{ color: '#f59e0b', marginTop: 2 }}>{pendingUsers.length} pending</div>}
                        {(adminStats?.liveGuestCount ?? 0) > 0 && <div style={{ color: '#64748b', marginTop: 2 }}>{adminStats?.liveGuestCount} live guest{(adminStats?.liveGuestCount ?? 0) !== 1 ? 's' : ''}</div>}
                        {meetings.filter(m => m.is_active).length > 0 && <div style={{ color: '#a5b4fc', marginTop: 2 }}>{meetings.filter(m => m.is_active).length} active meeting{meetings.filter(m => m.is_active).length !== 1 ? 's' : ''}</div>}
                    </div>
                </aside>

                {/* ── MAIN CONTENT ── */}
                <main style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '20px 16px' : '32px 36px', paddingBottom: isMobile ? 68 : undefined }}>

                    {/* OVERVIEW */}
                    {tab === 'overview' && (
                        <div>
                            <PageHeader title="Platform Overview" subtitle="Your platform at a glance" />
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(5,1fr)', gap: 20, marginBottom: 32 }}>
                                <StatCard icon="👤" label="Members" value={adminStats?.membersCount ?? members.length} accent="#a78bfa" />
                                <StatCard icon="◎" label="Teachers" value={adminStats?.teachersCount ?? teachers.length} accent="#6366f1" />
                                <StatCard icon="◉" label="Students" value={adminStats?.studentsCount ?? students.length} accent="#22c55e" />
                                <StatCard icon="⏳" label="Pending" value={pendingUsers.length} accent="#f59e0b" />
                                <StatCard icon="👥" label="Live Guests" value={adminStats?.liveGuestCount ?? 0} accent="#64748b" />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(2,1fr)', gap: 20, marginBottom: 32 }}>
                                <StatCard icon="◆" label="Messages Sent" value={sentMessages.length} accent="#8b5cf6" />
                            </div>
                            <div style={{ marginBottom: 32 }}>
                                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 12 }}>Backend &amp; Storage</div>
                                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '20px 24px' }}>
                                    {backendStats && (backendStats.plan != null || backendStats.storageUsed != null || backendStats.storageTotal != null) ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                            {backendStats.plan != null && <div style={{ fontSize: 14 }}><span style={{ color: 'var(--text-muted)' }}>Plan:</span> <strong>{backendStats.plan}</strong></div>}
                                            {(backendStats.storageUsed != null || backendStats.storageTotal != null) && (
                                                <div style={{ fontSize: 14 }}>
                                                    <span style={{ color: 'var(--text-muted)' }}>Storage:</span>{' '}
                                                    {backendStats.storageUsed != null && <span>{formatBytes(backendStats.storageUsed)} used</span>}
                                                    {backendStats.storageTotal != null && <span> / {formatBytes(backendStats.storageTotal)} total</span>}
                                                    {backendStats.storageRemaining != null && <span> ({formatBytes(backendStats.storageRemaining)} remaining)</span>}
                                                </div>
                                            )}
                                            {backendStats.warnings && backendStats.warnings.length > 0 && (
                                                <div style={{ marginTop: 8, padding: 10, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10 }}>
                                                    {backendStats.warnings.map((w, i) => <div key={i} style={{ fontSize: 13, color: '#f59e0b' }}>{w}</div>)}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Backend metrics not available</div>
                                    )}
                                </div>
                            </div>
                            {healthStatus && (
                                <div style={{ marginBottom: 24, padding: 12, borderRadius: 12, background: healthStatus.status === 'ok' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${healthStatus.status === 'ok' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: healthStatus.status === 'ok' ? '#22c55e' : '#ef4444' }} />
                                    <span style={{ fontSize: 13, fontWeight: 600 }}>App health: {healthStatus.status === 'ok' ? 'Running well' : 'Degraded'}</span>
                                    {healthStatus.error && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{healthStatus.error}</span>}
                                </div>
                            )}
                            <Card title="Quick Actions">
                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(5,1fr)', gap: 12 }}>
                                    <BtnFull onClick={() => setTab('members')} color="#a78bfa">Manage Members</BtnFull>
                                    <BtnFull onClick={() => setTab('teachers')} color="#6366f1">Manage Teachers</BtnFull>
                                    <BtnFull onClick={() => setTab('students')} color="#22c55e">Manage Students</BtnFull>
                                    <BtnFull onClick={() => setTab('pending')} color="#f59e0b">Pending {pendingUsers.length > 0 ? `(${pendingUsers.length})` : 'Approvals'}</BtnFull>
                                    <BtnFull onClick={() => { setTab('meetings'); setShowCreateMeeting(true); }} color="#8b5cf6">+ Create Meeting</BtnFull>
                                </div>
                            </Card>
                        </div>
                    )}

                    {/* MEMBERS */}
                    {tab === 'members' && (
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                                <PageHeader title="Members" subtitle={`${members.length} registered`} />
                                <Btn onClick={() => { setShowAddMember(true); setMemberError(''); }} color="#a78bfa">+ Add Member</Btn>
                            </div>
                            {showAddMember && (
                                <Card title="Add New Member" style={{ marginBottom: 24 }}>
                                    <div style={{ display: 'grid', gap: 12 }}>
                                        <Input placeholder="Full Name" value={memberForm.name} onChange={e => setMemberForm({ ...memberForm, name: e.target.value })} />
                                        <Input placeholder="Email Address" value={memberForm.email} onChange={e => setMemberForm({ ...memberForm, email: e.target.value })} />
                                        <div style={{ position: 'relative' }}>
                                            <input
                                                type={showMemberTempPassword ? 'text' : 'password'}
                                                placeholder="Temporary Password"
                                                value={memberForm.tempPassword}
                                                onChange={e => setMemberForm({ ...memberForm, tempPassword: e.target.value })}
                                                style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 90px 9px 14px', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }}
                                            />
                                            <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: 4 }}>
                                                <button type="button" onClick={() => setShowMemberTempPassword(v => !v)} title={showMemberTempPassword ? 'Hide' : 'Show'}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text-muted)', padding: '2px 4px', lineHeight: 1 }}>
                                                    {showMemberTempPassword ? '🙈' : '👁'}
                                                </button>
                                                <button type="button" onClick={() => { navigator.clipboard.writeText(memberForm.tempPassword); }} title="Copy password"
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)', padding: '2px 4px', lineHeight: 1 }}>
                                                    📋
                                                </button>
                                            </div>
                                        </div>
                                        {memberError && <ErrorMsg>{memberError}</ErrorMsg>}
                                        <div style={{ display: 'flex', gap: 10 }}>
                                            <Btn onClick={handleAddMember} color="#a78bfa">Add Member</Btn>
                                            <Btn onClick={() => setShowAddMember(false)} color="var(--surface-3)">Cancel</Btn>
                                        </div>
                                    </div>
                                </Card>
                            )}
                            {loadingMembers ? <Loading /> : members.length === 0 ? (
                                <Empty icon="👤" message="No members yet. Add one above." />
                            ) : (
                                <div style={{ display: 'grid', gap: 10 }}>
                                    {members.map(m => (
                                        <div key={m.user_id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <Avatar name={m.name || m.email} color="#a78bfa" />
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: 14 }}>{m.name || m.email}</div>
                                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{m.email}</div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Role</label>
                                                <select
                                                    value="member"
                                                    onChange={e => handleEditRole(m.user_id, e.target.value)}
                                                    disabled={editingRoleId === m.user_id}
                                                    style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', color: 'var(--text)', fontSize: 12 }}
                                                >
                                                    <option value="member">Member</option>
                                                    <option value="teacher">Teacher</option>
                                                    <option value="student">Student</option>
                                                </select>
                                                {editingRoleId === m.user_id && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Updating...</span>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* TEACHERS */}
                    {tab === 'teachers' && (
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                                <PageHeader title="Teachers" subtitle={`${teachers.length} registered`} />
                                <Btn onClick={() => { setShowAddTeacher(true); setTeacherError(''); }} color="#6366f1">+ Add Teacher</Btn>
                            </div>

                            {showAddTeacher && (
                                <Card title="Add New Teacher" style={{ marginBottom: 24 }}>
                                    <div style={{ display: 'grid', gap: 12 }}>
                                        <Input placeholder="Full Name" value={teacherForm.name} onChange={e => setTeacherForm({ ...teacherForm, name: e.target.value })} />
                                        <Input placeholder="Email Address" value={teacherForm.email} onChange={e => setTeacherForm({ ...teacherForm, email: e.target.value })} />
                                        <div style={{ position: 'relative' }}>
                                            <input
                                                type={showTempPassword ? 'text' : 'password'}
                                                placeholder="Temporary Password"
                                                value={teacherForm.tempPassword}
                                                onChange={e => setTeacherForm({ ...teacherForm, tempPassword: e.target.value })}
                                                style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 90px 9px 14px', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }}
                                            />
                                            <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: 4 }}>
                                                <button type="button" onClick={() => setShowTempPassword(v => !v)} title={showTempPassword ? 'Hide' : 'Show'}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text-muted)', padding: '2px 4px', lineHeight: 1 }}>
                                                    {showTempPassword ? '🙈' : '👁'}
                                                </button>
                                                <button type="button" onClick={() => { navigator.clipboard.writeText(teacherForm.tempPassword); }} title="Copy password"
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)', padding: '2px 4px', lineHeight: 1 }}>
                                                    📋
                                                </button>
                                            </div>
                                        </div>
                                        {teacherError && <ErrorMsg>{teacherError}</ErrorMsg>}
                                        <div style={{ display: 'flex', gap: 10 }}>
                                            <Btn onClick={handleAddTeacher} color="#6366f1">Add Teacher</Btn>
                                            <Btn onClick={() => setShowAddTeacher(false)} color="var(--surface-3)">Cancel</Btn>
                                        </div>
                                    </div>
                                </Card>
                            )}

                            {loadingTeachers ? <Loading /> : teachers.length === 0 ? (
                                <Empty icon="◎" message="No teachers registered yet. Add one above." />
                            ) : (
                                <div style={{ display: 'grid', gap: 10 }}>
                                    {teachers.map(t => (
                                        <div key={t.user_id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                            {editTeacher?.user_id === t.user_id ? (
                                                <div style={{ display: 'flex', gap: 8, flex: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                                                    <Input value={editTeacher.name} onChange={e => setEditTeacher({ ...editTeacher, name: e.target.value })} style={{ width: 160 }} />
                                                    <Input value={editTeacher.email} onChange={e => setEditTeacher({ ...editTeacher, email: e.target.value })} style={{ width: 200 }} />
                                                    <Btn onClick={handleUpdateTeacher} color="#22c55e" small>Save</Btn>
                                                    <Btn onClick={() => setEditTeacher(null)} color="var(--surface-3)" small>Cancel</Btn>
                                                </div>
                                            ) : (
                                                <>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                        <Avatar name={t.name} color="#6366f1" />
                                                        <div>
                                                            <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                                                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{t.email} · {t.room_count} class{t.room_count !== 1 ? 'es' : ''}</div>
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                        <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Role</label>
                                                        <select
                                                            value="teacher"
                                                            onChange={e => handleEditRole(t.user_id, e.target.value)}
                                                            disabled={editingRoleId === t.user_id}
                                                            style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', color: 'var(--text)', fontSize: 12 }}
                                                        >
                                                            <option value="teacher">Teacher</option>
                                                            <option value="member">Member</option>
                                                            <option value="student">Student</option>
                                                        </select>
                                                        {editingRoleId === t.user_id && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Updating...</span>}
                                                        <Btn onClick={() => setEditTeacher(t)} color="var(--surface-3)" small>Edit</Btn>
                                                        <Btn onClick={() => handleDeleteTeacher(t.user_id)} color="#ef444420" textColor="#ef4444" small>Remove</Btn>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* STUDENTS */}
                    {tab === 'students' && (
                        <div>
                            <PageHeader title="Students" subtitle={`${students.length} enrolled`} />

                            {loadingStudents ? <Loading /> : students.length === 0 ? (
                                <Empty icon="◉" message="No students registered yet." />
                            ) : (
                                <div style={{ display: 'grid', gap: 10 }}>
                                    {students.map(s => (
                                        <div key={s.user_id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <Avatar name={s.name || s.email} color="#22c55e" />
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: 14 }}>{s.name || s.email}</div>
                                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{s.email} · {s.enrollment_count} enrollment{s.enrollment_count !== 1 ? 's' : ''}</div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Role</label>
                                                <select
                                                    value="student"
                                                    onChange={e => handleEditRole(s.user_id, e.target.value)}
                                                    disabled={editingRoleId === s.user_id}
                                                    style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', color: 'var(--text)', fontSize: 12 }}
                                                >
                                                    <option value="student">Student</option>
                                                    <option value="member">Member</option>
                                                    <option value="teacher">Teacher</option>
                                                </select>
                                                {editingRoleId === s.user_id && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Updating...</span>}
                                                <Btn onClick={() => handleDeleteStudent(s.user_id)} color="#ef444420" textColor="#ef4444" small>Remove</Btn>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* PENDING APPROVALS */}
                    {tab === 'pending' && (
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                                <PageHeader title="Pending Approvals" subtitle={`${pendingUsers.length} user${pendingUsers.length !== 1 ? 's' : ''} awaiting approval`} />
                                <Btn onClick={fetchPendingUsers} color="var(--surface-3)">↻ Refresh</Btn>
                            </div>
                            {approveError && <div style={{ marginBottom: 16 }}><ErrorMsg>{approveError}</ErrorMsg></div>}
                            {loadingPending ? <Loading /> : pendingUsers.length === 0 ? (
                                <Empty icon="⏳" message="No pending users — everyone has been approved." />
                            ) : (
                                <div style={{ display: 'grid', gap: 10 }}>
                                    {pendingUsers.map(u => (
                                        <div key={u.id} style={{ background: 'var(--surface)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <Avatar name={u.name || u.email} color="#f59e0b" />
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: 14 }}>{u.name || '(no name)'}</div>
                                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{u.email}</div>
                                                    {u.created_at && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Signed up {new Date(u.created_at).toLocaleDateString()}</div>}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                <span style={{ fontSize: 11, background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 100, padding: '3px 10px', color: '#f59e0b', fontWeight: 600 }}>Pending</span>
                                                <select
                                                    id={`approve-role-${u.id}`}
                                                    defaultValue="student"
                                                    style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', color: 'var(--text)', fontSize: 12 }}
                                                >
                                                    <option value="student">Student</option>
                                                    <option value="teacher">Teacher</option>
                                                    <option value="member">Member</option>
                                                </select>
                                                <Btn
                                                    onClick={() => {
                                                        const sel = document.getElementById(`approve-role-${u.id}`) as HTMLSelectElement;
                                                        const role = (sel?.value || 'student') as 'member' | 'teacher' | 'student';
                                                        handleApproveUser(u.id, u.name, u.email, role);
                                                    }}
                                                    color="#22c55e"
                                                    small
                                                    disabled={approvingId === u.id}
                                                >
                                                    {approvingId === u.id ? 'Approving...' : '✓ Approve'}
                                                </Btn>
                                                <Btn
                                                    onClick={() => handleRejectUser(u.id)}
                                                    color="#ef444420"
                                                    textColor="#ef4444"
                                                    small
                                                    disabled={rejectingId === u.id}
                                                >
                                                    {rejectingId === u.id ? 'Rejecting...' : 'Reject'}
                                                </Btn>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* MEETINGS */}
                    {tab === 'meetings' && (
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
                                <PageHeader title="Admin Meetings" subtitle={`${meetings.filter(m => m.is_active).length} active`} />
                                <Btn onClick={() => { setShowCreateMeeting(v => !v); setMeetingError(''); }} color="#8b5cf6">
                                    {showCreateMeeting ? 'Cancel' : '+ Schedule Meeting'}
                                </Btn>
                            </div>

                            {showCreateMeeting && (
                                <Card title="Schedule a New Meeting" style={{ marginBottom: 28 }}>
                                    <div style={{ display: 'grid', gap: 14 }}>
                                        <Input placeholder="Meeting subject / title *" value={meetingForm.title}
                                            onChange={e => setMeetingForm({ ...meetingForm, title: e.target.value })} />
                                        <textarea placeholder="Short description (optional)"
                                            value={meetingForm.description}
                                            onChange={e => setMeetingForm({ ...meetingForm, description: e.target.value })}
                                            rows={2}
                                            style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 14px', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', resize: 'vertical' }}
                                        />
                                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                                            <div>
                                                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Scheduled Date & Time *</label>
                                                <input type="datetime-local" value={meetingForm.scheduledAt}
                                                    onChange={e => setMeetingForm({ ...meetingForm, scheduledAt: e.target.value })}
                                                    min={new Date().toISOString().slice(0, 16)}
                                                    style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 14px', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} />
                                            </div>
                                            <div>
                                                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Max Participants</label>
                                                <input type="number" min={2} max={200} value={meetingForm.maxParticipants}
                                                    onChange={e => setMeetingForm({ ...meetingForm, maxParticipants: Number(e.target.value) })}
                                                    style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 14px', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} />
                                            </div>
                                        </div>

                                        {/* Target Audience */}
                                        <div>
                                            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>Target Audience</label>
                                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                                                <Btn onClick={() => addTargetRole('teacher')} color="#6366f120" textColor="#a5b4fc" small>+ All Teachers</Btn>
                                                <Btn onClick={() => addTargetRole('student')} color="#22c55e20" textColor="#86efac" small>+ All Students</Btn>
                                                <div style={{ position: 'relative' }}>
                                                    <select onChange={e => {
                                                        const r = allRooms.find(x => x.id === e.target.value);
                                                        if (r) addTargetRoom(r);
                                                        e.target.value = '';
                                                    }}
                                                        style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', color: 'var(--text)', fontSize: 12, outline: 'none', cursor: 'pointer' }}>
                                                        <option value="">+ By Class</option>
                                                        {allRooms.map(r => <option key={r.id} value={r.id}>{r.name} ({r.code})</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                            {/* Individual user search */}
                                            <div style={{ position: 'relative', marginBottom: 10 }}>
                                                <input placeholder="Search user by name or email to add individually…"
                                                    value={userSearch} onChange={e => setUserSearch(e.target.value)}
                                                    style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 14px', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} />
                                                {userSearch.trim().length > 1 && (
                                                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, zIndex: 100, maxHeight: 200, overflowY: 'auto', marginTop: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
                                                        {allUsers
                                                            .filter(u => (u.name || u.email || '').toLowerCase().includes(userSearch.toLowerCase()))
                                                            .slice(0, 8)
                                                            .map(u => (
                                                                <div key={u.id} onClick={() => addTargetUser(u)}
                                                                    style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}
                                                                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.1)')}
                                                                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                                                                    <span style={{ fontSize: 10, background: u.role === 'teacher' ? 'rgba(99,102,241,0.2)' : 'rgba(34,197,94,0.2)', color: u.role === 'teacher' ? '#a5b4fc' : '#86efac', padding: '2px 8px', borderRadius: 100, fontWeight: 600 }}>{u.role}</span>
                                                                    <span>{u.name || u.email}</span>
                                                                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{u.email}</span>
                                                                </div>
                                                            ))}
                                                        {allUsers.filter(u => (u.name || u.email || '').toLowerCase().includes(userSearch.toLowerCase())).length === 0 && (
                                                            <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-muted)' }}>No users found</div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            {/* Selected targets chips */}
                                            {meetingTargets.length > 0 && (
                                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                    {meetingTargets.map((t, i) => (
                                                        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 100, padding: '4px 12px', fontSize: 12, color: '#a5b4fc', fontWeight: 600 }}>
                                                            {t.label}
                                                            <button onClick={() => removeTarget(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a5b4fc', fontSize: 14, lineHeight: 1, padding: 0, display: 'flex' }}>×</button>
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                            {meetingTargets.length === 0 && (
                                                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No targets selected yet — add at least one above.</div>
                                            )}
                                        </div>

                                        {meetingError && <ErrorMsg>{meetingError}</ErrorMsg>}
                                        <div style={{ display: 'flex', gap: 10 }}>
                                            <Btn onClick={handleCreateMeeting} color="#8b5cf6" disabled={creatingMeeting}>
                                                {creatingMeeting ? 'Scheduling…' : '📅 Schedule Meeting'}
                                            </Btn>
                                            <Btn onClick={() => { setShowCreateMeeting(false); setMeetingError(''); setMeetingTargets([]); }} color="var(--surface-3)">Cancel</Btn>
                                        </div>
                                    </div>
                                </Card>
                            )}

                            {loadingMeetings ? <Loading /> : meetings.length === 0 ? (
                                <Empty icon="📅" message="No meetings scheduled yet. Create one above." />
                            ) : (
                                <div style={{ display: 'grid', gap: 14 }}>
                                    {meetings.map(m => {
                                        const scheduledDate = new Date(m.scheduled_at);
                                        const isLive = scheduledDate <= new Date();
                                        const isActive = m.is_active;
                                        return (
                                            <div key={m.id} style={{
                                                background: isActive
                                                    ? 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.05))'
                                                    : 'var(--surface)',
                                                border: isActive ? '1px solid rgba(99,102,241,0.3)' : '1px solid var(--border)',
                                                borderRadius: 16, padding: '16px 20px',
                                                opacity: isActive ? 1 : 0.55,
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                                                            <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{m.title}</span>
                                                            {isActive && isLive && <span style={{ fontSize: 10, background: 'rgba(239,68,68,0.2)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 100, padding: '2px 10px', fontWeight: 700 }}>🔴 LIVE</span>}
                                                            {isActive && !isLive && <span style={{ fontSize: 10, background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 100, padding: '2px 10px', fontWeight: 700 }}>SCHEDULED</span>}
                                                            {!isActive && <span style={{ fontSize: 10, background: 'var(--surface-3)', color: 'var(--text-muted)', borderRadius: 100, padding: '2px 10px', fontWeight: 600 }}>ENDED</span>}
                                                        </div>
                                                        {m.description && <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--text-muted)' }}>{m.description}</p>}
                                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                                                            <span>🗓 {scheduledDate.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                                            <span>👥 Max {m.max_participants}</span>
                                                            <span>🔑 {m.room_code}</span>
                                                        </div>
                                                        {Array.isArray(m.targets) && m.targets.length > 0 && (
                                                            <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                                {m.targets.map((t, i) => (
                                                                    <span key={i} style={{ fontSize: 11, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 100, padding: '2px 10px', color: '#a5b4fc', fontWeight: 600 }}>
                                                                        {t.type === 'role' ? `All ${t.value.charAt(0).toUpperCase() + t.value.slice(1)}s` :
                                                                         t.type === 'room' ? `Class: ${allRooms.find(r => r.id === t.value)?.name || t.value}` :
                                                                         `${allUsers.find(u => u.id === t.value)?.name || t.value}`}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                                            {isActive && (
                                                                <Btn onClick={() => onJoinRoom(m.room_code, m.room_id, displayName, 'teacher', m.title)} color="#6366f1" small>
                                                                    {isLive ? '▶ Join as Host' : 'Open Room'}
                                                                </Btn>
                                                            )}
                                                            {editingMeetingId !== m.id && (
                                                                <Btn onClick={() => startEditMeeting(m)} color="rgba(99,102,241,0.15)" textColor="#a5b4fc" small disabled={savingEdit}>
                                                                    ✏️ Edit
                                                                </Btn>
                                                            )}
                                                            {isActive && (
                                                                <Btn onClick={() => handleEndMeeting(m.id)} color="#ef444420" textColor="#ef4444" small disabled={endingMeetingId === m.id}>
                                                                    {endingMeetingId === m.id ? 'Ending…' : '■ End'}
                                                                </Btn>
                                                            )}
                                                            <Btn onClick={() => handleDeleteMeeting(m.id, m.title)} color="#ef444415" textColor="#f87171" small disabled={deletingMeetingId === m.id}>
                                                                {deletingMeetingId === m.id ? 'Deleting…' : '🗑 Delete'}
                                                            </Btn>
                                                        </div>
                                                </div>
                                                {/* ── Inline edit form ── */}
                                                {editingMeetingId === m.id && (
                                                    <div style={{ marginTop: 16, padding: 16, background: 'rgba(99,102,241,0.07)', borderRadius: 12, border: '1px solid rgba(99,102,241,0.25)' }}>
                                                        <div style={{ fontWeight: 700, fontSize: 13, color: '#a5b4fc', marginBottom: 12 }}>✏️ Edit Meeting</div>
                                                        {editError && <p style={{ color: '#f87171', fontSize: 13, margin: '0 0 10px' }}>{editError}</p>}
                                                        <div style={{ display: 'grid', gap: 10 }}>
                                                            <input value={editForm.title} onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))} placeholder="Title" style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 14 }} />
                                                            <textarea value={editForm.description} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} placeholder="Description (optional)" rows={2} style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 14, resize: 'vertical' }} />
                                                            <input type="datetime-local" value={editForm.scheduledAt} onChange={e => setEditForm(p => ({ ...p, scheduledAt: e.target.value }))} style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 14 }} />
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Max participants:</span>
                                                                <input type="number" min={2} max={100} value={editForm.maxParticipants} onChange={e => setEditForm(p => ({ ...p, maxParticipants: Number(e.target.value) }))} style={{ width: 80, padding: '6px 10px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 14 }} />
                                                            </div>
                                                            {/* Target audience for edit */}
                                                            <div>
                                                                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>Target audience:</div>
                                                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                                                                    {editTargets.map((t, i) => (
                                                                        <span key={i} style={{ fontSize: 12, background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 100, padding: '3px 10px', color: '#a5b4fc', display: 'flex', alignItems: 'center', gap: 5 }}>
                                                                            {t.label}
                                                                            <button onClick={() => setEditTargets(prev => prev.filter((_, x) => x !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                                    {(['teacher', 'student'] as const).map(role => (
                                                                        <button key={role} onClick={() => { if (!editTargets.some(t => t.type === 'role' && t.value === role)) setEditTargets(prev => [...prev, { type: 'role', value: role, label: `All ${role.charAt(0).toUpperCase() + role.slice(1)}s` }]); }} style={{ fontSize: 12, padding: '4px 12px', borderRadius: 100, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer' }}>+ All {role.charAt(0).toUpperCase() + role.slice(1)}s</button>
                                                                    ))}
                                                                    {allRooms.map(room => (
                                                                        <button key={room.id} onClick={() => { if (!editTargets.some(t => t.type === 'room' && t.value === room.id)) setEditTargets(prev => [...prev, { type: 'room', value: room.id, label: `Class: ${room.name}` }]); }} style={{ fontSize: 12, padding: '4px 12px', borderRadius: 100, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer' }}>+ {room.name}</button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                                            <Btn onClick={handleSaveEdit} color="#6366f1" disabled={savingEdit}>{savingEdit ? 'Saving…' : '💾 Save Changes'}</Btn>
                                                            <Btn onClick={() => setEditingMeetingId(null)} color="transparent" textColor="var(--text-muted)">Cancel</Btn>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* MESSAGES */}
                    {tab === 'messages' && (
                        <div style={{ height: 'calc(100vh - 130px)' }}>
                            <ChatDrawer
                                inline
                                userId={user?.id || ''}
                                userName={displayName}
                                userRole="admin"
                            />
                        </div>
                    )}
                </main>
            </div>

            {/* ── MOBILE BOTTOM TAB BAR ── */}
            {isMobile && (
                <nav style={{
                    position: 'fixed', bottom: 0, left: 0, right: 0, height: 60,
                    background: 'var(--surface)', borderTop: '1px solid var(--border)',
                    display: 'flex', alignItems: 'stretch', zIndex: 100,
                }}>
                    {NAV_ITEMS.map(n => (
                        <button key={n.key} onClick={() => setTab(n.key)} style={{
                            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                            justifyContent: 'center', gap: 3, background: 'none', border: 'none',
                            cursor: 'pointer', fontSize: 10, fontWeight: 600, fontFamily: 'inherit',
                            color: tab === n.key ? '#a5b4fc' : 'var(--text-muted)',
                            borderTop: tab === n.key ? '2px solid #6366f1' : '2px solid transparent',
                            transition: 'all 0.15s',
                        }}>
                            <span style={{ fontSize: 20 }}>{n.icon}</span>
                            {n.label}
                        </button>
                    ))}
                </nav>
            )}
        </div>
    );
}

/* ── Shared micro-components ── */

function formatBytes(n: number): string {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + ' GB';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + ' MB';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + ' KB';
    return n + ' B';
}

function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
    return (
        <div style={{ marginBottom: 28 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>{title}</h2>
            {subtitle && <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>{subtitle}</p>}
        </div>
    );
}

function Card({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties }) {
    return (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 22, ...style }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16, color: 'var(--text)' }}>{title}</div>
            {children}
        </div>
    );
}

function StatCard({ icon, label, value, accent }: { icon: string; label: string; value: number; accent: string }) {
    return (
        <div style={{ background: 'var(--surface)', border: `1px solid ${accent}30`, borderRadius: 18, padding: '22px 24px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -10, right: -10, fontSize: 80, opacity: 0.04, pointerEvents: 'none', userSelect: 'none' }}>{icon}</div>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 10 }}>{label}</div>
            <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-0.03em', color: accent, lineHeight: 1 }}>{value}</div>
        </div>
    );
}

function Avatar({ name, color }: { name: string; color: string }) {
    const initial = (name || '?')[0].toUpperCase();
    return (
        <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}20`, border: `1px solid ${color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color, flexShrink: 0 }}>
            {initial}
        </div>
    );
}

function Btn({ onClick, children, color, textColor, small, disabled }: { onClick?: () => void; children: React.ReactNode; color: string; textColor?: string; small?: boolean; disabled?: boolean }) {
    return (
        <button onClick={onClick} disabled={disabled} style={{ cursor: disabled ? 'not-allowed' : 'pointer', background: color, color: textColor || '#fff', border: 'none', borderRadius: small ? 8 : 10, padding: small ? '6px 14px' : '10px 20px', fontSize: small ? 12 : 13, fontWeight: 600, opacity: disabled ? 0.5 : 1, transition: 'opacity 0.15s, filter 0.15s', whiteSpace: 'nowrap' }}
            onMouseEnter={e => !disabled && ((e.currentTarget as HTMLElement).style.filter = 'brightness(1.15)')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.filter = 'none')}>
            {children}
        </button>
    );
}

// Full-width button used in Quick Actions grid
function BtnFull({ onClick, children, color }: { onClick?: () => void; children: React.ReactNode; color: string }) {
    return (
        <button onClick={onClick} style={{ cursor: 'pointer', background: color, color: '#fff', border: 'none', borderRadius: 10, padding: '12px 10px', fontSize: 13, fontWeight: 600, width: '100%', textAlign: 'center', whiteSpace: 'normal', lineHeight: 1.3, transition: 'filter 0.15s' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.filter = 'brightness(1.15)')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.filter = 'none')}>
            {children}
        </button>
    );
}

function Input({ placeholder, value, onChange, style, type = 'text' }: { placeholder?: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; style?: React.CSSProperties; type?: string }) {
    return (
        <input type={type} placeholder={placeholder} value={value} onChange={onChange}
            style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 14px', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', ...style }} />
    );
}

function ErrorMsg({ children }: { children: React.ReactNode }) {
    return <p style={{ fontSize: 13, color: '#ef4444', margin: 0, background: 'rgba(239,68,68,0.08)', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)' }}>{children}</p>;
}

function Loading({ small }: { small?: boolean }) {
    return <p style={{ color: 'var(--text-muted)', fontSize: small ? 12 : 14, margin: 0 }}>Loading...</p>;
}

function Empty({ icon, message }: { icon: string; message: string }) {
    return (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '48px 32px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.2 }}>{icon}</div>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>{message}</p>
        </div>
    );
}
