import { useState, useEffect, useCallback } from 'react';

const SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

interface Lesson {
    id?: string;
    title: string;
    content: string;
    order_index?: number;
}

interface Course {
    id: string;
    title: string;
    description?: string | null;
    created_by?: string;
}

interface Props {
    userId: string;
    course?: Course | null;
    onClose: () => void;
    onSaved: () => void;
}

export default function CourseEditor({ userId, course, onClose, onSaved }: Props) {
    const isEdit = !!course;
    const [step, setStep] = useState(isEdit ? 2 : 1);
    const [title, setTitle] = useState(course?.title || '');
    const [description, setDescription] = useState(course?.description || '');
    const [lessons, setLessons] = useState<Lesson[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [courseId, setCourseId] = useState<string | null>(course?.id || null);

    const fetchLessons = useCallback(async () => {
        if (!courseId) return;
        try {
            const r = await fetch(`${SERVER}/api/courses/${courseId}/lessons`);
            if (r.ok) {
                const data = await r.json();
                setLessons((data as { id: string; title: string; content: string | null; order_index: number }[]).map(l => ({
                    id: l.id,
                    title: l.title,
                    content: l.content || '',
                    order_index: l.order_index,
                })));
            }
        } catch { /* ignore */ }
    }, [courseId]);

    useEffect(() => {
        if (course) {
            setTitle(course.title);
            setDescription(course.description || '');
            setCourseId(course.id);
        }
    }, [course]);

    useEffect(() => {
        if (courseId) fetchLessons();
    }, [courseId, fetchLessons]);

    async function handleCreateCourse() {
        if (!title.trim() || saving) return;
        setSaving(true);
        try {
            const r = await fetch(`${SERVER}/api/courses`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: title.trim(), description: description.trim() || null, createdBy: userId }),
            });
            if (r.ok) {
                const c = await r.json();
                setCourseId(c.id);
                setStep(2);
            }
        } finally {
            setSaving(false);
        }
    }

    async function handleUpdateCourse() {
        if (!courseId || !title.trim() || saving) return;
        setSaving(true);
        try {
            const r = await fetch(`${SERVER}/api/courses/${courseId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: title.trim(), description: description.trim() || null }),
            });
            if (r.ok) onSaved();
        } finally {
            setSaving(false);
        }
    }

    async function handleAddLesson() {
        if (!courseId || saving) return;
        setSaving(true);
        try {
            const r = await fetch(`${SERVER}/api/courses/${courseId}/lessons`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: 'New Lesson', content: '', orderIndex: lessons.length }),
            });
            if (r.ok) {
                const l = await r.json();
                setLessons(prev => [...prev, { id: l.id, title: l.title, content: l.content || '', order_index: l.order_index }]);
            }
        } finally {
            setSaving(false);
        }
    }

    async function handleUpdateLesson(idx: number, field: 'title' | 'content', value: string) {
        const l = lessons[idx];
        if (!l?.id) return;
        try {
            await fetch(`${SERVER}/api/lessons/${l.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [field]: value }),
            });
            setLessons(prev => prev.map((x, i) => i === idx ? { ...x, [field]: value } : x));
        } catch { /* ignore */ }
    }

    async function handleDeleteLesson(idx: number) {
        const l = lessons[idx];
        if (!l?.id) return;
        setSaving(true);
        try {
            const r = await fetch(`${SERVER}/api/lessons/${l.id}`, { method: 'DELETE' });
            if (r.ok) setLessons(prev => prev.filter((_, i) => i !== idx));
        } finally {
            setSaving(false);
        }
    }

    function moveLesson(idx: number, dir: number) {
        const newIdx = idx + dir;
        if (newIdx < 0 || newIdx >= lessons.length) return;
        const arr = [...lessons];
        [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
        setLessons(arr);
        arr.forEach((l, i) => {
            if (l.id) fetch(`${SERVER}/api/lessons/${l.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderIndex: i }) }).catch(() => {});
        });
    }

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 999999,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20, overflowY: 'auto',
        }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={{
                background: 'var(--surface-2, #18181f)',
                borderRadius: 16,
                width: '100%',
                maxWidth: 560,
                maxHeight: '90vh',
                overflowY: 'auto',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                border: '1px solid rgba(99,102,241,0.2)',
            }} onClick={e => e.stopPropagation()}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
                        {isEdit ? 'Edit Course' : step === 1 ? 'New Course' : 'Add Lessons'}
                    </h2>
                    <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 22, cursor: 'pointer', padding: '2px 6px' }}>×</button>
                </div>

                <div style={{ padding: 24 }}>
                    {step === 1 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div>
                                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Course title</label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    placeholder="e.g. Introduction to Algebra"
                                    style={{
                                        width: '100%', padding: '10px 14px', borderRadius: 10,
                                        border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.2)',
                                        color: 'var(--text)', fontSize: 14, boxSizing: 'border-box',
                                    }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Description (optional)</label>
                                <textarea
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    placeholder="Brief overview of the course..."
                                    rows={3}
                                    style={{
                                        width: '100%', padding: '10px 14px', borderRadius: 10,
                                        border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.2)',
                                        color: 'var(--text)', fontSize: 14, resize: 'vertical', boxSizing: 'border-box',
                                    }}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                                <button type="button" onClick={onClose} style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'var(--text-muted)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                                <button type="button" onClick={handleCreateCourse} disabled={saving || !title.trim()} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: title.trim() && !saving ? '#6366f1' : 'rgba(99,102,241,0.4)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: title.trim() && !saving ? 'pointer' : 'not-allowed' }}>{saving ? 'Creating…' : 'Create & Add Lessons'}</button>
                            </div>
                        </div>
                    )}

                    {step === 2 && courseId && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    onBlur={() => { if (isEdit) handleUpdateCourse(); }}
                                    style={{
                                        flex: 1, minWidth: 160, padding: '8px 12px', borderRadius: 8,
                                        border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.2)',
                                        color: 'var(--text)', fontSize: 14,
                                    }}
                                />
                                <textarea
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    onBlur={() => { if (isEdit) handleUpdateCourse(); }}
                                    placeholder="Description"
                                    rows={1}
                                    style={{
                                        flex: 1, minWidth: 160, padding: '8px 12px', borderRadius: 8,
                                        border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.2)',
                                        color: 'var(--text)', fontSize: 13, resize: 'none',
                                    }}
                                />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>Lessons ({lessons.length})</span>
                                <button type="button" onClick={handleAddLesson} disabled={saving} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>+ Add Lesson</button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {lessons.map((l, idx) => (
                                    <div key={l.id || idx} style={{
                                        padding: 14, background: 'rgba(255,255,255,0.04)', borderRadius: 12,
                                        border: '1px solid rgba(255,255,255,0.08)',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                            <input
                                                value={l.title}
                                                onChange={e => setLessons(prev => prev.map((x, i) => i === idx ? { ...x, title: e.target.value } : x))}
                                                onBlur={e => { if (l.id) handleUpdateLesson(idx, 'title', e.target.value); }}
                                                placeholder="Lesson title"
                                                style={{
                                                    flex: 1, padding: '8px 12px', borderRadius: 8,
                                                    border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)',
                                                    color: 'var(--text)', fontSize: 14,
                                                }}
                                            />
                                            <button type="button" onClick={() => moveLesson(idx, -1)} disabled={idx === 0} style={{ padding: '6px 10px', borderRadius: 6, border: 'none', background: 'rgba(255,255,255,0.08)', color: 'var(--text)', fontSize: 12, cursor: idx === 0 ? 'not-allowed' : 'pointer' }}>↑</button>
                                            <button type="button" onClick={() => moveLesson(idx, 1)} disabled={idx === lessons.length - 1} style={{ padding: '6px 10px', borderRadius: 6, border: 'none', background: 'rgba(255,255,255,0.08)', color: 'var(--text)', fontSize: 12, cursor: idx === lessons.length - 1 ? 'not-allowed' : 'pointer' }}>↓</button>
                                            <button type="button" onClick={() => handleDeleteLesson(idx)} disabled={saving} style={{ padding: '6px 10px', borderRadius: 6, border: 'none', background: 'rgba(239,68,68,0.2)', color: '#ef4444', fontSize: 12, cursor: saving ? 'not-allowed' : 'pointer' }}>Delete</button>
                                        </div>
                                        <textarea
                                            value={l.content}
                                            onChange={e => setLessons(prev => prev.map((x, i) => i === idx ? { ...x, content: e.target.value } : x))}
                                            onBlur={e => { if (l.id) handleUpdateLesson(idx, 'content', e.target.value); }}
                                            placeholder="Lesson content..."
                                            rows={2}
                                            style={{
                                                width: '100%', padding: '8px 12px', borderRadius: 8,
                                                border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)',
                                                color: 'var(--text)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box',
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                                {!isEdit && <button type="button" onClick={() => setStep(1)} style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'var(--text-muted)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Back</button>}
                                <button type="button" onClick={() => { onSaved(); onClose(); }} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: '#6366f1', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Done</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
