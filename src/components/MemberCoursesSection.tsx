import { useState, useEffect, useCallback } from 'react';
import CourseEditor from './CourseEditor';
import CourseViewer from './CourseViewer';

const SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

interface Course { id: string; title: string; description?: string | null; created_at?: string; }

export default function MemberCoursesSection({ userId, onCoursesChange }: { userId: string; onCoursesChange?: () => void }) {
    const [courses, setCourses] = useState<Course[]>([]);
    const [loading, setLoading] = useState(false);
    const [editingCourse, setEditingCourse] = useState<Course | null>(null);
    const [viewingCourse, setViewingCourse] = useState<Course | null>(null);
    const [showCreate, setShowCreate] = useState(false);

    const fetchCourses = useCallback(async () => {
        setLoading(true);
        try {
            const r = await fetch(`${SERVER}/api/courses?createdBy=${userId}`);
            if (r.ok) setCourses(await r.json());
        } catch { /* ignore */ }
        setLoading(false);
    }, [userId]);

    useEffect(() => { fetchCourses(); }, [fetchCourses]);

    return (
        <div style={{ marginTop: 20, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Courses</h3>
                <button
                    type="button"
                    onClick={() => setShowCreate(true)}
                    style={{
                        padding: '6px 14px',
                        borderRadius: 8,
                        border: '1px solid var(--primary, #6366f1)',
                        background: 'transparent',
                        color: 'var(--primary, #6366f1)',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                    }}
                >
                    + New Course
                </button>
            </div>
            {loading ? <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading courses…</p> : courses.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No courses yet. Create one to add lessons and quizzes.</p>
            ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                    {courses.map(c => (
                        <div
                            key={c.id}
                            style={{
                                padding: 14,
                                background: 'rgba(255,255,255,0.04)',
                                borderRadius: 12,
                                border: '1px solid rgba(255,255,255,0.08)',
                                transition: 'border-color 0.15s, background 0.15s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
                        >
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>{c.title}</div>
                                    {c.description && (
                                        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                            {c.description}
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                                    <button
                                        type="button"
                                        onClick={() => setViewingCourse(c)}
                                        style={{
                                            padding: '6px 12px',
                                            borderRadius: 8,
                                            border: '1px solid rgba(99,102,241,0.4)',
                                            background: 'rgba(99,102,241,0.15)',
                                            color: '#a5b4fc',
                                            fontSize: 12,
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        View Lessons
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setEditingCourse(c)}
                                        style={{
                                            padding: '6px 12px',
                                            borderRadius: 8,
                                            border: '1px solid rgba(255,255,255,0.2)',
                                            background: 'transparent',
                                            color: 'var(--text-muted)',
                                            fontSize: 12,
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        Edit
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            {showCreate && (
                <CourseEditor
                    userId={userId}
                    onClose={() => setShowCreate(false)}
                    onSaved={() => { setShowCreate(false); fetchCourses(); }}
                />
            )}
            {editingCourse && (
                <CourseEditor
                    userId={userId}
                    course={editingCourse}
                    onClose={() => setEditingCourse(null)}
                    onSaved={() => { setEditingCourse(null); fetchCourses(); onCoursesChange?.(); }}
                />
            )}
            {viewingCourse && (
                <CourseViewer
                    course={viewingCourse}
                    onClose={() => setViewingCourse(null)}
                />
            )}
        </div>
    );
}
