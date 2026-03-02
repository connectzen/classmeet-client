import { useState, useEffect, useCallback, useRef } from 'react';
import { useUser } from '../lib/AuthContext';
import ChatPanel, { ChatMsg } from '../components/ChatPanel';
import DevicePicker from '../components/DevicePicker';
import RescheduleSessionModal from '../components/RescheduleSessionModal';
import { RoomQuizParticipant, RoomQuizHost, PostSubmitWaiting, InlineResultCard } from '../components/RoomQuizPanel';
import RoomCoursePanel, { DrawSeg } from '../components/RoomCoursePanel';
import DOMPurify from 'dompurify';
import { useSocket, Participant } from '../hooks/useSocket';
import { useWebRTC } from '../hooks/useWebRTC';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

interface Props {
    roomCode: string;
    roomId: string;
    roomName: string;
    name: string;
    role: 'teacher' | 'student' | 'guest';
    isGuestRoomHost?: boolean;
    onLeave: () => void;
}

interface ParticipantState extends Participant {
    isMuted: boolean;
    isCamOff: boolean;
}

// Save session to localStorage for rejoin
function saveSession(data: { roomCode: string; roomId: string; roomName: string; role: string; name: string }) {
    localStorage.setItem('classmeet_last_room', JSON.stringify({ ...data, joinedAt: Date.now() }));
}

function clearSession() {
    localStorage.removeItem('classmeet_last_room');
}

