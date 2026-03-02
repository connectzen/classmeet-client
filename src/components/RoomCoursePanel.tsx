import { useState, useEffect, useRef, useCallback } from 'react';
import { RichContent } from './RichEditor';

interface Lesson {
    id: string;
    title: string;
    content: string;
    lesson_type: string;
    video_url?: string | null;
    order_index: number;
}

interface CourseData {
    id: string;
    title: string;
    lessons: Lesson[];
}

interface Props {
    courseIds: string[];
    serverUrl: string;
    role: string;
    activeLessonIdx: number;
    activeCourseIdx: number;
    onNav: (courseIdx: number, lessonIdx: number) => void;
    onCoursesLoaded?: (totalLessons: number) => void;
}

export default function RoomCoursePanel({
    courseIds, serverUrl, role,
    activeLessonIdx, activeCourseIdx, onNav, onCoursesLoaded,
}: Props) {
    const [courses, setCourses] = useState<CourseData[]>([]);
    const [loading, setLoading] = useState(true);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const isTeacher = role === 'teacher';

    useEffect(() => {
        if (!courseIds.length) { setLoading(false); return; }
        setLoading(true);
        Promise.all(
            courseIds.map(id =>
                Promise.all([
                    fetch(`${serverUrl}/api/courses/${id}`).then(r => r.ok ? r.json() : { id, title: '' }),
                    fetch(`${serverUrl}/api/courses/${id}/lessons`).then(r => r.ok ? r.json() : []),
                ]).then(([course, lessons]) => ({
                    id,
                    title: (course as any).title || '',
                    lessons: Array.isArray(lessons) ? (lessons as Lesson[]).sort((a, b) => a.order_index - b.order_index) : [],
                }))
            )
        ).then(setCourses).finally(() => setLoading(false));
    }, [courseIds, serverUrl]);

    useEffect(() => {
        if (courses.length > 0) {
            onCoursesLoaded?.(courses[activeCourseIdx]?.lessons.length ?? 0);
        }
    }, [courses, activeCourseIdx, onCoursesLoaded]);

    // Always scroll to top when lesson changes
    useEffect(() => {
        if (contentRef.current) contentRef.current.scrollTop = 0;
    }, [activeLessonIdx, activeCourseIdx]);

    if (loading) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
            Loading course…
        </div>
    );

    if (!courses.length) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
            No courses loaded.
        </div>
    );

    const course = courses[activeCourseIdx] ?? courses[0];
    const lesson = course.lessons[activeLessonIdx] || null;
    const totalLessons = course.lessons.length;
    const canNavPrev = activeLessonIdx > 0;
    const canNavNext = activeLessonIdx < totalLessons - 1;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--surface-2)', borderRadius: 12, overflow: 'hidden' }}>

            {/* Course tabs — teacher can switch, student sees active tab only */}
            {courses.length > 1 && (
                <div style={{ display: 'flex', gap: 2, padding: '8px 12px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                    {courses.map((c, i) => (
                        <button
                            key={c.id}
                            onClick={() => isTeacher ? onNav(i, 0) : undefined}
                            disabled={!isTeacher}
                            style={{
                                padding: '4px 12px', borderRadius: 8, border: 'none', fontSize: 13,
                                background: activeCourseIdx === i ? 'rgba(99,102,241,0.3)' : 'var(--surface-3)',
                                color: activeCourseIdx === i ? '#a5b4fc' : 'var(--text-muted)',
                                fontWeight: activeCourseIdx === i ? 700 : 400,
                                cursor: isTeacher ? 'pointer' : 'default',
                            }}
                        >
                            <RichContent html={c.title} style={{ display: 'inline' }} />
                        </button>
                    ))}
                </div>
            )}

            {/* Body */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                {/* Sidebar — teacher only, toggleable */}
                {isTeacher && (
                    <div style={{
                        width: sidebarOpen ? 200 : 0,
                        flexShrink: 0,
                        borderRight: sidebarOpen ? '1px solid var(--border)' : 'none',
                        overflowY: sidebarOpen ? 'auto' : 'hidden',
                        overflowX: 'hidden',
                        transition: 'width 0.2s ease',
                    }}>
                        {course.lessons.map((l, i) => (
                            <button
                                key={l.id}
                                onClick={() => onNav(activeCourseIdx, i)}
                                style={{
                                    display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%',
                                    padding: '10px 12px', border: 'none', textAlign: 'left',
                                    background: activeLessonIdx === i ? 'rgba(99,102,241,0.18)' : 'transparent',
                                    borderLeft: activeLessonIdx === i ? '3px solid #6366f1' : '3px solid transparent',
                                    borderBottom: '1px solid var(--border)',
                                    cursor: 'pointer',
                                }}
                            >
                                <span style={{ fontSize: 11, color: activeLessonIdx === i ? '#818cf8' : 'var(--text-muted)', fontWeight: 700, minWidth: 18, marginTop: 2 }}>{i + 1}.</span>
                                <span style={{ fontSize: 12, color: activeLessonIdx === i ? '#e2e8f0' : 'var(--text-muted)', lineHeight: 1.4, wordBreak: 'break-word' }}>{l.title}</span>
                            </button>
                        ))}
                        {course.lessons.length === 0 && (
                            <div style={{ padding: 16, fontSize: 13, color: 'var(--text-muted)' }}>No lessons yet.</div>
                        )}
                    </div>
                )}

                {/* Lesson content */}
                <div
                    ref={contentRef}
                    style={{ flex: 1, overflowY: 'auto', padding: 20, position: 'relative' }}
                >
                    {/* Sidebar toggle — teacher only */}
                    {isTeacher && (
                        <button
                            onClick={() => setSidebarOpen(v => !v)}
                            title={sidebarOpen ? 'Hide lesson list' : 'Show lesson list'}
                            style={{
                                position: 'absolute', top: 12, left: 12, zIndex: 2,
                                width: 28, height: 28, borderRadius: 7,
                                border: '1px solid var(--border)',
                                background: 'var(--surface-3)',
                                color: 'var(--text-muted)',
                                cursor: 'pointer', fontSize: 14, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            {sidebarOpen ? '‹' : '☰'}
                        </button>
                    )}

                    {lesson ? (
                        <div style={{ paddingLeft: isTeacher ? 40 : 0 }}>
                            <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{lesson.title}</h3>
                            {lesson.lesson_type === 'video' && lesson.video_url ? (
                                <video src={lesson.video_url} controls style={{ width: '100%', borderRadius: 10, marginBottom: 16, background: '#000' }} />
                            ) : null}
                            {lesson.content ? (
                                <RichContent html={lesson.content} style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-muted)' }} />
                            ) : (
                                <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No content for this lesson.</p>
                            )}
                        </div>
                    ) : (
                        <p style={{ color: 'var(--text-muted)', paddingLeft: isTeacher ? 40 : 0 }}>Select a lesson from the list.</p>
                    )}

                    {/* Prev / Next — teacher only, transparent edge arrows */}
                    {isTeacher && (
                        <>
                            <button
                                onClick={() => canNavPrev ? onNav(activeCourseIdx, activeLessonIdx - 1) : undefined}
                                disabled={!canNavPrev}
                                title="Previous lesson"
                                style={{
                                    position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                                    width: 36, height: 48, borderRadius: '0 8px 8px 0',
                                    border: 'none', background: 'transparent',
                                    color: canNavPrev ? '#a5b4fc' : 'rgba(255,255,255,0.18)',
                                    fontSize: 22, cursor: canNavPrev ? 'pointer' : 'not-allowed',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3,
                                    transition: 'background 0.15s',
                                }}
                                onMouseEnter={e => { if (canNavPrev) e.currentTarget.style.background = 'rgba(99,102,241,0.15)'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                            >‹</button>

                            <button
                                onClick={() => canNavNext ? onNav(activeCourseIdx, activeLessonIdx + 1) : undefined}
                                disabled={!canNavNext}
                                title="Next lesson"
                                style={{
                                    position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
                                    width: 36, height: 48, borderRadius: '8px 0 0 8px',
                                    border: 'none', background: 'transparent',
                                    color: canNavNext ? '#a5b4fc' : 'rgba(255,255,255,0.18)',
                                    fontSize: 22, cursor: canNavNext ? 'pointer' : 'not-allowed',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3,
                                    transition: 'background 0.15s',
                                }}
                                onMouseEnter={e => { if (canNavNext) e.currentTarget.style.background = 'rgba(99,102,241,0.15)'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                            >›</button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
