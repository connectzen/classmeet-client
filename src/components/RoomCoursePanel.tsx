import { useState, useEffect, useRef, useCallback } from 'react';
import { RichContent } from './RichEditor';

interface Lesson {
    id: string;
    title: string;
    content: string;
    lesson_type: string;
    video_url?: string | null;
    audio_url?: string | null;
    image_url?: string | null;
    order_index: number;
}

interface Topic {
    id: string;
    title: string;
    order_index: number;
    lessons: Lesson[];
}

interface CourseData {
    id: string;
    title: string;
    topics: Topic[];
    lessons: Lesson[]; // flattened for nav
}

export interface DrawSeg {
    x1: number; y1: number; x2: number; y2: number;
    color: string; size: number;
    mode: 'pen' | 'highlight' | 'eraser' | 'circle' | 'rect' | 'square' | 'text' | 'arrow' | 'line';
    text?: string;
    fontStyle?: string;
    fontFamily?: string;
    fontSizePx?: number;
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
    onDrawPreview?: (seg: DrawSeg) => void;   // live shape/text preview
    onDrawCursor?: (x: number, y: number) => void; // live cursor pos
    onDrawClear?: () => void;
    externalDrawSeg?: DrawSeg | null;
    externalDrawPreview?: DrawSeg | null;     // student receives live preview
    externalCursor?: { x: number; y: number } | null; // student sees teacher cursor
    drawClearSignal?: number;
    onSnapshot?: (dataUrl: string) => void;
    snapshotRequest?: number;
    snapshotDataUrl?: string | null;
    sharedWithStudents?: boolean;
    onShareToggle?: () => void;
    blackboardActive?: boolean;
    onBlackboardToggle?: (on: boolean) => void;
}

type DrawTool = 'pen' | 'highlight' | 'eraser' | 'text' | 'circle' | 'rect' | 'square' | 'arrow' | 'line';

const DRAW_COLORS = ['#ff4444', '#ff9900', '#ffdd00', '#44ff88', '#00ccff', '#ffffff'];
const TOOL_SIZES: Record<string, number> = { S: 0.6, M: 1, L: 2 };
const SHAPE_TOOLS = ['circle', 'rect', 'square', 'arrow', 'line'];

const TOOL_DEFS: { id: DrawTool; icon: string; tip: string; cursor: string }[] = [
    { id: 'pen',       icon: '✏',  tip: 'Pen',        cursor: 'crosshair' },
    { id: 'highlight', icon: '▌',  tip: 'Highlight',  cursor: 'crosshair' },
    { id: 'text',      icon: 'T',  tip: 'Text',       cursor: 'text'      },
    { id: 'eraser',    icon: '◻',  tip: 'Eraser',     cursor: 'cell'      },
    { id: 'arrow',     icon: '↗',  tip: 'Arrow',      cursor: 'crosshair' },
    { id: 'line',      icon: '/',  tip: 'Line',       cursor: 'crosshair' },
    { id: 'circle',    icon: '○',  tip: 'Circle',     cursor: 'crosshair' },
    { id: 'rect',      icon: '▭',  tip: 'Rectangle',  cursor: 'crosshair' },
    { id: 'square',    icon: '□',  tip: 'Square',     cursor: 'crosshair' },
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
    } else if (seg.mode === 'line') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1; ctx.strokeStyle = seg.color; ctx.lineWidth = seg.size * 2.5;
        ctx.beginPath(); ctx.moveTo(seg.x1 * w, seg.y1 * h); ctx.lineTo(seg.x2 * w, seg.y2 * h); ctx.stroke();
    } else if (seg.mode === 'circle') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1; ctx.strokeStyle = seg.color; ctx.lineWidth = seg.size * 2.5;
        const cx = ((seg.x1 + seg.x2) / 2) * w, cy = ((seg.y1 + seg.y2) / 2) * h;
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
    } else if (seg.mode === 'arrow') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1; ctx.strokeStyle = seg.color; ctx.fillStyle = seg.color;
        ctx.lineWidth = seg.size * 2.5;
        const ax1 = seg.x1 * w, ay1 = seg.y1 * h;
        const ax2 = seg.x2 * w, ay2 = seg.y2 * h;
        // Shaft
        ctx.beginPath(); ctx.moveTo(ax1, ay1); ctx.lineTo(ax2, ay2); ctx.stroke();
        // Arrowhead
        const angle = Math.atan2(ay2 - ay1, ax2 - ax1);
        const headLen = Math.max(10, seg.size * 12);
        ctx.beginPath();
        ctx.moveTo(ax2, ay2);
        ctx.lineTo(ax2 - headLen * Math.cos(angle - Math.PI / 6), ay2 - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(ax2 - headLen * Math.cos(angle + Math.PI / 6), ay2 - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath(); ctx.fill();
    } else if (seg.mode === 'text') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1; ctx.fillStyle = seg.color;
        const fStyle  = seg.fontStyle  || 'bold';
        const fFamily = seg.fontFamily || 'sans-serif';
        const fSize   = seg.fontSizePx ?? Math.round(15 * seg.size);
        ctx.font = `${fStyle} ${fSize}px ${fFamily}`;
        ctx.textBaseline = 'top';
        const lineH   = fSize * 1.4;
        const RIGHT_PAD = 24; // canvas px kept clear on the right
        const maxW    = Math.max(10, (1 - seg.x1) * w - RIGHT_PAD);
        const startX  = seg.x1 * w;
        let   curY    = seg.y1 * h;
        // Helper: break a token that is itself wider than maxW character by character
        const breakWide = (token: string, carry: string): string[] => {
            const chunks: string[] = [];
            let buf = carry;
            for (const ch of token) {
                const t = buf + ch;
                if (ctx.measureText(t).width > maxW && buf) {
                    chunks.push(buf); buf = ch;
                } else { buf = t; }
            }
            return [...chunks, buf];
        };
        // Word-wrap: split on explicit newlines first, then wrap each line by word
        for (const rawLine of (seg.text || '').split('\n')) {
            if (rawLine === '') { curY += lineH; continue; }
            const words = rawLine.split(' ');
            let cur = '';
            for (const word of words) {
                const test = cur ? cur + ' ' + word : word;
                if (ctx.measureText(test).width > maxW) {
                    // Flush current buffer first
                    if (cur) { ctx.fillText(cur, startX, curY); curY += lineH; cur = ''; }
                    // Break the word itself if it's wider than maxW
                    const parts = breakWide(word, '');
                    for (let pi = 0; pi < parts.length - 1; pi++) {
                        ctx.fillText(parts[pi], startX, curY); curY += lineH;
                    }
                    cur = parts[parts.length - 1];
                } else {
                    cur = test;
                }
            }
            if (cur) { ctx.fillText(cur, startX, curY); curY += lineH; }
        }
    }
    ctx.restore();
}

