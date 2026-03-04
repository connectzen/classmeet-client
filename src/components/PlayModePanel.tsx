import { useCallback, useEffect, useRef, useState } from "react";
import type { DrawSeg } from "./RoomCoursePanel";

// ── Constants ─────────────────────────────────────────────────────────────────
const CANVAS_W = 640;
const SPEED_OPTIONS: { label: string; ms: number }[] = [
    { label: "Slow",   ms: 80 },
    { label: "Normal", ms: 35 },
    { label: "Fast",   ms: 12 },
];
const DRAW_COLORS = ["#ff4444", "#ff9900", "#ffdd00", "#44ff88", "#00ccff", "#ffffff"];
const FONT_LIST = [
    { label: "Sans",     value: "Inter, sans-serif" },
    { label: "Roboto",   value: "Roboto, sans-serif" },
    { label: "Poppins",  value: "Poppins, sans-serif" },
    { label: "Serif",    value: "Georgia, serif" },
    { label: "Playfair", value: "'Playfair Display', serif" },
    { label: "Mono",     value: "'Courier New', monospace" },
];
const SIZE_LIST = [12, 16, 20, 24, 28, 32, 40, 48, 56, 64, 72];

type FontStyle = "normal" | "bold" | "italic" | "bold italic";
type PlayState = "idle" | "playing" | "paused" | "ready-next" | "done";
type AnimType  = "typing" | "fade" | "slide-right" | "slide-left" | "slide-bottom" | "scale";

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

// ── Style range (per-selection highlight overrides) ─────────────────────────
interface StyleRange {
    start: number; end: number;
    color: string; fontFamily: string; fontSize: number; fontStyle: FontStyle;
}

// ── GroupPlan: pre-computed animation schedule ────────────────────────────────
interface GroupPlan {
    accumulated: string;     // full text shown on this line up to and including this fly
    prevAccumulated: string; // text already committed before this fly ("" for first on line)
    lineY: number;           // normalised Y coordinate for this line
    isFirstOnLine: boolean;  // true = push new seg; false = replace-last seg
    prevTextWidth: number;   // normalised (0-1) canvas-pixel width of prevAccumulated text
    newWords: string;        // only the new word(s) added this fly (for animation frames)
    // Per-fly resolved style (from annotation or global)
    segColor: string; segFontFamily: string; segFontSize: number; segFontStyle: FontStyle;
}

