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
import { useEditor, EditorContent } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TiptapImage from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { TextStyle, Color } from '@tiptap/extension-text-style';

// Custom FontSize extension (uses TextStyle mark, no extra package needed)
const FontSizeExtension = Extension.create({
    name: 'fontSize',
    addOptions() { return { types: ['textStyle'] }; },
    addGlobalAttributes() {
        return [{
            types: ['textStyle'],
            attributes: {
                fontSize: {
                    default: null,
                    parseHTML: el => el.style.fontSize?.replace(/['"]+/g, '') || null,
                    renderHTML: attrs => attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {},
                },
            },
        }];
    },
});

const SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

type LessonType = 'text' | 'video' | 'audio';

interface Lesson {
    id: string; title: string; content: string;
    lesson_type: LessonType; video_url: string | null; audio_url: string | null; order_index: number;
}
interface Quiz { id: string; title: string; status: string; }
interface Assignment { id: string; title: string; description: string; order_index: number; }
interface Topic { id: string; title: string; order_index: number; lessons: Lesson[]; quizzes: Quiz[]; assignments: Assignment[]; }

interface Props {
    courseId: string;
    userId: string;
    onCoursesChange?: () => void;
}

// ─── Tiptap toolbar button ────────────────────────────────────────────────────
function TBtn({ label, active, onClick, title, extraStyle }: {
    label: string; active?: boolean; onClick: () => void; title?: string; extraStyle?: React.CSSProperties;
}) {
    return (
        <button
            type="button"
            title={title}
            onMouseDown={(e) => { e.preventDefault(); onClick(); }}
            style={{
                padding: '3px 8px', borderRadius: 5, border: 'none',
                background: active ? '#6366f1' : 'rgba(255,255,255,0.07)',
                color: active ? '#ffffff' : '#94a3b8',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                boxShadow: active ? '0 0 0 1px rgba(99,102,241,0.6)' : 'none',
                ...extraStyle,
            }}
        >
            {label}
        </button>
    );
}

// ─── Rich text editor (Tiptap) ────────────────────────────────────────────────
function LessonRichEditor({ lessonId, initialContent, onSave }: {
    lessonId: string;
    initialContent: string;
    onSave: (html: string) => void;
}) {
    const editor = useEditor({
        extensions: [
            StarterKit,
            Underline,
            TiptapImage,
            Link.configure({ openOnClick: false }),
            TextStyle,
            Color,
            FontSizeExtension,
        ],
        content: initialContent || '',
        editorProps: {
            attributes: { class: 'curriculum-tiptap' },
        },
        onBlur: ({ editor }) => { onSave(editor.getHTML()); },
    });

    const headingLevel = editor?.isActive('heading', { level: 1 }) ? '1'
        : editor?.isActive('heading', { level: 2 }) ? '2'
        : editor?.isActive('heading', { level: 3 }) ? '3' : '0';

    const currentFontSize = (editor?.getAttributes('textStyle') as { fontSize?: string }).fontSize || '';
    const currentColor = (editor?.getAttributes('textStyle') as { color?: string }).color || '#a5b4fc';

    // Smart list toggle: exits the current list type first before switching
    function handleBulletList() {
        if (!editor) return;
        if (editor.isActive('orderedList')) {
            editor.chain().focus().toggleOrderedList().toggleBulletList().run();
        } else {
            editor.chain().focus().toggleBulletList().run();
        }
    }
    function handleOrderedList() {
        if (!editor) return;
        if (editor.isActive('bulletList')) {
            editor.chain().focus().toggleBulletList().toggleOrderedList().run();
        } else {
            editor.chain().focus().toggleOrderedList().run();
        }
    }
    function handleBlockquote() {
        if (!editor) return;
        if (editor.isActive('bulletList') || editor.isActive('orderedList')) {
            // Exit the list first, then apply blockquote to that paragraph
            editor.chain().focus().liftListItem('listItem').toggleBlockquote().run();
        } else {
            editor.chain().focus().toggleBlockquote().run();
        }
    }

    return (
        <div>
            <style>{`
                .curriculum-tiptap { min-height:120px; outline:none; padding:10px 14px; color:#e2e8f0; font-size:14px; line-height:1.7; }
                .curriculum-tiptap p { margin:0 0 6px; }
                .curriculum-tiptap ul { list-style-type:disc; padding-left:22px; margin:0 0 6px; }
                .curriculum-tiptap ol { list-style-type:decimal; padding-left:22px; margin:0 0 6px; }
                .curriculum-tiptap ul li::marker { color:#a5b4fc; font-size:1.1em; }
                .curriculum-tiptap ol li::marker { color:#a5b4fc; font-weight:700; }
                .curriculum-tiptap blockquote { border-left:3px solid #6366f1; padding-left:12px; color:#94a3b8; margin:0 0 6px; font-style:italic; }
                .curriculum-tiptap strong { color:#f1f5f9; }
                .curriculum-tiptap em { color:#cbd5e1; }
                .curriculum-tiptap a { color:#818cf8; text-decoration:underline; }
                .curriculum-tiptap h1 { font-size:1.6em; font-weight:800; margin:0 0 10px; color:#f1f5f9; line-height:1.3; }
                .curriculum-tiptap h2 { font-size:1.3em; font-weight:700; margin:0 0 8px; color:#f1f5f9; line-height:1.3; }
                .curriculum-tiptap h3 { font-size:1.1em; font-weight:600; margin:0 0 6px; color:#e2e8f0; line-height:1.3; }
                .curriculum-tiptap p:last-child { margin-bottom:0; }
            `}</style>
            <div style={{ border: '1px solid rgba(99,102,241,0.3)', borderRadius: 8, overflow: 'hidden', background: 'rgba(0,0,0,0.25)' }}>
                {/* Toolbar */}
                <div style={{ display: 'flex', gap: 3, padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexWrap: 'wrap', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
                    {/* Heading style */}
                    <select
                        value={headingLevel}
                        onChange={e => {
                            const v = e.target.value;
                            if (v === '0') editor?.chain().focus().setParagraph().run();
                            else editor?.chain().focus().setHeading({ level: Number(v) as 1 | 2 | 3 }).run();
                        }}
                        style={{ padding: '3px 6px', borderRadius: 5, border: 'none', background: 'rgba(255,255,255,0.07)', color: '#94a3b8', fontSize: 12, cursor: 'pointer', colorScheme: 'dark' }}
                    >
                        <option value="0">Normal</option>
                        <option value="1">H1</option>
                        <option value="2">H2</option>
                        <option value="3">H3</option>
                    </select>
                    {/* Font size */}
                    <select
                        value={currentFontSize}
                        onChange={e => {
                            const size = e.target.value;
                            if (!size) {
                                // Reset font size: clear the attribute, remove mark if now empty
                                editor?.chain().focus().setMark('textStyle', { fontSize: null }).run();
                            } else {
                                editor?.chain().focus().setMark('textStyle', { fontSize: size }).run();
                            }
                        }}
                        style={{ padding: '3px 6px', borderRadius: 5, border: 'none', background: 'rgba(255,255,255,0.07)', color: '#94a3b8', fontSize: 12, cursor: 'pointer', colorScheme: 'dark' }}
                    >
                        <option value="">Size</option>
                        <option value="11px">11</option>
                        <option value="12px">12</option>
                        <option value="14px">14</option>
                        <option value="16px">16</option>
                        <option value="18px">18</option>
                        <option value="20px">20</option>
                        <option value="24px">24</option>
                        <option value="28px">28</option>
                        <option value="32px">32</option>
                    </select>
                    <div style={{ width: 1, background: 'rgba(255,255,255,0.1)', margin: '2px 1px', alignSelf: 'stretch' }} />
                    <TBtn label="B" title="Bold" active={editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()} extraStyle={{ fontWeight: 900 }} />
                    <TBtn label="I" title="Italic" active={editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()} extraStyle={{ fontStyle: 'italic' }} />
                    <TBtn label="U" title="Underline" active={editor?.isActive('underline')} onClick={() => editor?.chain().focus().toggleUnderline().run()} extraStyle={{ textDecoration: 'underline' }} />
                    {/* Color picker — visible button with colored "A" underline */}
                    <label
                        title="Text color (select text first)"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 7px', borderRadius: 5, background: 'rgba(255,255,255,0.07)', cursor: 'pointer', position: 'relative', flexShrink: 0, userSelect: 'none' }}
                    >
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', borderBottom: `3px solid ${currentColor}`, paddingBottom: 1, lineHeight: 1 }}>A</span>
                        <span style={{ fontSize: 11, color: '#64748b' }}>▾</span>
                        <input
                            type="color"
                            value={currentColor}
                            onChange={e => editor?.chain().focus().setColor(e.target.value).run()}
                            style={{ position: 'absolute', opacity: 0, inset: 0, width: '100%', height: '100%', cursor: 'pointer' }}
                        />
                    </label>
                    <div style={{ width: 1, background: 'rgba(255,255,255,0.1)', margin: '2px 1px', alignSelf: 'stretch' }} />
                    <TBtn label="≡ Bullets" title="Bullet list" active={editor?.isActive('bulletList')} onClick={handleBulletList} />
                    <TBtn label="1. List" title="Ordered list" active={editor?.isActive('orderedList')} onClick={handleOrderedList} />
                    <TBtn label="❝ Quote" title="Blockquote (exits list first if in one)" active={editor?.isActive('blockquote')} onClick={handleBlockquote} />
                </div>
                <EditorContent editor={editor} />
            </div>
        </div>
    );
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

    const typeIcon = lesson.lesson_type === 'video' ? '🎬' : lesson.lesson_type === 'audio' ? '🎵' : '📄';

    return (
        <div ref={setNodeRef} style={dragStyle}>
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 9, border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                {/* Row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 11px' }}>
                    <div {...attributes} {...listeners} style={{ cursor: 'grab', color: '#475569', fontSize: 14, touchAction: 'none', padding: '2px 3px', borderRadius: 4, flexShrink: 0 }} title="Drag">⋮⋮</div>
                    <span style={{ fontSize: 13, flexShrink: 0 }}>{typeIcon}</span>
                    <input
                        value={lesson.title}
                        onChange={e => onUpdate(lesson.id, { title: e.target.value })}
                        placeholder="Lesson title"
                        style={{ flex: 1, minWidth: 60, padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.09)', background: 'transparent', color: '#e2e8f0', fontSize: 13 }}
                    />
                    <select
                        value={lesson.lesson_type}
                        onChange={e => onUpdate(lesson.id, { lesson_type: e.target.value as LessonType })}
                        style={{ padding: '5px 7px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.09)', background: '#1e1b4b', color: '#e2e8f0', fontSize: 12, colorScheme: 'dark', flexShrink: 0 }}
                    >
                        <option value="text">Text</option>
                        <option value="video">Video</option>
                        <option value="audio">Audio</option>
                    </select>
                    <button type="button" onClick={onToggleExpand} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 12, padding: '3px 5px', flexShrink: 0 }}>
                        {expanded ? '▼' : '▶'}
                    </button>
                    <button type="button" onClick={() => onDelete(lesson.id)} style={{ background: 'rgba(239,68,68,0.15)', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 11, borderRadius: 5, padding: '3px 7px', flexShrink: 0 }}>✕</button>
                </div>
                {/* Expanded */}
                {expanded && (
                    <div style={{ padding: '0 11px 11px' }}>
                        {lesson.lesson_type === 'video' && (
                            <input type="url" value={lesson.video_url || ''} onChange={e => onUpdate(lesson.id, { video_url: e.target.value })} placeholder="Paste YouTube or video URL…"
                                style={{ width: '100%', padding: '8px 12px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#e2e8f0', fontSize: 13, boxSizing: 'border-box' }} />
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
                            <LessonRichEditor
                                key={lesson.id}
                                lessonId={lesson.id}
                                initialContent={lesson.content}
                                onSave={(html) => onUpdate(lesson.id, { content: html })}
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
                video_url: null, audio_url: null, order_index: l.order_index ?? topic.lessons.length,
            };
            onTopicDataChange(topic.id, { lessons: [...topic.lessons, newLesson] });
            setExpandedLessonId(l.id);
        }
    }

    async function handleAddAssignment() {
        if (!assignmentTitle.trim()) return;
        const r = await fetch(`${SERVER}/api/topics/${topic.id}/assignments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: assignmentTitle.trim(), description: assignmentDesc.trim(), courseId, createdBy: userId }),
        });
        if (r.ok) {
            const a = await r.json();
            onTopicDataChange(topic.id, {
                assignments: [...topic.assignments, { id: a.id, title: a.title, description: a.description || '', order_index: a.order_index ?? 0 }],
            });
            setAssignmentTitle(''); setAssignmentDesc(''); setShowAssignmentForm(false);
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
            <div style={{ background: 'var(--surface-2, #13131a)', borderRadius: 13, border: '1px solid rgba(99,102,241,0.2)', overflow: 'hidden' }}>
                {/* Topic header — click anywhere to expand/collapse */}
                <div
                    onClick={!editingTitle ? onToggleExpand : undefined}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', background: 'rgba(99,102,241,0.07)', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: editingTitle ? 'default' : 'pointer', userSelect: 'none' }}
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
                            style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(99,102,241,0.5)', background: 'rgba(0,0,0,0.3)', color: '#e2e8f0', fontSize: 14, fontWeight: 600 }}
                        />
                    ) : (
                        <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>
                            {topic.title}
                        </span>
                    )}
                    <span style={{ fontSize: 11, color: '#475569', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {itemCount} item{itemCount !== 1 ? 's' : ''}
                    </span>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setEditingTitle(true); setTitleVal(topic.title); }} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, padding: '3px 5px', borderRadius: 5, flexShrink: 0 }} title="Rename">✏️</button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); onDeleteTopic(topic.id); }} style={{ background: 'rgba(239,68,68,0.12)', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 13, padding: '4px 8px', borderRadius: 5, flexShrink: 0 }} title="Delete topic">🗑</button>
                    <span style={{ color: '#64748b', fontSize: 13, padding: '3px 5px', flexShrink: 0, transition: 'transform 0.2s', transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)', display: 'inline-block' }}>▼</span>
                </div>

                {/* Topic content — smooth grid slide animation */}
                <div style={{
                    display: 'grid',
                    gridTemplateRows: expanded ? '1fr' : '0fr',
                    transition: 'grid-template-rows 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                }}>
                    <div style={{ overflow: 'hidden' }}>
                        <div style={{ padding: 14, opacity: expanded ? 1 : 0, transition: 'opacity 0.22s ease' }}>
                        {/* Sortable lessons */}
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleLessonDragEnd}>
                            <SortableContext items={topic.lessons.map(l => l.id)} strategy={verticalListSortingStrategy}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
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
                                </div>
                            </SortableContext>
                        </DndContext>

                        {/* Attached quizzes */}
                        {topic.quizzes.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: topic.lessons.length > 0 ? 9 : 0 }}>
                                {topic.quizzes.map(quiz => (
                                    <div key={quiz.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(139,92,246,0.25)', background: 'rgba(139,92,246,0.07)' }}>
                                        <span style={{ fontSize: 14, flexShrink: 0 }}>📝</span>
                                        <span style={{ flex: 1, fontSize: 13, color: '#c4b5fd', fontWeight: 500 }}>{quiz.title}</span>
                                        <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 20, background: quiz.status === 'published' ? 'rgba(34,197,94,0.15)' : 'rgba(100,116,139,0.2)', color: quiz.status === 'published' ? '#4ade80' : '#94a3b8', flexShrink: 0 }}>{quiz.status}</span>
                                        <button type="button" onClick={() => handleDetachQuiz(quiz.id)} style={{ background: 'transparent', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 12, padding: '2px 5px', flexShrink: 0 }} title="Remove">✕</button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Attached assignments */}
                        {topic.assignments.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 9 }}>
                                {topic.assignments.map(a => (
                                    <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(251,191,36,0.2)', background: 'rgba(251,191,36,0.05)' }}>
                                        <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>📋</span>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 13, color: '#fcd34d', fontWeight: 600 }}>{a.title}</div>
                                            {a.description && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{a.description}</div>}
                                        </div>
                                        <button type="button" onClick={() => handleDeleteAssignment(a.id)} style={{ background: 'transparent', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 12, padding: '2px 5px', flexShrink: 0 }} title="Delete">✕</button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Action bar */}
                        <div style={{ display: 'flex', gap: 6, marginTop: itemCount > 0 ? 12 : 4, flexWrap: 'wrap' }}>
                            <button type="button" onClick={handleAddLesson} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.1)', color: '#a5b4fc', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                + Lesson
                            </button>
                            <button type="button" onClick={() => setShowQuizPicker(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: '1px solid rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.1)', color: '#c4b5fd', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                + Quiz
                            </button>
                            <button type="button" onClick={() => setShowAssignmentForm(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: '1px solid rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.07)', color: '#fcd34d', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                + Assignment
                            </button>
                        </div>

                        {/* Assignment inline form */}
                        {showAssignmentForm && (
                            <div style={{ marginTop: 10, padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(251,191,36,0.2)', background: 'rgba(251,191,36,0.04)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <input
                                    value={assignmentTitle}
                                    onChange={e => setAssignmentTitle(e.target.value)}
                                    placeholder="Assignment title *"
                                    autoFocus
                                    style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#e2e8f0', fontSize: 13, boxSizing: 'border-box', width: '100%' }}
                                />
                                <textarea
                                    value={assignmentDesc}
                                    onChange={e => setAssignmentDesc(e.target.value)}
                                    placeholder="Description (optional)"
                                    rows={2}
                                    style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#e2e8f0', fontSize: 13, resize: 'none', boxSizing: 'border-box', width: '100%' }}
                                />
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <button type="button" onClick={handleAddAssignment} disabled={!assignmentTitle.trim()} style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: assignmentTitle.trim() ? '#fbbf24' : 'rgba(251,191,36,0.3)', color: '#0a0a0f', fontSize: 12, fontWeight: 700, cursor: assignmentTitle.trim() ? 'pointer' : 'not-allowed' }}>Add</button>
                                    <button type="button" onClick={() => { setShowAssignmentForm(false); setAssignmentTitle(''); setAssignmentDesc(''); }} style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#64748b', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
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
                    <div style={{ background: '#13131a', borderRadius: 14, border: '1px solid rgba(139,92,246,0.3)', width: '100%', maxWidth: 400, maxHeight: '70vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
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
                                            <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{quiz.title}</span>
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
            setExpandedTopics(prev => new Set([...prev, t.id]));
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
                                    const s = new Set(prev);
                                    if (s.has(topic.id)) s.delete(topic.id); else s.add(topic.id);
                                    return s;
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
