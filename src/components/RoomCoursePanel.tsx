import { useState, useEffect } from 'react';
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
    /** Teacher: called when teacher navigates — broadcasts to students */
    onNavigate?: (courseIdx: number, lessonIdx: number) => void;
    /** Teacher: current lock state to show in the toggle button */
    navLockedForStudents?: boolean;
    /** Teacher: called when lock/unlock is toggled */
    onNavLockToggle?: (locked: boolean) => void;
    /** Student: external nav from teacher broadcast (when navLocked = true, follows this) */
    externalNav?: { courseIdx: number; lessonIdx: number } | null;
    /** Student: whether they are locked to follow teacher (default true) */
    navLocked?: boolean;
}

export default function RoomCoursePanel({
    courseIds, serverUrl, role,
    onNavigate, navLockedForStudents, onNavLockToggle,
    externalNav, navLocked = true,
}: Props) {
    const [courses, setCourses] = useState<CourseData[]>([]);
    const [activeCourseIdx, setActiveCourseIdx] = useState(0);
    const [activeLessonIdx, setActiveLessonIdx] = useState(0);
    const [loading, setLoading] = useState(true);

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
            setActiveCourseIdx(0);
            setActiveLessonIdx(0);
        }).finally(() => setLoading(false));
    }, [courseIds, serverUrl]);

    // Student: follow teacher navigation when locked
    useEffect(() => {
        if (!isTeacher && navLocked && externalNav) {
            setActiveCourseIdx(externalNav.courseIdx);
            setActiveLessonIdx(externalNav.lessonIdx);
        }
    }, [externalNav, navLocked, isTeacher]);

    // Teacher navigation helpers — update local state AND broadcast
    const navToCourse = (ci: number, li = 0) => {
        setActiveCourseIdx(ci);
        setActiveLessonIdx(li);
        onNavigate?.(ci, li);
    };
    const navToLesson = (li: number) => {
        setActiveLessonIdx(li);
        onNavigate?.(activeCourseIdx, li);
    };

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

    const course = courses[activeCourseIdx];
    const lesson = course.lessons[activeLessonIdx] || null;
    const totalLessons = course.lessons.length;
    // Students locked to teacher can't navigate independently
    const canNav = isTeacher || !navLocked;

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
                            onClick={() => canNav ? (isTeacher ? navToCourse(i) : setActiveCourseIdx(i)) : undefined}
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
                <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{totalLessons} lesson{totalLessons !== 1 ? 's' : ''}</span>

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

            {/* Body: sidebar + content */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {/* Lesson list sidebar */}
                <div style={{ width: 200, flexShrink: 0, borderRight: '1px solid var(--border)', overflowY: 'auto' }}>
                    {course.lessons.map((l, i) => (
                        <button
                            key={l.id}
                            onClick={() => canNav ? (isTeacher ? navToLesson(i) : setActiveLessonIdx(i)) : undefined}
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

                {/* Lesson content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                    {lesson ? (
                        <>
                            <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{lesson.title}</h3>
                            {lesson.lesson_type === 'video' && lesson.video_url ? (
                                <video src={lesson.video_url} controls style={{ width: '100%', borderRadius: 10, marginBottom: 16, background: '#000' }} />
                            ) : null}
                            {lesson.content ? (
                                <RichContent html={lesson.content} style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-muted)' }} />
                            ) : (
                                <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No content for this lesson.</p>
                            )}
                        </>
                    ) : (
                        <p style={{ color: 'var(--text-muted)' }}>Select a lesson to view its content.</p>
                    )}
                </div>
            </div>

            {/* Navigation footer */}
            <div style={{
                padding: '10px 16px', borderTop: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            }}>
                <button
                    onClick={() => {
                        if (!canNav) return;
                        const next = Math.max(0, activeLessonIdx - 1);
                        isTeacher ? navToLesson(next) : setActiveLessonIdx(next);
                    }}
                    disabled={activeLessonIdx === 0 || !canNav}
                    style={{
                        padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)',
                        background: 'transparent', color: (activeLessonIdx === 0 || !canNav) ? 'var(--text-muted)' : 'var(--text)',
                        cursor: (activeLessonIdx === 0 || !canNav) ? 'default' : 'pointer', fontSize: 13, fontWeight: 600,
                    }}
                >
                    ← Prev
                </button>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Lesson {activeLessonIdx + 1} of {totalLessons || 1}
                </span>
                <button
                    onClick={() => {
                        if (!canNav) return;
                        const next = Math.min(totalLessons - 1, activeLessonIdx + 1);
                        isTeacher ? navToLesson(next) : setActiveLessonIdx(next);
                    }}
                    disabled={activeLessonIdx >= totalLessons - 1 || !canNav}
                    style={{
                        padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)',
                        background: (activeLessonIdx >= totalLessons - 1 || !canNav) ? 'transparent' : 'rgba(99,102,241,0.2)',
                        color: (activeLessonIdx >= totalLessons - 1 || !canNav) ? 'var(--text-muted)' : '#a5b4fc',
                        cursor: (activeLessonIdx >= totalLessons - 1 || !canNav) ? 'default' : 'pointer', fontSize: 13, fontWeight: 600,
                    }}
                >
                    Next →
                </button>
            </div>
        </div>
    );
}
