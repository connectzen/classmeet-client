import { useState, useRef, useEffect, useCallback } from 'react';
import { useChat, type ChatMessage, type Conversation } from '../hooks/useChat';

export type ChatHookResult = ReturnType<typeof useChat>;

interface Props {
    userId: string;
    userName: string;
    userRole: string;
    /** When true renders full-width (for admin dashboard tab); otherwise slide-over */
    inline?: boolean;
    /** Only used in slide-over mode */
    open?: boolean;
    onClose?: () => void;
    /** Called whenever unread count changes, so the parent can show a badge */
    onUnreadChange?: (count: number) => void;
}

const EMOJI_LIST = ['👍','❤️','😂','😮','😢','🙏'];

export default function ChatDrawer({ userId, userName, userRole, inline, open, onClose, onUnreadChange }: Props) {
    const {
        conversations, messages, activeConvId, unreadTotal,
        typing, openConversation, sendMessage, uploadFile, emitTyping, reactToMessage, fetchConversations, startDM, deleteMessage, deleteConversation,
        chatAllowed, chatRequestStatus, requestChatAccess,
    } = useChat({ userId, userName, userRole });

    // Notify parent of unread count changes
    useEffect(() => { onUnreadChange?.(unreadTotal); }, [unreadTotal, onUnreadChange]);

    const [text, setText]             = useState('');
    const [uploading, setUploading]   = useState(false);
    const [showPicker, setShowPicker] = useState<string | null>(null); // messageId
    const [searchQ, setSearchQ]       = useState('');
    const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null); // messageId pending delete confirm
    const [confirmDeleteConv, setConfirmDeleteConv] = useState<string | null>(null); // convId pending delete confirm
    const [hoveredConvId, setHoveredConvId] = useState<string | null>(null);
    const [stagedFile, setStagedFile] = useState<{ url: string; name: string; type: string; mediaType: 'image'|'file' } | null>(null);
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
    const [pdfViewer, setPdfViewer] = useState<{ url: string; name: string } | null>(null);
    // Mobile long-press action sheet
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [mobileActionMsg, setMobileActionMsg] = useState<{ msgId: string; isMine: boolean; convId: string } | null>(null);
    // Brief flash after re-sending chat access request
    const [resendFlash, setResendFlash] = useState(false);

    // Single-pane mode on phones
    const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
    useEffect(() => {
        const handler = () => setIsMobile(window.innerWidth < 640);
        window.addEventListener('resize', handler);
        return () => window.removeEventListener('resize', handler);
    }, []);
    const [mobileShowThread, setMobileShowThread] = useState(false);
    // Auto-advance to thread pane when a conversation is opened on mobile
    useEffect(() => { if (activeConvId && isMobile) setMobileShowThread(true); }, [activeConvId, isMobile]);

    // New DM people picker
    const [showNewDM, setShowNewDM]       = useState(false);
    const [dmUsers, setDmUsers]           = useState<{ id: string; name: string; email: string; role: string }[]>([]);
    const [loadingDmUsers, setLoadingDmUsers] = useState(false);
    const [dmSearch, setDmSearch]         = useState('');

    const openNewDM = useCallback(async () => {
        setShowNewDM(true);
        setDmSearch('');
        if (dmUsers.length > 0) return;
        setLoadingDmUsers(true);
        try {
            const res = await fetch(`${import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'}/api/all-users`);
            if (res.ok) {
                const all = await res.json() as { id: string; name: string; email: string; role: string }[];
                // Students can only DM teachers; admins/teachers see everyone
                setDmUsers(all.filter(u => {
                    if (u.id === userId || u.role === 'pending') return false;
                    if (userRole === 'student') return u.role === 'teacher';
                    return true;
                }));
            }
        } catch { /* ignore */ }
        setLoadingDmUsers(false);
    }, [userId, userRole, dmUsers.length]);

    const handleStartDM = useCallback(async (u: { id: string; name: string; role: string }) => {
        setShowNewDM(false);
        const convId = await startDM(u.id, u.name, u.role);
        openConversation(convId);
    }, [startDM, openConversation]);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef   = useRef<HTMLInputElement>(null);
    const typingTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Scroll to bottom when active conversation messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, activeConvId]);

    // Close emoji picker when clicking outside
    useEffect(() => {
        if (!showPicker) return;
        const close = () => setShowPicker(null);
        document.addEventListener('click', close);
        return () => document.removeEventListener('click', close);
    }, [showPicker]);

    // Clear staged file when switching conversation
    useEffect(() => { setStagedFile(null); }, [activeConvId]);

    const handleResendRequest = useCallback(async () => {
        await requestChatAccess();
        setResendFlash(true);
        setTimeout(() => setResendFlash(false), 2000);
    }, [requestChatAccess]);

    const activeConv = conversations.find(c => c.conversation_id === activeConvId);
    // Gate applies only when the open conversation is with a teacher
    const activeConvIsTeacher = activeConv?.type === 'dm' && activeConv?.other_user?.user_role === 'teacher';
    const showChatGate = userRole === 'student' && !chatAllowed && activeConvIsTeacher;
    const activeMessages: ChatMessage[] = activeConvId ? (messages[activeConvId] || []) : [];

    const getConvDisplayName = (conv: Conversation) => {
        if (conv.type === 'dm') return conv.other_user?.user_name || 'Unknown';
        return conv.name || 'Group';
    };

    const getConvAvatar = (conv: Conversation) => {
        const name = getConvDisplayName(conv);
        return (name[0] || '?').toUpperCase();
    };

    const getAvatarColor = (conv: Conversation) => {
        switch (conv.type) {
            case 'broadcast': return '#6366f1';
            case 'group':     return '#8b5cf6';
            case 'dm': {
                const role = conv.other_user?.user_role;
                return role === 'teacher' ? '#6366f1' : role === 'admin' ? '#ef4444' : '#22c55e';
            }
        }
    };

    const handleSend = async () => {
        if (!activeConvId) return;
        if (!text.trim() && !stagedFile) return;
        if (stagedFile) {
            await sendMessage(activeConvId, text, stagedFile.url, stagedFile.mediaType, stagedFile.name);
            setStagedFile(null);
        } else {
            await sendMessage(activeConvId, text);
        }
        setText('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    };

    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setText(e.target.value);
        if (activeConvId) {
            emitTyping(activeConvId);
            if (typingTimer.current) clearTimeout(typingTimer.current);
        }
    };

    const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!activeConvId || !e.target.files?.[0]) return;
        const file = e.target.files[0];
        setUploading(true);
        try {
            const { url, name, type } = await uploadFile(file);
            const mediaType: 'image' | 'file' = type.startsWith('image/') ? 'image' : 'file';
            setStagedFile({ url, name, type, mediaType });
        } catch { /* ignore */ }
        setUploading(false);
        e.target.value = '';
    }, [activeConvId, uploadFile]);

    const formatTime = (iso: string) => {
        const d = new Date(iso);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatDateSep = (iso: string) => {
        const d = new Date(iso);
        const today = new Date();
        const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
        if (d.toDateString() === today.toDateString()) return 'Today';
        if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
        return d.toLocaleDateString([], { month: 'long', day: 'numeric' });
    };

    // Group messages by date
    const messagesByDate: { date: string; msgs: ChatMessage[] }[] = [];
    for (const msg of activeMessages) {
        const day = formatDateSep(msg.created_at);
        const last = messagesByDate[messagesByDate.length - 1];
        if (!last || last.date !== day) messagesByDate.push({ date: day, msgs: [msg] });
        else last.msgs.push(msg);
    }

    const filteredConvs = conversations.filter(c => {
        // Students only see DM conversations (no broadcast/group channels)
        if (userRole === 'student' && c.type !== 'dm') return false;
        const name = getConvDisplayName(c).toLowerCase();
        return name.includes(searchQ.toLowerCase());
    });

    const panel = (
        <div style={{ display: 'flex', height: '100%', background: 'var(--bg)', overflow: 'hidden', borderRadius: inline ? 0 : 20 }}>

            {/* ── LEFT: Conversation List ─────────────────────────────── */}
            <div style={{
                width: isMobile ? '100%' : 300, flexShrink: 0, display: (isMobile && mobileShowThread) ? 'none' : 'flex', flexDirection: 'column',
                borderRight: isMobile ? 'none' : '1px solid var(--border)', background: 'var(--surface)',
                position: 'relative',
            }}>
                {/* Header */}
                <div style={{ padding: '16px 16px 8px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <span style={{ fontWeight: 700, fontSize: 16 }}>Messages</span>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <button onClick={fetchConversations} title="Refresh" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: '4px 6px', borderRadius: 8, lineHeight: 1 }}>↻</button>
                            <button onClick={openNewDM} title="New Message"
                                style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#6366f1', border: 'none', borderRadius: 20, padding: '5px 12px 5px 8px', cursor: 'pointer', color: '#fff', fontSize: 12, fontWeight: 600, lineHeight: 1 }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                                New
                            </button>
                        </div>
                    </div>
                    <input
                        placeholder="Search conversations…"
                        value={searchQ}
                        onChange={e => setSearchQ(e.target.value)}
                        style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '7px 12px', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                    />
                </div>

                {/* New DM people picker overlay */}
                {showNewDM && (
                    <div style={{ position: 'absolute', top: 0, left: 0, width: 300, height: '100%', background: 'var(--surface)', zIndex: 10, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)' }}>
                        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                            <button onClick={() => setShowNewDM(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18, lineHeight: 1 }}>←</button>
                            <span style={{ fontWeight: 700, fontSize: 15 }}>New Message</span>
                        </div>
                        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                            <input
                                autoFocus
                                placeholder="Search people…"
                                value={dmSearch}
                                onChange={e => setDmSearch(e.target.value)}
                                style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '7px 12px', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                            />
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            {loadingDmUsers ? (
                                <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 20 }}>Loading…</p>
                            ) : (
                                dmUsers
                                    .filter(u => (u.name || u.email).toLowerCase().includes(dmSearch.toLowerCase()))
                                    .map(u => (
                                        <div key={u.id} onClick={() => handleStartDM(u)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', cursor: 'pointer', transition: 'background 0.15s' }}
                                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                            <div style={{ width: 38, height: 38, borderRadius: '50%', background: u.role === 'teacher' ? 'rgba(99,102,241,0.15)' : 'rgba(34,197,94,0.15)', border: `2px solid ${u.role === 'teacher' ? '#6366f1' : '#22c55e'}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, color: u.role === 'teacher' ? '#6366f1' : '#22c55e', flexShrink: 0 }}>
                                                {(u.name || u.email)[0].toUpperCase()}
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{u.name || u.email}</div>
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, textTransform: 'capitalize' }}>{u.role}</div>
                                            </div>
                                        </div>
                                    ))
                            )}
                            {!loadingDmUsers && dmUsers.filter(u => (u.name || u.email).toLowerCase().includes(dmSearch.toLowerCase())).length === 0 && (
                                <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 20 }}>No people found</p>
                            )}
                        </div>
                    </div>
                )}

                {/* Conversations */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {filteredConvs.length === 0 && (
                        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 24 }}>No conversations yet</p>
                    )}
                    {filteredConvs.map(conv => {
                        const isActive = conv.conversation_id === activeConvId;
                        const canDelete = conv.type === 'dm'; // only allow deleting DM conversations
                        return (
                            <div
                                key={conv.conversation_id}
                                onClick={() => openConversation(conv.conversation_id)}
                                onMouseEnter={() => setHoveredConvId(conv.conversation_id)}
                                onMouseLeave={() => setHoveredConvId(null)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer',
                                    background: isActive ? 'linear-gradient(135deg,rgba(99,102,241,0.15),rgba(139,92,246,0.08))' : 'transparent',
                                    borderLeft: isActive ? '3px solid #6366f1' : '3px solid transparent',
                                    transition: 'background 0.15s', position: 'relative',
                                }}
                                onMouseOver={e => !isActive && ((e.currentTarget as HTMLElement).style.background = 'var(--surface-2)')}
                                onMouseOut={e => !isActive && ((e.currentTarget as HTMLElement).style.background = 'transparent')}
                            >
                                {/* Avatar */}
                                <div style={{ width: 42, height: 42, borderRadius: '50%', background: `${getAvatarColor(conv)}22`, border: `2px solid ${getAvatarColor(conv)}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, color: getAvatarColor(conv), flexShrink: 0, position: 'relative' }}>
                                    {conv.type === 'broadcast' || conv.type === 'group' ? (conv.type === 'broadcast' ? '📢' : '#') : getConvAvatar(conv)}
                                    {conv.unread_count > 0 && (
                                        <div style={{ position: 'absolute', top: -4, right: -4, background: '#6366f1', color: '#fff', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
                                            {conv.unread_count > 9 ? '9+' : conv.unread_count}
                                        </div>
                                    )}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                                            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 110 }}>
                                                {getConvDisplayName(conv)}
                                            </span>
                                            {conv.type === 'dm' && conv.other_user?.user_role && (
                                                <span style={{
                                                    fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 20,
                                                    background: conv.other_user.user_role === 'teacher' ? 'rgba(99,102,241,0.15)' : conv.other_user.user_role === 'admin' ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                                                    color: conv.other_user.user_role === 'teacher' ? '#818cf8' : conv.other_user.user_role === 'admin' ? '#f87171' : '#4ade80',
                                                    flexShrink: 0, textTransform: 'capitalize', letterSpacing: '0.02em',
                                                }}>
                                                    {conv.other_user.user_role}
                                                </span>
                                            )}
                                        </div>
                                        {conv.last_message && (
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{formatTime(conv.last_message.created_at)}</span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {conv.last_message
                                            ? (conv.last_message.is_deleted ? '🚫 Message removed' : conv.last_message.media_type ? `📎 ${conv.last_message.media_name || 'Attachment'}` : conv.last_message.content || '…')
                                            : 'No messages yet'
                                        }
                                    </div>
                                </div>
                                {/* Delete conversation button — visible on hover */}
                                {canDelete && hoveredConvId === conv.conversation_id && (
                                    <button
                                        onClick={e => { e.stopPropagation(); setConfirmDeleteConv(conv.conversation_id); }}
                                        title="Delete conversation"
                                        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '4px 8px', cursor: 'pointer', color: '#ef4444', fontSize: 13, lineHeight: 1, flexShrink: 0 }}
                                    >
                                        🗑
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── RIGHT: Message Thread ───────────────────────────────── */}
            <div style={{ flex: 1, display: (isMobile && !mobileShowThread) ? 'none' : 'flex', flexDirection: 'column', minWidth: 0 }}>
                {!activeConvId ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                        <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>💬</div>
                        <div style={{ fontSize: 15, fontWeight: 500 }}>Select a conversation</div>
                        <div style={{ fontSize: 13, marginTop: 4 }}>Choose from the left to start chatting</div>
                    </div>
                ) : (
                    <>
                        {/* Thread header */}
                        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', flexShrink: 0 }}>
                            {isMobile && (
                                <button onClick={() => setMobileShowThread(false)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 22, lineHeight: 1, padding: '0 4px', flexShrink: 0 }}>
                                    ←
                                </button>
                            )}
                            {activeConv && (
                                <>
                                    <div style={{ width: 38, height: 38, borderRadius: '50%', background: `${getAvatarColor(activeConv)}22`, border: `2px solid ${getAvatarColor(activeConv)}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: getAvatarColor(activeConv), flexShrink: 0 }}>
                                        {activeConv.type === 'broadcast' ? '📢' : activeConv.type === 'group' ? '#' : getConvAvatar(activeConv)}
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: 15 }}>{getConvDisplayName(activeConv)}</div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                            {activeConv.type === 'broadcast' ? 'Broadcast channel' : activeConv.type === 'group' ? 'Group' : `${activeConv.other_user?.user_role || 'user'}`}
                                        </div>
                                    </div>
                                </>
                            )}
                            {typing[activeConvId] && (
                                <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6366f1', fontStyle: 'italic' }}>{typing[activeConvId]} is typing…</div>
                            )}
                        </div>

                        {/* Messages */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {activeMessages.length === 0 && (
                                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, marginTop: 40 }}>No messages yet. Say hello! 👋</div>
                            )}
                            {messagesByDate.map(({ date, msgs }) => (
                                <div key={date}>
                                    {/* Date separator */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0 8px' }}>
                                        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{date}</span>
                                        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                                    </div>
                                    {msgs.map((msg, idx) => {
                                        const isMine = msg.sender_id === userId;
                                        const showName = !isMine && (activeConv?.type !== 'dm');
                                        const prevMsg = idx > 0 ? msgs[idx - 1] : null;
                                        const groupWithPrev = prevMsg && prevMsg.sender_id === msg.sender_id;

                                        // Tombstone for deleted-user messages
                                        if (msg.is_deleted) {
                                            return (
                                                <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start', marginTop: groupWithPrev ? 2 : 10 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--surface-2)', border: '1px dashed var(--border)', borderRadius: 14, color: 'var(--text-muted)', fontSize: 12, fontStyle: 'italic', maxWidth: '70%' }}>
                                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                                                        This message was removed
                                                    </div>
                                                </div>
                                            );
                                        }
                                        return (
                                            <div
                                                key={msg.id}
                                                style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start', marginTop: groupWithPrev ? 2 : 10 }}
                                                onMouseEnter={() => !isMobile && setHoveredMsgId(msg.id)}
                                                onMouseLeave={() => !isMobile && setHoveredMsgId(null)}
                                                onTouchStart={() => {
                                                    longPressTimer.current = setTimeout(() => {
                                                        setMobileActionMsg({ msgId: msg.id, isMine, convId: msg.conversation_id });
                                                    }, 450);
                                                }}
                                                onTouchEnd={() => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } }}
                                                onTouchMove={() => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } }}
                                            >
                                                {showName && !groupWithPrev && (
                                                    <span style={{ fontSize: 11, fontWeight: 600, color: getBubbleAccent(msg.sender_role), marginBottom: 3, paddingLeft: 12 }}>{msg.sender_name}</span>
                                                )}
                                                {/* Flex row: action strip + bubble are siblings — mouse never leaves the zone */}
                                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, flexDirection: isMine ? 'row-reverse' : 'row', maxWidth: '80%' }}>

                                                    {/* Bubble + meta */}
                                                    <div style={{ minWidth: 0, flex: '0 1 auto' }}>
                                                        <div style={{
                                                            background: isMine ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'var(--surface)',
                                                            color: isMine ? '#fff' : 'var(--text)',
                                                            borderRadius: isMine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                                                            padding: msg.media_type === 'image' ? '4px' : '10px 14px',
                                                            border: isMine ? 'none' : '1px solid var(--border)',
                                                            boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                                                            wordBreak: 'break-word',
                                                        }}>
                                                            {msg.media_type === 'image' && msg.media_url && (
                                                                <img src={msg.media_url} alt={msg.media_name || 'image'}
                                                                    onClick={() => setLightboxUrl(msg.media_url!)}
                                                                    style={{ maxWidth: 240, maxHeight: 200, borderRadius: 14, display: 'block', cursor: 'zoom-in' }}
                                                                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                                />
                                                            )}
                                                            {msg.media_type === 'file' && msg.media_url && (() => {
                                                                const isPdf = (msg.media_name || '').toLowerCase().endsWith('.pdf');
                                                                return isPdf ? (
                                                                    <button onClick={() => setPdfViewer({ url: msg.media_url!, name: msg.media_name || 'document.pdf' })}
                                                                        style={{ display: 'flex', alignItems: 'center', gap: 8, color: isMine ? '#fff' : '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: 0, textAlign: 'left' }}>
                                                                        <span style={{ fontSize: 24 }}>📄</span>
                                                                        <div style={{ minWidth: 0 }}>
                                                                            <div style={{ wordBreak: 'break-all', maxWidth: 180 }}>{msg.media_name || 'document.pdf'}</div>
                                                                            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>Tap to read</div>
                                                                        </div>
                                                                    </button>
                                                                ) : (
                                                                    <a href={msg.media_url} target="_blank" rel="noopener noreferrer"
                                                                        style={{ display: 'flex', alignItems: 'center', gap: 8, color: isMine ? '#fff' : '#6366f1', textDecoration: 'none', fontSize: 13 }}>
                                                                        <span style={{ fontSize: 24 }}>📎</span>
                                                                        <span style={{ wordBreak: 'break-all', maxWidth: 180 }}>{msg.media_name || 'Download file'}</span>
                                                                    </a>
                                                                );
                                                            })()}
                                                            {msg.content && <span style={{ fontSize: 14, lineHeight: 1.5 }}>{msg.content}</span>}
                                                        </div>

                                                        {/* Time + read tick */}
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, justifyContent: isMine ? 'flex-end' : 'flex-start', paddingRight: 2, paddingLeft: 2 }}>
                                                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{formatTime(msg.created_at)}</span>
                                                            {isMine && <span style={{ fontSize: 11, color: msg.is_read ? '#6366f1' : 'var(--text-muted)' }}>{msg.is_read ? '✓✓' : '✓'}</span>}
                                                        </div>

                                                        {/* Reactions */}
                                                        {Object.keys(msg.reactions || {}).length > 0 && (
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4, justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                                                                {Object.entries(msg.reactions).map(([emoji, users]) => (
                                                                    <button key={emoji} onClick={() => reactToMessage(msg.id, emoji, msg.conversation_id)}
                                                                        style={{ background: users.includes(userId) ? 'rgba(99,102,241,0.2)' : 'var(--surface)', border: `1px solid ${users.includes(userId) ? '#6366f1' : 'var(--border)'}`, borderRadius: 100, padding: '2px 8px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                                        {emoji} <span style={{ fontSize: 11 }}>{users.length}</span>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Action strip — desktop hover only */}
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 4, flexShrink: 0, visibility: (!isMobile && hoveredMsgId === msg.id) ? 'visible' : 'hidden' }}>
                                                        {/* Emoji reaction */}
                                                        <div style={{ position: 'relative' }}>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setShowPicker(showPicker === msg.id ? null : msg.id); }}
                                                                style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 14 }}>😊</button>
                                                            {showPicker === msg.id && (
                                                                <div onClick={(e) => e.stopPropagation()}
                                                                    style={{ position: 'absolute', top: 0, [isMine ? 'right' : 'left']: 34, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '6px 8px', display: 'flex', gap: 6, zIndex: 100, boxShadow: '0 4px 20px rgba(0,0,0,0.25)', whiteSpace: 'nowrap' }}>
                                                                    {EMOJI_LIST.map(e => (
                                                                        <button key={e} onClick={() => { reactToMessage(msg.id, e, msg.conversation_id); setShowPicker(null); }}
                                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: 2 }}>{e}</button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                        {/* Delete — own messages or admin */}
                                                        {(isMine || userRole === 'admin') && (
                                                            <button onClick={() => setConfirmDelete(msg.id)} title="Delete message"
                                                                style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#ef4444' }}>
                                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Bar / Chat Gate */}
                        {showChatGate ? (
                            <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
                                    <span style={{ fontSize: 18 }}>🔒</span>
                                    <span>Chat requires teacher permission</span>
                                </div>
                                {chatRequestStatus === 'pending' && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: '5px 12px', fontSize: 12, color: '#f59e0b', fontWeight: 600 }}>
                                        <span>⏳</span>
                                        <span>Request pending — awaiting approval</span>
                                    </div>
                                )}
                                {resendFlash && (
                                    <div style={{ fontSize: 12, color: '#22c55e', fontWeight: 600 }}>✓ Request sent again!</div>
                                )}
                                <button onClick={handleResendRequest}
                                    style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 24px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: resendFlash ? 0.7 : 1, transition: 'opacity 0.2s' }}>
                                    {chatRequestStatus === 'pending' ? '↻ Send Again' : 'Request Chat Access'}
                                </button>
                            </div>
                        ) : (
                        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
                            {/* Staged file preview strip */}
                            {stagedFile && (
                                <div style={{ marginBottom: 8, padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                                    {stagedFile.mediaType === 'image' ? (
                                        <img src={stagedFile.url} alt={stagedFile.name} style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
                                    ) : (
                                        <div style={{ width: 52, height: 52, borderRadius: 8, background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0 }}>
                                            {(stagedFile.name || '').toLowerCase().endsWith('.pdf') ? '📄' : '📎'}
                                        </div>
                                    )}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stagedFile.name}</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, textTransform: 'capitalize' }}>{stagedFile.mediaType} · ready to send</div>
                                    </div>
                                    <button onClick={() => setStagedFile(null)} title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18, lineHeight: 1, padding: '2px 4px', flexShrink: 0 }}>✕</button>
                                </div>
                            )}
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, background: 'var(--surface-2)', borderRadius: 16, padding: '8px 12px', border: '1px solid var(--border)' }}>
                                {/* File attach */}
                                <button onClick={() => fileInputRef.current?.click()} title="Attach file or image" disabled={!!stagedFile || uploading}
                                    style={{ background: 'none', border: 'none', cursor: (stagedFile || uploading) ? 'default' : 'pointer', color: (stagedFile || uploading) ? 'var(--border)' : 'var(--text-muted)', fontSize: 20, padding: '2px 4px', flexShrink: 0, lineHeight: 1 }}>
                                    {uploading ? '⏳' : '📎'}
                                </button>
                                <input ref={fileInputRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip" style={{ display: 'none' }} onChange={handleFileChange} />

                                <textarea
                                    value={text}
                                    onChange={handleTextChange}
                                    onKeyDown={handleKeyDown}
                                    placeholder={stagedFile ? 'Add a caption… (optional)' : 'Type a message…'}
                                    rows={1}
                                    style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 14, resize: 'none', maxHeight: 120, fontFamily: 'inherit', lineHeight: 1.5, paddingTop: 2 }}
                                />

                                <button onClick={handleSend}
                                    disabled={!text.trim() && !stagedFile}
                                    style={{ background: (text.trim() || stagedFile) ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'var(--surface-3)', border: 'none', borderRadius: 12, width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: (text.trim() || stagedFile) ? 'pointer' : 'default', flexShrink: 0, transition: 'background 0.2s' }}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                                </button>
                            </div>
                        </div>
                        )}
                    </>
                )}
            </div>

            {/* ── Mobile long-press action sheet ── */}
            {mobileActionMsg && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
                    onClick={() => setMobileActionMsg(null)}>
                    <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: '20px 20px 0 0', padding: '20px 20px 32px', boxShadow: '0 -8px 40px rgba(0,0,0,0.4)' }}>
                        {/* Drag handle */}
                        <div style={{ width: 40, height: 4, background: 'var(--border)', borderRadius: 2, margin: '0 auto 20px' }} />
                        {/* Emoji reactions */}
                        <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 20, padding: '12px 0', background: 'var(--surface-2)', borderRadius: 16 }}>
                            {EMOJI_LIST.map(e => (
                                <button key={e} onClick={() => { reactToMessage(mobileActionMsg.msgId, e, mobileActionMsg.convId); setMobileActionMsg(null); }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 28, padding: '4px 6px' }}>{e}</button>
                            ))}
                        </div>
                        {/* Delete option */}
                        {(mobileActionMsg.isMine || userRole === 'admin') && (
                            <button onClick={() => { setConfirmDelete(mobileActionMsg.msgId); setMobileActionMsg(null); }}
                                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 14, padding: '14px 18px', cursor: 'pointer', color: '#ef4444', fontSize: 14, fontWeight: 600 }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                                Delete Message
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );

    // Inline (full-width, no wrapper) — for admin dashboard
    if (inline) {
        return (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', position: 'relative' }}>
                {panel}
                {confirmDelete && <DeleteConfirm onConfirm={() => { deleteMessage(confirmDelete, activeConvId!); setConfirmDelete(null); }} onCancel={() => setConfirmDelete(null)} />}
                {confirmDeleteConv && <DeleteConfirm message="Delete this entire conversation? All messages and files will be permanently removed." onConfirm={() => { deleteConversation(confirmDeleteConv); setConfirmDeleteConv(null); }} onCancel={() => setConfirmDeleteConv(null)} />}
                {lightboxUrl && <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
                {pdfViewer && <PdfViewer url={pdfViewer.url} name={pdfViewer.name} onClose={() => setPdfViewer(null)} />}
            </div>
        );
    }

    // Slide-over drawer
    return (
        <>
            {/* Backdrop */}
            {open && (
                <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 999, backdropFilter: 'blur(2px)' }} />
            )}
            <div style={{
                position: 'fixed', top: 0, right: 0, height: '100vh',
                width: 'min(740px,96vw)',
                background: 'var(--bg)',
                borderLeft: '1px solid var(--border)',
                zIndex: 1000,
                transform: open ? 'translateX(0)' : 'translateX(100%)',
                transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
                display: 'flex', flexDirection: 'column',
                boxShadow: '-8px 0 40px rgba(0,0,0,0.3)',
            }}>
                {/* Drawer header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 20 }}>💬</span>
                        <span style={{ fontWeight: 700, fontSize: 16 }}>Chat</span>
                        {unreadTotal > 0 && (
                            <span style={{ background: '#6366f1', color: '#fff', borderRadius: 100, padding: '2px 8px', fontSize: 12, fontWeight: 700 }}>{unreadTotal}</span>
                        )}
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 22, lineHeight: 1 }}>✕</button>
                </div>
                <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                    {panel}
                    {confirmDelete && <DeleteConfirm onConfirm={() => { deleteMessage(confirmDelete, activeConvId!); setConfirmDelete(null); }} onCancel={() => setConfirmDelete(null)} />}
                    {confirmDeleteConv && <DeleteConfirm message="Delete this entire conversation? All messages and files will be permanently removed." onConfirm={() => { deleteConversation(confirmDeleteConv); setConfirmDeleteConv(null); }} onCancel={() => setConfirmDeleteConv(null)} />}
                </div>
                {lightboxUrl && <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
                {pdfViewer && <PdfViewer url={pdfViewer.url} name={pdfViewer.name} onClose={() => setPdfViewer(null)} />}
            </div>
        </>
    );
}

function getBubbleAccent(role: string) {
    switch (role) {
        case 'teacher': return '#a5b4fc';
        case 'admin':   return '#ef4444';
        default:        return '#22c55e';
    }
}

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);
    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)' }}>
            <button onClick={onClose} style={{ position: 'absolute', top: 20, right: 24, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 20, cursor: 'pointer', lineHeight: 1, width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            <img src={url} alt="" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '92vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8, boxShadow: '0 12px 60px rgba(0,0,0,0.6)' }} />
        </div>
    );
}

function PdfViewer({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState(false);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    useEffect(() => {
        let objUrl = '';
        setLoading(true); setFetchError(false); setBlobUrl(null);
        fetch(url)
            .then(r => { if (!r.ok) throw new Error('fetch failed'); return r.blob(); })
            .then(blob => {
                objUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
                setBlobUrl(objUrl);
                setLoading(false);
            })
            .catch(() => { setFetchError(true); setLoading(false); });
        return () => { if (objUrl) URL.revokeObjectURL(objUrl); };
    }, [url]);

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
                <span style={{ fontSize: 20 }}>📄</span>
                <span style={{ fontWeight: 600, fontSize: 14, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                <a href={url} download={name} style={{ color: '#6366f1', fontSize: 13, fontWeight: 600, textDecoration: 'none', padding: '6px 14px', border: '1px solid #6366f1', borderRadius: 8 }}>⬇ Download</a>
                <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 22, cursor: 'pointer', lineHeight: 1, marginLeft: 4 }}>✕</button>
            </div>
            {/* States */}
            {loading && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text-muted)' }}>
                    <div style={{ width: 36, height: 36, border: '3px solid var(--border)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    <span style={{ fontSize: 14 }}>Loading PDF…</span>
                </div>
            )}
            {fetchError && !loading && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                    <span style={{ fontSize: 36 }}>😕</span>
                    <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>Could not preview this PDF in the browser.</div>
                    <a href={url} download={name} style={{ background: '#6366f1', color: '#fff', padding: '10px 28px', borderRadius: 10, textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>⬇ Download to read</a>
                </div>
            )}
            {blobUrl && !loading && !fetchError && (
                <iframe src={`${blobUrl}#toolbar=1&navpanes=0&scrollbar=1&zoom=page-width&view=FitH`} style={{ flex: 1, border: 'none', width: '100%', height: '100%' }} title={name} />
            )}
        </div>
    );
}

function DeleteConfirm({ onConfirm, onCancel, message }: { onConfirm: () => void; onCancel: () => void; message?: string }) {
    return (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '24px 28px', maxWidth: 320, width: '90%', textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🗑️</div>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Delete?</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>{message || 'This will permanently remove the message and any attached file.'}</div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                    <button onClick={onCancel}
                        style={{ flex: 1, padding: '9px 0', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Cancel</button>
                    <button onClick={onConfirm}
                        style={{ flex: 1, padding: '9px 0', background: '#ef4444', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#fff' }}>Delete</button>
                </div>
            </div>
        </div>
    );
}