function buildGroupPlan(
    text: string,
    wordsPerFly: number,
    wordsPerLine: number,
    anchorCy: number,
    canvasH: number,
    fontSizePx: number,
    styleRanges: StyleRange[],
    globalStyle: { color: string; fontFamily: string; fontSize: number; fontStyle: FontStyle },
): GroupPlan[] {
    // Collect words with their char offset AND which textarea line they came from.
    // Textarea line boundaries are respected: words on a new note-line always start
    // a new blackboard line, regardless of how full the current line is.
    const wordInfos: Array<{ word: string; charStart: number; textLine: number }> = [];
    let charOffset = 0;
    text.split('\n').forEach((noteLine, lineIdx) => {
        const re = /\S+/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(noteLine)) !== null)
            wordInfos.push({ word: m[0], charStart: charOffset + m.index, textLine: lineIdx });
        charOffset += noteLine.length + 1; // +1 for the consumed '\n'
    });
    if (!wordInfos.length) return [];

    const getStyle = (charStart: number) => {
        const ann = styleRanges.find(r => charStart >= r.start && charStart < r.end);
        return ann ? { color: ann.color, fontFamily: ann.fontFamily, fontSize: ann.fontSize, fontStyle: ann.fontStyle } : globalStyle;
    };

    // Offscreen canvas for measuring rendered text widths
    const measCanvas = document.createElement('canvas');
    const measCtx = measCanvas.getContext('2d')!;
    const measureWidth = (str: string, style: typeof globalStyle) => {
        if (!str) return 0;
        measCtx.font = `${style.fontStyle} ${style.fontSize}px ${style.fontFamily}`;
        return measCtx.measureText(str).width / CANVAS_W; // normalised 0-1
    };

    const lineH = (fontSizePx * 1.4) / Math.max(1, canvasH);
    const plan: GroupPlan[] = [];
    let lineY         = anchorCy;
    let lineWordCount = 0;
    let lineAccum     = "";
    let prevTextLine  = wordInfos[0].textLine;
    let i             = 0;

    while (i < wordInfos.length) {
        // ── Textarea line break → force new blackboard line ──────────────────
        if (wordInfos[i].textLine !== prevTextLine) {
            if (lineWordCount > 0) {
                lineY += lineH;
                lineWordCount = 0;
                lineAccum = "";
            }
            prevTextLine = wordInfos[i].textLine;
        }

        // ── How many words does this fly take? ────────────────────────────────
        // Rule: fill the current line first. Never take more than the remaining
        // capacity of the current line, and never exceed wordsPerFly.
        // Also stop at the end of the current textarea line so notes lines map
        // 1-to-1 with blackboard lines.
        const remainingOnLine = wordsPerLine - lineWordCount;
        const maxTake = Math.min(wordsPerFly, remainingOnLine);
        const currentTextLine = wordInfos[i].textLine;
        let take = 0;
        while (
            take < maxTake &&
            i + take < wordInfos.length &&
            wordInfos[i + take].textLine === currentTextLine
        ) take++;
        if (take === 0) break; // safety — shouldn't happen

        const flySlice = wordInfos.slice(i, i + take);
        i += take;

        const style        = getStyle(flySlice[0].charStart);
        const isFirstOnLine = lineWordCount === 0;
        const prevAccum    = lineAccum;
        const flyText      = flySlice.map(w => w.word).join(" ");
        lineAccum          = lineAccum ? lineAccum + " " + flyText : flyText;
        lineWordCount     += take;

        // Width of already-committed text (+space) so animation starts right after it
        const prevTextWidth = prevAccum ? measureWidth(prevAccum + " ", style) : 0;

        plan.push({
            accumulated: lineAccum,
            prevAccumulated: prevAccum,
            lineY,
            isFirstOnLine,
            prevTextWidth,
            newWords: flyText,
            segColor: style.color,
            segFontFamily: style.fontFamily,
            segFontSize: style.fontSize,
            segFontStyle: style.fontStyle,
        });

        // Line full → advance to next blackboard line
        if (lineWordCount >= wordsPerLine) {
            lineY += lineH;
            lineWordCount = 0;
            lineAccum = "";
        }
    }
    return plan;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function PlayModePanel({
    anchor, canvasH, onPlayFrame, onPlayCommit, onPlayReplaceLine,
    onEnableBlackboard, isBlackboardOn, onEnableCourse,
}: Props) {
    const [fontFamily,      setFontFamily]      = useState("Inter, sans-serif");
    const [fontSize,        setFontSize]        = useState(20);
    const [fontStyle,       setFontStyle]       = useState<FontStyle>("bold");
    const [color,           setColor]           = useState("#ffffff");
    const [textAlign,       setTextAlign]       = useState<"left" | "center" | "right">("left");
    const [wordsPerLine,    setWordsPerLine]    = useState(5);
    const [wordsPerFly,     setWordsPerFly]     = useState(1);
    const [speedIdx,        setSpeedIdx]        = useState(1);
    const [animType,        setAnimType]        = useState<AnimType>("typing");
    const [playState,       setPlayState]       = useState<PlayState>("idle");
    const [currentGroupIdx, setCurrentGroupIdx] = useState(0);
    const [totalGroups,     setTotalGroups]     = useState(0);
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [colorPickerPos,  setColorPickerPos]  = useState({ top: 0, left: 0 });
    const [showFontPicker,  setShowFontPicker]  = useState(false);
    const [fontPickerPos,   setFontPickerPos]   = useState({ top: 0, left: 0 });
    const [styleRanges,     setStyleRanges]     = useState<StyleRange[]>([]);
    const [hasSelection,    setHasSelection]    = useState(false);

    const editorRef      = useRef<HTMLTextAreaElement>(null);
    const colorBtnRef    = useRef<HTMLButtonElement>(null);
    const fontBtnRef     = useRef<HTMLButtonElement>(null);
    const styleRangesRef = useRef<StyleRange[]>([]); styleRangesRef.current = styleRanges;
    // Persists textarea selection across focus loss (toolbar clicks clear the live selection)
    const savedSelRef = useRef<{ start: number; end: number } | null>(null);
    // Helper: update both savedSelRef and hasSelection state from a textarea element
    const updateSel = (ta: HTMLTextAreaElement) => {
        const s  = Math.min(ta.selectionStart, ta.selectionEnd);
        const en = Math.max(ta.selectionStart, ta.selectionEnd);
        const hasSel = s !== en;
        savedSelRef.current = hasSel ? { start: s, end: en } : null;
        setHasSelection(hasSel);
    };
    const cursorPosRef   = useRef(0);
    const groupPlanRef   = useRef<GroupPlan[]>([]);
    const charBufRef     = useRef("");
    const intervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);
    const frameRef       = useRef(0);
    const playStateRef   = useRef<PlayState>("idle");
    playStateRef.current = playState;

    // Stable refs for values used inside setInterval
    const anchorRef           = useRef(anchor);           anchorRef.current      = anchor;
    const canvasHRef          = useRef(canvasH);          canvasHRef.current     = canvasH;
    const colorRef            = useRef(color);            colorRef.current       = color;
    const fontFamilyRef       = useRef(fontFamily);       fontFamilyRef.current  = fontFamily;
    const fontSizeRef         = useRef(fontSize);         fontSizeRef.current    = fontSize;
    const fontStyleRef        = useRef(fontStyle);        fontStyleRef.current   = fontStyle;
    const textAlignRef        = useRef(textAlign);        textAlignRef.current   = textAlign;
    const speedRef            = useRef(speedIdx);         speedRef.current       = speedIdx;
    const animTypeRef         = useRef(animType);         animTypeRef.current    = animType;
    const wordsPerLineRef     = useRef(wordsPerLine);     wordsPerLineRef.current = wordsPerLine;
    const wordsPerFlyRef      = useRef(wordsPerFly);      wordsPerFlyRef.current  = wordsPerFly;
    const onPlayFrameRef      = useRef(onPlayFrame);      onPlayFrameRef.current  = onPlayFrame;
    const onPlayCommitRef     = useRef(onPlayCommit);     onPlayCommitRef.current = onPlayCommit;
    const onPlayReplaceRef    = useRef(onPlayReplaceLine); onPlayReplaceRef.current = onPlayReplaceLine;
    const isBlackboardOnRef   = useRef(isBlackboardOn);  isBlackboardOnRef.current = isBlackboardOn;

    // ── helpers ──────────────────────────────────────────────────────────────
    type SegStyle = { color: string; fontFamily: string; fontSize: number; fontStyle: FontStyle };
    const makeBaseSeg = useCallback((text: string, lineY: number, style?: SegStyle): DrawSeg => {
        const baseX = anchorRef.current?.cx ?? 0.02;
        const alignedX = textAlignRef.current === 'center' ? 0.5
                       : textAlignRef.current === 'right'  ? 0.9
                       : baseX;
        return {
            x1: alignedX, y1: lineY, x2: alignedX, y2: lineY,
            color:      style?.color      ?? colorRef.current,
            size: 1, mode: "text", text,
            fontFamily: style?.fontFamily ?? fontFamilyRef.current,
            fontSizePx: style?.fontSize   ?? fontSizeRef.current,
            fontStyle:  style?.fontStyle  ?? fontStyleRef.current,
        };
    }, []);

    // Helper: returns saved textarea selection (persists after focus loss), or null
    const getSelection = () => {
        const s = savedSelRef.current;
        if (!s || s.start === s.end) return null;
        return s;
    };

    // Apply style to selected range, or update global if no selection
    const applyStyle = (patch: Partial<SegStyle>) => {
        const sel = getSelection();
        if (sel) {
            const base: SegStyle = { color: colorRef.current, fontFamily: fontFamilyRef.current, fontSize: fontSizeRef.current, fontStyle: fontStyleRef.current };
            setStyleRanges(prev => {
                // Remove ranges fully inside sel, trim overlapping ones, then add new
                const filtered = prev
                    .map(r => {
                        if (r.end <= sel.start || r.start >= sel.end) return r; // no overlap
                        // split: keep parts outside sel
                        return null; // fully or partially covered → drop (simplest approach)
                    })
                    .filter(Boolean) as StyleRange[];
                return [...filtered, { ...base, ...patch, start: sel.start, end: sel.end }];
            });
            // Don't clear savedSelRef so user can apply multiple styles to same selection
        } else {
            if (patch.color      !== undefined) setColor(patch.color);
            if (patch.fontFamily !== undefined) setFontFamily(patch.fontFamily);
            if (patch.fontSize   !== undefined) setFontSize(patch.fontSize);
            if (patch.fontStyle  !== undefined) setFontStyle(patch.fontStyle);
        }
    };

    const stopInterval = useCallback(() => {
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    }, []);

    // ── animate one group plan entry ─────────────────────────────────────────
    const animateGroup = useCallback((idx: number) => {
        stopInterval();
        const plan = groupPlanRef.current;
        if (idx >= plan.length) {
            setPlayState("done");
            onPlayFrameRef.current(null);
            return;
        }
        const { accumulated, prevAccumulated, lineY, isFirstOnLine,
                prevTextWidth, newWords,
                segColor, segFontFamily, segFontSize, segFontStyle } = plan[idx];
        setCurrentGroupIdx(idx);
        setPlayState("playing");

        const style: SegStyle = { color: segColor, fontFamily: segFontFamily, fontSize: segFontSize, fontStyle: segFontStyle };
        const ax = anchorRef.current?.cx ?? 0.02;

        // For !isFirstOnLine flies we animate ONLY the new word(s), positioned
        // right after the already-committed word on the main canvas. This avoids
        // double-drawing: the committed word stays untouched while only the new
        // word(s) appear on the preview canvas next to it.
        // animX  = where the new word(s) start (anchor + committed-text width)
        // animText = just the new word(s) (not the full accumulated string)
        const animX    = isFirstOnLine ? ax : ax + prevTextWidth;
        const animText = isFirstOnLine ? accumulated : newWords;

        // Build a preview seg for animation frames (new words only, offset X)
        const makeAnimSeg = (text: string): DrawSeg => {
            const seg = makeBaseSeg(text, lineY, style);
            seg.x1 = animX;
            seg.x2 = animX;
            return seg;
        };

        // All animation frames go to the preview canvas.
        // finalCommit: clear preview, then either push new (isFirstOnLine) or
        // replace-last with full accumulated text (!isFirstOnLine).
        const emit = (seg: DrawSeg) => onPlayFrameRef.current(seg);

        const finalCommit = (seg: DrawSeg) => {
            onPlayFrameRef.current(null);   // clear preview canvas
            if (isFirstOnLine) {
                onPlayCommitRef.current(seg);      // push brand-new full-line seg
            } else {
                onPlayReplaceRef.current(seg);     // swap old committed → full accumulated
            }
        };

        void prevAccumulated; // used only via prevTextWidth / newWords

        const anim = animTypeRef.current;

        if (anim === "typing") {
            // Type only the new word(s) character by character, at the offset position.
            charBufRef.current = "";
            intervalRef.current = setInterval(() => {
                if (playStateRef.current === "paused") return;
                charBufRef.current = animText.slice(0, charBufRef.current.length + 1);
                emit(makeAnimSeg(charBufRef.current));
                if (charBufRef.current.length >= animText.length) {
                    stopInterval();
                    finalCommit(makeBaseSeg(accumulated, lineY, style));
                    charBufRef.current = "";
                    setPlayState(idx + 1 >= groupPlanRef.current.length ? "done" : "ready-next");
                }
            }, SPEED_OPTIONS[speedRef.current].ms);
        } else {
            // Frame-based animations: 20 frames — animate only the new word(s) at offset X
            const FRAMES = 20;
            frameRef.current = 0;
            const ms = Math.max(10, SPEED_OPTIONS[speedRef.current].ms * 1.5);

            intervalRef.current = setInterval(() => {
                if (playStateRef.current === "paused") return;
                frameRef.current += 1;
                const progress = Math.min(1, 1 - Math.pow(1 - frameRef.current / FRAMES, 2));
                const seg = makeAnimSeg(animText);

                if (anim === "fade") {
                    seg.opacity = progress;
                } else if (anim === "slide-right") {
                    seg.x1 = seg.x2 = animX + 0.35 * (1 - progress);
                } else if (anim === "slide-left") {
                    seg.x1 = seg.x2 = animX - 0.35 * (1 - progress);
                } else if (anim === "slide-bottom") {
                    seg.y1 = seg.y2 = lineY + (0.15 * Math.max(1, canvasHRef.current) / 100) * (1 - progress);
                } else if (anim === "scale") {
                    seg.fontSizePx = Math.max(1, Math.round(segFontSize * (0.05 + 0.95 * progress)));
                }

                if (frameRef.current >= FRAMES) {
                    stopInterval();
                    finalCommit(makeBaseSeg(accumulated, lineY, style));
                    setPlayState(idx + 1 >= groupPlanRef.current.length ? "done" : "ready-next");
                } else {
                    emit(seg);
                }
            }, ms);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stopInterval, makeBaseSeg]);

    const handleStart = useCallback(() => {
        const ta = editorRef.current;
        if (!ta) return;
        // Always play the full textarea content; cursor tracking is only used
        // for continuing after a Restart, not to skip text on first Start.
        const raw = ta.value.trim();
        if (!raw) return;
        if (onEnableCourse) onEnableCourse();
        if (!isBlackboardOnRef.current) onEnableBlackboard();
        const plan = buildGroupPlan(
            raw,
            wordsPerFlyRef.current,
            wordsPerLineRef.current,
            anchorRef.current?.cy ?? 0.05,
            canvasHRef.current,
            fontSizeRef.current,
            styleRangesRef.current,
            { color: colorRef.current, fontFamily: fontFamilyRef.current, fontSize: fontSizeRef.current, fontStyle: fontStyleRef.current },
        );
        if (!plan.length) return;
        groupPlanRef.current = plan;
        setTotalGroups(plan.length);
        animateGroup(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onEnableBlackboard, onEnableCourse, animateGroup]);

    const handleNext = useCallback(() => {
        animateGroup(currentGroupIdx + 1);
    }, [currentGroupIdx, animateGroup]);

    const handlePauseResume = useCallback(() => {
        setPlayState(p => p === "paused" ? "playing" : "paused");
    }, []);

    const handleStop = useCallback(() => {
        stopInterval();
        onPlayFrameRef.current(null);
        setPlayState("idle"); setCurrentGroupIdx(0); setTotalGroups(0);
        charBufRef.current = ""; groupPlanRef.current = [];
    }, [stopInterval]);

    useEffect(() => () => stopInterval(), [stopInterval]);

    // ── UI helpers ───────────────────────────────────────────────────────────
    const tbBtn = (active: boolean, extra?: React.CSSProperties) => ({
        padding: "3px 8px", borderRadius: 5, border: "none" as const,
        background: active ? "#6366f1" : "rgba(255,255,255,0.07)",
        color: active ? "#fff" : "#94a3b8",
        fontSize: 13, fontWeight: 700, cursor: "pointer" as const,
        boxShadow: active ? "0 0 0 1px rgba(99,102,241,0.6)" : "none",
        ...extra,
    });

    const isActive = playState !== "idle";
    const progress = totalGroups > 0 ? `${Math.min(currentGroupIdx + 1, totalGroups)} / ${totalGroups}` : "";
    // Controls that require a selection are dimmed + inert when nothing is highlighted
    const selRequired = hasSelection
        ? {}
        : { opacity: 0.3, pointerEvents: "none" as const, cursor: "not-allowed" as const };

    const COLOR_PRESETS = [
        "#000000","#374151","#6b7280","#9ca3af","#d1d5db","#ffffff",
        "#dc2626","#ef4444","#f97316","#f59e0b","#facc15","#84cc16",
        "#16a34a","#22c55e","#14b8a6","#06b6d4","#3b82f6","#2563eb",
        "#6366f1","#8b5cf6","#a78bfa","#ec4899","#f472b6","#a5b4fc",
    ];

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#111827", color: "#e2e8f0", fontSize: 13, overflow: "hidden" }}>

            {/* ── Horizontal toolbar (compact, fits narrow panel) ── */}
            <div style={{ display: "flex", gap: 2, padding: "4px 6px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexWrap: "nowrap", overflowX: "hidden", alignItems: "center", background: "rgba(255,255,255,0.02)", flexShrink: 0 }}>

                {/* Font family — shows first letter in button, full name in dropdown */}
                <div style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
                    <button ref={fontBtnRef} title="Font family"
                        onMouseDown={e => {
                            e.preventDefault();
                            if (!showFontPicker && fontBtnRef.current) {
                                const r = fontBtnRef.current.getBoundingClientRect();
                                setFontPickerPos({ top: r.bottom + 4, left: r.left });
                            }
                            setShowFontPicker(v => !v);
                        }}
                        style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: "2px 5px", borderRadius: 5, background: showFontPicker ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.07)", cursor: "pointer", border: "none", userSelect: "none", color: "#94a3b8", fontSize: 11, fontWeight: 600 }}>
                        <span>{(FONT_LIST.find(f => f.value === fontFamily)?.label ?? "S")[0]}</span>
                        <span style={{ fontSize: 10, color: "#64748b" }}>▾</span>
                    </button>
                    {showFontPicker && (
                        <>
                            <div style={{ position: "fixed", inset: 0, zIndex: 9998 }} onMouseDown={e => { e.preventDefault(); setShowFontPicker(false); }} />
                            <div style={{ position: "fixed", top: fontPickerPos.top, left: fontPickerPos.left, zIndex: 9999, background: "#1e293b", border: "1px solid rgba(99,102,241,0.35)", borderRadius: 8, padding: "4px 0", boxShadow: "0 8px 32px rgba(0,0,0,0.6)", minWidth: 110 }}>
                                {FONT_LIST.map(f => (
                                    <button key={f.value}
                                        onMouseDown={e => { e.preventDefault(); applyStyle({ fontFamily: f.value }); setShowFontPicker(false); }}
                                        style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 12px", background: fontFamily === f.value ? "rgba(99,102,241,0.25)" : "transparent", color: fontFamily === f.value ? "#a5b4fc" : "#94a3b8", border: "none", cursor: "pointer", fontSize: 12, fontFamily: f.value }}>
                                        {f.label}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* Font size — requires selection */}
                <div style={selRequired} title={hasSelection ? "Font size" : "Highlight text first"}>
                <select value={fontSize} onChange={e => applyStyle({ fontSize: Number(e.target.value) })}
                    style={{ padding: "2px 2px", borderRadius: 5, border: "1px solid rgba(255,255,255,0.1)", background: "#1e293b", color: "#94a3b8", fontSize: 11, cursor: "pointer", colorScheme: "dark", width: 40, minWidth: 40 }}>
                    {SIZE_LIST.map(sz => <option key={sz} value={sz}>{sz}</option>)}
                </select>
                </div>

                {/* B / I toggles — require selection */}
                <div style={{ display: "inline-flex", gap: 2, ...selRequired }} title={hasSelection ? undefined : "Highlight text first"}>
                <button style={tbBtn(fontStyle.includes("bold"), { fontWeight: 900, minWidth: 22, padding: "2px 4px" })} onMouseDown={e => e.preventDefault()} onClick={() => { const next: FontStyle = fontStyle.includes("bold") ? (fontStyle.includes("italic") ? "italic" : "normal") : (fontStyle.includes("italic") ? "bold italic" : "bold"); applyStyle({ fontStyle: next }); }} title="Bold">B</button>
                <button style={tbBtn(fontStyle.includes("italic"), { fontStyle: "italic", minWidth: 22, padding: "2px 4px" })} onMouseDown={e => e.preventDefault()} onClick={() => { const next: FontStyle = fontStyle.includes("italic") ? (fontStyle.includes("bold") ? "bold" : "normal") : (fontStyle.includes("bold") ? "bold italic" : "italic"); applyStyle({ fontStyle: next }); }} title="Italic">I</button>
                </div>

                {/* Color picker — requires selection */}
                <div style={{ position: "relative", display: "inline-flex", flexShrink: 0, ...selRequired }} title={hasSelection ? "Text color" : "Highlight text first"}>
                    <button ref={colorBtnRef} title="Text color"
                        onMouseDown={e => {
                            e.preventDefault();
                            if (!showColorPicker && colorBtnRef.current) {
                                const r = colorBtnRef.current.getBoundingClientRect();
                                setColorPickerPos({ top: r.bottom + 4, left: r.left });
                            }
                            setShowColorPicker(v => !v);
                        }}
                        style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: "2px 5px", borderRadius: 5, background: showColorPicker ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.07)", cursor: "pointer", border: "none", userSelect: "none" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", borderBottom: `3px solid ${color}`, paddingBottom: 1, lineHeight: 1 }}>A</span>
                        <span style={{ fontSize: 10, color: "#64748b" }}>▾</span>
                    </button>
                    {showColorPicker && (
                        <>
                            <div style={{ position: "fixed", inset: 0, zIndex: 9998 }} onMouseDown={e => { e.preventDefault(); setShowColorPicker(false); }} />
                            <div style={{ position: "fixed", top: colorPickerPos.top, left: colorPickerPos.left, zIndex: 9999, background: "#1a1a2e", border: "1px solid rgba(99,102,241,0.35)", borderRadius: 10, padding: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.6)", minWidth: 158, maxHeight: 260, overflowY: "auto" }}>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 5, marginBottom: 8 }}>
                                    {COLOR_PRESETS.map(c => (
                                        <button key={c} title={c}
                                            onMouseDown={e => { e.preventDefault(); applyStyle({ color: c }); setShowColorPicker(false); }}
                                            style={{ width: 22, height: 22, borderRadius: 5, background: c, border: color === c ? "2px solid #fff" : "2px solid rgba(255,255,255,0.15)", cursor: "pointer", padding: 0 }} />
                                    ))}
                                </div>
                                <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
                                    <span style={{ fontSize: 11, color: "#64748b" }}>Custom</span>
                                    <input type="color" value={color} onChange={e => applyStyle({ color: e.target.value })}
                                        style={{ width: 32, height: 22, padding: 0, border: "1px solid rgba(255,255,255,0.15)", borderRadius: 4, cursor: "pointer", background: "none" }} />
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Alignment */}
                <select value={textAlign} onChange={e => setTextAlign(e.target.value as "left" | "center" | "right")}
                    style={{ padding: "2px 2px", borderRadius: 5, border: "1px solid rgba(255,255,255,0.1)", background: "#1e293b", color: "#94a3b8", fontSize: 11, cursor: "pointer", colorScheme: "dark", width: 38, minWidth: 38 }}>
                    <option value="left">←</option>
                    <option value="center">≡</option>
                    <option value="right">→</option>
                </select>

                {/* Animation type */}
                <select value={animType} onChange={e => setAnimType(e.target.value as AnimType)}
                    style={{ padding: "2px 2px", borderRadius: 5, border: "1px solid rgba(255,255,255,0.1)", background: "#1e293b", color: "#94a3b8", fontSize: 11, cursor: "pointer", colorScheme: "dark", width: 52, minWidth: 52 }}>
                    <option value="typing">Type</option>
                    <option value="fade">Fade</option>
                    <option value="slide-right">Slide →</option>
                    <option value="slide-left">Slide ←</option>
                    <option value="slide-bottom">Slide ↑</option>
                    <option value="scale">Scale</option>
                </select>
            </div>

            {/* ── Selection hint ── */}
            {!hasSelection && (
                <div style={{ padding: "3px 8px", fontSize: 10, color: "#475569", background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.04)", flexShrink: 0, textAlign: "center" }}>
                    Highlight text to change size, style &amp; color
                </div>
            )}

            {/* ── Textarea ── */}
            <textarea
                ref={editorRef}
                disabled={isActive}
                placeholder="Type text here, then click Start Playing..."
                style={{
                    flex: 1, padding: "10px 12px", resize: "none", outline: "none",
                    background: "transparent", color, border: "none",
                    fontFamily, fontSize, lineHeight: 1.6,
                    fontStyle: fontStyle.includes("italic") ? "italic" : "normal",
                    fontWeight: fontStyle.includes("bold") ? 700 : 400,
                    textAlign,
                    whiteSpace: "pre-wrap", wordBreak: "break-word",
                    opacity: isActive ? 0.5 : 1, caretColor: color,
                }}
                onKeyDown={e => {
                    if (e.key === "Tab") {
                        e.preventDefault();
                        const t = e.currentTarget; const s = t.selectionStart;
                        t.value = t.value.slice(0, s) + "    " + t.value.slice(t.selectionEnd);
                        t.selectionStart = t.selectionEnd = s + 4;
                    }
                }}
                onBlur={e => {
                    cursorPosRef.current = e.currentTarget.selectionStart;
                    // Keep hasSelection true after blur so toolbar click can still use it
                }}
                onSelect={e => { updateSel(e.currentTarget); }}
                onChange={e => {
                    savedSelRef.current = null;
                    setHasSelection(false);
                    // also update cursor
                    cursorPosRef.current = e.currentTarget.selectionStart;
                }}
                onMouseUp={e => { cursorPosRef.current = e.currentTarget.selectionStart; updateSel(e.currentTarget); }}
                onKeyUp={e => { cursorPosRef.current = (e.currentTarget as HTMLTextAreaElement).selectionStart; updateSel(e.currentTarget as HTMLTextAreaElement); }}
            />

            {/* ── Bottom controls ── */}
            <div style={{ padding: "8px 10px", borderTop: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", display: "flex", flexDirection: "column", gap: 7, flexShrink: 0 }}>

                {/* Words Per Line / Words Per Fly + Speed */}
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#94a3b8" }}>
                        Per line
                        <input type="number" min={1} max={30} value={wordsPerLine}
                            onChange={e => setWordsPerLine(Math.max(1, Math.min(30, Number(e.target.value))))}
                            style={{ width: 40, background: "#1e293b", color: "#e2e8f0", border: "1px solid #334155", borderRadius: 4, padding: "2px 4px", fontSize: 12, textAlign: "center" }} />
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#94a3b8" }}>
                        Per fly
                        <input type="number" min={1} max={20} value={wordsPerFly}
                            onChange={e => setWordsPerFly(Math.max(1, Math.min(20, Number(e.target.value))))}
                            style={{ width: 40, background: "#1e293b", color: "#e2e8f0", border: "1px solid #334155", borderRadius: 4, padding: "2px 4px", fontSize: 12, textAlign: "center" }} />
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
                    <div style={{ fontSize: 11, color: "#22c55e", textAlign: "center" }}>✓ All text displayed</div>
                )}
            </div>
        </div>
    );
}
