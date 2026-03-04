import { useCallback, useEffect, useRef, useState } from 'react';
import type { DrawSeg } from './RoomCoursePanel';

// ── Constants ─────────────────────────────────────────────────────────────────
const CANVAS_W = 640;
const SPEED_OPTIONS: { label: string; ms: number }[] = [
    { label: 'Slow',   ms: 80 },
    { label: 'Normal', ms: 35 },
    { label: 'Fast',   ms: 12 },
];
const FONT_FAMILIES = ['sans-serif', 'serif', 'monospace', 'Georgia', 'Arial', 'Verdana', 'Courier New'];
const FONT_SIZES    = [12, 16, 20, 24, 28, 32, 40];
const PRESET_COLORS = ['#ffffff', '#ffdd00', '#ff4444', '#44ff88', '#00ccff', '#ff9900', '#cc88ff'];

type PlayState = 'idle' | 'playing' | 'paused' | 'ready-next' | 'done';

interface Props {
    /** Last place teacher clicked with the text tool (normalised 0–1 coordinates) */
    anchor: { cx: number; cy: number } | null;
    /** Canvas height in canvas-pixels (from RoomCoursePanel via onCanvasHChange) */
    canvasH: number;
    /** Emit a live animation preview frame to teacher canvas + students */
    onPlayFrame: (seg: DrawSeg | null) => void;
    /** Commit a completed word group to teacher canvas + students */
    onPlayCommit: (seg: DrawSeg) => void;
    /** Auto-enable blackboard when Start Playing is clicked */
    onEnableBlackboard: () => void;
    /** Whether blackboard is currently on */
    isBlackboardOn: boolean;
}

