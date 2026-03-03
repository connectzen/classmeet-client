import { useState, useEffect, useCallback } from 'react';
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
import RichEditor, { stripHtml } from './RichEditor';

const SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

type LessonType = 'text' | 'video' | 'audio' | 'image';

interface Lesson {
    id: string; title: string; content: string;
    lesson_type: LessonType; video_url: string | null; audio_url: string | null; image_url: string | null; order_index: number;
}
interface Quiz { id: string; title: string; status: string; }
interface Assignment { id: string; title: string; description: string; order_index: number; assignment_type?: string; file_url?: string | null; quiz_id?: string | null; }
interface Topic { id: string; title: string; order_index: number; lessons: Lesson[]; quizzes: Quiz[]; assignments: Assignment[]; }

interface Props {
    courseId: string;
    userId: string;
    onCoursesChange?: () => void;
}

// ─── Sortable Lesson Card ─────────────────────────────────────────────────────
function SortableLessonCard({
    lesson, topicId, courseId, expanded, onToggleExpand, onUpdate, onDelete,
}: {
    lesson: Lesson; topicId: string; courseId: string; expanded: boolean;
    onToggleExpand: () => void;
    onUpdate: (lessonId: string, updates: Partial<Lesson>) => void;
    onDelete: (lessonId: string) => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lesson.id });
    const dragStyle = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

    async function handleAudioUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        const fd = new FormData();
        fd.append('file', file);
        const r = await fetch(`${SERVER}/api/quiz/upload`, { method: 'POST', body: fd });
        const data = await r.json();
        if (data.url) onUpdate(lesson.id, { audio_url: data.url });
        e.target.value = '';
    }

    async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        const fd = new FormData();
        fd.append('file', file);
        const r = await fetch(`${SERVER}/api/quiz/upload`, { method: 'POST', body: fd });
        const data = await r.json();
        if (data.url) onUpdate(lesson.id, { image_url: data.url });
        e.target.value = '';
    }

    const typeIcon = lesson.lesson_type === 'video' ? '🎬' : lesson.lesson_type === 'audio' ? '🎵' : lesson.lesson_type === 'image' ? '🖼️' : '📄';
    const [editingLessonTitle, setEditingLessonTitle] = useState(false);
    const [lessonTitleVal, setLessonTitleVal] = useState(lesson.title);

    return (
        <div ref={setNodeRef} style={dragStyle}>
            <div style={expanded ? { background: 'transparent', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', boxShadow: 'none' } : { background: 'linear-gradient(135deg, #1c1000 0%, #2e1a00 50%, #1f1200 100%)', borderRadius: 12, border: '1px solid rgba(251,146,60,0.5)', overflow: 'hidden', boxShadow: '0 2px 12px rgba(251,146,60,0.18)' }}>
                {/* Row */}
                <div
                    onClick={!editingLessonTitle ? onToggleExpand : undefined}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', cursor: editingLessonTitle ? 'default' : 'pointer', userSelect: 'none' }}
                >
                    <div {...attributes} {...listeners} onClick={e => e.stopPropagation()} style={{ cursor: 'grab', color: '#3d4f6e', fontSize: 15, touchAction: 'none', flexShrink: 0, lineHeight: 1 }} title="Drag">⠿</div>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{typeIcon}</span>

                    {editingLessonTitle ? (
                        <input
                            autoFocus
                            value={lessonTitleVal}
                            onChange={e => setLessonTitleVal(e.target.value)}
                            onBlur={() => { setEditingLessonTitle(false); if (lessonTitleVal.trim()) onUpdate(lesson.id, { title: lessonTitleVal.trim() }); else setLessonTitleVal(lesson.title); }}
                            onKeyDown={e => {
                                if (e.key === 'Enter') { setEditingLessonTitle(false); if (lessonTitleVal.trim()) onUpdate(lesson.id, { title: lessonTitleVal.trim() }); }
                                if (e.key === 'Escape') { setEditingLessonTitle(false); setLessonTitleVal(lesson.title); }
                            }}
                            onClick={e => e.stopPropagation()}
                            style={{ flex: 1, minWidth: 60, padding: '5px 10px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.12)', background: '#000', color: '#e2e8f0', fontSize: 13, outline: 'none' }}
                        />
                    ) : (
                        <span
                            onDoubleClick={e => { e.stopPropagation(); setEditingLessonTitle(true); setLessonTitleVal(lesson.title); }}
                            style={{ flex: 1, fontSize: 13, color: '#dde4f0', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            title="Double-click to rename"
                        >
                            {lesson.title || 'Untitled lesson'}
                        </span>
                    )}

                    <select
                        value={lesson.lesson_type}
                        onChange={e => onUpdate(lesson.id, { lesson_type: e.target.value as LessonType })}
                        onClick={e => e.stopPropagation()}
                        style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(99,102,241,0.28)', background: '#1e1a38', color: '#a5b4fc', fontSize: 11, colorScheme: 'dark', flexShrink: 0, fontWeight: 600 }}
                    >
                        <option value="text">Text</option>
                        <option value="video">Video</option>
                        <option value="audio">Audio</option>
                        <option value="image">Image</option>
                    </select>

                    {!editingLessonTitle && (
                        <button type="button" onClick={e => { e.stopPropagation(); setEditingLessonTitle(true); setLessonTitleVal(lesson.title); }}
                            style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.35)', color: '#818cf8', cursor: 'pointer', fontSize: 12, borderRadius: 6, padding: '4px 9px', flexShrink: 0, lineHeight: 1 }} title="Rename">✏️</button>
                    )}

                    <span style={{ color: '#3d4f6e', fontSize: 11, transition: 'transform 0.2s', transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)', display: 'inline-block', flexShrink: 0, pointerEvents: 'none' }}>▼</span>

                    <button type="button" onClick={e => { e.stopPropagation(); onDelete(lesson.id); }}
                        style={{ background: '#2a1018', border: '1px solid rgba(239,68,68,0.5)', color: '#f87171', cursor: 'pointer', fontSize: 12, borderRadius: 6, padding: '4px 9px', flexShrink: 0, fontWeight: 700, lineHeight: 1 }} title="Delete">✕</button>
                </div>
                {/* Expanded */}
                {expanded && (
                    <div style={{ padding: '0 11px 11px' }}>
                        {lesson.lesson_type === 'image' && (
                            <div>
                                <div style={{ marginBottom: 7, padding: '6px 10px', borderRadius: 7, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', fontSize: 11, color: '#a5b4fc', lineHeight: 1.5 }}>
                                    📐 <strong>Recommended:</strong> 640 × 480 px (4:3) or 640 × 360 px (16:9)
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 7, background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.35)', cursor: 'pointer', fontSize: 13, color: '#a5b4fc' }}>
                                        🖼 Upload image
                                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
                                    </label>
                                    {lesson.image_url && <span style={{ fontSize: 12, color: '#4ade80' }}>✓ Uploaded</span>}
                                </div>
                                {lesson.image_url && (
                                    <img src={lesson.image_url} alt="preview" style={{ marginTop: 8, maxWidth: '100%', borderRadius: 7, display: 'block' }} />
                                )}
                            </div>
                        )}
                        {lesson.lesson_type === 'video' && (
                            <input type="url" value={lesson.video_url || ''} onChange={e => onUpdate(lesson.id, { video_url: e.target.value })} placeholder="Paste YouTube or video URL…"
                                style={{ width: '100%', padding: '8px 12px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.12)', background: '#000', color: '#e2e8f0', fontSize: 13, boxSizing: 'border-box' }} />
                        )}
                        {lesson.lesson_type === 'audio' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 7, background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.35)', cursor: 'pointer', fontSize: 13, color: '#a5b4fc' }}>
                                    📎 Upload audio
                                    <input type="file" accept="audio/*" style={{ display: 'none' }} onChange={handleAudioUpload} />
                                </label>
                                {lesson.audio_url && <span style={{ fontSize: 12, color: '#4ade80' }}>✓ Uploaded</span>}
                            </div>
                        )}
                        {lesson.lesson_type === 'text' && (
                            <RichEditor
                                key={lesson.id}
                                value={lesson.content}
                                onBlur={html => onUpdate(lesson.id, { content: html })}
                                placeholder="Lesson content…"
                                minHeight={120}
                            />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Sortable Topic Card ──────────────────────────────────────────────────────
function SortableTopicCard({
    topic, courseId, userId, expanded, onToggleExpand,
    onUpdateTopic, onDeleteTopic, onTopicDataChange, availableQuizzes,
}: {
    topic: Topic; courseId: string; userId: string; expanded: boolean;
    onToggleExpand: () => void;
    onUpdateTopic: (id: string, title: string) => void;
    onDeleteTopic: (id: string) => void;
    onTopicDataChange: (topicId: string, data: Partial<Topic>) => void;
    availableQuizzes: Quiz[];
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: topic.id });
    const dragStyle = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

    const [editingTitle, setEditingTitle] = useState(false);
    const [titleVal, setTitleVal] = useState(topic.title);
    const [showQuizPicker, setShowQuizPicker] = useState(false);
    const [showAssignmentForm, setShowAssignmentForm] = useState(false);
    const [assignmentTitle, setAssignmentTitle] = useState('');
    const [assignmentDesc, setAssignmentDesc] = useState('');
    const [assignmentType, setAssignmentType] = useState<'text' | 'link' | 'file' | 'quiz'>('text');
    const [assignmentUrl, setAssignmentUrl] = useState('');
    const [assignmentQuizId, setAssignmentQuizId] = useState<string>('');
    const [expandedLessonId, setExpandedLessonId] = useState<string | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    async function handleLessonUpdate(lessonId: string, updates: Partial<Lesson>) {
        onTopicDataChange(topic.id, {
            lessons: topic.lessons.map(l => l.id === lessonId ? { ...l, ...updates } : l),
        });
        const payload: Record<string, unknown> = {};
        if (updates.title !== undefined) payload.title = updates.title;
        if (updates.content !== undefined) payload.content = updates.content;
        if (updates.lesson_type !== undefined) payload.lessonType = updates.lesson_type;
        if (updates.video_url !== undefined) payload.videoUrl = updates.video_url;
        if (updates.audio_url !== undefined) payload.audioUrl = updates.audio_url;
        if (updates.image_url !== undefined) payload.imageUrl = updates.image_url;
        if (Object.keys(payload).length === 0) return;
        await fetch(`${SERVER}/api/lessons/${lessonId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }).catch(() => {});
    }

    async function handleLessonDelete(lessonId: string) {
        await fetch(`${SERVER}/api/lessons/${lessonId}`, { method: 'DELETE' }).catch(() => {});
        onTopicDataChange(topic.id, { lessons: topic.lessons.filter(l => l.id !== lessonId) });
        if (expandedLessonId === lessonId) setExpandedLessonId(null);
    }

    async function handleAddLesson() {
        const r = await fetch(`${SERVER}/api/topics/${topic.id}/lessons`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'New Lesson', content: '', lessonType: 'text', courseId }),
        });
        if (r.ok) {
            const l = await r.json();
            const newLesson: Lesson = {
                id: l.id, title: l.title, content: l.content || '',
                lesson_type: (l.lesson_type || 'text') as LessonType,
                video_url: null, audio_url: null, image_url: null, order_index: l.order_index ?? topic.lessons.length,
            };
            onTopicDataChange(topic.id, { lessons: [...topic.lessons, newLesson] });
            setExpandedLessonId(l.id);
        }
    }

    async function handleAddAssignment() {
        if (!assignmentTitle.trim()) return;
        if (assignmentType === 'quiz' && !assignmentQuizId) return;
        const r = await fetch(`${SERVER}/api/topics/${topic.id}/assignments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: assignmentTitle.trim(),
                description: assignmentDesc.trim(),
                courseId,
                createdBy: userId,
                assignmentType,
                fileUrl: assignmentType !== 'text' && assignmentType !== 'quiz' ? assignmentUrl.trim() || null : null,
                quizId: assignmentType === 'quiz' ? assignmentQuizId || null : null,
            }),
        });
        if (r.ok) {
            const a = await r.json();
            onTopicDataChange(topic.id, {
                assignments: [...topic.assignments, {
                    id: a.id, title: a.title, description: a.description || '',
                    order_index: a.order_index ?? 0,
                    assignment_type: a.assignment_type || 'text',
                    file_url: a.file_url || null,
                    quiz_id: a.quiz_id || null,
                }],
            });
            setAssignmentTitle(''); setAssignmentDesc(''); setAssignmentUrl('');
            setAssignmentType('text'); setAssignmentQuizId(''); setShowAssignmentForm(false);
        }
    }

    async function handleDeleteAssignment(assignmentId: string) {
        await fetch(`${SERVER}/api/assignments/${assignmentId}`, { method: 'DELETE' }).catch(() => {});
        onTopicDataChange(topic.id, { assignments: topic.assignments.filter(a => a.id !== assignmentId) });
    }

    async function handleAttachQuiz(quiz: Quiz) {
        await fetch(`${SERVER}/api/quizzes/${quiz.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topicId: topic.id, courseId }),
        }).catch(() => {});
        onTopicDataChange(topic.id, { quizzes: [...topic.quizzes, quiz] });
        setShowQuizPicker(false);
    }

    async function handleDetachQuiz(quizId: string) {
        await fetch(`${SERVER}/api/quizzes/${quizId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topicId: null }),
        }).catch(() => {});
        onTopicDataChange(topic.id, { quizzes: topic.quizzes.filter(q => q.id !== quizId) });
    }

    function handleLessonDragEnd(event: DragEndEvent) {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIdx = topic.lessons.findIndex(l => l.id === active.id);
        const newIdx = topic.lessons.findIndex(l => l.id === over.id);
        if (oldIdx === -1 || newIdx === -1) return;
        const reordered = arrayMove(topic.lessons, oldIdx, newIdx);
        onTopicDataChange(topic.id, { lessons: reordered });
        fetch(`${SERVER}/api/topics/${topic.id}/lessons/reorder`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lessonIds: reordered.map(l => l.id) }),
        }).catch(() => {});
    }

    const attachedQuizIds = new Set(topic.quizzes.map(q => q.id));
    const unattachedQuizzes = availableQuizzes.filter(q => !attachedQuizIds.has(q.id));
    const itemCount = topic.lessons.length + topic.quizzes.length + topic.assignments.length;

    return (
        <div ref={setNodeRef} style={dragStyle}>
            <div className="hover-card" style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #1e3a5f 50%, #1d2e5e 100%)', borderRadius: 14, border: '1px solid rgba(34,197,94,0.4)', overflow: 'hidden', boxShadow: '0 4px 20px rgba(99,102,241,0.18), 0 2px 6px rgba(0,0,0,0.2)' }}>
                {/* Topic header */}
                <div
                    onClick={!editingTitle ? onToggleExpand : undefined}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', background: 'rgba(34,197,94,0.07)', borderBottom: '1px solid rgba(34,197,94,0.2)', cursor: editingTitle ? 'default' : 'pointer', userSelect: 'none' }}
                >
                    <div {...attributes} {...listeners} onClick={e => e.stopPropagation()} style={{ cursor: 'grab', color: '#475569', fontSize: 16, touchAction: 'none', padding: '2px 3px', flexShrink: 0 }} title="Drag topic">⠿</div>
                    {editingTitle ? (
                        <input
                            autoFocus
                            value={titleVal}
                            onChange={e => setTitleVal(e.target.value)}
                            onBlur={() => { setEditingTitle(false); if (titleVal.trim()) onUpdateTopic(topic.id, titleVal.trim()); else setTitleVal(topic.title); }}
                            onKeyDown={e => {
                                if (e.key === 'Enter') { setEditingTitle(false); if (titleVal.trim()) onUpdateTopic(topic.id, titleVal.trim()); }
                                if (e.key === 'Escape') { setEditingTitle(false); setTitleVal(topic.title); }
                            }}
                            onClick={e => e.stopPropagation()}
                            style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: '#000', color: '#e2e8f0', fontSize: 14, fontWeight: 600 }}
                        />
                    ) : (
                        <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>
                            {topic.title}
                        </span>
                    )}
                    <span style={{ fontSize: 11, color: '#4b5a7a', whiteSpace: 'nowrap', flexShrink: 0, fontWeight: 600, letterSpacing: '0.04em' }}>
                        {itemCount} item{itemCount !== 1 ? 's' : ''}
                    </span>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setEditingTitle(true); setTitleVal(topic.title); }} style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.38)', color: '#818cf8', cursor: 'pointer', fontSize: 13, padding: '5px 10px', borderRadius: 7, flexShrink: 0, lineHeight: 1 }} title="Rename">✏️</button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); onDeleteTopic(topic.id); }} style={{ background: '#2a1018', border: '1px solid rgba(239,68,68,0.5)', color: '#f87171', cursor: 'pointer', fontSize: 13, padding: '5px 10px', borderRadius: 7, flexShrink: 0, fontWeight: 700, lineHeight: 1 }} title="Delete topic">🗑</button>
                    <span style={{ color: '#64748b', fontSize: 13, padding: '3px 5px', flexShrink: 0, transition: 'transform 0.2s', transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)', display: 'inline-block' }}>▼</span>
                </div>

                {/* Topic content — smooth grid slide animation */}
                <div style={{
                    display: 'grid',
                    gridTemplateRows: expanded ? '1fr' : '0fr',
                    transition: 'grid-template-rows 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                }}>
                    <div style={{ overflow: 'hidden' }}>
                        <div style={{ padding: '14px 16px', background: '#161929', opacity: expanded ? 1 : 0, transition: 'opacity 0.22s ease' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {/* Sortable lessons */}
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleLessonDragEnd}>
                                <SortableContext items={topic.lessons.map(l => l.id)} strategy={verticalListSortingStrategy}>
                                    {topic.lessons.map(lesson => (
                                        <SortableLessonCard
                                            key={lesson.id}
                                            lesson={lesson}
                                            topicId={topic.id}
                                            courseId={courseId}
                                            expanded={expandedLessonId === lesson.id}
                                            onToggleExpand={() => setExpandedLessonId(prev => prev === lesson.id ? null : lesson.id)}
                                            onUpdate={handleLessonUpdate}
                                            onDelete={handleLessonDelete}
                                        />
                                    ))}
                                </SortableContext>
                            </DndContext>

                            {/* Attached quizzes */}
                            {topic.quizzes.map(quiz => (
                                <div key={quiz.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 9, border: '1px solid rgba(139,92,246,0.32)', borderLeft: '3px solid rgba(139,92,246,0.7)', background: 'linear-gradient(90deg,rgba(139,92,246,0.1) 0%,rgba(139,92,246,0.04) 100%)' }}>
                                    <span style={{ fontSize: 15, flexShrink: 0 }}>📝</span>
                                    <span style={{ flex: 1, fontSize: 13, color: '#c4b5fd', fontWeight: 600 }}>{stripHtml(quiz.title)}</span>
                                    <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 20, fontWeight: 700, letterSpacing: '0.05em', background: quiz.status === 'published' ? 'rgba(34,197,94,0.15)' : 'rgba(100,116,139,0.2)', color: quiz.status === 'published' ? '#4ade80' : '#94a3b8', flexShrink: 0, textTransform: 'uppercase' }}>{quiz.status}</span>
                                    <button type="button" onClick={() => handleDetachQuiz(quiz.id)} style={{ background: '#2a1018', border: '1px solid rgba(239,68,68,0.5)', color: '#f87171', cursor: 'pointer', fontSize: 11, borderRadius: 6, padding: '4px 9px', flexShrink: 0, fontWeight: 700, lineHeight: 1 }} title="Remove">✕</button>
                                </div>
                            ))}

                            {/* Attached assignments */}
                            {topic.assignments.map(a => (
                                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 9, border: '1px solid rgba(251,191,36,0.28)', borderLeft: '3px solid rgba(251,191,36,0.65)', background: 'linear-gradient(90deg,rgba(251,191,36,0.09) 0%,rgba(251,191,36,0.03) 100%)' }}>
                                    <span style={{ fontSize: 14, flexShrink: 0 }}>
                                        {a.assignment_type === 'link' ? '🔗' : a.assignment_type === 'file' ? '📎' : a.assignment_type === 'quiz' ? '📝' : '📋'}
                                    </span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, color: '#fcd34d', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stripHtml(a.title)}</div>
                                        {a.description && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stripHtml(a.description)}</div>}
                                    </div>
                                    {a.file_url && (
                                        <a href={a.file_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#818cf8', flexShrink: 0, fontWeight: 600 }}>Open ↗</a>
                                    )}
                                    <button type="button" onClick={() => handleDeleteAssignment(a.id)} style={{ background: '#2a1018', border: '1px solid rgba(239,68,68,0.5)', color: '#f87171', cursor: 'pointer', fontSize: 11, borderRadius: 6, padding: '4px 9px', flexShrink: 0, fontWeight: 700, lineHeight: 1 }} title="Delete">✕</button>
                                </div>
                            ))}
                        </div>

                        {/* Action bar */}
                        <div style={{ display: 'flex', gap: 8, marginTop: itemCount > 0 ? 14 : 4, flexWrap: 'wrap' }}>
                            <button type="button" onClick={handleAddLesson} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 20, border: '1px solid rgba(99,102,241,0.45)', background: 'linear-gradient(135deg,rgba(99,102,241,0.18),rgba(99,102,241,0.08))', color: '#a5b4fc', fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.02em' }}>
                                + Lesson
                            </button>
                            <button type="button" onClick={() => setShowQuizPicker(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 20, border: '1px solid rgba(139,92,246,0.45)', background: 'linear-gradient(135deg,rgba(139,92,246,0.18),rgba(139,92,246,0.08))', color: '#c4b5fd', fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.02em' }}>
                                + Quiz
                            </button>
                            <button type="button" onClick={() => setShowAssignmentForm(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 20, border: '1px solid rgba(251,191,36,0.45)', background: 'linear-gradient(135deg,rgba(251,191,36,0.16),rgba(251,191,36,0.06))', color: '#fcd34d', fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.02em' }}>
                                + Assignment
                            </button>
                        </div>

                        {/* Assignment inline form */}
                        {showAssignmentForm && (
                            <div style={{ marginTop: 12, padding: '16px 18px', borderRadius: 12, border: '1px solid rgba(251,191,36,0.25)', background: 'linear-gradient(135deg,rgba(251,191,36,0.06) 0%,rgba(20,17,0,0.6) 100%)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>New Assignment</div>
                                {/* Type pills */}
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {(['text', 'link', 'file', 'quiz'] as const).map(t => (
                                        <button key={t} type="button" onClick={() => { setAssignmentType(t); setAssignmentTitle(''); setAssignmentDesc(''); setAssignmentUrl(''); setAssignmentQuizId(''); }}
                                            style={{ padding: '5px 14px', borderRadius: 20, border: `1px solid ${assignmentType === t ? 'rgba(251,191,36,0.7)' : 'rgba(255,255,255,0.1)'}`, background: assignmentType === t ? 'rgba(251,191,36,0.18)' : 'rgba(255,255,255,0.04)', color: assignmentType === t ? '#fcd34d' : '#6b7fa3', fontSize: 12, fontWeight: assignmentType === t ? 700 : 500, cursor: 'pointer' }}>
                                            {t === 'text' ? '📄 Text' : t === 'link' ? '🔗 Link' : t === 'file' ? '📎 File' : '📝 Quiz'}
                                        </button>
                                    ))}
                                </div>
                                <input
                                    value={assignmentTitle}
                                    onChange={e => setAssignmentTitle(e.target.value)}
                                    placeholder="Assignment title *"
                                    autoFocus
                                    style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#e2e8f0', fontSize: 13, boxSizing: 'border-box', width: '100%', outline: 'none' }}
                                />
                                <RichEditor
                                    value={assignmentDesc}
                                    onChange={setAssignmentDesc}
                                    placeholder="Description (optional)"
                                    minHeight={70}
                                    compact
                                />
                                {(assignmentType === 'link' || assignmentType === 'file') && (
                                    <input
                                        value={assignmentUrl}
                                        onChange={e => setAssignmentUrl(e.target.value)}
                                        placeholder={assignmentType === 'link' ? 'https://...' : 'File URL'}
                                        style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#e2e8f0', fontSize: 13, boxSizing: 'border-box', width: '100%', outline: 'none' }}
                                    />
                                )}
                                {assignmentType === 'quiz' && (
                                    <select
                                        value={assignmentQuizId}
                                        onChange={e => {
                                            const qid = e.target.value;
                                            setAssignmentQuizId(qid);
                                            // Auto-fill assignment title from the selected quiz name
                                            if (qid && !assignmentTitle.trim()) {
                                                const picked = availableQuizzes.find(q => q.id === qid);
                                                if (picked) setAssignmentTitle(stripHtml(picked.title));
                                            }
                                        }}
                                        style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)', background: '#1e2132', color: assignmentQuizId ? '#e2e8f0' : '#64748b', fontSize: 13, boxSizing: 'border-box', width: '100%', cursor: 'pointer', colorScheme: 'dark' }}
                                    >
                                        <option value="" style={{ background: '#1e2132', color: '#64748b' }}>— Select a quiz —</option>
                                        {availableQuizzes.map(q => (
                                            <option key={q.id} value={q.id} style={{ background: '#1e2132', color: '#e2e8f0' }}>{stripHtml(q.title)}{q.status !== 'published' ? ' (draft)' : ''}</option>
                                        ))}
                                    </select>
                                )}
                                <div style={{ display: 'flex', gap: 8, paddingTop: 2 }}>
                                    <button type="button" onClick={handleAddAssignment}
                                        disabled={!assignmentTitle.trim() || (assignmentType === 'quiz' && !assignmentQuizId)}
                                        style={{ padding: '8px 20px', borderRadius: 20, border: 'none', background: (assignmentTitle.trim() && (assignmentType !== 'quiz' || assignmentQuizId)) ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'rgba(251,191,36,0.2)', color: (assignmentTitle.trim() && (assignmentType !== 'quiz' || assignmentQuizId)) ? '#0a0500' : '#6b5a2a', fontSize: 12, fontWeight: 700, cursor: (assignmentTitle.trim() && (assignmentType !== 'quiz' || assignmentQuizId)) ? 'pointer' : 'not-allowed', letterSpacing: '0.03em' }}>Add</button>
                                    <button type="button" onClick={() => { setShowAssignmentForm(false); setAssignmentTitle(''); setAssignmentDesc(''); setAssignmentUrl(''); setAssignmentType('text'); setAssignmentQuizId(''); }} style={{ padding: '8px 18px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#6b7fa3', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                                </div>
                            </div>
                        )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Quiz picker modal */}
            {showQuizPicker && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1000010, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setShowQuizPicker(false)}>
                    <div style={{ background: '#1e2132', borderRadius: 14, border: '1px solid rgba(139,92,246,0.3)', width: '100%', maxWidth: 400, maxHeight: '70vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ padding: '15px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>Select a Quiz</h3>
                            <button type="button" onClick={() => setShowQuizPicker(false)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 20, cursor: 'pointer', padding: '2px 6px' }}>×</button>
                        </div>
                        <div style={{ padding: 12, overflowY: 'auto' }}>
                            {unattachedQuizzes.length === 0 ? (
                                <div style={{ padding: '24px 16px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                                    {availableQuizzes.length === 0
                                        ? 'No quizzes yet. Create one first from the Quizzes section.'
                                        : 'All your quizzes are already attached.'}
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {unattachedQuizzes.map(quiz => (
                                        <button key={quiz.id} type="button" onClick={() => handleAttachQuiz(quiz)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                                            <span style={{ fontSize: 16, flexShrink: 0 }}>📝</span>
                                            <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{stripHtml(quiz.title)}</span>
                                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: quiz.status === 'published' ? 'rgba(34,197,94,0.15)' : 'rgba(100,116,139,0.2)', color: quiz.status === 'published' ? '#4ade80' : '#94a3b8', flexShrink: 0 }}>{quiz.status}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Main CurriculumEditor ─────────────────────────────────────────────────────
export default function CurriculumEditor({ courseId, userId, onCoursesChange }: Props) {
    const [topics, setTopics] = useState<Topic[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
    const [availableQuizzes, setAvailableQuizzes] = useState<Quiz[]>([]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const fetchTopics = useCallback(async () => {
        try {
            const r = await fetch(`${SERVER}/api/courses/${courseId}/topics`);
            if (r.ok) {
                const data = await r.json() as Topic[];
                const sorted = data.sort((a, b) => a.order_index - b.order_index);
                setTopics(sorted);
                setExpandedTopics(new Set(sorted.map(t => t.id)));
            }
        } catch { /* ignore */ } finally { setLoading(false); }
    }, [courseId]);

    const fetchQuizzes = useCallback(async () => {
        try {
            const r = await fetch(`${SERVER}/api/quizzes?createdBy=${encodeURIComponent(userId)}`);
            if (r.ok) {
                const data = await r.json();
                setAvailableQuizzes(Array.isArray(data) ? data : (data.quizzes || []));
            }
        } catch { /* ignore */ }
    }, [userId]);

    useEffect(() => {
        fetchTopics();
        fetchQuizzes();
    }, [fetchTopics, fetchQuizzes]);

    async function handleAddTopic() {
        const r = await fetch(`${SERVER}/api/courses/${courseId}/topics`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: `Topic ${topics.length + 1}` }),
        });
        if (r.ok) {
            const t = await r.json();
            const newTopic: Topic = { id: t.id, title: t.title, order_index: t.order_index ?? topics.length, lessons: [], quizzes: [], assignments: [] };
            setTopics(prev => [...prev, newTopic]);
            setExpandedTopics(new Set([t.id])); // collapse others, expand new topic
        }
    }

    async function handleUpdateTopic(topicId: string, title: string) {
        setTopics(prev => prev.map(t => t.id === topicId ? { ...t, title } : t));
        await fetch(`${SERVER}/api/topics/${topicId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title }),
        }).catch(() => {});
    }

    async function handleDeleteTopic(topicId: string) {
        if (!confirm('Delete this topic and all its content?')) return;
        await fetch(`${SERVER}/api/topics/${topicId}`, { method: 'DELETE' }).catch(() => {});
        setTopics(prev => prev.filter(t => t.id !== topicId));
        setExpandedTopics(prev => { const s = new Set(prev); s.delete(topicId); return s; });
        onCoursesChange?.();
    }

    function handleTopicDataChange(topicId: string, data: Partial<Topic>) {
        setTopics(prev => prev.map(t => t.id === topicId ? { ...t, ...data } : t));
    }

    function handleTopicDragEnd(event: DragEndEvent) {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIdx = topics.findIndex(t => t.id === active.id);
        const newIdx = topics.findIndex(t => t.id === over.id);
        if (oldIdx === -1 || newIdx === -1) return;
        const reordered = arrayMove(topics, oldIdx, newIdx);
        setTopics(reordered);
        fetch(`${SERVER}/api/courses/${courseId}/topics/reorder`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topicIds: reordered.map(t => t.id) }),
        }).catch(() => {});
    }

    function toggleAllTopics() {
        if (expandedTopics.size === topics.length && topics.length > 0) {
            setExpandedTopics(new Set());
        } else {
            setExpandedTopics(new Set(topics.map(t => t.id)));
        }
    }

    if (loading) {
        return <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 14 }}>Loading curriculum…</div>;
    }

    return (
        <div>
            {/* Toolbar row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>
                    {topics.length} topic{topics.length !== 1 ? 's' : ''}
                </span>
                {topics.length > 1 && (
                    <button type="button" onClick={toggleAllTopics} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#64748b', cursor: 'pointer', fontWeight: 500 }}>
                        {expandedTopics.size === topics.length ? 'Collapse all' : 'Expand all'}
                    </button>
                )}
            </div>

            {/* Topics drag-and-drop list */}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleTopicDragEnd}>
                <SortableContext items={topics.map(t => t.id)} strategy={verticalListSortingStrategy}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {topics.map(topic => (
                            <SortableTopicCard
                                key={topic.id}
                                topic={topic}
                                courseId={courseId}
                                userId={userId}
                                expanded={expandedTopics.has(topic.id)}
                                onToggleExpand={() => setExpandedTopics(prev => {
                                    if (prev.has(topic.id)) {
                                        // close it
                                        const s = new Set(prev);
                                        s.delete(topic.id);
                                        return s;
                                    } else {
                                        // accordion: open this one, close all others
                                        return new Set([topic.id]);
                                    }
                                })}
                                onUpdateTopic={handleUpdateTopic}
                                onDeleteTopic={handleDeleteTopic}
                                onTopicDataChange={handleTopicDataChange}
                                availableQuizzes={availableQuizzes}
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>

            {/* Empty state */}
            {topics.length === 0 && (
                <div style={{ padding: '40px 20px', textAlign: 'center', border: '2px dashed rgba(99,102,241,0.2)', borderRadius: 14, color: '#475569', marginBottom: 14 }}>
                    <div style={{ fontSize: 36, marginBottom: 10 }}>📚</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>No topics yet</div>
                    <div style={{ fontSize: 12 }}>Add your first topic to start building the curriculum</div>
                </div>
            )}

            {/* Add topic */}
            <button
                type="button"
                onClick={handleAddTopic}
                style={{ marginTop: 12, width: '100%', padding: '12px 20px', borderRadius: 10, border: '2px dashed rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.05)', color: '#818cf8', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
                <span style={{ fontSize: 18 }}>+</span> Add Topic
            </button>
        </div>
    );
}
