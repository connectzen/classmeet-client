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
        if (st.fontFamily) cur.fontFamily  = st.fontFamily.replace(/['"]*/g, '').trim();
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

    const defaults = { color: '#ffffff', fontFamily: 'Inter, sans-serif', fontSizePx: 20, fontStyle: 'normal' as FontStyle, underline: false };

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
    accumulated: string;
    prevAccumulated: string;
    lineY: number;
    isFirstOnLine: boolean;
    prevTextWidth: number;
    newWords: string;
    // resolved style for this fly group (from first word in the group)
    color: string;
    fontFamily: string;
    fontSizePx: number;
    fontStyle: FontStyle;
    underline: boolean;
    blockIdx: number; // which "block" of N lines this group belongs to
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

    const plan: GroupPlan[] = [];
    let lineY         = anchorCy;
    let lineWordCount = 0;
    let lineAccum     = "";
    let lineXOffset   = 0; // running x offset in canvas-fraction units, measured per fly's own style
    let prevTextLine  = styledWords[0].textLine;
    let i             = 0;
    let lineLeadingPx = styledWords[0].fontSizePx;
    let canvasLineIdx = 0; // how many canvas lines have been started (each lineWordCount reset = new line)
    let blockIdx      = 0;

    while (i < styledWords.length) {
        if (styledWords[i].textLine !== prevTextLine) {
            if (lineWordCount > 0) {
                lineY += (lineLeadingPx * 1.4) / Math.max(1, canvasH);
                lineWordCount = 0;
                lineAccum = "";
                lineXOffset = 0;
                lineLeadingPx = styledWords[i].fontSizePx;
                canvasLineIdx++;
                blockIdx = Math.floor(canvasLineIdx / Math.max(1, linesPerBlock));
            }
            prevTextLine = styledWords[i].textLine;
        }

        const remaining = wordsPerLine - lineWordCount;
        const maxTake   = Math.min(wordsPerFly, remaining);
        const curLine   = styledWords[i].textLine;
        let take = 0;
        while (take < maxTake && i + take < styledWords.length && styledWords[i + take].textLine === curLine)
            take++;
        if (take === 0) break;

        // Trim fly to the first style-homogeneous run so every word in a fly has
        // identical styling. This prevents the first word's color/font overriding
        // subsequent words that have different styles (e.g. red "will" + white "be").
        const s0 = styledWords[i];
        let homogTake = 1;
        while (
            homogTake < take &&
            styledWords[i + homogTake].color      === s0.color &&
            styledWords[i + homogTake].fontFamily === s0.fontFamily &&
            styledWords[i + homogTake].fontSizePx === s0.fontSizePx &&
            styledWords[i + homogTake].fontStyle  === s0.fontStyle &&
            styledWords[i + homogTake].underline  === s0.underline
        ) homogTake++;
        take = homogTake;

        const flySlice = styledWords.slice(i, i + take);
        i += take;

        const { color, fontFamily, fontSizePx, fontStyle, underline } = flySlice[0];
        lineLeadingPx = Math.max(lineLeadingPx, fontSizePx);

        const isFirstOnLine = lineWordCount === 0;
        const prevAccum     = lineAccum;
        const flyText       = flySlice.map(w => w.word).join(" ");
        lineAccum           = lineAccum ? lineAccum + " " + flyText : flyText;
        lineWordCount      += take;

        // Use running offset so each fly's position accounts for the actual rendered
        // width of all previous flies (which may have different bold/font/size).
        // The space *before* this fly is measured in this fly's own font and included
        // in the start position, so words never bunch together or overlap.
        const spaceMeasured = isFirstOnLine ? 0 : measureWidth(" ", fontStyle, fontSizePx, fontFamily);
        const prevTextWidth = lineXOffset + spaceMeasured; // where this fly starts
        const flyMeasured   = measureWidth(flyText, fontStyle, fontSizePx, fontFamily);
        lineXOffset = prevTextWidth + flyMeasured; // where the next fly will start (before its space)

        plan.push({
            accumulated: lineAccum, prevAccumulated: prevAccum,
            lineY, isFirstOnLine, prevTextWidth, newWords: flyText,
            color, fontFamily, fontSizePx, fontStyle, underline, blockIdx,
        });

        if (lineWordCount >= wordsPerLine) {
            lineY += (lineLeadingPx * 1.4) / Math.max(1, canvasH);
            lineWordCount = 0;
            lineAccum = "";
            lineXOffset = 0;
            lineLeadingPx = i < styledWords.length ? styledWords[i].fontSizePx : fontSizePx;
            canvasLineIdx++;
            blockIdx = Math.floor(canvasLineIdx / Math.max(1, linesPerBlock));
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
        const { accumulated, lineY, isFirstOnLine, prevTextWidth, newWords,
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
            // Auto-advance if the next group is in the same block; pause between blocks
            const plan = groupPlanRef.current;
            const nextIdx = idx + 1;
            if (nextIdx >= plan.length) {
                setPlayState("done");
            } else if (plan[nextIdx].blockIdx === plan[idx].blockIdx) {
                // same block → auto-advance without requiring Next click
                setTimeout(() => animateGroup(nextIdx), 80);
            } else {
                // block boundary → pause and wait for Next
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

    const isActive = playState !== "idle";
    const progress = totalGroups > 0 ? `${Math.min(currentGroupIdx + 1, totalGroups)} / ${totalGroups}` : "";

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#111827", color: "#e2e8f0", fontSize: 13, overflow: "hidden" }}>

            {/* Rich editor — replaces the old textarea + custom toolbar */}
            <div style={{ flex: 1, overflow: "auto", pointerEvents: isActive ? "none" : "auto", opacity: isActive ? 0.5 : 1 }}>
                <RichEditor
                    value={editorHtml}
                    onChange={setEditorHtml}
                    placeholder="Type text here, then click Start Playing…"
                    minHeight={180}
                    disableImage
                    style={{ border: "none", borderRadius: 0, background: "transparent" }}
                />
            </div>

            {/* Animation controls bar */}
            <div style={{ display: "flex", gap: 4, padding: "5px 8px", borderTop: "1px solid rgba(255,255,255,0.07)", borderBottom: "1px solid rgba(255,255,255,0.07)", flexWrap: "nowrap", overflowX: "auto", alignItems: "center", background: "rgba(255,255,255,0.02)", flexShrink: 0 }}>
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
                    <div style={{ display: "flex", gap: 2 }}>
                        {SPEED_OPTIONS.map((s, i) => (
                            <button key={s.label} onClick={() => setSpeedIdx(i)}
                                style={{ padding: "2px 6px", fontSize: 10, borderRadius: 4, cursor: "pointer", border: "none",
                                    background: speedIdx === i ? "#6366f1" : "#1e293b", color: speedIdx === i ? "#fff" : "#94a3b8" }}>
                                {s.label}
                            </button>
                        ))}
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
                        <button onClick={handleStart}
                            style={{ flex: 1, padding: "7px 10px", borderRadius: 6, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12, background: "#6366f1", color: "#fff" }}>
                            {playState === "done" ? "Restart" : "Start Playing"}
                        </button>
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
