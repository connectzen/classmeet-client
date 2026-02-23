import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

interface Message {
    id: string;
    sender_name: string;
    subject: string;
    content: string;
    is_read: boolean;
    created_at: string;
}

interface Props {
    userId: string;
    userRole: string;
}

export default function InboxPanel({ userId, userRole: _userRole }: Props) {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const socketRef = useRef<Socket | null>(null);

    const fetchMessages = useCallback(async () => {
        const res = await fetch(`${SERVER_URL}/api/messages/${userId}`);
        if (res.ok) setMessages(await res.json());
    }, [userId]);

    useEffect(() => {
        if (!userId) return;
        fetchMessages();
        const socket = io(SERVER_URL);
        socketRef.current = socket;
        socket.on('connect', () => socket.emit('register-user', userId));
        socket.on('new-message', () => fetchMessages());
        return () => { socket.disconnect(); };
    }, [userId, fetchMessages]);

    const markRead = useCallback(async (id: string) => {
        await fetch(`${SERVER_URL}/api/messages/${id}/read`, { method: 'PATCH' });
        setMessages(prev => prev.map(m => m.id === id ? { ...m, is_read: true } : m));
    }, []);

    const toggleExpand = (id: string) => {
        if (expandedId === id) { setExpandedId(null); return; }
        setExpandedId(id);
        const msg = messages.find(m => m.id === id);
        if (msg && !msg.is_read) markRead(id);
    };

    const unread = messages.filter(m => !m.is_read).length;

    return (
        <>
            <button onClick={() => setOpen(o => !o)} style={{ position: 'relative', padding: 8, borderRadius: 8, background: 'transparent', border: 'none', cursor: 'pointer' }}
                title={`Inbox (${unread} unread)`}>
                <span style={{ fontSize: 18 }}>🔔</span>
                {unread > 0 && (
                    <span style={{ position: 'absolute', top: -2, right: -2, width: 16, height: 16, background: '#ef4444', borderRadius: '50%', fontSize: 9, fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                        {unread > 9 ? '9+' : unread}
                    </span>
                )}
            </button>

            {open && (
                <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
                    <div style={{ position: 'fixed', top: 64, right: 16, zIndex: 50, width: 320, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 10px 25px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Inbox</h3>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{messages.length} message{messages.length !== 1 ? 's' : ''}</span>
                        </div>
                        <div style={{ maxHeight: 384, overflowY: 'auto' }}>
                            {messages.length === 0 ? (
                                <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '32px 0', margin: 0 }}>No messages yet.</p>
                            ) : messages.map(m => (
                                <div key={m.id} style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border)', background: !m.is_read ? 'rgba(99,102,241,0.1)' : 'transparent' }}
                                    onClick={() => toggleExpand(m.id)}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                {!m.is_read && <span style={{ width: 6, height: 6, background: '#8b5cf6', borderRadius: '50%', flexShrink: 0 }} />}
                                                <p style={{ margin: 0, fontSize: 12, fontWeight: !m.is_read ? 600 : 400, color: !m.is_read ? 'var(--text)' : 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {m.subject || '(no subject)'}
                                                </p>
                                            </div>
                                            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>From: {m.sender_name}</p>
                                        </div>
                                        <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{new Date(m.created_at).toLocaleDateString()}</p>
                                    </div>
                                    {expandedId === m.id && (
                                        <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{m.content}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </>
    );
}
