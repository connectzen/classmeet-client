import { useState, useEffect } from 'react';
import { useUser } from '@insforge/react';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

interface Message {
    id: string;
    sender_name: string;
    content: string;
    is_read: boolean;
    created_at: string;
}

export default function MessagesCard() {
    const { user } = useUser();
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user?.id) return;
        fetch(`${SERVER_URL}/api/messages/${user.id}`)
            .then(r => r.json())
            .then(data => {
                setMessages(data);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [user?.id]);

    const markAsRead = async (id: string) => {
        await fetch(`${SERVER_URL}/api/messages/${id}/read`, { method: 'PATCH' });
        setMessages(prev => prev.map(m => m.id === id ? { ...m, is_read: true } : m));
    };

    if (loading) return <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Loading messages...</div>;
    if (messages.length === 0) return null;

    return (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, marginBottom: 32 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 600 }}>Recent Messages</h3>
            <div style={{ display: 'grid', gap: 12 }}>
                {messages.slice(0, 3).map(m => (
                    <div key={m.id} onClick={() => !m.is_read && markAsRead(m.id)} style={{ background: m.is_read ? 'var(--surface-2)' : 'rgba(99,102,241,0.1)', border: `1px solid ${m.is_read ? 'var(--border)' : 'rgba(99,102,241,0.3)'}`, borderRadius: 12, padding: '14px 18px', cursor: m.is_read ? 'default' : 'pointer', transition: 'all 0.2s' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <div style={{ fontWeight: 600, fontSize: 14, color: m.is_read ? 'var(--text)' : '#a5b4fc' }}>{m.sender_name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(m.created_at).toLocaleDateString()}</div>
                        </div>
                        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>{m.content}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
