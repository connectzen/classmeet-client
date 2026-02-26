import { useState, useEffect } from 'react';
import MeetingBanner, { AdminMeeting } from './MeetingBanner';

const SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

interface SessionByCode {
    id: string;
    room_code: string;
    room_id: string;
    title: string;
    description: string;
    scheduled_at: string;
    session_image_url?: string | null;
    created_by: string;
    max_participants: number;
    creator_name?: string | null;
}

interface Props {
    code: string;
    onJoin: (roomCode: string, roomId: string, name: string, role: 'teacher' | 'student' | 'guest', roomName: string) => void;
}

export default function GuestJoin({ code, onJoin }: Props) {
    const [session, setSession] = useState<SessionByCode | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError('');
        fetch(`${SERVER}/api/session-by-code/${encodeURIComponent(code)}`)
            .then((r) => {
                if (!r.ok) {
                    if (r.status === 404) throw new Error('Invalid or expired link');
                    return r.json().then((d) => { throw new Error(d.error || 'Failed to load session'); });
                }
                return r.json();
            })
            .then((data: SessionByCode) => {
                if (!cancelled) {
                    setSession(data);
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Invalid or expired link');
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [code]);

    const meetingForBanner: AdminMeeting = session ? {
        id: session.id,
        room_code: session.room_code,
        room_id: session.room_id,
        title: session.title,
        description: session.description || '',
        scheduled_at: session.scheduled_at,
        created_by: session.created_by,
        max_participants: session.max_participants ?? 30,
        is_active: true,
        session_image_url: session.session_image_url || undefined,
    } : null!;

    const handleJoinAsGuest = (roomCode: string, roomId: string, _displayName: string, _role: 'teacher' | 'student', title: string) => {
        const name = window.prompt('Enter your name to join');
        if (name?.trim()) {
            onJoin(roomCode, roomId, name.trim(), 'guest', title);
        }
    };

    if (loading) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--bg, #0f0f14)',
                padding: 24,
            }}>
                <div style={{ fontSize: 15, color: 'var(--text-muted)' }}>Loading session…</div>
            </div>
        );
    }

    if (error || !session) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--bg, #0f0f14)',
                padding: 24,
            }}>
                <div style={{
                    maxWidth: 400,
                    width: '100%',
                    background: 'var(--surface-2, #18181f)',
                    borderRadius: 16,
                    border: '1px solid rgba(239,68,68,0.3)',
                    padding: 32,
                    textAlign: 'center',
                }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
                    <h1 style={{ margin: '0 0 8px', fontSize: 20, color: 'var(--text)' }}>Invalid or expired link</h1>
                    <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg, #0f0f14)',
            padding: 24,
        }}>
            <div style={{ width: '100%', maxWidth: 420 }}>
                <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--text-muted)', textAlign: 'center' }}>
                    You've been invited to join this session. No account required.
                </p>
                <MeetingBanner
                    meeting={meetingForBanner}
                    displayName=""
                    userRole="student"
                    isCreator={false}
                    sessionType="teacher"
                    teacherName={session.creator_name || undefined}
                    onJoin={handleJoinAsGuest}
                />
            </div>
        </div>
    );
}
