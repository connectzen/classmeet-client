import { useState, useEffect, useCallback } from 'react';
import DOMPurify from 'dompurify';

const SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

function stripHtml(html: string): string {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
}

type LessonType = 'text' | 'video' | 'audio' | 'image';

interface Lesson {
    id: string;
    title: string;
    content: string;
    order_index: number;
    lesson_type: LessonType;
    video_url: string | null;
    audio_url: string | null;
    image_url: string | null;
}

interface Assignment {
    id: string;
    title: string;
    description: string;
    assignment_type: string;
    file_url?: string | null;
    quiz_id?: string | null;
}

interface Topic {
    id: string;
    title: string;
    assignments: Assignment[];
}

interface Course {
    id: string;
    title: string;
    description?: string | null;
}

interface Props {
    course: Course;
    onClose: () => void;
}

export default function CourseViewer({ course, onClose }: Props) {
    const [tab, setTab] = useState<'lessons' | 'assignments'>('lessons');
    const [lessons, setLessons] = useState<Lesson[]>([]);
    const [topics, setTopics] = useState<Topic[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeLessonIdx, setActiveLessonIdx] = useState(0);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [lRes, tRes] = await Promise.all([
                fetch(`${SERVER}/api/courses/${course.id}/lessons`),
                fetch(`${SERVER}/api/courses/${course.id}/topics`),
            ]);
            if (lRes.ok) {
                const data = await lRes.json();
                setLessons((data as { id: string; title: string; content: string | null; order_index: number; lesson_type?: string; video_url?: string | null; audio_url?: string | null; image_url?: string | null }[])
                    .sort((a, b) => a.order_index - b.order_index)
                    .map(l => ({
                        id: l.id,
                        title: l.title,
                        content: l.content || '',
                        order_index: l.order_index,
                        lesson_type: (l.lesson_type || 'text') as LessonType,
                        video_url: l.video_url || null,
                        audio_url: l.audio_url || null,
                        image_url: l.image_url || null,
                    })));
            }
            if (tRes.ok) {
                const tdata = await tRes.json() as Topic[];
                setTopics(tdata);
            }
        } catch { /* ignore */ } finally {
            setLoading(false);
        }
    }, [course.id]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const lesson = lessons[activeLessonIdx];
    const allAssignments: { topic: string; assignment: Assignment }[] = topics.flatMap(t =>
        (t.assignments || []).map(a => ({ topic: stripHtml(t.title), assignment: a }))
    );

    const tabBtn = (key: 'lessons' | 'assignments', label: string, count?: number) => (
        <button
            type="button"
            onClick={() => setTab(key)}
            style={{
                padding: '7px 18px',
                borderRadius: 8,
                border: 'none',
                background: tab === key ? 'rgba(99,102,241,0.25)' : 'transparent',
                color: tab === key ? '#a5b4fc' : 'var(--text-muted)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
            }}
        >
            {label}
            {count !== undefined && (
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 18, height: 18, borderRadius: 100, padding: '0 5px', fontSize: 10, fontWeight: 700, background: tab === key ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.08)', color: tab === key ? '#c7d2fe' : 'var(--text-muted)' }}>
                    {count}
                </span>
            )}
        </button>
    );

    return (
        <div
            style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '60px 24px 40px', overflowY: 'auto' }}
            onClick={onClose}
        >
            <div
                style={{ background: 'var(--surface-2, #18181f)', borderRadius: 16, width: '100%', maxWidth: 720, maxHeight: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(course.title) }} />
                    <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Close</button>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: 4, padding: '10px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                    {tabBtn('lessons', '📖 Lessons', lessons.length)}
                    {tabBtn('assignments', '📋 Assignments', allAssignments.length)}
                </div>

                {loading ? (
                    <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
                ) : tab === 'lessons' ? (
                    lessons.length === 0 ? (
                        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>No lessons in this course yet.</div>
                    ) : (
                        <>
                            {/* Lesson tabs */}
                            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', overflowX: 'auto', padding: '12px 16px', gap: 8, flexShrink: 0 }}>
                                {lessons.map((l, idx) => (
                                    <button key={l.id} type="button" onClick={() => setActiveLessonIdx(idx)}
                                        style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: activeLessonIdx === idx ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.06)', color: activeLessonIdx === idx ? '#a5b4fc' : 'var(--text-muted)', fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                        {l.title || `Lesson ${idx + 1}`}
                                    </button>
                                ))}
                            </div>
                            {/* Active lesson */}
                            <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
                                {lesson && (
                                    <div key={lesson.id}>
                                        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{lesson.title || `Lesson ${activeLessonIdx + 1}`}</h3>
                                        {lesson.lesson_type === 'image' && lesson.image_url && (
                                            <div style={{ marginBottom: 16 }}><img src={lesson.image_url} alt={lesson.title} style={{ width: '100%', borderRadius: 12, display: 'block' }} /></div>
                                        )}
                                        {lesson.lesson_type === 'video' && lesson.video_url && (
                                            <div style={{ marginBottom: 16 }}>
                                                {lesson.video_url.includes('youtube') || lesson.video_url.includes('youtu.be') ? (
                                                    <iframe src={lesson.video_url.replace('watch?v=', 'embed/').replace('youtu.be/', 'www.youtube.com/embed/')} style={{ width: '100%', aspectRatio: '16/9', borderRadius: 12, border: 'none' }} allow="accelerometer; autoplay; encrypted-media; gyroscope" allowFullScreen title={lesson.title} />
                                                ) : (
                                                    <video src={lesson.video_url} controls style={{ width: '100%', borderRadius: 12 }} />
                                                )}
                                            </div>
                                        )}
                                        {lesson.lesson_type === 'audio' && lesson.audio_url && (
                                            <div style={{ marginBottom: 16 }}><audio src={lesson.audio_url} controls style={{ width: '100%', borderRadius: 8 }} /></div>
                                        )}
                                        {lesson.lesson_type === 'text' && (
                                            lesson.content ? (
                                                <>
                                                    <style>{`.lesson-html-content p{margin:0 0 8px}.lesson-html-content ul,.lesson-html-content ol{padding-left:20px;margin:0 0 8px}.lesson-html-content blockquote{border-left:3px solid #6366f1;padding-left:12px;color:#94a3b8;margin:0 0 8px;font-style:italic}.lesson-html-content strong{color:#f1f5f9}.lesson-html-content em{color:#cbd5e1}.lesson-html-content a{color:#818cf8;text-decoration:underline}`}</style>
                                                    <div className="lesson-html-content" style={{ color: 'var(--text)', lineHeight: 1.7, fontSize: 14 }} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(lesson.content) }} />
                                                </>
                                            ) : (
                                                <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No content for this lesson.</p>
                                            )
                                        )}
                                        {lesson.lesson_type === 'video' && !lesson.video_url && <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No video URL for this lesson.</p>}
                                        {lesson.lesson_type === 'audio' && !lesson.audio_url && <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No audio for this lesson.</p>}
                                    </div>
                                )}
                            </div>
                        </>
                    )
                ) : (
                    /* Assignments tab */
                    allAssignments.length === 0 ? (
                        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>No assignments in this course yet.</div>
                    ) : (
                        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {allAssignments.map(({ topic, assignment: a }) => (
                                <div key={a.id} style={{ padding: '14px 16px', borderRadius: 12, border: '1px solid rgba(251,191,36,0.2)', background: 'rgba(251,191,36,0.04)' }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{topic}</div>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                        <span style={{ fontSize: 20, flexShrink: 0 }}>
                                            {a.assignment_type === 'link' ? '🔗' : a.assignment_type === 'file' ? '📎' : a.assignment_type === 'quiz' ? '📝' : '📋'}
                                        </span>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 600, fontSize: 14, color: '#fcd34d', marginBottom: 4 }}>{stripHtml(a.title)}</div>
                                            {a.description && <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>{stripHtml(a.description)}</div>}
                                            {a.file_url && (
                                                <a href={a.file_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#818cf8', marginTop: 4, display: 'inline-block' }}>
                                                    Open file ↗
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                )}
            </div>
        </div>
    );
}
