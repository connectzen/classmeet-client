import { useState, useEffect, useCallback, useRef } from 'react';
import DOMPurify from 'dompurify';

const SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

function stripHtml(html: string): string {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
}

// ─── Types ─────────────────────────────────────────────────────────────────
type LessonType = 'text' | 'video' | 'audio' | 'image';

interface Lesson {
    id: string; title: string; content: string; order_index: number;
    lesson_type: LessonType; video_url: string | null; audio_url: string | null; image_url: string | null;
}
interface TopicQuiz {
    id: string; title: string; status: string; time_limit_minutes: number | null;
}
interface Assignment {
    id: string; title: string; description: string; assignment_type: string;
    file_url?: string | null; quiz_id?: string | null;
}
interface Topic {
    id: string; title: string; order_index: number;
    lessons: Lesson[]; quizzes: TopicQuiz[]; assignments: Assignment[];
}
interface Course { id: string; title: string; description?: string | null; }
interface Props {
    course: Course;
    userId: string;
    userName: string;
    onClose: () => void;
}

// ─── Question types for quiz taking ────────────────────────────────────────
type QType = 'text' | 'select' | 'multi-select' | 'recording' | 'video' | 'upload';
interface Question {
    id: string; type: QType; question_text: string;
    options?: string[] | null; video_url?: string | null;
    order_index: number; points: number;
    parent_question_id?: string | null; children?: Question[];
}
interface QuizFull {
    id: string; title: string; status: string; time_limit_minutes: number | null; questions: Question[];
}

