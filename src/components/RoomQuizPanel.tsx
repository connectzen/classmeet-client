import React, { useState, useEffect, useCallback } from 'react';
import { TakeQuiz } from './QuizDrawer';
import ConfirmModal from './ConfirmModal';

const SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

// ─── RoomQuizHost (Teacher) ────────────────────────────────────────────────
interface RoomQuizHostProps {
    roomId: string;
    quizzes: { id: string; title: string; question_count?: number; room_id?: string }[];
    loadingQuizzes: boolean;
    activeQuiz: { quizId: string; quiz: unknown } | null;
    submissions: { submissionId: string; studentId: string; studentName: string; score: number | null }[];
    onStartQuiz: (quizId: string) => void;
    onStopQuiz: () => void;
    onReveal: (type: 'individual' | 'final', submissionId?: string, data?: unknown) => void;
}

export function RoomQuizHost({
    roomId,
    quizzes,
    loadingQuizzes,
    activeQuiz,
    submissions,
    onStartQuiz,
    onStopQuiz,
    onReveal,
}: RoomQuizHostProps) {

    const hasRoomQuizzes = quizzes.length > 0;

    if (!activeQuiz) {
        return (
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, height: '100%', minHeight: 200, background: 'var(--surface-2)', borderRadius: 12, justifyContent: 'center' }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Select a quiz to start</h3>
                {loadingQuizzes ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading quizzes…</p>
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

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 200, background: 'var(--surface-2)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 15 }}>{quiz.title}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{submissions.length} submitted</span>
                    <button
                        onClick={() => onReveal('final', undefined, { submissions })}
                        style={{
                            padding: '6px 12px', borderRadius: 8, border: 'none', background: '#22c55e', color: '#fff',
                            fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        }}
                    >
                        Reveal Final Results
                    </button>
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
            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                <div style={{ marginBottom: 16 }}>
                    <h4 style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text-muted)' }}>Questions</h4>
                    {(quiz.questions || []).map((q: { id: string; question_text: string; type: string }, i: number) => (
                        <div key={q.id} style={{ padding: 10, background: 'var(--surface-3)', borderRadius: 8, marginBottom: 8, fontSize: 14 }}>
                            {i + 1}. {q.question_text}
                        </div>
                    ))}
                </div>
                <div>
                    <h4 style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text-muted)' }}>Submissions</h4>
                    {submissions.length === 0 ? (
                        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No submissions yet.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {submissions.map((s) => (
                                <div
                                    key={s.submissionId}
                                    style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '8px 12px', background: 'var(--surface-3)', borderRadius: 8,
                                    }}
                                >
                                    <span style={{ fontWeight: 500, fontSize: 14 }}>{s.studentName}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {s.score != null && <span style={{ fontSize: 13, color: '#22c55e' }}>{s.score}%</span>}
                                        <button
                                            onClick={() => onReveal('individual', s.submissionId, { studentName: s.studentName, score: s.score })}
                                            style={{
                                                padding: '4px 10px', borderRadius: 6, border: 'none', background: 'rgba(99,102,241,0.2)', color: '#a5b4fc',
                                                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                            }}
                                        >
                                            Reveal
                                        </button>
                                    </div>
                                </div>
                            ))}
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
                <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading quiz…</p>
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
