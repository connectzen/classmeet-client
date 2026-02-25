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
    session_image_url?: string;
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
    /** Creator can always join regardless of schedule time */
    isCreator?: boolean;
    /** Visual theme — 'admin' = indigo/purple, 'teacher' = violet/blue */
    sessionType?: 'admin' | 'teacher';
    onJoin: (code: string, id: string, name: string, role: 'teacher' | 'student', title: string) => void;
}

export default function MeetingBanner({ meeting, displayName, userRole, isCreator = false, sessionType = 'admin', onJoin }: Props) {
    const [timeLeft, setTimeLeft] = useState<TimeLeft>(() => calcTimeLeft(meeting.scheduled_at));
    const [lockedWarning, setLockedWarning] = useState(false);

    // Immediately recalculate when scheduled_at changes
    useEffect(() => {
        console.log('🔄 scheduled_at changed for', meeting.title, ':', meeting.scheduled_at);
        const newTimeLeft = calcTimeLeft(meeting.scheduled_at);
        console.log('⏱️ Calculated:', newTimeLeft.isLive ? 'LIVE' : `${newTimeLeft.hours}h ${newTimeLeft.minutes}m ${newTimeLeft.seconds}s`);
        setTimeLeft(newTimeLeft);
    }, [meeting.scheduled_at, meeting.id, meeting.title]);

    // Update countdown every second
    useEffect(() => {
        const id = setInterval(() => setTimeLeft(calcTimeLeft(meeting.scheduled_at)), 1_000);
        return () => clearInterval(id);
    }, [meeting.scheduled_at]);

    const joinRole: 'teacher' | 'student' = (userRole === 'admin' || userRole === 'teacher') ? 'teacher' : 'student';
    const canJoin = timeLeft.isLive || isCreator;

    const isTeacher = sessionType === 'teacher';
    const accentColor  = isTeacher ? '#818cf8' : '#a5b4fc';
    const accentBg     = isTeacher ? 'rgba(99,102,241,0.2)' : 'rgba(129,140,248,0.2)';
    const accentBorder = isTeacher ? 'rgba(99,102,241,0.45)' : 'rgba(129,140,248,0.45)';
    const gradientBg   = isTeacher
        ? 'linear-gradient(135deg, #1e1b4b 0%, #1e3a5f 50%, #1d2e5e 100%)'
        : 'linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #4c1d95 100%)';
    const badgeLabel   = isTeacher ? '📚 Teacher Class' : '🏛️ Admin Meeting';

    const handleJoinClick = () => {
        if (!canJoin) {
            setLockedWarning(true);
            setTimeout(() => setLockedWarning(false), 2500);
            return;
        }
        onJoin(meeting.room_code, meeting.room_id, displayName || 'Attendee', joinRole, meeting.title);
    };

    // Short human-readable time until start for locked tooltip
    const lockedLabel = timeLeft.days > 0
        ? `Starts in ${timeLeft.days}d ${timeLeft.hours}h`
        : timeLeft.hours > 0
        ? `Starts in ${timeLeft.hours}h ${pad(timeLeft.minutes)}m`
        : `Starts in ${pad(timeLeft.minutes)}m ${pad(timeLeft.seconds)}s`;

    return (
        <div style={{
            position: 'relative',
            background: gradientBg,
            border: `1px solid ${accentBorder}`,
            borderRadius: 14,
            padding: '14px 18px',
            marginBottom: 12,
            overflow: 'hidden',
            boxShadow: '0 4px 20px rgba(99,102,241,0.18), 0 2px 6px rgba(0,0,0,0.2)',
        }}>
            {/* Decorative glow blobs */}
            <div style={{
                position: 'absolute', top: -50, right: -50, width: 180, height: 180,
                borderRadius: '50%', background: isTeacher ? 'rgba(99,102,241,0.18)' : 'rgba(139,92,246,0.2)', pointerEvents: 'none',
            }} />
            <div style={{
                position: 'absolute', bottom: -30, left: '25%', width: 110, height: 110,
                borderRadius: '50%', background: 'rgba(99,102,241,0.12)', pointerEvents: 'none',
            }} />

            <div style={{ position: 'relative' }}>

                {/* ── Row 1: Badge (left) + Title (center-right) ────────── */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, paddingRight: isCreator ? 110 : 0 }}>
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: accentBg, border: `1px solid ${accentBorder}`,
                        borderRadius: 100, padding: '2px 10px', fontSize: 9, fontWeight: 700,
                        color: accentColor, letterSpacing: '0.06em', textTransform: 'uppercase',
                    }}>
                        <span style={{ width: 4, height: 4, borderRadius: '50%', background: accentColor, flexShrink: 0 }} />
                        {badgeLabel}
                    </span>

                    <h3 style={{
                        margin: 0,
                        fontSize: 16,
                        fontWeight: 800,
                        color: '#f1f5f9',
                        letterSpacing: '-0.02em',
                    }}>
                        {meeting.title}
                    </h3>
                </div>

                {/* ── Row 2: Horizontal layout with image + content ──────────── */}
                <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
                    {/* Session Image */}
                    {meeting.session_image_url ? (
                        <img
                            src={meeting.session_image_url}
                            alt={meeting.title}
                            style={{
                                width: 130,
                                height: 165,
                                borderRadius: 10,
                                objectFit: 'cover',
                                border: '2px solid rgba(99,102,241,0.3)',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                                flexShrink: 0,
                            }}
                        />
                    ) : (
                        <div style={{
                            width: 130,
                            height: 165,
                            borderRadius: 10,
                            background: 'linear-gradient(135deg, rgba(99,102,241,0.2) 0%, rgba(139,92,246,0.2) 100%)',
                            border: '2px solid rgba(99,102,241,0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                        }}>
                            <div style={{ fontSize: 48, opacity: 0.5 }}>📚</div>
                        </div>
                    )}

                    {/* Description only */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
                        {meeting.description && (
                            <p style={{
                                margin: 0, fontSize: 13, color: '#cbd5e1', lineHeight: 1.6,
                                display: '-webkit-box', WebkitLineClamp: 4,
                                WebkitBoxOrient: 'vertical', overflow: 'hidden',
                            }}>
                                {meeting.description}
                            </p>
                        )}
                    </div>
                </div>

                {/* ── Row 3: HERO countdown (centered) ──────────────────────── */}
                <div style={{ textAlign: 'center', marginBottom: 13 }}>
                    {timeLeft.isLive ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                            <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 8,
                                background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.45)',
                                borderRadius: 100, padding: '8px 22px', fontSize: 15, fontWeight: 700,
                                color: '#fca5a5', letterSpacing: '0.06em',
                                animation: 'meeting-pulse 1.8s ease-in-out infinite',
                            }}>
                                <span style={{
                                    width: 10, height: 10, borderRadius: '50%', background: '#ef4444',
                                    boxShadow: '0 0 8px #ef4444',
                                }} />
                                LIVE NOW
                            </span>
                        </div>
                    ) : (
                        <>
                            <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                                Starts in
                            </div>
                            <div style={{ display: 'inline-flex', gap: 7, alignItems: 'flex-end', justifyContent: 'center' }}>
                                {timeLeft.days > 0 && <HeroUnit value={timeLeft.days} label="days" />}
                                <HeroUnit value={timeLeft.hours} label="hours" />
                                <HeroSep />
                                <HeroUnit value={timeLeft.minutes} label="min" />
                                <HeroSep />
                                <HeroUnit value={timeLeft.seconds} label="sec" />
                            </div>
                        </>
                    )}
                </div>

                {/* ── Row 6: Join button ─────────────────────────────────────── */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <button
                        onClick={handleJoinClick}
                        title={!canJoin ? lockedLabel : undefined}
                        style={{
                            background: !canJoin
                                ? 'rgba(71,85,105,0.5)'
                                : timeLeft.isLive
                                ? 'linear-gradient(135deg,#ef4444,#dc2626)'
                                : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                            color: !canJoin ? '#64748b' : '#fff',
                            border: !canJoin ? '1px solid rgba(71,85,105,0.6)' : 'none',
                            borderRadius: 11,
                            padding: '9px 28px', fontSize: 13, fontWeight: 700,
                            cursor: canJoin ? 'pointer' : 'not-allowed',
                            letterSpacing: '0.02em', whiteSpace: 'nowrap',
                            boxShadow: canJoin
                                ? timeLeft.isLive
                                    ? '0 4px 20px rgba(239,68,68,0.45)'
                                    : '0 4px 20px rgba(99,102,241,0.45)'
                                : 'none',
                            transition: 'filter 0.15s, transform 0.1s, background 0.2s',
                        }}
                        onMouseEnter={e => {
                            if (!canJoin) return;
                            (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.12)';
                            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
                        }}
                        onMouseLeave={e => {
                            (e.currentTarget as HTMLButtonElement).style.filter = 'none';
                            (e.currentTarget as HTMLButtonElement).style.transform = 'none';
                        }}
                    >
                        {!canJoin
                            ? `🔒 ${lockedLabel}`
                            : timeLeft.isLive
                            ? '▶ Join Now'
                            : isCreator
                            ? '🚀 Enter Early (You\'re the host)'
                            : '🚀 Join'}
                    </button>
                    {lockedWarning && (
                        <div style={{
                            fontSize: 12, color: '#f59e0b', fontWeight: 600,
                            background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.3)',
                            borderRadius: 8, padding: '5px 14px',
                            animation: 'meeting-pulse 0.3s ease-in-out',
                        }}>
                            ⚠️ This session hasn't started yet. {lockedLabel}.
                        </div>
                    )}
                </div>
            </div>

            {/* CSS animations */}
            <style>{`
                @keyframes meeting-pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.7; }
                }
            `}</style>
        </div>
    );
}

function HeroUnit({ value, label }: { value: number; label: string }) {
    return (
        <div style={{ textAlign: 'center' }}>
            <div style={{
                background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.4)',
                borderRadius: 11, padding: '7px 11px', minWidth: 46,
                fontSize: 34, fontWeight: 900, color: '#e0e7ff',
                fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.04em', lineHeight: 1,
                textShadow: '0 2px 12px rgba(99,102,241,0.5)',
            }}>
                {pad(value)}
            </div>
            <div style={{ fontSize: 8, color: '#94a3b8', fontWeight: 600, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
        </div>
    );
}

function HeroSep() {
    return (
        <div style={{ fontSize: 28, fontWeight: 900, color: 'rgba(99,102,241,0.6)', lineHeight: 1, marginBottom: 14, userSelect: 'none' }}>:</div>
    );
}
