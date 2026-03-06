import { useState, useRef, useEffect } from 'react';
import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { Extension, NodeViewProps } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TiptapImage from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import TextAlign from '@tiptap/extension-text-align';
import DOMPurify from 'dompurify';

// ── Google Fonts (loaded once globally) ──────────────────────────────────────
const GFONTS = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Roboto:wght@400;700&family=Poppins:wght@400;700&family=Lato:wght@400;700&family=Merriweather:wght@400;700&family=Playfair+Display:wght@400;700&display=swap');`;
let fontsInjected = false;
function ensureFonts() {
    if (fontsInjected) return;
    const s = document.createElement('style');
    s.textContent = GFONTS;
    document.head.appendChild(s);
    fontsInjected = true;
}

// ── Custom Tiptap extensions ──────────────────────────────────────────────────
const FontSizeExtension = Extension.create({
    name: 'fontSize',
    addOptions() { return { types: ['textStyle'] }; },
    addGlobalAttributes() {
        return [{
            types: ['textStyle'],
            attributes: {
                fontSize: {
                    default: null,
                    parseHTML: el => el.style.fontSize?.replace(/['"]+/g, '') || null,
                    renderHTML: attrs => attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {},
                },
            },
        }];
    },
});

const FontFamilyExtension = Extension.create({
    name: 'fontFamily',
    addOptions() { return { types: ['textStyle'] }; },
    addGlobalAttributes() {
        return [{
            types: ['textStyle'],
            attributes: {
                fontFamily: {
                    default: null,
                    parseHTML: el => el.style.fontFamily?.replace(/['"]+/g, '') || null,
                    renderHTML: attrs => attrs.fontFamily ? { style: `font-family: ${attrs.fontFamily}` } : {},
                },
            },
        }];
    },
});

// ── Constants ─────────────────────────────────────────────────────────────────
const FONTS = [
    { label: 'Default',          value: '' },
    { label: 'Inter',            value: 'Inter, sans-serif' },
    { label: 'Roboto',           value: 'Roboto, sans-serif' },
    { label: 'Poppins',          value: 'Poppins, sans-serif' },
    { label: 'Lato',             value: 'Lato, sans-serif' },
    { label: 'Georgia',          value: 'Georgia, serif' },
    { label: 'Playfair Display', value: "'Playfair Display', serif" },
    { label: 'Merriweather',     value: 'Merriweather, serif' },
    { label: 'Courier New',      value: "'Courier New', monospace" },
];

const SIZES = ['11', '12', '14', '16', '18', '20', '24', '28', '32', '36', '42', '48', '60', '72'];

// ── Helper ────────────────────────────────────────────────────────────────────
const SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

// ── Resizable image node view ───────────────────────────────────────────────────────
function ResizableImageView({ node, updateAttributes, selected, deleteNode }: NodeViewProps) {
    const imgRef = useRef<HTMLImageElement>(null);
    const isResizing = useRef(false);
    const startX = useRef(0);
    const startW = useRef(0);

    const onCornerMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        isResizing.current = true;
        startX.current = e.clientX;
        startW.current = imgRef.current?.offsetWidth ?? 300;

        const onMove = (ev: MouseEvent) => {
            if (!isResizing.current) return;
            const newW = Math.max(60, startW.current + ev.clientX - startX.current);
            if (imgRef.current) imgRef.current.style.width = newW + 'px';
        };
        const onUp = (ev: MouseEvent) => {
            if (!isResizing.current) return;
            isResizing.current = false;
            const newW = Math.max(60, startW.current + ev.clientX - startX.current);
            updateAttributes({ width: newW + 'px' });
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };

    const handleDelete = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const src = node.attrs.src as string;
        if (src && src.includes('/api/storage/')) {
            try {
                await fetch(`${SERVER}/api/upload-file`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: src }),
                });
            } catch { /* ignore */ }
        }
        deleteNode();
    };

    const align = (node.attrs.textAlign as string) || 'left';

    return (
        <NodeViewWrapper
            draggable
            data-drag-handle
            style={{ display: 'block', cursor: selected ? 'grab' : 'default', lineHeight: 0 }}
        >
            {/* Alignment wrapper: centers the inner positioning container */}
            <div style={{ textAlign: align as React.CSSProperties['textAlign'], lineHeight: 0 }}>
                {/* Position context for delete btn + resize handle */}
                <div style={{ display: 'inline-block', position: 'relative', lineHeight: 0 }}>
                    <img
                        ref={imgRef}
                        src={node.attrs.src}
                        alt={node.attrs.alt || ''}
                        draggable={false}
                        style={{
                            width: node.attrs.width || 'auto',
                            maxWidth: '100%',
                            borderRadius: 6,
                            margin: '4px 0',
                            display: 'block',
                            outline: selected ? '2px solid #6366f1' : '2px solid transparent',
                            transition: 'outline-color 0.15s',
                            userSelect: 'none',
                        }}
                    />
                    {/* Delete button — top-right when selected */}
                    {selected && (
                        <button
                            title="Delete image"
                            onMouseDown={handleDelete}
                            style={{
                                position: 'absolute', top: 6, right: 20,
                                background: '#ef4444', border: 'none',
                                borderRadius: 5, color: '#fff',
                                cursor: 'pointer', fontSize: 11,
                                fontWeight: 700, padding: '2px 8px',
                                zIndex: 20, lineHeight: 1.6,
                                boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                            }}
                        >
                            🗑 Delete
                        </button>
                    )}
                    {/* Resize handle — bottom-right corner */}
                    <div
                        title="Drag to resize"
                        onMouseDown={onCornerMouseDown}
                        style={{
                            position: 'absolute', bottom: 2, right: 2,
                            width: 14, height: 14,
                            background: '#6366f1',
                            border: '2px solid #fff',
                            borderRadius: 3,
                            cursor: 'nwse-resize',
                            opacity: selected ? 1 : 0,
                            transition: 'opacity 0.15s',
                            zIndex: 10,
                        }}
                    />
                </div>
            </div>
        </NodeViewWrapper>
    );
}

