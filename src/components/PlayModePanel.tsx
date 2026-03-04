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
    const [fontFamily,   setFontFamily]   = useState("Inter, sans-serif");
    const [fontSize,     setFontSize]     = useState(20);
    const [fontStyle,    setFontStyle]    = useState<FontStyle>("bold");
    const [color,        setColor]        = useState("#ffffff");
    const [wordsPerLine, setWordsPerLine] = useState(5);
    const [wordsPerFly,  setWordsPerFly]  = useState(1);
    const [speedIdx,     setSpeedIdx]     = useState(1);
    const [animType,     setAnimType]     = useState<AnimType>("typing");
    const [playState,       setPlayState]       = useState<PlayState>("idle");
    const [currentGroupIdx, setCurrentGroupIdx] = useState(0);
    const [totalGroups,     setTotalGroups]     = useState(0);

    const editorRef      = useRef<HTMLTextAreaElement>(null);
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
    const speedRef            = useRef(speedIdx);         speedRef.current       = speedIdx;
    const animTypeRef         = useRef(animType);         animTypeRef.current    = animType;
    const wordsPerLineRef     = useRef(wordsPerLine);     wordsPerLineRef.current = wordsPerLine;
    const wordsPerFlyRef      = useRef(wordsPerFly);      wordsPerFlyRef.current  = wordsPerFly;
    const onPlayFrameRef      = useRef(onPlayFrame);      onPlayFrameRef.current  = onPlayFrame;
    const onPlayCommitRef     = useRef(onPlayCommit);     onPlayCommitRef.current = onPlayCommit;
    const onPlayReplaceRef    = useRef(onPlayReplaceLine); onPlayReplaceRef.current = onPlayReplaceLine;
    const isBlackboardOnRef   = useRef(isBlackboardOn);  isBlackboardOnRef.current = isBlackboardOn;

    // ── helpers ──────────────────────────────────────────────────────────────
    const makeBaseSeg = useCallback((text: string, lineY: number): DrawSeg => ({
        x1: anchorRef.current?.cx ?? 0.02,
        y1: lineY,
        x2: anchorRef.current?.cx ?? 0.02,
        y2: lineY,
        color: colorRef.current,
        size: 1,
        mode: "text",
        text,
        fontFamily: fontFamilyRef.current,
        fontSizePx: fontSizeRef.current,
        fontStyle:  fontStyleRef.current,
    }), []);

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
    const activeBtn = (on: boolean) => ({
        borderRadius: 6 as const,
        border: `1px solid ${on ? "rgba(99,102,241,0.6)" : "rgba(255,255,255,0.08)"}`,
        background: on ? "rgba(99,102,241,0.35)" : "transparent",
        color: (on ? "#a5b4fc" : "var(--text-muted, #64748b)") as string,
        cursor: "pointer" as const,
        transition: "all 0.15s",
    });

    const isActive = playState !== "idle";
    const progress = totalGroups > 0 ? `${Math.min(currentGroupIdx + 1, totalGroups)} / ${totalGroups}` : "";

    const ANIM_OPTIONS: { id: AnimType; label: string }[] = [
        { id: "typing",       label: "Type" },
        { id: "fade",         label: "Fade" },
        { id: "slide-right",  label: "→" },
        { id: "slide-left",   label: "←" },
        { id: "slide-bottom", label: "↑" },
        { id: "scale",        label: "Scale" },
    ];

    return (
        <div style={{ display: "flex", height: "100%", background: "#111827", color: "#e2e8f0", fontSize: 13, overflow: "hidden" }}>

            {/* Left: Text Options panel */}
            <div style={{
                width: 148, flexShrink: 0, borderRight: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(10,10,20,0.92)", backdropFilter: "blur(10px)",
                padding: "10px 10px", display: "flex", flexDirection: "column", gap: 10,
                overflowY: "auto",
            }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(163,163,163,0.7)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Text Options</div>

                {/* Style */}
                <div>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>Style</div>
                    <div style={{ display: "flex", gap: 4 }}>
                        {(["normal", "bold", "italic", "bold italic"] as const).map(fs => (
                            <button key={fs} onClick={() => setFontStyle(fs)} title={fs}
                                style={{ flex: 1, height: 28, fontSize: 12,
                                    fontWeight: fs.includes("bold") ? 700 : 400,
                                    fontStyle: fs.includes("italic") ? "italic" : "normal",
                                    ...activeBtn(fontStyle === fs) }}>
                                {fs === "normal" ? "N" : fs === "bold" ? "B" : fs === "italic" ? "I" : "BI"}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Size */}
                <div>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>Size</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 3 }}>
                        {SIZE_LIST.map(sz => (
                            <button key={sz} onClick={() => setFontSize(sz)}
                                style={{ height: 26, fontSize: 10, fontWeight: 600, ...activeBtn(fontSize === sz) }}>
                                {sz}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Font */}
                <div>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>Font</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        {FONT_LIST.map(({ label, value }) => (
                            <button key={value} onClick={() => setFontFamily(value)}
                                style={{ height: 26, fontFamily: value, fontSize: 11,
                                    textAlign: "left", paddingLeft: 8, ...activeBtn(fontFamily === value) }}>
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Color */}
                <div>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>Color</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 5, justifyItems: "center" }}>
                        {DRAW_COLORS.map(c => (
                            <button key={c} onClick={() => setColor(c)}
                                style={{ width: 20, height: 20, borderRadius: "50%",
                                    border: `2px solid ${color === c ? "#fff" : "transparent"}`,
                                    background: c, cursor: "pointer", padding: 0,
                                    boxShadow: color === c ? `0 0 0 1px ${c}` : "none",
                                    transition: "border-color 0.15s" }} />
                        ))}
                    </div>
                    <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 5 }}>
                        <input type="color" value={color} onChange={e => setColor(e.target.value)}
                            style={{ width: 22, height: 22, border: "none", background: "none", cursor: "pointer", padding: 0, flexShrink: 0 }} />
                        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontFamily: "monospace" }}>{color}</span>
                    </div>
                </div>
            </div>

            {/* Right: textarea + controls */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
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

                {/* Controls */}
                <div style={{ padding: "8px 10px", borderTop: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>

                    {/* Animation type */}
                    <div>
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>Animation</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 3 }}>
                            {ANIM_OPTIONS.map(({ id, label }) => (
                                <button key={id} onClick={() => setAnimType(id)}
                                    style={{ height: 24, fontSize: 10, fontWeight: 600, ...activeBtn(animType === id) }}>
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

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
        </div>
    );
}
