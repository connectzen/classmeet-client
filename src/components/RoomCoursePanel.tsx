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
    color: string; size: number;
    mode: 'pen' | 'highlight' | 'eraser' | 'circle' | 'rect' | 'square' | 'text';
    text?: string;
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
    onDrawSegment?: (seg: DrawSeg) => void;
    onDrawClear?: () => void;
    externalDrawSeg?: DrawSeg | null;
    drawClearSignal?: number;
    onSnapshot?: (dataUrl: string) => void;
    snapshotRequest?: number;
    snapshotDataUrl?: string | null;
}

type DrawTool = 'pen' | 'highlight' | 'eraser' | 'text' | 'circle' | 'rect' | 'square';

const DRAW_COLORS = ['#ff4444', '#ff9900', '#ffdd00', '#44ff88', '#00ccff', '#ffffff'];
const TOOL_SIZES: Record<string, number> = { S: 0.6, M: 1, L: 2 };
const SHAPE_TOOLS = ['circle', 'rect', 'square'];

const TOOL_DEFS: { id: DrawTool; icon: string; tip: string; cursor: string }[] = [
    { id: 'pen',       icon: '✏',  tip: 'Pen',        cursor: 'crosshair' },
    { id: 'highlight', icon: '▌',  tip: 'Highlight',  cursor: 'crosshair' },
    { id: 'text',      icon: 'T',  tip: 'Text',       cursor: 'text'      },
    { id: 'circle',    icon: '○',  tip: 'Circle',     cursor: 'crosshair' },
    { id: 'rect',      icon: '▭',  tip: 'Rectangle',  cursor: 'crosshair' },
    { id: 'square',    icon: '□',  tip: 'Square',     cursor: 'crosshair' },
    { id: 'eraser',    icon: '◻',  tip: 'Eraser',     cursor: 'cell'      },
];