// Extend TiptapImage to accept a width attribute and use the resizable view
const ResizableImage = TiptapImage.extend({
    draggable: true,
    addAttributes() {
        return {
            ...this.parent?.(),
            width: {
                default: null,
                parseHTML: el => (el as HTMLImageElement).getAttribute('width') || (el as HTMLImageElement).style.width || null,
                renderHTML: attrs => attrs.width ? { width: attrs.width, style: `width:${attrs.width}` } : {},
            },
        };
    },
    addNodeView() {
        return ReactNodeViewRenderer(ResizableImageView);
    },
});

export function isRichEmpty(html: string) {
    if (!html) return true;
    const stripped = html.replace(/<[^>]*>/g, '').trim();
    return stripped.length === 0;
}

export function stripHtml(html: string): string {
    if (!html) return '';
    try {
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        return (tmp.textContent || tmp.innerText || '').trim();
    } catch {
        return html.replace(/<[^>]*>/g, '').trim();
    }
}

// ── Toolbar button ────────────────────────────────────────────────────────────
function TBtn({ label, active, onClick, title, extraStyle }: {
    label: string; active?: boolean; onClick: () => void; title?: string; extraStyle?: React.CSSProperties;
}) {
    return (
        <button type="button" title={title} onMouseDown={e => { e.preventDefault(); onClick(); }}
            style={{
                padding: '3px 8px', borderRadius: 5, border: 'none',
                background: active ? '#6366f1' : 'rgba(255,255,255,0.07)',
                color: active ? '#fff' : '#94a3b8',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                boxShadow: active ? '0 0 0 1px rgba(99,102,241,0.6)' : 'none',
                ...extraStyle,
            }}>
            {label}
        </button>
    );
}

