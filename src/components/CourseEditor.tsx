import { useState, useEffect, useCallback } from 'react';
import RichEditor, { isRichEmpty } from './RichEditor';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import CurriculumEditor from './CurriculumEditor';

const SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

type LessonType = 'text' | 'video' | 'audio' | 'image';

interface Lesson {
    id?: string;
    title: string;
    content: string;
    order_index?: number;
    lesson_type?: LessonType;
    video_url?: string | null;
    audio_url?: string | null;
    image_url?: string | null;
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


function SortableLessonCard({
    lesson,
    idx,
    onUpdate,
    onDelete,
    saving,
    expanded,
    onToggleExpand,
}: {
    lesson: Lesson;
    idx: number;
    onUpdate: (idx: number, updates: Partial<Lesson>, save?: boolean) => void;
    onDelete: (idx: number) => void;
    saving: boolean;
    expanded: boolean;
    onToggleExpand: () => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: lesson.id || `lesson-${idx}`,
    });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };
    const type = lesson.lesson_type || 'text';

    async function handleAudioUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file || !lesson.id) return;
        const fd = new FormData();
        fd.append('file', file);
        const r = await fetch(`${SERVER}/api/quiz/upload`, { method: 'POST', body: fd });
        const data = await r.json();
        if (data.url) {
            onUpdate(idx, { audio_url: data.url }, false);
            await fetch(`${SERVER}/api/lessons/${lesson.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ audioUrl: data.url }),
            });
        }
        e.target.value = '';
    }

    async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file || !lesson.id) return;
        const fd = new FormData();
        fd.append('file', file);
        const r = await fetch(`${SERVER}/api/quiz/upload`, { method: 'POST', body: fd });
        const data = await r.json();
        if (data.url) {
            onUpdate(idx, { image_url: data.url }, false);
            await fetch(`${SERVER}/api/lessons/${lesson.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageUrl: data.url }),
            });
        }
        e.target.value = '';
    }

    return (
        <div ref={setNodeRef} style={style} className="lesson-card" data-lesson-id={lesson.id}>
            <div style={{
                padding: 14, background: 'rgba(255,255,255,0.04)', borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.08)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div
                        {...attributes}
                        {...listeners}
                        style={{
                            cursor: 'grab', padding: '6px 8px', borderRadius: 6,
                            background: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)',
                            touchAction: 'none',
                        }}
                        title="Drag to reorder"
                    >
                        ⋮⋮
                    </div>
                    <button
                        type="button"
                        onClick={onToggleExpand}
                        style={{
                            padding: '4px 8px', borderRadius: 6, border: 'none', background: 'transparent',
                            color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer',
                        }}
                        title={expanded ? 'Collapse' : 'Expand'}
                    >
                        {expanded ? '▼' : '▶'}
                    </button>
                    <input
                        value={lesson.title}
                        onChange={e => onUpdate(idx, { title: e.target.value }, false)}
                        onBlur={e => { if (lesson.id) onUpdate(idx, { title: e.target.value }, true); }}
                        placeholder="Lesson title"
                        style={{
                            flex: 1, minWidth: 100, padding: '8px 12px', borderRadius: 8,
                            border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)',
                            color: 'var(--text)', fontSize: 14,
                        }}
                    />
                    <select
                        value={type}
                        onChange={e => onUpdate(idx, { lesson_type: e.target.value as LessonType }, false)}
                        onBlur={() => { if (lesson.id) onUpdate(idx, { lesson_type: type }, true); }}
                        style={{
                            padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
                            background: '#1e1b4b', color: '#e2e8f0', fontSize: 12,
                            colorScheme: 'dark',
                        }}
                    >
                        <option value="text" style={{ background: '#1e1b4b', color: '#e2e8f0' }}>Text</option>
                        <option value="video" style={{ background: '#1e1b4b', color: '#e2e8f0' }}>Video</option>
                        <option value="audio" style={{ background: '#1e1b4b', color: '#e2e8f0' }}>Audio</option>
                        <option value="image" style={{ background: '#1e1b4b', color: '#e2e8f0' }}>Image</option>
                    </select>
                    <button type="button" onClick={() => onDelete(idx)} disabled={saving} style={{ padding: '6px 10px', borderRadius: 6, border: 'none', background: 'rgba(239,68,68,0.2)', color: '#ef4444', fontSize: 12, cursor: saving ? 'not-allowed' : 'pointer' }}>Delete</button>
                </div>
                {expanded && (
                    <>
                        {type === 'video' && (
                            <div style={{ marginTop: 12 }}>
                                <input
                                    type="url"
                                    value={lesson.video_url || ''}
                                    onChange={e => onUpdate(idx, { video_url: e.target.value }, false)}
                                    onBlur={() => { if (lesson.id) onUpdate(idx, { video_url: lesson.video_url }, true); }}
                                    placeholder="Paste YouTube or video URL…"
                                    style={{
                                        width: '100%', padding: '8px 12px', borderRadius: 8,
                                        border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)',
                                        color: 'var(--text)', fontSize: 13, boxSizing: 'border-box',
                                    }}
                                />
                            </div>
                        )}
                        {type === 'audio' && (
                            <div style={{ marginTop: 12 }}>
                                <label style={{
                                    display: 'inline-block', padding: '8px 14px', borderRadius: 8,
                                    background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)',
                                    cursor: 'pointer', fontSize: 13, color: 'var(--primary)',
                                }}>
                                    📎 Upload audio
                                    <input type="file" accept="audio/*" style={{ display: 'none' }} onChange={handleAudioUpload} />
                                </label>
                                {lesson.audio_url && (
                                    <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)' }}>✓ Audio uploaded</span>
                                )}
                            </div>
                        )}
                        {type === 'image' && (
                            <div style={{ marginTop: 12 }}>
                                <div style={{ marginBottom: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', fontSize: 12, color: '#a5b4fc', lineHeight: 1.5 }}>
                                    📐 <strong>Recommended dimensions:</strong> <span style={{ color: '#e2e8f0' }}>640 × 480 px</span> (4:3) or <span style={{ color: '#e2e8f0' }}>640 × 360 px</span> (16:9)<br />
                                    <span style={{ color: '#64748b', fontSize: 11 }}>Images are displayed at 640 px wide — matching the live classroom canvas exactly.</span>
                                </div>
                                <label style={{
                                    display: 'inline-block', padding: '8px 14px', borderRadius: 8,
                                    background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)',
                                    cursor: 'pointer', fontSize: 13, color: 'var(--primary)',
                                }}>
                                    🖼 Upload image
                                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
                                </label>
                                {lesson.image_url && (
                                    <div style={{ marginTop: 10 }}>
                                        <img src={lesson.image_url} alt="Lesson" style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }} />
                                    </div>
                                )}
                            </div>
                        )}
                        {type === 'text' && (
                            <div style={{ marginTop: 12 }}>
                                <RichEditor
                                    value={lesson.content}
                                    onChange={html => onUpdate(idx, { content: html }, false)}
                                    onBlur={html => { if (lesson.id) onUpdate(idx, { content: html }, true); }}
                                    placeholder="Lesson content…"
                                    minHeight={140}
                                />
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
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
    const [expandedLessonIdx, setExpandedLessonIdx] = useState<number>(0);

    const fetchLessons = useCallback(async () => {
        if (!courseId) return;
        try {
            const r = await fetch(`${SERVER}/api/courses/${courseId}/lessons`);
            if (r.ok) {
                const data = await r.json();
                const mapped = (data as { id: string; title: string; content: string | null; order_index: number; lesson_type?: string; video_url?: string | null; audio_url?: string | null; image_url?: string | null }[]).map(l => ({
                    id: l.id,
                    title: l.title,
                    content: l.content || '',
                    order_index: l.order_index,
                    lesson_type: (l.lesson_type || 'text') as LessonType,
                    video_url: l.video_url || null,
                    audio_url: l.audio_url || null,
                    image_url: l.image_url || null,
                }));
                setLessons(mapped);
                setExpandedLessonIdx(mapped.length > 0 ? 0 : -1);
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

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    async function handleCreateCourse() {
        if (isRichEmpty(title) || saving) return;
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
        if (!courseId || isRichEmpty(title) || saving) return;
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
                body: JSON.stringify({ title: 'New Lesson', content: '', orderIndex: lessons.length, lessonType: 'text' }),
            });
            if (r.ok) {
                const l = await r.json();
                const newLesson = {
                    id: l.id,
                    title: l.title,
                    content: l.content || '',
                    order_index: l.order_index,
                    lesson_type: (l.lesson_type || 'text') as LessonType,
                    video_url: l.video_url || null,
                    audio_url: l.audio_url || null,
                    image_url: l.image_url || null,
                };
                setLessons(prev => [...prev, newLesson]);
                setExpandedLessonIdx(lessons.length);
            }
        } finally {
            setSaving(false);
        }
    }

    async function handleUpdateLesson(idx: number, updates: Partial<Lesson>) {
        const l = lessons[idx];
        if (!l?.id) return;
        const payload: Record<string, unknown> = {};
        if (updates.title !== undefined) payload.title = updates.title;
        if (updates.content !== undefined) payload.content = updates.content;
        if (updates.lesson_type !== undefined) payload.lessonType = updates.lesson_type;
        if (updates.video_url !== undefined) payload.videoUrl = updates.video_url;
        if (updates.audio_url !== undefined) payload.audioUrl = updates.audio_url;
        if (updates.image_url !== undefined) payload.imageUrl = updates.image_url;
        if (Object.keys(payload).length === 0) return;
        try {
            await fetch(`${SERVER}/api/lessons/${l.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            setLessons(prev => prev.map((x, i) => i === idx ? { ...x, ...updates } : x));
        } catch { /* ignore */ }
    }

    function updateLessonLocal(idx: number, updates: Partial<Lesson>) {
        setLessons(prev => prev.map((x, i) => i === idx ? { ...x, ...updates } : x));
    }

    async function handleDeleteLesson(idx: number) {
        const l = lessons[idx];
        if (!l?.id) return;
        setSaving(true);
        try {
            const r = await fetch(`${SERVER}/api/lessons/${l.id}`, { method: 'DELETE' });
            if (r.ok) {
                setLessons(prev => prev.filter((_, i) => i !== idx));
                setExpandedLessonIdx(prev => (prev >= idx && prev > 0 ? prev - 1 : Math.min(prev, lessons.length - 2)));
            }
        } finally {
            setSaving(false);
        }
    }

    async function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIdx = lessons.findIndex(l => (l.id || '') === active.id || `lesson-${lessons.indexOf(l)}` === active.id);
        const newIdx = lessons.findIndex(l => (l.id || '') === over.id || `lesson-${lessons.indexOf(l)}` === over.id);
        if (oldIdx === -1 || newIdx === -1) return;
        const reordered = arrayMove(lessons, oldIdx, newIdx);
        setLessons(reordered);
        reordered.forEach((l, i) => {
            if (l.id) fetch(`${SERVER}/api/lessons/${l.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderIndex: i }) }).catch(() => {});
        });
    }

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 999999,
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            padding: '60px 20px 40px', overflowY: 'auto',
        }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={{
                background: 'linear-gradient(160deg,#1e2130 0%,#181c2a 100%)',
                borderRadius: 18,
                width: '100%',
                maxWidth: step === 2 ? 1060 : 580,
                boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(99,102,241,0.25)',
                border: '1px solid rgba(99,102,241,0.25)',
                transition: 'max-width 0.3s cubic-bezier(0.4,0,0.2,1)',
            }} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(99,102,241,0.06)', borderRadius: '18px 18px 0 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#e4e8f5' }}>
                            {isEdit ? 'Edit Course' : step === 1 ? 'New Course' : 'Build Curriculum'}
                        </h2>
                        {!isEdit && (
                            <div style={{ display: 'flex', gap: 4 }}>
                                {[1, 2].map(s => (
                                    <div key={s} style={{ width: 28, height: 5, borderRadius: 3, background: step >= s ? '#6366f1' : 'rgba(99,102,241,0.2)', transition: 'background 0.3s' }} />
                                ))}
                            </div>
                        )}
                    </div>
                    <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: 18, cursor: 'pointer', padding: '4px 10px', borderRadius: 8, lineHeight: 1, fontWeight: 700 }}>×</button>
                </div>

                <div style={{ padding: '24px 26px' }}>
                    {step === 1 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                            <div>
                                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6366f1', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Course Title</label>
                                <div style={{ borderRadius: 10, border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.05)', overflow: 'hidden' }}>
                                    <RichEditor
                                        value={title}
                                        onChange={setTitle}
                                        placeholder="e.g. Introduction to Algebra"
                                        minHeight={44}
                                    />
                                </div>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6366f1', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Description <span style={{ color: '#4b5a7a', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
                                <div style={{ borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', overflow: 'hidden' }}>
                                    <RichEditor
                                        value={description}
                                        onChange={setDescription}
                                        placeholder="Brief overview of the course…"
                                        minHeight={90}
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
                                <button type="button" onClick={onClose} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#6b7fa3', fontSize: 13, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.02em' }}>Cancel</button>
                                <button type="button" onClick={handleCreateCourse} disabled={saving || isRichEmpty(title)} style={{ padding: '10px 22px', borderRadius: 10, border: 'none', background: !isRichEmpty(title) && !saving ? 'linear-gradient(135deg,#6366f1,#4f46e5)' : 'rgba(99,102,241,0.3)', color: !isRichEmpty(title) && !saving ? '#fff' : '#5a5d8a', fontSize: 13, fontWeight: 700, cursor: !isRichEmpty(title) && !saving ? 'pointer' : 'not-allowed', letterSpacing: '0.02em', boxShadow: !isRichEmpty(title) && !saving ? '0 4px 14px rgba(99,102,241,0.35)' : 'none' }}>{saving ? 'Creating…' : 'Create & Build Curriculum →'}</button>
                            </div>
                        </div>
                    )}

                    {step === 2 && courseId && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                            {/* Course title / description quick edit */}
                            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap', paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                <div style={{ flex: 1, minWidth: 180 }}>
                                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#6366f1', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Title</label>
                                    <div style={{ borderRadius: 9, border: '1px solid rgba(99,102,241,0.25)', background: 'rgba(99,102,241,0.05)', overflow: 'hidden' }}>
                                        <RichEditor
                                            value={title}
                                            onChange={setTitle}
                                            onBlur={() => { if (isEdit) handleUpdateCourse(); }}
                                            placeholder="Course title"
                                            minHeight={44}
                                            compact
                                        />
                                    </div>
                                </div>
                                <div style={{ flex: 2, minWidth: 220 }}>
                                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#6366f1', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Description</label>
                                    <div style={{ borderRadius: 9, border: '1px solid rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.02)', overflow: 'hidden' }}>
                                        <RichEditor
                                            value={description}
                                            onChange={setDescription}
                                            onBlur={() => { if (isEdit) handleUpdateCourse(); }}
                                            placeholder="Description (optional)"
                                            minHeight={56}
                                            compact
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Curriculum editor */}
                            <CurriculumEditor courseId={courseId} userId={userId} onCoursesChange={onSaved} />

                            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                {!isEdit && <button type="button" onClick={() => setStep(1)} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#6b7fa3', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>← Back</button>}
                                <button type="button" onClick={() => { onSaved(); onClose(); }} style={{ padding: '10px 28px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#6366f1,#4f46e5)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.02em', boxShadow: '0 4px 14px rgba(99,102,241,0.4)' }}>Done ✓</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
