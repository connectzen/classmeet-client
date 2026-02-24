import { useState, useEffect, useRef } from 'react';
import { useUser } from '@insforge/react';
import { insforge } from '../lib/insforge';

export default function UserMenu() {
    const { user } = useUser();
    const [open, setOpen] = useState(false);
    const [signingOut, setSigningOut] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close when clicking outside
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleSignOut = async () => {
        setSigningOut(true);
        await insforge.auth.signOut();
        window.location.reload();
    };

    if (!user) return null;

    const displayName = user.profile?.name || user.email?.split('@')[0] || 'User';
    const initials = displayName
        .split(' ')
        .map((w: string) => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();

    return (
        <div ref={menuRef} style={{ position: 'relative', display: 'inline-flex' }}>
            {/* Avatar button */}
            <button
                onClick={() => setOpen(o => !o)}
                title={displayName}
                style={{
                    width: 36, height: 36, borderRadius: '50%', border: '2px solid rgba(99,102,241,0.5)',
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'border-color 0.2s, box-shadow 0.2s', flexShrink: 0,
                    boxShadow: open ? '0 0 0 3px rgba(99,102,241,0.3)' : 'none',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.9)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.2)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = open ? 'rgba(99,102,241,0.9)' : 'rgba(99,102,241,0.5)'; e.currentTarget.style.boxShadow = open ? '0 0 0 3px rgba(99,102,241,0.3)' : 'none'; }}
            >
                {initials}
            </button>

            {/* Dropdown */}
            {open && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 10px)', right: 0, zIndex: 1000,
                    background: 'var(--surface-2, #18181f)', border: '1px solid rgba(99,102,241,0.2)',
                    borderRadius: 14, padding: '8px', minWidth: 220,
                    boxShadow: '0 16px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
                    animation: 'fadeInDown 0.15s ease',
                }}>
                    <style>{`@keyframes fadeInDown{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}`}</style>

                    {/* User info */}
                    <div style={{ padding: '10px 12px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                                width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontWeight: 700, fontSize: 15,
                            }}>{initials}</div>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text, #e8e8f0)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {displayName}
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--text-muted, #7b7b99)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {user.email}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Sign out */}
                    <button
                        onClick={handleSignOut}
                        disabled={signingOut}
                        style={{
                            width: '100%', padding: '9px 12px', border: 'none', borderRadius: 10,
                            background: 'transparent', color: signingOut ? 'var(--text-muted, #7b7b99)' : '#f87171',
                            fontSize: 13, fontWeight: 600, cursor: signingOut ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.15s',
                            textAlign: 'left',
                        }}
                        onMouseEnter={e => { if (!signingOut) e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                            <polyline points="16 17 21 12 16 7" />
                            <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                        {signingOut ? 'Signing out…' : 'Sign Out'}
                    </button>
                </div>
            )}
        </div>
    );
}
