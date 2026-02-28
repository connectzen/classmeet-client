import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toPng } from 'html-to-image';
import { TakeQuiz } from './QuizDrawer';
import ConfirmModal from './ConfirmModal';

const SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

// ─── CSS Animations (injected once) ─────────────────────────────────────────
let stylesInjected = false;
function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.textContent = `
        @keyframes rqp-pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.05); opacity: 0.85; }
        }
        @keyframes rqp-sparkle {
            0% { transform: translateY(0) scale(1); opacity: 1; }
            100% { transform: translateY(-60px) scale(0); opacity: 0; }
        }
        @keyframes rqp-fade-in-up {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        @keyframes rqp-gentle-pulse {
            0%, 100% { opacity: 0.4; }
            50% { opacity: 1; }
        }
        @keyframes rqp-score-pop {
            0% { transform: scale(0.5); opacity: 0; }
            70% { transform: scale(1.15); }
            100% { transform: scale(1); opacity: 1; }
        }
        @keyframes rqp-confetti-fall {
            0% { transform: translateY(-10px) rotate(0deg); opacity: 1; }
            100% { transform: translateY(80px) rotate(360deg); opacity: 0; }
        }
        @keyframes rqp-slide-down {
            from { max-height: 0; opacity: 0; }
            to { max-height: 2000px; opacity: 1; }
        }
        @keyframes rqp-name-enter {
            0% { transform: scale(0.3) rotate(-5deg); opacity: 0; }
            60% { transform: scale(1.1) rotate(1deg); }
            100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes rqp-countdown-num {
            0% { transform: scale(2); opacity: 0; }
            30% { transform: scale(1); opacity: 1; }
            80% { opacity: 1; }
            100% { transform: scale(0.8); opacity: 0; }
        }
        @keyframes rqp-score-reveal {
            0% { transform: scale(0); opacity: 0; }
            50% { transform: scale(1.3); }
            100% { transform: scale(1); opacity: 1; }
        }
    `;
    document.head.appendChild(style);
}

// ─── PostSubmitWaiting (Student countdown + waiting) ─────────────────────────
const ENCOURAGE_MESSAGES = [
    'Great job finishing!',
    'You did amazing!',
    'Well done!',
    'Nice work!',
    'That was awesome!',
];

interface PostSubmitWaitingProps {
    studentCount?: number;
}

