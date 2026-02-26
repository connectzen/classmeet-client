import { useState, useEffect, useRef } from 'react';
import { useUser } from '../lib/AuthContext';
import { insforge } from '../lib/insforge';
import ProfileEditModal from './ProfileEditModal';
import InviteLinksSection from './InviteLinksSection';

interface UserMenuProps {
    userRole?: string | null;
}

export default function UserMenu({ userRole }: UserMenuProps) {
    const { user } = useUser();
    const [open, setOpen] = useState(false);
    const [signingOut, setSigningOut] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showInviteLinks, setShowInviteLinks] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const showInviteLinksItem = userRole === 'teacher' || userRole === 'member';

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
    const avatarUrl = user.profile?.avatar_url;
    const initials = displayName
        .split(' ')
        .map((w: string) => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();

    return (
        <>
            {showEditModal && <ProfileEditModal onClose={() => setShowEditModal(false)} />}
            {showInviteLinks && user?.id && (
                <div
                    style={{
                        position: 'fixed', inset: 0, zIndex: 999999,
                        background: 'rgba(0,0,0,0.8)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: 20,
                        animation: 'fadeIn 0.2s ease',
                        overflowY: 'auto',
                    }}
                    onClick={(e) => { if (e.target === e.currentTarget) setShowInviteLinks(false); }}
                >
                    <style>{`@keyframes fadeIn{from{opacity:0}to{opacity:1}}`}</style>
                    <div
                        style={{
                            background: 'var(--surface-2, #18181f)',
                            borderRadius: 20,
                            width: '100%',
                            maxWidth: 450,
                            maxHeight: '90vh',
                            overflowY: 'auto',
                            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                            border: '1px solid rgba(99,102,241,0.2)',
                            animation: 'scaleIn 0.2s ease',
                            margin: 'auto',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <style>{`@keyframes scaleIn{from{opacity:0;transform:scale(0.95)}to{opacity:1;transform:scale(1)}}`}</style>
                        <div style={{ padding: '24px 24px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>Invite links</h2>
                            <button type="button" onClick={() => setShowInviteLinks(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer', padding: '2px 6px', lineHeight: 1 }} aria-label="Close">×</button>
                        </div>
                        <div style={{ padding: 24 }}>
                            <InviteLinksSection userId={user.id} variant={userRole === 'teacher' ? 'teacher' : 'member'} />
                        </div>
                    </div>
                </div>
            )}
            
            <div ref={menuRef} style={{ position: 'relative', display: 'inline-flex' }}>
                {/* Avatar button */}
                <button
                    onClick={() => setOpen(o => !o)}
                    title={displayName}
                    style={{
                        width: 36, height: 36, borderRadius: '50%', border: '2px solid rgba(99,102,241,0.5)',
                        background: avatarUrl ? 'transparent' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                        color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'border-color 0.2s, box-shadow 0.2s', flexShrink: 0,
                        boxShadow: open ? '0 0 0 3px rgba(99,102,241,0.3)' : 'none',
                        padding: 0, overflow: 'hidden',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.9)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = open ? 'rgba(99,102,241,0.9)' : 'rgba(99,102,241,0.5)'; e.currentTarget.style.boxShadow = open ? '0 0 0 3px rgba(99,102,241,0.3)' : 'none'; }}
                >
                    {avatarUrl ? (
                        <img src={avatarUrl} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                        initials
                    )}
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
                            {avatarUrl ? (
                                <img 
                                    src={avatarUrl} 
                                    alt={displayName}
                                    style={{
                                        width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                                        objectFit: 'cover',
                                    }}
                                />
                            ) : (
                                <div style={{
                                    width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: '#fff', fontWeight: 700, fontSize: 15,
                                }}>{initials}</div>
                            )}
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

                    {showInviteLinksItem && (
                        <button
                            onClick={() => {
                                setShowInviteLinks(true);
                                setOpen(false);
                            }}
                            style={{
                                width: '100%', padding: '9px 12px', border: 'none', borderRadius: 10,
                                background: 'transparent', color: 'var(--text, #e8e8f0)',
                                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.15s',
                                textAlign: 'left', marginBottom: 4,
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.1)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                <circle cx="9" cy="7" r="4" />
                                <line x1="19" y1="8" x2="19" y2="14" />
                                <line x1="22" y1="11" x2="16" y2="11" />
                            </svg>
                            Invite links
                        </button>
                    )}

                    {/* Edit Profile */}
                    <button
                        onClick={() => {
                            setShowEditModal(true);
                            setOpen(false);
                        }}
                        style={{
                            width: '100%', padding: '9px 12px', border: 'none', borderRadius: 10,
                            background: 'transparent', color: 'var(--text, #e8e8f0)',
                            fontSize: 13, fontWeight: 600, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.15s',
                            textAlign: 'left', marginBottom: 4,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.1)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                        </svg>
                        Edit Profile
                    </button>

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
        </>
    );
}
