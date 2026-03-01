import { useState, useRef, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TiptapImage from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
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
export function isRichEmpty(html: string) {
    if (!html) return true;
    const stripped = html.replace(/<[^>]*>/g, '').trim();
    return stripped.length === 0;
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
    const origRef = useRef<string | undefined>(undefined);
    const currentPx = (editor?.getAttributes('textStyle') as { fontSize?: string }).fontSize || '';
    const current = currentPx.replace('px', '');

    function apply(size: string) {
        if (size) editor?.chain().setMark('textStyle', { fontSize: size + 'px' }).run();
        else editor?.chain().setMark('textStyle', { fontSize: null }).run();
    }
    function onHover(size: string) {
        if (origRef.current === undefined) origRef.current = current;
        apply(size);
    }
    function onLeave() {
        if (origRef.current !== undefined) { apply(origRef.current); origRef.current = undefined; }
    }
    function onSelect(size: string) {
        origRef.current = undefined; apply(size); editor?.chain().focus().run(); setOpen(false);
    }
    function handleToggle(e: React.MouseEvent) {
        e.preventDefault();
        if (!open && btnRef.current) {
            const r = btnRef.current.getBoundingClientRect();
            setPos({ top: r.bottom + 4, left: r.left });
        }
        setOpen(o => !o);
    }

    return (
        <div style={{ position: 'relative' }}>
            {open && <div style={{ position: 'fixed', inset: 0, zIndex: 9000 }} onMouseDown={e => e.preventDefault()} onClick={() => { onLeave(); setOpen(false); }} />}
            <button ref={btnRef} type="button" onMouseDown={handleToggle}
                style={{ padding: '3px 8px', borderRadius: 5, border: 'none', background: open ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.07)', color: current ? '#a5b4fc' : '#94a3b8', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                {current || 'Size'} <span style={{ fontSize: 9, opacity: 0.6 }}>▾</span>
            </button>
            {open && (
                <div onMouseLeave={onLeave} onWheel={e => e.stopPropagation()}
                    style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9001, background: '#13131a', borderRadius: 8, border: '1px solid rgba(99,102,241,0.3)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', minWidth: 72, padding: '4px 0', maxHeight: 280, overflowY: 'auto' }}>
                    <div onMouseDown={e => e.preventDefault()} onMouseEnter={() => onHover('')} onClick={() => onSelect('')}
                        style={{ padding: '5px 16px', cursor: 'pointer', fontSize: 12, color: !current ? '#a5b4fc' : '#64748b', fontWeight: !current ? 600 : 400 }}>Default</div>
                    {SIZES.map(size => (
                        <div key={size} onMouseDown={e => e.preventDefault()} onMouseEnter={() => onHover(size)} onClick={() => onSelect(size)}
                            style={{ padding: '5px 16px', cursor: 'pointer', fontSize: 12, color: current === size ? '#a5b4fc' : '#94a3b8', fontWeight: current === size ? 700 : 400, background: current === size ? 'rgba(99,102,241,0.12)' : 'transparent' }}>
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
    const origRef = useRef<string | undefined>(undefined);
    const currentFont = (editor?.getAttributes('textStyle') as { fontFamily?: string }).fontFamily || '';
    const currentLabel = FONTS.find(f => f.value === currentFont)?.label || 'Font';

    function apply(fontFamily: string) {
        if (fontFamily) editor?.chain().setMark('textStyle', { fontFamily }).run();
        else editor?.chain().setMark('textStyle', { fontFamily: null }).run();
    }
    function onHover(value: string) {
        if (origRef.current === undefined) origRef.current = currentFont;
        apply(value);
    }
    function onLeave() {
        if (origRef.current !== undefined) { apply(origRef.current); origRef.current = undefined; }
    }
    function onSelect(value: string) {
        origRef.current = undefined; apply(value); editor?.chain().focus().run(); setOpen(false);
    }
    function handleToggle(e: React.MouseEvent) {
        e.preventDefault();
        if (!open && btnRef.current) {
            const r = btnRef.current.getBoundingClientRect();
            setPos({ top: r.bottom + 4, left: r.left });
        }
        setOpen(o => !o);
    }

    return (
        <div style={{ position: 'relative' }}>
            {open && <div style={{ position: 'fixed', inset: 0, zIndex: 9000 }} onMouseDown={e => e.preventDefault()} onClick={() => { onLeave(); setOpen(false); }} />}
            <button ref={btnRef} type="button" onMouseDown={handleToggle}
                style={{ padding: '3px 8px', borderRadius: 5, border: 'none', background: open ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.07)', color: currentFont ? '#a5b4fc' : '#94a3b8', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, maxWidth: 110 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentLabel}</span>
                <span style={{ fontSize: 9, opacity: 0.6, flexShrink: 0 }}>▾</span>
            </button>
            {open && (
                <div onMouseLeave={onLeave} onWheel={e => e.stopPropagation()}
                    style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9001, background: '#13131a', borderRadius: 8, border: '1px solid rgba(99,102,241,0.3)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', minWidth: 190, padding: '4px 0', maxHeight: 300, overflowY: 'auto' }}>
                    {FONTS.map(font => (
                        <div key={font.value} onMouseDown={e => e.preventDefault()} onMouseEnter={() => onHover(font.value)} onClick={() => onSelect(font.value)}
                            style={{ padding: '8px 16px', cursor: 'pointer', fontFamily: font.value || 'inherit', fontSize: 13, color: currentFont === font.value ? '#a5b4fc' : '#e2e8f0', background: currentFont === font.value ? 'rgba(99,102,241,0.12)' : 'transparent', fontWeight: currentFont === font.value ? 600 : 400 }}>
                            {font.label}
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
    style,
    editorStyle,
}: RichEditorProps) {
    ensureFonts();
    const [, forceUpdate] = useState(0);
    const [showColorPicker, setShowColorPicker] = useState(false);
    const colorPickerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!showColorPicker) return;
        function handleClickOutside(e: MouseEvent) {
            if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
                setShowColorPicker(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showColorPicker]);

    const editor = useEditor({
        extensions: [
            StarterKit,
            Underline,
            TiptapImage,
            Link.configure({ openOnClick: false }),
            TextStyle,
            Color,
            FontSizeExtension,
            FontFamilyExtension,
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

    const headingLevel = editor?.isActive('heading', { level: 1 }) ? '1'
        : editor?.isActive('heading', { level: 2 }) ? '2'
        : editor?.isActive('heading', { level: 3 }) ? '3' : '0';

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
                .rich-editor-content strong { color: #f1f5f9; }
                .rich-editor-content em { color: #cbd5e1; }
                .rich-editor-content u { text-decoration: underline; }
                .rich-editor-content a { color: #818cf8; text-decoration: underline; }
                .rich-editor-content h1 { font-size: 1.6em; font-weight: 800; margin: 0 0 10px; color: #f1f5f9; line-height: 1.3; }
                .rich-editor-content h2 { font-size: 1.3em; font-weight: 700; margin: 0 0 8px; color: #f1f5f9; line-height: 1.3; }
                .rich-editor-content h3 { font-size: 1.1em; font-weight: 600; margin: 0 0 6px; color: #e2e8f0; line-height: 1.3; }
                .rich-editor-content img { max-width: 100%; border-radius: 6px; margin: 4px 0; }
                .rich-editor-content code { background: rgba(99,102,241,0.15); padding: 1px 6px; border-radius: 4px; font-size: 0.88em; }
                .rich-editor-content pre { background: rgba(0,0,0,0.35); padding: 12px 14px; border-radius: 8px; overflow-x: auto; }
            `}</style>

            {/* Toolbar */}
            <div style={{ display: 'flex', gap: 3, padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexWrap: 'wrap', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
                {/* Heading — hide in chatMode */}
                {!chatMode && (
                    <select value={headingLevel}
                        onChange={e => {
                            const v = e.target.value;
                            if (v === '0') editor?.chain().focus().setParagraph().run();
                            else editor?.chain().focus().setHeading({ level: Number(v) as 1 | 2 | 3 }).run();
                        }}
                        style={{ padding: '3px 6px', borderRadius: 5, border: 'none', background: 'rgba(255,255,255,0.07)', color: '#94a3b8', fontSize: 12, cursor: 'pointer', colorScheme: 'dark' }}>
                        <option value="0">Normal</option>
                        <option value="1">H1</option>
                        <option value="2">H2</option>
                        <option value="3">H3</option>
                    </select>
                )}
                {/* Font + Size — hide in compact/chatMode */}
                {!compact && !chatMode && <FontDropdown editor={editor} />}
                {!compact && !chatMode && <SizeDropdown editor={editor} />}
                {(!compact && !chatMode) && divider}

                <TBtn label="B" title="Bold" active={editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()} extraStyle={{ fontWeight: 900 }} />
                <TBtn label="I" title="Italic" active={editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()} extraStyle={{ fontStyle: 'italic' }} />
                <TBtn label="U" title="Underline" active={editor?.isActive('underline')} onClick={() => editor?.chain().focus().toggleUnderline().run()} extraStyle={{ textDecoration: 'underline' }} />
                {/* Color picker */}
                <div ref={colorPickerRef} style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
                    <button
                        title="Text color"
                        onClick={() => setShowColorPicker(v => !v)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 7px', borderRadius: 5, background: showColorPicker ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.07)', cursor: 'pointer', border: 'none', userSelect: 'none' }}
                    >
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', borderBottom: `3px solid ${currentColor}`, paddingBottom: 1, lineHeight: 1 }}>A</span>
                        <span style={{ fontSize: 11, color: '#64748b' }}>▾</span>
                    </button>
                    {showColorPicker && (
                        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 200, background: '#1a1a2e', border: '1px solid rgba(99,102,241,0.35)', borderRadius: 10, padding: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.6)', minWidth: 158 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 5, marginBottom: 8 }}>
                                {COLOR_PRESETS.map(color => (
                                    <button
                                        key={color}
                                        title={color}
                                        onClick={() => { editor?.chain().focus().setColor(color).run(); setShowColorPicker(false); }}
                                        style={{ width: 22, height: 22, borderRadius: 5, background: color, border: currentColor === color ? '2px solid #fff' : '2px solid rgba(255,255,255,0.15)', cursor: 'pointer', padding: 0, transition: 'transform 0.1s', flexShrink: 0 }}
                                        onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.2)')}
                                        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
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
                    )}
                </div>
                {divider}
                <TBtn label="≡ Bullets" title="Bullet list" active={editor?.isActive('bulletList')} onClick={handleBulletList} />
                <TBtn label="1. List" title="Ordered list" active={editor?.isActive('orderedList')} onClick={handleOrderedList} />
                <TBtn label="❝ Quote" title="Blockquote" active={editor?.isActive('blockquote')} onClick={handleBlockquote} />
                {chatMode && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#475569', whiteSpace: 'nowrap', paddingRight: 4 }}>Enter to send · Shift+Enter for newline</span>}
            </div>

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
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html, { USE_PROFILES: { html: true } }) }}
        />
    );
}
