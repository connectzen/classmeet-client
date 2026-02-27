import { useState, useEffect, useCallback } from 'react';

const SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

type LessonType = 'text' | 'video' | 'audio';

interface Lesson {
    id: string;
    title: string;
    content: string;
    order_index: number;
    lesson_type: LessonType;
    video_url: string | null;
    audio_url: string | null;
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
    const [lessons, setLessons] = useState<Lesson[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeLessonIdx, setActiveLessonIdx] = useState(0);

    const fetchLessons = useCallback(async () => {
        try {
            const r = await fetch(`${SERVER}/api/courses/${course.id}/lessons`);
            if (r.ok) {
                const data = await r.json();
                setLessons((data as { id: string; title: string; content: string | null; order_index: number; lesson_type?: string; video_url?: string | null; audio_url?: string | null }[])
                    .sort((a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index)
                    .map((l: { id: string; title: string; content: string | null; order_index: number; lesson_type?: string; video_url?: string | null; audio_url?: string | null }) => ({
                        id: l.id,
                        title: l.title,
                        content: l.content || '',
                        order_index: l.order_index,
                        lesson_type: (l.lesson_type || 'text') as LessonType,
                        video_url: l.video_url || null,
                        audio_url: l.audio_url || null,
                    })));
            }
        } catch { /* ignore */ } finally {
            setLoading(false);
        }
    }, [course.id]);

    useEffect(() => {
        fetchLessons();
    }, [fetchLessons]);

    const lesson = lessons[activeLessonIdx];

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 99999,
                background: 'rgba(0,0,0,0.85)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
            }}
            onClick={onClose}
        >
            <div
                style={{
                    background: 'var(--surface-2, #18181f)',
                    borderRadius: 16,
                    width: '100%',
                    maxWidth: 720,
                    maxHeight: '90vh',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                    border: '1px solid rgba(255,255,255,0.08)',
                }}
                onClick={e => e.stopPropagation()}
            >
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{course.title}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            padding: '8px 16px',
                            borderRadius: 8,
                            border: '1px solid rgba(255,255,255,0.2)',
                            background: 'transparent',
                            color: 'var(--text-muted)',
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >
                        Close
                    </button>
                </div>

                {loading ? (
                    <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>Loading lessons…</div>
                ) : lessons.length === 0 ? (
                    <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>No lessons in this course yet.</div>
                ) : (
                    <>
                        {/* Lesson list sidebar */}
                        <div style={{
                            display: 'flex',
                            borderBottom: '1px solid var(--border)',
                            overflowX: 'auto',
                            padding: '12px 16px',
                            gap: 8,
                            flexShrink: 0,
                        }}>
                            {lessons.map((l, idx) => (
                                <button
                                    key={l.id}
                                    type="button"
                                    onClick={() => setActiveLessonIdx(idx)}
                                    style={{
                                        padding: '8px 14px',
                                        borderRadius: 8,
                                        border: 'none',
                                        background: activeLessonIdx === idx ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.06)',
                                        color: activeLessonIdx === idx ? '#a5b4fc' : 'var(--text-muted)',
                                        fontSize: 13,
                                        fontWeight: 500,
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {l.title || `Lesson ${idx + 1}`}
                                </button>
                            ))}
                        </div>

                        {/* Active lesson content */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
                            {lesson && (
                                <div key={lesson.id}>
                                    <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>
                                        {lesson.title || `Lesson ${activeLessonIdx + 1}`}
                                    </h3>
                                    {lesson.lesson_type === 'video' && lesson.video_url && (
                                        <div style={{ marginBottom: 16 }}>
                                            {lesson.video_url.includes('youtube') || lesson.video_url.includes('youtu.be') ? (
                                                <iframe
                                                    src={lesson.video_url.replace('watch?v=', 'embed/').replace('youtu.be/', 'www.youtube.com/embed/')}
                                                    style={{ width: '100%', aspectRatio: '16/9', borderRadius: 12, border: 'none' }}
                                                    allow="accelerometer; autoplay; encrypted-media; gyroscope"
                                                    allowFullScreen
                                                    title={lesson.title}
                                                />
                                            ) : (
                                                <video src={lesson.video_url} controls style={{ width: '100%', borderRadius: 12 }} />
                                            )}
                                        </div>
                                    )}
                                    {lesson.lesson_type === 'audio' && lesson.audio_url && (
                                        <div style={{ marginBottom: 16 }}>
                                            <audio src={lesson.audio_url} controls style={{ width: '100%', borderRadius: 8 }} />
                                        </div>
                                    )}
                                    {lesson.lesson_type === 'text' && (
                                        lesson.content ? (
                                            <div
                                                className="ql-editor"
                                                style={{
                                                    color: 'var(--text)',
                                                    lineHeight: 1.6,
                                                    fontSize: 14,
                                                }}
                                                dangerouslySetInnerHTML={{ __html: lesson.content }}
                                            />
                                        ) : (
                                            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No content for this lesson.</p>
                                        )
                                    )}
                                    {lesson.lesson_type === 'video' && !lesson.video_url && (
                                        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No video URL for this lesson.</p>
                                    )}
                                    {lesson.lesson_type === 'audio' && !lesson.audio_url && (
                                        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No audio for this lesson.</p>
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
