import { useState, useCallback, useEffect } from 'react';
import { AuthProvider } from './lib/AuthContext';
import Landing from './pages/Landing';
import Room from './pages/Room';
import AdminDashboard from './pages/AdminDashboard';
import GuestJoin from './components/GuestJoin';

type View = 'landing' | 'room' | 'admin' | 'guest';

interface RoomSession {
    roomCode: string;
    roomId: string;
    roomName: string;
    name: string;
    role: 'teacher' | 'student' | 'guest';
    isGuestRoomHost?: boolean;
}

export default function App() {
    const [view, setView] = useState<View>('landing');
    const [session, setSession] = useState<RoomSession | null>(null);
    const [guestCode, setGuestCode] = useState<string | null>(null);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('guest');
        if (code) {
            setGuestCode(code);
            setView('guest');
            window.history.replaceState({}, '', window.location.pathname || '/');
        }
    }, []);

    const handleAdminView = useCallback(() => {
        setView('admin');
    }, []);

    const enterFullscreen = () => {
        const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
        if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    };

    const exitFullscreen = () => {
        const doc = document as Document & { webkitExitFullscreen?: () => void; webkitFullscreenElement?: Element | null };
        if (doc.fullscreenElement || doc.webkitFullscreenElement) {
            if (doc.exitFullscreen) doc.exitFullscreen().catch(() => {});
            else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
        }
    };

    const handleJoinRoom = (roomCode: string, roomId: string, name: string, role: 'teacher' | 'student' | 'guest', roomName: string, isGuestRoomHost?: boolean) => {
        setSession({ roomCode, roomId, roomName, name, role, isGuestRoomHost: !!isGuestRoomHost });
        setView('room');
        enterFullscreen();
    };

    const handleResumeSession = (s: { roomCode: string; roomId: string; roomName: string; role: 'teacher' | 'student'; name: string }) => {
        setSession(s);
        setView('room');
        enterFullscreen();
    };

    const handleLeave = () => {
        exitFullscreen();
        setSession(null);
        setView('landing');
    };

    return (
        <AuthProvider>
            {view === 'guest' && guestCode && (
                <GuestJoin
                    code={guestCode}
                    onJoin={handleJoinRoom}
                />
            )}
            {view === 'landing' && (
                <Landing
                    onJoinRoom={handleJoinRoom}
                    onResumeSession={handleResumeSession}
                    onAdminView={handleAdminView}
                />
            )}
            {view === 'admin' && <AdminDashboard onJoinRoom={handleJoinRoom} />}
            {view === 'room' && session && (
                <Room
                    roomCode={session.roomCode}
                    roomId={session.roomId}
                    roomName={session.roomName}
                    name={session.name}
                    role={session.role}
                    isGuestRoomHost={session.isGuestRoomHost}
                    onLeave={handleLeave}
                />
            )}
        </AuthProvider>
    );
}