// ── Size dropdown ─────────────────────────────────────────────────────────────
function SizeDropdown({ editor }: { editor: ReturnType<typeof useEditor> }) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState({ top: 0, left: 0 });
    const btnRef = useRef<HTMLButtonElement>(null);
    const originalSizeRef = useRef<string>('');
    const currentPx = (editor?.getAttributes('textStyle') as { fontSize?: string }).fontSize || '';
    const current = currentPx.replace('px', '');

    function applySize(size: string) {
        if (size) editor?.chain().focus().setMark('textStyle', { fontSize: size + 'px' }).run();
        else editor?.chain().focus().setMark('textStyle', { fontSize: null }).run();
    }
    function onSelect(size: string) {
        applySize(size); setOpen(false);
    }
    function handleToggle(e: React.MouseEvent) {
        e.preventDefault();
        if (!open && btnRef.current) {
            const r = btnRef.current.getBoundingClientRect();
            setPos({ top: r.bottom + 4, left: r.left });
            // Capture current size so we can restore it on mouse-leave without confirming
            originalSizeRef.current = current;
        }
        setOpen(o => !o);
    }
    function handleSizeHover(size: string) {
        if (size) editor?.chain().setMark('textStyle', { fontSize: size + 'px' }).run();
        else editor?.chain().setMark('textStyle', { fontSize: null }).run();
    }
    function handleSizeLeave() {
        const orig = originalSizeRef.current;
        if (orig) editor?.chain().setMark('textStyle', { fontSize: orig + 'px' }).run();
        else editor?.chain().setMark('textStyle', { fontSize: null }).run();
    }

    return (
        <div style={{ position: 'relative' }}>
            {open && <div style={{ position: 'fixed', inset: 0, zIndex: 9000 }} onMouseDown={e => e.preventDefault()} onClick={() => { handleSizeLeave(); setOpen(false); }} />}
            <button ref={btnRef} type="button" onMouseDown={handleToggle}
                style={{ padding: '3px 8px', borderRadius: 5, border: 'none', background: open ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.07)', color: current ? '#a5b4fc' : '#94a3b8', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                {current || 'Size'} <span style={{ fontSize: 9, opacity: 0.6 }}>▾</span>
            </button>
            {open && (
                <div onWheel={e => e.stopPropagation()}
                    style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9001, background: '#1e2132', borderRadius: 8, border: '1px solid rgba(99,102,241,0.3)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)', minWidth: 72, padding: '4px 0', maxHeight: 280, overflowY: 'auto' }}>
                    <div
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => onSelect('')}
                        onMouseEnter={() => handleSizeHover('')}
                        onMouseLeave={handleSizeLeave}
                        style={{ padding: '5px 16px', cursor: 'pointer', fontSize: 12, color: !current ? '#a5b4fc' : '#64748b', fontWeight: !current ? 600 : 400 }}>Default</div>
                    {SIZES.map(size => (
                        <div key={size}
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => onSelect(size)}
                            onMouseEnter={() => handleSizeHover(size)}
                            onMouseLeave={handleSizeLeave}
                            style={{ padding: '5px 16px', cursor: 'pointer', fontSize: Number(size) > 18 ? 14 : 12, color: current === size ? '#a5b4fc' : '#94a3b8', fontWeight: current === size ? 700 : 400, background: current === size ? 'rgba(99,102,241,0.12)' : 'transparent', transition: 'background 0.1s' }}>
                            {size}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Font dropdown ─────────────────────────────────────────────────────────────
function FontDropdown({ editor }: { editor: ReturnType<typeof useEditor> }) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState({ top: 0, left: 0 });
    const btnRef = useRef<HTMLButtonElement>(null);
    const originalFontRef = useRef<string>('');
    const currentFont = (editor?.getAttributes('textStyle') as { fontFamily?: string }).fontFamily || '';
    const currentLabel = FONTS.find(f => f.value === currentFont)?.label || 'Font';

    function applyFont(fontFamily: string) {
        if (fontFamily) editor?.chain().focus().setMark('textStyle', { fontFamily }).run();
        else editor?.chain().focus().setMark('textStyle', { fontFamily: null }).run();
    }
    function onSelect(value: string) {
        applyFont(value); setOpen(false);
    }
    function handleToggle(e: React.MouseEvent) {
        e.preventDefault();
        if (!open && btnRef.current) {
            const r = btnRef.current.getBoundingClientRect();
            setPos({ top: r.bottom + 4, left: r.left });
            // Capture current font so we can restore it if user moves away without selecting
            originalFontRef.current = currentFont;
        }
        setOpen(o => !o);
    }
    function handleFontHover(fontFamily: string) {
        if (fontFamily) editor?.chain().setMark('textStyle', { fontFamily }).run();
        else editor?.chain().setMark('textStyle', { fontFamily: null }).run();
    }
    function handleFontLeave() {
        const orig = originalFontRef.current;
        if (orig) editor?.chain().setMark('textStyle', { fontFamily: orig }).run();
        else editor?.chain().setMark('textStyle', { fontFamily: null }).run();
    }

    return (
        <div style={{ position: 'relative' }}>
            {open && <div style={{ position: 'fixed', inset: 0, zIndex: 9000 }} onMouseDown={e => e.preventDefault()} onClick={() => { handleFontLeave(); setOpen(false); }} />}
            <button ref={btnRef} type="button" onMouseDown={handleToggle}
                style={{ padding: '3px 8px', borderRadius: 5, border: 'none', background: open ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.07)', color: currentFont ? '#a5b4fc' : '#94a3b8', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, maxWidth: 110 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentLabel}</span>
                <span style={{ fontSize: 9, opacity: 0.6, flexShrink: 0 }}>▾</span>
            </button>
            {open && (
                <div onWheel={e => e.stopPropagation()}
                    style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9001, background: '#1e2132', borderRadius: 8, border: '1px solid rgba(99,102,241,0.3)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)', minWidth: 190, padding: '4px 0', maxHeight: 300, overflowY: 'auto' }}>
                    {FONTS.map(font => (
                        <div key={font.value}
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => onSelect(font.value)}
                            onMouseEnter={() => handleFontHover(font.value)}
                            onMouseLeave={handleFontLeave}
                            style={{ padding: '8px 16px', cursor: 'pointer', fontFamily: font.value || 'inherit', fontSize: 13, color: currentFont === font.value ? '#a5b4fc' : '#e2e8f0', background: currentFont === font.value ? 'rgba(99,102,241,0.12)' : 'transparent', fontWeight: currentFont === font.value ? 600 : 400, transition: 'background 0.1s' }}>
                            {font.label}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Heading dropdown (custom, supports hover preview) ─────────────────────────
const HEADING_OPTIONS = [
    { label: 'Normal', value: '0', style: { fontSize: 12, fontWeight: 400 } },
    { label: 'H1',     value: '1', style: { fontSize: 15, fontWeight: 800 } },
    { label: 'H2',     value: '2', style: { fontSize: 13, fontWeight: 700 } },
    { label: 'H3',     value: '3', style: { fontSize: 12, fontWeight: 600 } },
];
function HeadingDropdown({ editor }: { editor: ReturnType<typeof useEditor> }) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState({ top: 0, left: 0 });
    const btnRef = useRef<HTMLButtonElement>(null);
    const originalLevelRef = useRef<string>('0');

    const headingLevel = editor?.isActive('heading', { level: 1 }) ? '1'
        : editor?.isActive('heading', { level: 2 }) ? '2'
        : editor?.isActive('heading', { level: 3 }) ? '3' : '0';
    const currentLabel = HEADING_OPTIONS.find(o => o.value === headingLevel)?.label || 'Normal';

    function applyHeading(v: string) {
        if (v === '0') editor?.chain().focus().setParagraph().run();
        else editor?.chain().focus().setHeading({ level: Number(v) as 1 | 2 | 3 }).run();
    }
    function previewHeading(v: string) {
        if (v === '0') editor?.chain().setParagraph().run();
        else editor?.chain().setHeading({ level: Number(v) as 1 | 2 | 3 }).run();
    }
    function handleToggle(e: React.MouseEvent) {
        e.preventDefault();
        if (!open && btnRef.current) {
            const r = btnRef.current.getBoundingClientRect();
            setPos({ top: r.bottom + 4, left: r.left });
            originalLevelRef.current = headingLevel;
        }
        setOpen(o => !o);
    }
    function handleSelect(v: string) { applyHeading(v); setOpen(false); }
    function handleHover(v: string) { previewHeading(v); }
    function handleLeave() { previewHeading(originalLevelRef.current); }

    return (
        <div style={{ position: 'relative' }}>
            {open && <div style={{ position: 'fixed', inset: 0, zIndex: 9000 }} onMouseDown={e => e.preventDefault()} onClick={() => { handleLeave(); setOpen(false); }} />}
            <button ref={btnRef} type="button" onMouseDown={handleToggle}
                style={{ padding: '3px 8px', borderRadius: 5, border: 'none', background: open ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.07)', color: headingLevel !== '0' ? '#a5b4fc' : '#94a3b8', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                {currentLabel} <span style={{ fontSize: 9, opacity: 0.6 }}>▾</span>
            </button>
            {open && (
                <div style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9001, background: '#1e2132', borderRadius: 8, border: '1px solid rgba(99,102,241,0.3)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)', minWidth: 100, padding: '4px 0' }}>
                    {HEADING_OPTIONS.map(opt => (
                        <div key={opt.value}
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => handleSelect(opt.value)}
                            onMouseEnter={() => handleHover(opt.value)}
                            onMouseLeave={handleLeave}
                            style={{ padding: '6px 16px', cursor: 'pointer', color: headingLevel === opt.value ? '#a5b4fc' : '#e2e8f0', background: headingLevel === opt.value ? 'rgba(99,102,241,0.12)' : 'transparent', transition: 'background 0.1s', ...opt.style }}>
                            {opt.label}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── RichEditor ────────────────────────────────────────────────────────────────
interface RichEditorProps {
    /** Initial / controlled HTML content */
    value?: string;
    onChange?: (html: string) => void;
    /** Called on blur with current HTML */
    onBlur?: (html: string) => void;
    /**
     * Called when user submits (Ctrl+Enter always; plain Enter when chatMode=true).
     * The editor clears itself automatically after calling this.
     */
    onSubmit?: (html: string) => void;
    placeholder?: string;
    minHeight?: number;
    maxHeight?: number;
    /** Hide font-family + font-size selectors (good for compact/chat use) */
    compact?: boolean;
    /**
     * Chat input mode — Enter sends (Shift+Enter = newline).
     * Automatically clears editor content after onSubmit fires.
     */
    chatMode?: boolean;
    autoFocus?: boolean;
    /** Extra styles on the outer wrapper */
    style?: React.CSSProperties;
    /** Extra styles on the editor content area */
    editorStyle?: React.CSSProperties;
    /** Hide the image upload button (e.g. title/description fields) */
    disableImage?: boolean;
    /** Called once the Tiptap editor instance is ready (or destroyed). */
    onEditorReady?: (editor: ReturnType<typeof useEditor>) => void;
    /** When true the formatting toolbar is not rendered (parent renders its own controls). */
    hideToolbar?: boolean;
}

const COLOR_PRESETS = [
    '#000000', '#374151', '#6b7280', '#9ca3af', '#d1d5db', '#ffffff',
    '#dc2626', '#ef4444', '#f97316', '#f59e0b', '#facc15', '#84cc16',
    '#16a34a', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#2563eb',
    '#6366f1', '#8b5cf6', '#a78bfa', '#ec4899', '#f472b6', '#a5b4fc',
];

export default function RichEditor({
    value = '',
    onChange,
    onBlur,
    onSubmit,
    placeholder = 'Write something…',
    minHeight = 110,
    maxHeight,
    compact = false,
    chatMode = false,
    autoFocus = false,
    disableImage = false,
    onEditorReady,
    hideToolbar = false,
    style,
    editorStyle,
}: RichEditorProps) {
    ensureFonts();
    const [, forceUpdate] = useState(0);
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [colorPickerPos, setColorPickerPos] = useState({ top: 0, left: 0 });
    const colorBtnRef = useRef<HTMLButtonElement>(null);
    const colorPickerRef = useRef<HTMLDivElement>(null);
    const imgInputRef = useRef<HTMLInputElement>(null);
    const originalColorRef = useRef<string>('');
    // Stable ref so the effect doesn't re-run just because caller passes a new lambda each render
    const onEditorReadyRef = useRef(onEditorReady);
    onEditorReadyRef.current = onEditorReady;

    const editor = useEditor({
        extensions: [
            StarterKit,
            Underline,
            ResizableImage,
            Link.configure({ openOnClick: false }),
            TextStyle,
            Color,
            FontSizeExtension,
            FontFamilyExtension,
            TextAlign.configure({ types: ['heading', 'paragraph', 'image'] }),
        ],
        content: value || '',
        autofocus: autoFocus,
        editorProps: {
            attributes: { class: 'rich-editor-content', 'data-placeholder': placeholder },
        },
        onUpdate: ({ editor }) => {
            onChange?.(editor.getHTML());
            forceUpdate(n => n + 1);
        },
        onSelectionUpdate: () => forceUpdate(n => n + 1),
        onBlur: ({ editor }) => onBlur?.(editor.getHTML()),
    });

    // Notify parent when editor is ready / changes
    useEffect(() => { onEditorReadyRef.current?.(editor); }, [editor]);

    const currentColor = (editor?.getAttributes('textStyle') as { color?: string }).color || '#a5b4fc';

    function handleBulletList() {
        if (!editor) return;
        if (editor.isActive('orderedList')) editor.chain().focus().toggleOrderedList().toggleBulletList().run();
        else editor.chain().focus().toggleBulletList().run();
    }
    function handleOrderedList() {
        if (!editor) return;
        if (editor.isActive('bulletList')) editor.chain().focus().toggleBulletList().toggleOrderedList().run();
        else editor.chain().focus().toggleOrderedList().run();
    }
    function handleBlockquote() {
        if (!editor) return;
        if (editor.isActive('bulletList') || editor.isActive('orderedList'))
            editor.chain().focus().liftListItem('listItem').toggleBlockquote().run();
        else editor.chain().focus().toggleBlockquote().run();
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (!editor) return;
        // Chat mode: Enter submits; Shift+Enter inserts newline (Tiptap default)
        if (chatMode && e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const html = editor.getHTML();
            if (!isRichEmpty(html)) {
                onSubmit?.(html);
                editor.commands.clearContent();
            }
        }
        // Non-chat: Ctrl/Cmd+Enter submits
        if (!chatMode && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            const html = editor.getHTML();
            if (!isRichEmpty(html)) onSubmit?.(html);
        }
    }

    const divider = <div style={{ width: 1, background: 'rgba(255,255,255,0.1)', margin: '2px 1px', alignSelf: 'stretch' }} />;

    return (
        <div style={{ border: '1px solid rgba(99,102,241,0.3)', borderRadius: 8, overflow: 'hidden', background: 'rgba(0,0,0,0.2)', ...style }}>
            <style>{`
                .rich-editor-content { min-height: ${minHeight}px; ${maxHeight ? `max-height:${maxHeight}px; overflow-y:auto;` : ''} outline: none; padding: 10px 14px; color: #e2e8f0; font-size: 14px; line-height: 1.7; }
                .rich-editor-content p { margin: 0 0 6px; }
                .rich-editor-content p:last-child { margin-bottom: 0; }
                .rich-editor-content p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: #475569; pointer-events: none; height: 0; float: left; }
                .rich-editor-content ul { list-style-type: disc; padding-left: 22px; margin: 0 0 6px; }
                .rich-editor-content ol { list-style-type: decimal; padding-left: 22px; margin: 0 0 6px; }
                .rich-editor-content ul li::marker { color: #a5b4fc; font-size: 1.1em; }
                .rich-editor-content ol li::marker { color: #a5b4fc; font-weight: 700; }
                .rich-editor-content blockquote { border-left: 3px solid #6366f1; padding-left: 12px; color: #94a3b8; margin: 0 0 6px; font-style: italic; }
                .rich-editor-content strong { color: inherit; }
                .rich-editor-content em { color: inherit; }
                .rich-editor-content u { text-decoration: underline; }
                .rich-editor-content a { color: #818cf8; text-decoration: underline; }
                .rich-editor-content h1 { font-size: 1.6em; font-weight: 800; margin: 0 0 10px; color: inherit; line-height: 1.3; }
                .rich-editor-content h2 { font-size: 1.3em; font-weight: 700; margin: 0 0 8px; color: inherit; line-height: 1.3; }
                .rich-editor-content h3 { font-size: 1.1em; font-weight: 600; margin: 0 0 6px; color: inherit; line-height: 1.3; }
                .rich-editor-content img { max-width: 100%; border-radius: 6px; margin: 4px 0; }
                .rich-editor-content code { background: rgba(99,102,241,0.15); padding: 1px 6px; border-radius: 4px; font-size: 0.88em; }
                .rich-editor-content pre { background: rgba(0,0,0,0.35); padding: 12px 14px; border-radius: 8px; overflow-x: auto; }
            `}</style>

            {/* Toolbar — hidden in chatMode or when parent supplies its own controls */}
            {!chatMode && !hideToolbar && (
                <div style={{ display: 'flex', gap: 3, padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexWrap: 'nowrap', overflowX: 'auto', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
                    {/* Heading — custom dropdown with hover preview */}
                    <HeadingDropdown editor={editor} />
                    {/* Font + Size — hide in compact mode */}
                    {!compact && <FontDropdown editor={editor} />}
                    {!compact && <SizeDropdown editor={editor} />}
                    {!compact && divider}

                    <TBtn label="B" title="Bold" active={editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()} extraStyle={{ fontWeight: 900 }} />
                    <TBtn label="I" title="Italic" active={editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()} extraStyle={{ fontStyle: 'italic' }} />
                    <TBtn label="U" title="Underline" active={editor?.isActive('underline')} onClick={() => editor?.chain().focus().toggleUnderline().run()} extraStyle={{ textDecoration: 'underline' }} />
                    {/* Color picker */}
                    <div ref={colorPickerRef} style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
                        <button
                            ref={colorBtnRef}
                            title="Text color"
                            onMouseDown={e => {
                                e.preventDefault();
                                if (!showColorPicker && colorBtnRef.current) {
                                    const r = colorBtnRef.current.getBoundingClientRect();
                                    setColorPickerPos({ top: r.bottom + 4, left: r.left });
                                    // Capture current color for restoration on dismiss
                                    originalColorRef.current = (editor?.getAttributes('textStyle') as { color?: string }).color || '';
                                }
                                setShowColorPicker(v => !v);
                            }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 7px', borderRadius: 5, background: showColorPicker ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.07)', cursor: 'pointer', border: 'none', userSelect: 'none' }}
                        >
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', borderBottom: `3px solid ${currentColor}`, paddingBottom: 1, lineHeight: 1 }}>A</span>
                            <span style={{ fontSize: 11, color: '#64748b' }}>▾</span>
                        </button>
                        {showColorPicker && (
                            <>
                                <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onMouseDown={e => { e.preventDefault(); if (originalColorRef.current) editor?.chain().focus().setColor(originalColorRef.current).run(); else editor?.chain().focus().unsetColor().run(); setShowColorPicker(false); }} />
                                <div style={{ position: 'fixed', top: colorPickerPos.top, left: colorPickerPos.left, zIndex: 9999, background: '#1a1a2e', border: '1px solid rgba(99,102,241,0.35)', borderRadius: 10, padding: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.6)', minWidth: 158, maxHeight: 260, overflowY: 'auto' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 5, marginBottom: 8 }}>
                                        {COLOR_PRESETS.map(color => (
                                            <button
                                                key={color}
                                                title={color}
                                                onMouseDown={e => { e.preventDefault(); originalColorRef.current = color; editor?.chain().focus().setColor(color).run(); setShowColorPicker(false); }}
                                                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.2)'; editor?.chain().setColor(color).run(); }}
                                                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; const orig = originalColorRef.current; if (orig) editor?.chain().setColor(orig).run(); else editor?.chain().unsetColor().run(); }}
                                                style={{ width: 22, height: 22, borderRadius: 5, background: color, border: currentColor === color ? '2px solid #fff' : '2px solid rgba(255,255,255,0.15)', cursor: 'pointer', padding: 0, transition: 'transform 0.1s', flexShrink: 0 }}
                                            />
                                        ))}
                                    </div>
                                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{ fontSize: 11, color: '#64748b' }}>Custom</span>
                                        <input
                                            type="color"
                                            value={currentColor}
                                            onChange={e => editor?.chain().focus().setColor(e.target.value).run()}
                                            style={{ width: 32, height: 22, padding: 0, border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, cursor: 'pointer', background: 'none' }}
                                        />
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                    {divider}
                    <TBtn label="←" title="Align left" active={editor?.isActive({ textAlign: 'left' })} onClick={() => editor?.chain().focus().setTextAlign('left').run()} />
                    <TBtn label="≡" title="Align center" active={editor?.isActive({ textAlign: 'center' })} onClick={() => editor?.chain().focus().setTextAlign('center').run()} />
                    <TBtn label="→" title="Align right" active={editor?.isActive({ textAlign: 'right' })} onClick={() => editor?.chain().focus().setTextAlign('right').run()} />
                    {divider}
                    <TBtn label="≡ Bullets" title="Bullet list" active={editor?.isActive('bulletList')} onClick={handleBulletList} />
                    <TBtn label="1. List" title="Ordered list" active={editor?.isActive('orderedList')} onClick={handleOrderedList} />
                    <TBtn label="❝ Quote" title="Blockquote" active={editor?.isActive('blockquote')} onClick={handleBlockquote} />
                    {/* Image upload — only in full editors, not compact/title areas, and not when disableImage */}
                    {!compact && !disableImage && (<>
                        {divider}
                        <input
                            ref={imgInputRef}
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={async e => {
                                const file = e.target.files?.[0];
                                if (!file || !editor) return;
                                const fd = new FormData();
                                fd.append('file', file);
                                try {
                                    const r = await fetch(`${SERVER}/api/quiz/upload`, { method: 'POST', body: fd });
                                    const data = await r.json();
                                    if (data.url) editor.chain().focus().setImage({ src: data.url }).run();
                                } catch { /* ignore */ }
                                e.target.value = '';
                            }}
                        />
                        <button type="button" title="Insert image" onMouseDown={e => { e.preventDefault(); imgInputRef.current?.click(); }}
                            style={{ padding: '3px 8px', borderRadius: 5, border: 'none', background: 'rgba(255,255,255,0.07)', color: '#94a3b8', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            🖼 <span style={{ fontSize: 11 }}>Img</span>
                        </button>
                    </>)}
                </div>
            )}
            {/* Chat hint bar — replaces toolbar in chatMode */}
            {chatMode && (
                <div style={{ padding: '3px 10px', fontSize: 10, color: '#475569', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.01)' }}>
                    Enter to send · Shift+Enter for newline
                </div>
            )}

            {/* Editor area */}
            <div onKeyDown={handleKeyDown} style={editorStyle}>
                <EditorContent editor={editor} />
            </div>
        </div>
    );
}

// ── RichContent — renders sanitized HTML from RichEditor ──────────────────────
export function RichContent({ html, className, style }: { html: string; className?: string; style?: React.CSSProperties }) {
    if (!html || isRichEmpty(html)) return null;
    return (
        <div
            className={`rich-render${className ? ' ' + className : ''}`}
            style={style}
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, ADD_ATTR: ['style'] }) }}
        />
    );
}
