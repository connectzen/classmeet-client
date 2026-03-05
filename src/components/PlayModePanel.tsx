import { useCallback, useEffect, useRef, useState } from "react";
import type { DrawSeg } from "./RoomCoursePanel";
import RichEditor, { isRichEmpty } from "./RichEditor";

// ── Constants ─────────────────────────────────────────────────────────────────
const CANVAS_W = 640;
const SPEED_OPTIONS: { label: string; ms: number }[] = [
    { label: "Slow",   ms: 80 },
    { label: "Normal", ms: 35 },
    { label: "Fast",   ms: 12 },
];

type FontStyle = "normal" | "bold" | "italic" | "bold italic";
type PlayState = "idle" | "playing" | "paused" | "ready-next" | "done";
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
    onPlayFrame: (seg: DrawSeg | null) => void;
    onPlayCommit: (seg: DrawSeg) => void;
    onPlayReplaceLine: (seg: DrawSeg) => void;
    onEnableBlackboard: () => void;
    isBlackboardOn: boolean;
    onEnableCourse?: () => void;
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
                    blockIdx, colIdx,
                });
            }
            colIdx++;
        }
    }
    return plan;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function PlayModePanel({
    anchor, canvasH, onPlayFrame, onPlayCommit, onPlayReplaceLine,
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
    // Tiptap editor instance — set via onEditorReady so we can call formatting commands
    // from the play-panel toolbar without needing to bubble events through RichEditor.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const editorRef = useRef<any>(null);

    const anchorRef       = useRef(anchor);    anchorRef.current      = anchor;
    const canvasHRef      = useRef(canvasH);   canvasHRef.current     = canvasH;
    const speedRef        = useRef(speedIdx);  speedRef.current       = speedIdx;
    const animTypeRef     = useRef(animType);  animTypeRef.current    = animType;
    const wordsPerLineRef   = useRef(wordsPerLine);   wordsPerLineRef.current   = wordsPerLine;
    const wordsPerFlyRef    = useRef(wordsPerFly);    wordsPerFlyRef.current    = wordsPerFly;
    const linesPerBlockRef  = useRef(linesPerBlock);  linesPerBlockRef.current  = linesPerBlock;
    const onPlayFrameRef  = useRef(onPlayFrame);  onPlayFrameRef.current  = onPlayFrame;
    const onPlayCommitRef = useRef(onPlayCommit); onPlayCommitRef.current = onPlayCommit;
    const onPlayReplaceRef = useRef(onPlayReplaceLine); onPlayReplaceRef.current = onPlayReplaceLine;
    const isBlackboardOnRef = useRef(isBlackboardOn); isBlackboardOnRef.current = isBlackboardOn;

    const makeBaseSeg = useCallback((
        text: string,
        lineY: number,
        style: { color: string; fontFamily: string; fontSizePx: number; fontStyle: FontStyle; underline: boolean },
    ): DrawSeg => {
        const baseX = anchorRef.current?.cx ?? 0.02;
        return {
            x1: baseX, y1: lineY, x2: baseX, y2: lineY,
            color: style.color, size: 1, mode: "text", text,
            fontFamily: style.fontFamily,
            fontSizePx: style.fontSizePx,
            fontStyle:  style.fontStyle,
            underline:  style.underline,
            noWrap: true, // pre-positioned; never let canvas word-wrap reflow these
        };
    }, []);

    const stopInterval = useCallback(() => {
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    }, []);

    const animateGroup = useCallback((idx: number) => {
        stopInterval();
        const plan = groupPlanRef.current;
        if (idx >= plan.length) {
            setPlayState("done");
            onPlayFrameRef.current(null);
            return;
        }
        const { lineY, isFirstOnLine, prevTextWidth, newWords,
                color, fontFamily, fontSizePx, fontStyle, underline } = plan[idx];
        const flyStyle = { color, fontFamily, fontSizePx, fontStyle, underline };
        setCurrentGroupIdx(idx);
        setPlayState("playing");

        const ax    = anchorRef.current?.cx ?? 0.02;
        const animX = isFirstOnLine ? ax : ax + prevTextWidth;
        // Always animate + commit only the NEW words for this fly — each word
        // gets its own DrawSeg at its exact x-position so per-word colors /
        // fonts are preserved independently on the canvas (no replace-line).
        const animText = newWords;

        const makeAnimSeg = (text: string): DrawSeg => {
            const seg = makeBaseSeg(text, lineY, flyStyle);
            seg.x1 = animX; seg.x2 = animX;
            return seg;
        };

        const emit = (seg: DrawSeg) => onPlayFrameRef.current(seg);
        const finalCommit = () => {
            onPlayFrameRef.current(null);
            // Commit the fly as an independent segment at animX — never replace
            const s = makeBaseSeg(newWords, lineY, flyStyle);
            s.x1 = animX; s.x2 = animX;
            onPlayCommitRef.current(s);
            // Auto-advance if next group is in the same block+column; pause between columns
            const plan = groupPlanRef.current;
            const nextIdx = idx + 1;
            if (nextIdx >= plan.length) {
                setPlayState("done");
            } else if (
                plan[nextIdx].blockIdx === plan[idx].blockIdx &&
                plan[nextIdx].colIdx   === plan[idx].colIdx
            ) {
                // same column within same block → auto-advance to next line
                setTimeout(() => animateGroup(nextIdx), 80);
            } else {
                // column boundary → wait for Next
                setPlayState("ready-next");
            }
        };

        const anim = animTypeRef.current;

        if (anim === "typing") {
            charBufRef.current = "";
            intervalRef.current = setInterval(() => {
                if (playStateRef.current === "paused") return;
                charBufRef.current = animText.slice(0, charBufRef.current.length + 1);
                emit(makeAnimSeg(charBufRef.current));
                if (charBufRef.current.length >= animText.length) {
                    stopInterval();
                    charBufRef.current = "";
                    finalCommit();
                }
            }, SPEED_OPTIONS[speedRef.current].ms);
        } else {
            const FRAMES = 20;
            frameRef.current = 0;
            const ms = Math.max(10, SPEED_OPTIONS[speedRef.current].ms * 1.5);
            intervalRef.current = setInterval(() => {
                if (playStateRef.current === "paused") return;
                frameRef.current += 1;
                const p = Math.min(1, 1 - Math.pow(1 - frameRef.current / FRAMES, 2));
                const seg = makeAnimSeg(animText);
                if      (anim === "fade")         { seg.opacity = p; }
                else if (anim === "slide-right")  { seg.x1 = seg.x2 = animX + 0.35 * (1 - p); }
                else if (anim === "slide-left")   { seg.x1 = seg.x2 = animX - 0.35 * (1 - p); }
                else if (anim === "slide-bottom") { seg.y1 = seg.y2 = lineY + (0.15 * Math.max(1, canvasHRef.current) / 100) * (1 - p); }
                else if (anim === "scale")        { seg.fontSizePx = Math.max(1, Math.round(fontSizePx * (0.05 + 0.95 * p))); }
                if (frameRef.current >= FRAMES) {
                    stopInterval();
                    finalCommit();
                } else {
                    emit(seg);
                }
            }, ms);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stopInterval, makeBaseSeg]);

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
        groupPlanRef.current = plan;
        setTotalGroups(plan.length);
        animateGroup(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onEnableBlackboard, onEnableCourse, animateGroup, editorHtml]);

    const handleNext        = useCallback(() => animateGroup(currentGroupIdx + 1), [currentGroupIdx, animateGroup]);
    const handlePauseResume = useCallback(() => setPlayState(p => p === "paused" ? "playing" : "paused"), []);
    const handleStop        = useCallback(() => {
        stopInterval(); onPlayFrameRef.current(null);
        setPlayState("idle"); setCurrentGroupIdx(0); setTotalGroups(0);
        charBufRef.current = ""; groupPlanRef.current = [];
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

    // Helper for compact format toggle buttons in the control rows
    const fmtBtn = (label: string, title: string, cmd: () => void) => (
        <button key={title} title={title} disabled={isActive} onClick={cmd}
            style={{ padding: "2px 7px", fontSize: 11, borderRadius: 4, cursor: isActive ? "default" : "pointer",
                border: "none", background: "#1e293b", color: isActive ? "#374151" : "#94a3b8",
                opacity: isActive ? 0.4 : 1, whiteSpace: "nowrap" }}>
            {label}
        </button>
    );
    const progress = totalGroups > 0 ? `${Math.min(currentGroupIdx + 1, totalGroups)} / ${totalGroups}` : "";

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#111827", color: "#e2e8f0", fontSize: 13, overflow: "hidden" }}>

            {/* Rich editor — replaces the old textarea + custom toolbar */}
            <div style={{ flex: 1, overflow: "auto", pointerEvents: isActive ? "none" : "auto", opacity: isActive ? 0.5 : 1 }}>
                <RichEditor
                    value={editorHtml}
                    onChange={setEditorHtml}
                    onEditorReady={ed => { editorRef.current = ed; }}
                    placeholder="Type text here, then click Start Playing…"
                    minHeight={180}
                    disableImage
                    style={{ border: "none", borderRadius: 0, background: "transparent" }}
                />
            </div>

            {/* Animation controls bar */}
            <div style={{ display: "flex", gap: 4, padding: "5px 8px", borderTop: "1px solid rgba(255,255,255,0.07)", borderBottom: "1px solid rgba(255,255,255,0.07)", flexWrap: "wrap", overflowX: "auto", alignItems: "center", background: "rgba(255,255,255,0.02)", flexShrink: 0 }}>
                {/* Animation type */}
                <select value={animType} onChange={e => setAnimType(e.target.value as AnimType)}
                    style={{ padding: "2px 4px", borderRadius: 5, border: "1px solid rgba(255,255,255,0.1)", background: "#1e293b", color: "#94a3b8", fontSize: 11, cursor: "pointer", colorScheme: "dark" }}>
                    <option value="typing">Type</option>
                    <option value="fade">Fade</option>
                    <option value="slide-right">Slide →</option>
                    <option value="slide-left">Slide ←</option>
                    <option value="slide-bottom">Slide ↑</option>
                    <option value="scale">Scale</option>
                </select>
                {/* Formatting shortcuts — fill the empty space next to the Type select */}
                <div style={{ flex: 1 }} />
                <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
                    <span style={{ fontSize: 10, color: "#475569", marginRight: 2 }}>Format:</span>
                    {fmtBtn("• List", "Bullet list", () => editorRef.current?.chain().focus().toggleBulletList().run())}
                    {fmtBtn("1. List", "Numbered list", () => editorRef.current?.chain().focus().toggleOrderedList().run())}
                    {fmtBtn("❝", "Blockquote", () => editorRef.current?.chain().focus().toggleBlockquote().run())}
                    {fmtBtn("</>", "Code block", () => editorRef.current?.chain().focus().toggleCodeBlock().run())}
                </div>
            </div>

            {/* Bottom controls */}
            <div style={{ padding: "8px 10px", borderTop: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", display: "flex", flexDirection: "column", gap: 7, flexShrink: 0 }}>

                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#94a3b8" }}>
                        Lines
                        <input type="number" min={1} max={10} value={linesPerBlock}
                            onChange={e => setLinesPerBlock(Math.max(1, Math.min(10, Number(e.target.value))))}
                            style={{ width: 36, background: "#1e293b", color: "#e2e8f0", border: "1px solid #334155", borderRadius: 4, padding: "2px 4px", fontSize: 12, textAlign: "center" }} />
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#94a3b8" }}>
                        Per line
                        <input type="number" min={1} max={30} value={wordsPerLine}
                            onChange={e => setWordsPerLine(Math.max(1, Math.min(30, Number(e.target.value))))}
                            style={{ width: 36, background: "#1e293b", color: "#e2e8f0", border: "1px solid #334155", borderRadius: 4, padding: "2px 4px", fontSize: 12, textAlign: "center" }} />
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#94a3b8" }}>
                        Per fly
                        <input type="number" min={1} max={20} value={wordsPerFly}
                            onChange={e => setWordsPerFly(Math.max(1, Math.min(20, Number(e.target.value))))}
                            style={{ width: 36, background: "#1e293b", color: "#e2e8f0", border: "1px solid #334155", borderRadius: 4, padding: "2px 4px", fontSize: 12, textAlign: "center" }} />
                    </label>
                    <div style={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
                        {SPEED_OPTIONS.map((s, i) => (
                            <button key={s.label} onClick={() => setSpeedIdx(i)}
                                style={{ padding: "2px 6px", fontSize: 10, borderRadius: 4, cursor: "pointer", border: "none",
                                    background: speedIdx === i ? "#6366f1" : "#1e293b", color: speedIdx === i ? "#fff" : "#94a3b8" }}>
                                {s.label}
                            </button>
                        ))}
                        {/* Extra format shortcuts — fill the empty space after the speed buttons */}
                        <div style={{ width: 6 }} />
                        {fmtBtn("H1", "Heading 1", () => editorRef.current?.chain().focus().toggleHeading({ level: 1 }).run())}
                        {fmtBtn("H2", "Heading 2", () => editorRef.current?.chain().focus().toggleHeading({ level: 2 }).run())}
                        {fmtBtn("H3", "Heading 3", () => editorRef.current?.chain().focus().toggleHeading({ level: 3 }).run())}
                    </div>
                </div>

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

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {playState === "idle" || playState === "done" ? (
                        <>
                            <button onClick={handleStart}
                                style={{ flex: 1, padding: "7px 10px", borderRadius: 6, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12, background: "#6366f1", color: "#fff" }}>
                                {playState === "done" ? "Restart" : "Start Playing"}
                            </button>
                            {playState === "done" && (
                                <button onClick={handleStop}
                                    style={{ padding: "7px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12, background: "#374151", color: "#9ca3af" }}>
                                    Stop
                                </button>
                            )}
                        </>
                    ) : (
                        <>
                            <button onClick={handlePauseResume}
                                style={{ flex: 1, padding: "7px 10px", borderRadius: 6, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12,
                                    background: playState === "paused" ? "#22c55e" : "#f59e0b", color: "#fff" }}>
                                {playState === "paused" ? "Resume" : "Pause"}
                            </button>
                            {playState === "ready-next" && (
                                <button onClick={handleNext}
                                    style={{ flex: 1, padding: "7px 10px", borderRadius: 6, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12, background: "#3b82f6", color: "#fff" }}>
                                    Next
                                </button>
                            )}
                            <button onClick={handleStop}
                                style={{ padding: "7px 10px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, background: "#374151", color: "#9ca3af" }}>
                                Stop
                            </button>
                        </>
                    )}
                </div>

                {playState === "done" && (
                    <div style={{ fontSize: 11, color: "#22c55e", textAlign: "center" }}>All text displayed</div>
                )}
            </div>
        </div>
    );
}
