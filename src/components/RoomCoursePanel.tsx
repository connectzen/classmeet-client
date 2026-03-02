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

export interface DrawSeg {
    x1: number; y1: number; x2: number; y2: number;
    color: string; size: number; mode: 'pen' | 'highlight' | 'eraser';
}

interface Props {
    courseIds: string[];
    serverUrl: string;
    role: string;
    activeLessonIdx: number;
    activeCourseIdx: number;
    onNav: (courseIdx: number, lessonIdx: number) => void;
    onCoursesLoaded?: (totalLessons: number) => void;
    onScrollSync?: (ratio: number) => void;
    externalScroll?: number | null;
    sidebarOpen: boolean;
    onSidebarToggle?: () => void;
    // Annotation props
    onDrawSegment?: (seg: DrawSeg) => void;
    onDrawClear?: () => void;
    externalDrawSeg?: DrawSeg | null;
    drawClearSignal?: number;
    onSnapshot?: (dataUrl: string) => void;
    snapshotRequest?: number;
    snapshotDataUrl?: string | null;  // student receives full canvas snapshot from teacher
}

const DRAW_COLORS = ['#ff4444', '#ff9900', '#ffdd00', '#44ff88', '#00ccff', '#ffffff'];
const TOOL_SIZES: Record<string, number> = { S: 0.6, M: 1, L: 2 };

