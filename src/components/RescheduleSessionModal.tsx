import { useState, useEffect } from 'react';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

interface Session {
    id: string;
    title: string;
    description: string;
    scheduled_at: string;
}

interface Props {
    roomCode: string;
    userId: string;
    onSaved: () => void;
    onCancel: () => void;
}

export default function RescheduleSessionModal({ roomCode, userId, onSaved, onCancel }: Props) {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [dateTime, setDateTime] = useState('');
    const [updating, setUpdating] = useState(false);

    useEffect(() => {
        const code = roomCode.toUpperCase();
        fetch(`${SERVER_URL}/api/session-by-code/${code}`)
            .then((r) => r.ok ? r.json() : null)
            .then((data) => {
                if (data) {
                    setSession(data);
                    setTitle(data.title || '');
                    setDescription(data.description || '');
                    const d = new Date(data.scheduled_at);
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    const h = String(d.getHours()).padStart(2, '0');
                    const min = String(d.getMinutes()).padStart(2, '0');
                    setDateTime(`${y}-${m}-${day}T${h}:${min}`);
                }
                setLoading(false);
            })
            .catch(() => {
                setLoading(false);
                setError('Could not load session');
            });
    }, [roomCode]);

    const handleSave = async () => {
        if (!session || !title.trim() || !dateTime || !userId) return;
        setUpdating(true);
        setError('');
        try {
            const res = await fetch(`${SERVER_URL}/api/teacher/sessions/${session.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    teacherId: userId,
                    title: title.trim(),
                    description: description.trim(),
                    scheduledAt: new Date(dateTime).toISOString(),
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Failed to update session');
                setUpdating(false);
                return;
            }
            onSaved();
        } catch {
            setError('Server unreachable');
        }
        setUpdating(false);
    };

    if (loading) {
        return (
            <div style={{
                position: 'fixed', inset: 0, zIndex: 999999,
                background: 'rgba(0,0,0,0.8)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <div style={{ color: '#e2e8f0', fontSize: 16 }}>Loading…</div>
            </div>
        );
    }

    if (!session) {
        return (
            <div style={{
                position: 'fixed', inset: 0, zIndex: 999999,
                background: 'rgba(0,0,0,0.8)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
            }}>
                <div style={{
                    background: 'var(--surface-2, #18181f)',
                    borderRadius: 20,
                    maxWidth: 400,
                    padding: 24,
                    textAlign: 'center',
                }}>
                    <p style={{ color: 'var(--text-muted, #94a3b8)', marginBottom: 16 }}>
                        No scheduled session found for this room.
                    </p>
                    <button type="button" className="btn btn-primary" onClick={onCancel}>Close</button>
                </div>
            </div>
        );
    }

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 999999,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }} onClick={onCancel}>
            <div style={{
                background: 'linear-gradient(135deg, #1e1b4b 0%, #1e2a4a 100%)',
                border: '1px solid rgba(99,102,241,0.4)',
                borderRadius: 20,
                padding: '28px 24px',
                width: '100%',
                maxWidth: 440,
                boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
            }} onClick={(e) => e.stopPropagation()}>
                <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>
                    Reschedule Class
                </h3>
                {error && <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>Class Title *</label>
                        <input
                            className="form-input"
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            style={{ width: '100%', boxSizing: 'border-box' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>Date & Time *</label>
                        <input
                            className="form-input"
                            type="datetime-local"
                            value={dateTime}
                            onChange={(e) => setDateTime(e.target.value)}
                            style={{ width: '100%', boxSizing: 'border-box', colorScheme: 'dark' }}
                        />
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={updating}>
                        Cancel
                    </button>
                    <button type="button" className="btn btn-primary" onClick={handleSave} disabled={updating || !title.trim() || !dateTime}>
                        {updating ? 'Rescheduling…' : 'Reschedule'}
                    </button>
                </div>
            </div>
        </div>
    );
}