export default function PlayModePanel({
    anchor, canvasH, onPlayFrame, onPlayCommit, onEnableBlackboard, isBlackboardOn,
}: Props) {
    // ── Editor style state ────────────────────────────────────────────────────
    const [fontFamily, setFontFamily]   = useState('sans-serif');
    const [fontSize,   setFontSize]     = useState(20);
    const [color,      setColor]        = useState('#ffffff');
    const editorRef = useRef<HTMLDivElement>(null);

    // ── Playback config ───────────────────────────────────────────────────────
    const [wordsPerStep, setWordsPerStep] = useState(3);
    const [speedIdx,     setSpeedIdx]     = useState(1); // Normal

    // ── Playback engine state ─────────────────────────────────────────────────
    const [playState,       setPlayState]       = useState<PlayState>('idle');
    const [currentGroupIdx, setCurrentGroupIdx] = useState(0);
    const [totalGroups,     setTotalGroups]     = useState(0);

    const wordGroupsRef    = useRef<string[][]>([]);
    const charBufRef       = useRef('');
    const intervalRef      = useRef<ReturnType<typeof setInterval> | null>(null);
    const lineYRef         = useRef(0); // normalised Y position on canvas
    const playStateRef     = useRef<PlayState>('idle');
    playStateRef.current   = playState;

    // Keep these in refs so the interval closure never goes stale
    const anchorRef        = useRef(anchor);
    anchorRef.current      = anchor;
    const canvasHRef       = useRef(canvasH);
    canvasHRef.current     = canvasH;
    const onPlayFrameRef   = useRef(onPlayFrame);
    onPlayFrameRef.current = onPlayFrame;
    const onPlayCommitRef  = useRef(onPlayCommit);
    onPlayCommitRef.current = onPlayCommit;
    const colorRef         = useRef(color);
    colorRef.current       = color;
    const fontFamilyRef    = useRef(fontFamily);
    fontFamilyRef.current  = fontFamily;
    const fontSizeRef      = useRef(fontSize);
    fontSizeRef.current    = fontSize;
    const speedRef         = useRef(speedIdx);
    speedRef.current       = speedIdx;

    // ── Helpers ───────────────────────────────────────────────────────────────
    const makeSeg = useCallback((text: string, lineY: number): DrawSeg => ({
        x1: anchorRef.current?.cx ?? 0.02,
        y1: lineY,
        x2: anchorRef.current?.cx ?? 0.02,
        y2: lineY,
        color: colorRef.current,
        size: 1,
        mode: 'text',
        text,
        fontFamily: fontFamilyRef.current,
        fontSizePx: fontSizeRef.current,
        fontStyle: 'bold',
    }), []);

    const stopInterval = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    }, []);

    const advanceLine = useCallback((lineY: number) => {
        const lineH = (fontSizeRef.current * 1.4) / Math.max(1, canvasHRef.current);
        return lineY + lineH;
    }, []);

    // ── Core animation function ───────────────────────────────────────────────
    const animateGroup = useCallback((groupIdx: number, lineY: number) => {
        stopInterval();
        const groups = wordGroupsRef.current;
        if (groupIdx >= groups.length) {
            setPlayState('done');
            onPlayFrameRef.current(null);
            return;
        }
        const target = groups[groupIdx].join(' ');
        charBufRef.current = '';
        lineYRef.current   = lineY;
        setCurrentGroupIdx(groupIdx);
        setPlayState('playing');

        intervalRef.current = setInterval(() => {
            if (playStateRef.current === 'paused') return;
            const next = charBufRef.current.length + 1;
            charBufRef.current = target.slice(0, next);
            // Emit live preview frame
            onPlayFrameRef.current(makeSeg(charBufRef.current, lineYRef.current));

            if (charBufRef.current.length >= target.length) {
                // Animation complete for this group — commit it
                stopInterval();
                onPlayCommitRef.current(makeSeg(target, lineYRef.current));
                charBufRef.current = '';
                if (groupIdx + 1 >= wordGroupsRef.current.length) {
                    setPlayState('done');
                } else {
                    setPlayState('ready-next');
                }
            }
        }, SPEED_OPTIONS[speedRef.current].ms);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stopInterval, makeSeg]);

    // ── Start Playing ─────────────────────────────────────────────────────────
    const handleStart = useCallback(() => {
        const raw = editorRef.current?.innerText?.trim() ?? '';
        if (!raw) return;

        // Auto-enable blackboard
        if (!isBlackboardOn) onEnableBlackboard();

        // Build word groups
        const words  = raw.split(/\s+/).filter(Boolean);
        const groups: string[][] = [];
        for (let i = 0; i < words.length; i += wordsPerStep) {
            groups.push(words.slice(i, i + wordsPerStep));
        }
        if (!groups.length) return;

        wordGroupsRef.current = groups;
        setTotalGroups(groups.length);

        const startY = anchorRef.current?.cy ?? 0.05;
        lineYRef.current = startY;

        animateGroup(0, startY);
    }, [isBlackboardOn, onEnableBlackboard, wordsPerStep, animateGroup]);

    // ── Next ──────────────────────────────────────────────────────────────────
    const handleNext = useCallback(() => {
        const nextIdx = currentGroupIdx + 1;
        const nextY   = advanceLine(lineYRef.current);
        lineYRef.current = nextY;
        animateGroup(nextIdx, nextY);
    }, [currentGroupIdx, advanceLine, animateGroup]);

    // ── Pause / Resume ────────────────────────────────────────────────────────
    const handlePauseResume = useCallback(() => {
        if (playState === 'paused') {
            setPlayState('playing');
        } else {
            setPlayState('paused');
        }
    }, [playState]);

    // ── Stop ──────────────────────────────────────────────────────────────────
    const handleStop = useCallback(() => {
        stopInterval();
        onPlayFrameRef.current(null);
        setPlayState('idle');
        setCurrentGroupIdx(0);
        setTotalGroups(0);
        charBufRef.current = '';
        wordGroupsRef.current = [];
    }, [stopInterval]);

    // Cleanup on unmount
    useEffect(() => () => stopInterval(), [stopInterval]);

    // ── Rich text editor commands ─────────────────────────────────────────────
    const exec = (cmd: string, val?: string) => {
        editorRef.current?.focus();
        document.execCommand(cmd, false, val);
    };

    // ── UI helpers ────────────────────────────────────────────────────────────
    const isActive = playState !== 'idle';
    const progress = totalGroups > 0
        ? `${Math.min(currentGroupIdx + 1, totalGroups)} / ${totalGroups}`
        : '';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#111827', color: '#e2e8f0', fontSize: 13, overflow: 'hidden' }}>

            {/* ── Rich Text Toolbar ──────────────────────────────────────────── */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', flexShrink: 0 }}>
                {/* Font family */}
                <select value={fontFamily} onChange={e => { setFontFamily(e.target.value); exec('fontName', e.target.value); }}
                    style={{ background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 4, fontSize: 11, padding: '2px 4px', cursor: 'pointer' }}>
                    {FONT_FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                {/* Font size */}
                <select value={fontSize} onChange={e => { const s = Number(e.target.value); setFontSize(s); exec('fontSize', '7'); /* then override via css */ }}
                    style={{ background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 4, fontSize: 11, padding: '2px 4px', cursor: 'pointer', width: 52 }}>
                    {FONT_SIZES.map(s => <option key={s} value={s}>{s}px</option>)}
                </select>
                {/* B / I / U */}
                {[['B', 'bold'], ['I', 'italic'], ['U', 'underline']].map(([label, cmd]) => (
                    <button key={cmd} onMouseDown={e => { e.preventDefault(); exec(cmd); }}
                        style={{ background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 4, fontWeight: label === 'B' ? 700 : 400, fontStyle: label === 'I' ? 'italic' : 'normal', textDecoration: label === 'U' ? 'underline' : 'none', padding: '2px 7px', cursor: 'pointer', fontSize: 12 }}>
                        {label}
                    </button>
                ))}
                {/* Color swatches */}
                <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                    {PRESET_COLORS.map(c => (
                        <button key={c} onMouseDown={e => { e.preventDefault(); setColor(c); exec('foreColor', c); }}
                            style={{ width: 16, height: 16, borderRadius: '50%', background: c, border: color === c ? '2px solid #818cf8' : '1px solid #334155', cursor: 'pointer', flexShrink: 0 }} />
                    ))}
                    <input type="color" value={color} onChange={e => { setColor(e.target.value); exec('foreColor', e.target.value); }}
                        style={{ width: 22, height: 22, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
                </div>
            </div>

            {/* ── Editor ────────────────────────────────────────────────────── */}
            <div
                ref={editorRef}
                contentEditable={!isActive}
                suppressContentEditableWarning
                style={{
                    flex: 1, padding: '10px 12px', overflowY: 'auto', outline: 'none',
                    fontFamily, fontSize, color, lineHeight: 1.6,
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    opacity: isActive ? 0.5 : 1,
                    caretColor: color,
                    minHeight: 80,
                }}
                onKeyDown={e => {
                    if (e.key === 'Tab') { e.preventDefault(); exec('insertText', '    '); }
                }}
            />

            {/* ── Controls ──────────────────────────────────────────────────── */}
            <div style={{ padding: '8px 10px', borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>

                {/* Words per step + Speed */}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#94a3b8' }}>
                        Words / step
                        <input type="number" min={1} max={20} value={wordsPerStep}
                            onChange={e => setWordsPerStep(Math.max(1, Math.min(20, Number(e.target.value))))}
                            style={{ width: 46, background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 4, padding: '2px 6px', fontSize: 12, textAlign: 'center' }} />
                    </label>
                    <div style={{ display: 'flex', gap: 3 }}>
                        {SPEED_OPTIONS.map((s, i) => (
                            <button key={s.label} onClick={() => setSpeedIdx(i)}
                                style={{ padding: '2px 8px', fontSize: 11, borderRadius: 4, cursor: 'pointer', border: 'none',
                                    background: speedIdx === i ? '#6366f1' : '#1e293b', color: speedIdx === i ? '#fff' : '#94a3b8' }}>
                                {s.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Anchor indicator */}
                <div style={{ fontSize: 10, color: anchor ? '#6366f1' : '#475569' }}>
                    {anchor
                        ? `✓ Anchor set (${Math.round(anchor.cx * CANVAS_W)}px, line ~${Math.round(anchor.cy * 100)}%)`
                        : '⚠ Click on blackboard with text tool to set start position'}
                </div>

                {/* Progress */}
                {totalGroups > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 4, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', background: '#6366f1', borderRadius: 2, width: `${(Math.min(currentGroupIdx + 1, totalGroups) / totalGroups) * 100}%`, transition: 'width 0.3s' }} />
                        </div>
                        <span style={{ fontSize: 10, color: '#94a3b8', whiteSpace: 'nowrap' }}>{progress}</span>
                    </div>
                )}

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {playState === 'idle' || playState === 'done' ? (
                        <button onClick={handleStart}
                            style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12,
                                background: '#6366f1', color: '#fff' }}>
                            ▶ {playState === 'done' ? 'Restart' : 'Start Playing'}
                        </button>
                    ) : (
                        <>
                            <button onClick={handlePauseResume}
                                style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12,
                                    background: playState === 'paused' ? '#22c55e' : '#f59e0b', color: '#fff' }}>
                                {playState === 'paused' ? '▶ Resume' : '⏸ Pause'}
                            </button>
                            {playState === 'ready-next' && (
                                <button onClick={handleNext}
                                    style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12,
                                        background: '#3b82f6', color: '#fff' }}>
                                    Next ›
                                </button>
                            )}
                            <button onClick={handleStop}
                                style={{ padding: '7px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12,
                                    background: '#374151', color: '#9ca3af' }}>
                                ✕
                            </button>
                        </>
                    )}
                </div>

                {playState === 'done' && (
                    <div style={{ textAlign: 'center', fontSize: 11, color: '#22c55e' }}>✓ All words completed</div>
                )}
            </div>
        </div>
    );
}
