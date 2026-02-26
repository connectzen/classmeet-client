import { useState } from 'react';

const SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

interface Props {
    code: string;
    onJoin: (roomCode: string, roomId: string, name: string, role: 'teacher' | 'student' | 'guest', roomName: string) => void;
}

export default function GuestJoin({ code, onJoin }: Props) {
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim()) { setError('Enter your name'); return; }
        setLoading(true);
        setError('');
        try {
            const r = await fetch(`${SERVER}/api/guest-rooms/join/${code}`);
            if (!r.ok) {
                const d = await r.json().catch(() => ({}));
                setError(d.error || 'Invalid or expired link');
                setLoading(false);
                return;
            }
            const data = await r.json();
            if (!window.confirm('Join this guest room?')) { setLoading(false); return; }
            onJoin(data.roomCode, data.roomId, name.trim(), 'guest', data.roomName || `Guest Room ${data.roomCode}`);
        } catch {
            setError('Could not connect');
        }
        setLoading(false);
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
            <div style={{
                maxWidth: 400,
                width: '100%',
                background: 'var(--surface-2, #18181f)',
                borderRadius: 16,
                border: '1px solid rgba(99,102,241,0.2)',
                padding: 32,
            }}>
                <h1 style={{ margin: '0 0 8px', fontSize: 22, color: 'var(--text)' }}>Join as guest</h1>
                <p style={{ margin: '0 0 24px', fontSize: 14, color: 'var(--text-muted)' }}>
                    Enter your name to join the room. No account required.
                </p>
                <form onSubmit={handleSubmit}>
                    <input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Your name"
                        autoFocus
                        style={{
                            width: '100%',
                            padding: '12px 16px',
                            borderRadius: 10,
                            border: '1px solid rgba(255,255,255,0.12)',
                            background: 'rgba(255,255,255,0.05)',
                            color: 'var(--text)',
                            fontSize: 16,
                            marginBottom: 16,
                            boxSizing: 'border-box',
                        }}
                    />
                    {error && <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</p>}
                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            width: '100%',
                            padding: 14,
                            borderRadius: 10,
                            border: 'none',
                            background: 'var(--primary, #6366f1)',
                            color: '#fff',
                            fontWeight: 700,
                            fontSize: 16,
                            cursor: loading ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {loading ? 'Joining…' : 'Join room'}
                    </button>
                </form>
            </div>
        </div>
    );
}
