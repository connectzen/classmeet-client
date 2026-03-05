import { useCallback, useEffect, useRef, useState } from "react";
import RichEditor, { isRichEmpty } from "./RichEditor";

// ── Constants ─────────────────────────────────────────────────────────────────
const CANVAS_W = 640;
const PLAY_FONTS = [
    { label: 'Default', value: '' },
    { label: 'Inter',   value: 'Inter, sans-serif' },
    { label: 'Roboto',  value: 'Roboto, sans-serif' },
    { label: 'Poppins', value: 'Poppins, sans-serif' },
    { label: 'Lato',    value: 'Lato, sans-serif' },
    { label: 'Georgia', value: 'Georgia, serif' },
    { label: 'Playfair', value: "'Playfair Display', serif" },
    { label: 'Merriweather', value: 'Merriweather, serif' },
    { label: 'Mono',    value: "'Courier New', monospace" },
];
const PLAY_SIZES = ['11','12','14','16','18','20','24','28','32','36','42','48','60','72'];
const SPEED_OPTIONS: { label: string; ms: number }[] = [
    { label: "Slow",   ms: 80 },
    { label: "Normal", ms: 35 },
    { label: "Fast",   ms: 12 },
];

/** CSS animation shorthand strings keyed by AnimType (empty for typing, which is handled via charBufRef). */
const ANIM_INLINE: Record<string, string> = {
    typing:         '',
    fade:           'animation:pmFadeIn 0.45s ease both',
    'slide-right':  'animation:pmSlideRight 0.4s ease both',
    'slide-left':   'animation:pmSlideLeft 0.4s ease both',
    'slide-bottom': 'animation:pmSlideBottom 0.35s ease both',
    scale:          'animation:pmScale 0.4s ease both',
};
/** Duration (ms) that matches the longest keyframe above — wait before commit. */
const ANIM_DURATION_MS = 450;

type FontStyle = "normal" | "bold" | "italic" | "bold italic";
type PlayState = "idle" | "playing" | "paused" | "ready-next" | "stopped" | "done";
type AnimType  = "typing" | "fade" | "slide-right" | "slide-left" | "slide-bottom" | "scale";

// ── Styled word: one word with its resolved inline style ─────────────────────
interface StyledWord {
    word: string;
    textLine: number;
    color: string;
    fontFamily: string;
    fontSizePx: number;
    fontStyle: FontStyle;
    underline: boolean;
}

