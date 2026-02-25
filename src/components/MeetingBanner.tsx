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

                {/* ── Row 1: Badge (top left) ───────────────────────── */}
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        background: accentBg, border: `1px solid ${accentBorder}`,
                        borderRadius: 100, padding: '5px 16px', fontSize: 11, fontWeight: 700,
                        color: accentColor, letterSpacing: '0.08em', textTransform: 'uppercase',
                        boxShadow: `0 2px 8px ${accentBg}`,
                    }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: accentColor, flexShrink: 0, boxShadow: `0 0 8px ${accentColor}` }} />
                        {badgeLabel}
                    </span>
                </div>

                {/* ── Row 2: Title + Description (centered) ────────────────── */}
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                    <h3 style={{
                        margin: '0 0 8px', fontSize: 24, fontWeight: 900, color: '#f8fafc',
                        letterSpacing: '-0.03em', lineHeight: 1.2,
                        textShadow: '0 2px 12px rgba(99,102,241,0.3)',
                    }}>
                        {meeting.title}
                    </h3>
                    {meeting.description && (
                        <p style={{
                            margin: '0 auto', fontSize: 14, color: '#cbd5e1', lineHeight: 1.6,
                            maxWidth: 600,
                        }}>
                            {meeting.description}
                        </p>
                    )}
                </div>

                {/* ── Row 3: Teacher Profile (centered) ────────────────── */}
                {teacherProfile && (
                    <div style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center', 
                        gap: 12,
                        marginBottom: 28,
                    }}>
                        <div style={{ position: 'relative' }}>
                            {teacherProfile.avatar_url ? (
                                <img
                                    src={teacherProfile.avatar_url}
                                    alt={teacherProfile.name}
                                    style={{
                                        width: 72,
                                        height: 72,
                                        borderRadius: '50%',
                                        objectFit: 'cover',
                                        border: '3px solid rgba(99,102,241,0.6)',
                                        boxShadow: '0 4px 20px rgba(99,102,241,0.4), 0 0 0 6px rgba(99,102,241,0.1)',
                                    }}
                                />
                            ) : (
                                <div style={{
                                    width: 72,
                                    height: 72,
                                    borderRadius: '50%',
                                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#fff',
                                    fontWeight: 800,
                                    fontSize: 26,
                                    border: '3px solid rgba(99,102,241,0.6)',
                                    boxShadow: '0 4px 20px rgba(99,102,241,0.4), 0 0 0 6px rgba(99,102,241,0.1)',
                                }}>
                                    {teacherInitials}
                                </div>
                            )}
                            <div style={{ 
                                position: 'absolute',
                                bottom: -2,
                                right: -2,
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                borderRadius: '50%',
                                padding: '6px',
                                boxShadow: '0 2px 8px rgba(99,102,241,0.5)',
                                border: '2px solid #1e1b4b',
                            }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                            </div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ 
                                fontSize: 16, 
                                fontWeight: 700, 
                                color: '#e2e8f0',
                                marginBottom: 4,
                                letterSpacing: '-0.01em',
                            }}>
                                {teacherProfile.name}
                            </div>
                            <div style={{ 
                                fontSize: 11, 
                                color: accentColor,
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: '0.1em',
                                padding: '3px 12px',
                                background: accentBg,
                                borderRadius: 100,
                                border: `1px solid ${accentBorder}`,
                                display: 'inline-block',
                            }}>
                                Instructor
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Row 4: Date/Time (centered with icon) ─────────── */}
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                    <div style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: 10,
                        background: 'rgba(99,102,241,0.18)',
                        border: '1px solid rgba(99,102,241,0.35)',
                        borderRadius: 12,
                        padding: '12px 24px',
                        fontSize: 14,
                        fontWeight: 700,
                        color: '#e2e8f0',
                        boxShadow: '0 2px 12px rgba(99,102,241,0.2)',
                    }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="16" y1="2" x2="16" y2="6"></line>
                            <line x1="8" y1="2" x2="8" y2="6"></line>
                            <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>
                        {new Date(meeting.scheduled_at).toLocaleString([], {
                            weekday: 'short', month: 'short', day: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                        })}
                    </div>
                </div>

                {/* ── Row 5: HERO countdown (centered with enhanced styling) ─────────── */}
                <div style={{ textAlign: 'center', marginBottom: 28 }}>
                    {timeLeft.isLive ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                            <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 10,
                                background: 'rgba(239,68,68,0.25)', border: '2px solid rgba(239,68,68,0.5)',
                                borderRadius: 100, padding: '12px 28px', fontSize: 16, fontWeight: 800,
                                color: '#fca5a5', letterSpacing: '0.08em',
                                animation: 'meeting-pulse 1.8s ease-in-out infinite',
                                boxShadow: '0 4px 20px rgba(239,68,68,0.4), 0 0 0 4px rgba(239,68,68,0.1)',
                            }}>
                                <span style={{
                                    width: 12, height: 12, borderRadius: '50%', background: '#ef4444',
                                    boxShadow: '0 0 12px #ef4444',
                                    animation: 'meeting-pulse 1.8s ease-in-out infinite',
                                }} />
                                LIVE NOW
                            </span>
                        </div>
                    ) : (
                        <>
                            <div style={{ 
                                fontSize: 12, 
                                color: '#94a3b8', 
                                fontWeight: 700, 
                                textTransform: 'uppercase', 
                                letterSpacing: '0.12em', 
                                marginBottom: 16,
                            }}>
                                ⏱️ Session Begins In
                            </div>
                            <div style={{ display: 'inline-flex', gap: 12, alignItems: 'flex-end', justifyContent: 'center', flexWrap: 'wrap' }}>
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

                {/* ── Row 6: Join button (centered with icon) ────────────────────────── */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                    <button
                        onClick={handleJoinClick}
                        title={!canJoin ? lockedLabel : undefined}
                        style={{
                            background: !canJoin
                                ? 'rgba(71,85,105,0.5)'
                                : timeLeft.isLive
                                ? 'linear-gradient(135deg,#ef4444 0%,#dc2626 100%)'
                                : 'linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%)',
                            color: !canJoin ? '#64748b' : '#fff',
                            border: !canJoin ? '2px solid rgba(71,85,105,0.6)' : 'none',
                            borderRadius: 16,
                            padding: '16px 48px', 
                            fontSize: 16, 
                            fontWeight: 800,
                            cursor: canJoin ? 'pointer' : 'not-allowed',
                            letterSpacing: '0.03em', 
                            whiteSpace: 'nowrap',
                            boxShadow: canJoin
                                ? timeLeft.isLive
                                    ? '0 6px 24px rgba(239,68,68,0.5), 0 0 0 4px rgba(239,68,68,0.1)'
                                    : '0 6px 24px rgba(99,102,241,0.5), 0 0 0 4px rgba(99,102,241,0.1)'
                                : 'none',
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '10px',
                        }}
                        onMouseEnter={e => {
                            if (!canJoin) return;
                            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-3px) scale(1.02)';
                            (e.currentTarget as HTMLButtonElement).style.boxShadow = canJoin
                                ? timeLeft.isLive
                                    ? '0 12px 32px rgba(239,68,68,0.6), 0 0 0 6px rgba(239,68,68,0.15)'
                                    : '0 12px 32px rgba(99,102,241,0.6), 0 0 0 6px rgba(99,102,241,0.15)'
                                : 'none';
                        }}
                        onMouseLeave={e => {
                            (e.currentTarget as HTMLButtonElement).style.transform = 'none';
                            (e.currentTarget as HTMLButtonElement).style.boxShadow = canJoin
                                ? timeLeft.isLive
                                    ? '0 6px 24px rgba(239,68,68,0.5), 0 0 0 4px rgba(239,68,68,0.1)'
                                    : '0 6px 24px rgba(99,102,241,0.5), 0 0 0 4px rgba(99,102,241,0.1)'
                                : 'none';
                        }}
                    >
                        {!canJoin ? (
                            <>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                </svg>
                                {lockedLabel}
                            </>
                        ) : timeLeft.isLive ? (
                            <>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                                </svg>
                                Join Live Session
                            </>
                        ) : isCreator ? (
                            <>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                                    <polyline points="10 17 15 12 10 7"></polyline>
                                    <line x1="15" y1="12" x2="3" y2="12"></line>
                                </svg>
                                Enter Early (Host)
                            </>
                        ) : (
                            <>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                                    <polyline points="10 17 15 12 10 7"></polyline>
                                    <line x1="15" y1="12" x2="3" y2="12"></line>
                                </svg>
                                Join Session
                            </>
                        )}
                    </button>
                    {lockedWarning && (
                        <div style={{
                            fontSize: 13, color: '#fbbf24', fontWeight: 600,
                            background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.4)',
                            borderRadius: 10, padding: '8px 16px',
                            animation: 'meeting-pulse 0.3s ease-in-out',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                        }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="12" y1="8" x2="12" y2="12"></line>
                                <line x1="12" y1="16" x2="12.01" y2="16"></line>
                            </svg>
                            Session starts {lockedLabel.toLowerCase()}
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
                background: 'rgba(99,102,241,0.28)', 
                border: '2px solid rgba(99,102,241,0.45)',
                borderRadius: 16, 
                padding: '14px 20px', 
                minWidth: 68,
                fontSize: 52, 
                fontWeight: 900, 
                color: '#e0e7ff',
                fontVariantNumeric: 'tabular-nums', 
                letterSpacing: '-0.05em', 
                lineHeight: 1,
                textShadow: '0 2px 16px rgba(99,102,241,0.6), 0 0 32px rgba(99,102,241,0.3)',
                boxShadow: '0 4px 16px rgba(99,102,241,0.2), inset 0 1px 0 rgba(255,255,255,0.1)',
            }}>
                {pad(value)}
            </div>
            <div style={{ 
                fontSize: 11, 
                color: '#94a3b8', 
                fontWeight: 700, 
                marginTop: 8, 
                textTransform: 'uppercase', 
                letterSpacing: '0.1em',
            }}>{label}</div>
        </div>
    );
}

function HeroSep() {
    return (
        <div style={{ 
            fontSize: 40, 
            fontWeight: 900, 
            color: 'rgba(99,102,241,0.6)', 
            lineHeight: 1, 
            marginBottom: 24, 
            userSelect: 'none',
            textShadow: '0 2px 8px rgba(99,102,241,0.3)',
        }}>:</div>
    );
}