export function PostSubmitWaiting({ studentCount = 1 }: PostSubmitWaitingProps) {
    const totalSeconds = Math.max(120, studentCount * 120);
    const [secondsLeft, setSecondsLeft] = useState(totalSeconds);
    const [msgIndex, setMsgIndex] = useState(0);
    const countdownDone = secondsLeft <= 0;

    useEffect(() => { injectStyles(); }, []);

    useEffect(() => {
        if (countdownDone) return;
        const t = setInterval(() => setSecondsLeft(p => Math.max(0, p - 1)), 1000);
        return () => clearInterval(t);
    }, [countdownDone]);

    useEffect(() => {
        const t = setInterval(() => setMsgIndex(p => (p + 1) % ENCOURAGE_MESSAGES.length), 3000);
        return () => clearInterval(t);
    }, []);

    const minutes = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    const progress = 1 - secondsLeft / totalSeconds;
    const circumference = 2 * Math.PI * 90;
    const dashOffset = circumference * (1 - progress);

    if (countdownDone) {
        return (
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%',
                minHeight: 200, background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                borderRadius: 12, flexDirection: 'column', gap: 16, padding: 24,
            }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {[0, 1, 2].map(i => (
                        <div key={i} style={{
                            width: 10, height: 10, borderRadius: '50%', background: '#6366f1',
                            animation: `rqp-gentle-pulse 1.5s ease-in-out ${i * 0.3}s infinite`,
                        }} />
                    ))}
                </div>
                <div style={{ fontWeight: 600, fontSize: 16, color: '#e2e8f0' }}>
                    Waiting for the teacher to reveal your results...
                </div>
                <div style={{ fontSize: 13, color: '#94a3b8' }}>
                    Sit tight — your teacher is reviewing
                </div>
            </div>
        );
    }

    const sparkles = Array.from({ length: 6 }, (_, i) => ({
        left: `${15 + i * 14}%`,
        delay: `${i * 0.5}s`,
        size: 4 + (i % 3) * 2,
    }));

    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%',
            minHeight: 200, background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
            borderRadius: 12, flexDirection: 'column', gap: 20, padding: 24, position: 'relative', overflow: 'hidden',
        }}>
            {sparkles.map((s, i) => (
                <div key={i} style={{
                    position: 'absolute', bottom: 0, left: s.left,
                    width: s.size, height: s.size, borderRadius: '50%',
                    background: i % 2 === 0 ? '#818cf8' : '#a78bfa',
                    animation: `rqp-sparkle 2.5s ease-out ${s.delay} infinite`,
                    opacity: 0.7,
                }} />
            ))}

            <div style={{ position: 'relative', width: 200, height: 200, animation: 'rqp-pulse 3s ease-in-out infinite' }}>
                <svg width="200" height="200" viewBox="0 0 200 200" style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx="100" cy="100" r="90" fill="none" stroke="rgba(99,102,241,0.15)" strokeWidth="8" />
                    <circle
                        cx="100" cy="100" r="90" fill="none" stroke="url(#rqp-grad)" strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={dashOffset}
                        style={{ transition: 'stroke-dashoffset 1s linear' }}
                    />
                    <defs>
                        <linearGradient id="rqp-grad" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#818cf8" />
                            <stop offset="100%" stopColor="#6366f1" />
                        </linearGradient>
                    </defs>
                </svg>
                <div style={{
                    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                }}>
                    <div style={{ fontSize: 42, fontWeight: 700, color: '#e2e8f0', fontVariantNumeric: 'tabular-nums' }}>
                        {minutes}:{secs.toString().padStart(2, '0')}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>
                        remaining
                    </div>
                </div>
            </div>

            <div style={{ height: 28, overflow: 'hidden', position: 'relative', width: '100%', textAlign: 'center' }}>
                <div key={msgIndex} style={{
                    fontSize: 16, fontWeight: 600, color: '#a5b4fc',
                    animation: 'rqp-fade-in-up 0.5s ease-out',
                }}>
                    {ENCOURAGE_MESSAGES[msgIndex]}
                </div>
            </div>

            <div style={{ fontSize: 13, color: '#64748b' }}>
                Your teacher will reveal results soon
            </div>
        </div>
    );
}

// ─── InlineResultCard (replaces fullscreen StudentResultOverlay) ──────────────
// Used for both individual reveals (student sees own result) and class-reveal
// (everyone sees a student's result with dramatic animation)
interface InlineResultCardProps {
    score: number | null;
    comment?: string;
    studentName?: string;
    isClassReveal?: boolean;
    currentUserId?: string;
    revealedStudentId?: string;
    onClose: () => void;
}