/** Parse Tiptap HTML into a flat list of words each carrying its inline style. */
function parseRichToStyledWords(html: string): StyledWord[] {
    const div = document.createElement('div');
    div.innerHTML = html;
    const words: StyledWord[] = [];
    let lineIdx = 0;
    const BLOCK = new Set(['p','div','h1','h2','h3','h4','h5','h6','blockquote','pre']);

    function walk(
        node: Node,
        inh: { color: string; fontFamily: string; fontSizePx: number; fontStyle: FontStyle; underline: boolean },
    ) {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent ?? '';
            const re = /\S+/g; let m: RegExpExecArray | null;
            while ((m = re.exec(text)) !== null)
                words.push({ word: m[0], textLine: lineIdx, ...inh });
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const el = node as HTMLElement;
        const tag = el.tagName.toLowerCase();

        // br = explicit line break
        if (tag === 'br') { if (words.length) lineIdx++; return; }

        const cur = { ...inh };
        const st  = el.style;
        if (st.color)      cur.color      = st.color;
        if (st.fontFamily) cur.fontFamily  = st.fontFamily.replace(/['"]/g, '').split(',')[0].trim();
        if (st.fontSize)   cur.fontSizePx  = parseInt(st.fontSize) || inh.fontSizePx;
        // bold via inline style
        const fw = st.fontWeight;
        if (fw === 'bold' || Number(fw) >= 700)
            cur.fontStyle = cur.fontStyle.includes('italic') ? 'bold italic' : 'bold';
        // italic via inline style
        if (st.fontStyle === 'italic')
            cur.fontStyle = cur.fontStyle.includes('bold') ? 'bold italic' : 'italic';
        // underline via inline style or <u> tag
        if (st.textDecoration?.includes('underline') || tag === 'u')
            cur.underline = true;
        // semantic tags
        if (tag === 'strong' || tag === 'b')
            cur.fontStyle = cur.fontStyle.includes('italic') ? 'bold italic' : 'bold';
        if (tag === 'em' || tag === 'i')
            cur.fontStyle = cur.fontStyle.includes('bold') ? 'bold italic' : 'italic';

        // <li>: start a new line, inject bullet, then flatten any inner <p> so it
        // doesn't trigger another lineIdx++ and separate the bullet from its text.
        if (tag === 'li') {
            if (words.length > 0) lineIdx++;
            words.push({ word: '•', textLine: lineIdx, ...cur });
            for (const child of Array.from(el.childNodes)) {
                const ctag = child.nodeType === Node.ELEMENT_NODE
                    ? (child as HTMLElement).tagName.toLowerCase() : '';
                if (ctag === 'p') {
                    // walk p's children directly — skip the p's own block newline
                    for (const gc of Array.from(child.childNodes)) walk(gc, cur);
                } else {
                    walk(child, cur);
                }
            }
            return;
        }

        const isBlock = BLOCK.has(tag);
        // opening of a block element (except very first) starts a new line
        if (isBlock && words.length > 0) lineIdx++;

        for (const child of Array.from(el.childNodes)) walk(child, cur);
    }

    const defaults = { color: '#ffffff', fontFamily: 'Inter', fontSizePx: 20, fontStyle: 'normal' as FontStyle, underline: false };

    for (const child of Array.from(div.childNodes)) walk(child, defaults);
    return words;
}

interface Props {
    anchor: { cx: number; cy: number } | null;
    canvasH: number;
    /** Called each time the teacher's play overlay HTML changes (teacher's own blackboard needs to mirror it). */
    onPlayHtml: (html: string) => void;
    /** Emit the current HTML block to students via socket. */
    emitPlayShow: (html: string) => void;
    /** Clear the play overlay from students' blackboards. */
    emitPlayClear: () => void;
    onEnableBlackboard: () => void;
    isBlackboardOn: boolean;
    onEnableCourse?: () => void;
}

/** Escape user text for safe HTML injection. */
function escHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Color picker helpers ──────────────────────────────────────────────────────
function hexToHsv(hex: string): { h: number; s: number; v: number } {
    const r = parseInt(hex.slice(1,3),16)/255, g = parseInt(hex.slice(3,5),16)/255, b = parseInt(hex.slice(5,7),16)/255;
    const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max - min;
    const v = max * 100, s = max === 0 ? 0 : (d / max) * 100;
    let h = 0;
    if (d !== 0) {
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60; if (h < 0) h += 360;
    }
    return { h: Math.round(h), s: Math.round(s), v: Math.round(v) };
}
function hsvToHex(h: number, s: number, v: number): string {
    s /= 100; v /= 100;
    const f = (n: number) => {
        const k = (n + h / 60) % 6;
        return Math.round((v - v * s * Math.max(Math.min(k, 4 - k, 1), 0)) * 255).toString(16).padStart(2, '0');
    };
    return '#' + f(5) + f(3) + f(1);
}

/** Build a CSS style string for a styled word group. */
function buildSpanCss(plan: {
    color: string; fontFamily: string; fontSizePx: number; fontStyle: FontStyle; underline: boolean;
}): string {
    const { color, fontFamily, fontSizePx, fontStyle, underline } = plan;
    const parts = [
        `color:${color}`,
        fontFamily ? `font-family:${fontFamily}` : '',
        `font-size:${fontSizePx}px`,
        fontStyle.includes('bold')   ? 'font-weight:bold'   : 'font-weight:normal',
        fontStyle.includes('italic') ? 'font-style:italic'  : 'font-style:normal',
        underline ? 'text-decoration:underline' : '',
    ].filter(Boolean);
    return parts.join(';');
}

// ── GroupPlan: pre-computed animation schedule ────────────────────────────────
interface GroupPlan {
    lineY: number;
    isFirstOnLine: boolean;
    prevTextWidth: number;
    newWords: string;
    color: string;
    fontFamily: string;
    fontSizePx: number;
    fontStyle: FontStyle;
    underline: boolean;
    blockIdx: number; // block of linesPerBlock canvas lines
    colIdx: number;   // fly-column within the block (same blockIdx+colIdx = auto-advance)
    lineIdxGlobal: number; // global canvas-line index across ALL blocks (never resets)
    wordCount: number;     // number of styledWords in this fly group (for consumed tracking)
}

function buildGroupPlan(
    styledWords: StyledWord[],
    wordsPerFly: number,
    wordsPerLine: number,
    linesPerBlock: number,
    anchorCy: number,
    canvasH: number,
    lineIdxOffset = 0, // added to every lineIdxGlobal so rebuilt plans continue after existing lines
): GroupPlan[] {
    if (!styledWords.length) return [];

    const measCanvas = document.createElement('canvas');
    const measCtx = measCanvas.getContext('2d')!;
    const measureWidth = (str: string, fs: FontStyle, fpx: number, ff: string) => {
        if (!str) return 0;
        measCtx.font = `${fs} ${fpx}px ${ff}`;
        return measCtx.measureText(str).width / CANVAS_W;
    };

    // ── Step 1: split styledWords into canvas lines ─────────────────────────
    // A new canvas line begins when the source textLine changes OR wordsPerLine is reached.
    interface CanvasLine { words: StyledWord[]; leadingPx: number; }
    const canvasLines: CanvasLine[] = [];
    let cur: StyledWord[] = [];
    let curLeading = styledWords[0].fontSizePx;
    let prevTL = styledWords[0].textLine;

    for (const w of styledWords) {
        const lineBreak = w.textLine !== prevTL;
        const full      = cur.length >= wordsPerLine;
        if (lineBreak || full) {
            if (cur.length) canvasLines.push({ words: cur, leadingPx: curLeading });
            cur = [];
            curLeading = w.fontSizePx;
            prevTL = w.textLine;
        }
        curLeading = Math.max(curLeading, w.fontSizePx);
        cur.push(w);
    }
    if (cur.length) canvasLines.push({ words: cur, leadingPx: curLeading });

    // ── Step 2: iterate blocks of linesPerBlock, then columns within each block ──
    // Within a block, plan entries are emitted column-first:
    //   col 0 of line 0, col 0 of line 1, ... col 0 of line N-1,
    //   col 1 of line 0, col 1 of line 1, ...
    // Same (blockIdx, colIdx) → auto-advance. Different colIdx → wait for Next.
    const plan: GroupPlan[] = [];
    let globalY = anchorCy;

    for (let b = 0; b < canvasLines.length; b += linesPerBlock) {
        const blockLines = canvasLines.slice(b, b + linesPerBlock);
        const blockIdx   = Math.floor(b / linesPerBlock);

        // y position for each line in this block
        const lineYs: number[] = [];
        let y = globalY;
        for (let li = 0; li < blockLines.length; li++) {
            lineYs.push(y);
            y += (blockLines[li].leadingPx * 1.4) / Math.max(1, canvasH);
        }
        globalY = y; // next block starts here

        // per-line cursors
        const wordIdx  = blockLines.map(() => 0);  // next word to emit
        const xOffset  = blockLines.map(() => 0);  // running x in canvas-fraction

        let colIdx = 0;
        let anyLeft = true;
        // Normalize fontFamily for comparison — strip quotes, take first token only,
        // lowercased. "Merriweather", 'Merriweather', "Merriweather, serif" → "merriweather"
        const normFont = (f: string) => f.replace(/['"]/g, '').split(',')[0].trim().toLowerCase();
        while (anyLeft) {
            anyLeft = false;
            for (let li = 0; li < blockLines.length; li++) {
                const bl = blockLines[li];
                let    wi = wordIdx[li];
                if (wi >= bl.words.length) continue;
                anyLeft = true;

                // homogeneous-style slice of up to wordsPerFly
                const s0 = bl.words[wi];
                let take = 1;
                while (
                    take < wordsPerFly &&
                    wi + take < bl.words.length &&
                    bl.words[wi + take].color      === s0.color &&
                    normFont(bl.words[wi + take].fontFamily) === normFont(s0.fontFamily) &&
                    bl.words[wi + take].fontSizePx === s0.fontSizePx &&
                    bl.words[wi + take].fontStyle  === s0.fontStyle &&
                    bl.words[wi + take].underline  === s0.underline
                ) take++;

                wordIdx[li] += take;
                const { color, fontFamily, fontSizePx, fontStyle, underline } = s0;
                const flyText        = bl.words.slice(wi, wi + take).map(w => w.word).join(' ');
                const isFirstOnLine  = xOffset[li] === 0;
                const spaceMeasured  = isFirstOnLine ? 0 : measureWidth(' ', fontStyle, fontSizePx, fontFamily);
                const prevTextWidth  = xOffset[li] + spaceMeasured;
                xOffset[li]          = prevTextWidth + measureWidth(flyText, fontStyle, fontSizePx, fontFamily);

                plan.push({
                    lineY: lineYs[li], isFirstOnLine, prevTextWidth, newWords: flyText,
                    color, fontFamily, fontSizePx, fontStyle, underline,
                    blockIdx, colIdx, lineIdxGlobal: lineIdxOffset + b + li, wordCount: take,
                });
            }
            colIdx++;
        }
    }
    return plan;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function PlayModePanel({
    anchor, canvasH,
    onPlayHtml, emitPlayShow, emitPlayClear,
    onEnableBlackboard, isBlackboardOn, onEnableCourse,
}: Props) {
    const [wordsPerLine,    setWordsPerLine]   = useState(5);
    const [wordsPerFly,     setWordsPerFly]    = useState(1);
    const [linesPerBlock,   setLinesPerBlock]  = useState(1);
    const [speedIdx,        setSpeedIdx]       = useState(1);
    const [animType,        setAnimType]     = useState<AnimType>("typing");
    const [playState,       setPlayState]    = useState<PlayState>("idle");
    const [currentGroupIdx, setCurrentGroupIdx] = useState(0);
    const [totalGroups,     setTotalGroups]  = useState(0);
    const [editorHtml,      setEditorHtml]   = useState("");
    const [colorPickerOpen, setColorPickerOpen] = useState(false);
    const [pickerHsv,  setPickerHsv]  = useState({ h: 0, s: 0, v: 100 });
    const [hexInput,   setHexInput]   = useState('#ffffff');
    const [pickerRect, setPickerRect] = useState<DOMRect | null>(null);
    const groupPlanRef    = useRef<GroupPlan[]>([]);
    const charBufRef      = useRef("");
    const intervalRef     = useRef<ReturnType<typeof setInterval> | null>(null);
    const frameRef        = useRef(0);
    const playStateRef    = useRef<PlayState>("idle");
    playStateRef.current  = playState;
    // Per-line accumulated HTML — global, never auto-cleared between blocks
    // Each entry stores the HTML content + the absolute canvas-fraction position of that line
    const lineHtmlsRef    = useRef<{ html: string; cx: number; cy: number }[]>([]);
    // What state were we in when Stop was pressed — determines Resume target
    const stoppedFromRef  = useRef<'playing' | 'ready-next'>('playing');
    // All styled words for the current session (needed to rebuild plan from new anchor)
    const styledWordsRef    = useRef<StyledWord[]>([]);
    // How many styledWords have been fully committed (finalCommit called)
    const wordsConsumedRef  = useRef(0);
    // Anchor position at the moment Stop was pressed (to detect if teacher relocated)
    const anchorAtStopRef   = useRef<{ cx: number; cy: number } | null>(null);
    // Tiptap editor instance
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const editorRef = useRef<any>(null);

    const anchorRef       = useRef(anchor);    anchorRef.current      = anchor;
    const canvasHRef      = useRef(canvasH);   canvasHRef.current     = canvasH;
    const speedRef        = useRef(speedIdx);  speedRef.current       = speedIdx;
    const animTypeRef     = useRef(animType);  animTypeRef.current    = animType;
    const wordsPerLineRef   = useRef(wordsPerLine);   wordsPerLineRef.current   = wordsPerLine;
    const wordsPerFlyRef    = useRef(wordsPerFly);    wordsPerFlyRef.current    = wordsPerFly;
    const linesPerBlockRef  = useRef(linesPerBlock);  linesPerBlockRef.current  = linesPerBlock;
    const onPlayHtmlRef   = useRef(onPlayHtml);   onPlayHtmlRef.current   = onPlayHtml;
    const emitPlayShowRef = useRef(emitPlayShow); emitPlayShowRef.current = emitPlayShow;
    const emitPlayClearRef = useRef(emitPlayClear); emitPlayClearRef.current = emitPlayClear;
    const isBlackboardOnRef = useRef(isBlackboardOn); isBlackboardOnRef.current = isBlackboardOn;
    const pickerGradRef  = useRef<HTMLDivElement>(null);
    const pickerHueRef   = useRef<HTMLDivElement>(null);
    const dragTargetRef  = useRef<'grad' | 'hue' | null>(null);
    const colorBtnRef    = useRef<HTMLButtonElement>(null);
    const panelRootRef   = useRef<HTMLDivElement>(null);

    // Inject CSS keyframes for non-typing animations once per document lifetime
    useEffect(() => {
        const id = 'play-mode-keyframes';
        if (document.getElementById(id)) return;
        const style = document.createElement('style');
        style.id = id;
        style.textContent = [
            '@keyframes pmFadeIn { from { opacity:0 } to { opacity:1 } }',
            '@keyframes pmSlideRight { from { opacity:0; transform:translateX(-24px) } to { opacity:1; transform:translateX(0) } }',
            '@keyframes pmSlideLeft { from { opacity:0; transform:translateX(24px) } to { opacity:1; transform:translateX(0) } }',
            '@keyframes pmSlideBottom { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:translateY(0) } }',
            '@keyframes pmScale { from { opacity:0; transform:scale(0.6) } to { opacity:1; transform:scale(1) } }',
        ].join('\n');
        document.head.appendChild(style);
    }, []);

    // ── Color picker mouse drag ───────────────────────────────────────────────
    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!dragTargetRef.current) return;
            if (dragTargetRef.current === 'grad' && pickerGradRef.current) {
                const rect = pickerGradRef.current.getBoundingClientRect();
                const s = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * 100;
                const v = (1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))) * 100;
                setPickerHsv(prev => {
                    const hex = hsvToHex(prev.h, s, v);
                    setHexInput(hex);
                    editorRef.current?.chain().setColor(hex).run();
                    return { ...prev, s, v };
                });
            } else if (dragTargetRef.current === 'hue' && pickerHueRef.current) {
                const rect = pickerHueRef.current.getBoundingClientRect();
                const h = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * 360;
                setPickerHsv(prev => {
                    const hex = hsvToHex(h, prev.s, prev.v);
                    setHexInput(hex);
                    editorRef.current?.chain().setColor(hex).run();
                    return { ...prev, h };
                });
            }
        };
        const onUp = () => { dragTargetRef.current = null; };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    }, []);

    /** Assemble the block HTML from per-line accumulated spans and broadcast it. */
    const broadcastBlock = useCallback(() => {
        const html = lineHtmlsRef.current
            .map(l => l?.html
                ? `<div style="position:absolute;left:${(l.cx * 100).toFixed(2)}%;top:${(l.cy * 100).toFixed(2)}%;white-space:pre-wrap;line-height:1.6;">${l.html}</div>`
                : ''
            ).join('');
        onPlayHtmlRef.current(html);
        emitPlayShowRef.current(html);
    }, []);

    /**
     * Build a temporary overlay HTML string: committed lines + a transient fly span.
     * Does NOT mutate lineHtmlsRef — safe to call during animation ticks.
     */
    const buildFlyOverlay = useCallback((plan: GroupPlan, text: string, animCss: string): string => {
        const cx      = anchorRef.current?.cx ?? 0.02;
        const baseCss = buildSpanCss(plan);
        const fullCss = animCss ? `${baseCss};${animCss}` : baseCss;
        const span    = `<span style="${fullCss}">${escHtml(text)} </span>`;
        const lines   = lineHtmlsRef.current.map(l => l ? { ...l } : { html: '', cx, cy: plan.lineY });
        const li      = plan.lineIdxGlobal;
        while (lines.length <= li) lines.push({ html: '', cx, cy: plan.lineY });
        lines[li] = { ...lines[li], html: lines[li].html + span };
        return lines
            .map(l => l?.html
                ? `<div style="position:absolute;left:${(l.cx * 100).toFixed(2)}%;top:${(l.cy * 100).toFixed(2)}%;white-space:pre-wrap;line-height:1.6;">${l.html}</div>`
                : ''
            ).join('');
    }, []);

    /** Append a fly group's HTML to the appropriate line and broadcast. */
    const commitFlyHtml = useCallback((plan: GroupPlan) => {
        const { lineIdxGlobal, newWords, lineY } = plan;
        const cx  = anchorRef.current?.cx ?? 0.02;
        const css = buildSpanCss(plan);
        const span = `<span style="${css}">${escHtml(newWords)} </span>`;
        const existing = lineHtmlsRef.current[lineIdxGlobal];
        lineHtmlsRef.current[lineIdxGlobal] = existing
            ? { ...existing, html: existing.html + span }
            : { html: span, cx, cy: lineY };
        broadcastBlock();
    }, [broadcastBlock]);

    const stopInterval = useCallback(() => {
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    }, []);

    const animateGroup = useCallback((idx: number) => {
        stopInterval();
        const plan = groupPlanRef.current;
        if (idx >= plan.length) {
            setPlayState("done");
            return;
        }

        const entry = plan[idx];
        setCurrentGroupIdx(idx);
        setPlayState('playing');

        const finalCommit = () => {
            wordsConsumedRef.current += entry.wordCount;
            commitFlyHtml(entry);
            const nextIdx = idx + 1;
            if (nextIdx >= plan.length) {
                setPlayState("done");
            } else if (
                plan[nextIdx].blockIdx === plan[idx].blockIdx &&
                plan[nextIdx].colIdx   === plan[idx].colIdx
            ) {
                setTimeout(() => animateGroup(nextIdx), 80);
            } else {
                setPlayState("ready-next");
            }
        };

        const anim = animTypeRef.current;

        if (anim === "typing") {
            // Char-by-char: update overlay on EVERY tick so the teacher sees text grow
            charBufRef.current = "";
            const animText = entry.newWords;
            intervalRef.current = setInterval(() => {
                if (playStateRef.current === "paused") return;
                charBufRef.current = animText.slice(0, charBufRef.current.length + 1);
                // Live update teacher's overlay with partial text (no socket emit yet)
                onPlayHtmlRef.current(buildFlyOverlay(entry, charBufRef.current, ''));
                if (charBufRef.current.length >= animText.length) {
                    stopInterval();
                    charBufRef.current = "";
                    finalCommit(); // commits to lineHtmlsRef and emits to students
                }
            }, SPEED_OPTIONS[speedRef.current].ms);
        } else {
            // CSS animation: inject the span with the animation style immediately so
            // the teacher sees the entrance effect; then commit (static) after the
            // animation duration so the student broadcast contains clean HTML.
            const animCss = ANIM_INLINE[anim] ?? '';
            onPlayHtmlRef.current(buildFlyOverlay(entry, entry.newWords, animCss));

            const TICKS = 15;
            frameRef.current = 0;
            const tickMs = Math.ceil(ANIM_DURATION_MS / TICKS);
            intervalRef.current = setInterval(() => {
                if (playStateRef.current === "paused") return;
                frameRef.current += 1;
                if (frameRef.current >= TICKS) {
                    stopInterval();
                    finalCommit();
                }
            }, tickMs);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stopInterval, commitFlyHtml, buildFlyOverlay]);

    const handleStart = useCallback(() => {
        if (isRichEmpty(editorHtml)) return;
        const styledWords = parseRichToStyledWords(editorHtml);
        if (!styledWords.length) return;
        if (onEnableCourse) onEnableCourse();
        if (!isBlackboardOnRef.current) onEnableBlackboard();
        const plan = buildGroupPlan(
            styledWords,
            wordsPerFlyRef.current,
            wordsPerLineRef.current,
            linesPerBlockRef.current,
            anchorRef.current?.cy ?? 0.05,
            canvasHRef.current,
        );
        if (!plan.length) return;
        // Clear any existing overlay before starting fresh
        lineHtmlsRef.current = [];
        onPlayHtmlRef.current('');
        emitPlayClearRef.current();
        styledWordsRef.current   = styledWords;
        wordsConsumedRef.current = 0;
        groupPlanRef.current = plan;
        setTotalGroups(plan.length);
        animateGroup(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onEnableBlackboard, onEnableCourse, animateGroup, editorHtml]);

    const handleNext        = useCallback(() => animateGroup(currentGroupIdx + 1), [currentGroupIdx, animateGroup]);
    const handlePauseResume = useCallback(() => setPlayState(p => p === "paused" ? "playing" : "paused"), []);

    /** Stop animation but KEEP the overlay on the blackboard. Plan stays in memory for Resume. */
    const handleStop = useCallback(() => {
        stoppedFromRef.current  = playStateRef.current === 'ready-next' ? 'ready-next' : 'playing';
        // Track where text actually ended (last committed line) so Resume detects a real relocation
        const lines = lineHtmlsRef.current;
        const lastLine = lines.length > 0 ? lines[lines.length - 1] : null;
        anchorAtStopRef.current = lastLine
            ? { cx: lastLine.cx, cy: lastLine.cy }
            : anchorRef.current ? { ...anchorRef.current } : null;
        stopInterval();
        charBufRef.current = '';
        // Snap teacher overlay to the committed state (removes any partial typing text)
        const committedHtml = lineHtmlsRef.current
            .map(l => l?.html
                ? `<div style="position:absolute;left:${(l.cx * 100).toFixed(2)}%;top:${(l.cy * 100).toFixed(2)}%;white-space:pre-wrap;line-height:1.6;">${l.html}</div>`
                : ''
            ).join('');
        onPlayHtmlRef.current(committedHtml);
        setPlayState('stopped');
    }, [stopInterval]);

    /** Resume from where we stopped.
     *  If the teacher clicked a new blackboard position since Stop, rebuild the remaining
     *  plan from that new anchor so text continues there instead of the old location. */
    const handleResume = useCallback(() => {
        const anchorNow = anchorRef.current;
        const anchorWas = anchorAtStopRef.current;
        const anchorMoved = !!anchorNow && !!anchorWas &&
            (Math.abs(anchorNow.cx - anchorWas.cx) > 0.005 ||
             Math.abs(anchorNow.cy - anchorWas.cy) > 0.005);

        if (anchorMoved) {
            // Rebuild plan for all words not yet committed, at the new anchor position
            const remaining = styledWordsRef.current.slice(wordsConsumedRef.current);
            if (!remaining.length) { setPlayState('done'); return; }
            const lineOffset = lineHtmlsRef.current.length; // new lines go after existing ones
            const newPlan = buildGroupPlan(
                remaining,
                wordsPerFlyRef.current,
                wordsPerLineRef.current,
                linesPerBlockRef.current,
                anchorNow.cy,
                canvasHRef.current,
                lineOffset,
            );
            if (!newPlan.length) { setPlayState('done'); return; }
            groupPlanRef.current = newPlan;
            setTotalGroups(newPlan.length);
            animateGroup(0);
        } else {
            // Same position — continue from the exact group that was interrupted
            if (stoppedFromRef.current === 'ready-next') {
                animateGroup(currentGroupIdx + 1);
            } else {
                animateGroup(currentGroupIdx);
            }
        }
    }, [currentGroupIdx, animateGroup]);

    /** Explicitly wipe the overlay and reset everything to idle. */
    const handleClear = useCallback(() => {
        stopInterval();
        lineHtmlsRef.current = [];
        onPlayHtmlRef.current('');
        emitPlayClearRef.current();
        setPlayState('idle');
        setCurrentGroupIdx(0);
        setTotalGroups(0);
        charBufRef.current = '';
        groupPlanRef.current = [];
    }, [stopInterval]);

    useEffect(() => () => stopInterval(), [stopInterval]);

    // ── Global mousedown → stop when playing, unless click is inside this panel ───
    // ── Keyboard shortcut: ArrowRight → Next (or Resume when stopped) ──────────
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') {
                if (playStateRef.current === 'ready-next') {
                    e.preventDefault();
                    handleNext();
                } else if (playStateRef.current === 'stopped') {
                    e.preventDefault();
                    handleResume();
                }
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [handleNext, handleResume]);

    // ── Auto-stop when teacher clicks a new blackboard position while playing ───
    const prevAnchorRef = useRef(anchor);
    useEffect(() => {
        const prev = prevAnchorRef.current;
        prevAnchorRef.current = anchor;
        if (!anchor || !prev) return; // initial set — not a move
        const ps = playStateRef.current;
        if (ps === 'playing' || ps === 'ready-next' || ps === 'paused') {
            handleStop();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [anchor]);

    const isActive = playState !== "idle";

    const progress = totalGroups > 0 ? `${Math.min(currentGroupIdx + 1, totalGroups)} / ${totalGroups}` : "";

    // Shared style for all compact dropdowns in the control rows
    const sel: React.CSSProperties = {
        padding: "1px 3px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.1)",
        background: "#1e293b", color: "#94a3b8", fontSize: 10, cursor: "pointer",
        colorScheme: "dark", maxWidth: 72,
    };
    // Action-select: value is always "" so it resets after each pick
    const applyFormat = (v: string) => {
        const e = editorRef.current;
        if (!e || !v) return;
        if (v === "bullet")     e.chain().focus().toggleBulletList().run();
        else if (v === "ordered")    e.chain().focus().toggleOrderedList().run();
        else if (v === "blockquote") e.chain().focus().toggleBlockquote().run();
        else if (v === "code")       e.chain().focus().toggleCodeBlock().run();
    };
    const applyHeading = (v: string) => {
        const e = editorRef.current;
        if (!e || v === "") return;
        if (v === "0") e.chain().focus().setParagraph().run();
        else e.chain().focus().toggleHeading({ level: Number(v) as 1|2|3 }).run();
    };
    const applyAlign = (v: string) => {
        const e = editorRef.current;
        if (!e || !v) return;
        e.chain().focus().setTextAlign(v).run();
    };

    // Derived editor active states — re-evaluated on each render (editorHtml change triggers re-render)
    const ed = editorRef.current;
    const isBold   = ed?.isActive('bold')      ?? false;
    const isItalic = ed?.isActive('italic')    ?? false;
    const isUnder  = ed?.isActive('underline') ?? false;
    const curColor = (ed?.getAttributes('textStyle') as { color?: string })?.color ?? '#ffffff';

    return (
        <div ref={panelRootRef} style={{ display: "flex", flexDirection: "column", height: "100%", background: "#111827", color: "#e2e8f0", fontSize: 13, overflow: "hidden" }}>

            {/* ── TOP: Lines / Per line / Per fly (replaces editor toolbar) ── */}
            <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "4px 8px", borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)", flexShrink: 0, flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "#94a3b8" }}>
                    Lines
                    <input type="number" min={1} max={10} value={linesPerBlock}
                        onChange={e => setLinesPerBlock(Math.max(1, Math.min(10, Number(e.target.value))))}
                        style={{ width: 34, background: "#1e293b", color: "#e2e8f0", border: "1px solid #334155", borderRadius: 4, padding: "1px 3px", fontSize: 11, textAlign: "center" }} />
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "#94a3b8" }}>
                    Per line
                    <input type="number" min={1} max={30} value={wordsPerLine}
                        onChange={e => setWordsPerLine(Math.max(1, Math.min(30, Number(e.target.value))))}
                        style={{ width: 34, background: "#1e293b", color: "#e2e8f0", border: "1px solid #334155", borderRadius: 4, padding: "1px 3px", fontSize: 11, textAlign: "center" }} />
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "#94a3b8" }}>
                    Per fly
                    <input type="number" min={1} max={20} value={wordsPerFly}
                        onChange={e => setWordsPerFly(Math.max(1, Math.min(20, Number(e.target.value))))}
                        style={{ width: 34, background: "#1e293b", color: "#e2e8f0", border: "1px solid #334155", borderRadius: 4, padding: "1px 3px", fontSize: 11, textAlign: "center" }} />
                </label>
            </div>

            {/* Rich editor — toolbar hidden; formatting lives in the bottom section */}
            <div style={{ flex: 1, overflow: "auto", pointerEvents: isActive ? "none" : "auto", opacity: isActive ? 0.5 : 1 }}>
                <RichEditor
                    value={editorHtml}
                    onChange={setEditorHtml}
                    onEditorReady={e => { editorRef.current = e; }}
                    placeholder="Type text here, then click Start Playing…"
                    minHeight={160}
                    disableImage
                    hideToolbar
                    style={{ border: "none", borderRadius: 0, background: "transparent" }}
                />
            </div>

            {/* ── BOTTOM: all formatting + animation + anchor + progress + buttons ── */}
            <div style={{ padding: "4px 8px 6px", borderTop: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>

                {/* Row 1 — character formatting: Para Font Sz B I U [color] */}
                <div style={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "nowrap", overflow: 'hidden' }}>
                    <select value="" disabled={isActive} onChange={e => applyHeading(e.target.value)} style={{ ...sel, maxWidth: 50, opacity: isActive ? 0.4 : 1 }}>
                        <option value="">Para</option>
                        <option value="0">Normal</option>
                        <option value="1">H1</option>
                        <option value="2">H2</option>
                        <option value="3">H3</option>
                    </select>
                    <select value="" disabled={isActive}
                        onChange={e => { const v = e.target.value; if (!v || !ed) return; ed.chain().focus().setMark('textStyle', { fontFamily: v }).run(); }}
                        style={{ ...sel, maxWidth: 50, opacity: isActive ? 0.4 : 1 }}>
                        <option value="">Font</option>
                        {PLAY_FONTS.filter(f => f.value).map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                    <select value="" disabled={isActive}
                        onChange={e => { const v = e.target.value; if (!v || !ed) return; ed.chain().focus().setMark('textStyle', { fontSize: v + 'px' }).run(); }}
                        style={{ ...sel, maxWidth: 36, opacity: isActive ? 0.4 : 1 }}>
                        <option value="">Sz</option>
                        {PLAY_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {(['B', 'I', 'U'] as const).map((lbl, i) => {
                        const active = [isBold, isItalic, isUnder][i];
                        const cmd = () => ed?.chain().focus()[i === 0 ? 'toggleBold' : i === 1 ? 'toggleItalic' : 'toggleUnderline']().run();
                        return (
                            <button key={lbl} disabled={isActive} onClick={cmd}
                                style={{ padding: "0px 4px", fontSize: 10, borderRadius: 4, border: "none", flexShrink: 0, cursor: isActive ? "default" : "pointer", fontWeight: lbl === 'B' ? 900 : 400, fontStyle: lbl === 'I' ? 'italic' : 'normal', textDecoration: lbl === 'U' ? 'underline' : 'none', background: active ? "#6366f1" : "#1e293b", color: active ? "#fff" : "#94a3b8", opacity: isActive ? 0.4 : 1 }}>
                                {lbl}
                            </button>
                        );
                    })}
                    {/* Full gradient color picker */}
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                        <button ref={colorBtnRef} disabled={isActive}
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => {
                                if (!colorPickerOpen) {
                                    const c = curColor.startsWith('#') && curColor.length === 7 ? curColor : '#ffffff';
                                    setPickerHsv(hexToHsv(c)); setHexInput(c);
                                    if (colorBtnRef.current) setPickerRect(colorBtnRef.current.getBoundingClientRect());
                                }
                                setColorPickerOpen(v => !v);
                            }}
                            title="Text color"
                            style={{ width: 18, height: 14, borderRadius: 2, border: `2px solid ${colorPickerOpen ? '#a5b4fc' : '#475569'}`, background: curColor, cursor: isActive ? "default" : "pointer", opacity: isActive ? 0.4 : 1, padding: 0, display: 'block' }} />
                        {colorPickerOpen && !isActive && pickerRect && (
                            <div
                                onMouseDown={e => e.preventDefault()}
                                onMouseLeave={() => { if (!dragTargetRef.current) setColorPickerOpen(false); }}
                                style={{ position: 'fixed',
                                    top: Math.max(4, pickerRect.top - 252),
                                    left: Math.max(4, Math.min(window.innerWidth - 194, pickerRect.left - 76)),
                                    zIndex: 99999,
                                    background: '#1a1a2e', border: '1px solid rgba(99,102,241,0.45)',
                                    borderRadius: 10, padding: '8px', boxShadow: '0 10px 36px rgba(0,0,0,0.75)',
                                    width: 186, userSelect: 'none' }}>
                                {/* Saturation / Value gradient */}
                                <div ref={pickerGradRef}
                                    onMouseDown={() => { dragTargetRef.current = 'grad'; }}
                                    style={{ width: '100%', height: 120, borderRadius: 6, overflow: 'hidden',
                                        position: 'relative', cursor: 'crosshair', marginBottom: 8,
                                        background: `linear-gradient(to bottom,transparent,#000),linear-gradient(to right,#fff,hsl(${Math.round(pickerHsv.h)},100%,50%))` }}>
                                    <div style={{ position: 'absolute', left: `${pickerHsv.s}%`, top: `${100 - pickerHsv.v}%`,
                                        width: 12, height: 12, borderRadius: '50%', border: '2px solid #fff',
                                        transform: 'translate(-50%,-50%)', pointerEvents: 'none',
                                        boxShadow: '0 0 0 1.5px rgba(0,0,0,0.55)' }} />
                                </div>
                                {/* Hue slider */}
                                <div ref={pickerHueRef}
                                    onMouseDown={() => { dragTargetRef.current = 'hue'; }}
                                    style={{ width: '100%', height: 12, borderRadius: 6, marginBottom: 8,
                                        background: 'linear-gradient(to right,#f00 0%,#ff0 17%,#0f0 33%,#0ff 50%,#00f 67%,#f0f 83%,#f00 100%)',
                                        position: 'relative', cursor: 'pointer' }}>
                                    <div style={{ position: 'absolute', left: `${pickerHsv.h / 360 * 100}%`, top: '50%',
                                        width: 14, height: 14, borderRadius: '50%', border: '2px solid #fff',
                                        transform: 'translate(-50%,-50%)', pointerEvents: 'none',
                                        background: `hsl(${pickerHsv.h},100%,50%)`,
                                        boxShadow: '0 0 0 1.5px rgba(0,0,0,0.55)' }} />
                                </div>
                                {/* Preview swatch + hex input */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                    <div style={{ width: 28, height: 28, borderRadius: 5, flexShrink: 0,
                                        background: hsvToHex(pickerHsv.h, pickerHsv.s, pickerHsv.v),
                                        border: '1px solid rgba(255,255,255,0.2)' }} />
                                    <input value={hexInput}
                                        onMouseDown={e => e.stopPropagation()}
                                        onChange={e => {
                                            const v = e.target.value; setHexInput(v);
                                            if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                                                setPickerHsv(hexToHsv(v));
                                                editorRef.current?.chain().setColor(v).run();
                                            }
                                        }}
                                        style={{ flex: 1, background: '#0f172a', border: '1px solid #334155',
                                            borderRadius: 5, padding: '3px 6px', color: '#e2e8f0',
                                            fontSize: 11, fontFamily: 'monospace' }}
                                    />
                                </div>
                                {/* Preset swatches */}
                                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                    {['#ffffff','#000000','#ffff00','#ff4444','#ff9900','#44cc88','#00ccff','#cc88ff','#4488ff','#ff88cc'].map(c => (
                                        <button key={c} title={c}
                                            onClick={() => { const hsv = hexToHsv(c); setPickerHsv(hsv); setHexInput(c); editorRef.current?.chain().setColor(c).run(); }}
                                            style={{ width: 22, height: 22, borderRadius: '50%', border: hexInput === c ? '2px solid #fff' : '1px solid rgba(255,255,255,0.18)', background: c, cursor: 'pointer', padding: 0, flexShrink: 0 }} />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Row 2 — block formatting + animation + anchor */}
                <div style={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "nowrap" }}>
                    <select value="" disabled={isActive} onChange={e => applyFormat(e.target.value)} style={{ ...sel, maxWidth: 50, opacity: isActive ? 0.4 : 1 }}>
                        <option value="">List</option>
                        <option value="bullet">• Bullet</option>
                        <option value="ordered">1. Num</option>
                        <option value="blockquote">❝ Quote</option>
                        <option value="code">⌨ Code</option>
                    </select>
                    <select value="" disabled={isActive} onChange={e => applyAlign(e.target.value)} style={{ ...sel, maxWidth: 46, opacity: isActive ? 0.4 : 1 }}>
                        <option value="">Align</option>
                        <option value="left">← L</option>
                        <option value="center">≡ C</option>
                        <option value="right">→ R</option>
                    </select>
                    <select value={animType} onChange={e => setAnimType(e.target.value as AnimType)} style={{ ...sel, maxWidth: 54 }}>
                        <option value="typing">Typing</option>
                        <option value="fade">Fade</option>
                        <option value="slide-right">→ Slide</option>
                        <option value="slide-left">← Slide</option>
                        <option value="slide-bottom">↑ Slide</option>
                        <option value="scale">Scale</option>
                    </select>
                    <select value={speedIdx} onChange={e => setSpeedIdx(Number(e.target.value))} style={{ ...sel, maxWidth: 48 }}>
                        {SPEED_OPTIONS.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
                    </select>
                    <span style={{ fontSize: 9, color: anchor ? "#6366f1" : "#475569", flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {anchor ? `● ${Math.round(anchor.cy * 100)}%` : '→T'}
                    </span>
                </div>

                {totalGroups > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 4, background: "#1e293b", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ height: "100%", background: "#6366f1", borderRadius: 2,
                                width: `${(Math.min(currentGroupIdx + 1, totalGroups) / totalGroups) * 100}%`,
                                transition: "width 0.3s" }} />
                        </div>
                        <span style={{ fontSize: 10, color: "#94a3b8", whiteSpace: "nowrap" }}>{progress}</span>
                    </div>
                )}

                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {/* ── idle ───────────────────────────────────────────── */}
                    {playState === "idle" && (
                        <button onClick={handleStart}
                            style={{ flex: 1, padding: "5px 8px", borderRadius: 6, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12, background: "#6366f1", color: "#fff" }}>
                            Start Playing
                        </button>
                    )}

                    {/* ── playing ────────────────────────────────────────── */}
                    {playState === "playing" && (
                        <>
                            <button onClick={handlePauseResume}
                                style={{ flex: 1, padding: "5px 8px", borderRadius: 6, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12, background: "#f59e0b", color: "#fff" }}>
                                Pause
                            </button>
                            <button onClick={handleStop}
                                style={{ padding: "5px 10px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, background: "#374151", color: "#9ca3af" }}>
                                Stop
                            </button>
                        </>
                    )}

                    {/* ── paused ─────────────────────────────────────────── */}
                    {playState === "paused" && (
                        <>
                            <button onClick={handlePauseResume}
                                style={{ flex: 1, padding: "5px 8px", borderRadius: 6, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12, background: "#22c55e", color: "#fff" }}>
                                Resume
                            </button>
                            <button onClick={handleStop}
                                style={{ padding: "5px 10px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, background: "#374151", color: "#9ca3af" }}>
                                Stop
                            </button>
                        </>
                    )}

                    {/* ── ready-next ─────────────────────────────────────── */}
                    {playState === "ready-next" && (
                        <>
                            <button onClick={handleNext}
                                style={{ flex: 1, padding: "5px 8px", borderRadius: 6, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12, background: "#3b82f6", color: "#fff" }}>
                                Next →
                            </button>
                            <button onClick={handleStop}
                                style={{ padding: "5px 10px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, background: "#374151", color: "#9ca3af" }}>
                                Stop
                            </button>
                        </>
                    )}

                    {/* ── stopped — overlay preserved, choose next action ── */}
                    {playState === "stopped" && (
                        <>
                            <button onClick={handleResume}
                                style={{ flex: 1, padding: "5px 8px", borderRadius: 6, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12, background: "#22c55e", color: "#fff" }}>
                                Resume
                            </button>
                            <button onClick={handleStart}
                                style={{ flex: 1, padding: "5px 8px", borderRadius: 6, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12, background: "#6366f1", color: "#fff" }}>
                                Restart
                            </button>
                            <button onClick={handleClear}
                                style={{ padding: "5px 10px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, background: "#374151", color: "#9ca3af" }}>
                                Clear
                            </button>
                        </>
                    )}

                    {/* ── done ───────────────────────────────────────────── */}
                    {playState === "done" && (
                        <>
                            <button onClick={handleStart}
                                style={{ flex: 1, padding: "5px 8px", borderRadius: 6, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12, background: "#6366f1", color: "#fff" }}>
                                Restart
                            </button>
                            <button onClick={handleClear}
                                style={{ padding: "5px 10px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, background: "#374151", color: "#9ca3af" }}>
                                Clear
                            </button>
                        </>
                    )}
                </div>

                {playState === "done" && (
                    <div style={{ fontSize: 11, color: "#22c55e", textAlign: "center" }}>All text displayed</div>
                )}
                {playState === "stopped" && (
                    <div style={{ fontSize: 11, color: "#f59e0b", textAlign: "center" }}>Stopped — click blackboard to move position, then Resume</div>
                )}
            </div>
        </div>
    );
}
