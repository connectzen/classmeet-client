import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

export interface Participant {
    socketId: string;
    name: string;
    role: 'teacher' | 'student' | 'guest';
}

export interface ChatMessage {
    socketId: string;
    name: string;
    message: string;
    timestamp: string;
}

interface UseSocketOptions {
    roomCode: string;
    roomId: string;
    roomName: string;
    name: string;
    role: 'teacher' | 'student' | 'guest';
    isGuestRoomHost?: boolean;
    onParticipantJoined: (p: Participant) => void;
    onParticipantLeft: (socketId: string) => void;
    onSignal: (data: { from: string; signal: unknown }) => void;
    onChatMessage: (msg: ChatMessage) => void;
    onRoomEnded: () => void;
    onForceMute: (muted: boolean) => void;
    onForceCam: (camOn: boolean) => void;
    onParticipantMuteChanged: (socketId: string, muted: boolean) => void;
    onParticipantCamChanged: (socketId: string, camOn: boolean) => void;
    onTeacherDisconnected: (graceSeconds: number) => void;
    onSpotlightChanged: (spotlightSocketId: string) => void;
    onTeacherJoined: () => void;
    onAdminRefresh?: (data: { type: string }) => void;
    onCourseToggle?: (active: boolean, courseIds: string[]) => void;
    onCourseNavigate?: (courseIdx: number, lessonIdx: number) => void;
    onCourseNavLock?: (locked: boolean) => void;
}

