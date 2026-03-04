import { useCallback, useEffect, useRef, useState } from "react";
import type { DrawSeg } from "./RoomCoursePanel";

// ── Constants - mirror RoomCoursePanel exactly ────────────────────────────────
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

interface Props {
    anchor: { cx: number; cy: number } | null;
    canvasH: number;
    onPlayFrame: (seg: DrawSeg | null) => void;
    onPlayCommit: (seg: DrawSeg) => void;
    onEnableBlackboard: () => void;
    isBlackboardOn: boolean;
    onEnableCourse?: () => void;
}

export default function PlayModePanel({
    anchor, canvasH, onPlayFrame, onPlayCommit, onEnableBlackboard, isBlackboardOn, onEnableCourse,
}: Props) {
    const [fontFamily,  setFontFamily]  = useState("Inter, sans-serif");
    const [fontSize,    setFontSize]    = useState(20);
    const [fontStyle,   setFontStyle]   = useState<FontStyle>("bold");
    const [color,       setColor]       = useState("#ffffff");
    const [wordsPerStep, setWordsPerStep] = useState(3);
    const [speedIdx,     setSpeedIdx]     = useState(1);
    const [playState,       setPlayState]       = useState<PlayState>("idle");
    const [currentGroupIdx, setCurrentGroupIdx] = useState(0);
    const [totalGroups,     setTotalGroups]     = useState(0);

    const editorRef       = useRef<HTMLTextAreaElement>(null);
    const cursorPosRef    = useRef(0); // saved on blur so button-click doesn't reset it
    const wordGroupsRef = useRef<string[][]>([]);
    const charBufRef    = useRef("");
    const intervalRef   = useRef<ReturnType<typeof setInterval> | null>(null);
    const lineYRef      = useRef(0);
    const playStateRef  = useRef<PlayState>("idle");
    playStateRef.current = playState;

    const anchorRef      = useRef(anchor);     anchorRef.current     = anchor;
    const canvasHRef     = useRef(canvasH);    canvasHRef.current    = canvasH;
    const colorRef       = useRef(color);      colorRef.current      = color;
    const fontFamilyRef  = useRef(fontFamily); fontFamilyRef.current = fontFamily;
    const fontSizeRef    = useRef(fontSize);   fontSizeRef.current   = fontSize;
    const fontStyleRef   = useRef(fontStyle);  fontStyleRef.current  = fontStyle;
    const speedRef       = useRef(speedIdx);   speedRef.current      = speedIdx;
    const onPlayFrameRef  = useRef(onPlayFrame);  onPlayFrameRef.current  = onPlayFrame;
    const onPlayCommitRef = useRef(onPlayCommit); onPlayCommitRef.current = onPlayCommit;

    const makeSeg = useCallback((text: string, lineY: number): DrawSeg => ({
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
        fontStyle: fontStyleRef.current,
    }), []);

    const stopInterval = useCallback(() => {
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    }, []);

    const advanceLine = useCallback((lineY: number) => {
        const lineH = (fontSizeRef.current * 1.4) / Math.max(1, canvasHRef.current);
        return lineY + lineH;
    }, []);

    const animateGroup = useCallback((groupIdx: number, lineY: number) => {
        stopInterval();
        const groups = wordGroupsRef.current;
        if (groupIdx >= groups.length) { setPlayState("done"); onPlayFrameRef.current(null); return; }
        const target = groups[groupIdx].join(" ");
        charBufRef.current = "";
        lineYRef.current   = lineY;
        setCurrentGroupIdx(groupIdx);
        setPlayState("playing");
        intervalRef.current = setInterval(() => {
            if (playStateRef.current === "paused") return;
            const next = charBufRef.current.length + 1;
            charBufRef.current = target.slice(0, next);
            onPlayFrameRef.current(makeSeg(charBufRef.current, lineYRef.current));
            if (charBufRef.current.length >= target.length) {
                stopInterval();
                onPlayCommitRef.current(makeSeg(target, lineYRef.current));
                charBufRef.current = "";
                setPlayState(groupIdx + 1 >= wordGroupsRef.current.length ? "done" : "ready-next");
            }
        }, SPEED_OPTIONS[speedRef.current].ms);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stopInterval, makeSeg]);

    const handleStart = useCallback(() => {
        const ta = editorRef.current;
        if (!ta) return;
        // Use saved cursor position (textarea loses focus when button is clicked)
        const cursorPos = cursorPosRef.current;
        const raw = ta.value.slice(cursorPos).trim();
        if (!raw) return;
        if (onEnableCourse) onEnableCourse();
        if (!isBlackboardOn) onEnableBlackboard();
        const words  = raw.split(/\s+/).filter(Boolean);
        const groups: string[][] = [];
        for (let i = 0; i < words.length; i += wordsPerStep) groups.push(words.slice(i, i + wordsPerStep));
        if (!groups.length) return;
        wordGroupsRef.current = groups;
        setTotalGroups(groups.length);
        const startY = anchorRef.current?.cy ?? 0.05;
        lineYRef.current = startY;
        animateGroup(0, startY);
    }, [isBlackboardOn, onEnableBlackboard, onEnableCourse, wordsPerStep, animateGroup]);

    const handleNext = useCallback(() => {
        const nextIdx = currentGroupIdx + 1;
        const nextY   = advanceLine(lineYRef.current);
        lineYRef.current = nextY;
        animateGroup(nextIdx, nextY);
    }, [currentGroupIdx, advanceLine, animateGroup]);

    const handlePauseResume = useCallback(() => {
        setPlayState(p => p === "paused" ? "playing" : "paused");
    }, []);

    const handleStop = useCallback(() => {
        stopInterval();
        onPlayFrameRef.current(null);
        setPlayState("idle"); setCurrentGroupIdx(0); setTotalGroups(0);
        charBufRef.current = ""; wordGroupsRef.current = [];
    }, [stopInterval]);

    useEffect(() => () => stopInterval(), [stopInterval]);

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
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#94a3b8" }}>
                            Words / step
                            <input type="number" min={1} max={20} value={wordsPerStep}
                                onChange={e => setWordsPerStep(Math.max(1, Math.min(20, Number(e.target.value))))}
                                style={{ width: 46, background: "#1e293b", color: "#e2e8f0", border: "1px solid #334155", borderRadius: 4, padding: "2px 6px", fontSize: 12, textAlign: "center" }} />
                        </label>
                        <div style={{ display: "flex", gap: 3 }}>
                            {SPEED_OPTIONS.map((s, i) => (
                                <button key={s.label} onClick={() => setSpeedIdx(i)}
                                    style={{ padding: "2px 8px", fontSize: 11, borderRadius: 4, cursor: "pointer", border: "none",
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
                        <div style={{ textAlign: "center", fontSize: 11, color: "#22c55e" }}>All words completed</div>
                    )}
                </div>
            </div>
        </div>
    );
}
