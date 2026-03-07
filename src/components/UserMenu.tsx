import { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useUser } from '../lib/AuthContext';
import { insforge } from '../lib/insforge';
import ProfileEditModal from './ProfileEditModal';
import InviteLinksSection from './InviteLinksSection';
import { subscribeToPush } from '../lib/pushSubscription';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

interface UserMenuProps {
    userRole?: string | null;
}

export default function UserMenu({ userRole }: UserMenuProps) {
    const { user } = useUser();
    const [open, setOpen] = useState(false);
    const [signingOut, setSigningOut] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showInviteLinks, setShowInviteLinks] = useState(false);
    const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
    const [avatarHovered, setAvatarHovered] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteTyped, setDeleteTyped] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState('');
    const [notifPerm, setNotifPerm] = useState<NotificationPermission>(
        'Notification' in window ? Notification.permission : 'denied'
    );
    const menuRef = useRef<HTMLDivElement>(null);
    const showInviteLinksItem = userRole === 'teacher' || userRole === 'member';

    useEffect(() => { setAvatarLoadFailed(false); }, [user?.profile?.avatar_url]);

    const handleEnableNotifications = async () => {
        if (notifPerm !== 'default') return;
        await subscribeToPush(user?.id);
        setNotifPerm('Notification' in window ? Notification.permission : 'denied');
        setOpen(false);
    };

    // Close when clicking/touching outside — mousedown alone misses iOS Safari tap events
    // on non-interactive elements, so we listen to touchstart as well.
    useEffect(() => {
        const handler = (e: MouseEvent | TouchEvent) => {
            const target = e instanceof TouchEvent ? e.touches[0]?.target : (e as MouseEvent).target;
            if (menuRef.current && !menuRef.current.contains(target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler as EventListener);
        document.addEventListener('touchstart', handler as EventListener, { passive: true });
        return () => {
            document.removeEventListener('mousedown', handler as EventListener);
            document.removeEventListener('touchstart', handler as EventListener);
        };
    }, []);

    const handleSignOut = async () => {
        setSigningOut(true);
        await insforge.auth.signOut();
        window.location.reload();
    };

    const handleDeleteAccount = async () => {
        if (!user?.id) return;
        setDeleting(true);
        setDeleteError('');
        try {
            const res = await fetch(`${SERVER_URL}/api/account/${user.id}`, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setDeleteError(data.error || 'Failed to delete account. Please try again.');
                setDeleting(false);
                return;
            }
            await insforge.auth.signOut();
            window.location.reload();
        } catch {
            setDeleteError('Server unreachable. Please try again.');
            setDeleting(false);
        }
    };

    if (!user) return null;

    const displayName = user.profile?.name || user.email?.split('@')[0] || 'User';
    const avatarUrl = user.profile?.avatar_url;
    const showAvatarImg = avatarUrl && !avatarLoadFailed;
    const initials = displayName
        .split(' ')
        .map((w: string) => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();

    return (
        <>
            {showEditModal && <ProfileEditModal onClose={() => setShowEditModal(false)} />}
            {showDeleteConfirm && ReactDOM.createPortal(
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 9999999,
                    background: 'rgba(0,0,0,0.85)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
                }}>
                    <div style={{
                        background: 'var(--surface-2, #18181f)',
                        border: '1px solid rgba(239,68,68,0.4)',
                        borderRadius: 20, padding: '28px 24px', width: '100%', maxWidth: 440,
                        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
                    }}>
                        <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 12 }}>⚠️</div>
                        <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#f87171', textAlign: 'center' }}>Delete Account</h3>
                        <p style={{ margin: '0 0 6px', fontSize: 14, color: 'var(--text-muted, #94a3b8)', textAlign: 'center', lineHeight: 1.6 }}>
                            This will permanently delete your account and <strong style={{ color: '#fca5a5' }}>everything you have created</strong> — classes, courses, quizzes, sessions, and all associated data.
                        </p>
                        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-muted, #94a3b8)', textAlign: 'center' }}>
                            This action <strong style={{ color: '#f87171' }}>cannot be undone</strong>.
                        </p>
                        <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--text, #e8e8f0)' }}>
                            Type <strong>DELETE</strong> to confirm:
                        </p>
                        <input
                            type="text"
                            value={deleteTyped}
                            onChange={e => setDeleteTyped(e.target.value)}
                            placeholder="DELETE"
                            style={{
                                width: '100%', boxSizing: 'border-box', padding: '10px 14px',
                                border: '1.5px solid rgba(239,68,68,0.4)', borderRadius: 10,
                                background: 'rgba(239,68,68,0.06)', color: '#fca5a5',
                                fontSize: 14, outline: 'none', marginBottom: 12,
                            }}
                            onFocus={e => { e.currentTarget.style.borderColor = '#f87171'; }}
                            onBlur={e => { e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)'; }}
                            autoFocus
                        />
                        {deleteError && (
                            <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: 13, marginBottom: 12 }}>
                                {deleteError}
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => { setShowDeleteConfirm(false); setDeleteTyped(''); setDeleteError(''); }}
                                disabled={deleting}
                                style={{ padding: '9px 18px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, background: 'transparent', color: 'var(--text-muted, #7b7b99)', fontSize: 13, fontWeight: 600, cursor: deleting ? 'not-allowed' : 'pointer' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteAccount}
                                disabled={deleting || deleteTyped !== 'DELETE'}
                                style={{
                                    padding: '9px 18px', border: 'none', borderRadius: 10,
                                    background: deleting || deleteTyped !== 'DELETE' ? 'rgba(239,68,68,0.3)' : '#dc2626',
                                    color: '#fff', fontSize: 13, fontWeight: 700,
                                    cursor: deleting || deleteTyped !== 'DELETE' ? 'not-allowed' : 'pointer',
                                }}
                            >
                                {deleting ? 'Deleting…' : 'Delete My Account'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
            {showInviteLinks && user?.id && ReactDOM.createPortal(
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
                </div>,
                document.body
            )}
            
            <div ref={menuRef} style={{ position: 'relative', display: 'inline-flex' }}>
                {/* Avatar button */}
                <button
                    onClick={() => setOpen(o => !o)}
                    title={displayName}
                    aria-label={`Profile menu for ${displayName}`}
                    style={{
                        // 44×44 touch target as recommended by Apple/Google HIG;
                        // the avatar circle itself is 36×36 via inner sizing.
                        width: 44, height: 44, borderRadius: '50%', border: 'none',
                        background: 'transparent',
                        cursor: 'pointer', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', flexShrink: 0, padding: 0,
                        WebkitTapHighlightColor: 'transparent',
                    }}
                >
                    <span style={{
                        width: 36, height: 36, borderRadius: '50%',
                        border: `2px solid ${open ? 'rgba(99,102,241,0.9)' : 'rgba(99,102,241,0.5)'}`,
                        background: showAvatarImg ? 'transparent' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                        color: '#fff', fontWeight: 700, fontSize: 13,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: open ? '0 0 0 3px rgba(99,102,241,0.3)' : 'none',
                        overflow: 'hidden', transition: 'border-color 0.2s, box-shadow 0.2s',
                        pointerEvents: 'none', // clicks handled by the outer button
                    }}>
                        {showAvatarImg ? (
                            <img src={avatarUrl} alt={displayName} onError={() => setAvatarLoadFailed(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            initials
                        )}
                    </span>
                </button>

            {/* Dropdown — right-anchored so it never overflows off the left edge on mobile */}
            {open && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 1000,
                    background: 'var(--surface-2, #18181f)', border: '1px solid rgba(99,102,241,0.2)',
                    borderRadius: 14, padding: '8px',
                    // On very narrow screens, keep the menu inside the viewport
                    minWidth: 220, maxWidth: 'min(280px, calc(100vw - 24px))',
                    boxShadow: '0 16px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
                    animation: 'fadeInDown 0.15s ease',
                }}>
                    <style>{`@keyframes fadeInDown{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}`}</style>

                    {/* User info */}
                    <div style={{ padding: '10px 12px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {/* Clickable avatar with Windows-style pencil overlay */}
                            <button
                                onClick={() => { setShowEditModal(true); setOpen(false); }}
                                onMouseEnter={() => setAvatarHovered(true)}
                                onMouseLeave={() => setAvatarHovered(false)}
                                title="Edit profile photo"
                                style={{
                                    position: 'relative', width: 40, height: 40, borderRadius: '50%',
                                    border: 'none', background: 'transparent', padding: 0,
                                    cursor: 'pointer', flexShrink: 0, display: 'flex',
                                    alignItems: 'center', justifyContent: 'center',
                                    WebkitTapHighlightColor: 'transparent',
                                }}
                            >
                                {showAvatarImg ? (
                                    <img
                                        src={avatarUrl}
                                        alt={displayName}
                                        onError={() => setAvatarLoadFailed(true)}
                                        style={{
                                            width: 40, height: 40, borderRadius: '50%',
                                            objectFit: 'cover', display: 'block',
                                        }}
                                    />
                                ) : (
                                    <div style={{
                                        width: 40, height: 40, borderRadius: '50%',
                                        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: '#fff', fontWeight: 700, fontSize: 15,
                                    }}>{initials}</div>
                                )}
                                {/* Hover overlay with pencil icon */}
                                <span style={{
                                    position: 'absolute', inset: 0, borderRadius: '50%',
                                    background: 'rgba(0,0,0,0.55)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    opacity: avatarHovered ? 1 : 0,
                                    transition: 'opacity 0.18s',
                                    pointerEvents: 'none',
                                }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                    </svg>
                                </span>
                            </button>
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
                                width: '100%', padding: '11px 12px', border: 'none', borderRadius: 10,
                                background: 'transparent', color: 'var(--text, #e8e8f0)',
                                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.15s',
                                textAlign: 'left', marginBottom: 4, minHeight: 44,
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

                    {/* Notifications */}
                    {notifPerm !== 'denied' && (
                        <button
                            onClick={handleEnableNotifications}
                            disabled={notifPerm === 'granted'}
                            style={{
                                width: '100%', padding: '11px 12px', border: 'none', borderRadius: 10,
                                background: 'transparent',
                                color: notifPerm === 'granted' ? '#4ade80' : 'var(--text, #e8e8f0)',
                                fontSize: 13, fontWeight: 600,
                                cursor: notifPerm === 'granted' ? 'default' : 'pointer',
                                display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.15s',
                                textAlign: 'left', marginBottom: 4, minHeight: 44,
                                opacity: notifPerm === 'granted' ? 0.8 : 1,
                            }}
                            onMouseEnter={e => { if (notifPerm === 'default') e.currentTarget.style.background = 'rgba(99,102,241,0.1)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                        >
                            <span style={{ fontSize: 15 }}>{notifPerm === 'granted' ? '🔔' : '🔕'}</span>
                            {notifPerm === 'granted' ? 'Notifications On' : 'Enable Notifications'}
                        </button>
                    )}

                    {/* Edit Profile */}
                    <button
                        onClick={() => {
                            setShowEditModal(true);
                            setOpen(false);
                        }}
                        style={{
                            width: '100%', padding: '11px 12px', border: 'none', borderRadius: 10,
                            background: 'transparent', color: 'var(--text, #e8e8f0)',
                            fontSize: 13, fontWeight: 600, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.15s',
                            textAlign: 'left', marginBottom: 4, minHeight: 44,
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

                    {/* Delete Account */}
                    <div style={{ borderTop: '1px solid rgba(239,68,68,0.15)', margin: '6px 0 4px' }} />
                    <button
                        onClick={() => { setShowDeleteConfirm(true); setOpen(false); }}
                        style={{
                            width: '100%', padding: '11px 12px', border: 'none', borderRadius: 10,
                            background: 'transparent', color: '#f87171',
                            fontSize: 13, fontWeight: 600, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.15s',
                            textAlign: 'left', marginBottom: 4, minHeight: 44,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6M14 11v6" />
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                        </svg>
                        Delete Account
                    </button>

                    {/* Sign out */}
                    <button
                        onClick={handleSignOut}
                        disabled={signingOut}
                        style={{
                            width: '100%', padding: '11px 12px', border: 'none', borderRadius: 10,
                            background: 'transparent', color: signingOut ? 'var(--text-muted, #7b7b99)' : '#f87171',
                            fontSize: 13, fontWeight: 600, cursor: signingOut ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.15s',
                            textAlign: 'left', minHeight: 44,
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
