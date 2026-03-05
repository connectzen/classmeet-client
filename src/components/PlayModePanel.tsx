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
    lineIdxInBlock: number; // which line within the current block (0-based)
}

function buildGroupPlan(
    styledWords: StyledWord[],
    wordsPerFly: number,
    wordsPerLine: number,
    linesPerBlock: number,
    anchorCy: number,
    canvasH: number,
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
                    blockIdx, colIdx, lineIdxInBlock: li,
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
    const groupPlanRef    = useRef<GroupPlan[]>([]);
    const charBufRef      = useRef("");
    const intervalRef     = useRef<ReturnType<typeof setInterval> | null>(null);
    const frameRef        = useRef(0);
    const playStateRef    = useRef<PlayState>("idle");
    playStateRef.current  = playState;
    // Per-line accumulated HTML for the current block (cleared on each new block)
    const lineHtmlsRef    = useRef<string[]>([]);
    // What state were we in when Stop was pressed — determines Resume target
    const stoppedFromRef  = useRef<'playing' | 'ready-next'>('playing');
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

    /** Assemble the block HTML from per-line accumulated spans and broadcast it. */
    const broadcastBlock = useCallback(() => {
        const html = lineHtmlsRef.current
            .map(l => `<div style="margin:0;line-height:1.6;white-space:pre-wrap;">${l}</div>`)
            .join('');
        onPlayHtmlRef.current(html);
        emitPlayShowRef.current(html);
    }, []);

    /** Append a fly group's HTML to the appropriate line and broadcast. */
    const commitFlyHtml = useCallback((plan: GroupPlan) => {
        const { lineIdxInBlock, newWords } = plan;
        const css = buildSpanCss(plan);
        const span = `<span style="${css}">${escHtml(newWords)} </span>`;
        if (!lineHtmlsRef.current[lineIdxInBlock]) lineHtmlsRef.current[lineIdxInBlock] = '';
        lineHtmlsRef.current[lineIdxInBlock] += span;
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

        // Detect block boundary — clear accumulated HTML for the new block
        if (idx > 0 && plan[idx].blockIdx !== plan[idx - 1].blockIdx) {
            lineHtmlsRef.current = [];
            onPlayHtmlRef.current('');
            emitPlayClearRef.current();
        }

        const entry = plan[idx];
        setCurrentGroupIdx(idx);
        setPlayState("playing");

        const finalCommit = () => {
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
            // Teacher side: char-by-char in the preview; students receive commit only
            charBufRef.current = "";
            const animText = entry.newWords;
            intervalRef.current = setInterval(() => {
                if (playStateRef.current === "paused") return;
                charBufRef.current = animText.slice(0, charBufRef.current.length + 1);
                if (charBufRef.current.length >= animText.length) {
                    stopInterval();
                    charBufRef.current = "";
                    finalCommit();
                }
            }, SPEED_OPTIONS[speedRef.current].ms);
        } else {
            // Non-typing animations: just wait the equivalent duration then commit
            const FRAMES = 20;
            frameRef.current = 0;
            const ms = Math.max(10, SPEED_OPTIONS[speedRef.current].ms * 1.5);
            intervalRef.current = setInterval(() => {
                if (playStateRef.current === "paused") return;
                frameRef.current += 1;
                if (frameRef.current >= FRAMES) {
                    stopInterval();
                    finalCommit();
                }
            }, ms);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stopInterval, commitFlyHtml]);

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
        groupPlanRef.current = plan;
        setTotalGroups(plan.length);
        animateGroup(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onEnableBlackboard, onEnableCourse, animateGroup, editorHtml]);

    const handleNext        = useCallback(() => animateGroup(currentGroupIdx + 1), [currentGroupIdx, animateGroup]);
    const handlePauseResume = useCallback(() => setPlayState(p => p === "paused" ? "playing" : "paused"), []);

    /** Stop animation but KEEP the overlay on the blackboard. Plan stays in memory for Resume. */
    const handleStop = useCallback(() => {
        stoppedFromRef.current = playStateRef.current === 'ready-next' ? 'ready-next' : 'playing';
        stopInterval();
        charBufRef.current = '';
        setPlayState('stopped');
        // Overlay and groupPlanRef intentionally NOT cleared
    }, [stopInterval]);

    /** Resume from where we stopped (or from the next group if we were at a column boundary). */
    const handleResume = useCallback(() => {
        if (stoppedFromRef.current === 'ready-next') {
            animateGroup(currentGroupIdx + 1);
        } else {
            animateGroup(currentGroupIdx);
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

    // ── Keyboard shortcut: ArrowRight → Next ───────────────────────────────────
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight' && playStateRef.current === 'ready-next') {
                e.preventDefault();
                handleNext();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [handleNext]);

    const isActive = playState !== "idle";

    const progress = totalGroups > 0 ? `${Math.min(currentGroupIdx + 1, totalGroups)} / ${totalGroups}` : "";

    // Shared style for all compact dropdowns in the control rows
    const sel: React.CSSProperties = {
        padding: "2px 4px", borderRadius: 5, border: "1px solid rgba(255,255,255,0.1)",
        background: "#1e293b", color: "#94a3b8", fontSize: 11, cursor: "pointer",
        colorScheme: "dark", maxWidth: 90,
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
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#111827", color: "#e2e8f0", fontSize: 13, overflow: "hidden" }}>

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

                {/* Row 1 — text formatting */}
                <div style={{ display: "flex", gap: 3, alignItems: "center", flexWrap: "wrap" }}>
                    <select value="" disabled={isActive} onChange={e => applyHeading(e.target.value)} style={{ ...sel, opacity: isActive ? 0.4 : 1 }}>
                        <option value="">Para</option>
                        <option value="0">Normal</option>
                        <option value="1">H1</option>
                        <option value="2">H2</option>
                        <option value="3">H3</option>
                    </select>
                    <select value="" disabled={isActive}
                        onChange={e => { const v = e.target.value; if (!v || !ed) return; ed.chain().focus().setMark('textStyle', { fontFamily: v }).run(); }}
                        style={{ ...sel, opacity: isActive ? 0.4 : 1 }}>
                        <option value="">Font</option>
                        {PLAY_FONTS.filter(f => f.value).map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                    <select value="" disabled={isActive}
                        onChange={e => { const v = e.target.value; if (!v || !ed) return; ed.chain().focus().setMark('textStyle', { fontSize: v + 'px' }).run(); }}
                        style={{ ...sel, maxWidth: 56, opacity: isActive ? 0.4 : 1 }}>
                        <option value="">Sz</option>
                        {PLAY_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {(['B', 'I', 'U'] as const).map((lbl, i) => {
                        const active = [isBold, isItalic, isUnder][i];
                        const cmd = () => ed?.chain().focus()[i === 0 ? 'toggleBold' : i === 1 ? 'toggleItalic' : 'toggleUnderline']().run();
                        return (
                            <button key={lbl} disabled={isActive} onClick={cmd}
                                style={{ padding: "1px 6px", fontSize: 11, borderRadius: 4, border: "none", cursor: isActive ? "default" : "pointer", fontWeight: lbl === 'B' ? 900 : 400, fontStyle: lbl === 'I' ? 'italic' : 'normal', textDecoration: lbl === 'U' ? 'underline' : 'none', background: active ? "#6366f1" : "#1e293b", color: active ? "#fff" : "#94a3b8", opacity: isActive ? 0.4 : 1 }}>
                                {lbl}
                            </button>
                        );
                    })}
                    <input type="color" disabled={isActive} value={curColor}
                        onChange={e => ed?.chain().focus().setColor(e.target.value).run()}
                        title="Text color"
                        style={{ width: 22, height: 20, padding: 0, border: "1px solid #334155", borderRadius: 3, cursor: isActive ? "default" : "pointer", background: "none", opacity: isActive ? 0.4 : 1 }} />
                    <select value="" disabled={isActive} onChange={e => applyFormat(e.target.value)} style={{ ...sel, opacity: isActive ? 0.4 : 1 }}>
                        <option value="">List</option>
                        <option value="bullet">• Bullet</option>
                        <option value="ordered">1. Num</option>
                        <option value="blockquote">❝ Quote</option>
                        <option value="code">⌨ Code</option>
                    </select>
                    <select value="" disabled={isActive} onChange={e => applyAlign(e.target.value)} style={{ ...sel, opacity: isActive ? 0.4 : 1 }}>
                        <option value="">Align</option>
                        <option value="left">← L</option>
                        <option value="center">≡ C</option>
                        <option value="right">→ R</option>
                    </select>
                </div>

                {/* Row 2 — animation */}
                <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                    <select value={animType} onChange={e => setAnimType(e.target.value as AnimType)} style={sel}>
                        <option value="typing">Typing</option>
                        <option value="fade">Fade</option>
                        <option value="slide-right">Slide →</option>
                        <option value="slide-left">Slide ←</option>
                        <option value="slide-bottom">Slide ↑</option>
                        <option value="scale">Scale</option>
                    </select>
                    <select value={speedIdx} onChange={e => setSpeedIdx(Number(e.target.value))} style={sel}>
                        {SPEED_OPTIONS.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
                    </select>
                </div>

                {/* Row 3 — anchor hint */}
                <div style={{ fontSize: 10, color: anchor ? "#6366f1" : "#475569" }}>
                    {anchor
                        ? `Anchor (${Math.round(anchor.cx * CANVAS_W)}px, ~${Math.round(anchor.cy * 100)}%)`
                        : "Click blackboard with text tool to set start position"}
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
                    <div style={{ fontSize: 11, color: "#f59e0b", textAlign: "center" }}>Stopped — blackboard preserved</div>
                )}
            </div>
        </div>
    );
}
