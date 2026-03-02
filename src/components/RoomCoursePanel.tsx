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
    /** Controlled: current lesson index (owned by Room.tsx) */
    activeLessonIdx: number;
    /** Controlled: current course index (owned by Room.tsx) */
    activeCourseIdx: number;
    /** Called when user navigates to a lesson/course */
    onNav: (courseIdx: number, lessonIdx: number) => void;
    /** Called when course data loads or active course changes, with total lessons */
    onCoursesLoaded?: (totalLessons: number) => void;
    /** Teacher: called when teacher scrolls — broadcasts scroll ratio to students */
    onScrollSync?: (scrollRatio: number) => void;
    /** Student: external scroll ratio from teacher broadcast (0–1) */
    externalScroll?: number | null;
    /** Total lessons count for nav label */
    totalLessons?: number;
}

export default function RoomCoursePanel({
    courseIds, serverUrl, role,
    activeLessonIdx, activeCourseIdx, onNav, onCoursesLoaded,
    onScrollSync, externalScroll,
}: Props) {
    const [courses, setCourses] = useState<CourseData[]>([]);
    const [loading, setLoading] = useState(true);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const contentRef = useRef<HTMLDivElement>(null);
    const scrollThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastScrollRatioRef = useRef<number>(0);

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
        ).then(results => {
            setCourses(results);
        }).finally(() => setLoading(false));
    }, [courseIds, serverUrl]);

    // Notify parent of total lessons for the active course
    useEffect(() => {
        if (courses.length > 0) {
            onCoursesLoaded?.(courses[activeCourseIdx]?.lessons.length ?? 0);
        }
    }, [courses, activeCourseIdx, onCoursesLoaded]);

    // Reset scroll to top when lesson changes
    useEffect(() => {
        if (contentRef.current) contentRef.current.scrollTop = 0;
    }, [activeLessonIdx, activeCourseIdx]);

    // Student: apply external scroll position (always locked)
    useEffect(() => {
        if (isTeacher || externalScroll == null) return;
        const el = contentRef.current;
        if (!el) return;
        const maxScroll = el.scrollHeight - el.clientHeight;
        if (maxScroll > 0) el.scrollTop = externalScroll * maxScroll;
    }, [externalScroll, isTeacher]);

    // Teacher: throttled scroll handler
    const handleTeacherScroll = useCallback(() => {
        if (!isTeacher || !onScrollSync) return;
        const el = contentRef.current;
        if (!el) return;
        const maxScroll = el.scrollHeight - el.clientHeight;
        if (maxScroll <= 0) return;
        const ratio = el.scrollTop / maxScroll;
        if (Math.abs(ratio - lastScrollRatioRef.current) < 0.005) return;
        lastScrollRatioRef.current = ratio;
        if (scrollThrottleRef.current) return;
        scrollThrottleRef.current = setTimeout(() => {
            scrollThrottleRef.current = null;
            onScrollSync(lastScrollRatioRef.current);
        }, 80);
    }, [isTeacher, onScrollSync]);

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                Loading course…
            </div>
        );
    }

    if (!courses.length) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                No courses loaded.
            </div>
        );
    }

    const course = courses[activeCourseIdx] ?? courses[0];
    const lesson = course.lessons[activeLessonIdx] || null;
    const totalLessons = course.lessons.length;
    const canNavPrev = isTeacher && activeLessonIdx > 0;
    const canNavNext = isTeacher && activeLessonIdx < totalLessons - 1;

    return (
        <div style={{
            display: 'flex', flexDirection: 'column', height: '100%',
            background: 'var(--surface-2)', borderRadius: 12, overflow: 'hidden',
        }}>
            {/* Course tabs (if multiple) */}
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

            {/* Body: collapsible sidebar (teacher only) + lesson content */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                {/* Lesson list sidebar — teacher only */}
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
                    onScroll={isTeacher ? handleTeacherScroll : undefined}
                    style={{ flex: 1, overflowY: 'auto', padding: 20, position: 'relative', paddingBottom: isTeacher ? 56 : 20 }}
                >
                    {/* Sidebar toggle button — teacher only */}
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
                </div>
            </div>

            {/* Floating nav bar — teacher only, docked at bottom of panel */}
            {isTeacher && (
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '8px 16px', borderTop: '1px solid var(--border)',
                    background: 'var(--surface-3)', flexShrink: 0,
                }}>
                    <button
                        onClick={() => canNavPrev ? onNav(activeCourseIdx, activeLessonIdx - 1) : undefined}
                        disabled={!canNavPrev}
                        style={{
                            width: 32, height: 32, borderRadius: 8, border: 'none',
                            background: canNavPrev ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
                            color: canNavPrev ? '#a5b4fc' : 'var(--text-muted)',
                            fontSize: 16, cursor: canNavPrev ? 'pointer' : 'not-allowed',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'background 0.15s',
                        }}
                        title="Previous lesson"
                    >←</button>

                    <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 80, textAlign: 'center', fontWeight: 600 }}>
                        {activeLessonIdx + 1} / {totalLessons || 1}
                        <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 4 }}>lesson</span>
                    </span>

                    <button
                        onClick={() => canNavNext ? onNav(activeCourseIdx, activeLessonIdx + 1) : undefined}
                        disabled={!canNavNext}
                        style={{
                            width: 32, height: 32, borderRadius: 8, border: 'none',
                            background: canNavNext ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
                            color: canNavNext ? '#a5b4fc' : 'var(--text-muted)',
                            fontSize: 16, cursor: canNavNext ? 'pointer' : 'not-allowed',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'background 0.15s',
                        }}
                        title="Next lesson"
                    >→</button>
                </div>
            )}
        </div>
    );
}
