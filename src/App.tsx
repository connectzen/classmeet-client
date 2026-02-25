import { useState, useCallback } from 'react';
import { AuthProvider } from './lib/AuthContext';
import Landing from './pages/Landing';
import Room from './pages/Room';
import AdminDashboard from './pages/AdminDashboard';

type View = 'landing' | 'room' | 'admin';

interface RoomSession {
    roomCode: string;
    roomId: string;
    roomName: string;
    name: string;
    role: 'teacher' | 'student';
}

export default function App() {
    const [view, setView] = useState<View>('landing');
    const [session, setSession] = useState<RoomSession | null>(null);

    const handleAdminView = useCallback(() => {
        setView('admin');
    }, []);

    const handleJoinRoom = (roomCode: string, roomId: string, name: string, role: 'teacher' | 'student', roomName: string) => {
        setSession({ roomCode, roomId, roomName, name, role });
        setView('room');
    };

    const handleResumeSession = (s: { roomCode: string; roomId: string; roomName: string; role: 'teacher' | 'student'; name: string }) => {
        setSession(s);
        setView('room');
    };

    const handleLeave = () => {
        setSession(null);
        setView('landing');
    };

    return (
        <AuthProvider>
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
                    onLeave={handleLeave}
                />
            )}
        </AuthProvider>
    );
}