// ─── Inline Quiz Modal ──────────────────────────────────────────────────────
function QuizModal({ quizId, userId, userName, onClose }: {
    quizId: string; userId: string; userName: string; onClose: () => void;
}) {
    const [quiz, setQuiz] = useState<QuizFull | null>(null);
    const [submissionId, setSubmissionId] = useState<string | null>(null);
    const [answers, setAnswers] = useState<Record<string, { text?: string; selected?: string[] }>>({});
    const [phase, setPhase] = useState<'loading' | 'taking' | 'done'>('loading');
    const [score, setScore] = useState<number | null>(null);
    const [hasPending, setHasPending] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const handleSubmit = useCallback(async () => {
        if (!submissionId || submitting) return;
        setSubmitting(true);
        if (timerRef.current) clearInterval(timerRef.current);
        try {
            const ansArr = Object.entries(answers).map(([questionId, a]) => ({
                questionId, answerText: a.text || null, selectedOptions: a.selected || null,
            }));
            await fetch(`${SERVER}/api/submissions/${submissionId}/answers`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ answers: ansArr }),
            });
            const res = await fetch(`${SERVER}/api/submissions/${submissionId}/submit`, { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                setScore(data.score);
                setHasPending(data.hasPendingManual);
            }
            setPhase('done');
        } finally { setSubmitting(false); }
    }, [submissionId, submitting, answers]);

    useEffect(() => {
        (async () => {
            try {
                const [qRes, subRes] = await Promise.all([
                    fetch(`${SERVER}/api/quizzes/${quizId}`),
                    fetch(`${SERVER}/api/quizzes/${quizId}/my-submission?studentId=${encodeURIComponent(userId)}`),
                ]);
                if (!qRes.ok) { onClose(); return; }
                const qData: QuizFull = await qRes.json();
                setQuiz(qData);
                const existing = subRes.ok ? await subRes.json() : null;
                if (existing && existing.submitted_at) {
                    setScore(existing.score);
                    setPhase('done');
                    return;
                }
                const startRes = await fetch(`${SERVER}/api/quizzes/${quizId}/start`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ studentId: userId, studentName: userName }),
                });
                if (startRes.ok) {
                    const sub = await startRes.json();
                    setSubmissionId(sub.id);
                    if (existing && Array.isArray(existing.answers)) {
                        const pre: Record<string, { text?: string; selected?: string[] }> = {};
                        for (const a of existing.answers) {
                            pre[a.question_id] = {
                                text: a.answer_text || undefined,
                                selected: a.selected_options
                                    ? (Array.isArray(a.selected_options) ? a.selected_options : JSON.parse(a.selected_options))
                                    : undefined,
                            };
                        }
                        setAnswers(pre);
                    }
                    if (qData.time_limit_minutes) setTimeLeft(qData.time_limit_minutes * 60);
                    setPhase('taking');
                }
            } catch { onClose(); }
        })();
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [quizId, userId, userName]);

    useEffect(() => {
        if (phase !== 'taking' || timeLeft === null) return;
        timerRef.current = setInterval(() => {
            setTimeLeft(t => {
                if (t === null || t <= 1) { clearInterval(timerRef.current!); handleSubmit(); return 0; }
                return t - 1;
            });
        }, 1000);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase]);

    const flatQuestions = (quiz?.questions || []).flatMap(q =>
        q.children?.length ? [q, ...q.children] : [q]
    );
    const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

    // Per-question pagination
    const [currentQIdx, setCurrentQIdx] = useState(0);
    const [slideDir, setSlideDir] = useState<'left' | 'right'>('right');
    const [animKey, setAnimKey] = useState(0);

    function goToQ(newIdx: number, dir: 'left' | 'right') {
        setSlideDir(dir);
        setAnimKey(k => k + 1);
        setCurrentQIdx(newIdx);
    }

    const totalQ = flatQuestions.length;
    const isLast = currentQIdx === totalQ - 1;
    const currentQ = flatQuestions[currentQIdx];

    return (
        <>
        <style>{`
            @keyframes slideInRight { from { transform: translateX(60px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
            @keyframes slideInLeft  { from { transform: translateX(-60px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        `}</style>
        <div
            className="qm-backdrop"
            style={{ position: 'fixed', inset: 0, zIndex: 100001, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '50px 24px 40px', overflowY: 'auto' }}
            onClick={onClose}
        >
            <div
                className="qm-modal"
                style={{ background: 'linear-gradient(160deg,#1e2130 0%,#181c2a 100%)', borderRadius: 18, width: '100%', maxWidth: 620, border: '1px solid rgba(99,102,241,0.3)', boxShadow: '0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,102,241,0.1)', display: 'flex', flexDirection: 'column' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Quiz header */}
                <div style={{ padding: '16px 22px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: 'rgba(99,102,241,0.06)', borderRadius: '18px 18px 0 0' }}>
                    <div>
                        <div style={{ fontSize: 10, color: '#818cf8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>📝 Quiz</div>
                        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>{quiz ? stripHtml(quiz.title) : 'Loading…'}</h3>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {phase === 'taking' && timeLeft !== null && (
                            <div style={{ fontSize: 13, fontWeight: 700, color: timeLeft < 60 ? '#f87171' : '#fcd34d', background: 'rgba(251,191,36,0.1)', padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(251,191,36,0.2)' }}>
                                ⏱ {fmtTime(timeLeft)}
                            </div>
                        )}
                        <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#94a3b8', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13 }}>Close</button>
                    </div>
                </div>

                {/* Progress bar */}
                {phase === 'taking' && totalQ > 0 && (
                    <div style={{ padding: '12px 22px 0', flexShrink: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ fontSize: 11, color: '#475569', fontWeight: 600 }}>Question {currentQIdx + 1} of {totalQ}</span>
                            <span style={{ fontSize: 11, color: '#475569' }}>{Math.round(((currentQIdx + 1) / totalQ) * 100)}%</span>
                        </div>
                        <div style={{ height: 4, borderRadius: 99, background: 'rgba(99,102,241,0.15)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${((currentQIdx + 1) / totalQ) * 100}%`, background: 'linear-gradient(90deg,#6366f1,#818cf8)', borderRadius: 99, transition: 'width 0.35s cubic-bezier(0.4,0,0.2,1)' }} />
                        </div>
                    </div>
                )}

                <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
                    {phase === 'loading' && <div style={{ textAlign: 'center', color: '#64748b', padding: 48 }}>Loading quiz…</div>}

                    {phase === 'taking' && quiz && currentQ && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {/* Single question card with slide animation */}
                            <div key={animKey} style={{ padding: '20px 22px', borderRadius: 14, border: '1px solid rgba(34,197,94,0.4)', background: 'linear-gradient(135deg, #1e1b4b 0%, #1e3a5f 50%, #1d2e5e 100%)', boxShadow: '0 4px 20px rgba(99,102,241,0.18), 0 2px 6px rgba(0,0,0,0.2)', animation: `${slideDir === 'right' ? 'slideInRight' : 'slideInLeft'} 0.3s cubic-bezier(0.22,1,0.36,1) both` }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
                                    <span style={{ minWidth: 28, height: 28, borderRadius: '50%', background: 'rgba(99,102,241,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#a5b4fc', flexShrink: 0 }}>{currentQIdx + 1}</span>
                                    <div style={{ fontSize: 15, color: '#e2e8f0', lineHeight: 1.65, fontWeight: 500 }} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(currentQ.question_text) }} />
                                </div>
                                {currentQ.video_url && <div style={{ marginBottom: 14 }}><video src={currentQ.video_url} controls style={{ width: '100%', borderRadius: 10 }} /></div>}

                                {currentQ.type === 'text' && (
                                    <textarea value={answers[currentQ.id]?.text || ''} onChange={e => setAnswers(prev => ({ ...prev, [currentQ.id]: { ...prev[currentQ.id], text: e.target.value } }))} placeholder="Type your answer here…" rows={4}
                                        style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: '#000', color: '#e2e8f0', fontSize: 14, resize: 'vertical', boxSizing: 'border-box', outline: 'none', lineHeight: 1.6 }} />
                                )}
                                {currentQ.type === 'select' && currentQ.options && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {currentQ.options.map(opt => {
                                            const sel = answers[currentQ.id]?.selected?.[0] === opt;
                                            return (
                                                <button key={opt} type="button" onClick={() => setAnswers(prev => ({ ...prev, [currentQ.id]: { ...prev[currentQ.id], selected: [opt] } }))}
                                                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 10, border: `1px solid ${sel ? 'rgba(99,102,241,0.65)' : 'rgba(255,255,255,0.08)'}`, background: sel ? 'rgba(99,102,241,0.22)' : 'rgba(255,255,255,0.03)', color: sel ? '#c7d2fe' : '#94a3b8', cursor: 'pointer', textAlign: 'left', fontSize: 14, transition: 'all 0.15s ease' }}>
                                                    <span style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${sel ? '#a5b4fc' : '#475569'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'border-color 0.15s' }}>
                                                        {sel && <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#a5b4fc' }} />}
                                                    </span>
                                                    {opt}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                                {currentQ.type === 'multi-select' && currentQ.options && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {currentQ.options.map(opt => {
                                            const sel = answers[currentQ.id]?.selected?.includes(opt) ?? false;
                                            return (
                                                <button key={opt} type="button" onClick={() => setAnswers(prev => {
                                                    const cur = prev[currentQ.id]?.selected || [];
                                                    return { ...prev, [currentQ.id]: { ...prev[currentQ.id], selected: sel ? cur.filter(x => x !== opt) : [...cur, opt] } };
                                                })}
                                                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 10, border: `1px solid ${sel ? 'rgba(139,92,246,0.65)' : 'rgba(255,255,255,0.08)'}`, background: sel ? 'rgba(139,92,246,0.22)' : 'rgba(255,255,255,0.03)', color: sel ? '#c4b5fd' : '#94a3b8', cursor: 'pointer', textAlign: 'left', fontSize: 14, transition: 'all 0.15s ease' }}>
                                                    <span style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${sel ? '#a78bfa' : '#475569'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: sel ? 'rgba(167,139,250,0.2)' : 'transparent', transition: 'all 0.15s' }}>
                                                        {sel && <span style={{ fontSize: 11, color: '#a78bfa', lineHeight: 1, fontWeight: 800 }}>✓</span>}
                                                    </span>
                                                    {opt}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                                {(currentQ.type === 'recording' || currentQ.type === 'upload') && (
                                    <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.18)', fontSize: 13, color: '#fcd34d' }}>
                                        {currentQ.type === 'recording' ? '🎙️ Voice recording — submit directly to your teacher.' : '📎 File upload — submit directly to your teacher.'}
                                    </div>
                                )}
                                <div style={{ marginTop: 12, fontSize: 11, color: '#3d4f6e', textAlign: 'right', fontWeight: 600 }}>{currentQ.points} pt{currentQ.points !== 1 ? 's' : ''}</div>
                            </div>

                            {/* Navigation row */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                                <button type="button" onClick={() => goToQ(currentQIdx - 1, 'left')} disabled={currentQIdx === 0}
                                    style={{ padding: '10px 22px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: currentQIdx === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.06)', color: currentQIdx === 0 ? '#2d3a50' : '#94a3b8', fontSize: 13, fontWeight: 600, cursor: currentQIdx === 0 ? 'not-allowed' : 'pointer', transition: 'all 0.15s' }}>
                                    ← Previous
                                </button>

                                {/* Dot indicators */}
                                {totalQ <= 12 && (
                                    <div style={{ display: 'flex', gap: 5 }}>
                                        {flatQuestions.map((_, i) => (
                                            <button key={i} type="button" onClick={() => goToQ(i, i > currentQIdx ? 'right' : 'left')}
                                                style={{ width: i === currentQIdx ? 20 : 7, height: 7, borderRadius: 99, border: 'none', background: i === currentQIdx ? '#6366f1' : answers[flatQuestions[i].id] ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.12)', cursor: 'pointer', padding: 0, transition: 'all 0.25s ease' }} />
                                        ))}
                                    </div>
                                )}

                                {isLast ? (
                                    <button type="button" onClick={handleSubmit} disabled={submitting}
                                        style={{ padding: '10px 26px', borderRadius: 10, border: 'none', background: submitting ? 'rgba(99,102,241,0.3)' : 'linear-gradient(135deg,#6366f1,#4f46e5)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', boxShadow: submitting ? 'none' : '0 4px 14px rgba(99,102,241,0.4)' }}>
                                        {submitting ? 'Submitting…' : 'Submit Quiz ✓'}
                                    </button>
                                ) : (
                                    <button type="button" onClick={() => goToQ(currentQIdx + 1, 'right')}
                                        style={{ padding: '10px 22px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#6366f1,#4f46e5)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}>
                                        Next →
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {phase === 'done' && (
                        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                            <div style={{ fontSize: 56, marginBottom: 16 }}>{score !== null && score >= 70 ? '🎉' : '📋'}</div>
                            <h3 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: '#e2e8f0' }}>Quiz Submitted!</h3>
                            {score !== null ? (
                                <div style={{ fontSize: 40, fontWeight: 800, color: score >= 70 ? '#4ade80' : score >= 50 ? '#fbbf24' : '#f87171', margin: '16px 0' }}>{score}%</div>
                            ) : (
                                <p style={{ color: '#64748b', fontSize: 14 }}>Pending manual grading by your teacher.</p>
                            )}
                            {hasPending && <p style={{ color: '#94a3b8', fontSize: 13, margin: '4px 0 0' }}>Some questions require manual grading — final score may change.</p>}
                            <button type="button" onClick={onClose} style={{ marginTop: 20, padding: '10px 28px', borderRadius: 10, border: 'none', background: '#6366f1', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Done</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
        </>
    );
}

// ─── Main CourseViewer ──────────────────────────────────────────────────────
export default function CourseViewer({ course, userId, userName, onClose }: Props) {
    const [topics, setTopics] = useState<Topic[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
    const [expandedLessonId, setExpandedLessonId] = useState<string | null>(null);
    const [activeQuizId, setActiveQuizId] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const r = await fetch(`${SERVER}/api/courses/${course.id}/topics`);
            if (r.ok) {
                const data = (await r.json()) as Topic[];
                const sorted = data.sort((a, b) => a.order_index - b.order_index);
                setTopics(sorted);
                if (sorted.length > 0) setExpandedTopics(new Set([sorted[0].id]));
            }
        } catch { /* ignore */ } finally { setLoading(false); }
    }, [course.id]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const toggleTopic = (id: string) => setExpandedTopics(prev => {
        if (prev.has(id)) { const s = new Set(prev); s.delete(id); return s; }
        return new Set([id]);
    });

    const totalItems = topics.reduce((s, t) => s + t.lessons.length + t.quizzes.length + t.assignments.length, 0);

    return (
        <>
            <style>{`
                @media (max-width: 600px) {
                    .cv-backdrop { padding: 8px 8px 20px !important; }
                    .cv-modal { border-radius: 10px !important; }
                    .cv-modal-header { padding: 12px 14px !important; }
                    .cv-modal-header h2 { font-size: 15px !important; }
                    .cv-modal-body { padding: 10px !important; max-height: calc(100vh - 90px) !important; }
                    .qm-backdrop { padding: 8px 8px 20px !important; }
                    .qm-modal { border-radius: 12px !important; }
                }
            `}</style>
            <div
                className="cv-backdrop"
                style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '50px 20px 40px', overflowY: 'auto' }}
                onClick={onClose}
            >
                <div
                    className="cv-modal"
                    style={{ background: 'var(--surface-2, #18181f)', borderRadius: 16, width: '100%', maxWidth: 720, display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="cv-modal-header" style={{ padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: '#e2e8f0' }} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(course.title) }} />
                            <div style={{ fontSize: 12, color: '#64748b' }}>{topics.length} topic{topics.length !== 1 ? 's' : ''} · {totalItems} item{totalItems !== 1 ? 's' : ''}</div>
                        </div>
                        <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#94a3b8', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Close</button>
                    </div>

                    {/* Body */}
                    <div className="cv-modal-body" style={{ padding: 18, overflowY: 'auto', maxHeight: 'calc(100vh - 180px)' }}>
                        {loading ? (
                            <div style={{ padding: 48, textAlign: 'center', color: '#64748b' }}>Loading course…</div>
                        ) : topics.length === 0 ? (
                            <div style={{ padding: 48, textAlign: 'center', color: '#64748b' }}>
                                <div style={{ fontSize: 36, marginBottom: 10 }}>📚</div>
                                <div>No content available yet.</div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {topics.map((topic, tIdx) => {
                                    const isOpen = expandedTopics.has(topic.id);
                                    const count = topic.lessons.length + topic.quizzes.length + topic.assignments.length;
                                    return (
                                        <div key={topic.id} className="hover-card" style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #1e3a5f 50%, #1d2e5e 100%)', borderRadius: 14, border: '1px solid rgba(34,197,94,0.4)', boxShadow: '0 4px 20px rgba(99,102,241,0.18), 0 2px 6px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
                                            {/* Topic header */}
                                            <button type="button" onClick={() => toggleTopic(topic.id)}
                                                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', background: 'rgba(99,102,241,0.07)', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                                                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 6, background: 'rgba(99,102,241,0.2)', fontSize: 11, fontWeight: 800, color: '#a5b4fc', flexShrink: 0 }}>{tIdx + 1}</span>
                                                <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>{topic.title}</span>
                                                <span style={{ fontSize: 11, color: '#475569', marginRight: 4 }}>{count} item{count !== 1 ? 's' : ''}</span>
                                                <span style={{ color: '#64748b', fontSize: 13, transition: 'transform 0.2s', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)', display: 'inline-block' }}>▼</span>
                                            </button>

                                            {/* Animated content */}
                                            <div style={{ display: 'grid', gridTemplateRows: isOpen ? '1fr' : '0fr', transition: 'grid-template-rows 0.28s cubic-bezier(0.4,0,0.2,1)' }}>
                                                <div style={{ overflow: 'hidden' }}>
                                                    <div style={{ padding: 14, opacity: isOpen ? 1 : 0, transition: 'opacity 0.2s ease', display: 'flex', flexDirection: 'column', gap: 10 }}>

                                                        {/* Lessons */}
                                                        {topic.lessons.length > 0 && (
                                                            <div>
                                                                <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Lessons</div>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                                                    {topic.lessons.map((lesson, lIdx) => {
                                                                        const isLOpen = expandedLessonId === lesson.id;
                                                                        const icon = lesson.lesson_type === 'video' ? '🎬' : lesson.lesson_type === 'audio' ? '🎵' : lesson.lesson_type === 'image' ? '🖼️' : '📄';
                                                                        return (
                                                                            <div key={lesson.id} className="hover-card" style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', overflow: 'hidden', background: '#2c344a', boxShadow: '0 2px 10px rgba(0,0,0,0.2)' }}>
                                                                                <button type="button" onClick={() => setExpandedLessonId(isLOpen ? null : lesson.id)}
                                                                                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '10px 13px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                                                                                    <span style={{ fontSize: 13 }}>{icon}</span>
                                                                                    <span style={{ fontSize: 11, color: '#475569', flexShrink: 0 }}>L{lIdx + 1}</span>
                                                                                    <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: '#cbd5e1' }}>{lesson.title || `Lesson ${lIdx + 1}`}</span>
                                                                                    <span style={{ color: '#475569', fontSize: 11, transition: 'transform 0.2s', transform: isLOpen ? 'rotate(0deg)' : 'rotate(-90deg)', display: 'inline-block' }}>▼</span>
                                                                                </button>
                                                                                <div style={{ display: 'grid', gridTemplateRows: isLOpen ? '1fr' : '0fr', transition: 'grid-template-rows 0.25s cubic-bezier(0.4,0,0.2,1)' }}>
                                                                                    <div style={{ overflow: 'hidden' }}>
                                                                                        <div style={{ padding: '0 14px 14px', opacity: isLOpen ? 1 : 0, transition: 'opacity 0.2s ease' }}>
                                                                                            {lesson.lesson_type === 'image' && lesson.image_url && (
                                                                                                <img src={lesson.image_url} alt={lesson.title} style={{ width: '100%', borderRadius: 10, display: 'block', marginBottom: 8 }} />
                                                                                            )}
                                                                                            {lesson.lesson_type === 'video' && lesson.video_url && (
                                                                                                lesson.video_url.includes('youtube') || lesson.video_url.includes('youtu.be') ? (
                                                                                                    <iframe src={lesson.video_url.replace('watch?v=', 'embed/').replace('youtu.be/', 'www.youtube.com/embed/')} style={{ width: '100%', aspectRatio: '16/9', borderRadius: 10, border: 'none', display: 'block', marginBottom: 8 }} allow="accelerometer; autoplay; encrypted-media; gyroscope" allowFullScreen title={lesson.title} />
                                                                                                ) : (
                                                                                                    <video src={lesson.video_url} controls style={{ width: '100%', borderRadius: 10, display: 'block', marginBottom: 8 }} />
                                                                                                )
                                                                                            )}
                                                                                            {lesson.lesson_type === 'audio' && lesson.audio_url && (
                                                                                                <audio src={lesson.audio_url} controls style={{ width: '100%', borderRadius: 8, display: 'block', marginBottom: 8 }} />
                                                                                            )}
                                                                                            {lesson.lesson_type === 'text' && (
                                                                                                lesson.content ? (
                                                                                                    <>
                                                                                                        <style>{`.cv-html p{margin:0 0 8px}.cv-html ul,.cv-html ol{padding-left:20px;margin:0 0 8px}.cv-html ul{list-style-type:disc}.cv-html ol{list-style-type:decimal}.cv-html ul ul{list-style-type:circle}.cv-html li{margin:0 0 3px}.cv-html blockquote{border-left:3px solid #6366f1;padding-left:12px;color:#94a3b8;margin:0 0 8px;font-style:italic}.cv-html strong{font-weight:700}.cv-html a{color:#818cf8;text-decoration:underline}.cv-html h1{font-size:1.7em;font-weight:700;color:#e2e8f0;margin:0 0 10px}.cv-html h2{font-size:1.4em;font-weight:700;color:#e2e8f0;margin:0 0 8px}.cv-html h3{font-size:1.15em;font-weight:700;color:#e2e8f0;margin:0 0 6px}`}</style>
                                                                                                        <div className="cv-html" style={{ color: '#cbd5e1', lineHeight: 1.7, fontSize: 13 }} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(lesson.content, { USE_PROFILES: { html: true }, ADD_ATTR: ['style'] }) }} />
                                                                                                    </>
                                                                                                ) : <p style={{ color: '#475569', fontSize: 13, margin: 0 }}>No content for this lesson.</p>
                                                                                            )}
                                                                                            {lesson.lesson_type === 'video' && !lesson.video_url && <p style={{ color: '#475569', fontSize: 13, margin: 0 }}>No video URL set.</p>}
                                                                                            {lesson.lesson_type === 'audio' && !lesson.audio_url && <p style={{ color: '#475569', fontSize: 13, margin: 0 }}>No audio set.</p>}
                                                                                            {lesson.lesson_type === 'image' && !lesson.image_url && <p style={{ color: '#475569', fontSize: 13, margin: 0 }}>No image set.</p>}
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Quizzes attached to topic */}
                                                        {topic.quizzes.length > 0 && (
                                                            <div>
                                                                <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Quizzes</div>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                                                    {topic.quizzes.map(q => (
                                                                        <button key={q.id} type="button"
                                                                            onClick={() => q.status === 'published' && setActiveQuizId(q.id)}
                                                                            disabled={q.status !== 'published'}
                                                                            style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 13px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: '#2c344a', cursor: q.status === 'published' ? 'pointer' : 'default', textAlign: 'left', width: '100%' }}>
                                                                            <span style={{ fontSize: 14 }}>📝</span>
                                                                            <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: q.status === 'published' ? '#c4b5fd' : '#64748b' }}>{stripHtml(q.title)}</span>
                                                                            {q.time_limit_minutes && <span style={{ fontSize: 11, color: '#64748b' }}>⏱ {q.time_limit_minutes}m</span>}
                                                                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: q.status === 'published' ? 'rgba(34,197,94,0.15)' : 'rgba(100,116,139,0.2)', color: q.status === 'published' ? '#4ade80' : '#94a3b8' }}>{q.status}</span>
                                                                            {q.status === 'published' && <span style={{ fontSize: 11, color: '#818cf8', fontWeight: 600 }}>Start →</span>}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Assignments */}
                                                        {topic.assignments.length > 0 && (
                                                            <div>
                                                                <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Assignments</div>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                                                    {topic.assignments.map(a => {
                                                                        const isQuizAssign = a.assignment_type === 'quiz' && !!a.quiz_id;
                                                                        const icon = a.assignment_type === 'link' ? '🔗' : a.assignment_type === 'file' ? '📎' : isQuizAssign ? '📝' : '📋';
                                                                        const linkUrl = (a.assignment_type === 'link' || a.assignment_type === 'file') ? a.file_url : null;
                                                                        return (
                                                                            <div key={a.id}
                                                                                onClick={() => isQuizAssign && setActiveQuizId(a.quiz_id!)}
                                                                                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 13px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: '#2c344a', cursor: isQuizAssign ? 'pointer' : 'default' }}>
                                                                                <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{icon}</span>
                                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                                    <div style={{ fontSize: 13, fontWeight: 600, color: isQuizAssign ? '#fcd34d' : '#cbd5e1', marginBottom: 2 }}>{stripHtml(a.title)}</div>
                                                                                    {a.description && <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>{stripHtml(a.description)}</div>}
                                                                                    {linkUrl && (
                                                                                        <a href={linkUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 12, color: '#818cf8', marginTop: 4, display: 'inline-block' }}>
                                                                                            {a.assignment_type === 'link' ? 'Open link ↗' : 'Open file ↗'}
                                                                                        </a>
                                                                                    )}
                                                                                </div>
                                                                                {isQuizAssign && <span style={{ fontSize: 11, color: '#fbbf24', flexShrink: 0, alignSelf: 'center', fontWeight: 600 }}>Take →</span>}
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {count === 0 && (
                                                            <div style={{ padding: '16px 0', textAlign: 'center', color: '#475569', fontSize: 13 }}>No content in this topic yet.</div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Quiz modal layers above course modal */}
            {activeQuizId && (
                <QuizModal quizId={activeQuizId} userId={userId} userName={userName} onClose={() => setActiveQuizId(null)} />
            )}
        </>
    );
}

