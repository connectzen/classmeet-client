import { useState, useRef, useEffect } from 'react';
import RichEditor, { RichContent, isRichEmpty } from './RichEditor';

export interface ChatMsg {
    socketId: string;
    name: string;
    message: string;
    timestamp: string;
}

interface Props {
    messages: ChatMsg[];
    mySocketId: string;
    onSend: (msg: string) => void;
    hideHeader?: boolean;
}

export default function ChatPanel({ messages, mySocketId, onSend, hideHeader }: Props) {
    const [text, setText] = useState('');
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = (html?: string) => {
        const content = html ?? text;
        if (isRichEmpty(content)) return;
        onSend(content);
        setText('');
    };

    const formatTime = (iso: string) => {
        try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
        catch { return ''; }
    };

    return (
        <div className="chat-panel">
            {!hideHeader && (
                <div className="chat-header">
                    <span className="chat-icon">💬</span>
                    <span className="chat-title">Chat</span>
                    {messages.length > 0 && <span className="chat-count">{messages.length}</span>}
                </div>
            )}

            <div className="chat-messages">
                {messages.length === 0 && (
                    <p className="chat-empty">No messages yet. Say hi! 👋</p>
                )}
                {messages.map((msg, i) => {
                    const isMe = msg.socketId === mySocketId;
                    return (
                        <div key={i} className={`chat-message ${isMe ? 'chat-message-me' : 'chat-message-other'}`}>
                            {!isMe && <span className="chat-sender">{msg.name}</span>}
                            <div className="chat-bubble">
                                <RichContent html={msg.message} className="chat-msg-rich" />
                            </div>
                            <span className="chat-time">{formatTime(msg.timestamp)}</span>
                        </div>
                    );
                })}
                <div ref={bottomRef} />
            </div>

            <div className="chat-input-row">
                <div style={{ flex: 1 }}>
                    <RichEditor
                        value={text}
                        onChange={setText}
                        onSubmit={handleSend}
                        placeholder="Type a message…"
                        minHeight={40}
                        maxHeight={130}
                        compact
                        chatMode
                        style={{ borderRadius: 10, border: '1px solid rgba(99,102,241,0.25)' }}
                    />
                </div>
                <button className="chat-send-btn" onClick={() => handleSend()} disabled={isRichEmpty(text)}>
                    <svg className="send-icon" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                    </svg>
                </button>
            </div>
        </div>
    );
}