// ── Canvas drawing helper ──────────────────────────────────────────────────
function drawOnCanvas(ctx: CanvasRenderingContext2D, seg: DrawSeg, w: number, h: number) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (seg.mode === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = 1;
        ctx.lineWidth = seg.size * 24;
        ctx.beginPath(); ctx.moveTo(seg.x1 * w, seg.y1 * h); ctx.lineTo(seg.x2 * w, seg.y2 * h); ctx.stroke();
    } else if (seg.mode === 'pen') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1; ctx.strokeStyle = seg.color; ctx.lineWidth = seg.size * 3;
        ctx.beginPath(); ctx.moveTo(seg.x1 * w, seg.y1 * h); ctx.lineTo(seg.x2 * w, seg.y2 * h); ctx.stroke();
    } else if (seg.mode === 'highlight') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.35; ctx.strokeStyle = seg.color; ctx.lineWidth = seg.size * 20;
        ctx.beginPath(); ctx.moveTo(seg.x1 * w, seg.y1 * h); ctx.lineTo(seg.x2 * w, seg.y2 * h); ctx.stroke();
    } else if (seg.mode === 'circle') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1; ctx.strokeStyle = seg.color; ctx.lineWidth = seg.size * 2.5;
        const cx = ((seg.x1 + seg.x2) / 2) * w, cy = ((seg.y1 + seg.y2) / 2) * h;
        // Use max of horizontal/vertical half-extents so the circle always covers the drag area
        const r = Math.max(Math.abs(seg.x2 - seg.x1) * w / 2, Math.abs(seg.y2 - seg.y1) * h / 2, 1);
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.stroke();
    } else if (seg.mode === 'rect') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1; ctx.strokeStyle = seg.color; ctx.lineWidth = seg.size * 2.5;
        ctx.strokeRect(seg.x1 * w, seg.y1 * h, (seg.x2 - seg.x1) * w, (seg.y2 - seg.y1) * h);
    } else if (seg.mode === 'square') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1; ctx.strokeStyle = seg.color; ctx.lineWidth = seg.size * 2.5;
        const dw = (seg.x2 - seg.x1) * w, dh = (seg.y2 - seg.y1) * h;
        const side = Math.min(Math.abs(dw), Math.abs(dh));
        ctx.strokeRect(seg.x1 * w, seg.y1 * h, Math.sign(dw) * side, Math.sign(dh) * side);
    } else if (seg.mode === 'text') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1; ctx.fillStyle = seg.color;
        ctx.font = `bold ${Math.round(15 * seg.size)}px sans-serif`;
        ctx.fillText(seg.text || '', seg.x1 * w, seg.y1 * h);
    }
    ctx.restore();
}

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

    const [drawTool, setDrawTool] = useState<DrawTool | null>(null);
    const [drawColor, setDrawColor] = useState('#ff4444');
    const [drawSizeKey, setDrawSizeKey] = useState<'S' | 'M' | 'L'>('M');
    const [textInput, setTextInput] = useState<{ vx: number; vy: number; cx: number; cy: number } | null>(null);
    const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null);

    // ── Refs ─────────────────────────────────────────────────────────────────
    const contentRef      = useRef<HTMLDivElement>(null);
    const canvasRef       = useRef<HTMLCanvasElement>(null);
    const previewRef      = useRef<HTMLCanvasElement>(null);
    const wrapperRef      = useRef<HTMLDivElement>(null);
    const scrollThrottle  = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastRatio       = useRef(0);
    const isDrawing       = useRef(false);
    const lastPt          = useRef<{ x: number; y: number } | null>(null);
    const shapeStart      = useRef<{ x: number; y: number } | null>(null);
    const toolbarRef      = useRef<HTMLDivElement>(null);
    const isDraggingBar   = useRef(false);
    const barDragOffset   = useRef({ x: 0, y: 0 });

    // Always-fresh refs — document-level handlers read these so there are never stale closures
    const drawState = useRef({ drawTool, drawColor, drawSizeKey });
    drawState.current = { drawTool, drawColor, drawSizeKey };
    const onDrawSegCb = useRef(onDrawSegment);
    onDrawSegCb.current = onDrawSegment;

    const isTeacher   = role === 'teacher';
    const drawActive  = isTeacher && drawTool !== null;
    const cursor      = drawTool ? (TOOL_DEFS.find(t => t.id === drawTool)?.cursor ?? 'crosshair') : 'default';

    // ── Data loading ──────────────────────────────────────────────────────────
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
                    title: (course as { title?: string }).title || '',
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

    // ── Scroll: teacher → emit ratio ─────────────────────────────────────────
    const handleScroll = useCallback(() => {
        if (!isTeacher || !onScrollSync) return;
        const el = contentRef.current;
        if (!el) return;
        const max = el.scrollHeight - el.clientHeight;
        if (max <= 0) return;
        const ratio = el.scrollTop / max;
        if (Math.abs(ratio - lastRatio.current) < 0.003) return;
        lastRatio.current = ratio;
        if (scrollThrottle.current) return;
        scrollThrottle.current = setTimeout(() => {
            scrollThrottle.current = null;
            onScrollSync(lastRatio.current);
        }, 50);
    }, [isTeacher, onScrollSync]);

    // ── Scroll: student ← locked to teacher ──────────────────────────────────
    useEffect(() => {
        if (isTeacher || externalScroll == null) return;
        const el = contentRef.current;
        if (!el) return;
        const max = el.scrollHeight - el.clientHeight;
        if (max > 0) el.scrollTop = externalScroll * max;
    }, [externalScroll, isTeacher]);

    // ── Clear canvas on lesson/course change ──────────────────────────────────
    useEffect(() => {
        if (contentRef.current) contentRef.current.scrollTop = 0;
        lastRatio.current = 0;
        const c = canvasRef.current;
        if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
        const p = previewRef.current;
        if (p) p.getContext('2d')?.clearRect(0, 0, p.width, p.height);
    }, [activeLessonIdx, activeCourseIdx]);

    // ── Canvas sizing — runs once on mount.
    // IMPORTANT: canvas is always in the DOM (below), so canvasRef.current is
    // never null when this effect runs, even during loading state.
    // FIX: collapse canvas CSS height before reading scrollHeight to break
    // the feedback loop that prevented shorter lessons from shrinking the canvas.
    useEffect(() => {
        const content = contentRef.current;
        const canvas  = canvasRef.current;
        const preview = previewRef.current;
        if (!content || !canvas || !preview) return;

        const sync = () => {
            canvas.style.height  = '0px';
            preview.style.height = '0px';
            const w = content.clientWidth  || 1;
            const h = Math.max(content.scrollHeight, content.clientHeight, 1);
            if (canvas.width !== w || canvas.height !== h) {
                const saved = canvas.toDataURL();
                canvas.width = w; canvas.height = h;
                preview.width = w; preview.height = h;
                if (saved !== 'data:,') {
                    const img = new Image();
                    img.onload = () => canvas.getContext('2d')?.drawImage(img, 0, 0);
                    img.src = saved;
                }
            }
            canvas.style.width   = canvas.width  + 'px';
            canvas.style.height  = canvas.height + 'px';
            preview.style.width  = preview.width  + 'px';
            preview.style.height = preview.height + 'px';
        };

        sync();
        const ro = new ResizeObserver(sync);
        ro.observe(content);
        return () => ro.disconnect();
    }, []);

    // ── Drawing: document-level events ────────────────────────────────────────
    // Registered once on mount. All draw state is read from drawState ref so
    // there are no stale closures. mousemove/mouseup are on document so strokes
    // never stop when the cursor leaves the canvas boundary.
    useEffect(() => {
        if (!isTeacher) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        const pt = (e: MouseEvent) => {
            const r = canvas.getBoundingClientRect();
            return { x: (e.clientX - r.left) / canvas.width, y: (e.clientY - r.top) / canvas.height };
        };
        const isShape = (t: string) => SHAPE_TOOLS.includes(t);

        const onDown = (e: MouseEvent) => {
            const { drawTool } = drawState.current;
            if (!drawTool || drawTool === 'text' || e.target !== canvas) return;
            e.preventDefault();
            isDrawing.current = true;
            const p = pt(e);
            lastPt.current = p;
            if (isShape(drawTool)) shapeStart.current = p;
        };

        const onMove = (e: MouseEvent) => {
            if (!isDrawing.current) return;
            const { drawTool, drawColor, drawSizeKey } = drawState.current;
            if (!drawTool || drawTool === 'text') return;
            const p = pt(e);
            if (isShape(drawTool)) {
                const s = shapeStart.current, prev = previewRef.current;
                if (s && prev) {
                    const ctx = prev.getContext('2d');
                    if (ctx) {
                        ctx.clearRect(0, 0, prev.width, prev.height);
                        drawOnCanvas(ctx, { x1: s.x, y1: s.y, x2: p.x, y2: p.y, color: drawColor, size: TOOL_SIZES[drawSizeKey], mode: drawTool as DrawSeg['mode'] }, prev.width, prev.height);
                    }
                }
            } else {
                const prev = lastPt.current;
                if (prev) {
                    const seg: DrawSeg = { x1: prev.x, y1: prev.y, x2: p.x, y2: p.y, color: drawColor, size: TOOL_SIZES[drawSizeKey], mode: drawTool };
                    const ctx = canvas.getContext('2d');
                    if (ctx) drawOnCanvas(ctx, seg, canvas.width, canvas.height);
                    onDrawSegCb.current?.(seg);
                    lastPt.current = p;
                }
            }
        };

        const onUp = (e: MouseEvent) => {
            if (!isDrawing.current) return;
            isDrawing.current = false;
            const { drawTool, drawColor, drawSizeKey } = drawState.current;
            if (!drawTool) return;
            if (isShape(drawTool) && shapeStart.current) {
                const p = pt(e);
                const prev = previewRef.current;
                if (prev) prev.getContext('2d')?.clearRect(0, 0, prev.width, prev.height);
                const seg: DrawSeg = { x1: shapeStart.current.x, y1: shapeStart.current.y, x2: p.x, y2: p.y, color: drawColor, size: TOOL_SIZES[drawSizeKey], mode: drawTool as DrawSeg['mode'] };
                const ctx = canvas.getContext('2d');
                if (ctx) drawOnCanvas(ctx, seg, canvas.width, canvas.height);
                onDrawSegCb.current?.(seg);
                shapeStart.current = null;
            }
            lastPt.current = null;
        };

        canvas.addEventListener('mousedown', onDown);
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return () => {
            canvas.removeEventListener('mousedown', onDown);
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
    }, [isTeacher]);

    // ── Receive segments from teacher (student) ───────────────────────────────
    useEffect(() => {
        if (!externalDrawSeg) return;
        const c = canvasRef.current;
        if (c) { const ctx = c.getContext('2d'); if (ctx) drawOnCanvas(ctx, externalDrawSeg, c.width, c.height); }
    }, [externalDrawSeg]);

    // ── Clear signal ──────────────────────────────────────────────────────────
    useEffect(() => {
        if (drawClearSignal == null) return;
        const c = canvasRef.current;
        if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
    }, [drawClearSignal]);

    // ── Snapshot: teacher sends to late joiner ────────────────────────────────
    useEffect(() => {
        if (!snapshotRequest || !onSnapshot) return;
        const c = canvasRef.current;
        if (c) onSnapshot(c.toDataURL());
    }, [snapshotRequest, onSnapshot]);

    // ── Snapshot: student receives from teacher ───────────────────────────────
    useEffect(() => {
        if (!snapshotDataUrl) return;
        const c = canvasRef.current;
        if (!c) return;
        const ctx = c.getContext('2d');
        if (!ctx) return;
        const img = new Image();
        img.onload = () => { ctx.clearRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height); };
        img.src = snapshotDataUrl;
    }, [snapshotDataUrl]);

    // ── Toolbar drag ──────────────────────────────────────────────────────────
    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!isDraggingBar.current) return;
            const wr = wrapperRef.current?.getBoundingClientRect();
            if (!wr) return;
            setToolbarPos({ x: Math.max(0, e.clientX - wr.left - barDragOffset.current.x), y: Math.max(0, e.clientY - wr.top - barDragOffset.current.y) });
        };
        const onUp = () => { isDraggingBar.current = false; };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    }, []);

    const onBarDragStart = (e: React.MouseEvent) => {
        e.preventDefault();
        const tb = toolbarRef.current, wr = wrapperRef.current;
        if (!tb || !wr) return;
        isDraggingBar.current = true;
        const tr = tb.getBoundingClientRect(), wr2 = wr.getBoundingClientRect();
        barDragOffset.current = { x: e.clientX - (tr.left - wr2.left), y: e.clientY - (tr.top - wr2.top) };
    };

    // ── Text tool click ───────────────────────────────────────────────────────
    const onCanvasClick = useCallback((e: React.MouseEvent) => {
        if (drawTool !== 'text') return;
        const c = canvasRef.current;
        if (!c) return;
        const r = c.getBoundingClientRect();
        setTextInput({ vx: e.clientX, vy: e.clientY, cx: (e.clientX - r.left) / c.width, cy: (e.clientY - r.top) / c.height });
    }, [drawTool]);

    const commitText = useCallback((text: string, cx: number, cy: number) => {
        setTextInput(null);
        if (!text.trim()) return;
        const { drawColor, drawSizeKey } = drawState.current;
        const seg: DrawSeg = { x1: cx, y1: cy, x2: cx, y2: cy, color: drawColor, size: TOOL_SIZES[drawSizeKey], mode: 'text', text };
        const c = canvasRef.current;
        if (c) { const ctx = c.getContext('2d'); if (ctx) drawOnCanvas(ctx, seg, c.width, c.height); }
        onDrawSegCb.current?.(seg);
    }, []);

    const handleClear = useCallback(() => {
        const c = canvasRef.current;
        if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
        const p = previewRef.current;
        if (p) p.getContext('2d')?.clearRect(0, 0, p.width, p.height);
        onDrawClear?.();
    }, [onDrawClear]);

    // ── Derived values ────────────────────────────────────────────────────────
    const course      = courses[activeCourseIdx] ?? courses[0];
    const lesson      = course?.lessons[activeLessonIdx] || null;
    const totalLessons = course?.lessons.length ?? 0;
    const canPrev     = activeLessonIdx > 0;
    const canNext     = activeLessonIdx < totalLessons - 1;

    // ── Render ────────────────────────────────────────────────────────────────
    // IMPORTANT: the canvas elements MUST always be rendered (never behind an
    // early-return) so that useEffect([]) finds them on first mount.
    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--surface-2)', borderRadius: 12, overflow: 'hidden' }}>

            {/* ── Header: sidebar toggle + course tabs + lesson badge ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap' }}>
                <button
                    onClick={onSidebarToggle}
                    title={sidebarOpen ? 'Hide lessons' : 'Show lessons'}
                    style={{
                        width: 28, height: 28, borderRadius: 7, flexShrink: 0, border: '1px solid var(--border)',
                        background: sidebarOpen ? 'rgba(99,102,241,0.2)' : 'var(--surface-3)',
                        color: sidebarOpen ? '#a5b4fc' : 'var(--text-muted)',
                        cursor: 'pointer', fontSize: 14, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                >{sidebarOpen ? '‹' : '☰'}</button>
                {courses.length > 1 && courses.map((c, i) => (
                    <button key={c.id} onClick={() => isTeacher ? onNav(i, 0) : undefined} disabled={!isTeacher}
                        style={{
                            padding: '4px 12px', borderRadius: 8, border: 'none', fontSize: 13,
                            background: activeCourseIdx === i ? 'rgba(99,102,241,0.3)' : 'var(--surface-3)',
                            color: activeCourseIdx === i ? '#a5b4fc' : 'var(--text-muted)',
                            fontWeight: activeCourseIdx === i ? 700 : 400,
                            cursor: isTeacher ? 'pointer' : 'default',
                        }}>
                        <RichContent html={c.title} style={{ display: 'inline' }} />
                    </button>
                ))}
                {totalLessons > 0 && (
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', paddingRight: 4 }}>
                        Lesson {activeLessonIdx + 1} / {totalLessons}
                    </span>
                )}
            </div>

            {/* ── Body ── */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                {/* Sidebar */}
                <div style={{
                    width: sidebarOpen ? 200 : 0, flexShrink: 0,
                    borderRight: sidebarOpen ? '1px solid var(--border)' : 'none',
                    overflowY: sidebarOpen ? 'auto' : 'hidden', overflowX: 'hidden',
                    transition: 'width 0.2s ease',
                }}>
                    {(course?.lessons ?? []).map((l, i) => (
                        <button key={l.id} onClick={() => isTeacher ? onNav(activeCourseIdx, i) : undefined}
                            disabled={!isTeacher}
                            style={{
                                display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%',
                                padding: '10px 12px', border: 'none', textAlign: 'left',
                                background: activeLessonIdx === i ? 'rgba(99,102,241,0.18)' : 'transparent',
                                borderLeft: activeLessonIdx === i ? '3px solid #6366f1' : '3px solid transparent',
                                borderBottom: '1px solid var(--border)',
                                cursor: isTeacher ? 'pointer' : 'default',
                                pointerEvents: isTeacher ? 'auto' : 'none',
                            }}>
                            <span style={{ fontSize: 11, color: activeLessonIdx === i ? '#818cf8' : 'var(--text-muted)', fontWeight: 700, minWidth: 18, marginTop: 2 }}>{i + 1}.</span>
                            <span style={{ fontSize: 12, color: activeLessonIdx === i ? '#e2e8f0' : 'var(--text-muted)', lineHeight: 1.4, wordBreak: 'break-word' }}>{l.title}</span>
                        </button>
                    ))}
                </div>

                {/* Content wrapper */}
                <div ref={wrapperRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

                    {/* Scrollable area — canvas lives INSIDE so drawings anchor to content */}
                    <div ref={contentRef} onScroll={isTeacher ? handleScroll : undefined}
                        style={{ width: '100%', height: '100%', overflowY: isTeacher ? 'auto' : 'hidden', position: 'relative', userSelect: drawActive ? 'none' : 'text' }}>

                        {/* Lesson content — 56px right padding on both sides keeps text width
                            identical between teacher and student so scroll sync stays aligned */}
                        <div style={{ padding: 20, paddingRight: 56, boxSizing: 'border-box' }}>
                            {loading ? (
                                <div style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>Loading course…</div>
                            ) : !course ? (
                                <div style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>No courses loaded.</div>
                            ) : !lesson ? (
                                <p style={{ color: 'var(--text-muted)' }}>Select a lesson from the list.</p>
                            ) : (
                                <div style={{ maxWidth: 720, marginLeft: 'auto', marginRight: 'auto' }}>
                                    <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{lesson.title}</h3>
                                    {lesson.lesson_type === 'video' && lesson.video_url
                                        ? <video src={lesson.video_url} controls style={{ width: '100%', borderRadius: 10, marginBottom: 16, background: '#000' }} />
                                        : null}
                                    {lesson.content
                                        ? <RichContent html={lesson.content} style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-muted)' }} />
                                        : <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No content for this lesson.</p>}
                                    <div style={{ height: 60 }} />
                                </div>
                            )}
                        </div>

                        {/* Canvases ALWAYS in the DOM so useEffect([]) finds them on first mount */}
                        <canvas ref={canvasRef}
                            onClick={drawActive ? onCanvasClick : undefined}
                            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: drawActive ? 'auto' : 'none', cursor: drawActive ? cursor : 'default', zIndex: 5 }} />
                        <canvas ref={previewRef}
                            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 6 }} />
                    </div>

                    {/* Prev / Next arrows */}
                    {isTeacher && (
                        <>
                            <button onClick={() => canPrev && onNav(activeCourseIdx, activeLessonIdx - 1)} disabled={!canPrev}
                                title="Previous lesson"
                                style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 32, height: 48, borderRadius: '0 8px 8px 0', border: 'none', background: 'transparent', color: canPrev ? '#a5b4fc' : 'rgba(255,255,255,0.15)', fontSize: 22, cursor: canPrev ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 12, transition: 'background 0.15s' }}
                                onMouseEnter={e => { if (canPrev) e.currentTarget.style.background = 'rgba(99,102,241,0.15)'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>‹</button>
                            <button onClick={() => canNext && onNav(activeCourseIdx, activeLessonIdx + 1)} disabled={!canNext}
                                title="Next lesson"
                                style={{ position: 'absolute', right: 44, top: '50%', transform: 'translateY(-50%)', width: 32, height: 48, borderRadius: '8px 0 0 8px', border: 'none', background: 'transparent', color: canNext ? '#a5b4fc' : 'rgba(255,255,255,0.15)', fontSize: 22, cursor: canNext ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 12, transition: 'background 0.15s' }}
                                onMouseEnter={e => { if (canNext) e.currentTarget.style.background = 'rgba(99,102,241,0.15)'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>›</button>
                        </>
                    )}

                    {/* Annotation toolbar — teacher only, draggable */}
                    {isTeacher && (
                        <div ref={toolbarRef}
                            style={{
                                position: 'absolute',
                                ...(toolbarPos ? { left: toolbarPos.x, top: toolbarPos.y } : { right: 6, top: '50%', transform: 'translateY(-50%)' }),
                                zIndex: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                                background: 'rgba(10,10,20,0.92)', backdropFilter: 'blur(10px)',
                                border: '1px solid rgba(99,102,241,0.35)', borderRadius: 14, padding: '7px 5px',
                                boxShadow: '0 6px 24px rgba(0,0,0,0.5)', maxHeight: 'calc(100% - 24px)',
                                overflowY: 'auto', overflowX: 'hidden',
                            }}>
                            {/* Drag handle */}
                            <div onMouseDown={onBarDragStart} title="Drag toolbar" style={{ cursor: 'grab', color: 'rgba(255,255,255,0.3)', fontSize: 13, padding: '2px 4px', userSelect: 'none', lineHeight: 1, letterSpacing: 1 }}>⠿</div>
                            <div style={{ width: 20, height: 1, background: 'rgba(255,255,255,0.12)' }} />

                            {/* Tool buttons */}
                            {TOOL_DEFS.map(({ id, icon, tip }) => (
                                <button key={id} onClick={() => setDrawTool(drawTool === id ? null : id)} title={tip}
                                    style={{ width: 30, height: 30, borderRadius: 7, border: 'none', background: drawTool === id ? 'rgba(99,102,241,0.6)' : 'transparent', color: drawTool === id ? '#a5b4fc' : 'var(--text-muted)', fontSize: id === 'text' ? 12 : 14, fontWeight: id === 'text' ? 700 : 400, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s', flexShrink: 0 }}
                                    onMouseEnter={e => { if (drawTool !== id) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                                    onMouseLeave={e => { if (drawTool !== id) e.currentTarget.style.background = 'transparent'; }}
                                >{icon}</button>
                            ))}
                            <div style={{ width: 20, height: 1, background: 'rgba(255,255,255,0.12)' }} />

                            {/* Colors */}
                            {DRAW_COLORS.map(c => (
                                <button key={c} onClick={() => setDrawColor(c)} title={c}
                                    style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${drawColor === c ? '#fff' : 'transparent'}`, background: c, cursor: 'pointer', padding: 0, flexShrink: 0, transition: 'border-color 0.15s' }} />
                            ))}
                            <div style={{ width: 20, height: 1, background: 'rgba(255,255,255,0.12)' }} />

                            {/* Sizes */}
                            {(['S', 'M', 'L'] as const).map(s => (
                                <button key={s} onClick={() => setDrawSizeKey(s)} title={s === 'S' ? 'Small' : s === 'M' ? 'Medium' : 'Large'}
                                    style={{ width: 26, height: 20, borderRadius: 5, border: 'none', background: drawSizeKey === s ? 'rgba(99,102,241,0.5)' : 'transparent', color: drawSizeKey === s ? '#a5b4fc' : 'var(--text-muted)', fontSize: 10, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>{s}</button>
                            ))}
                            <div style={{ width: 20, height: 1, background: 'rgba(255,255,255,0.12)' }} />

                            {/* Clear */}
                            <button onClick={handleClear} title="Clear annotations"
                                style={{ width: 30, height: 30, borderRadius: 7, border: 'none', background: 'transparent', color: '#f87171', fontSize: 14, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.18)'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>🗑</button>
                        </div>
                    )}
                </div>
            </div>

            {/* Floating text input */}
            {textInput && (
                <textarea autoFocus rows={2} placeholder="Type here, Enter to commit…"
                    style={{ position: 'fixed', left: textInput.vx, top: textInput.vy, zIndex: 9999, minWidth: 140, background: 'rgba(10,10,20,0.9)', color: drawColor, border: `2px solid ${drawColor}`, borderRadius: 8, padding: '6px 10px', fontSize: Math.round(15 * TOOL_SIZES[drawSizeKey]), fontFamily: 'sans-serif', fontWeight: 700, outline: 'none', resize: 'both', backdropFilter: 'blur(8px)', boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }}
                    onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText(e.currentTarget.value, textInput.cx, textInput.cy); }
                        if (e.key === 'Escape') setTextInput(null);
                    }}
                    onBlur={e => commitText(e.currentTarget.value, textInput.cx, textInput.cy)} />
            )}
        </div>
    );
}
