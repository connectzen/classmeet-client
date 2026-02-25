import { useState, useEffect } from 'react';

export interface AdminMeeting {
    id: string;
    room_code: string;
    room_id: string;
    title: string;
    description: string;
    scheduled_at: string;
    created_by: string;
    max_participants: number;
    is_active: boolean;
}

interface TimeLeft {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isLive: boolean;
    isPast: boolean;
}

function calcTimeLeft(scheduledAt: string): TimeLeft {
    const diff = new Date(scheduledAt).getTime() - Date.now();
    if (diff <= 0) {
        return { days: 0, hours: 0, minutes: 0, seconds: 0, isLive: true, isPast: true };
    }
    return {
        days: Math.floor(diff / 86_400_000),
        hours: Math.floor((diff % 86_400_000) / 3_600_000),
        minutes: Math.floor((diff % 3_600_000) / 60_000),
        seconds: Math.floor((diff % 60_000) / 1_000),
        isLive: false,
        isPast: false,
    };
}

function pad(n: number) { return String(n).padStart(2, '0'); }

interface Props {
    meeting: AdminMeeting;
    displayName: string;
    userRole: 'teacher' | 'student' | 'admin';
    onJoin: (code: string, id: string, name: string, role: 'teacher' | 'student', title: string) => void;
}

export default function MeetingBanner({ meeting, displayName, userRole, onJoin }: Props) {
    const [timeLeft, setTimeLeft] = useState<TimeLeft>(() => calcTimeLeft(meeting.scheduled_at));

    useEffect(() => {
        const id = setInterval(() => setTimeLeft(calcTimeLeft(meeting.scheduled_at)), 1_000);
        return () => clearInterval(id);
    }, [meeting.scheduled_at]);

    const joinRole: 'teacher' | 'student' = userRole === 'admin' ? 'teacher' : 'student';

    return (
        <div style={{
            position: 'relative',
            background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #4c1d95 100%)',
            border: '1px solid rgba(129,140,248,0.35)',
            borderRadius: 20,
            padding: '22px 26px',
            marginBottom: 16,
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(99,102,241,0.25), 0 2px 8px rgba(0,0,0,0.3)',
        }}>
            {/* Decorative glow blobs */}
            <div style={{
                position: 'absolute', top: -40, right: -40, width: 160, height: 160,
                borderRadius: '50%', background: 'rgba(139,92,246,0.2)', pointerEvents: 'none',
            }} />
            <div style={{
                position: 'absolute', bottom: -30, left: '30%', width: 100, height: 100,
                borderRadius: '50%', background: 'rgba(99,102,241,0.15)', pointerEvents: 'none',
            }} />

            <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>

                {/* Left: badge + title + description */}
                <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            background: 'rgba(129,140,248,0.2)', border: '1px solid rgba(129,140,248,0.45)',
                            borderRadius: 100, padding: '3px 12px', fontSize: 11, fontWeight: 700,
                            color: '#a5b4fc', letterSpacing: '0.06em', textTransform: 'uppercase',
                        }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#818cf8', flexShrink: 0 }} />
                            Admin Meeting
                        </span>
                    </div>
                    <h3 style={{
                        margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#f1f5f9',
                        letterSpacing: '-0.02em', lineHeight: 1.25,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                        {meeting.title}
                    </h3>
                    {meeting.description && (
                        <p style={{
                            margin: 0, fontSize: 13, color: '#94a3b8', lineHeight: 1.5,
                            display: '-webkit-box', WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        }}>
                            {meeting.description}
                        </p>
                    )}
                    <div style={{ marginTop: 10, fontSize: 12, color: '#64748b' }}>
                        🗓️ {new Date(meeting.scheduled_at).toLocaleString([], {
                            weekday: 'short', month: 'short', day: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                        })}
                    </div>
                </div>

                {/* Right: timer + join button */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, flexShrink: 0 }}>
                    {/* Timer / Live badge */}
                    {timeLeft.isLive ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.45)',
                                borderRadius: 100, padding: '5px 14px', fontSize: 12, fontWeight: 700,
                                color: '#fca5a5', letterSpacing: '0.06em',
                                animation: 'meeting-pulse 1.8s ease-in-out infinite',
                            }}>
                                <span style={{
                                    width: 8, height: 8, borderRadius: '50%', background: '#ef4444',
                                    boxShadow: '0 0 6px #ef4444',
                                }} />
                                LIVE NOW
                            </span>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                                Starts in
                            </div>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                                {timeLeft.days > 0 && (
                                    <TimeUnit value={timeLeft.days} label="d" />
                                )}
                                <TimeUnit value={timeLeft.hours} label="h" />
                                <TimeUnit value={timeLeft.minutes} label="m" />
                                <TimeUnit value={timeLeft.seconds} label="s" />
                            </div>
                        </div>
                    )}

                    {/* Join button */}
                    <button
                        onClick={() => onJoin(meeting.room_code, meeting.room_id, displayName || 'Attendee', joinRole, meeting.title)}
                        style={{
                            background: timeLeft.isLive
                                ? 'linear-gradient(135deg,#ef4444,#dc2626)'
                                : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                            color: '#fff', border: 'none', borderRadius: 12,
                            padding: '10px 24px', fontSize: 13, fontWeight: 700,
                            cursor: 'pointer', letterSpacing: '0.01em', whiteSpace: 'nowrap',
                            boxShadow: timeLeft.isLive
                                ? '0 4px 16px rgba(239,68,68,0.4)'
                                : '0 4px 16px rgba(99,102,241,0.4)',
                            transition: 'filter 0.15s, transform 0.1s',
                        }}
                        onMouseEnter={e => {
                            (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.15)';
                            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
                        }}
                        onMouseLeave={e => {
                            (e.currentTarget as HTMLButtonElement).style.filter = 'none';
                            (e.currentTarget as HTMLButtonElement).style.transform = 'none';
                        }}
                    >
                        {timeLeft.isLive ? '▶ Join Now' : '→ Join Meeting'}
                    </button>
                </div>
            </div>

            {/* CSS for pulse animation */}
            <style>{`
                @keyframes meeting-pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.7; }
                }
            `}</style>
        </div>
    );
}

function TimeUnit({ value, label }: { value: number; label: string }) {
    return (
        <div style={{ textAlign: 'center' }}>
            <div style={{
                background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)',
                borderRadius: 8, padding: '6px 10px', minWidth: 38,
                fontSize: 20, fontWeight: 800, color: '#c7d2fe', fontVariantNumeric: 'tabular-nums',
                letterSpacing: '-0.02em', lineHeight: 1,
            }}>
                {pad(value)}
            </div>
            <div style={{ fontSize: 10, color: '#475569', fontWeight: 600, marginTop: 3 }}>{label}</div>
        </div>
    );
}
