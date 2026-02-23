import { useState, useEffect, useCallback, useRef } from 'react';
import { useUser, UserButton } from '@insforge/react';
import ChatDrawer from '../components/ChatDrawer';
import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

interface Teacher { user_id: string; name: string; email: string; created_at: string; room_count: number; }
interface Student { user_id: string; name: string; email: string; created_at: string; enrollment_count: number; chat_allowed: boolean; }
interface InboxMsg { id: string; from_name: string; to_user_id: string | null; to_role: string | null; subject: string; body: string; created_at: string; }
interface ChatRequest { student_id: string; student_name: string; student_email: string; created_at: string; target_user_id: string; }
type Tab = 'overview' | 'teachers' | 'students' | 'messages' | 'pending';

const NAV_ITEMS: { key: Tab; icon: string; label: string }[] = [
    { key: 'overview',  icon: '◈', label: 'Overview'  },
    { key: 'teachers',  icon: '◎', label: 'Teachers'  },
    { key: 'students',  icon: '◉', label: 'Students'  },
    { key: 'pending',   icon: '⏳', label: 'Pending'   },
    { key: 'messages',  icon: '◆', label: 'Messages'  },
];

export default function AdminDashboard() {
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

    const [pendingUsers, setPendingUsers] = useState<{ id: string; name: string; email: string; created_at: string | null }[]>([]);
    const [loadingPending, setLoadingPending] = useState(false);
    const [approvingId, setApprovingId] = useState<string | null>(null);
    const [approveError, setApproveError] = useState<string>('');

    const [sentMessages, setSentMessages] = useState<InboxMsg[]>([]);
    const [chatRequests, setChatRequests] = useState<ChatRequest[]>([]);
    const [allowingChat, setAllowingChat] = useState<string | null>(null);
    const [decliningChat, setDecliningChat] = useState<string | null>(null);

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

    const fetchSentMessages = useCallback(async () => {
        if (!user?.id) return;
        try { const r = await fetch(`${SERVER_URL}/api/messages/sent/${user.id}`); if (r.ok) setSentMessages(await r.json()); } catch {}
    }, [user?.id]);

    const fetchPendingUsers = useCallback(async () => {
        setLoadingPending(true);
        try { const r = await fetch(`${SERVER_URL}/api/pending-users`); if (r.ok) setPendingUsers(await r.json()); } catch {}
        setLoadingPending(false);
    }, []);

    const fetchChatRequests = useCallback(async () => {
        try { const r = await fetch(`${SERVER_URL}/api/chat/requests`); if (r.ok) setChatRequests(await r.json()); } catch {}
    }, []);

    const handleAllowChat = async (studentId: string, targetUserId: string) => {
        setAllowingChat(studentId);
        await fetch(`${SERVER_URL}/api/chat/allow/${studentId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUserId }),
        });
        setAllowingChat(null);
        fetchStudents(); fetchChatRequests();
    };

    const handleDeclineChat = async (studentId: string, targetUserId: string) => {
        setDecliningChat(studentId);
        await fetch(`${SERVER_URL}/api/chat/decline/${studentId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUserId }),
        });
        setDecliningChat(null);
        fetchChatRequests();
    };

    const handleRevokeChat = async (studentId: string, targetUserId: string) => {
        if (!confirm('Revoke chat access for this student?')) return;
        await fetch(`${SERVER_URL}/api/chat/revoke/${studentId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUserId }),
        });
        fetchStudents();
    };

    // ── Real-time auto-refresh via socket.io ─────────────────────────────
    const refreshCurrentTab = useCallback(() => {
        fetchChatRequests(); // always poll chat requests regardless of active tab
        if (tab === 'overview') { fetchTeachers(); fetchStudents(); fetchPendingUsers(); fetchSentMessages(); }
        else if (tab === 'teachers') fetchTeachers();
        else if (tab === 'students') fetchStudents();
        else if (tab === 'pending')  fetchPendingUsers();
    }, [tab, fetchTeachers, fetchStudents, fetchPendingUsers, fetchSentMessages, fetchChatRequests]);

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
            if (type === 'pending')  { fetchPendingUsers(); fetchTeachers(); fetchStudents(); }
            if (type === 'chatRequests') fetchChatRequests();
            fetchTeachers();
            fetchStudents();
            fetchPendingUsers();
        });
        return () => { sock.disconnect(); };
    }, [fetchTeachers, fetchStudents, fetchPendingUsers, fetchChatRequests]);

    const handleApproveUser = async (userId: string, name: string, email: string) => {
        setApprovingId(userId); setApproveError('');
        const r = await fetch(`${SERVER_URL}/api/approve-user/${userId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, role: 'student' }),
        });
        if (r.ok) { fetchPendingUsers(); fetchStudents(); }
        else { const d = await r.json(); setApproveError(d.error || 'Failed to approve.'); }
        setApprovingId(null);
    };

    useEffect(() => {
        if (tab === 'overview') { fetchTeachers(); fetchStudents(); fetchSentMessages(); fetchPendingUsers(); }
        if (tab === 'teachers') fetchTeachers();
        if (tab === 'students') { fetchStudents(); fetchChatRequests(); }
        if (tab === 'pending')  fetchPendingUsers();
        if (tab === 'messages') { /* ChatDrawer handles its own data */ }
    }, [tab, fetchTeachers, fetchStudents, fetchSentMessages, fetchPendingUsers]);

    // Always fetch sidebar stats on mount regardless of starting tab
    useEffect(() => {
        fetchTeachers();
        fetchStudents();
        fetchPendingUsers();
        fetchChatRequests();
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
                <UserButton />
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
                        <div>{teachers.length} teacher{teachers.length !== 1 ? 's' : ''}</div>
                        <div>{students.length} student{students.length !== 1 ? 's' : ''}</div>
                        {pendingUsers.length > 0 && <div style={{ color: '#f59e0b', marginTop: 2 }}>{pendingUsers.length} pending</div>}
                    </div>
                </aside>

                {/* ── MAIN CONTENT ── */}
                <main style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '20px 16px' : '32px 36px', paddingBottom: isMobile ? 68 : undefined }}>

                    {/* OVERVIEW */}
                    {tab === 'overview' && (
                        <div>
                            <PageHeader title="Platform Overview" subtitle="Your platform at a glance" />
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 20, marginBottom: 32 }}>
                                <StatCard icon="◎" label="Teachers" value={teachers.length} accent="#6366f1" />
                                <StatCard icon="◉" label="Students" value={students.length} accent="#22c55e" />
                                <StatCard icon="⏳" label="Pending" value={pendingUsers.length} accent="#f59e0b" />
                                <StatCard icon="◆" label="Messages Sent" value={sentMessages.length} accent="#8b5cf6" />
                            </div>
                            <Card title="Quick Actions">
                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 12 }}>
                                    <BtnFull onClick={() => setTab('teachers')} color="#6366f1">Manage Teachers</BtnFull>
                                    <BtnFull onClick={() => setTab('students')} color="#22c55e">Manage Students</BtnFull>
                                    <BtnFull onClick={() => setTab('pending')} color="#f59e0b">Pending {pendingUsers.length > 0 ? `(${pendingUsers.length})` : 'Approvals'}</BtnFull>
                                    <BtnFull onClick={() => setTab('messages')} color="#8b5cf6">Send Message</BtnFull>
                                </div>
                            </Card>
                            {chatRequests.length > 0 && (
                                <div style={{ marginTop: 24, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 14, padding: '14px 18px' }}>
                                    <div style={{ fontWeight: 700, fontSize: 14, color: '#f59e0b', marginBottom: 10 }}>⏳ Pending Chat Requests ({chatRequests.length})</div>
                                    <div style={{ display: 'grid', gap: 8 }}>
                                        {chatRequests.map(r => (
                                            <div key={`${r.student_id}-${r.target_user_id}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                                                <div style={{ fontSize: 13 }}>
                                                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>{r.student_name || r.student_email}</span>
                                                    {r.student_email && r.student_name && <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{r.student_email}</span>}
                                                    <span style={{ color: 'var(--text-muted)', marginLeft: 8, fontSize: 11 }}>
                                                        → {teachers.find(t => t.user_id === r.target_user_id)?.name || 'Teacher/Admin'}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                                    <Btn onClick={() => handleAllowChat(r.student_id, r.target_user_id)} color="#22c55e" small disabled={allowingChat === r.student_id || decliningChat === r.student_id}>
                                                        {allowingChat === r.student_id ? '…' : '✓ Allow'}
                                                    </Btn>
                                                    <Btn onClick={() => handleDeclineChat(r.student_id, r.target_user_id)} color="rgba(239,68,68,0.12)" textColor="#ef4444" small disabled={allowingChat === r.student_id || decliningChat === r.student_id}>
                                                        {decliningChat === r.student_id ? '…' : '✕ Decline'}
                                                    </Btn>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
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
                                                    <div style={{ display: 'flex', gap: 8 }}>
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

                            {/* Pending chat requests banner */}
                            {chatRequests.length > 0 && (
                                <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 14, padding: '14px 18px', marginBottom: 20 }}>
                                    <div style={{ fontWeight: 700, fontSize: 14, color: '#f59e0b', marginBottom: 10 }}>⏳ Pending Chat Requests ({chatRequests.length})</div>
                                    <div style={{ display: 'grid', gap: 8 }}>
                                        {chatRequests.map(r => (
                                            <div key={`${r.student_id}-${r.target_user_id}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                                                <div style={{ fontSize: 13 }}>
                                                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>{r.student_name || r.student_email}</span>
                                                    <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{r.student_email}</span>
                                                    <span style={{ color: 'var(--text-muted)', marginLeft: 8, fontSize: 11 }}>
                                                        → {teachers.find(t => t.user_id === r.target_user_id)?.name || 'Teacher/Admin'}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                                    <Btn onClick={() => handleAllowChat(r.student_id, r.target_user_id)} color="#22c55e" small disabled={allowingChat === r.student_id || decliningChat === r.student_id}>
                                                        {allowingChat === r.student_id ? '…' : '✓ Allow'}
                                                    </Btn>
                                                    <Btn onClick={() => handleDeclineChat(r.student_id, r.target_user_id)} color="rgba(239,68,68,0.12)" textColor="#ef4444" small disabled={allowingChat === r.student_id || decliningChat === r.student_id}>
                                                        {decliningChat === r.student_id ? '…' : '✕ Decline'}
                                                    </Btn>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

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
                                                    <div style={{ marginTop: 4 }}>
                                                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: s.chat_allowed ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.1)', color: s.chat_allowed ? '#4ade80' : '#f87171', border: `1px solid ${s.chat_allowed ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.2)'}` }}>
                                                            {s.chat_allowed ? '💬 Chat Allowed' : '🔒 Chat Locked'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                {s.chat_allowed
                                                    ? <Btn onClick={() => handleRevokeChat(s.user_id, user?.id || '')} color="rgba(239,68,68,0.12)" textColor="#ef4444" small>🔒 Revoke Chat</Btn>
                                                    : <Btn onClick={() => handleAllowChat(s.user_id, user?.id || '')} color="#22c55e" small>💬 Allow Chat</Btn>
                                                }
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
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontSize: 11, background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 100, padding: '3px 10px', color: '#f59e0b', fontWeight: 600 }}>Pending</span>
                                                <Btn
                                                    onClick={() => handleApproveUser(u.id, u.name, u.email)}
                                                    color="#22c55e"
                                                    small
                                                    disabled={approvingId === u.id}
                                                >
                                                    {approvingId === u.id ? 'Approving...' : '✓ Approve as Student'}
                                                </Btn>
                                            </div>
                                        </div>
                                    ))}
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