export function useSocket(options: UseSocketOptions) {
    const {
        roomCode, roomId, roomName, name, role, isGuestRoomHost,
        onParticipantJoined, onParticipantLeft,
        onSignal, onChatMessage, onRoomEnded,
        onForceMute, onForceCam, onParticipantMuteChanged, onParticipantCamChanged, onTeacherDisconnected,
        onSpotlightChanged, onTeacherJoined, onAdminRefresh, onCourseToggle, onCourseNavigate, onCourseNavLock,
    } = options;

    // Keep refs so the single registered socket listeners always call the latest callbacks
    const onAdminRefreshRef = useRef<typeof onAdminRefresh>(onAdminRefresh);
    const onParticipantJoinedRef = useRef(onParticipantJoined);
    const onParticipantLeftRef = useRef(onParticipantLeft);
    const onSignalRef = useRef(onSignal);
    const onChatMessageRef = useRef(onChatMessage);
    const onRoomEndedRef = useRef(onRoomEnded);
    const onForceMuteRef = useRef(onForceMute);
    const onForceCamRef = useRef(onForceCam);
    const onParticipantMuteChangedRef = useRef(onParticipantMuteChanged);
    const onParticipantCamChangedRef = useRef(onParticipantCamChanged);
    const onTeacherDisconnectedRef = useRef(onTeacherDisconnected);
    const onSpotlightChangedRef = useRef(onSpotlightChanged);
    const onTeacherJoinedRef = useRef(onTeacherJoined);
    const onCourseToggleRef = useRef(onCourseToggle);
    const onCourseNavigateRef = useRef(onCourseNavigate);
    const onCourseNavLockRef = useRef(onCourseNavLock);

    onAdminRefreshRef.current = onAdminRefresh;
    onParticipantJoinedRef.current = onParticipantJoined;
    onParticipantLeftRef.current = onParticipantLeft;
    onSignalRef.current = onSignal;
    onChatMessageRef.current = onChatMessage;
    onRoomEndedRef.current = onRoomEnded;
    onForceMuteRef.current = onForceMute;
    onForceCamRef.current = onForceCam;
    onParticipantMuteChangedRef.current = onParticipantMuteChanged;
    onParticipantCamChangedRef.current = onParticipantCamChanged;
    onTeacherDisconnectedRef.current = onTeacherDisconnected;
    onSpotlightChangedRef.current = onSpotlightChanged;
    onTeacherJoinedRef.current = onTeacherJoined;
    onCourseToggleRef.current = onCourseToggle;
    onCourseNavigateRef.current = onCourseNavigate;
    onCourseNavLockRef.current = onCourseNavLock;

    const socketRef = useRef<Socket | null>(null);
    const [socketId, setSocketId] = useState('');
    const [connected, setConnected] = useState(false);
    const [joinError, setJoinError] = useState('');
    const [existingParticipants, setExistingParticipants] = useState<Participant[]>([]);
    const [currentSpotlight, setCurrentSpotlight] = useState<string | null>(null);
    const [roomQuiz, setRoomQuiz] = useState<{ quizId: string; quiz: unknown } | null>(null);
    const [roomQuizSubmissions, setRoomQuizSubmissions] = useState<{ submissionId: string; studentId: string; studentName: string; score: number | null }[]>([]);
    const [roomQuizRevealed, setRoomQuizRevealed] = useState<{ type: string; submissionId?: string; data?: unknown } | null>(null);
    const [revealedStudentIds, setRevealedStudentIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        const socket = io(SERVER_URL, { transports: ['websocket'] });
        socketRef.current = socket;

        socket.on('connect', () => {
            setSocketId(socket.id!);
            setConnected(true);

            socket.emit('join-room', { roomCode, roomId, roomName, name, role, isGuestRoomHost: isGuestRoomHost ?? false }, (res: {
                success?: boolean;
                error?: string;
                existingParticipants?: Participant[];
                currentSpotlight?: string | null;
                roomQuiz?: { quizId: string; quiz: unknown } | null;
            }) => {
                if (res.error) setJoinError(res.error);
                else {
                    setExistingParticipants(res.existingParticipants || []);
                    setCurrentSpotlight(res.currentSpotlight || null);
                    setRoomQuiz(res.roomQuiz || null);
                    setRoomQuizSubmissions([]);
                }
            });
        });

        socket.on('participant-joined', (data: Participant) => onParticipantJoinedRef.current(data));
        socket.on('participant-left', ({ socketId: sid }: { socketId: string }) => onParticipantLeftRef.current(sid));
        socket.on('signal', (data: { from: string; signal: unknown }) => onSignalRef.current(data));
        socket.on('chat-message', (data: ChatMessage) => onChatMessageRef.current(data));
        socket.on('room-ended', () => onRoomEndedRef.current());
        socket.on('force-mute', ({ muted }: { muted: boolean }) => onForceMuteRef.current(muted));
        socket.on('force-cam', ({ camOn }: { camOn: boolean }) => onForceCamRef.current(camOn));
        socket.on('participant-mute-changed', ({ socketId: sid, muted }: { socketId: string; muted: boolean }) =>
            onParticipantMuteChangedRef.current(sid, muted)
        );
        socket.on('participant-cam-changed', ({ socketId: sid, camOn }: { socketId: string; camOn: boolean }) =>
            onParticipantCamChangedRef.current(sid, camOn)
        );
        socket.on('teacher-disconnected', ({ graceSeconds }: { graceSeconds: number }) =>
            onTeacherDisconnectedRef.current(graceSeconds)
        );
        socket.on('spotlight-changed', ({ spotlightSocketId }: { spotlightSocketId: string }) =>
            onSpotlightChangedRef.current(spotlightSocketId)
        );
        socket.on('teacher-joined', () => onTeacherJoinedRef.current());
        socket.on('admin:refresh', (data: { type: string }) => { onAdminRefreshRef.current?.(data); });
        socket.on('room:quiz-active', ({ quizId, quiz }: { quizId: string; quiz: unknown }) => {
            setRoomQuiz({ quizId, quiz });
            setRoomQuizSubmissions([]); // clear on new quiz
            setRoomQuizRevealed(null);
            setRevealedStudentIds(new Set());
        });
        socket.on('room:quiz-inactive', () => {
            setRoomQuiz(null);
            // Keep submissions so teacher can grade after stopping the quiz
        });
        socket.on('room:quiz-submission', ({ submissions }: { submissions: { submissionId: string; studentId: string; studentName: string; score: number | null }[] }) => {
            setRoomQuizSubmissions(submissions || []);
        });
        socket.on('room:quiz-revealed', ({ type, submissionId, data }: { type: string; submissionId?: string; data?: unknown }) => {
            setRoomQuizRevealed({ type, submissionId, data });
        });
        socket.on('room:quiz-student-revealed', ({ studentId }: { studentId: string }) => {
            setRevealedStudentIds(prev => new Set(prev).add(studentId));
        });
        socket.on('course:toggle', ({ active, courseIds }: { active: boolean; courseIds: string[] }) => {
            onCourseToggleRef.current?.(active, courseIds);
        });
        socket.on('course:navigate', ({ activeCourseIdx, activeLessonIdx }: { activeCourseIdx: number; activeLessonIdx: number }) => {
            onCourseNavigateRef.current?.(activeCourseIdx, activeLessonIdx);
        });
        socket.on('course:nav-lock', ({ locked }: { locked: boolean }) => {
            onCourseNavLockRef.current?.(locked);
        });
        socket.on('disconnect', () => setConnected(false));

        return () => {
            socket.emit('leave-room', { roomCode });
            socket.disconnect();
        };
    }, []);

    const sendSignal = useCallback((to: string, signal: unknown) => {
        socketRef.current?.emit('signal', { to, signal });
    }, []);

    const sendMessage = useCallback((message: string) => {
        socketRef.current?.emit('chat-message', { roomCode, roomId, name, message });
    }, [roomCode, roomId, name]);

    const endRoom = useCallback(() => {
        socketRef.current?.emit('end-room', { roomCode, roomId });
    }, [roomCode, roomId]);

    const muteParticipant = useCallback((targetSocketId: string, muted: boolean) => {
        socketRef.current?.emit('mute-participant', { targetSocketId, muted });
    }, []);

    const camParticipant = useCallback((targetSocketId: string, camOn: boolean) => {
        socketRef.current?.emit('cam-participant', { targetSocketId, camOn });
    }, []);

    const broadcastSelfCam = useCallback((camOn: boolean) => {
        socketRef.current?.emit('self-cam-changed', { camOn });
    }, []);

    const changeSpotlight = useCallback((spotlightSocketId: string) => {
        socketRef.current?.emit('spotlight-change', { roomCode, spotlightSocketId });
    }, [roomCode]);

    const startRoomQuiz = useCallback((quizId: string) => {
        socketRef.current?.emit('room-quiz-start', { roomCode, roomId, quizId });
    }, [roomCode, roomId]);

    const stopRoomQuiz = useCallback(() => {
        socketRef.current?.emit('room-quiz-stop', { roomCode });
    }, [roomCode]);

    const submitRoomQuiz = useCallback((submissionId: string, quizId: string, studentId: string, studentName: string, score: number | null) => {
        socketRef.current?.emit('room-quiz-submit', { roomCode, submissionId, quizId, studentId, studentName, score });
    }, [roomCode]);

    const revealRoomQuiz = useCallback((type: 'individual' | 'class-reveal' | 'final', submissionId?: string, data?: unknown) => {
        socketRef.current?.emit('room-quiz-reveal', { roomCode, type, submissionId, data });
    }, [roomCode]);

    const emitCourseToggle = useCallback((active: boolean, courseIds: string[]) => {
        socketRef.current?.emit('course-toggle', { roomCode, active, courseIds });
    }, [roomCode]);

    const emitCourseNavigate = useCallback((courseIdx: number, lessonIdx: number) => {
        socketRef.current?.emit('course-navigate', { roomCode, activeCourseIdx: courseIdx, activeLessonIdx: lessonIdx });
    }, [roomCode]);

    const emitCourseNavLock = useCallback((locked: boolean) => {
        socketRef.current?.emit('course-nav-lock', { roomCode, locked });
    }, [roomCode]);

    return {
        socketId, connected, joinError, existingParticipants, currentSpotlight,
        roomQuiz, roomQuizSubmissions, roomQuizRevealed, revealedStudentIds,
        sendSignal, sendMessage, endRoom, muteParticipant, camParticipant, broadcastSelfCam, changeSpotlight,
        startRoomQuiz, stopRoomQuiz, submitRoomQuiz, revealRoomQuiz,
        emitCourseToggle, emitCourseNavigate, emitCourseNavLock,
    };
}