export default function RoomCoursePanel({
    courseIds, serverUrl, role,
    activeLessonIdx, activeCourseIdx, onNav, onCoursesLoaded,
    onScrollSync, externalScroll,
    sidebarOpen, onSidebarToggle,
    onDrawSegment, onDrawClear,
    externalDrawSeg, drawClearSignal,
    onSnapshot, snapshotRequest,
    snapshotDataUrl,
}: Props) {
    const [courses, setCourses] = useState<CourseData[]>([]);
    const [loading, setLoading] = useState(true);

    // Drawing state (teacher only)
    const [drawTool, setDrawTool] = useState<'pen' | 'highlight' | 'eraser' | null>(null);
    const [drawColor, setDrawColor] = useState('#ff4444');
    const [drawSizeKey, setDrawSizeKey] = useState<'S' | 'M' | 'L'>('M');

    const contentRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const scrollThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastRatioRef = useRef(0);
    const isDrawingRef = useRef(false);
    const lastPtRef = useRef<{ x: number; y: number } | null>(null);

    const isTeacher = role === 'teacher';

    // ── Data loading ────────────────────────────────────────────────────────
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
                    lessons: Array.isArray(lessons)
                        ? (lessons as Lesson[]).sort((a, b) => a.order_index - b.order_index)
                        : [],
                }))
            )
        ).then(setCourses).finally(() => setLoading(false));
    }, [courseIds, serverUrl]);

    useEffect(() => {
        if (courses.length > 0)
            onCoursesLoaded?.(courses[activeCourseIdx]?.lessons.length ?? 0);
    }, [courses, activeCourseIdx, onCoursesLoaded]);

    // ── Scroll: reset on lesson change ──────────────────────────────────────
    useEffect(() => {
        if (contentRef.current) contentRef.current.scrollTop = 0;
        lastRatioRef.current = 0;
        // Clear canvas on lesson change
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx?.clearRect(0, 0, canvas.width, canvas.height);
        }
    }, [activeLessonIdx, activeCourseIdx]);

    // ── Scroll: student locked to teacher ───────────────────────────────────
    useEffect(() => {
        if (isTeacher || externalScroll == null) return;
        const el = contentRef.current;
        if (!el) return;
        const max = el.scrollHeight - el.clientHeight;
        if (max > 0) el.scrollTop = externalScroll * max;
    }, [externalScroll, isTeacher]);

    // ── Scroll: teacher throttled emit ──────────────────────────────────────
    const handleScroll = useCallback(() => {
        if (!isTeacher || !onScrollSync) return;
        const el = contentRef.current;
        if (!el) return;
        const max = el.scrollHeight - el.clientHeight;
        if (max <= 0) return;
        const ratio = el.scrollTop / max;
        if (Math.abs(ratio - lastRatioRef.current) < 0.003) return;
        lastRatioRef.current = ratio;
        if (scrollThrottleRef.current) return;
        scrollThrottleRef.current = setTimeout(() => {
            scrollThrottleRef.current = null;
            onScrollSync(lastRatioRef.current);
        }, 50);
    }, [isTeacher, onScrollSync]);

    // ── Canvas: resize to match wrapper ─────────────────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current;
        const wrapper = canvas?.parentElement;
        if (!canvas || !wrapper) return;
        const resize = () => {
            const { width, height } = wrapper.getBoundingClientRect();
            if (canvas.width !== Math.floor(width) || canvas.height !== Math.floor(height)) {
                // Save drawing before resize
                const tempImg = canvas.toDataURL();
                canvas.width = Math.floor(width);
                canvas.height = Math.floor(height);
                // Restore drawing
                const img = new Image();
                img.onload = () => canvas.getContext('2d')?.drawImage(img, 0, 0);
                img.src = tempImg;
            }
        };
        resize();
        const ro = new ResizeObserver(resize);
        ro.observe(wrapper);
        return () => ro.disconnect();
    }, []);

    // ── Canvas: draw incoming segment (student) ──────────────────────────────
    useEffect(() => {
        if (!externalDrawSeg) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        drawSegmentOnCanvas(ctx, externalDrawSeg, canvas.width, canvas.height);
    }, [externalDrawSeg]);

    // ── Canvas: clear signal ─────────────────────────────────────────────────
    useEffect(() => {
        if (drawClearSignal == null) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    }, [drawClearSignal]);

    // ── Canvas: teacher captures & sends snapshot ────────────────────────────
    useEffect(() => {
        if (!snapshotRequest || !onSnapshot) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        onSnapshot(canvas.toDataURL());
    }, [snapshotRequest, onSnapshot]);

    // ── Canvas: student receives full snapshot ───────────────────────────────
    useEffect(() => {
        if (!snapshotDataUrl) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const img = new Image();
        img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        };
        img.src = snapshotDataUrl;
    }, [snapshotDataUrl]);

    // ── Drawing helpers ──────────────────────────────────────────────────────
    function drawSegmentOnCanvas(
        ctx: CanvasRenderingContext2D,
        seg: DrawSeg,
        w: number, h: number,
    ) {
        const baseSize = seg.mode === 'pen' ? 3 : seg.mode === 'highlight' ? 20 : 24;
        ctx.save();
        if (seg.mode === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.strokeStyle = 'rgba(0,0,0,1)';
        } else if (seg.mode === 'highlight') {
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 0.35;
            ctx.strokeStyle = seg.color;
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
            ctx.strokeStyle = seg.color;
        }
        ctx.lineWidth = baseSize * seg.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(seg.x1 * w, seg.y1 * h);
        ctx.lineTo(seg.x2 * w, seg.y2 * h);
        ctx.stroke();
        ctx.restore();
    }

    const getCanvasPoint = (e: React.MouseEvent | React.TouchEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        return {
            x: (clientX - rect.left) / rect.width,
            y: (clientY - rect.top) / rect.height,
        };
    };

    const emitSegment = useCallback((seg: DrawSeg) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (ctx) drawSegmentOnCanvas(ctx, seg, canvas.width, canvas.height);
        onDrawSegment?.(seg);
    }, [onDrawSegment]);

    const handleDrawStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        if (!drawTool) return;
        e.preventDefault();
        isDrawingRef.current = true;
        const pt = getCanvasPoint(e);
        lastPtRef.current = pt;
    }, [drawTool]);

    const handleDrawMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawingRef.current || !drawTool || !lastPtRef.current) return;
        e.preventDefault();
        const pt = getCanvasPoint(e);
        if (!pt) return;
        const seg: DrawSeg = {
            x1: lastPtRef.current.x, y1: lastPtRef.current.y,
            x2: pt.x, y2: pt.y,
            color: drawColor,
            size: TOOL_SIZES[drawSizeKey],
            mode: drawTool,
        };
        emitSegment(seg);
        lastPtRef.current = pt;
    }, [drawTool, drawColor, drawSizeKey, emitSegment]);

    const handleDrawEnd = useCallback(() => {
        isDrawingRef.current = false;
        lastPtRef.current = null;
    }, []);

    const handleClear = useCallback(() => {
        const canvas = canvasRef.current;
        if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
        onDrawClear?.();
    }, [onDrawClear]);

    // ── Render ───────────────────────────────────────────────────────────────
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
    const canPrev = activeLessonIdx > 0;
    const canNext = activeLessonIdx < totalLessons - 1;
    const drawActive = isTeacher && drawTool !== null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--surface-2)', borderRadius: 12, overflow: 'hidden' }}>

            {/* Course tabs */}
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

            {/* Body: sidebar + content wrapper */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                {/* Sidebar — mirrors teacher's open/closed state */}
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
                            onClick={() => isTeacher ? onNav(activeCourseIdx, i) : undefined}
                            disabled={!isTeacher}
                            style={{
                                display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%',
                                padding: '10px 12px', border: 'none', textAlign: 'left',
                                background: activeLessonIdx === i ? 'rgba(99,102,241,0.18)' : 'transparent',
                                borderLeft: activeLessonIdx === i ? '3px solid #6366f1' : '3px solid transparent',
                                borderBottom: '1px solid var(--border)',
                                cursor: isTeacher ? 'pointer' : 'default',
                                pointerEvents: isTeacher ? 'auto' : 'none',
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

                {/* Content wrapper — canvas lives here, non-scrolling */}
                <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

                    {/* Scrollable lesson content */}
                    <div
                        ref={contentRef}
                        onScroll={isTeacher ? handleScroll : undefined}
                        style={{
                            width: '100%', height: '100%',
                            overflowY: isTeacher ? 'auto' : 'hidden',
                            padding: 20, boxSizing: 'border-box',
                        }}
                    >
                        {/* Sidebar toggle — teacher only */}
                        {isTeacher && (
                            <button
                                onClick={onSidebarToggle}
                                title={sidebarOpen ? 'Hide lesson list' : 'Show lesson list'}
                                style={{
                                    position: 'sticky', top: 0, left: 0, zIndex: 2,
                                    width: 28, height: 28, borderRadius: 7,
                                    border: '1px solid var(--border)',
                                    background: 'var(--surface-3)',
                                    color: 'var(--text-muted)',
                                    cursor: 'pointer', fontSize: 14, fontWeight: 700,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    marginBottom: 8,
                                }}
                            >
                                {sidebarOpen ? '‹' : '☰'}
                            </button>
                        )}

                        {lesson ? (
                            <div style={{ maxWidth: 720, marginLeft: 'auto', marginRight: 'auto' }}>
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
                            <p style={{ color: 'var(--text-muted)' }}>Select a lesson from the list.</p>
                        )}
                    </div>

                    {/* Annotation canvas — viewport-fixed overlay */}
                    <canvas
                        ref={canvasRef}
                        onMouseDown={drawActive ? handleDrawStart : undefined}
                        onMouseMove={drawActive ? handleDrawMove : undefined}
                        onMouseUp={drawActive ? handleDrawEnd : undefined}
                        onMouseLeave={handleDrawEnd}
                        onTouchStart={drawActive ? handleDrawStart : undefined}
                        onTouchMove={drawActive ? handleDrawMove : undefined}
                        onTouchEnd={handleDrawEnd}
                        style={{
                            position: 'absolute', inset: 0,
                            width: '100%', height: '100%',
                            pointerEvents: drawActive ? 'auto' : 'none',
                            cursor: drawActive
                                ? drawTool === 'eraser' ? 'cell' : 'crosshair'
                                : 'default',
                            zIndex: 10,
                        }}
                    />

                    {/* Prev / Next edge arrows — teacher only */}
                    {isTeacher && (
                        <>
                            <button
                                onClick={() => canPrev ? onNav(activeCourseIdx, activeLessonIdx - 1) : undefined}
                                disabled={!canPrev}
                                title="Previous lesson"
                                style={{
                                    position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                                    width: 36, height: 48, borderRadius: '0 8px 8px 0',
                                    border: 'none', background: 'transparent',
                                    color: canPrev ? '#a5b4fc' : 'rgba(255,255,255,0.18)',
                                    fontSize: 22, cursor: canPrev ? 'pointer' : 'not-allowed',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 12,
                                    transition: 'background 0.15s',
                                }}
                                onMouseEnter={e => { if (canPrev) e.currentTarget.style.background = 'rgba(99,102,241,0.15)'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                            >‹</button>

                            <button
                                onClick={() => canNext ? onNav(activeCourseIdx, activeLessonIdx + 1) : undefined}
                                disabled={!canNext}
                                title="Next lesson"
                                style={{
                                    position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
                                    width: 36, height: 48, borderRadius: '8px 0 0 8px',
                                    border: 'none', background: 'transparent',
                                    color: canNext ? '#a5b4fc' : 'rgba(255,255,255,0.18)',
                                    fontSize: 22, cursor: canNext ? 'pointer' : 'not-allowed',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 12,
                                    transition: 'background 0.15s',
                                }}
                                onMouseEnter={e => { if (canNext) e.currentTarget.style.background = 'rgba(99,102,241,0.15)'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                            >›</button>
                        </>
                    )}

                    {/* Annotation toolbar — teacher only */}
                    {isTeacher && (
                        <div style={{
                            position: 'absolute', bottom: 12, right: 12, zIndex: 13,
                            display: 'flex', alignItems: 'center', gap: 4,
                            background: 'rgba(10,10,20,0.85)', backdropFilter: 'blur(8px)',
                            border: '1px solid rgba(99,102,241,0.3)', borderRadius: 24,
                            padding: '5px 10px', boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                        }}>
                            {/* Tool buttons */}
                            {(['pen', 'highlight', 'eraser'] as const).map(tool => (
                                <button
                                    key={tool}
                                    onClick={() => setDrawTool(drawTool === tool ? null : tool)}
                                    title={tool.charAt(0).toUpperCase() + tool.slice(1)}
                                    style={{
                                        width: 28, height: 28, borderRadius: 8, border: 'none',
                                        background: drawTool === tool ? 'rgba(99,102,241,0.5)' : 'transparent',
                                        color: drawTool === tool ? '#a5b4fc' : 'var(--text-muted)',
                                        fontSize: 14, cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        transition: 'background 0.15s',
                                    }}
                                >
                                    {tool === 'pen' ? '✏' : tool === 'highlight' ? '▌' : '◻'}
                                </button>
                            ))}

                            {/* Divider */}
                            <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.12)', margin: '0 2px' }} />

                            {/* Color swatches */}
                            {DRAW_COLORS.map(c => (
                                <button
                                    key={c}
                                    onClick={() => setDrawColor(c)}
                                    style={{
                                        width: 16, height: 16, borderRadius: '50%', border: `2px solid ${drawColor === c ? '#fff' : 'transparent'}`,
                                        background: c, cursor: 'pointer', padding: 0, flexShrink: 0,
                                        transition: 'border-color 0.15s',
                                    }}
                                />
                            ))}

                            {/* Divider */}
                            <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.12)', margin: '0 2px' }} />

                            {/* Size buttons */}
                            {(['S', 'M', 'L'] as const).map(s => (
                                <button
                                    key={s}
                                    onClick={() => setDrawSizeKey(s)}
                                    style={{
                                        width: 22, height: 22, borderRadius: 6, border: 'none',
                                        background: drawSizeKey === s ? 'rgba(99,102,241,0.5)' : 'transparent',
                                        color: drawSizeKey === s ? '#a5b4fc' : 'var(--text-muted)',
                                        fontSize: 10, fontWeight: 700, cursor: 'pointer',
                                        transition: 'background 0.15s',
                                    }}
                                >{s}</button>
                            ))}

                            {/* Divider */}
                            <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.12)', margin: '0 2px' }} />

                            {/* Clear button */}
                            <button
                                onClick={handleClear}
                                title="Clear all annotations"
                                style={{
                                    width: 28, height: 28, borderRadius: 8, border: 'none',
                                    background: 'transparent', color: '#f87171',
                                    fontSize: 14, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    transition: 'background 0.15s',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.15)'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                            >🗑</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