export default function RoomCoursePanel({
    courseIds, serverUrl, role,
    activeLessonIdx, activeCourseIdx, onNav, onCoursesLoaded,
    onScrollSync, externalScroll,
    sidebarOpen, onSidebarToggle,
    onDrawSegment, onDrawPreview, onDrawCursor, onDrawClear,
    externalDrawSeg, externalDrawPreview, externalCursor, drawClearSignal,
    onSnapshot, snapshotRequest,
    snapshotDataUrl,
    sharedWithStudents, onShareToggle,
    blackboardActive, onBlackboardToggle,
}: Props) {
    const [courses, setCourses] = useState<CourseData[]>([]);
    const [loading, setLoading] = useState(true);

    const [drawTool, setDrawTool] = useState<DrawTool | null>(null);
    const [drawColor, setDrawColor] = useState('#ff4444');
    const [drawSizeKey, setDrawSizeKey] = useState<'S' | 'M' | 'L'>('M');
    const [textFontStyle, setTextFontStyle] = useState<'normal' | 'bold' | 'italic' | 'bold italic'>('bold');
    const [textFontFamily, setTextFontFamily] = useState('Inter, sans-serif');
    const [textFontSize, setTextFontSize] = useState(20);
    const [textInput, setTextInput] = useState<{ vx: number; vy: number; cx: number; cy: number } | null>(null);
    const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null);
    const [toolbarExpanded, setToolbarExpanded] = useState(false);
    const [ephemeralMode, setEphemeralMode] = useState(false);
    const [typingMode, setTypingMode] = useState(false);
    const [blackboardMode, setBlackboardMode] = useState(false);
    const [lessonKey, setLessonKey] = useState(0);
    const [canvasH, setCanvasH] = useState(600);
    const [toolbarScale, setToolbarScale] = useState(1);
    // Horizontal padding applied to student view so content is centered and
    // matches the teacher's content area width (teacher has toolbar on the right).
    const [contentPaddingX, setContentPaddingX] = useState(0);
    // Teacher cursor rendered on the student's canvas
    const [teacherCursor, setTeacherCursor] = useState<{ x: number; y: number } | null>(null);
    // Text-anchor indicator: shows students where the teacher is about to type
    const [textAnchorPos, setTextAnchorPos] = useState<{ cx: number; cy: number; color: string; fontSizePx: number } | null>(null);

    // ── Refs ─────────────────────────────────────────────────────────────────
    const contentRef      = useRef<HTMLDivElement>(null);    // scrollable area
    const scaleRef        = useRef<HTMLDivElement>(null);    // zoom wrapper — scales content to fit panel
    const innerContentRef = useRef<HTMLDivElement>(null);    // fixed-640px inner div
    const canvasRef       = useRef<HTMLCanvasElement>(null); // annotation layer — INSIDE scrollable div
    const previewRef      = useRef<HTMLCanvasElement>(null); // shape preview
    const wrapperRef      = useRef<HTMLDivElement>(null);    // outer non-scrolling wrapper

    const [contentScale, setContentScale] = useState(1);

    // Canvas pixel width is always exactly this — must match the inner content
    // div width so normalized draw coords map to identical positions on every device.
    const CANVAS_W = 640;
    const scrollThrottle = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastRatio   = useRef(0);
    const committingRef = useRef(false); // prevents onBlur double-commit after Enter
    const isDrawing   = useRef(false);
    const lastPt      = useRef<{ x: number; y: number } | null>(null);
    const shapeStart  = useRef<{ x: number; y: number } | null>(null);
    const toolbarRef  = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const isDraggingBar = useRef(false);
    const barDragOffset = useRef({ x: 0, y: 0 });
    const cursorThrottle = useRef<ReturnType<typeof setTimeout> | null>(null);
    const ephemeralStrokes = useRef<Array<{ seg: DrawSeg; releasedAt: number }>>([]);
    const currentEphemeralStroke = useRef<DrawSeg[]>([]); // buffer for in-progress ephemeral stroke
    const ephemeralRaf     = useRef<number | null>(null);
    const persistentSnapshot = useRef<ImageData | null>(null);
    // All permanent (non-ephemeral) segments — replayed on canvas resize so drawings persist
    const committedSegs  = useRef<DrawSeg[]>([]);
    // Strokes drawn while blackboard mode is active — kept separate from lesson segs
    const blackboardSegs = useRef<DrawSeg[]>([]);
    // Debounce: block canvas click for 150 ms after text commit so overlay close doesn't re-open text
    const lastCommitRef  = useRef(0);
    // Last received snapshot (student late-join) — drawn before segs on replay
    const snapshotImgRef = useRef<HTMLImageElement | null>(null);

    // Always-fresh refs so document-level handlers never have stale closures
    const isTeacher  = role === 'teacher';
    const drawActive = isTeacher && drawTool !== null;
    const cursor     = drawTool ? (TOOL_DEFS.find(t => t.id === drawTool)?.cursor ?? 'crosshair') : 'default';
    const showBlackboard = blackboardMode || (!!blackboardActive && !isTeacher);

    const drawState   = useRef({ drawTool, drawColor, drawSizeKey, ephemeralMode, textFontStyle, textFontFamily, textFontSize });
    drawState.current = { drawTool, drawColor, drawSizeKey, ephemeralMode, textFontStyle, textFontFamily, textFontSize };
    // Always-fresh ref so drawing handlers can check blackboard mode without stale closure
    const showBlackboardRef = useRef(showBlackboard);
    showBlackboardRef.current = showBlackboard;
    // Always-fresh contentScale ref so scroll handler never has stale closure
    const contentScaleRef = useRef(contentScale);
    contentScaleRef.current = contentScale;
    const onDrawSegCb    = useRef(onDrawSegment);
    onDrawSegCb.current  = onDrawSegment;
    const onDrawPrevCb   = useRef(onDrawPreview);
    onDrawPrevCb.current = onDrawPreview;
    const onDrawCursorCb  = useRef(onDrawCursor);
    onDrawCursorCb.current = onDrawCursor;

    const handleBlackboardToggle = useCallback(() => {
        setBlackboardMode(prev => {
            const next = !prev;
            onBlackboardToggle?.(next);
            return next;
        });
    }, [onBlackboardToggle]);

    // ── Data loading ──────────────────────────────────────────────────────────
    useEffect(() => {
        if (!courseIds.length) { setLoading(false); return; }
        setLoading(true);
        Promise.all(
            courseIds.map(id =>
                Promise.all([
                    fetch(`${serverUrl}/api/courses/${id}`).then(r => r.ok ? r.json() : { id, title: '' }),
                    fetch(`${serverUrl}/api/courses/${id}/topics`).then(r => r.ok ? r.json() : []),
                ]).then(([course, topics]) => {
                    const sortedTopics = (Array.isArray(topics) ? topics : []) as Topic[];
                    sortedTopics.sort((a, b) => a.order_index - b.order_index);
                    sortedTopics.forEach(t => t.lessons?.sort((a, b) => a.order_index - b.order_index));
                    const flatLessons = sortedTopics.flatMap(t => t.lessons || []);
                    return {
                        id,
                        title: (course as { title?: string }).title || '',
                        topics: sortedTopics,
                        lessons: flatLessons,
                    };
                })
            )
        ).then(setCourses).finally(() => setLoading(false));
    }, [courseIds, serverUrl]);

    useEffect(() => {
        if (courses.length > 0)
            onCoursesLoaded?.(courses[activeCourseIdx]?.lessons.length ?? 0);
    }, [courses, activeCourseIdx, onCoursesLoaded]);

    // ── Scroll: teacher → emit canvas-pixel offset ───────────────────────────
    // Send scrollTop / contentScale = scroll in canvas (zoom-independent) pixels.
    // Student multiplies by their own contentScale to get their scrollTop.
    const handleScroll = useCallback(() => {
        if (!isTeacher || !onScrollSync) return;
        const el = contentRef.current;
        if (!el) return;
        const canvasPx = el.scrollTop / contentScaleRef.current;
        if (Math.abs(canvasPx - lastRatio.current) < 2) return;
        lastRatio.current = canvasPx;
        if (scrollThrottle.current) return;
        scrollThrottle.current = setTimeout(() => {
            scrollThrottle.current = null;
            onScrollSync(lastRatio.current);
        }, 50);
    }, [isTeacher, onScrollSync]);

    // ── Scroll: student ← locked to teacher ──────────────────────────────────
    // externalScroll is a canvas-pixel offset; convert to screen pixels via scale.
    useEffect(() => {
        if (isTeacher || externalScroll == null) return;
        const el = contentRef.current;
        if (!el) return;
        el.scrollTop = externalScroll * contentScale;
    }, [externalScroll, isTeacher, contentScale]);

    // ── Clear canvas on lesson/course change ──────────────────────────────────
    useEffect(() => {
        if (contentRef.current) contentRef.current.scrollTop = 0;
        lastRatio.current = 0;
        committedSegs.current = [];
        blackboardSegs.current = [];
        snapshotImgRef.current = null;
        const c = canvasRef.current;
        if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
        const p = previewRef.current;
        if (p) p.getContext('2d')?.clearRect(0, 0, p.width, p.height);
        setTeacherCursor(null);
        setLessonKey(k => k + 1);
    }, [activeLessonIdx, activeCourseIdx]);

    // ── Canvas replay helper ───────────────────────────────────────────────────
    // Redraws all committed segments (+ any snapshot base) onto the canvas.
    // Called whenever the canvas buffer is re-created due to resize.
    // Uses showBlackboardRef so it always replays the correct set of segments
    // regardless of which mode was active when the resize fired.
    const replayOnCanvas = useCallback(() => {
        const c = canvasRef.current;
        if (!c) return;
        const ctx = c.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, c.width, c.height);
        if (snapshotImgRef.current) ctx.drawImage(snapshotImgRef.current, 0, 0, c.width, c.height);
        const segs = showBlackboardRef.current ? blackboardSegs.current : committedSegs.current;
        for (const seg of segs) drawOnCanvas(ctx, seg, c.width, c.height);
    }, []);
    const replayRef = useRef(replayOnCanvas);
    replayRef.current = replayOnCanvas;

    // ── Canvas sizing ─────────────────────────────────────────────────────────
    // Canvas is always CANVAS_W (640) pixels wide — identical to the fixed inner
    // content div. This means normalized X coords (px / 640) land on the same
    // word regardless of panel width (big desktop teacher vs narrow mobile student).
    // Height comes from the inner div's scrollHeight, which is also identical on
    // both sides because the text wraps the same at 640 px.
    // We observe the inner div (not the outer scrollable) to catch content changes.
    useEffect(() => {
        const content = contentRef.current;
        const inner   = innerContentRef.current;
        const canvas  = canvasRef.current;
        const preview = previewRef.current;
        if (!content || !inner || !canvas || !preview) return;

        const sync = () => {
            // Compute scale so content fills the available panel width.
            // For teachers, subtract the toolbar width so content doesn't hide behind it.
            // For students, use the same effective toolbar width (natural toolbar offsetWidth
            // ≈ 78px based on 2×30px cols + 4px gap + 12px padding + 2px border, plus the
            // 10px margin used in the teacher formula) so both sides have identical scale.
            // The extra space is split equally left/right to center the student's content.
            const TOOLBAR_OCCUPIED_W = (toolbarRef.current?.offsetWidth ?? 78) + 10;
            const totalW    = wrapperRef.current?.clientWidth ?? CANVAS_W;
            const tbW       = TOOLBAR_OCCUPIED_W;
            const availW    = Math.max(totalW - tbW, 1);
            const scale     = availW / CANVAS_W;
            setContentScale(scale);
            setContentPaddingX(isTeacher ? 0 : tbW / 2);

            // Collapse canvas height so it doesn't inflate inner.scrollHeight
            canvas.style.height  = '0px';
            preview.style.height = '0px';

            // Width is always exactly CANVAS_W — never depends on panel/viewport size
            const w = CANVAS_W;
            // Height: divide inner.getBoundingClientRect().height by the CURRENTLY-APPLIED
            // zoom (contentScaleRef.current), not the newly-computed scale.
            // Reason: getBoundingClientRect is measured in the viewport coordinate space,
            // which reflects the CSS zoom that React has already committed (old scale).
            // Dividing by that same old scale gives the true natural (unzoomed) height.
            // Using the new scale here creates a two-sync cascade:
            //   sync1 measures with old zoom / new scale → wrong naturalH → canvas reset
            //   React re-renders, zoom updates → ResizeObserver fires → sync2
            //   sync2 measures with new zoom / new scale → correct → canvas reset AGAIN
            // Two resets = two buffer clears, creating a visible flash and races with
            // the ephemeral RAF loop. Dividing by the currently-applied scale eliminates
            // the wrong measurement in sync1 so the canvas only ever resizes correctly.
            const appliedScale = contentScaleRef.current > 0 ? contentScaleRef.current : scale;
            const naturalH = Math.round(inner.getBoundingClientRect().height / appliedScale);
            const h = Math.max(naturalH, Math.round(content.clientHeight / scale), 1);
            setCanvasH(h);

            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w; canvas.height = h;
                preview.width = w; preview.height = h;
                // Replay committed/blackboard strokes onto the freshly-sized canvas buffer.
                replayRef.current();
                // Invalidate the ephemeral-mode snapshot: it was captured at the old
                // canvas size and would paint corrupted/wrong-sized pixels if reused.
                // Re-capture immediately so the ephemeral RAF loop has a consistent base.
                persistentSnapshot.current = null;
                if (drawState.current.ephemeralMode) {
                    const eCtx = canvas.getContext('2d');
                    if (eCtx) persistentSnapshot.current = eCtx.getImageData(0, 0, canvas.width, canvas.height);
                }
            }
            canvas.style.width   = canvas.width  + 'px';
            canvas.style.height  = canvas.height + 'px';
            preview.style.width  = preview.width  + 'px';
            preview.style.height = preview.height + 'px';

            // Scale toolbar to fit vertically without scrolling.
            // scrollHeight is unaffected by CSS transform:scale so this is stable.
            const wrapH = wrapperRef.current?.clientHeight ?? 600;
            const tbNatH = toolbarRef.current?.scrollHeight ?? 0;
            if (tbNatH > 0) setToolbarScale(Math.min(1, (wrapH - 16) / tbNatH));
        };

        sync();
        // Observe inner div (content changes), wrapper div (panel resize), and toolbar (content changes)
        const ro = new ResizeObserver(sync);
        ro.observe(inner);
        if (wrapperRef.current) ro.observe(wrapperRef.current);
        if (toolbarRef.current) ro.observe(toolbarRef.current);
        return () => ro.disconnect();
    }, [CANVAS_W, isTeacher]);

    // ── Drawing: document-level events ────────────────────────────────────────
    // mousemove/mouseup are on document so strokes never stop when cursor leaves
    // canvas. drawState ref ensures no stale closures.
    // Wheel events are forwarded to the scrollable div so the user can still
    // scroll even when a draw tool is active.
    // LIVE STREAMING: every shape drag step emits a preview segment to students
    // via onDrawPreview, and the cursor position is emitted on every mousemove.
    useEffect(() => {
        if (!isTeacher) return;
        const canvas  = canvasRef.current;
        const content = contentRef.current;
        if (!canvas || !content) return;

        // Normalize mouse position to canvas coordinates (0–1).
        // Use r.width / r.height (CSS visual size) so zoom scaling is accounted for.
        const pt = (e: MouseEvent) => {
            const r = canvas.getBoundingClientRect();
            return {
                x: (e.clientX - r.left) / r.width,
                y: (e.clientY - r.top)  / r.height,
            };
        };
        const isShape = (t: string) => SHAPE_TOOLS.includes(t);

        const onDown = (e: MouseEvent) => {
            const { drawTool } = drawState.current;
            if (!drawTool || drawTool === 'text') return;
            // Use bounding-rect check instead of e.target comparison — the target
            // may be a sibling element that sits above the canvas in z-order (e.g.
            // nav buttons, overlays) even though the click is inside the canvas area.
            const r = canvas.getBoundingClientRect();
            const inCanvas = e.clientX >= r.left && e.clientX <= r.right
                           && e.clientY >= r.top  && e.clientY <= r.bottom;
            if (!inCanvas) return;
            e.preventDefault();
            isDrawing.current = true;
            const p = pt(e);
            lastPt.current = p;
            if (isShape(drawTool)) shapeStart.current = p;
        };

        const onMove = (e: MouseEvent) => {
            // Emit cursor position — only within canvas bounds, clamped when drawing (throttled ~30 fps)
            const r = canvas.getBoundingClientRect();
            const inCanvas = e.clientX >= r.left && e.clientX <= r.right
                           && e.clientY >= r.top  && e.clientY <= r.bottom;
            if (inCanvas || isDrawing.current) {
                const cx = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
                const cy = Math.max(0, Math.min(1, (e.clientY - r.top)  / r.height));
                if (!cursorThrottle.current) {
                    cursorThrottle.current = setTimeout(() => {
                        cursorThrottle.current = null;
                        onDrawCursorCb.current?.(cx, cy);
                    }, 33);
                }
            } else if (!isDrawing.current) {
                if (!cursorThrottle.current) {
                    cursorThrottle.current = setTimeout(() => {
                        cursorThrottle.current = null;
                        onDrawCursorCb.current?.(-1, -1);
                    }, 33);
                }
            }

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
                    // Stream the shape preview to students in real time
                    onDrawPrevCb.current?.({ x1: s.x, y1: s.y, x2: p.x, y2: p.y, color: drawColor, size: TOOL_SIZES[drawSizeKey], mode: drawTool as DrawSeg['mode'] });
                }
            } else {
                const prev = lastPt.current;
                if (prev) {
                    const seg: DrawSeg = { x1: prev.x, y1: prev.y, x2: p.x, y2: p.y, color: drawColor, size: TOOL_SIZES[drawSizeKey], mode: drawTool };
                    if (drawState.current.ephemeralMode) {
                        currentEphemeralStroke.current.push(seg);
                    } else {
                        (showBlackboardRef.current ? blackboardSegs.current : committedSegs.current).push(seg);
                        const ctx = canvas.getContext('2d');
                        if (ctx) drawOnCanvas(ctx, seg, canvas.width, canvas.height);
                        onDrawSegCb.current?.(seg);
                    }
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
                if (drawState.current.ephemeralMode) {
                    currentEphemeralStroke.current.push(seg);
                    // Flush the whole stroke to ephemeralStrokes on release, timestamped NOW
                    const releasedAt = Date.now();
                    for (const s of currentEphemeralStroke.current) {
                        ephemeralStrokes.current.push({ seg: s, releasedAt });
                    }
                    currentEphemeralStroke.current = [];
                } else {
                    (showBlackboardRef.current ? blackboardSegs.current : committedSegs.current).push(seg);
                    const ctx = canvas.getContext('2d');
                    if (ctx) drawOnCanvas(ctx, seg, canvas.width, canvas.height);
                    onDrawSegCb.current?.(seg);
                    // Clear students' preview canvas now that the final segment is committed
                    onDrawPrevCb.current?.({ x1: 0, y1: 0, x2: 0, y2: 0, color: 'transparent', size: 0, mode: 'pen', text: '__clear_preview__' });
                }
                shapeStart.current = null;
            }
            lastPt.current = null;
            // Flush any buffered pen ephemeral stroke (non-shape) on release
            if (drawState.current.ephemeralMode && currentEphemeralStroke.current.length > 0) {
                const releasedAt = Date.now();
                for (const s of currentEphemeralStroke.current) {
                    ephemeralStrokes.current.push({ seg: s, releasedAt });
                }
                currentEphemeralStroke.current = [];
            }
        };

        // Forward wheel events → content div so scrolling works with a tool active
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            content.scrollBy({ top: e.deltaY, left: e.deltaX, behavior: 'auto' });
        };

        // Clear cursor when mouse leaves content wrapper
        const onWrapperLeave = () => { onDrawCursorCb.current?.(-1, -1); };
        const wr = wrapperRef.current;
        if (wr) wr.addEventListener('mouseleave', onWrapperLeave);

        canvas.addEventListener('mousedown', onDown);
        canvas.addEventListener('wheel', onWheel, { passive: false });
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return () => {
            canvas.removeEventListener('mousedown', onDown);
            canvas.removeEventListener('wheel', onWheel);
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            if (wr) wr.removeEventListener('mouseleave', onWrapperLeave);
        };
    }, [isTeacher]);

    // ── Receive segments from teacher (student) ───────────────────────────────
    useEffect(() => {
        if (!externalDrawSeg) return;
        // Store incoming segment in the correct surface (blackboard or lesson)
        (showBlackboardRef.current ? blackboardSegs.current : committedSegs.current).push(externalDrawSeg);
        const c = canvasRef.current;
        if (c) { const ctx = c.getContext('2d'); if (ctx) drawOnCanvas(ctx, externalDrawSeg, c.width, c.height); }
    }, [externalDrawSeg]);

    // ── Receive live preview from teacher (student) ───────────────────────────
    useEffect(() => {
        if (!externalDrawPreview) return;
        const p = previewRef.current;
        if (!p) return;
        const ctx = p.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, p.width, p.height);
        // Special sentinel: teacher committed shape, clear preview
        if ((externalDrawPreview as DrawSeg & { text?: string }).text === '__clear_preview__') {
            setTextAnchorPos(null);
            return;
        }
        // Special sentinel: teacher opened text input — show blinking cursor to student
        if ((externalDrawPreview as DrawSeg & { text?: string }).text === '__text_anchor__') {
            setTextAnchorPos({ cx: externalDrawPreview.x1, cy: externalDrawPreview.y1, color: externalDrawPreview.color, fontSizePx: externalDrawPreview.fontSizePx ?? 20 });
            return;
        }
        drawOnCanvas(ctx, externalDrawPreview, p.width, p.height);
        // If this is a live text preview, move the blinking caret to end-of-text
        // so the student's indicator matches where the teacher's cursor actually is.
        if (externalDrawPreview.mode === 'text') {
            const rawText = (externalDrawPreview as DrawSeg & { text?: string }).text ?? '';
            const displayText = rawText && rawText !== ' ' ? rawText : '';
            const fStyle  = externalDrawPreview.fontStyle  || 'bold';
            const fFamily = externalDrawPreview.fontFamily || 'sans-serif';
            const fSize   = externalDrawPreview.fontSizePx ?? 20;
            ctx.save();
            ctx.font = `${fStyle} ${fSize}px ${fFamily}`;
            const lines   = displayText.split('\n');
            const lastLine = lines[lines.length - 1];
            const textW   = displayText ? ctx.measureText(lastLine).width : 0;
            ctx.restore();
            const newCx = externalDrawPreview.x1 + textW / p.width;
            const newCy = externalDrawPreview.y1 + (lines.length - 1) * (fSize * 1.4) / p.height;
            setTextAnchorPos({ cx: newCx, cy: newCy, color: externalDrawPreview.color, fontSizePx: fSize });
        }
    }, [externalDrawPreview]);

    // ── Receive teacher cursor position (student) ─────────────────────────────
    useEffect(() => {
        if (!externalCursor) { setTeacherCursor(null); return; }
        setTeacherCursor(externalCursor);
    }, [externalCursor]);

    // ── Clear signal ──────────────────────────────────────────────────────────
    // Only clears the currently active surface (blackboard OR lesson) so the two
    // pages remain completely independent.
    useEffect(() => {
        if (drawClearSignal == null) return;
        if (showBlackboardRef.current) {
            blackboardSegs.current = [];
        } else {
            committedSegs.current = [];
            snapshotImgRef.current = null;
        }
        const c = canvasRef.current;
        if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
        ephemeralStrokes.current = [];
        currentEphemeralStroke.current = [];
        persistentSnapshot.current = null;
    }, [drawClearSignal]);

    // ── Blackboard mode: swap between lesson canvas and blackboard canvas ─────
    useEffect(() => {
        const c = canvasRef.current;
        const p = previewRef.current;
        if (!c) return;
        const ctx = c.getContext('2d');
        if (!ctx) return;
        // Always clear preview when switching modes
        if (p) p.getContext('2d')?.clearRect(0, 0, p.width, p.height);
        ctx.clearRect(0, 0, c.width, c.height);
        // Replay whichever set of strokes belongs to this mode
        const segs = showBlackboard ? blackboardSegs.current : committedSegs.current;
        for (const seg of segs) drawOnCanvas(ctx, seg, c.width, c.height);
    }, [showBlackboard]);

    // ── Ephemeral mode: fading strokes RAF loop ───────────────────────────────
    useEffect(() => {
        if (!ephemeralMode) {
            if (ephemeralRaf.current) { cancelAnimationFrame(ephemeralRaf.current); ephemeralRaf.current = null; }
            ephemeralStrokes.current = [];
            persistentSnapshot.current = null;
            return;
        }
        // Snapshot the current canvas so we can restore it each frame
        const initCanvas = canvasRef.current;
        if (initCanvas) {
            const ctx = initCanvas.getContext('2d');
            if (ctx) persistentSnapshot.current = ctx.getImageData(0, 0, initCanvas.width, initCanvas.height);
        }
        const FADE_MS = 1000;
        const loop = () => {
            const now = Date.now();
            ephemeralStrokes.current = ephemeralStrokes.current.filter(s => now - s.releasedAt < FADE_MS + 100);
            const cnv = canvasRef.current;
            if (cnv) {
                const ctx = cnv.getContext('2d');
                if (ctx) {
                    ctx.clearRect(0, 0, cnv.width, cnv.height);
                    if (persistentSnapshot.current) ctx.putImageData(persistentSnapshot.current, 0, 0);
                    // Draw in-progress stroke at full opacity (not yet released)
                    for (const seg of currentEphemeralStroke.current) {
                        drawOnCanvas(ctx, seg, cnv.width, cnv.height);
                    }
                    // Draw released strokes fading out
                    for (const { seg, releasedAt } of ephemeralStrokes.current) {
                        const age = now - releasedAt;
                        const alpha = Math.max(0, 1 - age / FADE_MS);
                        ctx.save();
                        ctx.globalAlpha = alpha;
                        drawOnCanvas(ctx, seg, cnv.width, cnv.height);
                        ctx.restore();
                    }
                }
            }
            ephemeralRaf.current = requestAnimationFrame(loop);
        };
        ephemeralRaf.current = requestAnimationFrame(loop);
        return () => { if (ephemeralRaf.current) { cancelAnimationFrame(ephemeralRaf.current); ephemeralRaf.current = null; } };
    }, [ephemeralMode]);

    // ── Snapshot: teacher → late joiner ──────────────────────────────────────
    useEffect(() => {
        if (!snapshotRequest || !onSnapshot) return;
        const c = canvasRef.current;
        if (c) onSnapshot(c.toDataURL());
    }, [snapshotRequest, onSnapshot]);

    // ── Snapshot: student ← teacher ──────────────────────────────────────────
    useEffect(() => {
        if (!snapshotDataUrl) return;
        const c = canvasRef.current;
        if (!c) return;
        const ctx = c.getContext('2d');
        if (!ctx) return;
        const img = new Image();
        img.onload = () => {
            snapshotImgRef.current = img;
            committedSegs.current = []; // snapshot subsumes all prior segs
            ctx.clearRect(0, 0, c.width, c.height);
            ctx.drawImage(img, 0, 0, c.width, c.height);
        };
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
        // Debounce: skip if a commit happened very recently (overlay close fires an immediate canvas click)
        if (Date.now() - lastCommitRef.current < 150) return;
        const c = canvasRef.current;
        if (!c) return;
        const r = c.getBoundingClientRect();
        const cx = (e.clientX - r.left) / r.width;
        const cy = (e.clientY - r.top) / r.height;
        setTextInput({ vx: e.clientX, vy: e.clientY, cx, cy });
        // Tell students where the teacher is about to type (blinking caret indicator)
        const { drawColor: dc, textFontSize: tfsz } = drawState.current;
        onDrawPrevCb.current?.({ x1: cx, y1: cy, x2: cx, y2: cy, color: dc, size: 0, mode: 'text', text: '__text_anchor__', fontSizePx: tfsz });
    }, [drawTool]);

    const commitText = useCallback((text: string, cx: number, cy: number) => {
        lastCommitRef.current = Date.now(); // debounce: prevent canvas click from immediately re-opening
        setTextInput(null);
        // Clear teacher's own preview canvas
        const p = previewRef.current;
        if (p) p.getContext('2d')?.clearRect(0, 0, p.width, p.height);
        // Always clear preview canvas on students when text input closes
        onDrawPrevCb.current?.({ x1: 0, y1: 0, x2: 0, y2: 0, color: 'transparent', size: 0, mode: 'pen', text: '__clear_preview__' });
        if (!text.trim()) return;
        const { drawColor, drawSizeKey, textFontStyle, textFontFamily, textFontSize } = drawState.current;
        const seg: DrawSeg = { x1: cx, y1: cy, x2: cx, y2: cy, color: drawColor, size: TOOL_SIZES[drawSizeKey], mode: 'text', text, fontStyle: textFontStyle, fontFamily: textFontFamily, fontSizePx: textFontSize };
        (showBlackboardRef.current ? blackboardSegs.current : committedSegs.current).push(seg);
        const c = canvasRef.current;
        if (c) { const ctx = c.getContext('2d'); if (ctx) drawOnCanvas(ctx, seg, c.width, c.height); }
        onDrawSegCb.current?.(seg);
    }, []);

    const handleClear = useCallback(() => {
        // Only clear the active surface; the other surface's drawings are preserved.
        if (showBlackboardRef.current) {
            blackboardSegs.current = [];
        } else {
            committedSegs.current = [];
            snapshotImgRef.current = null;
        }
        const c = canvasRef.current;
        if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
        const p = previewRef.current;
        if (p) p.getContext('2d')?.clearRect(0, 0, p.width, p.height);
        ephemeralStrokes.current = [];
        currentEphemeralStroke.current = [];
        persistentSnapshot.current = null;
        onDrawClear?.();
    }, [onDrawClear]);

    // ── Derived values ────────────────────────────────────────────────────────
    const course       = courses[activeCourseIdx] ?? courses[0];
    const lesson       = course?.lessons[activeLessonIdx] || null;
    const totalLessons = course?.lessons.length ?? 0;
    const canPrev      = activeLessonIdx > 0;
    const canNext      = activeLessonIdx < totalLessons - 1;
    // Find active topic for current lesson
    const activeTopic  = lesson ? (course?.topics ?? []).find(t => t.lessons?.some(l => l.id === lesson.id)) ?? null : null;

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--surface-2)', borderRadius: 12, overflow: 'hidden' }}>

            {/* ── Header ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap' }}>
                <button onClick={onSidebarToggle} title={sidebarOpen ? 'Hide lessons' : 'Show lessons'}
                    style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0, border: '1px solid var(--border)', background: sidebarOpen ? 'rgba(99,102,241,0.2)' : 'var(--surface-3)', color: sidebarOpen ? '#a5b4fc' : 'var(--text-muted)', cursor: 'pointer', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {sidebarOpen ? '‹' : '☰'}
                </button>
                {courses.length > 1 && courses.map((c, i) => (
                    <button key={c.id} onClick={() => isTeacher ? onNav(i, 0) : undefined} disabled={!isTeacher}
                        style={{ padding: '4px 12px', borderRadius: 8, border: 'none', fontSize: 13, background: activeCourseIdx === i ? 'rgba(99,102,241,0.3)' : 'var(--surface-3)', color: activeCourseIdx === i ? '#a5b4fc' : 'var(--text-muted)', fontWeight: activeCourseIdx === i ? 700 : 400, cursor: isTeacher ? 'pointer' : 'default' }}>
                        <RichContent html={c.title} style={{ display: 'inline' }} />
                    </button>
                ))}
                {totalLessons > 0 && (
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', paddingRight: 4, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                        {activeTopic && <span style={{ fontSize: 10, color: 'rgba(99,102,241,0.8)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{activeTopic.title}</span>}
                        <span>Lesson {activeLessonIdx + 1} / {totalLessons}</span>
                    </span>
                )}
            </div>

            {/* ── Body ── */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                {/* Sidebar — topics + lessons */}
                <div style={{ width: sidebarOpen ? 220 : 0, flexShrink: 0, borderRight: sidebarOpen ? '1px solid var(--border)' : 'none', overflowY: sidebarOpen ? 'auto' : 'hidden', overflowX: 'hidden', transition: 'width 0.2s ease' }}>
                    {(course?.topics ?? []).length > 0 ? (
                        (course!.topics).map((topic) => (
                            <div key={topic.id}>
                                {/* Topic header */}
                                <div style={{ padding: '8px 10px 4px', fontSize: 10, fontWeight: 800, color: 'rgba(99,102,241,0.9)', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid var(--border)', background: 'rgba(99,102,241,0.07)' }}>
                                    {topic.title}
                                </div>
                                {/* Topic lessons */}
                                {(topic.lessons ?? []).map((l) => {
                                    const flatIdx = course!.lessons.findIndex(x => x.id === l.id);
                                    const isActive = activeLessonIdx === flatIdx;
                                    return (
                                        <button key={l.id} onClick={() => isTeacher ? onNav(activeCourseIdx, flatIdx) : undefined} disabled={!isTeacher}
                                            style={{ display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%', padding: '9px 10px 9px 16px', border: 'none', textAlign: 'left', background: isActive ? 'rgba(99,102,241,0.18)' : 'transparent', borderLeft: isActive ? '3px solid #6366f1' : '3px solid transparent', borderBottom: '1px solid var(--border)', cursor: isTeacher ? 'pointer' : 'default', pointerEvents: isTeacher ? 'auto' : 'none' }}>
                                            <span style={{ fontSize: 11, color: isActive ? '#818cf8' : 'var(--text-muted)', fontWeight: 700, minWidth: 14, marginTop: 1 }}>{flatIdx + 1}.</span>
                                            <span style={{ fontSize: 12, color: isActive ? '#e2e8f0' : 'var(--text-muted)', lineHeight: 1.4, wordBreak: 'break-word' }}>{l.title}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        ))
                    ) : (
                        /* Fallback: flat lesson list if no topics */
                        (course?.lessons ?? []).map((l, i) => (
                            <button key={l.id} onClick={() => isTeacher ? onNav(activeCourseIdx, i) : undefined} disabled={!isTeacher}
                                style={{ display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%', padding: '10px 12px', border: 'none', textAlign: 'left', background: activeLessonIdx === i ? 'rgba(99,102,241,0.18)' : 'transparent', borderLeft: activeLessonIdx === i ? '3px solid #6366f1' : '3px solid transparent', borderBottom: '1px solid var(--border)', cursor: isTeacher ? 'pointer' : 'default', pointerEvents: isTeacher ? 'auto' : 'none' }}>
                                <span style={{ fontSize: 11, color: activeLessonIdx === i ? '#818cf8' : 'var(--text-muted)', fontWeight: 700, minWidth: 18, marginTop: 2 }}>{i + 1}.</span>
                                <span style={{ fontSize: 12, color: activeLessonIdx === i ? '#e2e8f0' : 'var(--text-muted)', lineHeight: 1.4, wordBreak: 'break-word' }}>{l.title}</span>
                            </button>
                        ))
                    )}
                </div>

                {/* Content wrapper */}
                <div ref={wrapperRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

                    {/* Scrollable area — overflowX hidden because content scales via zoom.
                        For students, horizontal padding is added so the 640px content is
                        centered: padding = toolbarWidth / 2 on each side, matching the
                        teacher whose toolbar occupies the same width on the right. */}
                    <div ref={contentRef} onScroll={isTeacher ? handleScroll : undefined}
                        style={{ width: '100%', height: '100%', overflowY: isTeacher ? 'auto' : 'hidden', overflowX: 'hidden', position: 'relative', userSelect: drawActive ? 'none' : 'text', paddingLeft: contentPaddingX, paddingRight: contentPaddingX, boxSizing: 'border-box' }}>

                        {/* Scale wrapper — shrinks all content + canvas proportionally
                            so the panel is fully visible on narrow screens without
                            horizontal scroll. zoom affects layout too, so scrollHeight
                            stays proportional and teacher/student scroll stays in sync. */}
                        <div ref={scaleRef} style={{ width: CANVAS_W, position: 'relative', zoom: contentScale }}>

                            {/* Lesson content — fixed at exactly CANVAS_W (640 px).
                                Teacher and student both render at 640px → same text wrap
                                → same scrollHeight → canvas coords map identically. */}
                            <div ref={innerContentRef} style={{ padding: showBlackboard ? 0 : '20px', boxSizing: 'border-box', width: CANVAS_W, minWidth: CANVAS_W }}>
                                {showBlackboard ? (
                                    <div style={{ width: CANVAS_W, height: canvasH, background: 'linear-gradient(135deg, #0d1117 0%, #0f1923 100%)', borderRadius: 0 }} />
                                ) : loading ? (
                                    <div style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>Loading course…</div>
                                ) : !course ? (
                                    <div style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>No courses loaded.</div>
                                ) : !lesson ? (
                                    <p style={{ color: 'var(--text-muted)' }}>Select a lesson from the list.</p>
                                ) : (
                                    <div key={lessonKey} className="lesson-slide-in">
                                        <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{lesson.title}</h3>
                                        {lesson.lesson_type === 'image' && lesson.image_url && (
                                            <img src={lesson.image_url} alt={lesson.title} style={{ width: '100%', borderRadius: 10, marginBottom: 16, display: 'block' }} />
                                        )}
                                        {lesson.lesson_type === 'video' && lesson.video_url
                                            ? <video src={lesson.video_url} controls style={{ width: '100%', borderRadius: 10, marginBottom: 16, background: '#000' }} />
                                            : null}
                                        {lesson.content
                                            ? <RichContent html={lesson.content} style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-muted)' }} />
                                            : <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No content for this lesson.</p>}
                                        {/* Bottom padding so teacher can annotate near the last line */}
                                        <div style={{ height: 80 }} />
                                    </div>
                                )}
                            </div>

                            {/* Annotation canvas — inside scale wrapper so it scales too */}
                            <canvas ref={canvasRef}
                                onClick={drawActive ? onCanvasClick : undefined}
                                style={{ position: 'absolute', top: 0, left: 0, pointerEvents: drawActive ? 'auto' : 'none', cursor: drawActive ? cursor : 'default', zIndex: 15 }} />
                            <canvas ref={previewRef}
                                style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 16 }} />

                            {/* Teacher cursor dot — visible to students in real time */}
                            {!isTeacher && teacherCursor && (
                                <div style={{
                                    position: 'absolute',
                                    left: Math.max(0, Math.min(CANVAS_W - 16, teacherCursor.x * CANVAS_W - 8)),
                                    top: Math.max(0, Math.min(canvasH - 16, teacherCursor.y * canvasH - 8)),
                                    width: 16, height: 16, borderRadius: '50%',
                                    background: 'rgba(99,102,241,0.9)',
                                    border: '2px solid #fff',
                                    boxShadow: '0 0 8px rgba(99,102,241,0.8)',
                                    pointerEvents: 'none',
                                    zIndex: 10,
                                    transition: 'left 0.05s linear, top 0.05s linear',
                                }} />
                            )}
                            {/* Text-anchor blink — shows students where teacher will type */}
                            {!isTeacher && textAnchorPos && (
                                <div style={{
                                    position: 'absolute',
                                    left: Math.max(0, textAnchorPos.cx * CANVAS_W - 1),
                                    top: Math.max(0, textAnchorPos.cy * canvasH),
                                    width: 3,
                                    height: Math.round(textAnchorPos.fontSizePx * 1.4),
                                    background: textAnchorPos.color,
                                    borderRadius: 2,
                                    pointerEvents: 'none',
                                    zIndex: 17,
                                    boxShadow: `0 0 8px ${textAnchorPos.color}`,
                                    animation: 'textCursorBlink 0.9s ease-in-out infinite',
                                }} />
                            )}
                        </div>
                    </div>

                    {/* Full-screen text input overlay — covers entire presenting area while teacher types.
                        Normal mode:  click elsewhere → commit + CLOSE (one spot per click, Enter commits).
                        Typing mode:  click elsewhere → commit + REPOSITION (overlay stays open, Enter = newline). */}
                    {textInput && isTeacher && (
                        <div
                            style={{
                                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                zIndex: 17, cursor: typingMode ? 'crosshair' : 'text',
                            }}
                            onMouseDown={e => {
                                // Skip if the click landed inside the toolbar
                                const tb = toolbarRef.current;
                                if (tb && tb.contains(e.target as Node)) return;
                                const c = canvasRef.current;
                                if (!c) return;
                                const r = c.getBoundingClientRect();
                                const newCx = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
                                const newCy = Math.max(0, Math.min(1, (e.clientY - r.top)  / r.height));

                                // Commit whatever has been typed at the current anchor
                                const ta = textareaRef.current;
                                const val = ta?.value ?? '';
                                if (val.trim()) {
                                    const { drawSizeKey: sk, drawColor: dc, textFontStyle: tfs, textFontFamily: tff, textFontSize: tfsz } = drawState.current;
                                    const seg: DrawSeg = { x1: textInput.cx, y1: textInput.cy, x2: textInput.cx, y2: textInput.cy, color: dc, size: TOOL_SIZES[sk], mode: 'text', text: val, fontStyle: tfs, fontFamily: tff, fontSizePx: tfsz };
                                    (showBlackboardRef.current ? blackboardSegs.current : committedSegs.current).push(seg);
                                    const cnv = canvasRef.current;
                                    if (cnv) { const ctx = cnv.getContext('2d'); if (ctx) drawOnCanvas(ctx, seg, cnv.width, cnv.height); }
                                    onDrawSegCb.current?.(seg);
                                }
                                // Clear preview canvas (teacher + students)
                                const prv = previewRef.current;
                                if (prv) prv.getContext('2d')?.clearRect(0, 0, prv.width, prv.height);
                                onDrawPrevCb.current?.({ x1: 0, y1: 0, x2: 0, y2: 0, color: 'transparent', size: 0, mode: 'pen', text: '__clear_preview__' });

                                if (typingMode) {
                                    // ── Typing mode: stay open, move anchor to new position ──
                                    e.preventDefault(); // keep textarea focused
                                    setTextInput({ vx: e.clientX, vy: e.clientY, cx: newCx, cy: newCy });
                                    if (ta) { ta.value = ''; ta.focus(); }
                                    // Update blinking caret position for students
                                    const { drawColor: dc, textFontSize: tfsz } = drawState.current;
                                    onDrawPrevCb.current?.({ x1: newCx, y1: newCy, x2: newCx, y2: newCy, color: dc, size: 0, mode: 'text', text: '__text_anchor__', fontSizePx: tfsz });
                                } else {
                                    // ── Normal mode: close overlay; teacher can click again to open elsewhere ──
                                    committingRef.current = true;
                                    lastCommitRef.current = Date.now(); // debounce canvas click after overlay closes
                                    setTextInput(null);
                                }
                            }}
                        >
                            <textarea autoFocus ref={textareaRef} placeholder=""
                                style={{
                                    // Absolutely position the textarea starting exactly at the click point.
                                    // Width is explicitly capped to (1 - cx) * CANVAS_W * scale - 24*scale
                                    // so the browser wraps at the same boundary as drawOnCanvas (maxW).
                                    position: 'absolute',
                                    top: `${textInput.cy * canvasH * contentScale}px`,
                                    left: `${textInput.cx * CANVAS_W * contentScale}px`,
                                    width: `${Math.max(20, (1 - textInput.cx) * CANVAS_W * contentScale - 24 * contentScale)}px`,
                                    height: `${Math.max(40, (1 - textInput.cy) * canvasH * contentScale)}px`,
                                    background: 'transparent',
                                    color: 'transparent',
                                    caretColor: drawColor,
                                    border: 'none', outline: 'none', resize: 'none',
                                    padding: 0, margin: 0, boxSizing: 'border-box', overflow: 'hidden',
                                    // Font exactly matches canvas rendering (canvas px × contentScale)
                                    fontSize: textFontSize * contentScale, fontFamily: textFontFamily,
                                    fontWeight: textFontStyle.includes('bold') ? 700 : 400,
                                    fontStyle: textFontStyle.includes('italic') ? 'italic' : 'normal',
                                    lineHeight: 1.4, cursor: 'inherit',
                                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                }}
                                onChange={e => {
                                    const { drawSizeKey: sk, drawColor: dc, textFontStyle: tfs, textFontFamily: tff, textFontSize: tfsz } = drawState.current;
                                    const seg = { x1: textInput.cx, y1: textInput.cy, x2: textInput.cx, y2: textInput.cy, color: dc, size: TOOL_SIZES[sk], mode: 'text' as const, text: e.target.value || ' ', fontStyle: tfs, fontFamily: tff, fontSizePx: tfsz };
                                    // Draw live preview on teacher's own canvas
                                    const p = previewRef.current;
                                    if (p) {
                                        const ctx = p.getContext('2d');
                                        if (ctx) { ctx.clearRect(0, 0, p.width, p.height); drawOnCanvas(ctx, seg, p.width, p.height); }
                                    }
                                    // Send to students
                                    onDrawPrevCb.current?.(seg);
                                }}
                                onKeyDown={e => {
                                    // Allow all navigation keys to work natively:
                                    // ArrowUp/Down/Left/Right, Home, End, PageUp/PageDown,
                                    // Backspace, Delete — no interception needed.
                                    // Tab: insert spaces instead of moving browser focus away.
                                    if (e.key === 'Tab') {
                                        e.preventDefault();
                                        const ta = e.currentTarget;
                                        const start = ta.selectionStart ?? ta.value.length;
                                        const end   = ta.selectionEnd   ?? ta.value.length;
                                        const spaces = '    '; // 4-space indent
                                        ta.value = ta.value.slice(0, start) + spaces + ta.value.slice(end);
                                        ta.selectionStart = ta.selectionEnd = start + spaces.length;
                                        // Manually update canvas preview (bypasses React synthetic onChange)
                                        const { drawSizeKey: sk, drawColor: dc, textFontStyle: tfs, textFontFamily: tff, textFontSize: tfsz } = drawState.current;
                                        const tabSeg = { x1: textInput.cx, y1: textInput.cy, x2: textInput.cx, y2: textInput.cy, color: dc, size: TOOL_SIZES[sk], mode: 'text' as const, text: ta.value || ' ', fontStyle: tfs, fontFamily: tff, fontSizePx: tfsz };
                                        const tp = previewRef.current;
                                        if (tp) { const tctx = tp.getContext('2d'); if (tctx) { tctx.clearRect(0, 0, tp.width, tp.height); drawOnCanvas(tctx, tabSeg, tp.width, tp.height); } }
                                        onDrawPrevCb.current?.(tabSeg);
                                        return;
                                    }
                                    if (e.key === 'Enter' && !typingMode) {
                                        e.preventDefault();
                                        committingRef.current = true;
                                        commitText(e.currentTarget.value, textInput.cx, textInput.cy);
                                    }
                                    if (e.key === 'Escape') {
                                        committingRef.current = true;
                                        const p = previewRef.current;
                                        if (p) p.getContext('2d')?.clearRect(0, 0, p.width, p.height);
                                        onDrawPrevCb.current?.({ x1: 0, y1: 0, x2: 0, y2: 0, color: 'transparent', size: 0, mode: 'pen', text: '__clear_preview__' });
                                        setTextInput(null);
                                    }
                                }}
                                onBlur={e => {
                                    if (committingRef.current) { committingRef.current = false; return; }
                                    commitText(e.currentTarget.value, textInput.cx, textInput.cy);
                                }}
                            />
                            {/* Mode badge — always visible while typing overlay is open */}
                            <div style={{
                                position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)',
                                pointerEvents: 'none', zIndex: 18,
                                background: typingMode ? 'rgba(99,102,241,0.85)' : 'rgba(30,30,50,0.8)',
                                border: `1px solid ${typingMode ? '#818cf8' : 'rgba(255,255,255,0.15)'}`,
                                color: typingMode ? '#e0e7ff' : '#94a3b8',
                                borderRadius: 8, padding: '4px 12px', fontSize: 11, fontWeight: 600,
                                backdropFilter: 'blur(6px)', whiteSpace: 'nowrap',
                            }}>
                                {typingMode ? '⌨ Typewriter — click to reposition' : '✎ Normal — Enter to commit'}
                            </div>
                        </div>
                    )}

                    {/* Prev / Next arrows */}
                    {isTeacher && (
                        <>
                            <button onClick={() => canPrev && onNav(activeCourseIdx, activeLessonIdx - 1)} disabled={!canPrev} title="Previous lesson"
                                style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 32, height: 48, borderRadius: '0 8px 8px 0', border: 'none', background: 'transparent', color: canPrev ? '#a5b4fc' : 'rgba(255,255,255,0.15)', fontSize: 22, cursor: canPrev ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 12, pointerEvents: drawActive ? 'none' : 'auto' }}
                                onMouseEnter={e => { if (canPrev) e.currentTarget.style.background = 'rgba(99,102,241,0.15)'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>‹</button>
                            <button onClick={() => canNext && onNav(activeCourseIdx, activeLessonIdx + 1)} disabled={!canNext} title="Next lesson"
                                style={{ position: 'absolute', right: 44, top: '50%', transform: 'translateY(-50%)', width: 32, height: 48, borderRadius: '8px 0 0 8px', border: 'none', background: 'transparent', color: canNext ? '#a5b4fc' : 'rgba(255,255,255,0.15)', fontSize: 22, cursor: canNext ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 12, pointerEvents: drawActive ? 'none' : 'auto' }}
                                onMouseEnter={e => { if (canNext) e.currentTarget.style.background = 'rgba(99,102,241,0.15)'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>›</button>
                        </>
                    )}

                    {/* Annotation toolbar — teacher only, always visible, 2-column grid */}
                    {isTeacher && (
                        <>
                        {/* Text options floating panel — visible when T active AND no text input open */}
                        <div style={{
                            position: 'absolute', right: 82, top: 8,
                            transform: `translateX(${drawTool === 'text' && textInput === null ? 0 : 14}px)`,
                            zIndex: 19,
                            pointerEvents: drawTool === 'text' && textInput === null ? 'auto' : 'none',
                            opacity: drawTool === 'text' && textInput === null ? 1 : 0,
                            transition: 'opacity 0.22s ease, transform 0.22s ease',
                            maxHeight: 'calc(100% - 16px)',
                            display: 'flex', flexDirection: 'column',
                        }}>
                            <div style={{
                                background: 'rgba(10,10,20,0.95)', backdropFilter: 'blur(12px)',
                                border: '1px solid rgba(99,102,241,0.35)', borderRadius: 14,
                                padding: '10px 10px', boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
                                display: 'flex', flexDirection: 'column', gap: 8, minWidth: 140,
                                overflowY: 'auto', flex: 1,
                            }}>
                                {/* Header + typewriter toggle */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(163,163,163,0.7)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Text Options</div>
                                    <button onClick={() => setTypingMode(v => !v)}
                                        title={typingMode ? 'Typewriter ON — Enter = new line, click outside to commit' : 'Normal — Enter commits text'}
                                        style={{ height: 22, padding: '0 7px', borderRadius: 5,
                                            border: `1px solid ${typingMode ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.1)'}`,
                                            background: typingMode ? 'rgba(99,102,241,0.35)' : 'transparent',
                                            color: typingMode ? '#a5b4fc' : 'var(--text-muted)',
                                            fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }}>⌨</button>
                                </div>

                                {/* Style row: N B I BI */}
                                <div>
                                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Style</div>
                                    <div style={{ display: 'flex', gap: 4 }}>
                                        {(['normal','bold','italic','bold italic'] as const).map(fs => (
                                            <button key={fs} onClick={() => setTextFontStyle(fs)} title={fs}
                                                style={{ flex: 1, height: 28, borderRadius: 6, border: `1px solid ${textFontStyle === fs ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.08)'}`,
                                                    background: textFontStyle === fs ? 'rgba(99,102,241,0.35)' : 'transparent',
                                                    color: textFontStyle === fs ? '#a5b4fc' : 'var(--text-muted)',
                                                    fontSize: 12, fontWeight: fs.includes('bold') ? 700 : 400,
                                                    fontStyle: fs.includes('italic') ? 'italic' : 'normal',
                                                    cursor: 'pointer', transition: 'all 0.15s' }}>
                                                {fs === 'normal' ? 'N' : fs === 'bold' ? 'B' : fs === 'italic' ? 'I' : 'BI'}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Font size */}
                                <div>
                                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Size</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3 }}>
                                        {[12, 16, 20, 24, 28, 32, 40, 48, 56, 64, 72].map(sz => (
                                            <button key={sz} onClick={() => setTextFontSize(sz)}
                                                style={{ height: 26, borderRadius: 5, border: `1px solid ${textFontSize === sz ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.07)'}`,
                                                    background: textFontSize === sz ? 'rgba(99,102,241,0.35)' : 'transparent',
                                                    color: textFontSize === sz ? '#a5b4fc' : 'var(--text-muted)',
                                                    fontSize: 10, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>
                                                {sz}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Font family */}
                                <div>
                                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Font</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                        {([
                                            { label: 'Sans',      value: 'Inter, sans-serif' },
                                            { label: 'Roboto',    value: 'Roboto, sans-serif' },
                                            { label: 'Poppins',   value: 'Poppins, sans-serif' },
                                            { label: 'Serif',     value: 'Georgia, serif' },
                                            { label: 'Playfair',  value: "'Playfair Display', serif" },
                                            { label: 'Mono',      value: "'Courier New', monospace" },
                                        ]).map(({ label, value }) => (
                                            <button key={value} onClick={() => setTextFontFamily(value)}
                                                style={{ height: 26, borderRadius: 5, border: `1px solid ${textFontFamily === value ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.07)'}`,
                                                    background: textFontFamily === value ? 'rgba(99,102,241,0.35)' : 'transparent',
                                                    color: textFontFamily === value ? '#a5b4fc' : 'var(--text-muted)',
                                                    fontFamily: value, fontSize: 11, cursor: 'pointer',
                                                    textAlign: 'left', paddingLeft: 8, transition: 'all 0.15s' }}>
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div ref={toolbarRef} style={{
                            position: 'absolute', right: 6, top: 8,
                            transform: `scale(${toolbarScale})`,
                            transformOrigin: 'top right',
                            zIndex: 20, background: 'rgba(10,10,20,0.92)', backdropFilter: 'blur(10px)',
                            border: '1px solid rgba(99,102,241,0.35)', borderRadius: 14,
                            padding: '8px 6px', boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
                            display: 'flex', flexDirection: 'column', gap: 6, cursor: 'default',
                        }}>
                        {/* ── Blackboard toggle — top of toolbar ── */}
                            <button onClick={handleBlackboardToggle}
                                title={blackboardMode ? 'Exit Blackboard mode' : 'Blackboard mode — blank dark surface'}
                                style={{ width: '100%', height: 28, borderRadius: 7, border: 'none',
                                    background: blackboardMode ? 'rgba(99,102,241,0.4)' : 'transparent',
                                    color: blackboardMode ? '#a5b4fc' : 'var(--text-muted)',
                                    fontSize: 10, fontWeight: 700, cursor: 'pointer',
                                    letterSpacing: '0.05em', textTransform: 'uppercase',
                                    boxShadow: blackboardMode ? '0 0 0 1.5px #6366f1' : 'none',
                                    transition: 'all 0.15s' }}
                                onMouseEnter={e => { if (!blackboardMode) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                                onMouseLeave={e => { if (!blackboardMode) e.currentTarget.style.background = 'transparent'; }}>
                                {blackboardMode ? '■ Board' : '□ Board'}
                            </button>
                            <div style={{ height: 1, background: 'rgba(255,255,255,0.12)', margin: '0 2px' }} />

                            {/* ── Tools: 2-column grid ── */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 30px)', gap: 4 }}>
                                {TOOL_DEFS.map(({ id, icon, tip }) => (
                                    <button key={id} onClick={() => setDrawTool(drawTool === id ? null : id)} title={tip}
                                        style={{ width: 30, height: 30, borderRadius: 7, border: 'none',
                                            background: drawTool === id ? 'rgba(99,102,241,0.6)' : 'transparent',
                                            color: drawTool === id ? '#a5b4fc' : 'var(--text-muted)',
                                            fontSize: id === 'text' ? 12 : 14, fontWeight: id === 'text' ? 700 : 400,
                                            cursor: 'pointer', display: 'flex', alignItems: 'center',
                                            justifyContent: 'center', transition: 'background 0.15s' }}
                                        onMouseEnter={e => { if (drawTool !== id) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                                        onMouseLeave={e => { if (drawTool !== id) e.currentTarget.style.background = 'transparent'; }}>{icon}</button>
                                ))}
                            </div>

                            <div style={{ height: 1, background: 'rgba(255,255,255,0.12)', margin: '0 2px' }} />

                            {/* ── Colors: 2-column grid ── */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 5, justifyItems: 'center' }}>
                                {DRAW_COLORS.map(c => (
                                    <button key={c} onClick={() => setDrawColor(c)} title={c}
                                        style={{ width: 18, height: 18, borderRadius: '50%',
                                            border: `2px solid ${drawColor === c ? '#fff' : 'transparent'}`,
                                            background: c, cursor: 'pointer', padding: 0, transition: 'border-color 0.15s',
                                            boxShadow: drawColor === c ? `0 0 0 1px ${c}` : 'none' }} />
                                ))}
                            </div>

                            <div style={{ height: 1, background: 'rgba(255,255,255,0.12)', margin: '0 2px' }} />

                            {/* ── Sizes: row of 3 ── */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
                                {(['S', 'M', 'L'] as const).map(s => (
                                    <button key={s} onClick={() => setDrawSizeKey(s)} title={s === 'S' ? 'Small' : s === 'M' ? 'Medium' : 'Large'}
                                        style={{ height: 22, borderRadius: 5, border: 'none',
                                            background: drawSizeKey === s ? 'rgba(99,102,241,0.5)' : 'transparent',
                                            color: drawSizeKey === s ? '#a5b4fc' : 'var(--text-muted)',
                                            fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>{s}</button>
                                ))}
                            </div>

                            <div style={{ height: 1, background: 'rgba(255,255,255,0.12)', margin: '0 2px' }} />

                            {/* ── Ephemeral + Clear: 2-column ── */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 30px)', gap: 4 }}>
                                <button onMouseDown={e => { e.preventDefault(); setEphemeralMode(v => !v); }}
                                    title={ephemeralMode ? 'Laser mode ON (strokes vanish)' : 'Laser mode OFF'}
                                    style={{ width: 30, height: 30, borderRadius: 7, border: 'none',
                                        background: ephemeralMode ? 'rgba(251,146,60,0.35)' : 'transparent',
                                        color: ephemeralMode ? '#fb923c' : 'var(--text-muted)',
                                        fontSize: 14, cursor: 'pointer', display: 'flex',
                                        alignItems: 'center', justifyContent: 'center',
                                        boxShadow: ephemeralMode ? '0 0 0 1.5px #fb923c' : 'none', transition: 'all 0.15s' }}
                                    onMouseEnter={e => { if (!ephemeralMode) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                                    onMouseLeave={e => { if (!ephemeralMode) e.currentTarget.style.background = 'transparent'; }}>💨</button>
                                <button onClick={handleClear} title="Clear all annotations"
                                    style={{ width: 30, height: 30, borderRadius: 7, border: 'none',
                                        background: 'transparent', color: '#f87171', fontSize: 14,
                                        cursor: 'pointer', display: 'flex', alignItems: 'center',
                                        justifyContent: 'center', transition: 'background 0.15s' }}
                                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.18)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>🗑</button>
                            </div>

                            {/* ── Share toggle ── */}
                            {onShareToggle && (
                                <>
                                    <div style={{ height: 1, background: 'rgba(255,255,255,0.12)', margin: '0 2px' }} />
                                    <button onClick={onShareToggle} title={sharedWithStudents ? 'Stop sharing with students' : 'Share with students'}
                                        style={{ width: '100%', height: 28, borderRadius: 7, border: 'none',
                                            background: sharedWithStudents ? 'rgba(34,197,94,0.3)' : 'transparent',
                                            color: sharedWithStudents ? '#4ade80' : 'var(--text-muted)',
                                            fontSize: 10, fontWeight: 700, cursor: 'pointer',
                                            boxShadow: sharedWithStudents ? '0 0 0 1.5px #22c55e' : 'none',
                                            transition: 'all 0.15s', letterSpacing: '0.05em', textTransform: 'uppercase' }}
                                        onMouseEnter={e => { if (!sharedWithStudents) e.currentTarget.style.background = 'rgba(34,197,94,0.12)'; }}
                                        onMouseLeave={e => { if (!sharedWithStudents) e.currentTarget.style.background = 'transparent'; }}>
                                        {sharedWithStudents ? '● Share' : '○ Share'}
                                    </button>
                                </>
                            )}
                        </div>
                        </>
                    )}
                </div>
            </div>

        </div>
    );
}