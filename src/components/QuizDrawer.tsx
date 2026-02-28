import { useState, useEffect, useRef, useCallback } from 'react';
import ConfirmModal from './ConfirmModal';
import AlertModal from './AlertModal';

const SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

// ─── Types ────────────────────────────────────────────────────────────────
type QuestionType = 'text' | 'select' | 'multi-select' | 'recording' | 'video' | 'upload';

interface Quiz {
    id: string;
    title: string;
    room_id: string;
    created_by: string;
    time_limit_minutes: number | null;
    status: 'draft' | 'published';
    created_at: string;
    question_count?: number;
    submission_count?: number;
    submitted_at?: string | null;
    my_score?: number | null;
}

interface Question {
    id: string;
    quiz_id: string;
    type: QuestionType;
    question_text: string;
    options?: string[] | null;
    correct_answers?: string[] | null;
    video_url?: string | null;
    order_index: number;
    points: number;
    parent_question_id?: string | null;
    children?: Question[];
}

interface Answer {
    questionId: string;
    answerText?: string;
    selectedOptions?: string[];
    fileUrl?: string;
    fileName?: string;
}

interface Submission {
    id: string;
    quiz_id: string;
    student_id: string;
    student_name: string;
    started_at: string;
    submitted_at: string | null;
    score: number | null;
    teacher_overall_feedback?: string | null;
    teacher_final_score_override?: number | null;
    answers?: SubmissionAnswer[];
}

interface SubmissionAnswer {
    id: string;
    question_id: string;
    answer_text: string | null;
    selected_options: string[] | null;
    file_url: string | null;
    teacher_grade: number | null;
    teacher_feedback: string | null;
}

interface TeacherRoom { id: string; code: string; name: string; }

type View =
    | { name: 'list' }
    | { name: 'create' }
    | { name: 'builder'; quizId: string }
    | { name: 'question-form'; quizId: string; question?: Question; parentQuestionId?: string }
    | { name: 'results'; quiz: Quiz }
    | { name: 'submission-detail'; quiz: Quiz; submission: Submission }
    | { name: 'take-quiz'; quiz: Quiz & { questions: Question[] }; submissionId: string }
    | { name: 'quiz-done'; quiz: Quiz; score: number | null };

interface Props {
    userId: string;
    userName: string;
    userRole: string;
    open: boolean;
    onClose: () => void;
    quizScoreUpdateTrigger?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────
const TYPE_LABELS: Record<QuestionType, string> = {
    text: 'Text Input',
    select: 'Single Select',
    'multi-select': 'Multi Select',
    recording: 'Voice Record',
    video: 'Watch + Answer',
    upload: 'File Upload',
};
const TYPE_ICONS: Record<QuestionType, string> = {
    text: '✏️', select: '🔘', 'multi-select': '☑️',
    recording: '🎙️', video: '🎬', upload: '📎',
};

function fmtDate(s: string) {
    return new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtTime(s: string) {
    return new Date(s).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// ─── Component ────────────────────────────────────────────────────────────
type ConfirmState = {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: 'default' | 'warning' | 'danger';
    onConfirm: () => void;
} | null;

export default function QuizDrawer({ userId, userName, userRole, open, onClose, quizScoreUpdateTrigger = 0 }: Props) {
    const canCreate = userRole === 'teacher' || userRole === 'admin' || userRole === 'member';
    const [view, setView] = useState<View>({ name: 'list' });
    const [confirmState, setConfirmState] = useState<ConfirmState>(null);
    const [alertState, setAlertState] = useState<{ open: boolean; title: string; message: string } | null>(null);
    const showConfirm = useCallback((opts: Omit<NonNullable<ConfirmState>, 'open'>) => {
        setConfirmState({ ...opts, open: true });
    }, []);
    const showAlert = useCallback((title: string, message: string) => {
        setAlertState({ open: true, title, message });
    }, []);
    const [quizzes, setQuizzes] = useState<Quiz[]>([]);
    const [loadingQuizzes, setLoadingQuizzes] = useState(false);
    const [teacherRooms, setTeacherRooms] = useState<TeacherRoom[]>([]);
    const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);

    // ── Fetch quizzes ──────────────────────────────────────────────────────
    const fetchQuizzes = useCallback(async () => {
        if (!userId) return;
        setLoadingQuizzes(true);
        try {
            if (canCreate) {
                const r = await fetch(`${SERVER}/api/quizzes?createdBy=${userId}`);
                if (r.ok) setQuizzes(await r.json());
            } else {
                // Let server resolve room IDs from both enrollments and session targets
                const r = await fetch(`${SERVER}/api/quizzes?studentId=${userId}`);
                if (r.ok) setQuizzes(await r.json());
            }
        } catch { /* ignore */ }
        setLoadingQuizzes(false);
    }, [userId, canCreate]);

    async function fetchCourses() {
        if (!userId) return;
        try {
            const r = await fetch(`${SERVER}/api/courses?createdBy=${userId}`);
            if (r.ok) setCourses(await r.json());
        } catch { /* ignore */ }
    }
    useEffect(() => { if (open) { fetchQuizzes(); if (canCreate) { fetchTeacherRooms(); fetchCourses(); } } }, [open]);
    useEffect(() => { if (open && view.name === 'list') fetchQuizzes(); }, [view]);
    useEffect(() => { if (quizScoreUpdateTrigger > 0) fetchQuizzes(); }, [quizScoreUpdateTrigger, fetchQuizzes]);

    async function fetchTeacherRooms() {
        try {
            const r = await fetch(`${SERVER}/api/teacher/${userId}/rooms`);
            if (r.ok) setTeacherRooms(await r.json());
        } catch { /* ignore */ }
    }

    // ── Back navigation ────────────────────────────────────────────────────
    function goBack() {
        if (view.name === 'question-form') { setView({ name: 'builder', quizId: view.quizId }); return; }
        if (view.name === 'submission-detail') { setView({ name: 'results', quiz: view.quiz }); return; }
        setView({ name: 'list' });
    }

    // ── Render ─────────────────────────────────────────────────────────────
    return (
        <>
            {/* Backdrop */}
            {open && (
                <div
                    onClick={onClose}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999, backdropFilter: 'blur(4px)' }}
                />
            )}

            {/* Modal (centered) */}
            <div style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: open ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -50%) scale(0.95)',
                width: 'min(720px, 94vw)',
                maxHeight: '90vh',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 16,
                zIndex: 1000,
                opacity: open ? 1 : 0,
                pointerEvents: open ? 'auto' : 'none',
                transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease',
                display: 'flex', flexDirection: 'column',
                boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
                overflow: 'hidden',
            }}>
                {/* Header */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '16px 24px', borderBottom: '1px solid var(--border)',
                    background: 'var(--surface)', flexShrink: 0,
                    borderRadius: '16px 16px 0 0',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {view.name !== 'list' && (
                            <button onClick={goBack} className="cd-icon-btn" title="Back">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
                            </button>
                        )}
                        <span style={{ fontWeight: 700, fontSize: 18 }}>
                            {view.name === 'list' && '📝 Quizzes'}
                            {view.name === 'create' && '📝 New Quiz'}
                            {view.name === 'builder' && '🔧 Quiz Builder'}
                            {view.name === 'question-form' && (view.question ? '✏️ Edit Question' : '➕ Add Question')}
                            {view.name === 'results' && `📊 Results — ${view.quiz.title}`}
                            {view.name === 'submission-detail' && `👤 ${view.submission.student_name}`}
                            {view.name === 'take-quiz' && `📋 ${view.quiz.title}`}
                            {view.name === 'quiz-done' && '✅ Quiz Complete!'}
                        </span>
                    </div>
                    <button onClick={onClose} className="cd-icon-btn" title="Close" style={{ fontSize: 22 }}>✕</button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                    {view.name === 'list' && (
                        <QuizList
                            quizzes={quizzes}
                            loading={loadingQuizzes}
                            isTeacher={canCreate}
                            userId={userId}
                            userName={userName}
                            onCreateNew={canCreate ? () => setView({ name: 'create' }) : () => {}}
                            onOpenBuilder={canCreate ? (id) => setView({ name: 'builder', quizId: id }) : () => {}}
                            onViewResults={canCreate ? (quiz) => setView({ name: 'results', quiz }) : () => {}}
                            onTakeQuiz={async (quiz) => {
                                // start or resume submission
                                const r = await fetch(`${SERVER}/api/quizzes/${quiz.id}/start`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ studentId: userId, studentName: userName }),
                                });
                                const sub = await r.json();
                                // fetch full quiz with questions
                                const qr = await fetch(`${SERVER}/api/quizzes/${quiz.id}?role=student`);
                                const fullQuiz = await qr.json();
                                setView({ name: 'take-quiz', quiz: fullQuiz, submissionId: sub.id });
                            }}
                            onDelete={(id) => {
                                setConfirmState({
                                    open: true,
                                    title: 'Delete Quiz',
                                    message: 'Delete this quiz? This cannot be undone.',
                                    confirmLabel: 'Delete',
                                    variant: 'danger',
                                    onConfirm: async () => {
                                        await fetch(`${SERVER}/api/quizzes/${id}`, { method: 'DELETE' });
                                        fetchQuizzes();
                                        setConfirmState(null);
                                    },
                                });
                            }}
                            onTogglePublish={async (quiz) => {
                                const endpoint = quiz.status === 'published' ? 'unpublish' : 'publish';
                                await fetch(`${SERVER}/api/quizzes/${quiz.id}/${endpoint}`, { method: 'POST' });
                                fetchQuizzes();
                            }}
                        />
                    )}
                    {view.name === 'create' && (
                        <CreateQuizForm
                            userId={userId}
                            rooms={teacherRooms}
                            courses={courses}
                            onCreated={(quiz) => {
                                fetchQuizzes();
                                setView({ name: 'builder', quizId: quiz.id });
                            }}
                            onCancel={goBack}
                        />
                    )}
                    {view.name === 'builder' && (
                        <QuizBuilder
                            quizId={view.quizId}
                            showConfirm={showConfirm}
                            onAddQuestion={(q?, parentQuestionId?) => setView({ name: 'question-form', quizId: view.quizId, question: q, parentQuestionId })}
                            onPublish={async () => {
                                await fetch(`${SERVER}/api/quizzes/${view.quizId}/publish`, { method: 'POST' });
                                fetchQuizzes();
                                setView({ name: 'list' });
                            }}
                        />
                    )}
                    {view.name === 'question-form' && (
                        <QuestionForm
                            quizId={view.quizId}
                            question={view.question}
                            parentQuestionId={view.parentQuestionId}
                            onSaved={() => setView({ name: 'builder', quizId: view.quizId })}
                            onCancel={goBack}
                        />
                    )}
                    {view.name === 'results' && (
                        <QuizResults
                            quiz={view.quiz}
                            onViewSubmission={(sub) => setView({ name: 'submission-detail', quiz: view.quiz, submission: sub })}
                        />
                    )}
                    {view.name === 'submission-detail' && (
                        <SubmissionDetail
                            quiz={view.quiz}
                            submission={view.submission}
                            onGraded={(updated) => setView({ name: 'submission-detail', quiz: view.quiz, submission: updated })}
                        />
                    )}
                    {view.name === 'take-quiz' && (
                        <TakeQuiz
                            quiz={view.quiz}
                            submissionId={view.submissionId}
                            userId={userId}
                            showConfirm={showConfirm}
                            showAlert={showAlert}
                            onDone={(score) => setView({ name: 'quiz-done', quiz: view.quiz, score })}
                        />
                    )}
                    {view.name === 'quiz-done' && (
                        <QuizDone
                            quiz={view.quiz}
                            score={view.score}
                            onBack={() => setView({ name: 'list' })}
                        />
                    )}
                </div>
            </div>
            {confirmState && (
                <ConfirmModal
                    open={confirmState.open}
                    title={confirmState.title}
                    message={confirmState.message}
                    confirmLabel={confirmState.confirmLabel}
                    variant={confirmState.variant}
                    onConfirm={() => { confirmState.onConfirm(); setConfirmState(null); }}
                    onCancel={() => setConfirmState(null)}
                />
            )}
            {alertState && (
                <AlertModal
                    open={alertState.open}
                    title={alertState.title}
                    message={alertState.message}
                    onClose={() => setAlertState(null)}
                />
            )}
        </>
    );
}