export default function Room({ roomCode, roomId, roomName, name, role, isGuestRoomHost, onLeave }: Props) {
    const { user } = useUser();
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [participants, setParticipants] = useState<Map<string, ParticipantState>>(new Map());
    const [messages, setMessages] = useState<ChatMsg[]>([]);
    const [micOn, setMicOn] = useState(true);
    const [camOn, setCamOn] = useState(true);
    const [roomEnded, setRoomEnded] = useState(false);
    const [spotlightId, setSpotlightId] = useState<string>('__local__');
    const [showDevicePicker, setShowDevicePicker] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false); // mobile chat popup
    const [activeVideoDeviceId, setActiveVideoDeviceId] = useState<string | null>(null);
    const [activeAudioDeviceId, setActiveAudioDeviceId] = useState<string | null>(null);
    const [teacherGraceCountdown, setTeacherGraceCountdown] = useState<number | null>(null);
    const [codeCopied, setCodeCopied] = useState(false);
    const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
    const [showEndConfirm, setShowEndConfirm] = useState(false);
    const [showRescheduleModal, setShowRescheduleModal] = useState(false);
    const [hasScheduledSession, setHasScheduledSession] = useState<boolean | null>(null);
    const [quizToggleOn, setQuizToggleOn] = useState(false);
    const [courseToggleOn, setCourseToggleOn] = useState(false);
    const [courseSharedWithStudents, setCourseSharedWithStudents] = useState(false);
    const [sessionQuizIds, setSessionQuizIds] = useState<string[]>([]);
    const [sessionCourseIds, setSessionCourseIds] = useState<string[]>([]);
    const [roomQuizzes, setRoomQuizzes] = useState<{ id: string; title: string; question_count?: number; room_id?: string }[]>([]);
    const [loadingRoomQuizzes, setLoadingRoomQuizzes] = useState(false);
    const [roomQuizSubmitted, setRoomQuizSubmitted] = useState(false);
    const [studentQuizStarted, setStudentQuizStarted] = useState(false);
    const [studentCourseJoined, setStudentCourseJoined] = useState(false);
    const [externalCourseNav, setExternalCourseNav] = useState<{ courseIdx: number; lessonIdx: number } | null>(null);
    const [externalCourseScroll, setExternalCourseScroll] = useState<number | null>(null);
    const [courseSidebarOpen, setCourseSidebarOpen] = useState(false);
    const [courseLessonIdx, setCourseLessonIdx] = useState(0);
    const [courseCourseIdx, setCourseCourseIdx] = useState(0);
    const [courseTotalLessons, setCourseTotalLessons] = useState(1);
    const [dismissedRevealed, setDismissedRevealed] = useState(false);
    const [revealKey, setRevealKey] = useState(0);
    // Draw/annotation overlay state
    const [externalDrawSeg, setExternalDrawSeg] = useState<DrawSeg | null>(null);
    const [externalDrawPreview, setExternalDrawPreview] = useState<DrawSeg | null>(null);
    const [externalCursor, setExternalCursor] = useState<{ x: number; y: number } | null>(null);
    const [drawClearSignal, setDrawClearSignal] = useState(0);
    const [snapshotRequest, setSnapshotRequest] = useState(0);
    const [externalDrawSnapshot, setExternalDrawSnapshot] = useState<string | null>(null);
    // Quiz student monitoring (teacher side) — keyed by socketId
    const [quizStudentProgress, setQuizStudentProgress] = useState<Map<string, { name: string; currentIdx: number; totalQ: number; answers: Record<string, { questionId: string; answerText?: string; selectedOptions?: string[] }> }>>(new Map());
    const [quizFocusedStudent, setQuizFocusedStudent] = useState<string | null>(null);
    const [quizMonitorMode, setQuizMonitorMode] = useState(false);
    const socketIdRef = useRef<string>('');
    const mobileChatRef = useRef<HTMLDivElement>(null);
    // Refs used in handleParticipantJoined to avoid stale closures
    const liveStateRef = useRef({
        courseToggleOn: false, courseSharedWithStudents: false,
        sessionCourseIds: [] as string[], courseLessonIdx: 0,
        courseCourseIdx: 0, courseSidebarOpen: false,
    });
    const emittersRef = useRef<{
        emitCourseToggle?: (active: boolean, courseIds: string[]) => void;
        emitCourseNavigate?: (courseIdx: number, lessonIdx: number) => void;
        emitCourseSidebar?: (open: boolean) => void;
    }>({});

    const copyRoomCode = () => {
        navigator.clipboard.writeText(roomCode).then(() => {
            setCodeCopied(true);
            setTimeout(() => setCodeCopied(false), 2000);
        });
    };

    // Save session immediately for rejoin capability
    useEffect(() => {
        saveSession({ roomCode, roomId, roomName, role, name });
        // Also track this class in the student's joined-classes list
        if (role === 'student') {
            try {
                const stored = JSON.parse(localStorage.getItem('classmeet_joined_classes') || '[]');
                const filtered = stored.filter((c: { id: string }) => c.id !== roomId);
                filtered.unshift({ code: roomCode, id: roomId, name: roomName, joinedAt: Date.now() });
                localStorage.setItem('classmeet_joined_classes', JSON.stringify(filtered.slice(0, 20)));
            } catch { /* ignore */ }
            // Persist enrollment to backend (so it survives localStorage clears)
            if (user?.id) {
                fetch(`${SERVER_URL}/api/enrollments`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: user.id, roomId, roomCode, roomName }),
                }).catch(() => { /* best-effort */ });
            }
        }
        return () => { /* don't clear on unmount — allow rejoin on accidental close */ };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    // Get local media stream
    useEffect(() => {
        let cancelled = false;

        (async () => {
            // Stop existing tracks to release camera hardware
            // (mobile browsers require this before switching to rear camera)
            setLocalStream((prev) => { prev?.getTracks().forEach((t) => t.stop()); return null; });

            let videoConstraint: MediaTrackConstraints | boolean = true;
            if (activeVideoDeviceId) {
                const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
                if (isMobile) {
                    // On mobile, facingMode is the reliable way to switch cameras
                    try {
                        const devices = await navigator.mediaDevices.enumerateDevices();
                        const selected = devices.find(d => d.deviceId === activeVideoDeviceId);
                        const label = (selected?.label || '').toLowerCase();
                        if (label.includes('back') || label.includes('rear') || label.includes('environment')) {
                            videoConstraint = { facingMode: { exact: 'environment' } };
                        } else if (label.includes('front') || label.includes('user') || label.includes('selfie')) {
                            videoConstraint = { facingMode: { exact: 'user' } };
                        } else {
                            videoConstraint = { deviceId: { exact: activeVideoDeviceId } };
                        }
                    } catch {
                        videoConstraint = { deviceId: { exact: activeVideoDeviceId } };
                    }
                } else {
                    videoConstraint = { deviceId: { exact: activeVideoDeviceId } };
                }
            }

            const constraints: MediaStreamConstraints = {
                video: videoConstraint,
                audio: activeAudioDeviceId ? { deviceId: { exact: activeAudioDeviceId } } : true,
            };

            try {
                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
                setLocalStream(stream);
                setMicOn(true); setCamOn(true);
            } catch {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
                    if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
                    setLocalStream(stream);
                } catch (e) { console.error(e); }
            }
        })();

        return () => { cancelled = true; };
    }, [activeVideoDeviceId, activeAudioDeviceId]);

    // Keep live state ref in sync so handleParticipantJoined can read current values
    liveStateRef.current = {
        courseToggleOn, courseSharedWithStudents, sessionCourseIds,
        courseLessonIdx, courseCourseIdx, courseSidebarOpen,
    };

    // ── Socket event handlers ────────────────────────────────────────────
    const handleParticipantJoined = useCallback((p: Participant) => {
        setParticipants((prev) => new Map(prev).set(p.socketId, { ...p, isMuted: false, isCamOff: false }));
        addNewPeer(p.socketId);
        if (p.role === 'teacher') setTeacherGraceCountdown(null);

        // Teacher: re-broadcast current state so late-joining students see what's on screen
        if (role === 'teacher') {
            const s = liveStateRef.current;
            const e = emittersRef.current;
            if (s.courseToggleOn && s.courseSharedWithStudents && e.emitCourseToggle) {
                // Small delay to let the new client finish joining before receiving state
                setTimeout(() => {
                    e.emitCourseToggle!(true, s.sessionCourseIds);
                    setTimeout(() => {
                        e.emitCourseNavigate?.(s.courseCourseIdx, s.courseLessonIdx);
                        e.emitCourseSidebar?.(s.courseSidebarOpen);
                        // Trigger canvas snapshot capture so late joiner sees current annotations
                        setSnapshotRequest(prev => prev + 1);
                    }, 400);
                }, 600);
            }
        }
    }, [role]);

    const handleParticipantLeft = useCallback((sid: string) => {
        setParticipants((prev) => { const next = new Map(prev); next.delete(sid); return next; });
        removePeer(sid);
        setSpotlightId((prev) => prev === sid ? '__local__' : prev);
        // Clean quiz progress so disconnected students don't ghost in the monitor
        setQuizStudentProgress(prev => { const n = new Map(prev); n.delete(sid); return n; });
        setQuizFocusedStudent(prev => (prev === sid ? null : prev));
    }, []);

    const handleSignal = useCallback((data: { from: string; signal: unknown }) => {
        handleWebRTCSignal(data as { from: string; signal: never });
    }, []);

    const handleChatMessage = useCallback((msg: ChatMsg) => {
        setMessages((prev) => [...prev, msg]);
    }, []);

    const handleRoomEnded = useCallback(() => {
        clearSession();
        setRoomEnded(true);
        setTimeout(onLeave, 3000);
    }, [onLeave]);

    const handleForceMute = useCallback((muted: boolean) => {
        if (!localStream) return;
        const track = localStream.getAudioTracks()[0];
        if (track) { track.enabled = !muted; setMicOn(!muted); }
    }, [localStream]);

    const handleParticipantMuteChanged = useCallback((sid: string, muted: boolean) => {
        setParticipants((prev) => {
            const next = new Map(prev);
            const p = next.get(sid);
            if (p) next.set(sid, { ...p, isMuted: muted });
            return next;
        });
    }, []);

    const handleParticipantCamChanged = useCallback((sid: string, camOn: boolean) => {
        setParticipants((prev) => {
            const next = new Map(prev);
            const p = next.get(sid);
            if (p) next.set(sid, { ...p, isCamOff: !camOn });
            return next;
        });
    }, []);

    const handleForceCam = useCallback((camOn: boolean) => {
        if (!localStream) return;
        const track = localStream.getVideoTracks()[0];
        if (track) { track.enabled = camOn; setCamOn(camOn); }
    }, [localStream]);

    const handleTeacherDisconnected = useCallback((graceSeconds: number) => {
        setTeacherGraceCountdown(graceSeconds);
        const interval = setInterval(() => {
            setTeacherGraceCountdown((prev) => {
                if (prev === null || prev <= 1) { clearInterval(interval); return null; }
                return prev - 1;
            });
        }, 1000);
    }, []);

    // Spotlight synced from teacher — updates every client's view.
    // Normalize: if the spotlighted socket is OUR own socket, store '__local__'
    // so the sidebar filter and stream lookup stay consistent.
    const handleSpotlightChanged = useCallback((spotlightSocketId: string | null) => {
        if (!spotlightSocketId) return;
        setSpotlightId(spotlightSocketId === socketIdRef.current ? '__local__' : spotlightSocketId);
    }, []);

    // Teacher joined — cancel any no-teacher countdown
    const handleTeacherJoined = useCallback(() => {
        setTeacherGraceCountdown(null);
    }, []);

    const { socketId, connected, joinError: socketJoinError, existingParticipants, currentSpotlight,
        roomQuiz, roomQuizSubmissions, roomQuizRevealed, revealedStudentIds,
        sendSignal, sendMessage, endRoom, muteParticipant, camParticipant, broadcastSelfCam, changeSpotlight,
        startRoomQuiz, stopRoomQuiz, submitRoomQuiz, revealRoomQuiz,
        emitCourseToggle, emitCourseNavigate, emitCourseScroll, emitCourseSidebar,
        emitDrawSegment, emitDrawPreview, emitDrawCursor, emitDrawClear, emitDrawSnapshot,
        emitQuizStarted, emitQuizStopped, emitQuizProgress,
    } = useSocket({
            roomCode, roomId, roomName, name, role, isGuestRoomHost,
            onParticipantJoined: handleParticipantJoined,
            onParticipantLeft: handleParticipantLeft,
            onSignal: handleSignal,
            onChatMessage: handleChatMessage,
            onRoomEnded: handleRoomEnded,
            onForceMute: handleForceMute,
            onForceCam: handleForceCam,
            onParticipantMuteChanged: handleParticipantMuteChanged,
            onParticipantCamChanged: handleParticipantCamChanged,
            onTeacherDisconnected: handleTeacherDisconnected,
            onSpotlightChanged: handleSpotlightChanged,
            onTeacherJoined: handleTeacherJoined,
            onAdminRefresh: undefined,
            onCourseToggle: (active, courseIds) => {
                if (role !== 'teacher') {
                    setCourseToggleOn(active);
                    if (active && courseIds.length > 0) setSessionCourseIds(courseIds);
                    if (!active) { setStudentCourseJoined(false); setCourseSidebarOpen(false); }
                }
            },
            onCourseNavigate: (courseIdx, lessonIdx) => {
                if (role !== 'teacher') setExternalCourseNav({ courseIdx, lessonIdx });
            },
            onCourseScroll: (ratio) => {
                if (role !== 'teacher') setExternalCourseScroll(ratio);
            },
            onCourseSidebar: (open) => {
                if (role !== 'teacher') setCourseSidebarOpen(open);
            },
            onDrawSegment: (seg) => {
                if (role !== 'teacher') setExternalDrawSeg(seg);
            },
            onDrawPreview: (seg) => {
                if (role !== 'teacher') setExternalDrawPreview(seg);
            },
            onDrawCursor: (x, y) => {
                if (role !== 'teacher') setExternalCursor(x < 0 ? null : { x, y });
            },
            onDrawClear: () => {
                if (role !== 'teacher') setDrawClearSignal(prev => prev + 1);
            },
            onDrawSnapshot: (dataUrl) => {
                if (role !== 'teacher') setExternalDrawSnapshot(dataUrl);
            },
            onQuizStudentStarted: (data) => {
                if (role === 'teacher') {
                    // Seed entry immediately so tile appears before any progress update arrives
                    setQuizStudentProgress(prev => {
                        const n = new Map(prev);
                        // Only seed — don't overwrite if progress already exists for this socket
                        if (!n.has(data.socketId)) {
                            n.set(data.socketId, { name: data.name, currentIdx: 0, totalQ: 0, answers: {} });
                        }
                        return n;
                    });
                }
            },
            onQuizStudentInactive: (socketId) => {
                setQuizStudentProgress(prev => { const n = new Map(prev); n.delete(socketId); return n; });
                setQuizFocusedStudent(prev => (prev === socketId ? null : prev));
            },
            onQuizProgressUpdate: (data) => {
                if (role === 'teacher') {
                    setQuizStudentProgress(prev => {
                        const n = new Map(prev);
                        const existing = prev.get(data.socketId);
                        // Prefer existing name (from student-started); fall back to server-relayed name
                        n.set(data.socketId, {
                            name: existing?.name || (data as typeof data & { name?: string }).name || data.socketId,
                            currentIdx: data.currentIdx,
                            totalQ: data.totalQ,
                            answers: data.answers,
                        });
                        return n;
                    });
                }
            },
        });

    // Keep refs in sync
    socketIdRef.current = socketId;
    emittersRef.current = { emitCourseToggle, emitCourseNavigate, emitCourseSidebar };

    // Course navigation — shared by teacher (broadcasts) and student (local only)
    const handleCourseNav = useCallback((courseIdx: number, lessonIdx: number) => {
        setCourseCourseIdx(courseIdx);
        setCourseLessonIdx(lessonIdx);
        if (role === 'teacher') emitCourseNavigate(courseIdx, lessonIdx);
    }, [role, emitCourseNavigate]);

    const { remoteStreams, handleSignal: handleWebRTCSignal, initiatePeerConnections, addNewPeer, removePeer } =
        useWebRTC({ localStream, onSendSignal: sendSignal });

    // Init peers for existing participants — wait for BOTH socketId AND localStream
    // so that peer offers include our video/audio tracks from the start.
    useEffect(() => {
        if (socketId && existingParticipants.length > 0 && localStream) {
            existingParticipants.forEach((p) =>
                setParticipants((prev) => new Map(prev).set(p.socketId, { ...p, isMuted: false, isCamOff: false }))
            );
            initiatePeerConnections(existingParticipants);
        }
    }, [socketId, existingParticipants.length, localStream]);

    // Sync initial spotlight once we know our socketId and the server's current spotlight
    useEffect(() => {
        if (!socketId || currentSpotlight === null) return;
        setSpotlightId(currentSpotlight === socketId ? '__local__' : currentSpotlight);
    }, [socketId, currentSpotlight]);

    // Fetch session data to get attached quiz/course IDs
    useEffect(() => {
        if (!roomCode) return;
        fetch(`${SERVER_URL}/api/session-by-code/${roomCode.toUpperCase()}`)
            .then(r => r.ok ? r.json() : null)
            .then((data: any) => {
                if (data) {
                    setSessionQuizIds(Array.isArray(data.session_quiz_ids) ? data.session_quiz_ids : []);
                    setSessionCourseIds(Array.isArray(data.session_course_ids) ? data.session_course_ids : []);
                }
            }).catch(() => {});
    }, [roomCode]);

    // Fetch quizzes for this session when teacher toggles quiz ON
    useEffect(() => {
        if (!quizToggleOn || role !== 'teacher') return;
        if (sessionQuizIds.length === 0) { setRoomQuizzes([]); setLoadingRoomQuizzes(false); return; }
        setLoadingRoomQuizzes(true);
        Promise.all(
            sessionQuizIds.map((id: string) =>
                fetch(`${SERVER_URL}/api/quizzes/${id}?role=teacher`)
                    .then(r => r.ok ? r.json() : null)
            )
        ).then(results => {
            setRoomQuizzes(
                (results.filter(Boolean) as any[]).map(q => ({
                    id: q.id, title: q.title,
                    question_count: Array.isArray(q.questions) ? q.questions.length : q.question_count,
                }))
            );
        }).catch(() => setRoomQuizzes([]))
          .finally(() => setLoadingRoomQuizzes(false));
    }, [quizToggleOn, role, sessionQuizIds]);

    useEffect(() => {
        if (!roomQuiz) {
            setRoomQuizSubmitted(false);
        } else {
            // New quiz arrived — student needs to click "Start Quiz" first
            setStudentQuizStarted(false);
            setRoomQuizSubmitted(false);
        }
    }, [roomQuiz]);
    useEffect(() => {
        if (roomQuizRevealed) setRevealKey(k => k + 1);
        setDismissedRevealed(false);
    }, [roomQuizRevealed]);

    // ── Quiz monitor: auto-show when first student starts ─────────────────
    useEffect(() => {
        if (role === 'teacher' && quizStudentProgress.size > 0) setQuizMonitorMode(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [quizStudentProgress.size, role]);

    // ── Quiz monitor: clear on quiz end ───────────────────────────────────
    useEffect(() => {
        if (!roomQuiz) {
            setQuizStudentProgress(new Map());
            setQuizFocusedStudent(null);
            setQuizMonitorMode(false);
        }
    }, [roomQuiz]);

    // ── Student: notify teacher when quiz starts (teacher monitors via WebRTC video) ────
    useEffect(() => {
        if (role === 'teacher' || !studentQuizStarted || !roomQuiz) return;
        emitQuizStarted();
        return () => { emitQuizStopped(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [studentQuizStarted, roomQuiz, role]);

    // Student finished quiz — notify teacher
    useEffect(() => {
        if (roomQuizSubmitted && role !== 'teacher') emitQuizStopped();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [roomQuizSubmitted]);

    // ── Escape: collapse quiz student focus ────────────────────────────────
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setQuizFocusedStudent(null); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // Student: always follow teacher navigation (always locked)
    useEffect(() => {
        if (role !== 'teacher' && externalCourseNav) {
            setCourseLessonIdx(externalCourseNav.lessonIdx);
            setCourseCourseIdx(externalCourseNav.courseIdx);
        }
    }, [externalCourseNav, role]);

    // Reset course nav indices and sharing state when course panel closes
    useEffect(() => {
        if (!courseToggleOn) {
            setCourseLessonIdx(0);
            setCourseCourseIdx(0);
            setCourseSharedWithStudents(false);
            setCourseSidebarOpen(false);
            setExternalCourseScroll(null);
            // Clear draw state
            setExternalDrawSeg(null);
            setExternalDrawPreview(null);
            setExternalCursor(null);
            setDrawClearSignal(0);
            setSnapshotRequest(0);
            setExternalDrawSnapshot(null);
        }
    }, [courseToggleOn]);

    // Dynamically resize mobile chat container when keyboard opens/closes
    useEffect(() => {
        if (!isChatOpen) return;
        const el = mobileChatRef.current;
        if (!el) return;

        const updateHeight = () => {
            const vv = window.visualViewport;
            if (vv) {
                el.style.height = `${vv.height}px`;
                el.style.top = `${vv.offsetTop}px`;
            }
        };

        updateHeight();
        window.visualViewport?.addEventListener('resize', updateHeight);
        window.visualViewport?.addEventListener('scroll', updateHeight);

        return () => {
            window.visualViewport?.removeEventListener('resize', updateHeight);
            window.visualViewport?.removeEventListener('scroll', updateHeight);
        };
    }, [isChatOpen]);

    // Controls
    const toggleMic = () => {
        if (!localStream) return;
        const track = localStream.getAudioTracks()[0];
        if (track) { track.enabled = !track.enabled; setMicOn(track.enabled); }
    };
    const toggleCam = async () => {
        if (!localStream) return;
        const track = localStream.getVideoTracks()[0];
        if (track) {
            track.enabled = !track.enabled;
            setCamOn(track.enabled);
            broadcastSelfCam(track.enabled);
        } else if (!camOn) {
            // No video track — try to acquire camera now (initial getUserMedia may have failed for video)
            try {
                let videoConstraint: MediaTrackConstraints | boolean = true;
                if (activeVideoDeviceId) {
                    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
                    if (isMobile) {
                        const devices = await navigator.mediaDevices.enumerateDevices();
                        const selected = devices.find(d => d.deviceId === activeVideoDeviceId);
                        const label = (selected?.label || '').toLowerCase();
                        if (label.includes('back') || label.includes('rear') || label.includes('environment')) {
                            videoConstraint = { facingMode: { exact: 'environment' } };
                        } else if (label.includes('front') || label.includes('user') || label.includes('selfie')) {
                            videoConstraint = { facingMode: { exact: 'user' } };
                        } else {
                            videoConstraint = { deviceId: { exact: activeVideoDeviceId } };
                        }
                    } else {
                        videoConstraint = { deviceId: { exact: activeVideoDeviceId } };
                    }
                }
                const vs = await navigator.mediaDevices.getUserMedia({ video: videoConstraint });
                const vt = vs.getVideoTracks()[0];
                // Build a new stream so the useWebRTC effect fires and adds the track to all peers
                const newStream = new MediaStream([...localStream.getTracks(), vt]);
                setLocalStream(newStream);
                setCamOn(true);
                broadcastSelfCam(true);
            } catch { /* camera permission denied */ }
        }
    };

    const handleDeviceApply = (videoId: string | null, audioId: string | null) => {
        setActiveVideoDeviceId(videoId);
        setActiveAudioDeviceId(audioId);
    };

    const handleMuteParticipant = useCallback((targetSocketId: string, muted: boolean) => {
        muteParticipant(targetSocketId, muted);
        setParticipants((prev) => {
            const next = new Map(prev);
            const p = next.get(targetSocketId);
            if (p) next.set(targetSocketId, { ...p, isMuted: muted });
            return next;
        });
    }, [muteParticipant]);

    const handleCamParticipant = useCallback((targetSocketId: string, camOn: boolean) => {
        camParticipant(targetSocketId, camOn);
        setParticipants((prev) => {
            const next = new Map(prev);
            const p = next.get(targetSocketId);
            if (p) next.set(targetSocketId, { ...p, isCamOff: !camOn });
            return next;
        });
    }, [camParticipant]);

    const handleLeaveIntentional = () => {
        setShowLeaveConfirm(true);
    };

    const confirmLeave = () => {
        setShowLeaveConfirm(false);
        clearSession();
        onLeave();
    };

    const handleEndRoom = () => {
        setShowEndConfirm(true);
        if (role === 'teacher') {
            fetch(`${SERVER_URL}/api/session-by-code/${roomCode.toUpperCase()}`)
                .then((r) => (r.ok ? r.json() : null))
                .then((data) => setHasScheduledSession(!!data))
                .catch(() => setHasScheduledSession(false));
        } else {
            setHasScheduledSession(false);
        }
    };

    const confirmEndRoom = () => {
        setShowEndConfirm(false);
        setHasScheduledSession(null);
        endRoom();
        // Teacher leaves after socket delivers end-room event; server handles student countdown
        setTimeout(() => { clearSession(); onLeave(); }, 500);
    };

    const handleRescheduleClick = () => {
        setShowEndConfirm(false);
        setShowRescheduleModal(true);
    };

    const handleRescheduleSaved = () => {
        setShowRescheduleModal(false);
        setHasScheduledSession(null);
        endRoom();
        // Teacher leaves after socket delivers end-room event; server handles student countdown
        setTimeout(() => { clearSession(); onLeave(); }, 500);
    };

    // Build participant list for sidebar
    const allParticipants: ParticipantState[] = [
        { socketId: '__local__', name, role, isMuted: !micOn, isCamOff: !camOn },
        ...Array.from(participants.values()),
    ];

    // Participants shown in the sidebar / thumbnail strip — exclude whoever is spotlighted.
    // spotlightId is always '__local__' for ourselves or a real socketId for a remote peer,
    // so both cases are handled by the single comparison below.
    const sidebarParticipants = allParticipants.filter((p) => p.socketId !== spotlightId);

    // Spotlight stream: '__local__' → own camera; anything else → remote stream
    const spotlightStream = spotlightId === '__local__'
        ? localStream
        : (remoteStreams.get(spotlightId) ?? null);

    // Name label for the spotlight area
    const spotlightParticipant = allParticipants.find((p) => p.socketId === spotlightId);

    // Teacher sends the REAL socket ID to the server (maps '__local__' → own socketId)
    const handleSpotlightClick = useCallback((targetSocketId: string) => {
        const realId = targetSocketId === '__local__' ? socketId : targetSocketId;
        changeSpotlight(realId);
    }, [socketId, changeSpotlight]);


    if (roomEnded) return (
        <div className="room-ended">
            <div className="room-ended-card pop">
                <div className="ended-icon">🎓</div>
                <h2>Class Ended</h2>
                <p>The session has ended. Redirecting…</p>
            </div>
        </div>
    );

    if (socketJoinError) return (
        <div className="room-ended">
            <div className="room-ended-card enter-up">
                <div className="ended-icon">⚠️</div>
                <h2>Cannot Join Room</h2>
                <p>{socketJoinError}</p>
                <button className="btn btn-outline" onClick={handleLeaveIntentional}>Go Back</button>
            </div>
        </div>
    );

    return (
        <div className="room-container">
            {/* Teacher disconnected countdown */}
            {teacherGraceCountdown !== null && (
                <div className="grace-banner">
                    ⚠️ Teacher not present — class ends in <strong>{teacherGraceCountdown}s</strong> if they don't join
                </div>
            )}

            {/* Device Picker */}
            {showDevicePicker && (
                <DevicePicker
                    currentVideoId={activeVideoDeviceId || undefined}
                    currentAudioId={activeAudioDeviceId || undefined}
                    onApply={handleDeviceApply}
                    onClose={() => setShowDevicePicker(false)}
                />
            )}

            {/* Mobile chat — full-screen like WhatsApp */}
            {isChatOpen && (
                <div className="mobile-chat-fullscreen" ref={mobileChatRef}>
                    <div className="mobile-chat-topbar">
                        <button className="mobile-chat-back" onClick={() => setIsChatOpen(false)}>
                            ← Back
                        </button>
                        <span className="mobile-chat-topbar-title">Chat</span>
                        {messages.length > 0 && (
                            <span className="mobile-chat-topbar-count">{messages.length}</span>
                        )}
                    </div>
                    <ChatPanel messages={messages} mySocketId={socketId} onSend={sendMessage} hideHeader />
                </div>
            )}

            {/* Leave room confirmation modal */}
            {showLeaveConfirm && (
                <div
                    style={{
                        position: 'fixed', inset: 0, zIndex: 999999,
                        background: 'rgba(0,0,0,0.8)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: 20,
                    }}
                    onClick={() => setShowLeaveConfirm(false)}
                >
                    <div
                        style={{
                            background: 'var(--surface-2, #18181f)',
                            borderRadius: 20,
                            width: '100%',
                            maxWidth: 400,
                            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                            border: '1px solid rgba(99,102,241,0.2)',
                            margin: 'auto',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ padding: '24px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>Leave the room?</h2>
                        </div>
                        <p style={{ margin: 0, padding: '20px 24px', fontSize: 15, color: 'var(--text-muted, #94a3b8)', lineHeight: 1.5 }}>
                            You can rejoin if the session is still active.
                        </p>
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', padding: '16px 24px 24px' }}>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowLeaveConfirm(false)}>Cancel</button>
                            <button type="button" className="btn btn-primary" onClick={confirmLeave}>Leave</button>
                        </div>
                    </div>
                </div>
            )}

            {/* End class confirmation modal — Reschedule or End Class */}
            {showEndConfirm && (
                <div
                    style={{
                        position: 'fixed', inset: 0, zIndex: 999999,
                        background: 'rgba(0,0,0,0.8)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: 20,
                    }}
                    onClick={() => { setShowEndConfirm(false); setHasScheduledSession(null); }}
                >
                    <div
                        style={{
                            background: 'var(--surface-2, #18181f)',
                            borderRadius: 20,
                            width: '100%',
                            maxWidth: 400,
                            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                            border: '1px solid rgba(239,68,68,0.3)',
                            margin: 'auto',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ padding: '24px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>Reschedule the class?</h2>
                        </div>
                        <p style={{ margin: 0, padding: '20px 24px', fontSize: 15, color: 'var(--text-muted, #94a3b8)', lineHeight: 1.5 }}>
                            {hasScheduledSession === true
                                ? 'Reschedule this class to a new date and time. The class will end automatically after you save.'
                                : hasScheduledSession === false
                                    ? 'End the class? A countdown will start before the session ends.'
                                    : 'Loading…'}
                        </p>
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', padding: '16px 24px 24px', flexWrap: 'wrap' }}>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setShowEndConfirm(false); setHasScheduledSession(null); }}>Cancel</button>
                            {hasScheduledSession === true ? (
                                <button type="button" className="btn btn-primary" onClick={handleRescheduleClick}>
                                    Reschedule
                                </button>
                            ) : hasScheduledSession === false ? (
                                <button type="button" className="btn btn-primary" style={{ background: 'linear-gradient(135deg, #dc2626, #b91c1c)' }} onClick={confirmEndRoom}>
                                    End class
                                </button>
                            ) : null}
                        </div>
                    </div>
                </div>
            )}

            {/* Reschedule session modal (from End Class flow) */}
            {showRescheduleModal && role === 'teacher' && user?.id && (
                <RescheduleSessionModal
                    roomCode={roomCode}
                    userId={user.id}
                    onSaved={handleRescheduleSaved}
                    onCancel={() => setShowRescheduleModal(false)}
                />
            )}

            {/* Quiz reveal overlays removed — now inline in spotlight area */}

            {/* ── HEADER ─────────────────────────────────────────────────── */}
            <div className="room-header">
                <div className="room-header-left">
                    <span className="room-logo">ClassMeet</span>
                    <span className="room-divider">|</span>
                    <span className="room-name" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(roomName || roomCode, { ADD_ATTR: ['style'] }) }} />
                    <span className={`connection-dot ${connected ? 'dot-connected' : 'dot-disconnected'}`} />
                </div>
                <div className="room-header-right">
                    <span className="room-header-greeting">
                        {(() => { const h = new Date().getHours(); return h < 12 ? '🌤️ Good morning' : h < 18 ? '☀️ Good afternoon' : '🌙 Good evening'; })()}, <strong>{name.split(' ')[0]}</strong>!
                    </span>
                </div>
            </div>

            {/* ── MAIN BODY ──────────────────────────────────────────────── */}
            <div className="room-body">

                {/* LEFT: Participants sidebar (desktop only) */}
                <div className="room-participants-sidebar desktop-only">
                    <div className="rps-header">
                        <span>Participants</span>
                        <span className="pp-count">{allParticipants.length}</span>
                    </div>
                    <div className="rps-list">
                        {sidebarParticipants.map((p) => {
                            const isLocal = p.socketId === '__local__';
                            const stream = isLocal ? localStream : (remoteStreams.get(p.socketId) || null);
                            const isSpotlit = spotlightId === p.socketId;
                            const isTeacher = role === 'teacher';
                            return (
                                <div
                                    key={p.socketId}
                                    className={`rps-tile ${isSpotlit ? 'rps-tile-spotlit' : ''} ${isTeacher && !isSpotlit ? 'rps-tile-clickable' : ''}`}
                                    onClick={isTeacher ? () => handleSpotlightClick(p.socketId) : undefined}
                                    title={isTeacher ? `Spotlight ${p.name}` : undefined}
                                >
                                    <VideoTileInline stream={stream} name={p.name} muted={isLocal} isCamOff={p.isCamOff} />
                                    <div className="rps-overlay">
                                        <span className="rps-name">{p.name}</span>
                                        <div className="rps-badges">
                                            {p.isMuted && <span className="rps-badge-muted">🔇</span>}
                                            {p.isCamOff && <span className="rps-badge-muted">🚫</span>}
                                            {isSpotlit && <span className="rps-badge-spotlight">✨</span>}
                                        </div>
                                    </div>
                                    {isTeacher && !isLocal && (
                                        <>
                                            <button
                                                className={`rps-mute-btn ${p.isMuted ? 'rps-mute-btn-on' : ''}`}
                                                onClick={(e) => { e.stopPropagation(); handleMuteParticipant(p.socketId, !p.isMuted); }}
                                                title={p.isMuted ? 'Unmute' : 'Mute'}
                                                style={{ top: 4 }}
                                            >
                                                {p.isMuted ? '🔊' : '🔇'}
                                            </button>
                                            <button
                                                className={`rps-mute-btn ${p.isCamOff ? 'rps-mute-btn-on' : ''}`}
                                                onClick={(e) => { e.stopPropagation(); handleCamParticipant(p.socketId, !!p.isCamOff); }}
                                                title={p.isCamOff ? 'Turn camera on' : 'Turn camera off'}
                                                style={{ top: 30 }}
                                            >
                                                {p.isCamOff ? '📷' : '🚫'}
                                            </button>
                                        </>
                                    )}
                                    <span className={`rps-role-tag rps-role-${p.role}`}>{p.role}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* CENTER: Spotlight video */}
                <div className="room-center">

                    {/* Mobile: horizontal thumbnail strip */}
                    <div className="mobile-thumbnail-strip">
                        {sidebarParticipants.map((p) => (
                            <div
                                key={p.socketId}
                                className={`mobile-thumb ${spotlightId === p.socketId ? 'mobile-thumb-active' : ''}`}
                                onClick={role === 'teacher' ? () => handleSpotlightClick(p.socketId) : undefined}
                                style={{ cursor: role === 'teacher' ? 'pointer' : 'default' }}
                            >
                                <VideoTileInline
                                    stream={p.socketId === '__local__' ? localStream : (remoteStreams.get(p.socketId) || null)}
                                    name={p.name}
                                    muted={p.socketId === '__local__'}
                                    isCamOff={p.isCamOff}
                                />
                                <span className="mobile-thumb-name">{p.name.split(' ')[0]}</span>
                            </div>
                        ))}
                    </div>

                    {/* Spotlight or Quiz/Course (when toggle ON) */}
                    <div className="spotlight-area">
                        {courseToggleOn && role === 'teacher' ? (
                            <RoomCoursePanel
                                courseIds={sessionCourseIds}
                                serverUrl={SERVER_URL}
                                role={role}
                                activeLessonIdx={courseLessonIdx}
                                activeCourseIdx={courseCourseIdx}
                                onNav={handleCourseNav}
                                onCoursesLoaded={setCourseTotalLessons}
                                onScrollSync={emitCourseScroll}
                                sidebarOpen={courseSidebarOpen}
                                onSidebarToggle={() => {
                                    const next = !courseSidebarOpen;
                                    setCourseSidebarOpen(next);
                                    emitCourseSidebar(next);
                                }}
                                onDrawSegment={emitDrawSegment}
                                onDrawPreview={emitDrawPreview}
                                onDrawCursor={emitDrawCursor}
                                onDrawClear={() => { emitDrawClear(); setDrawClearSignal(prev => prev + 1); }}
                                snapshotRequest={snapshotRequest}
                                onSnapshot={emitDrawSnapshot}
                            />
                        ) : courseToggleOn && role !== 'teacher' ? (
                            <RoomCoursePanel
                                courseIds={sessionCourseIds}
                                serverUrl={SERVER_URL}
                                role={role}
                                activeLessonIdx={courseLessonIdx}
                                activeCourseIdx={courseCourseIdx}
                                onNav={handleCourseNav}
                                onCoursesLoaded={setCourseTotalLessons}
                                externalScroll={externalCourseScroll}
                                sidebarOpen={courseSidebarOpen}
                                externalDrawSeg={externalDrawSeg}
                                externalDrawPreview={externalDrawPreview}
                                externalCursor={externalCursor}
                                drawClearSignal={drawClearSignal}
                                snapshotDataUrl={externalDrawSnapshot}
                            />
                        ) : quizToggleOn && role === 'teacher' ? (
                            quizMonitorMode && quizStudentProgress.size > 0 ? (
                                <QuizStudentMonitor
                                    progress={quizStudentProgress}
                                    quiz={(roomQuiz?.quiz as { questions: unknown[] } | null) ?? null}
                                    focusedId={quizFocusedStudent}
                                    onFocus={setQuizFocusedStudent}
                                    onBack={() => setQuizMonitorMode(false)}
                                />
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>
                                    {quizStudentProgress.size > 0 && (
                                        <button
                                            onClick={() => setQuizMonitorMode(true)}
                                            style={{ padding: '7px 14px', background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: '10px 10px 0 0', color: '#a5b4fc', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 5px #22c55e', flexShrink: 0, display: 'inline-block' }} />
                                            {quizStudentProgress.size} student{quizStudentProgress.size !== 1 ? 's' : ''} taking quiz — Monitor Live →
                                        </button>
                                    )}
                                    <div style={{ flex: 1, minHeight: 0 }}>
                                        <RoomQuizHost
                                            roomId={roomId}
                                            quizzes={roomQuizzes}
                                            loadingQuizzes={loadingRoomQuizzes}
                                            activeQuiz={roomQuiz}
                                            submissions={roomQuizSubmissions}
                                            revealedStudentIds={revealedStudentIds}
                                            onStartQuiz={startRoomQuiz}
                                            onStopQuiz={stopRoomQuiz}
                                            onClose={() => setQuizToggleOn(false)}
                                            onReveal={revealRoomQuiz}
                                        />
                                    </div>
                                </div>
                            )
                        ) : role !== 'teacher' && roomQuizRevealed && !dismissedRevealed ? (
                            <InlineResultCard
                                key={revealKey}
                                score={(roomQuizRevealed.data as { score?: number | null })?.score ?? null}
                                comment={(roomQuizRevealed.data as { comment?: string })?.comment}
                                studentName={(roomQuizRevealed.data as { studentName?: string })?.studentName}
                                isClassReveal={roomQuizRevealed.type === 'class-reveal'}
                                currentUserId={user?.id || (socketId ? `guest_${socketId}` : undefined)}
                                revealedStudentId={(roomQuizRevealed.data as { studentId?: string })?.studentId}
                                onClose={() => setDismissedRevealed(true)}
                            />
                        ) : role !== 'teacher' && roomQuiz ? (
                            roomQuizSubmitted ? (
                                <PostSubmitWaiting studentCount={allParticipants.filter(p => p.role !== 'teacher').length} />
                            ) : !studentQuizStarted ? (
                                // Student sees "Start Quiz" prompt before quiz begins
                                <div style={{
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                    height: '100%', gap: 20, padding: 32, background: 'var(--surface-2)', borderRadius: 12,
                                }}>
                                    <div style={{ fontSize: 48 }}>📝</div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Quiz Ready</div>
                                        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                                            {((roomQuiz.quiz as any)?.title) ? (
                                                <span dangerouslySetInnerHTML={{ __html: (roomQuiz.quiz as any).title }} />
                                            ) : 'Quiz'}
                                        </div>
                                        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                                            {((roomQuiz.quiz as any)?.questions?.length ?? 0)} question{((roomQuiz.quiz as any)?.questions?.length ?? 0) !== 1 ? 's' : ''}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setStudentQuizStarted(true)}
                                        style={{
                                            padding: '12px 32px', borderRadius: 12, border: 'none', cursor: 'pointer',
                                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                            color: '#fff', fontWeight: 700, fontSize: 15,
                                            boxShadow: '0 4px 16px rgba(99,102,241,0.4)',
                                        }}
                                    >
                                        ▶ Start Quiz
                                    </button>
                                </div>
                            ) : (
                                <RoomQuizParticipant
                                    quiz={roomQuiz.quiz as { id: string; title: string; questions: unknown[] }}
                                    userId={user?.id || `guest_${socketId}`}
                                    userName={name}
                                    onSubmit={(subId, score) => {
                                        submitRoomQuiz(subId, roomQuiz.quizId, user?.id || `guest_${socketId}`, name, score);
                                        setRoomQuizSubmitted(true);
                                    }}
                                    onAlert={(title, msg) => alert(`${title}: ${msg}`)}
                                    onProgressUpdate={emitQuizProgress}
                                />
                            )
                        ) : (
                            <SpotlightVideo
                                stream={spotlightStream}
                                name={spotlightParticipant?.name || name}
                                isLocal={spotlightId === '__local__'}
                                isCamOff={spotlightParticipant?.isCamOff}
                            />
                        )}
                    </div>


                    {/* Controls */}
                    <div className="room-controls">
                        <button id="btn-toggle-mic" className={`control-btn ${micOn ? '' : 'control-btn-off'}`} onClick={toggleMic}>
                            {micOn ? '🎙️' : '🔇'}
                            <span className="control-label">{micOn ? 'Mute' : 'Unmute'}</span>
                        </button>

                        <button id="btn-toggle-cam" className={`control-btn ${camOn ? '' : 'control-btn-off'}`} onClick={toggleCam}>
                            {camOn ? '📷' : '🚫'}
                            <span className="control-label">{camOn ? 'Camera' : 'No Cam'}</span>
                        </button>

                        <button id="btn-devices" className="control-btn" onClick={() => setShowDevicePicker(true)}>
                            ⚙️ <span className="control-label">Devices</span>
                        </button>

                        {/* Quiz toggle switch (teacher only) */}
                        {role === 'teacher' && (
                            <CtrlToggle
                                label="Quiz"
                                on={quizToggleOn}
                                onChange={() => {
                                    const next = !quizToggleOn;
                                    if (quizToggleOn && roomQuiz) stopRoomQuiz();
                                    setQuizToggleOn(next);
                                    if (next) { setCourseToggleOn(false); emitCourseToggle(false, []); setCourseSharedWithStudents(false); setRoomQuizSubmitted(false); }
                                }}
                            />
                        )}

                        {/* Course toggle switch (teacher only, when session has courses) */}
                        {role === 'teacher' && sessionCourseIds.length > 0 && (
                            <CtrlToggle
                                label="Course"
                                on={courseToggleOn}
                                onChange={() => {
                                    const next = !courseToggleOn;
                                    setCourseToggleOn(next);
                                    if (!next) { emitCourseToggle(false, []); setCourseSharedWithStudents(false); }
                                    if (next) { if (quizToggleOn && roomQuiz) stopRoomQuiz(); setQuizToggleOn(false); }
                                }}
                            />
                        )}

                        {/* Share toggle — shown when course panel is open */}
                        {role === 'teacher' && courseToggleOn && (
                            <CtrlToggle
                                label="Share"
                                on={courseSharedWithStudents}
                                color="#22c55e"
                                onChange={() => {
                                    if (courseSharedWithStudents) {
                                        emitCourseToggle(false, []);
                                        setCourseSharedWithStudents(false);
                                    } else {
                                        emitCourseToggle(true, sessionCourseIds);
                                        setCourseSharedWithStudents(true);
                                    }
                                }}
                            />
                        )}

                        {/* Mobile chat toggle */}
                        <button id="btn-mobile-chat" className="control-btn mobile-only" onClick={() => setIsChatOpen(true)}>
                            💬 <span className="control-label">Chat</span>
                        </button>

                        {role === 'teacher' && (
                            <button id="btn-end-room" className="control-btn control-btn-danger" onClick={handleEndRoom}>
                                📴 <span className="control-label">End Class</span>
                            </button>
                        )}

                        <button id="btn-leave-room" className="control-btn control-btn-leave" onClick={handleLeaveIntentional}>
                            🚪 <span className="control-label">Leave</span>
                        </button>
                    </div>
                </div>

                {/* RIGHT: Chat sidebar (desktop only) */}
                <div className="room-chat-sidebar desktop-only">
                    <ChatPanel messages={messages} mySocketId={socketId} onSend={sendMessage} />
                </div>

            </div>
        </div>
    );
}

// ── Inline video components ───────────────────────────────────────────────

function SpotlightVideo({ stream, name, isLocal, isCamOff }: { stream: MediaStream | null; name: string; isLocal: boolean; isCamOff?: boolean }) {
    const ref = useRef<HTMLVideoElement>(null);
    useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
    const showAvatar = !stream || isCamOff;
    return (
        <div className="spotlight-video-wrap">
            <video ref={ref} autoPlay playsInline muted={isLocal} className="spotlight-video"
                style={showAvatar ? { display: 'none' } : undefined} />
            {showAvatar && (
                <div className="spotlight-placeholder">
                    <div className="spotlight-avatar">{name.charAt(0).toUpperCase()}</div>
                </div>
            )}
            <div className="spotlight-label">{name}</div>
        </div>
    );
}

function CtrlToggle({ label, on, onChange }: { label: string; on: boolean; onChange: () => void; color?: string }) {
    const trackColor = on ? '#22c55e' : 'rgba(255,255,255,0.1)';
    const borderColor = on ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.12)';
    return (
        <button
            onClick={onChange}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: '4px clamp(2px, 0.8vw, 8px)', flex: '1 1 0', minWidth: 0, boxSizing: 'border-box' }}
        >
            <span style={{ fontSize: 'clamp(7px, 1.5vw, 9px)', fontWeight: 700, letterSpacing: '0.06em', color: on ? '#e2e8f0' : 'var(--text-muted)', textTransform: 'uppercase', lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{label}</span>
            <div style={{ width: 'clamp(28px, 5vw, 40px)', height: 'clamp(16px, 3vw, 22px)', borderRadius: 11, background: trackColor, border: `1.5px solid ${borderColor}`, position: 'relative', transition: 'background 0.2s, border-color 0.2s', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: 2, left: on ? 'calc(100% - 15px)' : 3, width: 'clamp(9px, 2vw, 13px)', height: 'clamp(9px, 2vw, 13px)', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transition: 'left 0.18s' }} />
            </div>
        </button>
    );
}

function VideoTileInline({ stream, name, muted, isCamOff }: { stream: MediaStream | null; name: string; muted?: boolean; isCamOff?: boolean }) {
    const ref = useRef<HTMLVideoElement>(null);
    useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
    const showAvatar = !stream || isCamOff;
    return (
        <div className="thumb-video-wrap">
            <video ref={ref} autoPlay playsInline muted={muted} className="thumb-video"
                style={showAvatar ? { display: 'none' } : undefined} />
            {showAvatar && <div className="thumb-avatar">{name.charAt(0).toUpperCase()}</div>}
        </div>
    );
}
// ── Quiz Student Monitor (teacher sees live quiz state — questions & answers) ─

type StudentProgressEntry = {
    name: string;
    currentIdx: number;
    totalQ: number;
    answers: Record<string, { questionId: string; answerText?: string; selectedOptions?: string[] }>;
};

// Strip HTML tags from rich question text for plain-text preview
function stripHtmlTags(html: string): string {
    return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

function quizAnswerPreview(entry: StudentProgressEntry, questions: MonitorQuestion[]): string {
    const q = questions[entry.currentIdx];
    if (!q) return '';
    const a = entry.answers[q.id];
    if (!a) {
        if (q.type === 'recording') return '🎙️ Recording…';
        if (q.type === 'upload' || q.type === 'video') return '📎 Uploading…';
        return '';
    }
    if (a.selectedOptions?.length) return a.selectedOptions.join(', ');
    if (a.answerText) return stripHtmlTags(a.answerText).slice(0, 80);
    if (q.type === 'recording') return '🎙️ Recorded ✓';
    if (q.type === 'upload' || q.type === 'video') return '📎 File uploaded ✓';
    return '';
}

type MonitorQuestion = { id: string; question_text?: string; type?: string; options?: string[] };

function QuizProgressTile({ entry, questions, onClick }: {
    entry: StudentProgressEntry;
    questions: MonitorQuestion[];
    onClick: () => void;
}) {
    const pct = entry.totalQ > 0 ? Math.round(((entry.currentIdx + 1) / entry.totalQ) * 100) : 0;
    const answeredCount = Object.keys(entry.answers).length;
    const currentQ = questions[entry.currentIdx];
    const promptText = currentQ?.question_text ? stripHtmlTags(currentQ.question_text) : `Question ${entry.currentIdx + 1}`;
    const answer = quizAnswerPreview(entry, questions);

    return (
        <button
            onClick={onClick}
            style={{ position: 'relative', background: 'var(--surface)', borderRadius: 10, border: '2px solid var(--border)', padding: '12px 14px', cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 8, transition: 'border-color 0.15s, box-shadow 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.15)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
        >
            {/* Name + live dot + progress counter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 5px #22c55e', flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{entry.name}</span>
                {entry.totalQ > 0 && (
                    <span style={{ fontSize: 11, color: '#6366f1', fontWeight: 600, flexShrink: 0 }}>{answeredCount}/{entry.totalQ} answered</span>
                )}
            </div>
            {/* Progress bar */}
            {entry.totalQ > 0 && (
                <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, #6366f1, #8b5cf6)', borderRadius: 2, transition: 'width 0.4s' }} />
                </div>
            )}
            {/* Current question text */}
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {typeof promptText === 'string' ? promptText : `Question ${entry.currentIdx + 1}`}
            </div>
            {/* Student's current answer */}
            {answer ? (
                <div style={{ fontSize: 12, color: answer.startsWith('🎙️') || answer.startsWith('📎') ? '#f59e0b' : '#a5b4fc', background: answer.startsWith('🎙️') || answer.startsWith('📎') ? 'rgba(245,158,11,0.1)' : 'rgba(99,102,241,0.1)', borderRadius: 6, padding: '4px 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {answer}
                </div>
            ) : currentQ?.type === 'recording' ? (
                <div style={{ fontSize: 12, color: '#f59e0b', background: 'rgba(245,158,11,0.08)', borderRadius: 6, padding: '4px 8px' }}>🎙️ Recording in progress…</div>
            ) : currentQ?.type === 'upload' || currentQ?.type === 'video' ? (
                <div style={{ fontSize: 12, color: '#f59e0b', background: 'rgba(245,158,11,0.08)', borderRadius: 6, padding: '4px 8px' }}>📎 File upload in progress…</div>
            ) : (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>No answer yet…</div>
            )}
        </button>
    );
}

function QuizProgressFull({ entry, questions, onClose }: {
    entry: StudentProgressEntry;
    questions: MonitorQuestion[];
    onClose: () => void;
}) {
    const answeredCount = Object.keys(entry.answers).length;
    const pct = entry.totalQ > 0 ? Math.round((answeredCount / entry.totalQ) * 100) : 0;

    return (
        <div style={{ width: '100%', height: '100%', background: 'var(--surface-2)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <button onClick={onClose} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>← Back</button>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 5px #22c55e' }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{entry.name}</span>
                {entry.totalQ > 0 && <span style={{ fontSize: 12, color: '#6366f1', fontWeight: 600 }}>{answeredCount} / {entry.totalQ} answered</span>}
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>Esc to exit</span>
                <button onClick={onClose} style={{ width: 26, height: 26, borderRadius: 6, border: 'none', background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
            {/* Progress bar */}
            {entry.totalQ > 0 && (
                <div style={{ height: 3, background: 'var(--border)', flexShrink: 0 }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#6366f1,#8b5cf6)', transition: 'width 0.4s' }} />
                </div>
            )}
            {/* All questions — one card each, live-updating */}
            <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {questions.slice(0, Math.max(entry.totalQ, questions.length)).map((q, i) => {
                    const isCurrent = i === entry.currentIdx;
                    const a = entry.answers[q.id];
                    const answered = !!a;
                    const qText = q.question_text ? stripHtmlTags(q.question_text) : `Question ${i + 1}`;
                    let answerDisplay: string | null = null;
                    if (a?.selectedOptions?.length) answerDisplay = a.selectedOptions.join(', ');
                    else if (a?.answerText) answerDisplay = stripHtmlTags(a.answerText);
                    else if (answered && q.type === 'recording') answerDisplay = '🎙️ Recorded ✓';
                    else if (answered && (q.type === 'upload' || q.type === 'video')) answerDisplay = '📎 File uploaded ✓';
                    const isMediaType = q.type === 'recording' || q.type === 'upload' || q.type === 'video';
                    return (
                        <div key={q.id || i} style={{ borderRadius: 8, border: `2px solid ${isCurrent ? '#6366f1' : answered ? 'rgba(34,197,94,0.4)' : 'var(--border)'}`, background: isCurrent ? 'rgba(99,102,241,0.08)' : 'var(--surface)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ width: 22, height: 22, borderRadius: 5, background: isCurrent ? '#6366f1' : answered ? 'rgba(34,197,94,0.2)' : 'var(--border)', color: isCurrent ? '#fff' : answered ? '#22c55e' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                                <span style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.4, flex: 1 }}>{qText}</span>
                                {isCurrent && <span style={{ fontSize: 10, fontWeight: 700, color: '#6366f1', flexShrink: 0 }}>CURRENT</span>}
                            </div>
                            {answerDisplay ? (
                                <div style={{ fontSize: 12, color: answered ? '#a5b4fc' : 'var(--text-muted)', background: answered ? 'rgba(99,102,241,0.12)' : 'transparent', borderRadius: 5, padding: '3px 8px', marginLeft: 30, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{answerDisplay}</div>
                            ) : isCurrent && isMediaType ? (
                                <div style={{ fontSize: 12, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', borderRadius: 5, padding: '3px 8px', marginLeft: 30 }}>
                                    {q.type === 'recording' ? '🎙️ Recording in progress…' : '📎 Uploading file…'}
                                </div>
                            ) : (
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', marginLeft: 30 }}>No answer yet</div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function QuizStudentMonitor({
    progress,
    quiz,
    focusedId,
    onFocus,
    onBack,
}: {
    progress: Map<string, StudentProgressEntry>;
    quiz: { questions: unknown[] } | null;
    focusedId: string | null;
    onFocus: (id: string | null) => void;
    onBack: () => void;
}) {
    const entries = Array.from(progress.entries()); // [socketId, StudentProgressEntry]
    const questions = (quiz?.questions || []) as MonitorQuestion[];
    const cols = entries.length <= 1 ? 1 : entries.length <= 4 ? 2 : 3;

    // ── Fullscreen focus view ────────────────────────────────────────────
    if (focusedId) {
        const entry = progress.get(focusedId);
        if (!entry) { onFocus(null); return null; }
        return <QuizProgressFull entry={entry} questions={questions} onClose={() => onFocus(null)} />;
    }

    // ── Grid view ────────────────────────────────────────────────────────
    return (
        <div style={{ width: '100%', height: '100%', background: 'var(--surface-2)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e', flexShrink: 0 }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                    Live Monitor — {entries.length} student{entries.length !== 1 ? 's' : ''}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1 }}>Click a tile to expand · Esc to exit</span>
                <button onClick={onBack} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                    Quiz Panel →
                </button>
            </div>
            <div style={{ flex: 1, padding: 8, overflow: 'auto', display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8, alignContent: 'start' }}>
                {entries.map(([socketId, entry]) => (
                    <QuizProgressTile
                        key={socketId}
                        entry={entry}
                        questions={questions}
                        onClick={() => onFocus(socketId)}
                    />
                ))}
            </div>
        </div>
    );
}