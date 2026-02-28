import { useState, useEffect, useCallback, useRef } from 'react';
import { useUser } from '../lib/AuthContext';
import ChatPanel, { ChatMsg } from '../components/ChatPanel';
import DevicePicker from '../components/DevicePicker';
import RescheduleSessionModal from '../components/RescheduleSessionModal';
import { RoomQuizParticipant, RoomQuizHost, PostSubmitWaiting, InlineResultCard } from '../components/RoomQuizPanel';
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
    const [roomQuizzes, setRoomQuizzes] = useState<{ id: string; title: string; question_count?: number; room_id?: string }[]>([]);
    const [loadingRoomQuizzes, setLoadingRoomQuizzes] = useState(false);
    const [roomQuizSubmitted, setRoomQuizSubmitted] = useState(false);
    const [dismissedRevealed, setDismissedRevealed] = useState(false);
    const socketIdRef = useRef<string>('');

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
        const constraints: MediaStreamConstraints = {
            video: activeVideoDeviceId ? { deviceId: { exact: activeVideoDeviceId } } : true,
            audio: activeAudioDeviceId ? { deviceId: { exact: activeAudioDeviceId } } : true,
        };
        navigator.mediaDevices.getUserMedia(constraints)
            .then((stream) => {
                setLocalStream((prev) => { prev?.getTracks().forEach((t) => t.stop()); return stream; });
                setMicOn(true); setCamOn(true);
            })
            .catch(() => {
                navigator.mediaDevices.getUserMedia({ video: false, audio: true })
                    .then(setLocalStream).catch(console.error);
            });
    }, [activeVideoDeviceId, activeAudioDeviceId]);

    // ── Socket event handlers ────────────────────────────────────────────
    const handleParticipantJoined = useCallback((p: Participant) => {
        setParticipants((prev) => new Map(prev).set(p.socketId, { ...p, isMuted: false, isCamOff: false }));
        addNewPeer(p.socketId);
        // If a teacher just joined and we had a countdown, cancel it
        if (p.role === 'teacher') setTeacherGraceCountdown(null);
    }, []);

    const handleParticipantLeft = useCallback((sid: string) => {
        setParticipants((prev) => { const next = new Map(prev); next.delete(sid); return next; });
        removePeer(sid);
        setSpotlightId((prev) => prev === sid ? '__local__' : prev);
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
        });

    // Keep ref in sync so callbacks can read current socketId without stale closures
    socketIdRef.current = socketId;

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

    // Fetch quizzes for this room when teacher toggles quiz ON
    useEffect(() => {
        if (!quizToggleOn || role !== 'teacher') return;
        setLoadingRoomQuizzes(true);
        fetch(`${SERVER_URL}/api/quizzes?roomIds=${encodeURIComponent(roomId)}`)
            .then(r => r.json())
            .then((data: { id: string; title: string; question_count?: number; room_id?: string }[]) => {
                setRoomQuizzes(Array.isArray(data) ? data : []);
            })
            .catch(() => setRoomQuizzes([]))
            .finally(() => setLoadingRoomQuizzes(false));
    }, [quizToggleOn, role, roomId]);

    useEffect(() => {
        if (!roomQuiz) setRoomQuizSubmitted(false);
    }, [roomQuiz]);
    useEffect(() => {
        setDismissedRevealed(false);
    }, [roomQuizRevealed]);

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
                const vs = await navigator.mediaDevices.getUserMedia({
                    video: activeVideoDeviceId ? { deviceId: { exact: activeVideoDeviceId } } : true,
                });
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
        // Don't call onLeave/clearSession — countdown will run, room-ended will trigger redirect
    };

    const handleRescheduleClick = () => {
        setShowEndConfirm(false);
        setShowRescheduleModal(true);
    };

    const handleRescheduleSaved = () => {
        setShowRescheduleModal(false);
        setHasScheduledSession(null);
        endRoom();
        clearSession();
        onLeave();
        // Teacher leaves immediately; countdown runs for any remaining students
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
            <div className="room-ended-card">
                <div className="ended-icon">🎓</div>
                <h2>Class Ended</h2>
                <p>The session has ended. Redirecting…</p>
            </div>
        </div>
    );

    if (socketJoinError) return (
        <div className="room-ended">
            <div className="room-ended-card">
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

            {/* Mobile chat popup */}
            {isChatOpen ? (
                <div className="mobile-chat-overlay" onClick={() => setIsChatOpen(false)}>
                    <div className="mobile-chat-sheet" onClick={(e) => e.stopPropagation()}>
                        <button className="mobile-chat-close" onClick={() => setIsChatOpen(false)}>✕</button>
                        <ChatPanel messages={messages} mySocketId={socketId} onSend={sendMessage} />
                    </div>
                </div>
            ) : null}

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
                    <span className="room-name">{roomName || roomCode}</span>
                    <span className={`connection-dot ${connected ? 'dot-connected' : 'dot-disconnected'}`} />
                </div>
                <div className="room-header-right">
                    <span className="participant-count">👥 {allParticipants.length} / 5</span>
                    <button
                        className={`room-code-copy-btn ${codeCopied ? 'code-copied' : ''}`}
                        onClick={copyRoomCode}
                        title="Click to copy room code"
                    >
                        🔑 <span className="code-text">{roomCode}</span>
                        <span className="copy-hint">{codeCopied ? '✅ Copied!' : '📋 Copy'}</span>
                    </button>
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

                    {/* Spotlight or Quiz (when toggle ON) */}
                    <div className="spotlight-area">
                        {quizToggleOn && role === 'teacher' ? (
                            <RoomQuizHost
                                roomId={roomId}
                                quizzes={roomQuizzes}
                                loadingQuizzes={loadingRoomQuizzes}
                                activeQuiz={roomQuiz}
                                submissions={roomQuizSubmissions}
                                revealedStudentIds={revealedStudentIds}
                                onStartQuiz={startRoomQuiz}
                                onStopQuiz={() => { stopRoomQuiz(); setQuizToggleOn(false); }}
                                onReveal={revealRoomQuiz}
                            />
                        ) : roomQuizRevealed && !dismissedRevealed ? (
                            <InlineResultCard
                                score={(roomQuizRevealed.data as { score?: number | null })?.score ?? null}
                                comment={(roomQuizRevealed.data as { comment?: string })?.comment}
                                studentName={(roomQuizRevealed.data as { studentName?: string })?.studentName}
                                isClassReveal={roomQuizRevealed.type === 'class-reveal'}
                                currentUserId={user?.id}
                                revealedStudentId={(roomQuizRevealed.data as { studentId?: string })?.studentId}
                                onClose={() => setDismissedRevealed(true)}
                            />
                        ) : role !== 'teacher' && roomQuiz ? (
                            roomQuizSubmitted ? (
                                <PostSubmitWaiting studentCount={allParticipants.filter(p => p.role !== 'teacher').length} />
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

                    {/* Quiz Toggle (teacher only) */}
                    {role === 'teacher' && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>Quiz</span>
                            <button
                                onClick={() => {
                                    if (quizToggleOn && roomQuiz) stopRoomQuiz();
                                    setQuizToggleOn(prev => !prev);
                                    if (!quizToggleOn) setRoomQuizSubmitted(false);
                                }}
                                style={{
                                    width: 52, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer',
                                    background: quizToggleOn ? '#22c55e' : 'var(--surface-3)',
                                    position: 'relative', transition: 'background 0.2s',
                                }}
                            >
                                <span style={{
                                    position: 'absolute', top: 4, left: quizToggleOn ? 28 : 4,
                                    width: 20, height: 20, borderRadius: '50%', background: '#fff',
                                    transition: 'left 0.2s',
                                }} />
                            </button>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{quizToggleOn ? 'ON' : 'OFF'}</span>
                        </div>
                    )}

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
            {!showAvatar && (
                <video ref={ref} autoPlay playsInline muted={isLocal} className="spotlight-video" />
            )}
            {showAvatar && (
                <div className="spotlight-placeholder">
                    <div className="spotlight-avatar">{name.charAt(0).toUpperCase()}</div>
                </div>
            )}
            <div className="spotlight-label">{name}</div>
        </div>
    );
}

function VideoTileInline({ stream, name, muted, isCamOff }: { stream: MediaStream | null; name: string; muted?: boolean; isCamOff?: boolean }) {
    const ref = useRef<HTMLVideoElement>(null);
    useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
    const showAvatar = !stream || isCamOff;
    return (
        <div className="thumb-video-wrap">
            {!showAvatar && (
                <video ref={ref} autoPlay playsInline muted={muted} className="thumb-video" />
            )}
            {showAvatar && <div className="thumb-avatar">{name.charAt(0).toUpperCase()}</div>}
        </div>
    );
}