// ─── Quiz List ────────────────────────────────────────────────────────────
function QuizList({
    quizzes, loading, isTeacher, userId, userName,
    onCreateNew, onOpenBuilder, onViewResults, onTakeQuiz, onDelete, onTogglePublish,
}: {
    quizzes: Quiz[]; loading: boolean; isTeacher: boolean; userId: string; userName: string;
    onCreateNew: () => void;
    onOpenBuilder: (id: string) => void;
    onViewResults: (q: Quiz) => void;
    onTakeQuiz: (q: Quiz) => void;
    onDelete: (id: string) => void;
    onTogglePublish: (q: Quiz) => void;
}) {
    return (
        <div style={{ padding: '12px 16px' }}>
            {isTeacher && (
                <button
                    onClick={onCreateNew}
                    style={{
                        width: '100%', padding: '10px 16px', borderRadius: 12,
                        background: 'linear-gradient(135deg,#f59e0b,#d97706)',
                        color: '#fff', fontWeight: 700, fontSize: 14,
                        border: 'none', cursor: 'pointer', marginBottom: 16,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                >
                    <span style={{ fontSize: 18 }}>+</span> Create New Quiz
                </button>
            )}

            {loading && <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 32 }}>Loading…</p>}

            {!loading && quizzes.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: 40, marginBottom: 10 }}>📝</div>
                    <p>{isTeacher ? 'No quizzes yet. Create your first quiz!' : 'No quizzes assigned yet.'}</p>
                </div>
            )}

            {!loading && quizzes.map((quiz) => (
                <div key={quiz.id} style={{
                    background: 'var(--surface-2)', borderRadius: 14, padding: 14,
                    marginBottom: 10, border: '1px solid var(--border)',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                        <div style={{ fontWeight: 600, fontSize: 15, flex: 1 }}>{quiz.title}</div>
                        {isTeacher && (
                            <span style={{
                                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                                background: quiz.status === 'published' ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                                color: quiz.status === 'published' ? '#22c55e' : '#f59e0b',
                            }}>
                                {quiz.status === 'published' ? 'Published' : 'Draft'}
                            </span>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                        <span>📋 {quiz.question_count ?? 0} questions</span>
                        {quiz.time_limit_minutes && <span>⏱ {quiz.time_limit_minutes} min</span>}
                        {isTeacher && <span>👥 {quiz.submission_count ?? 0} submissions</span>}
                        <span>{fmtDate(quiz.created_at)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {isTeacher ? (
                            <>
                                <button onClick={() => onOpenBuilder(quiz.id)} className="quiz-btn quiz-btn-ghost">
                                    ✏️ Edit
                                </button>
                                <button onClick={() => onViewResults(quiz)} className="quiz-btn quiz-btn-ghost">
                                    📊 Results
                                </button>
                                <button onClick={() => onTogglePublish(quiz)} className="quiz-btn quiz-btn-ghost" style={{ color: quiz.status === 'published' ? '#ef4444' : '#22c55e' }}>
                                    {quiz.status === 'published' ? '🔒 Unpublish' : '🚀 Publish'}
                                </button>
                                <button onClick={() => onDelete(quiz.id)} className="quiz-btn quiz-btn-danger">
                                    🗑
                                </button>
                            </>
                        ) : (
                            quiz.submitted_at ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{
                                        padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                                        background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)',
                                    }}>✅ Submitted</span>
                                    {quiz.my_score !== null && quiz.my_score !== undefined && (
                                        <span style={{ fontSize: 14, fontWeight: 700, color: quiz.my_score >= 70 ? '#22c55e' : quiz.my_score >= 40 ? '#f59e0b' : 'var(--text-muted)' }}>
                                            {quiz.my_score}%
                                        </span>
                                    )}
                                </div>
                            ) : (
                                <button
                                    onClick={() => onTakeQuiz(quiz)}
                                    className="quiz-btn"
                                    style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff', fontWeight: 700 }}
                                >▶ Start Quiz</button>
                            )
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}

// ─── Create Quiz Form ─────────────────────────────────────────────────────
function CreateQuizForm({ userId, rooms, courses, onCreated, onCancel }: {
    userId: string; rooms: TeacherRoom[]; courses: { id: string; title: string }[];
    onCreated: (q: Quiz) => void; onCancel: () => void;
}) {
    const [title, setTitle] = useState('');
    const [roomId, setRoomId] = useState('');
    const [courseId, setCourseId] = useState('');
    const [timeLimit, setTimeLimit] = useState('');
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');

    async function handleCreate() {
        if (!title.trim()) { setErr('Title is required'); return; }
        if (!roomId && !courseId) { setErr('Select a room or course'); return; }
        setSaving(true); setErr('');
        try {
            const r = await fetch(`${SERVER}/api/quizzes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: title.trim(),
                    roomId: roomId || undefined,
                    courseId: courseId || undefined,
                    createdBy: userId,
                    timeLimitMinutes: timeLimit ? Number(timeLimit) : null,
                }),
            });
            const data = await r.json();
            if (!r.ok) { setErr(data.error || 'Failed'); setSaving(false); return; }
            onCreated(data);
        } catch { setErr('Server unreachable'); }
        setSaving(false);
    }

    return (
        <div style={{ padding: 28 }} className="quiz-form-fade-in">
            <div className="quiz-step-indicator">
                <span className="quiz-step-dot active">1</span>
                <span style={{ color: 'var(--text-muted)' }}>Basics</span>
                <span style={{ margin: '0 4px' }}>→</span>
                <span className="quiz-step-dot">2</span>
                <span style={{ color: 'var(--text-muted)' }}>Questions</span>
                <span style={{ margin: '0 4px' }}>→</span>
                <span className="quiz-step-dot">3</span>
                <span style={{ color: 'var(--text-muted)' }}>Publish</span>
            </div>
            <h3 style={{ fontWeight: 700, marginBottom: 24, fontSize: 19 }}>Create New Quiz</h3>

            <label className="quiz-label">Quiz Title</label>
            <input
                className="quiz-input"
                placeholder="e.g. Chapter 3 Review Quiz"
                value={title}
                onChange={e => setTitle(e.target.value)}
                autoFocus
            />

            {courses.length > 0 && (
                <>
                    <label className="quiz-label" style={{ marginTop: 18 }}>Course (optional)</label>
                    <select className="quiz-input" value={courseId} onChange={e => setCourseId(e.target.value)}>
                        <option value="">— No course —</option>
                        {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </select>
                </>
            )}

            <label className="quiz-label" style={{ marginTop: 18 }}>Assign to Room</label>
            {rooms.length === 0 && !courseId ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Select a course above or create a room first.</p>
            ) : (
                <select className="quiz-input" value={roomId} onChange={e => setRoomId(e.target.value)}>
                    <option value="">— Select a room (optional if course set) —</option>
                    {rooms.map(r => <option key={r.id} value={r.id}>{r.name} ({r.code})</option>)}
                </select>
            )}

            <label className="quiz-label" style={{ marginTop: 18 }}>Time Limit (minutes) — optional</label>
            <input
                className="quiz-input"
                type="number" min="1" placeholder="e.g. 30"
                value={timeLimit} onChange={e => setTimeLimit(e.target.value)}
            />

            {err && <p style={{ color: '#ef4444', fontSize: 13, marginTop: 10 }}>{err}</p>}

            <div style={{ display: 'flex', gap: 12, marginTop: 28 }}>
                <button onClick={onCancel} className="quiz-btn quiz-btn-ghost" style={{ flex: 1 }}>Cancel</button>
                <button onClick={handleCreate} disabled={saving} className="quiz-btn quiz-btn-primary" style={{ flex: 2 }}>
                    {saving ? 'Creating…' : 'Create & Add Questions →'}
                </button>
            </div>
        </div>
    );
}

// ─── Quiz Builder ─────────────────────────────────────────────────────────
function QuizBuilder({ quizId, showConfirm, onAddQuestion, onPublish }: {
    quizId: string;
    showConfirm: (opts: Omit<NonNullable<ConfirmState>, 'open'>) => void;
    onAddQuestion: (q?: Question, parentQuestionId?: string) => void;
    onPublish: () => void;
}) {
    const [quiz, setQuiz] = useState<(Quiz & { questions: Question[] }) | null>(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const r = await fetch(`${SERVER}/api/quizzes/${quizId}?role=teacher`);
            if (r.ok) setQuiz(await r.json());
        } catch { /* ignore */ }
        setLoading(false);
    }, [quizId]);

    useEffect(() => { load(); }, [load]);

    function handleDeleteQuestion(id: string) {
        showConfirm({
            title: 'Delete Question',
            message: 'Delete this question?',
            confirmLabel: 'Delete',
            variant: 'danger',
            onConfirm: async () => {
                await fetch(`${SERVER}/api/quiz-questions/${id}`, { method: 'DELETE' });
                load();
            },
        });
    }

    if (loading) return <p style={{ padding: 24, color: 'var(--text-muted)', textAlign: 'center' }}>Loading…</p>;
    if (!quiz) return <p style={{ padding: 24, color: '#ef4444' }}>Quiz not found.</p>;

    return (
        <div style={{ padding: '12px 16px' }}>
            <div style={{
                background: 'var(--surface-2)', borderRadius: 12, padding: 14,
                border: '1px solid var(--border)', marginBottom: 14,
            }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{quiz.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    {quiz.questions.length} questions
                    {quiz.time_limit_minutes ? ` · ${quiz.time_limit_minutes} min limit` : ''}
                    {' · '}
                    <span style={{ color: quiz.status === 'published' ? '#22c55e' : '#f59e0b' }}>
                        {quiz.status === 'published' ? '✅ Published' : '🟡 Draft'}
                    </span>
                </div>
            </div>

            {quiz.questions.length === 0 && (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)' }}>
                    No questions yet. Add your first question below.
                </div>
            )}

            {quiz.questions.map((q, i) => (
                <div key={q.id}>
                    <div className="quiz-builder-card quiz-builder-stagger" style={{
                        background: 'var(--surface-3)', borderRadius: 12, padding: 12,
                        marginBottom: 8, border: '1px solid var(--border)',
                        display: 'flex', gap: 10, alignItems: 'flex-start',
                        animationDelay: `${i * 0.05}s`,
                    }}>
                        <div style={{
                            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                            background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 12, fontWeight: 700,
                        }}>{i + 1}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{q.question_text}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <span>{TYPE_ICONS[q.type]} {TYPE_LABELS[q.type]}</span>
                                <span>· {q.points} pt{q.points !== 1 ? 's' : ''}</span>
                                {(q.type === 'select' || q.type === 'multi-select') && q.options && (
                                    <span>· {q.options.length} options</span>
                                )}
                                {q.type === 'video' && q.children?.length ? (
                                    <span>· {q.children.length} sub-question{q.children.length !== 1 ? 's' : ''}</span>
                                ) : null}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                            <button onClick={() => onAddQuestion(q)} className="cd-icon-btn" title="Edit" style={{ fontSize: 14 }}>✏️</button>
                            {q.type === 'video' && (
                                <button onClick={() => onAddQuestion(undefined, q.id)} className="cd-icon-btn" title="Add sub-question" style={{ fontSize: 14 }}>➕</button>
                            )}
                            <button onClick={() => handleDeleteQuestion(q.id)} className="cd-icon-btn" title="Delete" style={{ fontSize: 14 }}>🗑️</button>
                        </div>
                    </div>
                    {q.type === 'video' && q.children?.length ? (
                        <div style={{ marginLeft: 24, marginBottom: 8, paddingLeft: 12, borderLeft: '2px solid var(--primary)', opacity: 0.9 }}>
                            {q.children.map((child, j) => (
                                <div key={child.id} style={{
                                    display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6,
                                    background: 'var(--surface-2)', borderRadius: 8, padding: 10,
                                    border: '1px solid var(--border)',
                                }}>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{i + 1}{String.fromCharCode(97 + j)}</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 500, fontSize: 13 }}>{child.question_text}</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                            {TYPE_ICONS[child.type]} {TYPE_LABELS[child.type]} · {child.points} pt{child.points !== 1 ? 's' : ''}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 4 }}>
                                        <button onClick={() => onAddQuestion(child)} className="cd-icon-btn" title="Edit" style={{ fontSize: 12 }}>✏️</button>
                                        <button onClick={() => handleDeleteQuestion(child.id)} className="cd-icon-btn" title="Delete" style={{ fontSize: 12 }}>🗑️</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : null}
                </div>
            ))}

            <button
                onClick={() => onAddQuestion()}
                className="quiz-btn quiz-btn-ghost"
                style={{ width: '100%', marginTop: 4, marginBottom: 12, borderStyle: 'dashed' }}
            >
                + Add Question
            </button>

            {quiz.status !== 'published' && quiz.questions.length > 0 && (
                <button
                    onClick={onPublish}
                    className="quiz-btn quiz-btn-primary"
                    style={{ width: '100%', background: 'linear-gradient(135deg,#22c55e,#16a34a)' }}
                >
                    🚀 Publish Quiz to Students
                </button>
            )}
        </div>
    );
}

// ─── Question Form ────────────────────────────────────────────────────────
function QuestionForm({ quizId, question, parentQuestionId, onSaved, onCancel }: {
    quizId: string; question?: Question; parentQuestionId?: string;
    onSaved: () => void; onCancel: () => void;
}) {
    const editing = !!question;
    const isSubQuestion = !!parentQuestionId || !!question?.parent_question_id;
    const [type, setType] = useState<QuestionType>(question?.type || 'text');
    const [questionText, setQuestionText] = useState(question?.question_text || '');
    const [options, setOptions] = useState<string[]>(question?.options || ['', '']);
    const [correctAnswers, setCorrectAnswers] = useState<string[]>(question?.correct_answers || []);
    const [videoUrl, setVideoUrl] = useState(question?.video_url || '');
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [points, setPoints] = useState(String(question?.points || 1));
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');
    const [uploadingVideo, setUploadingVideo] = useState(false);

    const needsOptions = type === 'select' || type === 'multi-select';
    const needsVideo   = type === 'video';

    async function uploadVideoFile() {
        if (!videoFile) return videoUrl;
        setUploadingVideo(true);
        const fd = new FormData();
        fd.append('file', videoFile);
        const r = await fetch(`${SERVER}/api/quiz/upload`, { method: 'POST', body: fd });
        const data = await r.json();
        setUploadingVideo(false);
        return data.url || '';
    }

    async function handleSave() {
        if (!questionText.trim()) { setErr('Question text is required'); return; }
        if (needsOptions && options.filter(o => o.trim()).length < 2) { setErr('At least 2 options required'); return; }
        setSaving(true); setErr('');

        let finalVideoUrl = videoUrl;
        if (needsVideo && videoFile) finalVideoUrl = await uploadVideoFile();

        const cleanOptions = needsOptions ? options.filter(o => o.trim()) : null;
        const payload = {
            type, questionText: questionText.trim(),
            options: cleanOptions,
            correctAnswers: correctAnswers.length ? correctAnswers : null,
            videoUrl: needsVideo ? finalVideoUrl || null : null,
            points: Number(points) || 1,
        };

        try {
            let r: Response;
            if (editing && question) {
                r = await fetch(`${SERVER}/api/quiz-questions/${question.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
            } else {
                const postPayload = { ...payload };
                if (parentQuestionId) (postPayload as Record<string, unknown>).parentQuestionId = parentQuestionId;
                r = await fetch(`${SERVER}/api/quizzes/${quizId}/questions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(postPayload),
                });
            }
            if (!r.ok) { const d = await r.json(); setErr(d.error || 'Failed'); setSaving(false); return; }
            onSaved();
        } catch { setErr('Server unreachable'); }
        setSaving(false);
    }

    return (
        <div style={{ padding: 20 }} className="quiz-form-fade-in">
            <h3 style={{ fontWeight: 700, marginBottom: 16, fontSize: 16 }}>
                {editing ? 'Edit Question' : isSubQuestion ? 'Add Sub-question (under video)' : 'Add Question'}
            </h3>

            {/* Type Picker - sub-questions cannot be video type */}
            <label className="quiz-label">Question Type</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                {(Object.keys(TYPE_LABELS) as QuestionType[]).filter(t => !isSubQuestion || t !== 'video').map(t => (
                    <button
                        key={t}
                        onClick={() => setType(t)}
                        className="quiz-type-pill"
                        style={{
                            padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                            border: '1.5px solid', cursor: 'pointer',
                            borderColor: type === t ? 'var(--primary)' : 'var(--border)',
                            background: type === t ? 'rgba(99,102,241,0.15)' : 'var(--surface-3)',
                            color: type === t ? 'var(--primary)' : 'var(--text-muted)',
                        }}
                    >
                        {TYPE_ICONS[t]} {TYPE_LABELS[t]}
                    </button>
                ))}
            </div>

            {/* Question Text */}
            <label className="quiz-label">Question</label>
            <textarea
                className="quiz-input"
                style={{ minHeight: 80, resize: 'vertical' }}
                placeholder="Type your question here…"
                value={questionText}
                onChange={e => setQuestionText(e.target.value)}
            />

            {/* Points — prominent placement */}
            <div style={{
                marginTop: 14, display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', background: 'rgba(99,102,241,0.08)', borderRadius: 10,
                border: '1px solid rgba(99,102,241,0.2)',
            }}>
                <label style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0, whiteSpace: 'nowrap' }}>
                    Points
                </label>
                <input
                    className="quiz-input"
                    type="number" min="0" step="0.5"
                    style={{ width: 80, margin: 0, textAlign: 'center', fontWeight: 700, fontSize: 16 }}
                    value={points} onChange={e => setPoints(e.target.value)}
                />
                <span style={{
                    fontSize: 12, fontWeight: 600, color: '#6366f1',
                    background: 'rgba(99,102,241,0.15)', borderRadius: 8, padding: '3px 10px',
                }}>
                    {Number(points) || 0} pt{Number(points) !== 1 ? 's' : ''}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Max grade for this question
                </span>
            </div>

            {/* Options (select / multi-select) */}
            {needsOptions && (
                <div style={{ marginTop: 14 }}>
                    <label className="quiz-label">Answer Options</label>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                        {type === 'select' ? 'Click the correct answer to mark it.' : 'Click one or more correct answers.'}
                    </p>
                    {options.map((opt, i) => (
                        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                            <button
                                onClick={() => {
                                    if (type === 'select') {
                                        setCorrectAnswers(correctAnswers.includes(opt) ? [] : [opt]);
                                    } else {
                                        setCorrectAnswers(prev =>
                                            prev.includes(opt) ? prev.filter(a => a !== opt) : [...prev, opt]
                                        );
                                    }
                                }}
                                style={{
                                    width: 26, height: 26, borderRadius: type === 'select' ? '50%' : 6,
                                    border: '2px solid', flexShrink: 0, cursor: 'pointer',
                                    borderColor: correctAnswers.includes(opt) ? '#22c55e' : 'var(--border)',
                                    background: correctAnswers.includes(opt) ? 'rgba(34,197,94,0.2)' : 'transparent',
                                    fontSize: 12, color: '#22c55e',
                                }}
                                title="Mark as correct"
                            >
                                {correctAnswers.includes(opt) ? '✓' : ''}
                            </button>
                            <input
                                className="quiz-input"
                                style={{ flex: 1, marginBottom: 0 }}
                                placeholder={`Option ${i + 1}`}
                                value={opt}
                                onChange={e => {
                                    const was = options[i];
                                    const newOpts = options.map((o, j) => j === i ? e.target.value : o);
                                    setOptions(newOpts);
                                    // keep correct answers in sync
                                    setCorrectAnswers(prev => prev.map(a => a === was ? e.target.value : a));
                                }}
                            />
                            {options.length > 2 && (
                                <button
                                    onClick={() => {
                                        const removed = options[i];
                                        setOptions(options.filter((_, j) => j !== i));
                                        setCorrectAnswers(prev => prev.filter(a => a !== removed));
                                    }}
                                    className="cd-icon-btn" style={{ color: '#ef4444' }}
                                >✕</button>
                            )}
                        </div>
                    ))}
                    <button
                        onClick={() => setOptions([...options, ''])}
                        className="quiz-btn quiz-btn-ghost"
                        style={{ fontSize: 12, padding: '4px 12px' }}
                    >+ Add Option</button>
                </div>
            )}

            {/* Video Source */}
            {needsVideo && (
                <div style={{ marginTop: 14 }}>
                    <label className="quiz-label">Video Source</label>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                        <input
                            className="quiz-input"
                            style={{ flex: 1, marginBottom: 0 }}
                            placeholder="Paste YouTube or video URL…"
                            value={videoUrl}
                            onChange={e => { setVideoUrl(e.target.value); setVideoFile(null); }}
                        />
                        <label style={{
                            padding: '8px 14px', borderRadius: 10, background: 'var(--surface-3)',
                            border: '1px solid var(--border)', cursor: 'pointer', fontSize: 13,
                            whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                            📎 Upload
                            <input type="file" accept="video/*" style={{ display: 'none' }}
                                onChange={e => { if (e.target.files?.[0]) { setVideoFile(e.target.files[0]); setVideoUrl(e.target.files[0].name); } }}
                            />
                        </label>
                    </div>
                    {videoFile && <p style={{ fontSize: 12, color: '#22c55e' }}>✅ {videoFile.name}</p>}
                    {uploadingVideo && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Uploading video…</p>}
                </div>
            )}

            {err && <p style={{ color: '#ef4444', fontSize: 13, marginTop: 8 }}>{err}</p>}

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button onClick={onCancel} className="quiz-btn quiz-btn-ghost" style={{ flex: 1 }}>Cancel</button>
                <button onClick={handleSave} disabled={saving} className="quiz-btn quiz-btn-primary" style={{ flex: 2 }}>
                    {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Question'}
                </button>
            </div>
        </div>
    );
}

// ─── Quiz Results (Teacher) ───────────────────────────────────────────────
function QuizResults({ quiz, onViewSubmission }: { quiz: Quiz; onViewSubmission: (s: Submission) => void; }) {
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`${SERVER}/api/quizzes/${quiz.id}/submissions`)
            .then(r => r.json()).then(setSubmissions).catch(() => {}).finally(() => setLoading(false));
    }, [quiz.id]);

    if (loading) return <p style={{ padding: 24, color: 'var(--text-muted)', textAlign: 'center' }}>Loading…</p>;

    return (
        <div style={{ padding: '12px 16px' }}>
            <div style={{ fontWeight: 600, marginBottom: 14, color: 'var(--text-muted)' }}>
                {submissions.length} submission{submissions.length !== 1 ? 's' : ''}
            </div>
            {submissions.length === 0 && (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 32 }}>No submissions yet.</p>
            )}
            {submissions.map(sub => (
                <div key={sub.id} style={{
                    background: 'var(--surface-2)', borderRadius: 12, padding: 14,
                    marginBottom: 8, border: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                }} onClick={() => onViewSubmission(sub)}>
                    <div style={{
                        width: 38, height: 38, borderRadius: '50%', background: 'var(--primary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: 15, flexShrink: 0,
                    }}>
                        {sub.student_name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600 }}>{sub.student_name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            {sub.submitted_at ? `Submitted ${fmtDate(sub.submitted_at)} at ${fmtTime(sub.submitted_at)}` : 'In progress…'}
                        </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        {sub.submitted_at ? (
                            <span style={{
                                fontWeight: 700, fontSize: 18,
                                color: sub.score !== null ? (sub.score >= 70 ? '#22c55e' : sub.score >= 40 ? '#f59e0b' : '#ef4444') : 'var(--text-muted)',
                            }}>
                                {sub.score !== null ? `${sub.score}%` : 'Pending'}
                            </span>
                        ) : (
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
                        )}
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>View →</div>
                    </div>
                </div>
            ))}
        </div>
    );
}

// ─── Submission Detail (Teacher Grading) ──────────────────────────────────
function SubmissionDetail({ quiz, submission, onGraded }: {
    quiz: Quiz; submission: Submission; onGraded: (s: Submission) => void;
}) {
    const [questions, setQuestions] = useState<Question[]>([]);
    const [grades, setGrades] = useState<Record<string, { grade: string; feedback: string }>>({});
    const [savingId, setSavingId] = useState<string | null>(null);
    const [savedSet, setSavedSet] = useState<Set<string>>(new Set());
    const [overallFeedback, setOverallFeedback] = useState(submission.teacher_overall_feedback || '');
    const [finalScoreOverride, setFinalScoreOverride] = useState(submission.teacher_final_score_override != null ? String(submission.teacher_final_score_override) : '');
    const [savingFeedback, setSavingFeedback] = useState(false);

    useEffect(() => {
        fetch(`${SERVER}/api/quizzes/${quiz.id}?role=teacher`)
            .then(r => r.json()).then(d => setQuestions(d.questions || [])).catch(() => {});
        // pre-fill grades
        const init: Record<string, { grade: string; feedback: string }> = {};
        (submission.answers || []).forEach(a => {
            init[a.id] = { grade: a.teacher_grade !== null ? String(a.teacher_grade) : '', feedback: a.teacher_feedback || '' };
        });
        setGrades(init);
    }, [quiz.id, submission.id]);

    useEffect(() => {
        setOverallFeedback(submission.teacher_overall_feedback || '');
        setFinalScoreOverride(submission.teacher_final_score_override != null ? String(submission.teacher_final_score_override) : '');
    }, [submission.teacher_overall_feedback, submission.teacher_final_score_override]);

    async function saveGrade(answerId: string) {
        setSavingId(answerId);
        const r = await fetch(`${SERVER}/api/quiz-answers/${answerId}/grade`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ grade: grades[answerId]?.grade !== '' ? Number(grades[answerId]?.grade) : null, feedback: grades[answerId]?.feedback || null }),
        });
        const result = await r.json();
        setSavingId(null);
        setSavedSet(prev => new Set([...prev, answerId]));
        if (result.newScore !== undefined) onGraded({ ...submission, score: result.newScore });
    }

    async function saveFeedback() {
        setSavingFeedback(true);
        const r = await fetch(`${SERVER}/api/submissions/${submission.id}/feedback`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                teacherOverallFeedback: overallFeedback,
                teacherFinalScoreOverride: finalScoreOverride !== '' ? Number(finalScoreOverride) : null,
            }),
        });
        const data = await r.json();
        setSavingFeedback(false);
        if (r.ok) onGraded({
            ...submission,
            teacher_overall_feedback: data.teacherOverallFeedback ?? overallFeedback,
            teacher_final_score_override: data.teacherFinalScoreOverride ?? (finalScoreOverride !== '' ? Number(finalScoreOverride) : null),
        });
    }

    const getAnswerForQuestion = (qId: string) => submission.answers?.find(a => a.question_id === qId);
    const effectiveScore = submission.teacher_final_score_override != null ? submission.teacher_final_score_override : submission.score;
    const flatQuestions = questions.flatMap(q => q.children?.length ? [q, ...q.children] : [q]);

    return (
        <div style={{ padding: '12px 16px' }}>
            <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: 12, marginBottom: 14, border: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 700 }}>{submission.student_name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {submission.submitted_at ? `Submitted ${fmtDate(submission.submitted_at)}` : 'Not submitted yet'}
                    {effectiveScore != null && ` · Score: ${effectiveScore}%`}
                </div>
            </div>

            {/* Overall feedback and final score override */}
            <div style={{ background: 'var(--surface-3)', borderRadius: 12, padding: 14, marginBottom: 14, border: '1px solid var(--border)' }}>
                <label className="quiz-label">Overall Feedback</label>
                <textarea
                    className="quiz-input"
                    style={{ minHeight: 60, resize: 'vertical', marginBottom: 10 }}
                    placeholder="Optional overall comment for the student…"
                    value={overallFeedback}
                    onChange={e => setOverallFeedback(e.target.value)}
                />
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <label className="quiz-label" style={{ marginBottom: 0 }}>Final score override %</label>
                    <input
                        className="quiz-input"
                        type="number"
                        min="0"
                        max="100"
                        style={{ width: 70, marginBottom: 0 }}
                        placeholder="Optional"
                        value={finalScoreOverride}
                        onChange={e => setFinalScoreOverride(e.target.value)}
                    />
                    <button
                        onClick={saveFeedback}
                        disabled={savingFeedback}
                        className="quiz-btn quiz-btn-primary"
                        style={{ padding: '6px 14px' }}
                    >
                        {savingFeedback ? '…' : '💾 Save Feedback'}
                    </button>
                </div>
            </div>

            {flatQuestions.map((q, i) => {
                const ans = getAnswerForQuestion(q.id);
                return (
                    <div key={q.id} style={{
                        background: 'var(--surface-3)', borderRadius: 12, padding: 14,
                        marginBottom: 10, border: '1px solid var(--border)',
                    }}>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                            Q{i + 1} · {TYPE_ICONS[q.type]} {TYPE_LABELS[q.type]} · {q.points} pt{q.points !== 1 ? 's' : ''}
                        </div>
                        <div style={{ fontWeight: 600, marginBottom: 8 }}>{q.question_text}</div>

                        {/* Student answer */}
                        <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: 10, marginBottom: 8, fontSize: 14 }}>
                            {!ans ? (
                                <span style={{ color: 'var(--text-muted)' }}>No answer given</span>
                            ) : ans.selected_options ? (
                                <div>{(Array.isArray(ans.selected_options) ? ans.selected_options : JSON.parse(String(ans.selected_options))).map((o: string) => (
                                    <span key={o} style={{
                                        display: 'inline-block', padding: '2px 10px', borderRadius: 20,
                                        background: 'rgba(99,102,241,0.15)', color: 'var(--primary)',
                                        fontSize: 12, marginRight: 4,
                                    }}>{o}</span>
                                ))}</div>
                            ) : ans.file_url && (q.type === 'recording' || q.type === 'upload') ? (
                                q.type === 'recording' ? (
                                    <div>
                                        <audio src={ans.file_url} controls style={{ width: '100%', maxWidth: 320, borderRadius: 8 }} />
                                        <a href={ans.file_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, display: 'inline-block' }}>
                                            Open in new tab
                                        </a>
                                    </div>
                                ) : (
                                    <a href={ans.file_url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>
                                        📎 View submission
                                    </a>
                                )
                            ) : ans.file_url ? (
                                <a href={ans.file_url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>
                                    📎 View submission
                                </a>
                            ) : (
                                <span>{ans.answer_text || <span style={{ color: 'var(--text-muted)' }}>Empty</span>}</span>
                            )}
                        </div>

                        {/* Correct answer hint for auto-graded types */}
                        {(q.type === 'select' || q.type === 'multi-select') && q.correct_answers && (
                            <div style={{ fontSize: 12, color: '#22c55e', marginBottom: 8 }}>
                                ✓ Correct: {(Array.isArray(q.correct_answers) ? q.correct_answers : JSON.parse(String(q.correct_answers))).join(', ')}
                            </div>
                        )}

                        {/* Manual grading for text/recording/video/upload */}
                        {(q.type === 'text' || q.type === 'recording' || q.type === 'video' || q.type === 'upload') && ans && (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
                                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>Mark:</span>
                                <input
                                    className="quiz-input"
                                    type="number" min="0" max={q.points}
                                    style={{ width: 65, marginBottom: 0 }}
                                    placeholder="0"
                                    value={grades[ans.id]?.grade ?? ''}
                                    onChange={e => { setGrades(prev => ({ ...prev, [ans.id]: { ...prev[ans.id], grade: e.target.value } })); setSavedSet(prev => { const n = new Set(prev); n.delete(ans.id); return n; }); }}
                                />
                                <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>/ {q.points}</span>
                                <input
                                    className="quiz-input"
                                    style={{ flex: 1, marginBottom: 0, minWidth: 100 }}
                                    placeholder="Feedback (optional)"
                                    value={grades[ans.id]?.feedback ?? ''}
                                    onChange={e => setGrades(prev => ({ ...prev, [ans.id]: { ...prev[ans.id], feedback: e.target.value } }))}
                                />
                                <button
                                    onClick={() => saveGrade(ans.id)}
                                    disabled={savingId === ans.id}
                                    className="quiz-btn quiz-btn-primary"
                                    style={{ padding: '6px 12px', whiteSpace: 'nowrap' }}
                                >
                                    {savingId === ans.id ? '…' : savedSet.has(ans.id) ? '✅ Saved' : '💾 Save'}
                                </button>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ─── Take Quiz (Student) ──────────────────────────────────────────────────
export function TakeQuiz({ quiz, submissionId, userId, showConfirm, showAlert, onDone }: {
    quiz: Quiz & { questions: Question[] };
    submissionId: string;
    userId: string;
    showConfirm: (opts: Omit<NonNullable<ConfirmState>, 'open'>) => void;
    showAlert: (title: string, message: string) => void;
    onDone: (score: number | null) => void;
}) {
    const [answers, setAnswers] = useState<Record<string, Answer>>({});
    const [currentIdx, setCurrentIdx] = useState(0);
    const [direction, setDirection] = useState<'next' | 'prev'>('next');
    const [submitting, setSubmitting] = useState(false);
    const [timeLeft, setTimeLeft] = useState<number | null>(
        quiz.time_limit_minutes ? quiz.time_limit_minutes * 60 : null
    );
    const [recording, setRecording] = useState(false);
    const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
    const [uploading, setUploading] = useState(false);
    const [audioDevices, setAudioDevices] = useState<{ deviceId: string; label: string }[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
    const [audioLevel, setAudioLevel] = useState(0);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationRef = useRef<number | null>(null);
    const [localRecordUrls, setLocalRecordUrls] = useState<Record<string, string>>({});
    const chunksRef = useRef<Blob[]>([]);
    const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Flatten nested questions (video parent + children) for take-quiz navigation
    const flatQuestions = (quiz.questions || []).flatMap((q: Question) =>
        q.children?.length ? [q, ...q.children] : [q]
    );
    const q = flatQuestions[currentIdx];
    const totalQ = flatQuestions.length;

    // Timer
    useEffect(() => {
        if (timeLeft === null) return;
        if (timeLeft <= 0) { handleSubmit(); return; }
        const t = setTimeout(() => setTimeLeft(prev => (prev !== null ? prev - 1 : null)), 1000);
        return () => clearTimeout(t);
    }, [timeLeft]);

    // Auto-save current answers every 30s
    useEffect(() => {
        if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
        autoSaveTimer.current = setTimeout(() => saveAnswers(), 30000);
        return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
    }, [answers]);

    // Enumerate audio input devices for mic picker
    useEffect(() => {
        navigator.mediaDevices.enumerateDevices().then(devices => {
            const inputs = devices.filter(d => d.kind === 'audioinput').map(d => ({ deviceId: d.deviceId, label: d.label || `Microphone ${d.deviceId.slice(0, 8)}` }));
            setAudioDevices(inputs);
            setSelectedDeviceId(prev => (prev || (inputs[0]?.deviceId ?? '')));
        }).catch(() => {});
    }, []);

    // Waveform animation during recording
    useEffect(() => {
        if (!recording || !analyserRef.current) return;
        const analyser = analyserRef.current;
        const data = new Uint8Array(analyser.frequencyBinCount);
        function tick() {
            analyser.getByteFrequencyData(data);
            const avg = data.reduce((a, b) => a + b, 0) / data.length;
            setAudioLevel(Math.min(100, (avg / 128) * 100));
            animationRef.current = requestAnimationFrame(tick);
        }
        tick();
        return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
    }, [recording]);

    async function saveAnswers() {
        const payload = Object.values(answers).map(a => ({
            questionId: a.questionId,
            answerText: a.answerText,
            selectedOptions: a.selectedOptions,
            fileUrl: a.fileUrl?.startsWith('blob:') ? null : (a.fileUrl || null),
        }));
        if (!payload.length) return;
        await fetch(`${SERVER}/api/submissions/${submissionId}/answers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answers: payload }),
        }).catch(() => {});
    }

    async function handleSubmit() {
        setSubmitting(true);
        await saveAnswers();
        const r = await fetch(`${SERVER}/api/submissions/${submissionId}/submit`, { method: 'POST' });
        const data = await r.json();
        setSubmitting(false);
        onDone(data.score ?? null);
    }

    function setAnswer(partial: Partial<Answer>) {
        if (!q) return;
        setAnswers(prev => ({ ...prev, [q.id]: { ...prev[q.id], ...partial, questionId: q.id } }));
    }

    async function startRecording() {
        const capturedQId = q.id;
        try {
            const constraints: MediaStreamConstraints = {
                audio: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true,
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            // Set up analyser for waveform
            const ctx = new AudioContext();
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            analyserRef.current = analyser;
            // Pick the best supported codec
            const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4', '']
                .find(t => !t || MediaRecorder.isTypeSupported(t)) ?? '';
            const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
            chunksRef.current = [];
            mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
            mr.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                analyserRef.current = null;
                setAudioLevel(0);
                const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
                // Create a local URL immediately so the student can play back right away
                const localUrl = URL.createObjectURL(blob);
                setLocalRecordUrls(prev => ({ ...prev, [capturedQId]: localUrl }));
                setAnswers(prev => ({ ...prev, [capturedQId]: { ...prev[capturedQId], fileUrl: localUrl, questionId: capturedQId } }));
                // Upload to server for permanent storage
                setUploading(true);
                try {
                    const fd = new FormData();
                    fd.append('file', blob, 'recording.webm');
                    const r = await fetch(`${SERVER}/api/quiz/upload`, { method: 'POST', body: fd });
                    const data = await r.json();
                    if (data.url) setAnswers(prev => ({ ...prev, [capturedQId]: { ...prev[capturedQId], fileUrl: data.url, questionId: capturedQId } }));
                } catch { /* keep local URL as fallback */ }
                setUploading(false);
            };
            mr.start(250); // collect audio every 250ms for reliability
            setMediaRecorder(mr);
            setRecording(true);
        } catch { showAlert('Microphone Access Denied', 'Please allow microphone in your browser settings.'); }
    }

    function stopRecording() {
        mediaRecorder?.stop();
        setMediaRecorder(null);
        setRecording(false);
    }

    async function uploadBlob(blob: Blob, name: string, type: string) {
        setUploading(true);
        const fd = new FormData();
        fd.append('file', blob, name);
        const r = await fetch(`${SERVER}/api/quiz/upload`, { method: 'POST', body: fd });
        const data = await r.json();
        setUploading(false);
        if (data.url) setAnswer({ fileUrl: data.url, fileName: name });
    }

    async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        await uploadBlob(file, file.name, file.type);
    }

    if (!q) return <p style={{ padding: 24, color: 'var(--text-muted)', textAlign: 'center' }}>No questions found.</p>;

    const curAns = answers[q.id] || { questionId: q.id };
    const fmtTimer = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Progress bar + timer */}
            <div style={{ padding: '10px 16px 0', flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        Question {currentIdx + 1} of {totalQ}
                    </span>
                    {timeLeft !== null && (
                        <span style={{
                            fontSize: 13, fontWeight: 700,
                            color: timeLeft < 60 ? '#ef4444' : timeLeft < 300 ? '#f59e0b' : '#22c55e',
                        }}>
                            ⏱ {fmtTimer(timeLeft)}
                        </span>
                    )}
                </div>
                <div style={{ height: 4, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${((currentIdx + 1) / totalQ) * 100}%`, height: '100%', background: '#f59e0b', transition: 'width 0.3s' }} />
                </div>
            </div>

            {/* Question */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                <div
                    key={currentIdx}
                    className={direction === 'next' ? 'quiz-question-enter-next' : 'quiz-question-enter-prev'}
                    style={{ background: 'var(--surface-2)', borderRadius: 14, padding: 16, marginBottom: 14, border: '1px solid var(--border)' }}
                >
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                        {TYPE_ICONS[q.type]} {TYPE_LABELS[q.type]} · {q.points} pt{q.points !== 1 ? 's' : ''}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.5 }}>{q.question_text}</div>
                </div>

                {/* Video player */}
                {q.type === 'video' && q.video_url && (
                    <div style={{ marginBottom: 14 }}>
                        {q.video_url.includes('youtube') || q.video_url.includes('youtu.be') ? (
                            <iframe
                                src={q.video_url.replace('watch?v=', 'embed/').replace('youtu.be/', 'www.youtube.com/embed/')}
                                style={{ width: '100%', height: 200, borderRadius: 12, border: 'none' }}
                                allow="accelerometer; autoplay; encrypted-media; gyroscope"
                                allowFullScreen
                            />
                        ) : (
                            <video src={q.video_url} controls style={{ width: '100%', borderRadius: 12 }} />
                        )}
                    </div>
                )}

                {/* Answer area — skip for video parent (has children); children have their own answer UI */}
                {!q.children?.length && (q.type === 'text' || q.type === 'video') && (
                    <textarea
                        className="quiz-input"
                        style={{ minHeight: 100, resize: 'vertical' }}
                        placeholder="Type your answer here…"
                        value={curAns.answerText || ''}
                        onChange={e => setAnswer({ answerText: e.target.value })}
                    />
                )}

                {!q.children?.length && q.type === 'select' && q.options && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {q.options.map(opt => (
                            <button
                                key={opt}
                                onClick={() => setAnswer({ selectedOptions: [opt] })}
                                style={{
                                    padding: '12px 16px', borderRadius: 12, textAlign: 'left', cursor: 'pointer',
                                    fontWeight: 500, fontSize: 14, border: '2px solid',
                                    borderColor: curAns.selectedOptions?.includes(opt) ? '#f59e0b' : 'var(--border)',
                                    background: curAns.selectedOptions?.includes(opt) ? 'rgba(245,158,11,0.12)' : 'var(--surface-3)',
                                    color: curAns.selectedOptions?.includes(opt) ? '#f59e0b' : 'var(--text)',
                                    transition: 'all 0.15s',
                                }}
                            >
                                {curAns.selectedOptions?.includes(opt) ? '🔘 ' : '○ '}{opt}
                            </button>
                        ))}
                    </div>
                )}

                {!q.children?.length && q.type === 'multi-select' && q.options && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Select all that apply</p>
                        {q.options.map(opt => {
                            const selected = curAns.selectedOptions?.includes(opt) || false;
                            return (
                                <button
                                    key={opt}
                                    onClick={() => {
                                        const prev = curAns.selectedOptions || [];
                                        setAnswer({ selectedOptions: selected ? prev.filter(o => o !== opt) : [...prev, opt] });
                                    }}
                                    style={{
                                        padding: '12px 16px', borderRadius: 12, textAlign: 'left', cursor: 'pointer',
                                        fontWeight: 500, fontSize: 14, border: '2px solid',
                                        borderColor: selected ? '#f59e0b' : 'var(--border)',
                                        background: selected ? 'rgba(245,158,11,0.12)' : 'var(--surface-3)',
                                        color: selected ? '#f59e0b' : 'var(--text)',
                                        transition: 'all 0.15s',
                                        display: 'flex', alignItems: 'center', gap: 10,
                                    }}
                                >
                                    <span style={{
                                        width: 20, height: 20, borderRadius: 4, border: '2px solid',
                                        borderColor: selected ? '#f59e0b' : 'var(--border)',
                                        background: selected ? '#f59e0b' : 'transparent',
                                        flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 12, color: '#fff',
                                    }}>{selected ? '✓' : ''}</span>
                                    {opt}
                                </button>
                            );
                        })}
                    </div>
                )}

                {!q.children?.length && q.type === 'recording' && (
                    <div style={{ textAlign: 'center', padding: '20px 0' }}>
                        {curAns.fileUrl ? (
                            <div>
                                <p style={{ color: '#22c55e', marginBottom: 12 }}>✅ Recording saved</p>
                                <audio src={curAns.fileUrl} controls style={{ width: '100%', borderRadius: 8 }} />
                                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                                    <button
                                        onClick={() => {
                                            if (q && localRecordUrls[q.id]) {
                                                URL.revokeObjectURL(localRecordUrls[q.id]);
                                                setLocalRecordUrls(prev => { const next = { ...prev }; delete next[q.id]; return next; });
                                            }
                                            setAnswer({ fileUrl: undefined, fileName: undefined });
                                        }}
                                        className="quiz-btn quiz-btn-ghost"
                                    >🗑️ Delete & Re-record</button>
                                </div>
                            </div>
                        ) : uploading ? (
                            <p style={{ color: 'var(--text-muted)' }}>Uploading recording…</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                                {audioDevices.length > 1 && !recording && (
                                    <div style={{ width: '100%', maxWidth: 280 }}>
                                        <label className="quiz-label">Microphone</label>
                                        <select
                                            className="quiz-input"
                                            value={selectedDeviceId}
                                            onChange={e => setSelectedDeviceId(e.target.value)}
                                            style={{ marginBottom: 0 }}
                                        >
                                            {audioDevices.map(d => (
                                                <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                <button
                                    onClick={recording ? stopRecording : startRecording}
                                    style={{
                                        width: 80, height: 80, borderRadius: '50%', border: 'none', cursor: 'pointer',
                                        background: recording ? '#ef4444' : 'linear-gradient(135deg,#f59e0b,#d97706)',
                                        fontSize: 28, boxShadow: recording ? '0 0 0 8px rgba(239,68,68,0.2)' : 'none',
                                        transition: 'transform 0.08s ease-out, box-shadow 0.2s, background 0.2s',
                                        transform: recording ? `scale(${1 + (audioLevel / 100) * 0.15})` : 'scale(1)',
                                    }}
                                >
                                    {recording ? '⏹' : '🎙️'}
                                </button>
                                {recording && (
                                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 28 }}>
                                        {[0, 1, 2, 3, 4, 5, 6, 7].map(i => {
                                            const center = 3.5;
                                            const factor = 1 - Math.abs(i - center) / (center + 1);
                                            const h = Math.max(6, 6 + (audioLevel / 100) * 20 * factor);
                                            return (
                                                <div
                                                    key={i}
                                                    style={{
                                                        width: 5,
                                                        height: h,
                                                        background: 'linear-gradient(to top, #ef4444, #f87171)',
                                                        borderRadius: 2,
                                                        transition: 'height 0.08s ease-out',
                                                    }}
                                                />
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                        {recording && <p style={{ marginTop: 10, color: '#ef4444', fontSize: 14 }}>Recording… tap to stop</p>}
                    </div>
                )}

                {!q.children?.length && q.type === 'upload' && (
                    <div style={{ textAlign: 'center', padding: '20px 0' }}>
                        {curAns.fileUrl ? (
                            <div>
                                <p style={{ color: '#22c55e', marginBottom: 8 }}>✅ {curAns.fileName || 'File uploaded'}</p>
                                <button
                                    onClick={() => setAnswer({ fileUrl: undefined, fileName: undefined })}
                                    className="quiz-btn quiz-btn-ghost"
                                >🔄 Replace file</button>
                            </div>
                        ) : uploading ? (
                            <p style={{ color: 'var(--text-muted)' }}>Uploading…</p>
                        ) : (
                            <label style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                                padding: '30px 20px', borderRadius: 14, cursor: 'pointer',
                                border: '2px dashed var(--border)', background: 'var(--surface-3)',
                            }}>
                                <span style={{ fontSize: 36 }}>📎</span>
                                <span style={{ fontWeight: 600, fontSize: 14 }}>Click to choose file</span>
                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Any file type accepted</span>
                                <input type="file" style={{ display: 'none' }} onChange={handleFileUpload} />
                            </label>
                        )}
                    </div>
                )}
            </div>

            {/* Navigation + Submit */}
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', gap: 8 }}>
                <button
                    onClick={() => { setDirection('prev'); setCurrentIdx(prev => Math.max(0, prev - 1)); }}
                    disabled={currentIdx === 0 || uploading || recording}
                    className="quiz-btn quiz-btn-ghost"
                    style={{ flex: 1 }}
                >← Prev</button>

                {currentIdx < totalQ - 1 ? (
                    <button
                        onClick={() => { setDirection('next'); setCurrentIdx(prev => prev + 1); }}
                        disabled={uploading || recording}
                        className="quiz-btn quiz-btn-primary"
                        style={{ flex: 2, background: uploading ? 'var(--surface-3)' : '#f59e0b' }}
                    >{uploading ? '⏳ Uploading…' : 'Next →'}</button>
                ) : (
                    <button
                        onClick={() => {
                        showConfirm({
                            title: 'Submit Quiz',
                            message: 'Submit quiz? You cannot change answers after submitting.',
                            confirmLabel: 'Submit',
                            variant: 'default',
                            onConfirm: () => handleSubmit(),
                        });
                    }}
                        disabled={submitting || uploading || recording}
                        className="quiz-btn quiz-btn-primary"
                        style={{ flex: 2, background: '#22c55e', opacity: (submitting || uploading) ? 0.7 : 1 }}
                    >
                        {uploading ? '⏳ Uploading…' : submitting ? 'Submitting…' : '✅ Submit Quiz'}
                    </button>
                )}
            </div>
        </div>
    );
}

// ─── Quiz Done (Student) ──────────────────────────────────────────────────
function QuizDone({ quiz, score, onBack }: { quiz: Quiz; score: number | null; onBack: () => void; }) {
    const isPureZero = score === 0;
    const color = score === null || isPureZero ? '#7b7b99' : score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444';
    const emoji = score === null || isPureZero ? '📝' : score >= 70 ? '🎉' : score >= 40 ? '👍' : '💪';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, height: '100%', textAlign: 'center' }}>
            <div className="quiz-done-bounce" style={{ fontSize: 60, marginBottom: 16 }}>{emoji}</div>
            <h2 style={{ fontWeight: 700, fontSize: 22, marginBottom: 8 }}>Quiz Submitted!</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.5 }}>
                You've completed <strong>{quiz.title}</strong>.
            </p>
            {score !== null ? (
                <>
                    <div className="quiz-done-bounce" style={{
                        width: 100, height: 100, borderRadius: '50%',
                        border: `4px solid ${color}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 28, fontWeight: 700, color, marginBottom: 12,
                    }}>
                        {score}%
                    </div>
                    <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 24 }}>
                        {score >= 70 ? 'Great work!' : score >= 40 ? 'Good effort — keep practising!' : score === 0 ? 'Your teacher will mark the rest of your answers.' : 'Keep studying, you can do it!'}
                    </p>
                </>
            ) : (
                <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: 14 }}>
                    Your teacher will review and grade your answers shortly.
                </p>
            )}
            <button onClick={onBack} className="quiz-btn quiz-btn-primary" style={{ width: '100%', maxWidth: 280 }}>
                Back to Quizzes
            </button>
        </div>
    );
}