export function InlineResultCard({ score, comment, studentName, isClassReveal, currentUserId, revealedStudentId, onClose }: InlineResultCardProps) {
    const [phase, setPhase] = useState<'name' | 'countdown' | 'score'>(isClassReveal ? 'name' : 'score');
    const [countdownNum, setCountdownNum] = useState(3);
    const [displayScore, setDisplayScore] = useState(0);
    const [downloadState, setDownloadState] = useState<'idle' | 'downloading' | 'downloaded'>('idle');
    const cardRef = useRef<HTMLDivElement>(null);
    const isGood = score != null && score >= 50;
    const canDownload = !isClassReveal || !revealedStudentId || !currentUserId || currentUserId === revealedStudentId;

    useEffect(() => { injectStyles(); }, []);

    useEffect(() => {
        if (downloadState !== 'downloaded') return;
        const t = setTimeout(() => setDownloadState('idle'), 1500);
        return () => clearTimeout(t);
    }, [downloadState]);

    const handleDownload = useCallback(async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!cardRef.current || downloadState !== 'idle') return;
        setDownloadState('downloading');
        try {
            const dataUrl = await toPng(cardRef.current, { backgroundColor: isGood ? '#10b981' : '#f59e0b', pixelRatio: 2 });
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = `quiz-result-${studentName || 'student'}-${Date.now()}.png`;
            a.click();
            setDownloadState('downloaded');
        } catch {
            setDownloadState('idle');
        }
    }, [downloadState, isGood, studentName]);

    // Class reveal: name phase (2s) -> countdown phase (3s) -> score phase
    useEffect(() => {
        if (!isClassReveal) return;
        const nameTimer = setTimeout(() => setPhase('countdown'), 2000);
        return () => clearTimeout(nameTimer);
    }, [isClassReveal]);

    useEffect(() => {
        if (phase !== 'countdown') return;
        if (countdownNum <= 0) { setPhase('score'); return; }
        const t = setTimeout(() => setCountdownNum(p => p - 1), 1000);
        return () => clearTimeout(t);
    }, [phase, countdownNum]);

    // Escape key to dismiss
    useEffect(() => {
        if (phase !== 'score') return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [phase, onClose]);

    // Score count-up animation
    useEffect(() => {
        if (phase !== 'score' || score == null) return;
        const duration = 1500;
        const steps = 30;
        const increment = score / steps;
        let current = 0;
        const t = setInterval(() => {
            current += increment;
            if (current >= score) {
                setDisplayScore(score);
                clearInterval(t);
            } else {
                setDisplayScore(Math.round(current));
            }
        }, duration / steps);
        return () => clearInterval(t);
    }, [phase, score]);

    const confettiColors = ['#22c55e', '#6366f1', '#f59e0b', '#ec4899', '#06b6d4', '#a78bfa'];

    // Name phase — dramatic reveal of student name
    if (phase === 'name') {
        return (
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%',
                minHeight: 200, borderRadius: 12, overflow: 'hidden',
                background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
                flexDirection: 'column', gap: 16, padding: 24,
            }}>
                <div style={{
                    fontSize: 48, fontWeight: 800, color: '#e2e8f0',
                    animation: 'rqp-name-enter 0.8s ease-out',
                    textAlign: 'center',
                }}>
                    {studentName || 'Student'}
                </div>
                <div style={{ fontSize: 14, color: '#94a3b8' }}>Get ready...</div>
            </div>
        );
    }

    // Countdown phase — 3, 2, 1
    if (phase === 'countdown') {
        return (
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%',
                minHeight: 200, borderRadius: 12, overflow: 'hidden',
                background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
                flexDirection: 'column', gap: 16, padding: 24,
            }}>
                {studentName && (
                    <div style={{ fontSize: 18, fontWeight: 600, color: '#94a3b8' }}>{studentName}</div>
                )}
                <div
                    key={countdownNum}
                    style={{
                        fontSize: 120, fontWeight: 800, color: '#818cf8',
                        animation: 'rqp-countdown-num 1s ease-out',
                        lineHeight: 1,
                    }}
                >
                    {countdownNum}
                </div>
            </div>
        );
    }

    // Score phase
    return (
        <div
            ref={cardRef}
            onClick={onClose}
            style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%',
                minHeight: 200, borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
                background: isGood
                    ? 'linear-gradient(135deg, rgba(16,185,129,0.95) 0%, rgba(34,197,94,0.95) 100%)'
                    : 'linear-gradient(135deg, rgba(245,158,11,0.95) 0%, rgba(249,115,22,0.95) 100%)',
                padding: 24, position: 'relative',
                animation: 'rqp-fade-in-up 0.4s ease-out',
            }}
        >
            {/* Confetti for good scores */}
            {isGood && confettiColors.map((c, i) => (
                <div key={i} style={{
                    position: 'absolute', top: '10%',
                    left: `${10 + i * 15}%`,
                    width: 8, height: 8, borderRadius: i % 2 === 0 ? '50%' : 2,
                    background: c,
                    animation: `rqp-confetti-fall 2s ease-in ${i * 0.2}s infinite`,
                }} />
            ))}

            <div style={{
                textAlign: 'center', maxWidth: 400, width: '100%',
                animation: 'rqp-score-reveal 0.6s ease-out',
            }}>
                <div style={{ fontSize: 60, marginBottom: 12 }}>
                    {isGood ? '🎉' : '💪'}
                </div>

                <h2 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 800, color: '#fff' }}>
                    {isGood ? 'Congratulations!' : 'Keep Going!'}
                </h2>

                {studentName && (
                    <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.85)', marginBottom: 12 }}>
                        {studentName}
                    </div>
                )}

                {score != null ? (
                    <div style={{
                        fontSize: 64, fontWeight: 800, color: '#fff',
                        textShadow: '0 4px 20px rgba(0,0,0,0.2)',
                        marginBottom: 6,
                    }}>
                        {displayScore}%
                    </div>
                ) : (
                    <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.9)', marginBottom: 12 }}>
                        Your teacher has reviewed your answers
                    </div>
                )}

                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', marginBottom: 16 }}>
                    {isGood
                        ? 'Excellent work! You really nailed it!'
                        : score != null
                            ? 'Don\'t worry — every attempt makes you stronger!'
                            : ''
                    }
                </div>

                {comment && (
                    <div style={{
                        background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: '10px 14px',
                        marginBottom: 12, backdropFilter: 'blur(10px)',
                    }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>
                            Teacher's Comment
                        </div>
                        <div style={{ fontSize: 13, color: '#fff', lineHeight: 1.5 }}>{comment}</div>
                    </div>
                )}

                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 8 }}>
                    Tap or press Esc to dismiss
                </div>

                {canDownload && (
                    <button
                        onClick={handleDownload}
                        disabled={downloadState === 'downloading'}
                        style={{
                            marginTop: 16, padding: '10px 20px', fontSize: 14, fontWeight: 600,
                            background: 'rgba(255,255,255,0.25)', border: '2px solid rgba(255,255,255,0.5)',
                            borderRadius: 10, color: '#fff', cursor: downloadState === 'downloading' ? 'wait' : 'pointer',
                        }}
                    >
                        {downloadState === 'downloading' ? 'Downloading…' : downloadState === 'downloaded' ? '✓ Downloaded' : '📥 Download Result'}
                    </button>
                )}
            </div>
        </div>
    );
}

