import { useState, useImperativeHandle, forwardRef, useRef } from 'react';

const SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

interface Props {
    hostId: string;
    onJoinRoom: (roomCode: string, roomId: string, name: string, role: 'teacher' | 'student', roomName: string, isGuestRoomHost?: boolean) => void;
    primaryCtaLabel?: string;
}

export interface GuestRoomSectionRef {
    createGuestRoom: () => Promise<void>;
    creating: boolean;
}

const GuestRoomSection = forwardRef<GuestRoomSectionRef, Props>(function GuestRoomSection({ hostId, onJoinRoom, primaryCtaLabel }, ref) {
    const [guestRoom, setGuestRoom] = useState<{ id: string; room_code: string; room_id: string; url: string; roomName: string } | null>(null);
    const [creating, setCreating] = useState(false);
    const [ending, setEnding] = useState(false);

    const handleCreateRef = useRef<() => Promise<void>>(async () => {});

    async function handleCreate() {
        setCreating(true);
        try {
            const r = await fetch(`${SERVER}/api/guest-rooms`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hostId }),
            });
            const data = await r.json();
            if (r.ok) setGuestRoom({ id: data.id, room_code: data.room_code, room_id: data.room_id, url: data.url, roomName: data.roomName || `Guest Room ${data.room_code}` });
        } finally {
            setCreating(false);
        }
    }
    handleCreateRef.current = handleCreate;
    useImperativeHandle(ref, () => ({
        createGuestRoom: () => handleCreateRef.current?.(),
        creating,
    }), [creating]);

    async function handleEnd() {
        if (!guestRoom) return;
        setEnding(true);
        try {
            const r = await fetch(`${SERVER}/api/guest-rooms/${guestRoom.id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hostId }),
            });
            if (r.ok) setGuestRoom(null);
        } finally {
            setEnding(false);
        }
    }

    const ctaLabel = primaryCtaLabel || 'Create guest room';
    return (
        <div style={{ marginTop: 20, marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Guest room</h3>
            {!guestRoom ? (
                <button
                    type="button"
                    onClick={handleCreate}
                    disabled={creating}
                    style={{
                        padding: '10px 18px',
                        borderRadius: 10,
                        border: 'none',
                        background: 'var(--primary, #6366f1)',
                        color: '#fff',
                        fontWeight: 600,
                        fontSize: 14,
                        cursor: creating ? 'not-allowed' : 'pointer',
                    }}
                >
                    {creating ? 'Creating…' : ctaLabel}
                </button>
            ) : (
                <div style={{
                    padding: 16,
                    background: 'rgba(255,255,255,0.04)',
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.08)',
                }}>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>Share this link (no login required):</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                        <input
                            readOnly
                            value={guestRoom.url}
                            style={{
                                flex: 1,
                                minWidth: 200,
                                padding: '8px 12px',
                                borderRadius: 8,
                                border: '1px solid rgba(255,255,255,0.1)',
                                background: 'rgba(0,0,0,0.2)',
                                color: 'var(--text)',
                                fontSize: 13,
                            }}
                        />
                        <button
                            type="button"
                            onClick={() => navigator.clipboard.writeText(guestRoom.url)}
                            style={{
                                padding: '8px 16px',
                                borderRadius: 8,
                                border: 'none',
                                background: 'var(--primary, #6366f1)',
                                color: '#fff',
                                fontWeight: 600,
                                fontSize: 13,
                                cursor: 'pointer',
                            }}
                        >
                            Copy
                        </button>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            type="button"
                            onClick={() => { if (!window.confirm('Enter as host?')) return; onJoinRoom(guestRoom.room_code, guestRoom.room_id, 'Host', 'teacher', guestRoom.roomName, true); }}
                            style={{
                                padding: '8px 16px',
                                borderRadius: 8,
                                border: '1px solid rgba(255,255,255,0.2)',
                                background: 'transparent',
                                color: 'var(--text)',
                                fontSize: 13,
                                cursor: 'pointer',
                            }}
                        >
                            Join as host
                        </button>
                        <button
                            type="button"
                            onClick={handleEnd}
                            disabled={ending}
                            style={{
                                padding: '8px 16px',
                                borderRadius: 8,
                                border: '1px solid rgba(239,68,68,0.4)',
                                background: 'rgba(239,68,68,0.15)',
                                color: '#f87171',
                                fontWeight: 600,
                                fontSize: 13,
                                cursor: ending ? 'not-allowed' : 'pointer',
                            }}
                        >
                            {ending ? 'Ending…' : 'End meeting'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
});
export default GuestRoomSection;
