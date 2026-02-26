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
    onParticipantJoined: (p: Participant) => void;
    onParticipantLeft: (socketId: string) => void;
    onSignal: (data: { from: string; signal: unknown }) => void;
    onChatMessage: (msg: ChatMessage) => void;
    onRoomEnded: () => void;
    onForceMute: (muted: boolean) => void;
    onParticipantMuteChanged: (socketId: string, muted: boolean) => void;
    onTeacherDisconnected: (graceSeconds: number) => void;
    onSpotlightChanged: (spotlightSocketId: string) => void;
    onTeacherJoined: () => void;
    onAdminRefresh?: (data: { type: string }) => void;
}

export function useSocket(options: UseSocketOptions) {
    const {
        roomCode, roomId, roomName, name, role,
        onParticipantJoined, onParticipantLeft,
        onSignal, onChatMessage, onRoomEnded,
        onForceMute, onParticipantMuteChanged, onTeacherDisconnected,
        onSpotlightChanged, onTeacherJoined, onAdminRefresh,
    } = options;

    // Keep a ref so the single registered socket listener always calls the latest callback
    const onAdminRefreshRef = useRef<typeof onAdminRefresh>(onAdminRefresh);
    useEffect(() => { onAdminRefreshRef.current = onAdminRefresh; }, [onAdminRefresh]);

    const socketRef = useRef<Socket | null>(null);
    const [socketId, setSocketId] = useState('');
    const [connected, setConnected] = useState(false);
    const [joinError, setJoinError] = useState('');
    const [existingParticipants, setExistingParticipants] = useState<Participant[]>([]);
    const [currentSpotlight, setCurrentSpotlight] = useState<string | null>(null);

    useEffect(() => {
        const socket = io(SERVER_URL, { transports: ['websocket'] });
        socketRef.current = socket;

        socket.on('connect', () => {
            setSocketId(socket.id!);
            setConnected(true);

            socket.emit('join-room', { roomCode, roomId, roomName, name, role }, (res: {
                success?: boolean;
                error?: string;
                existingParticipants?: Participant[];
                currentSpotlight?: string | null;
            }) => {
                if (res.error) setJoinError(res.error);
                else {
                    setExistingParticipants(res.existingParticipants || []);
                    setCurrentSpotlight(res.currentSpotlight || null);
                }
            });
        });

        socket.on('participant-joined', onParticipantJoined);
        socket.on('participant-left', ({ socketId: sid }: { socketId: string }) => onParticipantLeft(sid));
        socket.on('signal', onSignal);
        socket.on('chat-message', onChatMessage);
        socket.on('room-ended', onRoomEnded);
        socket.on('force-mute', ({ muted }: { muted: boolean }) => onForceMute(muted));
        socket.on('participant-mute-changed', ({ socketId: sid, muted }: { socketId: string; muted: boolean }) =>
            onParticipantMuteChanged(sid, muted)
        );
        socket.on('teacher-disconnected', ({ graceSeconds }: { graceSeconds: number }) =>
            onTeacherDisconnected(graceSeconds)
        );
        socket.on('spotlight-changed', ({ spotlightSocketId }: { spotlightSocketId: string }) =>
            onSpotlightChanged(spotlightSocketId)
        );
        socket.on('teacher-joined', () => onTeacherJoined());
        socket.on('admin:refresh', (data: { type: string }) => { onAdminRefreshRef.current?.(data); });
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

    const changeSpotlight = useCallback((spotlightSocketId: string) => {
        socketRef.current?.emit('spotlight-change', { roomCode, spotlightSocketId });
    }, [roomCode]);

    return { socketId, connected, joinError, existingParticipants, currentSpotlight, sendSignal, sendMessage, endRoom, muteParticipant, changeSpotlight };
}
