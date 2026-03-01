import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { useUser } from '../lib/AuthContext';
import { insforge } from '../lib/insforge';
import ChatDrawer from '../components/ChatDrawer';
import QuizDrawer from '../components/QuizDrawer';
import AuthModal from '../components/AuthModal';
import OnboardingForm from '../components/OnboardingForm';
import MemberCoursesSection from '../components/MemberCoursesSection';
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
    const [userRole, setUserRole] = useState<'admin' | 'member' | 'teacher' | 'student' | 'pending' | null>(null);
    const [onboardingCompleted, setOnboardingCompleted] = useState(false);
    const [resumeSession, setResumeSession] = useState<ResumeSession | null>(null);
    const pendingApprovalRef = useRef<HTMLDivElement>(null);

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

    const initialsFor = (name: string, fallback?: string) => {
        if (name?.trim()) return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
        if (fallback) return fallback[0].toUpperCase();
        return '?';
    };

    const formatLastSeen = (ts: number) => {
        const d = new Date(ts);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        if (d >= today) return `Last seen ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
        if (d >= yesterday) return 'Last seen yesterday';
        return `Last seen ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
    };
    const [chatOpen, setChatOpen] = useState(false);
    const [unreadChatCount, setUnreadChatCount] = useState(0);
    const [quizOpen, setQuizOpen] = useState(false);
    const [quizScoreUpdateTrigger, setQuizScoreUpdateTrigger] = useState(0);

    // ── Get time-based greeting ────────────────────────────────────────
    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour >= 5 && hour < 12) return { text: 'Good morning', emoji: '🌅' };
        if (hour >= 12 && hour < 17) return { text: 'Good afternoon', emoji: '☀️' };
        if (hour >= 17 && hour < 21) return { text: 'Good evening', emoji: '🌆' };
        return { text: 'Good night', emoji: '🌙' };
    };
    const greeting = getGreeting();

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

    // ── Teacher / Member Sessions ─────────────────────────────────────────
    const [teacherSessions, setTeacherSessions] = useState<AdminMeeting[]>([]);
    const [memberSessions, setMemberSessions] = useState<AdminMeeting[]>([]);
    const [studentTeacherSessions, setStudentTeacherSessions] = useState<AdminMeeting[]>([]);
    const [teacherProfiles, setTeacherProfiles] = useState<Record<string, { name: string; avatar_url?: string }>>({});
    const [studentProfiles, setStudentProfiles] = useState<Record<string, { name: string; avatar_url?: string }>>({});
    const [teacherStudents, setTeacherStudents] = useState<{ id: string; name: string; email: string; avatar_url?: string | null }[]>([]);
    const [loadingTeacherStudents, setLoadingTeacherStudents] = useState(false);
    const [teacherGroups, setTeacherGroups] = useState<{ id: string; name: string; member_count: number; created_at: string }[]>([]);
    const [loadingTeacherGroups, setLoadingTeacherGroups] = useState(false);
    const [teacherCoursesCount, setTeacherCoursesCount] = useState(0);
    const [memberCoursesCount, setMemberCoursesCount] = useState(0);
    const [memberTeachers, setMemberTeachers] = useState<{ user_id: string; name: string; email?: string }[]>([]);
    const [loadingMemberTeachers, setLoadingMemberTeachers] = useState(false);
    const [memberTeachersWithStudents, setMemberTeachersWithStudents] = useState<{ teacherId: string; teacherName: string; students: { id: string; name: string; avatar_url?: string | null }[] }[]>([]);
    const [loadingTeachersWithStudents, setLoadingTeachersWithStudents] = useState(false);
    const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
    const [lastSeenByUserId, setLastSeenByUserId] = useState<Record<string, number>>({});
    const [teacherNamesFromApi, setTeacherNamesFromApi] = useState<Record<string, string>>({});
    const [failedAvatarUrls, setFailedAvatarUrls] = useState<Set<string>>(new Set());
    const markAvatarFailed = (url: string) => setFailedAvatarUrls(prev => new Set(prev).add(url));

    // Schedule modal state
    const [scheduleMode, setScheduleMode] = useState(false);
    const [sessionTitle, setSessionTitle] = useState('');
    const [sessionDesc, setSessionDesc] = useState('');
    const [sessionDateTime, setSessionDateTime] = useState('');
    const [targetStudentIds, setTargetStudentIds] = useState<string[]>([]);
    const [scheduleSessionType, setScheduleSessionType] = useState<'guest' | 'students'>('guest');
    const [allStudents, setAllStudents] = useState<{ user_id: string; name: string; email: string }[]>([]);
    const [scheduling, setScheduling] = useState(false);
    const [scheduleError, setScheduleError] = useState('');
    const [loadingStudentsList, setLoadingStudentsList] = useState(false);

    // Sidebar collapse state
    const [studentsCollapsed, setStudentsCollapsed] = useState(true);
    const [groupsCollapsed, setGroupsCollapsed] = useState(true);
    const [teachersCollapsed, setTeachersCollapsed] = useState(true);

    // Student groups modal state
    const [groupModalMode, setGroupModalMode] = useState<'create' | 'edit' | 'manage' | null>(null);
    const [editingGroup, setEditingGroup] = useState<{ id: string; name: string; member_count: number } | null>(null);
    const [newGroupName, setNewGroupName] = useState('');
    const [groupMembers, setGroupMembers] = useState<{ id: string; name: string; email?: string }[]>([]);
    const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);
    const [addingMemberId, setAddingMemberId] = useState<string | null>(null);
    const [savingGroup, setSavingGroup] = useState(false);
    const [groupError, setGroupError] = useState('');

    // Edit session state
    const [editSessionMode, setEditSessionMode] = useState(false);
    const [editingSession, setEditingSession] = useState<AdminMeeting | null>(null);
    const [editSessionTitle, setEditSessionTitle] = useState('');
    const [editSessionDesc, setEditSessionDesc] = useState('');
    const [editSessionDateTime, setEditSessionDateTime] = useState('');
    const [editTargetStudentIds, setEditTargetStudentIds] = useState<string[]>([]);
    const [editSessionType, setEditSessionType] = useState<'guest' | 'students'>('guest');
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

    const fetchStudentProfiles = useCallback(async (studentIds: string[]) => {
        const uniqueIds = Array.from(new Set(studentIds));
        const profilesMap: Record<string, { name: string; avatar_url?: string }> = {};
        for (const studentId of uniqueIds) {
            try {
                const { data, error } = await insforge.auth.getProfile(studentId);
                if (!error && data && data.profile) {
                    profilesMap[studentId] = {
                        name: (data.profile as any).name || 'Student',
                        avatar_url: (data.profile as any).avatar_url,
                    };
                }
            } catch (err) {
                console.error('Error fetching student profile:', err);
            }
        }
        setStudentProfiles(prev => ({ ...prev, ...profilesMap }));
    }, []);

    const fetchTeacherSessions = useCallback(async () => {
        if (!user?.id || userRole !== 'teacher') return;
        try {
            const r = await fetch(`${SERVER_URL}/api/teacher/sessions/by-host/${user.id}`);
            if (r.ok) {
                const sessions = await r.json();
                setTeacherSessions(sessions);
                await fetchTeacherProfiles(sessions);
            }
        } catch { /* ignore */ }
    }, [user?.id, userRole, fetchTeacherProfiles]);

    const fetchMemberSessions = useCallback(async () => {
        if (!user?.id || userRole !== 'member') return;
        try {
            const r = await fetch(`${SERVER_URL}/api/teacher/sessions/by-host/${user.id}`);
            if (r.ok) {
                const sessions = await r.json();
                setMemberSessions(sessions);
                await fetchTeacherProfiles(sessions);
            }
        } catch { /* ignore */ }
    }, [user?.id, userRole, fetchTeacherProfiles]);

    const fetchTeacherStudents = useCallback(async () => {
        if (!user?.id || userRole !== 'teacher') return;
        setLoadingTeacherStudents(true);
        try {
            const r = await fetch(`${SERVER_URL}/api/teacher/${user.id}/students`);
            if (r.ok) {
                const students = await r.json();
                setTeacherStudents(students);
                await fetchStudentProfiles(students.map((s: { id: string }) => s.id));
            }
        } catch { /* ignore */ }
        setLoadingTeacherStudents(false);
    }, [user?.id, userRole, fetchStudentProfiles]);

    const fetchTeacherGroups = useCallback(async () => {
        if (!user?.id || userRole !== 'teacher') return;
        setLoadingTeacherGroups(true);
        try {
            const r = await fetch(`${SERVER_URL}/api/teacher/${user.id}/groups`);
            if (r.ok) setTeacherGroups(await r.json());
        } catch { /* ignore */ }
        setLoadingTeacherGroups(false);
    }, [user?.id, userRole]);

    const fetchTeacherCoursesCount = useCallback(async () => {
        if (!user?.id || userRole !== 'teacher') return;
        try {
            const r = await fetch(`${SERVER_URL}/api/courses?createdBy=${encodeURIComponent(user.id)}`);
            if (r.ok) {
                const courses = await r.json();
                setTeacherCoursesCount(Array.isArray(courses) ? courses.length : 0);
            }
        } catch { /* ignore */ }
    }, [user?.id, userRole]);

    const fetchMemberCoursesCount = useCallback(async () => {
        if (!user?.id || userRole !== 'member') return;
        try {
            const r = await fetch(`${SERVER_URL}/api/courses?createdBy=${encodeURIComponent(user.id)}`);
            if (r.ok) {
                const courses = await r.json();
                setMemberCoursesCount(Array.isArray(courses) ? courses.length : 0);
            }
        } catch { /* ignore */ }
    }, [user?.id, userRole]);

    const fetchMemberTeachers = useCallback(async () => {
        if (userRole !== 'member') return;
        setLoadingMemberTeachers(true);
        try {
            const r = await fetch(`${SERVER_URL}/api/teachers`);
            if (r.ok) {
                const teachers = await r.json();
                setMemberTeachers(teachers);
                // Load profiles for avatars/names (reuse session-shaped list for fetchTeacherProfiles)
                await fetchTeacherProfiles(teachers.map((t: { user_id: string }) => ({ created_by: t.user_id } as AdminMeeting)));
            }
        } catch { /* ignore */ }
        setLoadingMemberTeachers(false);
    }, [userRole, fetchTeacherProfiles]);

    const fetchMemberTeachersWithStudents = useCallback(async () => {
        if (userRole !== 'member') return;
        setLoadingTeachersWithStudents(true);
        try {
            const tr = await fetch(`${SERVER_URL}/api/teachers`);
            if (!tr.ok) return;
            const teachers = await tr.json();
            const result: { teacherId: string; teacherName: string; students: { id: string; name: string; avatar_url?: string | null }[] }[] = [];
            for (const t of teachers) {
                const sr = await fetch(`${SERVER_URL}/api/teacher/${t.user_id}/students`);
                const students = sr.ok ? await sr.json() : [];
                result.push({
                    teacherId: t.user_id,
                    teacherName: t.name || 'Teacher',
                    students: students.map((s: { id: string; name: string; avatar_url?: string | null }) => ({ id: s.id, name: s.name || 'Student', avatar_url: s.avatar_url })),
                });
            }
            setMemberTeachersWithStudents(result);
            const allStudentIds = result.flatMap(r => r.students.map(s => s.id));
            await fetchStudentProfiles(allStudentIds);
        } catch { /* ignore */ }
        setLoadingTeachersWithStudents(false);
    }, [userRole, fetchStudentProfiles]);

    const fetchStudentTeacherSessions = useCallback(async () => {
        if (!user?.id || userRole !== 'student') return;
        try {
            const r = await fetch(`${SERVER_URL}/api/teacher/sessions/for-student/${user.id}`);
            if (r.ok) {
                const sessions = await r.json();
                setStudentTeacherSessions(sessions);
                await fetchTeacherProfiles(sessions);
            }
        } catch { /* ignore */ }
    }, [user?.id, userRole, fetchTeacherProfiles]);

    const fetchTeacherNamesForStudent = useCallback(async () => {
        try {
            const r = await fetch(`${SERVER_URL}/api/teachers`);
            if (r.ok) {
                const list = await r.json();
                const map: Record<string, string> = {};
                list.forEach((t: { user_id: string; name: string }) => { map[t.user_id] = t.name || ''; });
                setTeacherNamesFromApi(map);
            }
        } catch { /* ignore */ }
    }, []);

    const fetchAllStudents = useCallback(async () => {
        if (userRole !== 'teacher' && userRole !== 'member') return;
        setLoadingStudentsList(true);
        try {
            const r = await fetch(`${SERVER_URL}/api/students`);
            if (r.ok) setAllStudents(await r.json());
        } catch { /* ignore */ }
        setLoadingStudentsList(false);
    }, [userRole]);

    // Refetch role and dashboard data (used on tab focus and dashboard:data-changed)
    const refetchRoleAndDashboard = useCallback(() => {
        if (!user?.id) return;
        const emailParam = user.email ? `?email=${encodeURIComponent(user.email)}` : '';
        fetch(`${SERVER_URL}/api/user-role/${user.id}${emailParam}`)
            .then((r) => r.json())
            .then((d) => {
                const isPending = d.role === 'pending';
                const alreadySubmitted = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('onboarding_submitted') === '1';
                if (isPending && !alreadySubmitted && typeof sessionStorage !== 'undefined' && !sessionStorage.getItem('needsOnboarding')) {
                    sessionStorage.setItem('needsOnboarding', '1');
                }
                setUserRole(d.role);
                if (d.role === 'admin') onAdminView();
                // Do not call profile/sync-name here: it emits dashboard:data-changed and would cause a refetch loop
                fetchTeacherSessions();
                fetchMemberSessions();
                fetchStudentTeacherSessions();
                if (d.role === 'teacher') { fetchTeacherStudents(); fetchTeacherGroups(); fetchTeacherCoursesCount(); }
                if (d.role === 'member') { fetchAllStudents(); fetchMemberCoursesCount(); fetchMemberTeachers(); fetchMemberTeachersWithStudents(); }
                if (d.role === 'student') fetchTeacherNamesForStudent();
            })
            .catch(() => setUserRole('pending'));
    }, [user?.id, user?.email, onAdminView, fetchTeacherSessions, fetchMemberSessions, fetchStudentTeacherSessions, fetchTeacherStudents, fetchTeacherGroups, fetchTeacherCoursesCount, fetchAllStudents, fetchMemberCoursesCount, fetchTeacherNamesForStudent, fetchMemberTeachers, fetchMemberTeachersWithStudents]);

    useEffect(() => {
        if (!user?.id || !userRole || userRole === 'pending') return;
        fetchTeacherSessions();
        fetchMemberSessions();
        fetchStudentTeacherSessions();
        if (userRole === 'teacher') {
            fetchTeacherStudents();
            fetchTeacherGroups();
            fetchTeacherCoursesCount();
        }
        if (userRole === 'member') {
            fetchAllStudents();
            fetchMemberCoursesCount();
            fetchMemberTeachers();
            fetchMemberTeachersWithStudents();
        }
        if (userRole === 'student') {
            fetchTeacherNamesForStudent();
        }
        const pollIdT = setInterval(fetchTeacherSessions, 30_000);
        const pollIdM = setInterval(fetchMemberSessions, 30_000);
        const pollIdS = setInterval(fetchStudentTeacherSessions, 30_000);
        // Poll lists that show other users so profile updates (name/avatar) become visible without relying only on socket
        const pollStudents = userRole === 'teacher' ? setInterval(fetchTeacherStudents, 30_000) : null;
        const pollMemberLists = userRole === 'member' ? setInterval(() => { fetchAllStudents(); fetchMemberTeachers(); fetchMemberTeachersWithStudents(); }, 30_000) : null;
        const pollTeacherNames = userRole === 'student' ? setInterval(fetchTeacherNamesForStudent, 30_000) : null;
        const sock2 = io(SERVER_URL, { transports: ['websocket'] });
        sock2.on('connect', () => {
            sock2.emit('register-user', user.id);
            if (userRole === 'teacher' || userRole === 'member' || userRole === 'student') {
                sock2.emit('presence:subscribe');
            }
        });
        sock2.on('teacher:session-created', () => { fetchTeacherSessions(); fetchMemberSessions(); fetchStudentTeacherSessions(); });
        sock2.on('teacher:session-ended', ({ sessionId }: { sessionId: string }) => {
            setTeacherSessions(prev => prev.filter(s => s.id !== sessionId));
            setMemberSessions(prev => prev.filter(s => s.id !== sessionId));
            setStudentTeacherSessions(prev => prev.filter(s => s.id !== sessionId));
        });
        sock2.on('teacher:session-updated', () => { fetchTeacherSessions(); fetchMemberSessions(); fetchStudentTeacherSessions(); });
        sock2.on('quiz:score-updated', ({ studentId }: { studentId: string }) => {
            if (studentId === user?.id) setQuizScoreUpdateTrigger(prev => prev + 1);
        });
        sock2.on('dashboard:data-changed', () => {
            if (userRole === 'teacher') { fetchTeacherStudents(); fetchTeacherGroups(); }
            if (userRole === 'member') { fetchAllStudents(); fetchMemberTeachers(); fetchMemberTeachersWithStudents(); }
            if (userRole === 'student') fetchTeacherNamesForStudent();
            refetchRoleAndDashboard();
        });
        if (userRole === 'teacher' || userRole === 'member' || userRole === 'student') {
            sock2.on('presence:list', (ids: string[]) => setOnlineUserIds(new Set(ids)));
            sock2.on('presence:state', (payload: { onlineIds: string[]; lastSeen: Record<string, number> }) => {
                if (payload.onlineIds) setOnlineUserIds(new Set(payload.onlineIds));
                if (payload.lastSeen && typeof payload.lastSeen === 'object') setLastSeenByUserId(prev => ({ ...prev, ...payload.lastSeen }));
            });
            sock2.on('presence:status', (payload: { userId: string; online: boolean; lastSeen?: number }) => {
                const { userId, online, lastSeen } = payload;
                setOnlineUserIds(prev => {
                    const next = new Set(prev);
                    if (online) next.add(userId); else next.delete(userId);
                    return next;
                });
                if (!online && lastSeen != null) setLastSeenByUserId(prev => ({ ...prev, [userId]: lastSeen }));
            });
        }
        return () => {
            clearInterval(pollIdT);
            clearInterval(pollIdM);
            clearInterval(pollIdS);
            if (pollStudents != null) clearInterval(pollStudents);
            if (pollMemberLists != null) clearInterval(pollMemberLists);
            if (pollTeacherNames != null) clearInterval(pollTeacherNames);
            sock2.disconnect();
        };
    }, [user?.id, userRole, fetchTeacherSessions, fetchMemberSessions, fetchStudentTeacherSessions, fetchTeacherStudents, fetchTeacherGroups, fetchTeacherCoursesCount, fetchAllStudents, fetchMemberCoursesCount, fetchTeacherNamesForStudent, fetchMemberTeachers, fetchMemberTeachersWithStudents, refetchRoleAndDashboard]);

    // Refetch role and dashboard when user returns to tab
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState !== 'visible') return;
            if (!user?.id || !userRole || userRole === 'pending') return;
            refetchRoleAndDashboard();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [user?.id, userRole, refetchRoleAndDashboard]);

    // Persist invite token from URL so it survives post-signup reload
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const invite = params.get('invite');
        if (invite) {
            sessionStorage.setItem('inviteToken', invite);
            window.history.replaceState({}, '', window.location.pathname || '/');
        }
    }, []);

    // Role check — claim invite if present, then redirect/fetch role
    useEffect(() => {
        if (!user?.id) { setUserRole(null); return; }
        const inviteToken = sessionStorage.getItem('inviteToken');
        const emailParam = user.email ? `?email=${encodeURIComponent(user.email)}` : '';
        const doFetchRole = () =>
            fetch(`${SERVER_URL}/api/user-role/${user.id}${emailParam}`)
                .then((r) => r.json())
                .then((d) => {
                    const isPending = d.role === 'pending';
                    const alreadySubmitted = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('onboarding_submitted') === '1';
                    if (isPending && !alreadySubmitted && typeof sessionStorage !== 'undefined' && !sessionStorage.getItem('needsOnboarding')) {
                        sessionStorage.setItem('needsOnboarding', '1');
                    }
                    setUserRole(d.role);
                    if (d.role === 'admin') onAdminView();
                    if (d.role !== 'pending' && user?.profile?.name) {
                        fetch(`${SERVER_URL}/api/profile/sync-name`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userId: user.id, name: user.profile.name }),
                        }).catch(() => {});
                    }
                })
                .catch(() => setUserRole('pending'));
        if (inviteToken) {
            fetch(`${SERVER_URL}/api/claim-invite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: inviteToken,
                    userId: user.id,
                    name: user?.profile?.name || user?.email?.split('@')[0] || '',
                    email: user?.email || '',
                }),
            })
                .then((r) => r.json())
                .then((data) => {
                    sessionStorage.removeItem('inviteToken');
                    if (data.role) setUserRole(data.role);
                    else doFetchRole();
                })
                .catch(() => doFetchRole());
        } else {
            doFetchRole();
        }
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
                    targetStudentIds: userRole === 'teacher' ? targetStudentIds : (scheduleSessionType === 'guest' ? [] : targetStudentIds),
                    createdBy: user.id,
                    sessionImageUrl: user?.profile?.avatar_url || null,
                }),
            });
            const data = await res.json();
            if (!res.ok) { setScheduleError(data.error || 'Failed to schedule session'); setScheduling(false); return; }
            setScheduleMode(false);
            setSessionTitle(''); setSessionDesc(''); setSessionDateTime(''); setTargetStudentIds([]);
            fetchTeacherSessions();
            fetchMemberSessions();
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
            setMemberSessions(prev => prev.filter(s => s.id !== session.id));
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
        
        setUpdateSessionError('');
        
        // Fetch current targets
        try {
            const res = await fetch(`${SERVER_URL}/api/teacher/sessions/${session.id}/targets`);
            if (res.ok) {
                const targets = await res.json();
                setEditTargetStudentIds(targets.map((t: any) => t.target_user_id));
                setEditSessionType(userRole === 'teacher' ? 'students' : (targets.length > 0 ? 'students' : 'guest'));
            } else {
                setEditSessionType(userRole === 'teacher' ? 'students' : 'guest');
            }
        } catch { /* ignore */ setEditSessionType(userRole === 'teacher' ? 'students' : 'guest'); }
        
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
                    sessionImageUrl: user?.profile?.avatar_url || editingSession?.session_image_url || null,
                    scheduledAt: new Date(editSessionDateTime).toISOString(),
                    targetStudentIds: userRole === 'teacher' ? editTargetStudentIds : (editSessionType === 'guest' ? [] : editTargetStudentIds),
                }),
            });
            const data = await res.json();
            if (!res.ok) { setUpdateSessionError(data.error || 'Failed to update session'); setUpdatingSession(false); return; }
            console.log('✅ Session updated, fetching fresh data...');
            await fetchTeacherSessions();
            await fetchMemberSessions();
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
        <div className={`landing-container${userRole === 'teacher' || userRole === 'member' || userRole === 'student' ? ' teacher-fixed-root' : ''}`}>
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
                <div className="hero-pill nav-pill">
                    <span className="hero-pill-dot" />
                    Live · Real-time · Secure
                </div>
                {user && (
                    <div className="landing-nav-center">
                        <span className="nav-greeting">
                            {greeting.emoji} {greeting.text}, <span className="nav-greeting-name">{displayName || 'there'}</span>
                        </span>
                    </div>
                )}
                <div className="landing-nav-actions">
                    {!user && (
                        <>
                            <button className="btn-ghost-nav" onClick={() => setAuthModal('signin')}>Sign In</button>
                            <button className="btn-primary-nav" onClick={() => setAuthModal('signup')}>Get Started</button>
                        </>
                    )}
                    {user && <UserMenu userRole={userRole} />}
                </div>
            </nav>

            {/* â”€â”€ Scrollable body â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <div className={`landing-scroll-body${userRole === 'teacher' || userRole === 'member' || userRole === 'student' ? ' teacher-fixed-view' : ''}`}>

                {/* â”€â”€ Hero â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                <div className="landing-hero">

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
                        {userRole !== 'teacher' && (
                            <p className="hero-subtitle">
                                {userRole === 'member'
                                    ? 'Manage your courses, quizzes, and invite links below.'
                                    : userRole === 'pending'
                                    ? 'Your account is pending admin approval.'
                                    : 'Your enrolled classes are below. Join any live class or enter a code.'}
                            </p>
                        )}
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

                    {/* ONBOARDING (new user) or PENDING APPROVAL */}
                    {userRole === 'pending' && (
                        <>
                            {typeof sessionStorage !== 'undefined' && sessionStorage.getItem('needsOnboarding') === '1' && !onboardingCompleted ? (
                                <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 16px' }}>
                                    <OnboardingForm
                                        userId={user!.id}
                                        name={user?.profile?.name || user?.email?.split('@')[0] || ''}
                                        email={user?.email || ''}
                                        onComplete={(role) => {
                                            setUserRole(role === 'pending' ? 'pending' : (role as 'member' | 'teacher' | 'student'));
                                            setOnboardingCompleted(true);
                                            if (role === 'pending') {
                                                requestAnimationFrame(() => {
                                                    setTimeout(() => pendingApprovalRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
                                                });
                                            }
                                        }}
                                    />
                                </div>
                            ) : (userRole === 'pending' && (onboardingCompleted || (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('needsOnboarding') !== '1'))) ? (
                                <div ref={pendingApprovalRef} style={{ display: 'flex', justifyContent: 'center', padding: '40px 16px' }}>
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
                            ) : null}
                        </>
                    )}

                    {userRole === 'member' && (
                        <div className="teacher-dashboard-layout">

                            {/* ── LEFT SIDEBAR: Teachers & their students ── */}
                            <aside className="teacher-sidebar enter-up">
                                <div className="teacher-sidebar-section">
                                    <button
                                        onClick={() => setTeachersCollapsed(c => !c)}
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit' }}
                                    >
                                        <div className="teacher-sidebar-section-header" style={{ margin: 0, flex: 1 }}>
                                            <span>Your teachers</span>
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>({memberTeachersWithStudents.length})</span>
                                        </div>
                                        <span style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 6, transition: 'transform 0.2s', transform: teachersCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▾</span>
                                    </button>
                                    {!teachersCollapsed && (loadingTeachersWithStudents && memberTeachersWithStudents.length === 0 ? (
                                        <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 8 }}>Loading…</div>
                                    ) : memberTeachersWithStudents.length === 0 ? (
                                        <div style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5, marginTop: 8 }}>No teachers assigned yet.</div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                            {memberTeachersWithStudents.map(({ teacherId, teacherName, students }) => (
                                                <div key={teacherId} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '10px 12px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: students.length > 0 ? 8 : 0 }}>
                                                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, overflow: 'hidden' }}>
                                                            {teacherProfiles[teacherId]?.avatar_url && !failedAvatarUrls.has(teacherProfiles[teacherId].avatar_url!) ? (
                                                                <img src={teacherProfiles[teacherId].avatar_url!} alt="" onError={() => teacherProfiles[teacherId].avatar_url && markAvatarFailed(teacherProfiles[teacherId].avatar_url!)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                            ) : initialsFor(teacherProfiles[teacherId]?.name || teacherName, 'T')}
                                                        </div>
                                                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: onlineUserIds.has(teacherId) ? '#22c55e' : 'var(--text-muted)', flexShrink: 0 }} />
                                                        <div style={{ minWidth: 0 }}>
                                                            <div style={{ fontWeight: 600, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{teacherProfiles[teacherId]?.name || teacherName}</div>
                                                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{onlineUserIds.has(teacherId) ? 'Online' : (lastSeenByUserId[teacherId] ? formatLastSeen(lastSeenByUserId[teacherId]) : 'Offline')}</div>
                                                        </div>
                                                    </div>
                                                    {students.length > 0 && (
                                                        <div style={{ paddingLeft: 10, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                                            {students.map(st => {
                                                                const avatarUrl = studentProfiles[st.id]?.avatar_url || st.avatar_url;
                                                                const showStudentAvatar = avatarUrl && !failedAvatarUrls.has(avatarUrl);
                                                                return (
                                                                    <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: '3px 8px' }}>
                                                                        <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, flexShrink: 0, overflow: 'hidden' }}>
                                                                            {showStudentAvatar ? <img src={avatarUrl} alt="" onError={() => markAvatarFailed(avatarUrl)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initialsFor(st.name)}
                                                                        </div>
                                                                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: onlineUserIds.has(st.id) ? '#22c55e' : 'var(--text-muted)' }} />
                                                                        <span style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80 }}>{st.name}</span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            </aside>

                            {/* ── STAT CARDS ── */}
                            <div className="teacher-stats-bar">
                                <div className="teacher-stat-card">
                                    <div className="teacher-stat-label">Teachers</div>
                                    <div className="teacher-stat-value">{loadingMemberTeachers && memberTeachers.length === 0 ? '…' : memberTeachers.length}</div>
                                </div>
                                <div className="teacher-stat-card">
                                    <div className="teacher-stat-label">Students</div>
                                    <div className="teacher-stat-value">{loadingStudentsList && allStudents.length === 0 ? '…' : allStudents.length}</div>
                                </div>
                                <div className="teacher-stat-card">
                                    <div className="teacher-stat-label">Active Courses</div>
                                    <div className="teacher-stat-value">{memberCoursesCount}</div>
                                </div>
                                <div className="teacher-stat-card">
                                    <div className="teacher-stat-label">Upcoming Sessions</div>
                                    <div className="teacher-stat-value">{memberSessions.filter(s => new Date(s.scheduled_at) >= new Date()).length}</div>
                                </div>
                            </div>

                            {/* ── MAIN PANEL ── */}
                            <div className="dashboard-panel enter-up">
                                {/* ── Pinned header: badge | title centered | schedule btn ── */}
                                <div className="dashboard-panel-sticky">
                                    <div className="dashboard-panel-header panel-header-3col">
                                        <span className="role-badge badge-teacher">👤 Member Dashboard</span>
                                        <h2 className="dashboard-panel-title">Your Classes</h2>
                                        <button
                                            className="btn-dashboard-create"
                                            onClick={() => {
                                                setScheduleMode(true);
                                                setScheduleError('');
                                                setSessionTitle('');
                                                setSessionDesc('');
                                                setSessionDateTime('');
                                                setTargetStudentIds([]);
                                                setScheduleSessionType('guest');
                                                fetchAllStudents();
                                            }}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                                            </svg>
                                            Schedule session
                                        </button>
                                    </div>
                                </div>

                                {/* ── Scrollable content ── */}
                                <div className="dashboard-panel-scroll-body">
                                    {memberSessions.length > 0 && (
                                        <div style={{ marginBottom: 20 }}>
                                            <div className={`session-grid stagger ${memberSessions.length > 1 ? 'session-grid-multi' : ''}`}>
                                                {memberSessions.map(s => (
                                                    <div key={s.id} style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%' }}>
                                                        <MeetingBanner
                                                            meeting={{ ...s, session_image_url: teacherProfiles[s.created_by]?.avatar_url || s.session_image_url }}
                                                            displayName={displayName}
                                                            userRole="teacher"
                                                            isCreator={true}
                                                            sessionType="teacher"
                                                            teacherName={teacherProfiles[s.created_by]?.name || displayName}
                                                            onJoin={(code, id, name, role, title) => onJoinRoom(code, id, name, role, title)}
                                                        />
                                                        <div style={{ position: 'absolute', top: 14, right: 14, display: 'flex', gap: 6, zIndex: 10 }}>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleEditSession(s); }}
                                                                title="Edit session"
                                                                style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)', borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 600, color: '#a5b4fc', cursor: 'pointer' }}
                                                            >Edit</button>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleDeleteSession(s); }}
                                                                title="Delete session"
                                                                style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 600, color: '#fca5a5', cursor: 'pointer' }}
                                                            >Delete</button>
                                                        </div>
                                                        <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
                                                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Share link (no login required)</div>
                                                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                                                <input readOnly value={`${typeof window !== 'undefined' ? window.location.origin : ''}?guest=${s.room_code}`} style={{ flex: 1, minWidth: 120, padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'var(--text)', fontSize: 12 }} />
                                                                <button type="button" onClick={() => navigator.clipboard.writeText(`${window.location.origin}?guest=${s.room_code}`)} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: 'var(--primary, #6366f1)', color: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>Copy</button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <MemberCoursesSection userId={user!.id} onCoursesChange={fetchMemberCoursesCount} />
                                </div>
                            </div>
                        </div>
                    )}

                    {userRole === 'teacher' && (
                        <div className="teacher-dashboard-layout">

                            {/* ── LEFT SIDEBAR: Students & Groups ── */}
                            <aside className="teacher-sidebar enter-up">
                                {/* Your students */}
                                <div className="teacher-sidebar-section">
                                    <button
                                        onClick={() => setStudentsCollapsed(c => !c)}
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit' }}
                                    >
                                        <div className="teacher-sidebar-section-header" style={{ margin: 0, flex: 1 }}>
                                            <span>Your students</span>
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>({teacherStudents.length})</span>
                                        </div>
                                        <span style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 6, transition: 'transform 0.2s', transform: studentsCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▾</span>
                                    </button>
                                    {!studentsCollapsed && (
                                        loadingTeacherStudents && teacherStudents.length === 0 ? (
                                            <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 8 }}>Loading…</div>
                                        ) : teacherStudents.length === 0 ? (
                                            <div style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5, marginTop: 8 }}>No students assigned yet. Share your invite link from Profile → Invite links.</div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                                                {teacherStudents.map(st => {
                                                    const avatarUrl = studentProfiles[st.id]?.avatar_url || st.avatar_url;
                                                    const showStudentAvatar = avatarUrl && !failedAvatarUrls.has(avatarUrl);
                                                    return (
                                                    <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '7px 10px' }}>
                                                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, overflow: 'hidden' }}>
                                                            {showStudentAvatar ? (
                                                                <img src={avatarUrl} alt="" onError={() => markAvatarFailed(avatarUrl)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                            ) : (
                                                                initialsFor(st.name, st.email)
                                                            )}
                                                        </div>
                                                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: onlineUserIds.has(st.id) ? '#22c55e' : 'var(--text-muted)', flexShrink: 0 }} title={onlineUserIds.has(st.id) ? 'Online' : 'Offline'} />
                                                        <div style={{ minWidth: 0 }}>
                                                            <div style={{ fontWeight: 600, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st.name || 'Student'}</div>
                                                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{onlineUserIds.has(st.id) ? 'Online' : (lastSeenByUserId[st.id] ? formatLastSeen(lastSeenByUserId[st.id]) : 'Offline')}</div>
                                                        </div>
                                                    </div>
                                                    );
                                                })}
                                            </div>
                                        )
                                    )}
                                </div>

                                {/* Student Groups */}
                                <div className="teacher-sidebar-section">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <button
                                            onClick={() => setGroupsCollapsed(c => !c)}
                                            style={{ display: 'flex', alignItems: 'center', gap: 0, flex: 1, background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit' }}
                                        >
                                            <div className="teacher-sidebar-section-header" style={{ margin: 0, flex: 1 }}>
                                                <span>Student Groups</span>
                                                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>({teacherGroups.length})</span>
                                            </div>
                                            <span style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 6, transition: 'transform 0.2s', transform: groupsCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▾</span>
                                        </button>
                                        <button
                                            onClick={() => { setGroupModalMode('create'); setNewGroupName(''); setGroupError(''); }}
                                            style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 6, padding: '3px 9px', fontSize: 11, fontWeight: 600, color: '#a5b4fc', cursor: 'pointer', flexShrink: 0 }}
                                        >+ New</button>
                                    </div>
                                    {!groupsCollapsed && (loadingTeacherGroups && teacherGroups.length === 0 ? (
                                        <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 8 }}>Loading…</div>
                                    ) : teacherGroups.length === 0 ? (
                                        <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>No groups yet. Create groups to assign quizzes to specific students.</div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {teacherGroups.map(g => (
                                                <div key={g.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '10px 12px' }}>
                                                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{g.name}</div>
                                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>{g.member_count} member{g.member_count !== 1 ? 's' : ''}</div>
                                                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                                        <button
                                                            onClick={async () => { setEditingGroup(g); setGroupModalMode('manage'); setGroupError(''); const r = await fetch(`${SERVER_URL}/api/groups/${g.id}/members`); const members = r.ok ? await r.json() : []; setGroupMembers(members); setGroupMemberIds(members.map((m: { id: string }) => m.id)); }}
                                                            title="Manage members"
                                                            style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 600, color: '#a5b4fc', cursor: 'pointer' }}
                                                        >Members</button>
                                                        <button
                                                            onClick={() => { setEditingGroup(g); setNewGroupName(g.name); setGroupModalMode('edit'); setGroupError(''); }}
                                                            title="Edit group"
                                                            style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 600, color: '#a5b4fc', cursor: 'pointer' }}
                                                        >Edit</button>
                                                        <button
                                                            onClick={async () => { if (confirm(`Delete group "${g.name}"?`)) { await fetch(`${SERVER_URL}/api/groups/${g.id}`, { method: 'DELETE' }); fetchTeacherGroups(); } }}
                                                            title="Delete group"
                                                            style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 600, color: '#fca5a5', cursor: 'pointer' }}
                                                        >Delete</button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            </aside>

                            {/* ── STAT CARDS (inside grid, right column via CSS) ── */}
                            <div className="teacher-stats-bar">
                                <div className="teacher-stat-card">
                                    <div className="teacher-stat-label">Students</div>
                                    <div className="teacher-stat-value">{loadingTeacherStudents && teacherStudents.length === 0 ? '…' : teacherStudents.length}</div>
                                </div>
                                <div className="teacher-stat-card">
                                    <div className="teacher-stat-label">Active Courses</div>
                                    <div className="teacher-stat-value">{teacherCoursesCount}</div>
                                </div>
                                <div className="teacher-stat-card">
                                    <div className="teacher-stat-label">Groups</div>
                                    <div className="teacher-stat-value">{loadingTeacherGroups && teacherGroups.length === 0 ? '…' : teacherGroups.length}</div>
                                </div>
                                <div className="teacher-stat-card">
                                    <div className="teacher-stat-label">Upcoming Sessions</div>
                                    <div className="teacher-stat-value">{teacherSessions.filter(s => new Date(s.scheduled_at) >= new Date()).length}</div>
                                </div>
                            </div>

                            {/* ── MAIN PANEL ── */}
                            <div className="dashboard-panel enter-up">

                                {/* ── Pinned header: badge | title centered | schedule btn ── */}
                                <div className="dashboard-panel-sticky">
                                    <div className="dashboard-panel-header panel-header-3col">
                                        <span className="role-badge badge-teacher">🎓 Teacher Dashboard</span>
                                        <h2 className="dashboard-panel-title">Your Classes</h2>
                                        <button
                                            className="btn-dashboard-create"
                                            onClick={() => {
                                                setScheduleMode(true);
                                                setScheduleError('');
                                                setSessionTitle('');
                                                setSessionDesc('');
                                                setSessionDateTime('');
                                                setTargetStudentIds([]);
                                                setScheduleSessionType('students');
                                                fetchAllStudents();
                                            }}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                                            </svg>
                                            Schedule Class
                                        </button>
                                    </div>
                                </div>

                                {/* ── Scrollable content: session cards + courses ── */}
                                <div className="dashboard-panel-scroll-body">
                                    {teacherSessions.length > 0 && (
                                        <div style={{ marginBottom: 8 }}>
                                            <div className={`session-grid stagger ${teacherSessions.length > 1 ? 'session-grid-multi' : ''}`}>
                                            {teacherSessions.map(s => (
                                                <div key={s.id} style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%' }}>
                                                    <MeetingBanner
                                                        key={s.id}
                                                        meeting={{ ...s, session_image_url: teacherProfiles[s.created_by]?.avatar_url || s.session_image_url }}
                                                        displayName={displayName}
                                                        userRole="teacher"
                                                        isCreator={true}
                                                        sessionType="teacher"
                                                        teacherName={teacherProfiles[s.created_by]?.name || displayName}
                                                        onJoin={(code, id, name, role, title) => onJoinRoom(code, id, name, role, title)}
                                                    />
                                                    <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 6, zIndex: 10 }}>
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
                                    <MemberCoursesSection userId={user!.id} onCoursesChange={fetchTeacherCoursesCount} />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STUDENT DASHBOARD */}
                    {userRole === 'student' && (
                        <div className="teacher-dashboard-layout">

                            {/* ── LEFT SIDEBAR: Your Teachers ── */}
                            <aside className="teacher-sidebar enter-up">
                                <div className="teacher-sidebar-section">
                                    <div className="teacher-sidebar-section-header">
                                        <span>Your teachers</span>
                                    </div>
                                    {(() => {
                                        const teacherIds = Array.from(new Set(studentTeacherSessions.map(s => s.created_by)));
                                        return teacherIds.length === 0 ? (
                                            <div style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5 }}>No teachers assigned yet.</div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                {teacherIds.map(tid => {
                                                    const name = teacherProfiles[tid]?.name ?? teacherNamesFromApi[tid] ?? 'Teacher';
                                                    const avatarUrl = teacherProfiles[tid]?.avatar_url;
                                                    return (
                                                        <div key={tid} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '7px 10px' }}>
                                                            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, overflow: 'hidden' }}>
                                                                {avatarUrl && !failedAvatarUrls.has(avatarUrl) ? (
                                                                    <img src={avatarUrl} alt="" onError={() => markAvatarFailed(avatarUrl)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                                ) : initialsFor(name)}
                                                            </div>
                                                            <div style={{ width: 7, height: 7, borderRadius: '50%', background: onlineUserIds.has(tid) ? '#22c55e' : 'var(--text-muted)', flexShrink: 0 }} title={onlineUserIds.has(tid) ? 'Online' : 'Offline'} />
                                                            <div style={{ minWidth: 0 }}>
                                                                <div style={{ fontWeight: 600, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                                                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{onlineUserIds.has(tid) ? 'Online' : (lastSeenByUserId[tid] ? formatLastSeen(lastSeenByUserId[tid]) : 'Offline')}</div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })()}
                                </div>
                            </aside>

                            {/* ── STAT CARDS ── */}
                            <div className="teacher-stats-bar">
                                <div className="teacher-stat-card">
                                    <div className="teacher-stat-label">Upcoming Sessions</div>
                                    <div className="teacher-stat-value">{studentTeacherSessions.filter(s => new Date(s.scheduled_at) >= new Date()).length}</div>
                                </div>
                                <div className="teacher-stat-card">
                                    <div className="teacher-stat-label">Total Classes</div>
                                    <div className="teacher-stat-value">{studentTeacherSessions.length}</div>
                                </div>
                                <div className="teacher-stat-card">
                                    <div className="teacher-stat-label">Teachers</div>
                                    <div className="teacher-stat-value">{Array.from(new Set(studentTeacherSessions.map(s => s.created_by))).length}</div>
                                </div>
                            </div>

                            {/* ── MAIN PANEL ── */}
                            <div className="dashboard-panel enter-up">
                                {/* ── Pinned header ── */}
                                <div className="dashboard-panel-sticky">
                                    <div className="dashboard-panel-header">
                                        <div className="dashboard-panel-title-group">
                                            <span className="role-badge badge-student">📚 Student Dashboard</span>
                                            <h2 className="dashboard-panel-title">Your Classes</h2>
                                        </div>
                                    </div>
                                </div>

                                {/* ── Scrollable content ── */}
                                <div className="dashboard-panel-scroll-body">
                                    {studentTeacherSessions.length > 0 ? (
                                        <div className={`session-grid stagger ${studentTeacherSessions.length > 1 ? 'session-grid-multi' : ''}`}>
                                            {studentTeacherSessions.map(s => (
                                                <MeetingBanner
                                                    key={s.id}
                                                    meeting={{ ...s, session_image_url: teacherProfiles[s.created_by]?.avatar_url || s.session_image_url }}
                                                    displayName={displayName}
                                                    userRole="student"
                                                    isCreator={false}
                                                    sessionType="teacher"
                                                    teacherName={teacherProfiles[s.created_by]?.name}
                                                    onJoin={(code, id, name, role, title) => onJoinRoom(code, id, name, role, title)}
                                                />
                                            ))}
                                        </div>
                                    ) : (
                                        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>No scheduled sessions yet.</div>
                                    )}
                                </div>
                            </div>
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
                            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#f1f5f9' }}>{userRole === 'member' ? 'Schedule session' : 'Schedule a Class'}</h3>
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
                                    What will you cover? <span style={{ color: '#475569', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(one topic per line → shown as bullets)</span>
                                </label>
                                <textarea
                                    className="form-input"
                                    placeholder={"Introduction to the topic\nKey concepts and definitions\nPractice exercises"}
                                    value={sessionDesc}
                                    onChange={e => setSessionDesc(e.target.value)}
                                    rows={4}
                                    style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }}
                                />
                            </div>
                            {(userRole === 'teacher' || userRole === 'member') && (
                                <>
                                    {userRole === 'member' && (
                                        <div>
                                            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Who can join?</label>
                                            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: 'var(--text)' }}>
                                                    <input type="radio" name="scheduleSessionType" checked={scheduleSessionType === 'guest'} onChange={() => setScheduleSessionType('guest')} style={{ accentColor: '#6366f1' }} />
                                                    Anyone with the link (guest)
                                                </label>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: 'var(--text)' }}>
                                                    <input type="radio" name="scheduleSessionType" checked={scheduleSessionType === 'students'} onChange={() => setScheduleSessionType('students')} style={{ accentColor: '#6366f1' }} />
                                                    Selected students
                                                </label>
                                            </div>
                                        </div>
                                    )}
                                    {(userRole === 'teacher' || scheduleSessionType === 'students') && (
                                <div>
                                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                        Target Students {targetStudentIds.length > 0 && <span style={{ color: '#818cf8' }}>({targetStudentIds.length} selected)</span>}
                                    </label>
                                    {loadingStudentsList && allStudents.length === 0 ? (
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
                                    )}
                                </>
                            )}
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
                                {scheduling ? 'Scheduling…' : userRole === 'member' ? 'Schedule session' : 'Schedule Class'}
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
                                    What will you cover? <span style={{ color: '#475569', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(one topic per line → shown as bullets)</span>
                                </label>
                                <textarea
                                    className="form-input"
                                    placeholder={"Introduction to the topic\nKey concepts and definitions\nPractice exercises"}
                                    value={editSessionDesc}
                                    onChange={e => setEditSessionDesc(e.target.value)}
                                    rows={4}
                                    style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }}
                                />
                            </div>
                            {(userRole === 'teacher' || userRole === 'member') && (
                                <>
                                    {userRole === 'member' && (
                                        <div>
                                            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Who can join?</label>
                                            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: 'var(--text)' }}>
                                                    <input type="radio" name="editSessionType" checked={editSessionType === 'guest'} onChange={() => setEditSessionType('guest')} style={{ accentColor: '#6366f1' }} />
                                                    Anyone with the link (guest)
                                                </label>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: 'var(--text)' }}>
                                                    <input type="radio" name="editSessionType" checked={editSessionType === 'students'} onChange={() => setEditSessionType('students')} style={{ accentColor: '#6366f1' }} />
                                                    Selected students
                                                </label>
                                            </div>
                                        </div>
                                    )}
                                    {(userRole === 'teacher' || editSessionType === 'students') && (
                                        <div>
                                            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                                Target Students {editTargetStudentIds.length > 0 && <span style={{ color: '#818cf8' }}>({editTargetStudentIds.length} selected)</span>}
                                            </label>
                                            {loadingStudentsList && allStudents.length === 0 ? (
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
                                    )}
                                </>
                            )}
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
                                {updatingSession ? 'Updating…' : 'Update session'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Group Modal (create / edit / manage) */}
            {groupModalMode && user?.id && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 1000,
                    background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
                    overflowY: 'auto',
                }} onClick={() => { setGroupModalMode(null); setEditingGroup(null); setNewGroupName(''); setGroupError(''); }}>
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
                            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#f1f5f9' }}>
                                {groupModalMode === 'create' ? 'Create Group' : groupModalMode === 'edit' ? 'Edit Group' : `Manage: ${editingGroup?.name || ''}`}
                            </h3>
                            <button onClick={() => { setGroupModalMode(null); setEditingGroup(null); setNewGroupName(''); setGroupError(''); }} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
                        </div>

                        {groupError && <div className="error-banner" style={{ marginBottom: 16 }}>{groupError}</div>}

                        {groupModalMode === 'create' && (
                            <>
                                <div>
                                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Group Name *</label>
                                    <input
                                        className="form-input"
                                        type="text"
                                        placeholder="e.g. Grade 1, Math Club"
                                        value={newGroupName}
                                        onChange={e => setNewGroupName(e.target.value)}
                                        style={{ width: '100%', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
                                    <button className="btn-ghost btn-sm" onClick={() => setGroupModalMode(null)}>Cancel</button>
                                    <button
                                        className="btn btn-primary"
                                        disabled={savingGroup || !newGroupName.trim()}
                                        onClick={async () => {
                                            setSavingGroup(true); setGroupError('');
                                            try {
                                                const r = await fetch(`${SERVER_URL}/api/teacher/${user.id}/groups`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newGroupName.trim() }) });
                                                const data = await r.json();
                                                if (!r.ok) { setGroupError(data.error || 'Failed'); setSavingGroup(false); return; }
                                                fetchTeacherGroups();
                                                setGroupModalMode(null); setNewGroupName('');
                                            } catch { setGroupError('Server unreachable'); }
                                            setSavingGroup(false);
                                        }}
                                    >{savingGroup ? 'Creating…' : 'Create'}</button>
                                </div>
                            </>
                        )}

                        {groupModalMode === 'edit' && editingGroup && (
                            <>
                                <div>
                                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Group Name *</label>
                                    <input
                                        className="form-input"
                                        type="text"
                                        value={newGroupName}
                                        onChange={e => setNewGroupName(e.target.value)}
                                        style={{ width: '100%', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
                                    <button className="btn-ghost btn-sm" onClick={() => setGroupModalMode(null)}>Cancel</button>
                                    <button
                                        className="btn btn-primary"
                                        disabled={savingGroup || !newGroupName.trim()}
                                        onClick={async () => {
                                            setSavingGroup(true); setGroupError('');
                                            try {
                                                const r = await fetch(`${SERVER_URL}/api/groups/${editingGroup.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newGroupName.trim() }) });
                                                const data = await r.json();
                                                if (!r.ok) { setGroupError(data.error || 'Failed'); setSavingGroup(false); return; }
                                                fetchTeacherGroups();
                                                setGroupModalMode(null); setEditingGroup(null); setNewGroupName('');
                                            } catch { setGroupError('Server unreachable'); }
                                            setSavingGroup(false);
                                        }}
                                    >{savingGroup ? 'Saving…' : 'Save'}</button>
                                </div>
                            </>
                        )}

                        {groupModalMode === 'manage' && editingGroup && (
                            <>
                                <div style={{ marginBottom: 16 }}>
                                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Current members ({groupMembers.length})</label>
                                    {groupMembers.length === 0 ? (
                                        <div style={{ fontSize: 13, color: '#64748b' }}>No members yet.</div>
                                    ) : (
                                        <div style={{ maxHeight: 120, overflowY: 'auto', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 10, background: 'rgba(99,102,241,0.05)' }}>
                                            {groupMembers.map(m => (
                                                <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid rgba(99,102,241,0.1)' }}>
                                                    <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{m.name || m.email || 'Student'}</span>
                                                    <button
                                                        onClick={async () => { await fetch(`${SERVER_URL}/api/groups/${editingGroup.id}/members/${m.id}`, { method: 'DELETE' }); const r = await fetch(`${SERVER_URL}/api/groups/${editingGroup.id}/members`); const members = r.ok ? await r.json() : []; setGroupMembers(members); setGroupMemberIds(members.map((x: { id: string }) => x.id)); fetchTeacherGroups(); }}
                                                        style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 6, padding: '4px 8px', fontSize: 11, color: '#fca5a5', cursor: 'pointer' }}
                                                    >Remove</button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Add students</label>
                                    {teacherStudents.length === 0 ? (
                                        <div style={{ fontSize: 13, color: '#64748b' }}>No students assigned yet.</div>
                                    ) : (
                                        <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 10, background: 'rgba(99,102,241,0.05)' }}>
                                            {teacherStudents.filter(s => !groupMemberIds.includes(s.id)).map(s => (
                                                <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid rgba(99,102,241,0.1)' }}>
                                                    <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{s.name || s.email || 'Student'}</span>
                                                    <button
                                                        onClick={async () => {
                                                            setAddingMemberId(s.id); setGroupError('');
                                                            const r = await fetch(`${SERVER_URL}/api/groups/${editingGroup.id}/members`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentIds: [s.id] }) });
                                                            const data = await r.json();
                                                            if (!r.ok) { setGroupError(data.error || 'Failed to add member'); setAddingMemberId(null); return; }
                                                            const members = Array.isArray(data) ? data : [];
                                                            setGroupMembers(members);
                                                            setGroupMemberIds(members.map((x: { id: string }) => x.id));
                                                            fetchTeacherGroups();
                                                            setAddingMemberId(null);
                                                        }}
                                                        disabled={addingMemberId === s.id}
                                                        style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 6, padding: '4px 8px', fontSize: 11, color: '#a5b4fc', cursor: addingMemberId === s.id ? 'wait' : 'pointer' }}
                                                    >{addingMemberId === s.id ? 'Adding…' : 'Add'}</button>
                                                </div>
                                            ))}
                                            {teacherStudents.filter(s => !groupMemberIds.includes(s.id)).length === 0 && (
                                                <div style={{ padding: 12, fontSize: 13, color: '#64748b' }}>All students are already in this group.</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
                                    <button className="btn-ghost btn-sm" onClick={() => { setGroupModalMode(null); setEditingGroup(null); }}>Done</button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {authModal && <AuthModal defaultTab={authModal} onClose={() => setAuthModal(null)} />}
            {user?.id && userRole && userRole !== 'pending' && userRole !== 'admin' && (
                <>
                    <button
                        className="quiz-fab"
                        onClick={() => setQuizOpen(true)}
                        title="Quizzes"
                    >
                        📝
                    </button>
                    <button
                        className="chat-fab"
                        onClick={() => setChatOpen(true)}
                        title="Messages"
                    >
                        💬
                        {unreadChatCount > 0 && (
                            <span className="chat-fab-badge">
                                {unreadChatCount > 9 ? '9+' : unreadChatCount}
                            </span>
                        )}
                    </button>
                    <ChatDrawer
                        userId={user.id}
                        userName={displayName}
                        userRole={userRole}
                        open={chatOpen}
                        onClose={() => setChatOpen(false)}
                        onUnreadChange={setUnreadChatCount}
                    />
                    <QuizDrawer
                        userId={user.id}
                        userName={displayName}
                        userRole={userRole}
                        open={quizOpen}
                        onClose={() => setQuizOpen(false)}
                        quizScoreUpdateTrigger={quizScoreUpdateTrigger}
                    />
                </>
            )}
        </div>
    );
}