// ─── InlineGrading (Teacher expands a student's submission) ──────────────────
interface InlineGradingProps {
    quizId: string;
    submissionId: string;
    studentId: string;
    onScoreUpdate?: (newScore: number | null) => void;
}

interface GradingAnswer {
    id: string;
    question_id: string;
    answer_text: string | null;
    selected_options: string[] | null;
    file_url: string | null;
    teacher_grade: number | null;
    teacher_feedback: string | null;
    question: {
        id: string;
        question_text: string;
        type: string;
        options?: string[];
        correct_answers?: string[];
        points: number;
    };
}

function InlineGrading({ quizId, submissionId, studentId, onScoreUpdate }: InlineGradingProps) {
    const [loading, setLoading] = useState(true);
    const [answers, setAnswers] = useState<GradingAnswer[]>([]);
    const [overallFeedback, setOverallFeedback] = useState('');
    const [savingId, setSavingId] = useState<string | null>(null);
    const [savingOverall, setSavingOverall] = useState(false);
    const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
    const [savedOverall, setSavedOverall] = useState(false);
    const [grades, setGrades] = useState<Record<string, { grade: string; feedback: string }>>({});

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        fetch(`${SERVER}/api/quizzes/${quizId}/my-submission?studentId=${studentId}`)
            .then(r => r.json())
            .then((data: { id?: string; answers?: GradingAnswer[]; teacher_overall_feedback?: string; teacher_final_score_override?: number | null }) => {
                if (cancelled) return;
                const ans = (data.answers || []).map((a: GradingAnswer) => ({
                    ...a,
                    question: a.question || { id: a.question_id, question_text: '', type: 'text', points: 1 },
                }));
                setAnswers(ans);
                setOverallFeedback(data.teacher_overall_feedback || '');
                const g: Record<string, { grade: string; feedback: string }> = {};
                for (const a of ans) {
                    g[a.id] = {
                        grade: a.teacher_grade != null ? String(a.teacher_grade) : '',
                        feedback: a.teacher_feedback || '',
                    };
                }
                setGrades(g);
            })
            .catch(() => {})
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [quizId, studentId]);

    const saveGrade = async (answerId: string) => {
        const g = grades[answerId];
        if (!g) return;
        setSavingId(answerId);
        try {
            const res = await fetch(`${SERVER}/api/quiz-answers/${answerId}/grade`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ grade: g.grade === '' ? null : Number(g.grade), feedback: g.feedback }),
            });
            if (res.ok) {
                const data = await res.json();
                if (data.newScore != null && onScoreUpdate) onScoreUpdate(data.newScore);
                setSavedIds(prev => new Set(prev).add(answerId));
            }
        } catch { /* ignore */ }
        setSavingId(null);
    };

    const saveOverall = async () => {
        setSavingOverall(true);
        try {
            const res = await fetch(`${SERVER}/api/submissions/${submissionId}/feedback`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    teacherOverallFeedback: overallFeedback,
                }),
            });
            if (res.ok) setSavedOverall(true);
        } catch { /* ignore */ }
        setSavingOverall(false);
    };

    if (loading) {
        return <div style={{ padding: 16, fontSize: 13, color: 'var(--text-muted)' }}>Loading answers...</div>;
    }

    return (
        <div style={{
            padding: '12px 16px', borderTop: '1px solid var(--border)',
            background: 'rgba(99,102,241,0.04)',
            animation: 'rqp-fade-in-up 0.3s ease-out',
        }}>
            {answers.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No answers found.</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {answers.map((a, i) => {
                        const q = a.question;
                        const isAutoGraded = q.type === 'select' || q.type === 'multi-select';
                        const g = grades[a.id] || { grade: '', feedback: '' };
                        const isSaved = savedIds.has(a.id);

                        return (
                            <div key={a.id} style={{
                                background: 'var(--surface-3)', borderRadius: 10, padding: 12,
                                border: '1px solid var(--border)',
                            }}>
                                {/* Question */}
                                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                                    <span style={{
                                        background: '#6366f1', color: '#fff', borderRadius: 6,
                                        padding: '2px 7px', fontSize: 11, fontWeight: 700, flexShrink: 0,
                                    }}>Q{i + 1}</span>
                                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{q.question_text}</span>
                                </div>

                                {/* Student's answer */}
                                <div style={{
                                    background: 'var(--surface-2)', borderRadius: 8, padding: '8px 12px',
                                    marginBottom: 8, fontSize: 13,
                                }}>
                                    <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Answer: </span>
                                    {a.selected_options && a.selected_options.length > 0 ? (
                                        <span style={{ color: 'var(--text)' }}>{a.selected_options.join(', ')}</span>
                                    ) : a.answer_text ? (
                                        <span style={{ color: 'var(--text)' }}>{a.answer_text}</span>
                                    ) : a.file_url && q.type === 'recording' ? (
                                        <div style={{ marginTop: 6 }}>
                                            <audio controls src={a.file_url} style={{ width: '100%', height: 36, borderRadius: 8 }} />
                                        </div>
                                    ) : a.file_url ? (
                                        <a href={a.file_url} target="_blank" rel="noreferrer" style={{ color: '#6366f1' }}>View file</a>
                                    ) : (
                                        <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No answer</span>
                                    )}
                                </div>

                                {/* Correct answer for auto-graded */}
                                {isAutoGraded && q.correct_answers && (
                                    <div style={{ fontSize: 12, color: '#22c55e', marginBottom: 8 }}>
                                        Correct: {q.correct_answers.join(', ')}
                                    </div>
                                )}

                                {/* Grade & feedback inputs */}
                                {isAutoGraded ? (
                                    <div style={{ fontSize: 12, color: a.teacher_grade != null ? '#22c55e' : '#94a3b8' }}>
                                        Auto-graded: {a.teacher_grade ?? 0}/{q.points} pts
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <input
                                                type="number"
                                                min={0}
                                                max={q.points}
                                                value={g.grade}
                                                onChange={e => {
                                                    setGrades(prev => ({ ...prev, [a.id]: { ...prev[a.id], grade: e.target.value } }));
                                                    setSavedIds(prev => { const n = new Set(prev); n.delete(a.id); return n; });
                                                }}
                                                placeholder="0"
                                                style={{
                                                    width: 60, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)',
                                                    background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13,
                                                }}
                                            />
                                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>/ {q.points} pts</span>
                                            <button
                                                onClick={() => saveGrade(a.id)}
                                                disabled={savingId === a.id}
                                                style={{
                                                    padding: '4px 10px', borderRadius: 6, border: 'none',
                                                    background: savingId === a.id ? '#94a3b8' : isSaved ? '#22c55e' : '#6366f1',
                                                    color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                                    marginLeft: 'auto',
                                                    transition: 'background 0.2s',
                                                }}
                                            >
                                                {savingId === a.id ? 'Saving...' : isSaved ? 'Saved' : 'Save'}
                                            </button>
                                        </div>
                                        <textarea
                                            value={g.feedback}
                                            onChange={e => {
                                                setGrades(prev => ({ ...prev, [a.id]: { ...prev[a.id], feedback: e.target.value } }));
                                                setSavedIds(prev => { const n = new Set(prev); n.delete(a.id); return n; });
                                            }}
                                            placeholder="Feedback for this answer..."
                                            rows={2}
                                            style={{
                                                width: '100%', padding: '6px 10px', borderRadius: 6,
                                                border: '1px solid var(--border)', background: 'var(--surface-2)',
                                                color: 'var(--text)', fontSize: 12, resize: 'vertical',
                                            }}
                                        />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Overall feedback section — no more % override */}
            <div style={{
                marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)',
                display: 'flex', flexDirection: 'column', gap: 8,
            }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Overall Comment
                </label>
                <textarea
                    value={overallFeedback}
                    onChange={e => { setOverallFeedback(e.target.value); setSavedOverall(false); }}
                    placeholder="Write an overall comment for this student..."
                    rows={2}
                    style={{
                        width: '100%', padding: '8px 12px', borderRadius: 8,
                        border: '1px solid var(--border)', background: 'var(--surface-2)',
                        color: 'var(--text)', fontSize: 13, resize: 'vertical',
                    }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        onClick={saveOverall}
                        disabled={savingOverall}
                        style={{
                            padding: '6px 14px', borderRadius: 6, border: 'none',
                            background: savingOverall ? '#94a3b8' : savedOverall ? '#22c55e' : '#6366f1',
                            color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            transition: 'background 0.2s',
                        }}
                    >
                        {savingOverall ? 'Saving...' : savedOverall ? 'Saved' : 'Save Feedback'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Avatar helper ───────────────────────────────────────────────────────────
const AVATAR_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#22c55e', '#06b6d4', '#a855f7', '#ef4444', '#14b8a6'];

function StudentAvatar({ name }: { name: string }) {
    const letter = (name || '?')[0].toUpperCase();
    const colorIndex = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % AVATAR_COLORS.length;
    return (
        <div style={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
            background: `linear-gradient(135deg, ${AVATAR_COLORS[colorIndex]}, ${AVATAR_COLORS[(colorIndex + 1) % AVATAR_COLORS.length]})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 14, fontWeight: 700,
        }}>
            {letter}
        </div>
    );
}

// ─── RoomQuizHost (Teacher) ────────────────────────────────────────────────
interface RoomQuizHostProps {
    roomId: string;
    quizzes: { id: string; title: string; question_count?: number; room_id?: string }[];
    loadingQuizzes: boolean;
    activeQuiz: { quizId: string; quiz: unknown } | null;
    submissions: { submissionId: string; studentId: string; studentName: string; score: number | null }[];
    revealedStudentIds: Set<string>;
    onStartQuiz: (quizId: string) => void;
    onStopQuiz: () => void;
    onReveal: (type: 'individual' | 'class-reveal' | 'final', submissionId?: string, data?: unknown) => void;
}

export function RoomQuizHost({
    roomId,
    quizzes,
    loadingQuizzes,
    activeQuiz,
    submissions,
    revealedStudentIds,
    onStartQuiz,
    onStopQuiz,
    onReveal,
}: RoomQuizHostProps) {
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [localScores, setLocalScores] = useState<Record<string, number | null>>({});

    useEffect(() => { injectStyles(); }, []);

    const hasRoomQuizzes = quizzes.length > 0;

    if (!activeQuiz) {
        return (
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, height: '100%', minHeight: 200, background: 'var(--surface-2)', borderRadius: 12, justifyContent: 'center' }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Select a quiz to start</h3>
                {loadingQuizzes ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading quizzes...</p>
                ) : !hasRoomQuizzes ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No quizzes for this room. Create one from the Quizzes panel and assign it to this room.</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {quizzes.map((q) => (
                            <button
                                key={q.id}
                                onClick={() => onStartQuiz(q.id)}
                                style={{
                                    padding: '12px 16px', borderRadius: 10, border: '1px solid var(--border)',
                                    background: 'var(--surface-3)', color: 'var(--text)', textAlign: 'left',
                                    cursor: 'pointer', fontWeight: 500, fontSize: 14,
                                }}
                            >
                                {q.title} {q.question_count ? `(${q.question_count} Q)` : ''}
                            </button>
                        ))}
                    </div>
                )}
                <button
                    onClick={onStopQuiz}
                    style={{
                        padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)',
                        background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', alignSelf: 'flex-start',
                    }}
                >
                    Cancel
                </button>
            </div>
        );
    }

    const quiz = activeQuiz.quiz as { id: string; title: string; questions: { id: string; question_text: string; type: string; options?: string[] }[] };

    const getScore = (s: { submissionId: string; score: number | null }) =>
        localScores[s.submissionId] !== undefined ? localScores[s.submissionId] : s.score;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 200, background: 'var(--surface-2)', borderRadius: 12, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 15 }}>{quiz.title}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                        fontSize: 12, color: '#fff', background: '#6366f1', borderRadius: 12,
                        padding: '2px 10px', fontWeight: 600,
                    }}>
                        {submissions.length} submitted
                    </span>
                    <button
                        onClick={onStopQuiz}
                        style={{
                            padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)',
                            background: 'transparent', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
                        }}
                    >
                        Stop Quiz
                    </button>
                </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                {/* Questions summary - collapsible */}
                <details style={{ marginBottom: 16 }}>
                    <summary style={{
                        fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600,
                        marginBottom: 8, userSelect: 'none',
                    }}>
                        Questions ({(quiz.questions || []).length})
                    </summary>
                    {(quiz.questions || []).map((q: { id: string; question_text: string; type: string }, i: number) => (
                        <div key={q.id} style={{ padding: 10, background: 'var(--surface-3)', borderRadius: 8, marginBottom: 6, fontSize: 13 }}>
                            {i + 1}. {q.question_text}
                        </div>
                    ))}
                </details>

                {/* Submissions list */}
                <div>
                    <h4 style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>
                        Submissions — click a student to grade, then Reveal to show their result to the class
                    </h4>
                    {submissions.length === 0 ? (
                        <div style={{
                            padding: 24, textAlign: 'center', background: 'var(--surface-3)',
                            borderRadius: 10, color: 'var(--text-muted)', fontSize: 13,
                        }}>
                            Waiting for students to submit...
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {submissions.map((s) => {
                                const isExpanded = expandedId === s.submissionId;
                                const isRevealed = revealedStudentIds.has(s.studentId);
                                const score = getScore(s);
                                const scoreColor = score == null ? '#94a3b8' : score >= 50 ? '#22c55e' : '#f59e0b';

                                return (
                                    <div
                                        key={s.submissionId}
                                        style={{
                                            background: 'var(--surface-3)', borderRadius: 10,
                                            border: isExpanded ? '1px solid #6366f1' : '1px solid transparent',
                                            overflow: 'hidden', transition: 'border-color 0.2s',
                                        }}
                                    >
                                        {/* Row header - clickable to expand */}
                                        <div
                                            onClick={() => setExpandedId(isExpanded ? null : s.submissionId)}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 10,
                                                padding: '10px 12px', cursor: 'pointer',
                                                transition: 'background 0.15s',
                                            }}
                                        >
                                            <StudentAvatar name={s.studentName} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>
                                                    {s.studentName}
                                                </div>
                                                <div style={{ fontSize: 12, color: scoreColor, fontWeight: 600 }}>
                                                    {score != null ? `${score}%` : 'Pending'}
                                                </div>
                                            </div>

                                            {/* Reveal button or Revealed badge */}
                                            {isRevealed ? (
                                                <span style={{
                                                    padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                                    background: 'rgba(34,197,94,0.15)', color: '#22c55e',
                                                }}>
                                                    Revealed
                                                </span>
                                            ) : (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onReveal('class-reveal', s.submissionId, {
                                                            studentId: s.studentId,
                                                            studentName: s.studentName,
                                                            score: getScore(s),
                                                        });
                                                    }}
                                                    style={{
                                                        padding: '5px 12px', borderRadius: 6, border: 'none',
                                                        background: 'linear-gradient(135deg, #6366f1, #818cf8)',
                                                        color: '#fff', fontSize: 11, fontWeight: 600,
                                                        cursor: 'pointer', boxShadow: '0 2px 6px rgba(99,102,241,0.3)',
                                                    }}
                                                >
                                                    Reveal to Class
                                                </button>
                                            )}

                                            {/* Expand/collapse chevron */}
                                            <span style={{
                                                fontSize: 16, color: 'var(--text-muted)',
                                                transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                                transition: 'transform 0.2s',
                                            }}>
                                                ▾
                                            </span>
                                        </div>

                                        {/* Expanded inline grading */}
                                        {isExpanded && (
                                            <InlineGrading
                                                quizId={quiz.id}
                                                submissionId={s.submissionId}
                                                studentId={s.studentId}
                                                onScoreUpdate={(newScore) => {
                                                    setLocalScores(prev => ({ ...prev, [s.submissionId]: newScore }));
                                                }}
                                            />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── RoomQuizParticipant (Student) ──────────────────────────────────────────
interface RoomQuizParticipantProps {
    quiz: { id: string; title: string; questions: unknown[] };
    userId: string;
    userName: string;
    onSubmit: (submissionId: string, score: number | null) => void;
    onAlert: (title: string, message: string) => void;
}

export function RoomQuizParticipant({ quiz, userId, userName, onSubmit, onAlert }: RoomQuizParticipantProps) {
    const [submissionId, setSubmissionId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [confirmState, setConfirmState] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        fetch(`${SERVER}/api/quizzes/${quiz.id}/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentId: userId, studentName: userName }),
        })
            .then((r) => r.json())
            .then((data: { id?: string }) => {
                if (!cancelled && data?.id) setSubmissionId(data.id);
            })
            .catch(() => { if (!cancelled) onAlert('Error', 'Could not start quiz.'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [quiz.id, userId, userName, onAlert]);

    const showConfirm = useCallback((opts: { title: string; message: string; confirmLabel?: string; onConfirm: () => void }) => {
        setConfirmState({ title: opts.title, message: opts.message, onConfirm: opts.onConfirm });
    }, []);

    const showAlert = useCallback((title: string, message: string) => {
        onAlert(title, message);
    }, [onAlert]);

    const handleDone = useCallback((score: number | null) => {
        if (submissionId) onSubmit(submissionId, score);
    }, [submissionId, onSubmit]);

    if (loading || !submissionId) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 200, background: 'var(--surface-2)', borderRadius: 12 }}>
                <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading quiz...</p>
            </div>
        );
    }

    return (
        <>
            <TakeQuiz
                quiz={{
                    ...quiz,
                    room_id: (quiz as { room_id?: string }).room_id || '',
                    created_by: '',
                    status: 'published',
                    created_at: '',
                    time_limit_minutes: (quiz as { time_limit_minutes?: number | null }).time_limit_minutes ?? null,
                    questions: quiz.questions || [],
                } as React.ComponentProps<typeof TakeQuiz>['quiz']}
                submissionId={submissionId}
                userId={userId}
                showConfirm={showConfirm}
                showAlert={showAlert}
                onDone={handleDone}
            />
            {confirmState && (
                <ConfirmModal
                    open={true}
                    title={confirmState.title}
                    message={confirmState.message}
                    confirmLabel="Submit"
                    onConfirm={() => { confirmState.onConfirm(); setConfirmState(null); }}
                    onCancel={() => setConfirmState(null)}
                />
            )}
        </>
    );
}
