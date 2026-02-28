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
    /** Teacher's display name shown under the image */
    teacherName?: string;
    onJoin: (code: string, id: string, name: string, role: 'teacher' | 'student', title: string) => void;
}

export default function MeetingBanner({ meeting, displayName, userRole, isCreator = false, sessionType = 'admin', teacherName, onJoin }: Props) {
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
            padding: '12px 14px',
            marginBottom: 12,
            overflow: 'hidden',
            boxShadow: '0 4px 20px rgba(99,102,241,0.18), 0 2px 6px rgba(0,0,0,0.2)',
        }}>
            {/* Decorative glow blobs */}
            <div style={{
                position: 'absolute', top: -40, right: -40, width: 130, height: 130,
                borderRadius: '50%', background: isTeacher ? 'rgba(99,102,241,0.18)' : 'rgba(139,92,246,0.2)', pointerEvents: 'none',
            }} />
            <div style={{
                position: 'absolute', bottom: -20, left: '25%', width: 80, height: 80,
                borderRadius: '50%', background: 'rgba(99,102,241,0.12)', pointerEvents: 'none',
            }} />

            <div style={{ position: 'relative' }}>

                {/* ── Header: Title + Badge — right-padded for Edit/Delete overlay ── */}
                <div style={{
                    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 7,
                    marginBottom: 10,
                    paddingRight: isCreator ? 148 : 8,
                }}>
                    <h3 style={{
                        margin: 0,
                        fontSize: 15,
                        fontWeight: 800,
                        color: '#f1f5f9',
                        letterSpacing: '-0.02em',
                        lineHeight: 1.25,
                        flexShrink: 0,
                    }}>
                        {meeting.title}
                    </h3>
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: accentBg, border: `1px solid ${accentBorder}`,
                        borderRadius: 100, padding: '2px 9px', fontSize: 9, fontWeight: 700,
                        color: accentColor, letterSpacing: '0.06em', textTransform: 'uppercase',
                        flexShrink: 0,
                    }}>
                        <span style={{ width: 4, height: 4, borderRadius: '50%', background: accentColor, flexShrink: 0 }} />
                        {badgeLabel}
                    </span>
                </div>

                {/* ── Horizontal body: Image LEFT + Content RIGHT ── */}
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>

                    {/* ── Image column ── */}
                    <div style={{ flexShrink: 0, textAlign: 'center' }}>
                        {meeting.session_image_url ? (
                            <img
                                src={meeting.session_image_url}
                                alt={teacherName || meeting.title}
                                style={{
                                    width: 110,
                                    height: 110,
                                    borderRadius: 14,
                                    objectFit: 'cover',
                                    objectPosition: 'center center',
                                    border: '2px solid rgba(99,102,241,0.45)',
                                    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                                    display: 'block',
                                }}
                            />
                        ) : (
                            <div style={{
                                width: 110,
                                height: 110,
                                borderRadius: 14,
                                background: 'linear-gradient(135deg, rgba(99,102,241,0.25) 0%, rgba(139,92,246,0.25) 100%)',
                                border: '2px solid rgba(99,102,241,0.35)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                            }}>
                                <div style={{ fontSize: 40, opacity: 0.6 }}>📚</div>
                            </div>
                        )}
                        {/* Teacher name below image */}
                        {teacherName && (
                            <div style={{
                                marginTop: 7,
                                fontSize: 11,
                                fontWeight: 700,
                                color: '#e2e8f0',
                                letterSpacing: '0.01em',
                                textAlign: 'center',
                                maxWidth: 110,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}>
                                {teacherName}
                            </div>
                        )}
                    </div>

                    {/* ── Content column ── */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Description */}
                        {meeting.description && (
                            <p style={{ margin: '0 0 10px 0', fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
                                {meeting.description}
                            </p>
                        )}

                        {/* Countdown */}
                        <div style={{ marginBottom: 12 }}>
                            {timeLeft.isLive ? (
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 7,
                                    background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.45)',
                                    borderRadius: 100, padding: '6px 14px', fontSize: 13, fontWeight: 700,
                                    color: '#fca5a5', letterSpacing: '0.06em',
                                    animation: 'meeting-pulse 1.8s ease-in-out infinite',
                                }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 8px #ef4444' }} />
                                    LIVE NOW
                                </span>
                            ) : (
                                <>
                                    <div style={{ fontSize: 9, color: '#60a5fa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
                                        Starts in
                                    </div>
                                    <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end', flexWrap: 'wrap' }}>
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

                        {/* Join button */}
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
                                borderRadius: 10,
                                padding: '8px 18px', fontSize: 12, fontWeight: 700,
                                cursor: canJoin ? 'pointer' : 'not-allowed',
                                letterSpacing: '0.02em', whiteSpace: 'nowrap',
                                boxShadow: canJoin
                                    ? timeLeft.isLive
                                        ? '0 4px 16px rgba(239,68,68,0.4)'
                                        : '0 4px 16px rgba(99,102,241,0.4)'
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
                                marginTop: 6, fontSize: 11, color: '#f59e0b', fontWeight: 600,
                                background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.3)',
                                borderRadius: 8, padding: '4px 12px',
                                animation: 'meeting-pulse 0.3s ease-in-out',
                            }}>
                                ⚠️ This session hasn't started yet. {lockedLabel}.
                            </div>
                        )}
                    </div>
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
                borderRadius: 9, padding: '5px 8px', minWidth: 36,
                fontSize: 26, fontWeight: 900, color: '#e0e7ff',
                fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.04em', lineHeight: 1,
                textShadow: '0 2px 8px rgba(99,102,241,0.5)',
            }}>
                {pad(value)}
            </div>
            <div style={{ fontSize: 7, color: '#94a3b8', fontWeight: 600, marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
        </div>
    );
}

function HeroSep() {
    return (
        <div style={{ fontSize: 22, fontWeight: 900, color: 'rgba(99,102,241,0.6)', lineHeight: 1, marginBottom: 10, userSelect: 'none' }}>:</div>
    );
}
