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
    /** Creator can always join regardless of schedule time */
    isCreator?: boolean;
    /** Visual theme — 'admin' = indigo/purple, 'teacher' = violet/blue */
    sessionType?: 'admin' | 'teacher';
    onJoin: (code: string, id: string, name: string, role: 'teacher' | 'student', title: string) => void;
    /** Teacher profile data for display */
    teacherProfile?: {
        name: string;
        avatar_url?: string;
    };
}

export default function MeetingBanner({ meeting, displayName, userRole, isCreator = false, sessionType = 'admin', onJoin, teacherProfile }: Props) {
    const [timeLeft, setTimeLeft] = useState<TimeLeft>(() => calcTimeLeft(meeting.scheduled_at));
    const [lockedWarning, setLockedWarning] = useState(false);

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

    // Calculate initials for teacher avatar fallback
    const teacherInitials = teacherProfile?.name
        ? teacherProfile.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
        : '👤';

    return (
        <div style={{
            position: 'relative',
            background: gradientBg,
            border: `1px solid ${accentBorder}`,
            borderRadius: 20,
            padding: '24px 28px',
            marginBottom: 16,
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(99,102,241,0.25), 0 2px 8px rgba(0,0,0,0.3)',
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

                {/* ── Row 1: badge (left) ───────────────────────── */}
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        background: accentBg, border: `1px solid ${accentBorder}`,
                        borderRadius: 100, padding: '4px 14px', fontSize: 11, fontWeight: 700,
                        color: accentColor, letterSpacing: '0.06em', textTransform: 'uppercase',
                    }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: accentColor, flexShrink: 0 }} />
                        {badgeLabel}
                    </span>
                </div>

                {/* ── Row 2: title + description + teacher profile ────────────────── */}
                <div style={{ display: 'flex', gap: 20, marginBottom: 24, alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 style={{
                            margin: '0 0 6px', fontSize: 20, fontWeight: 800, color: '#f1f5f9',
                            letterSpacing: '-0.02em', lineHeight: 1.2,
                        }}>
                            {meeting.title}
                        </h3>
                        {meeting.description && (
                            <p style={{
                                margin: 0, fontSize: 13, color: '#94a3b8', lineHeight: 1.55,
                                display: '-webkit-box', WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical', overflow: 'hidden',
                            }}>
                                {meeting.description}
                            </p>
                        )}
                    </div>
                    
                    {/* Teacher Profile Display */}
                    {teacherProfile && (
                        <div style={{ 
                            display: 'flex', 
                            flexDirection: 'column', 
                            alignItems: 'center', 
                            gap: 8,
                            padding: '12px 16px',
                            background: 'rgba(99,102,241,0.12)',
                            borderRadius: 14,
                            border: '1px solid rgba(99,102,241,0.25)',
                            minWidth: 100,
                        }}>
                            {teacherProfile.avatar_url ? (
                                <img
                                    src={teacherProfile.avatar_url}
                                    alt={teacherProfile.name}
                                    style={{
                                        width: 52,
                                        height: 52,
                                        borderRadius: '50%',
                                        objectFit: 'cover',
                                        border: '2px solid rgba(99,102,241,0.5)',
                                    }}
                                />
                            ) : (
                                <div style={{
                                    width: 52,
                                    height: 52,
                                    borderRadius: '50%',
                                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#fff',
                                    fontWeight: 700,
                                    fontSize: 18,
                                    border: '2px solid rgba(99,102,241,0.5)',
                                }}>
                                    {teacherInitials}
                                </div>
                            )}
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ 
                                    fontSize: 12, 
                                    fontWeight: 600, 
                                    color: '#cbd5e1',
                                    marginBottom: 2,
                                }}>
                                    {teacherProfile.name}
                                </div>
                                <div style={{ 
                                    fontSize: 10, 
                                    color: '#64748b',
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                }}>
                                    Instructor
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Row 3: Date/Time CENTERED ─────────── */}
                <div style={{ textAlign: 'center', marginBottom: 22 }}>
                    <div style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: 8,
                        background: 'rgba(99,102,241,0.15)',
                        border: '1px solid rgba(99,102,241,0.3)',
                        borderRadius: 10,
                        padding: '10px 20px',
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#cbd5e1',
                    }}>
                        🗓️ {new Date(meeting.scheduled_at).toLocaleString([], {
                            weekday: 'short', month: 'short', day: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                        })}
                    </div>
                </div>

                {/* ── Row 4: HERO countdown (centered) ─────────── */}
                <div style={{ textAlign: 'center', marginBottom: 22 }}>
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
                            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
                                Starts in
                            </div>
                            <div style={{ display: 'inline-flex', gap: 10, alignItems: 'flex-end', justifyContent: 'center' }}>
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

                {/* ── Row 5: Join button ────────────────────────── */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
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
                            borderRadius: 14,
                            padding: '12px 36px', fontSize: 14, fontWeight: 700,
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
                            ? '→ Enter Early (You\'re the host)'
                            : '→ Join'}
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
                borderRadius: 14, padding: '10px 16px', minWidth: 58,
                fontSize: 48, fontWeight: 900, color: '#e0e7ff',
                fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.04em', lineHeight: 1,
                textShadow: '0 2px 12px rgba(99,102,241,0.5)',
            }}>
                {pad(value)}
            </div>
            <div style={{ fontSize: 10, color: '#475569', fontWeight: 700, marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
        </div>
    );
}

function HeroSep() {
    return (
        <div style={{ fontSize: 36, fontWeight: 900, color: 'rgba(99,102,241,0.5)', lineHeight: 1, marginBottom: 18, userSelect: 'none' }}>:</div>
    );
}
