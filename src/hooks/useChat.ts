import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

export interface ChatMessage {
    id: string;
    conversation_id: string;
    sender_id: string;
    sender_name: string;
    sender_role: string;
    content: string | null;
    media_url: string | null;
    media_type: 'image' | 'file' | 'voice' | null;
    media_name: string | null;
    reactions: Record<string, string[]>;
    is_read: boolean;
    is_deleted: boolean;
    created_at: string;
}

export interface Conversation {
    conversation_id: string;
    type: 'dm' | 'group' | 'broadcast';
    name: string | null;
    last_message: ChatMessage | null;
    unread_count: number;
    other_user?: { user_id: string; user_name: string; user_role: string; avatar_url?: string | null } | null;
}

interface UseChatOptions {
    userId: string;
    userName: string;
    userRole: string;
}

export function useChat({ userId, userName, userRole }: UseChatOptions) {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [messages, setMessages]           = useState<Record<string, ChatMessage[]>>({});
    const [activeConvId, setActiveConvId]   = useState<string | null>(null);
    const [unreadTotal, setUnreadTotal]     = useState(0);
    const [typing, setTyping]               = useState<Record<string, string>>({});
    const [onlineIds, setOnlineIds]         = useState<Set<string>>(new Set());
    const [lastSeen, setLastSeen]           = useState<Record<string, number>>({});
    const socketRef = useRef<Socket | null>(null);
    const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

    useEffect(() => {
        const sock = io(SERVER_URL, { transports: ['websocket'], autoConnect: true });
        socketRef.current = sock;

        sock.on('connect', () => {
            sock.emit('register-user', userId);
            sock.emit('presence:subscribe');
        });

        // Presence events
        sock.on('presence:state', ({ onlineIds: ids, lastSeen: seen }: { onlineIds: string[]; lastSeen: Record<string, number> }) => {
            setOnlineIds(new Set(ids));
            setLastSeen(seen);
        });

        sock.on('presence:status', ({ userId: uid, online, lastSeen: ts }: { userId: string; online: boolean; lastSeen?: number }) => {
            setOnlineIds(prev => {
                const next = new Set(prev);
                if (online) next.add(uid);
                else next.delete(uid);
                return next;
            });
            if (!online && ts) {
                setLastSeen(prev => ({ ...prev, [uid]: ts }));
            }
        });

        sock.on('chat:message', (msg: ChatMessage) => {
            setMessages(prev => {
                const existing = prev[msg.conversation_id] || [];
                if (existing.some(m => m.id === msg.id)) return prev;
                return { ...prev, [msg.conversation_id]: [...existing, msg] };
            });
            setConversations(prev => prev.map(c =>
                c.conversation_id === msg.conversation_id
                    ? { ...c, last_message: msg, unread_count: activeConvId === msg.conversation_id ? 0 : c.unread_count + (msg.sender_id !== userId ? 1 : 0) }
                    : c
            ));
        });

        sock.on('chat:notification', ({ conversationId, message }: { conversationId: string; message: ChatMessage }) => {
            setConversations(prev => prev.map(c =>
                c.conversation_id === conversationId
                    ? { ...c, last_message: message, unread_count: c.unread_count + 1 }
                    : c
            ));
        });

        sock.on('chat:typing', ({ senderName }: { senderName: string }) => {
            if (!activeConvId) return;
            setTyping(prev => ({ ...prev, [activeConvId]: senderName }));
            clearTimeout(typingTimers.current[activeConvId]);
            typingTimers.current[activeConvId] = setTimeout(() => {
                setTyping(prev => { const n = { ...prev }; delete n[activeConvId!]; return n; });
            }, 2500);
        });

        sock.on('chat:reaction', ({ messageId, reactions }: { messageId: string; reactions: Record<string, string[]> }) => {
            setMessages(prev => {
                const updated: Record<string, ChatMessage[]> = {};
                for (const [cid, msgs] of Object.entries(prev)) {
                    updated[cid] = msgs.map(m => m.id === messageId ? { ...m, reactions } : m);
                }
                return updated;
            });
        });

        sock.on('chat:deleted', ({ messageId, conversationId }: { messageId: string; conversationId: string }) => {
            setMessages(prev => {
                const msgs = prev[conversationId];
                if (!msgs) return prev;
                return { ...prev, [conversationId]: msgs.filter(m => m.id !== messageId) };
            });
        });

        // Tombstone messages when a user is deleted by admin
        sock.on('chat:messagesTombstoned', ({ conversationId, messageIds }: { conversationId: string; messageIds: string[] }) => {
            const idSet = new Set(messageIds);
            setMessages(prev => {
                const msgs = prev[conversationId];
                if (!msgs) return prev;
                return {
                    ...prev,
                    [conversationId]: msgs.map(m =>
                        idSet.has(m.id) ? { ...m, is_deleted: true, content: null, media_url: null, media_name: null, media_type: null } : m
                    ),
                };
            });
        });

        // Remove a whole conversation when it is deleted
        sock.on('chat:conversationDeleted', ({ conversationId }: { conversationId: string }) => {
            setConversations(prev => prev.filter(c => c.conversation_id !== conversationId));
            setMessages(prev => { const n = { ...prev }; delete n[conversationId]; return n; });
            setActiveConvId(prev => (prev === conversationId ? null : prev));
        });

        return () => { sock.disconnect(); };
    }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Derived unread total ────────────────────────────────────────────────
    useEffect(() => {
        const total = conversations.reduce((s, c) => s + (c.unread_count || 0), 0);
        setUnreadTotal(total);
    }, [conversations]);

    // ── Load conversation list ────────────────────────────────────────────
    const fetchConversations = useCallback(async () => {
        if (!userId) return;
        try {
            // Ensure user is in the broadcast groups for their role
            await ensureBroadcastMembership();
            const res = await fetch(`${SERVER_URL}/api/chat/conversations/${userId}`);
            if (res.ok) setConversations(await res.json());
        } catch { /* ignore */ }
    }, [userId, userRole, userName]); // eslint-disable-line react-hooks/exhaustive-deps

    const ensureBroadcastMembership = async () => {
        const broadcastMap: Record<string, string> = {
            teacher:  '00000000-0000-0000-0000-000000000001',
            student:  '00000000-0000-0000-0000-000000000002',
            admin:    '00000000-0000-0000-0000-000000000003',
        };
        // Everyone always joins "Everyone"; admin joins all 3; others join their own + Everyone
        const groups = ['00000000-0000-0000-0000-000000000003'];
        if (userRole === 'admin') {
            groups.push('00000000-0000-0000-0000-000000000001');
            groups.push('00000000-0000-0000-0000-000000000002');
        } else if (broadcastMap[userRole]) {
            groups.push(broadcastMap[userRole]);
        }

        await Promise.all(groups.map(convId =>
            fetch(`${SERVER_URL}/api/chat/conversations/${convId}/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, userName, userRole }),
            })
        ));
    };

    useEffect(() => { fetchConversations(); }, [fetchConversations]);

    // ── Open conversation ──────────────────────────────────────────────────
    const openConversation = useCallback(async (convId: string) => {
        setActiveConvId(convId);
        socketRef.current?.emit('chat:join', { conversationId: convId });

        if (!messages[convId]) {
            const res = await fetch(`${SERVER_URL}/api/chat/messages/${convId}`);
            if (res.ok) {
                const msgs = await res.json();
                setMessages(prev => ({ ...prev, [convId]: msgs }));
            }
        }
        // Mark as read
        fetch(`${SERVER_URL}/api/chat/conversations/${convId}/read`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId }),
        });
        setConversations(prev => prev.map(c =>
            c.conversation_id === convId ? { ...c, unread_count: 0 } : c
        ));
    }, [messages, userId]);

    // ── Start DM ──────────────────────────────────────────────────────────
    const startDM = useCallback(async (otherId: string, otherName: string, otherRole: string): Promise<string> => {
        const res = await fetch(`${SERVER_URL}/api/chat/conversations/dm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, userRole, userName, otherId, otherRole, otherName }),
        });
        const data = await res.json();
        await fetchConversations();
        return data.id;
    }, [userId, userRole, userName, fetchConversations]);

    // ── Send message ──────────────────────────────────────────────────────
    const sendMessage = useCallback(async (
        convId: string,
        content: string,
        mediaUrl?: string,
        mediaType?: 'image' | 'file' | 'voice',
        mediaName?: string
    ) => {
        if (!content?.trim() && !mediaUrl) return;
        const payload = { conversationId: convId, senderId: userId, senderName: userName, senderRole: userRole, content: content?.trim() || null, mediaUrl: mediaUrl || null, mediaType: mediaType || null, mediaName: mediaName || null };
        socketRef.current?.emit('chat:send', payload);
    }, [userId, userName, userRole]);

    // ── Upload file ───────────────────────────────────────────────────────
    const uploadFile = useCallback(async (file: File): Promise<{ url: string; name: string; type: string }> => {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch(`${SERVER_URL}/api/chat/upload`, { method: 'POST', body: form });
        if (!res.ok) throw new Error('Upload failed');
        return res.json();
    }, []);

    // ── Emit typing ───────────────────────────────────────────────────────
    const emitTyping = useCallback((convId: string) => {
        socketRef.current?.emit('chat:typing', { conversationId: convId, senderName: userName });
    }, [userName]);

    // ── React to message ──────────────────────────────────────────────────
    const reactToMessage = useCallback((messageId: string, emoji: string, convId: string) => {
        socketRef.current?.emit('chat:react', { messageId, userId, emoji, conversationId: convId });
    }, [userId]);
    // ── Delete message ─────────────────────────────────────────────────────
    const deleteMessage = useCallback(async (messageId: string, convId: string) => {
        // Optimistically remove from UI
        setMessages(prev => {
            const msgs = prev[convId];
            if (!msgs) return prev;
            return { ...prev, [convId]: msgs.filter(m => m.id !== messageId) };
        });
        // Call REST (which also cleans up storage)
        await fetch(`${SERVER_URL}/api/chat/messages/${messageId}`, { method: 'DELETE' });
        // Notify others in the room
        socketRef.current?.emit('chat:delete', { messageId, conversationId: convId });
    }, []);

    // ── Delete conversation ────────────────────────────────────────────────
    const deleteConversation = useCallback(async (convId: string) => {
        // Optimistically remove from UI immediately
        setConversations(prev => prev.filter(c => c.conversation_id !== convId));
        setMessages(prev => { const n = { ...prev }; delete n[convId]; return n; });
        setActiveConvId(prev => (prev === convId ? null : prev));
        await fetch(`${SERVER_URL}/api/chat/conversations/${convId}`, { method: 'DELETE' });
    }, []);
    return {
        conversations,
        messages,
        activeConvId,
        setActiveConvId,
        unreadTotal,
        typing,
        onlineIds,
        lastSeen,
        fetchConversations,
        openConversation,
        startDM,
        sendMessage,
        uploadFile,
        emitTyping,
        reactToMessage,
        deleteMessage,
        deleteConversation,
    };
}
