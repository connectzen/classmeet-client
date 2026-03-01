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
    /** Teacher: current lock state to show in the toggle button */
    navLockedForStudents?: boolean;
    /** Teacher: called when lock/unlock is toggled */
    onNavLockToggle?: (locked: boolean) => void;
    /** Student: whether they are locked to follow teacher (default true) */
    navLocked?: boolean;
    /** Teacher: called when teacher scrolls — broadcasts scroll ratio to students */
    onScrollSync?: (scrollRatio: number) => void;
    /** Student: external scroll ratio from teacher broadcast (0–1) */
    externalScroll?: number | null;
}

export default function RoomCoursePanel({
    courseIds, serverUrl, role,
    activeLessonIdx, activeCourseIdx, onNav, onCoursesLoaded,
    navLockedForStudents, onNavLockToggle,
    navLocked = true,
    onScrollSync, externalScroll,
}: Props) {
    const [courses, setCourses] = useState<CourseData[]>([]);
    const [loading, setLoading] = useState(true);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const contentRef = useRef<HTMLDivElement>(null);
    const scrollThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastScrollRatioRef = useRef<number>(0);

    const isTeacher = role === 'teacher';
    const canNav = isTeacher || !navLocked;

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

    // Student: apply external scroll position when locked
    useEffect(() => {
        if (isTeacher || !navLocked || externalScroll == null) return;
        const el = contentRef.current;
        if (!el) return;
        const maxScroll = el.scrollHeight - el.clientHeight;
        if (maxScroll > 0) el.scrollTop = externalScroll * maxScroll;
    }, [externalScroll, navLocked, isTeacher]);

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
                            onClick={() => canNav ? onNav(i, 0) : undefined}
                            disabled={!canNav}
                            style={{
                                padding: '4px 12px', borderRadius: 8, border: 'none', fontSize: 13,
                                background: activeCourseIdx === i ? 'rgba(99,102,241,0.3)' : 'var(--surface-3)',
                                color: activeCourseIdx === i ? '#a5b4fc' : 'var(--text-muted)',
                                fontWeight: activeCourseIdx === i ? 700 : 400,
                                cursor: canNav ? 'pointer' : 'default',
                            }}
                        >
                            <RichContent html={c.title} style={{ display: 'inline' }} />
                        </button>
                    ))}
                </div>
            )}

            {/* Header */}
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>📖</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Course</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <RichContent html={course.title} style={{ display: 'inline' }} />
                    </div>
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{course.lessons.length} lesson{course.lessons.length !== 1 ? 's' : ''}</span>

                {/* Teacher: nav lock toggle for students */}
                {isTeacher && (
                    <button
                        onClick={() => onNavLockToggle?.(!navLockedForStudents)}
                        title={navLockedForStudents ? 'Students are following you — click to let them browse freely' : 'Students can browse freely — click to lock them to your screen'}
                        style={{
                            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
                            padding: '4px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                            background: navLockedForStudents ? 'rgba(99,102,241,0.25)' : 'rgba(34,197,94,0.18)',
                            color: navLockedForStudents ? '#a5b4fc' : '#22c55e',
                        }}
                    >
                        <span>{navLockedForStudents ? '🔒' : '🔓'}</span>
                        <span>{navLockedForStudents ? 'Following' : 'Free Nav'}</span>
                    </button>
                )}

                {/* Student: locked indicator */}
                {!isTeacher && navLocked && (
                    <span style={{
                        flexShrink: 0, fontSize: 10, fontWeight: 700, color: '#818cf8',
                        background: 'rgba(99,102,241,0.15)', borderRadius: 6, padding: '3px 8px',
                    }}>
                        🔒 Following teacher
                    </span>
                )}
            </div>

            {/* Body: collapsible sidebar + lesson content */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                {/* Lesson list sidebar — hidden by default, slides in */}
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
                            onClick={() => canNav ? onNav(activeCourseIdx, i) : undefined}
                            disabled={!canNav}
                            style={{
                                display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%',
                                padding: '10px 12px', border: 'none', textAlign: 'left',
                                background: activeLessonIdx === i ? 'rgba(99,102,241,0.18)' : 'transparent',
                                borderLeft: activeLessonIdx === i ? '3px solid #6366f1' : '3px solid transparent',
                                borderBottom: '1px solid var(--border)',
                                cursor: canNav ? 'pointer' : 'default',
                                opacity: !canNav && activeLessonIdx !== i ? 0.6 : 1,
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

                {/* Lesson content — fills full width when sidebar is closed */}
                <div
                    ref={contentRef}
                    onScroll={isTeacher ? handleTeacherScroll : undefined}
                    style={{ flex: 1, overflowY: 'auto', padding: 20, position: 'relative' }}
                >
                    {/* Sidebar toggle button */}
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

                    {lesson ? (
                        <div style={{ paddingLeft: 40 }}>
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
                        <p style={{ color: 'var(--text-muted)', paddingLeft: 40 }}>Select a lesson from the list.</p>
                    )}
                </div>
            </div>
        </div>
    );
}
