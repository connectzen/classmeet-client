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

// ── GroupPlan: pre-computed animation schedule ────────────────────────────────
interface GroupPlan {
    accumulated: string;    // full text shown on this line up to and including this fly
    lineY: number;          // normalised Y coordinate for this line
    isFirstOnLine: boolean; // true = push new seg; false = replace-last seg
}

function buildGroupPlan(
    text: string,
    wordsPerFly: number,
    wordsPerLine: number,
    anchorCy: number,
    canvasH: number,
    fontSizePx: number,
): GroupPlan[] {
    const words = text.split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const lineH      = (fontSizePx * 1.4) / Math.max(1, canvasH);
    const plan: GroupPlan[] = [];
    let lineY        = anchorCy;
    let lineWordCount = 0;   // words consumed on current line so far
    let lineAccum     = "";  // accumulated text on current line

    for (let i = 0; i < words.length; i += wordsPerFly) {
        const flyWords   = words.slice(i, i + wordsPerFly);
        const flyCount   = flyWords.length;
        const isFirstOnLine = lineWordCount === 0;

        // Would adding these words overflow the line?
        if (!isFirstOnLine && lineWordCount + flyCount > wordsPerLine) {
            // Start a new line
            lineY        += lineH;
            lineWordCount = 0;
            lineAccum     = "";
        }

        lineAccum     = lineAccum ? lineAccum + " " + flyWords.join(" ") : flyWords.join(" ");
        lineWordCount += flyCount;
        plan.push({
            accumulated: lineAccum,
            lineY,
            isFirstOnLine: lineWordCount === flyCount && (lineAccum === flyWords.join(" ")),
        });

        // If the line is now full, the NEXT fly starts on a new line
        if (lineWordCount >= wordsPerLine) {
            lineY        += lineH;
            lineWordCount = 0;
            lineAccum     = "";
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

    const editorRef      = useRef<HTMLTextAreaElement>(null);
    const colorBtnRef    = useRef<HTMLButtonElement>(null);
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
    const makeBaseSeg = useCallback((text: string, lineY: number): DrawSeg => {
        const baseX = anchorRef.current?.cx ?? 0.02;
        const alignedX = textAlignRef.current === 'center' ? 0.5
                       : textAlignRef.current === 'right'  ? 0.9
                       : baseX;
        return {
        x1: alignedX,
        y1: lineY,
        x2: alignedX,
        y2: lineY,
        color: colorRef.current,
        size: 1,
        mode: "text",
        text,
        fontFamily: fontFamilyRef.current,
        fontSizePx: fontSizeRef.current,
        fontStyle:  fontStyleRef.current,
        };
    }, []);

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
        const { accumulated, lineY, isFirstOnLine } = plan[idx];
        setCurrentGroupIdx(idx);
        setPlayState("playing");

        const commit = (seg: DrawSeg) => {
            if (isFirstOnLine) {
                onPlayCommitRef.current(seg);
            } else {
                onPlayReplaceRef.current(seg);
            }
        };

        const anim = animTypeRef.current;

        if (anim === "typing") {
            charBufRef.current = "";
            intervalRef.current = setInterval(() => {
                if (playStateRef.current === "paused") return;
                const next = charBufRef.current.length + 1;
                charBufRef.current = accumulated.slice(0, next);
                onPlayFrameRef.current(makeBaseSeg(charBufRef.current, lineY));
                if (charBufRef.current.length >= accumulated.length) {
                    stopInterval();
                    // show nothing on preview; commit the full text
                    onPlayFrameRef.current(null);
                    commit(makeBaseSeg(accumulated, lineY));
                    charBufRef.current = "";
                    setPlayState(idx + 1 >= groupPlanRef.current.length ? "done" : "ready-next");
                }
            }, SPEED_OPTIONS[speedRef.current].ms);
        } else {
            // Frame-based animations: 20 frames
            const FRAMES = 20;
            frameRef.current = 0;
            const ax = anchorRef.current?.cx ?? 0.02;
            const targetFontSize = fontSizeRef.current;
            const ms = Math.max(10, SPEED_OPTIONS[speedRef.current].ms * 1.5);

            intervalRef.current = setInterval(() => {
                if (playStateRef.current === "paused") return;
                frameRef.current += 1;
                const raw = frameRef.current / FRAMES;
                const progress = Math.min(1, 1 - Math.pow(1 - raw, 2)); // ease-out

                const seg = makeBaseSeg(accumulated, lineY);

                if (anim === "fade") {
                    seg.opacity = progress;
                } else if (anim === "slide-right") {
                    seg.x1 = seg.x2 = ax + 0.35 * (1 - progress);
                } else if (anim === "slide-left") {
                    seg.x1 = seg.x2 = ax - 0.35 * (1 - progress);
                } else if (anim === "slide-bottom") {
                    seg.y1 = seg.y2 = lineY + (0.15 * Math.max(1, canvasHRef.current) / 100) * (1 - progress);
                } else if (anim === "scale") {
                    seg.fontSizePx = Math.max(1, Math.round(targetFontSize * (0.05 + 0.95 * progress)));
                }

                if (frameRef.current >= FRAMES) {
                    stopInterval();
                    onPlayFrameRef.current(null);
                    commit(makeBaseSeg(accumulated, lineY));
                    setPlayState(idx + 1 >= groupPlanRef.current.length ? "done" : "ready-next");
                } else {
                    onPlayFrameRef.current(seg);
                }
            }, ms);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stopInterval, makeBaseSeg]);

    const handleStart = useCallback(() => {
        const ta = editorRef.current;
        if (!ta) return;
        const raw = ta.value.slice(cursorPosRef.current).trim();
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
    const divider = <div style={{ width: 1, background: "rgba(255,255,255,0.1)", margin: "2px 1px", alignSelf: "stretch" as const }} />;

    const isActive = playState !== "idle";
    const progress = totalGroups > 0 ? `${Math.min(currentGroupIdx + 1, totalGroups)} / ${totalGroups}` : "";

    const COLOR_PRESETS = [
        "#000000","#374151","#6b7280","#9ca3af","#d1d5db","#ffffff",
        "#dc2626","#ef4444","#f97316","#f59e0b","#facc15","#84cc16",
        "#16a34a","#22c55e","#14b8a6","#06b6d4","#3b82f6","#2563eb",
        "#6366f1","#8b5cf6","#a78bfa","#ec4899","#f472b6","#a5b4fc",
    ];

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#111827", color: "#e2e8f0", fontSize: 13, overflow: "hidden" }}>

            {/* ── Horizontal toolbar (RichEditor-style) ── */}
            <div style={{ display: "flex", gap: 3, padding: "5px 8px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexWrap: "nowrap", overflowX: "auto", alignItems: "center", background: "rgba(255,255,255,0.02)", flexShrink: 0 }}>

                {/* Heading/style dropdown */}
                <select value={fontStyle}
                    onChange={e => setFontStyle(e.target.value as FontStyle)}
                    style={{ padding: "3px 6px", borderRadius: 5, border: "none", background: "rgba(255,255,255,0.07)", color: "#94a3b8", fontSize: 12, cursor: "pointer", colorScheme: "dark" }}>
                    <option value="normal">Normal</option>
                    <option value="bold">Bold</option>
                    <option value="italic">Italic</option>
                    <option value="bold italic">Bold Italic</option>
                </select>

                {/* Font family */}
                <select value={fontFamily} onChange={e => setFontFamily(e.target.value)}
                    style={{ padding: "3px 6px", borderRadius: 5, border: "none", background: "rgba(255,255,255,0.07)", color: "#94a3b8", fontSize: 12, cursor: "pointer", colorScheme: "dark", maxWidth: 90 }}>
                    {FONT_LIST.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>

                {/* Font size */}
                <select value={fontSize} onChange={e => setFontSize(Number(e.target.value))}
                    style={{ padding: "3px 4px", borderRadius: 5, border: "none", background: "rgba(255,255,255,0.07)", color: "#94a3b8", fontSize: 12, cursor: "pointer", colorScheme: "dark", width: 54 }}>
                    {SIZE_LIST.map(sz => <option key={sz} value={sz}>{sz}</option>)}
                </select>

                {divider}

                {/* B / I / U */}
                <button style={tbBtn(fontStyle.includes("bold"), { fontWeight: 900 })} onClick={() => setFontStyle(s => s.includes("bold") ? (s.includes("italic") ? "italic" : "normal") : (s.includes("italic") ? "bold italic" : "bold"))} title="Bold">B</button>
                <button style={tbBtn(fontStyle.includes("italic"), { fontStyle: "italic" })} onClick={() => setFontStyle(s => s.includes("italic") ? (s.includes("bold") ? "bold" : "normal") : (s.includes("bold") ? "bold italic" : "italic"))} title="Italic">I</button>

                {/* Color picker */}
                <div style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
                    <button ref={colorBtnRef} title="Text color"
                        onMouseDown={e => {
                            e.preventDefault();
                            if (!showColorPicker && colorBtnRef.current) {
                                const r = colorBtnRef.current.getBoundingClientRect();
                                setColorPickerPos({ top: r.bottom + 4, left: r.left });
                            }
                            setShowColorPicker(v => !v);
                        }}
                        style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 7px", borderRadius: 5, background: showColorPicker ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.07)", cursor: "pointer", border: "none", userSelect: "none" }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8", borderBottom: `3px solid ${color}`, paddingBottom: 1, lineHeight: 1 }}>A</span>
                        <span style={{ fontSize: 11, color: "#64748b" }}>▾</span>
                    </button>
                    {showColorPicker && (
                        <>
                            <div style={{ position: "fixed", inset: 0, zIndex: 9998 }} onMouseDown={e => { e.preventDefault(); setShowColorPicker(false); }} />
                            <div style={{ position: "fixed", top: colorPickerPos.top, left: colorPickerPos.left, zIndex: 9999, background: "#1a1a2e", border: "1px solid rgba(99,102,241,0.35)", borderRadius: 10, padding: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.6)", minWidth: 158, maxHeight: 260, overflowY: "auto" }}>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 5, marginBottom: 8 }}>
                                    {COLOR_PRESETS.map(c => (
                                        <button key={c} title={c}
                                            onMouseDown={e => { e.preventDefault(); setColor(c); setShowColorPicker(false); }}
                                            style={{ width: 22, height: 22, borderRadius: 5, background: c, border: color === c ? "2px solid #fff" : "2px solid rgba(255,255,255,0.15)", cursor: "pointer", padding: 0 }} />
                                    ))}
                                </div>
                                <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
                                    <span style={{ fontSize: 11, color: "#64748b" }}>Custom</span>
                                    <input type="color" value={color} onChange={e => setColor(e.target.value)}
                                        style={{ width: 32, height: 22, padding: 0, border: "1px solid rgba(255,255,255,0.15)", borderRadius: 4, cursor: "pointer", background: "none" }} />
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {divider}

                {/* Alignment */}
                <select value={textAlign} onChange={e => setTextAlign(e.target.value as "left" | "center" | "right")}
                    style={{ padding: "3px 5px", borderRadius: 5, border: "none", background: "rgba(255,255,255,0.07)", color: "#94a3b8", fontSize: 12, cursor: "pointer", colorScheme: "dark" }}>
                    <option value="left">← Left</option>
                    <option value="center">≡ Center</option>
                    <option value="right">→ Right</option>
                </select>

                {divider}

                {/* Animation type */}
                <select value={animType} onChange={e => setAnimType(e.target.value as AnimType)}
                    style={{ padding: "3px 5px", borderRadius: 5, border: "none", background: "rgba(255,255,255,0.07)", color: "#94a3b8", fontSize: 12, cursor: "pointer", colorScheme: "dark" }}>
                    <option value="typing">Type</option>
                    <option value="fade">Fade</option>
                    <option value="slide-right">Slide →</option>
                    <option value="slide-left">Slide ←</option>
                    <option value="slide-bottom">Slide ↑</option>
                    <option value="scale">Scale</option>
                </select>
            </div>

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
                onBlur={e => { cursorPosRef.current = e.currentTarget.selectionStart; }}
                onMouseUp={e => { cursorPosRef.current = e.currentTarget.selectionStart; }}
                onKeyUp={e => { cursorPosRef.current = (e.currentTarget as HTMLTextAreaElement).selectionStart; }}
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
