import { useState, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useUser } from '../lib/AuthContext';
import { insforge } from '../lib/insforge';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

interface ProfileEditModalProps {
    onClose: () => void;
}

export default function ProfileEditModal({ onClose }: ProfileEditModalProps) {
    const { user, refreshUser } = useUser();
    const [name, setName] = useState(user?.profile?.name || '');
    const [avatarUrl, setAvatarUrl] = useState(user?.profile?.avatar_url || '');
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file');
            return;
        }

        // Validate file size (5MB max)
        if (file.size > 5 * 1024 * 1024) {
            alert('File size must be less than 5MB');
            return;
        }

        setUploading(true);

        try {
            // Show local preview immediately
            const reader = new FileReader();
            reader.onloadend = () => setPreviewUrl(reader.result as string);
            reader.readAsDataURL(file);

            if (!user?.id) {
                alert('Please sign in to upload an avatar.');
                return;
            }

            const form = new FormData();
            form.append('file', file);
            form.append('userId', user.id);
            const res = await fetch(`${SERVER_URL}/api/profile/upload-avatar`, {
                method: 'POST',
                body: form,
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                console.error('Upload error:', err);
                alert(err.error || 'Failed to upload image. Please try again.');
                return;
            }

            const data = await res.json();
            if (data.url) setAvatarUrl(data.url);
        } catch (err) {
            console.error('Upload error:', err);
            alert('Failed to upload image. Please try again.');
        } finally {
            setUploading(false);
        }
    };

    const handleSave = async () => {
        if (!name.trim()) {
            alert('Please enter your name');
            return;
        }

        setSaving(true);

        try {
            // Update user profile in InsForge Auth
            const { error } = await insforge.auth.setProfile({
                name: name.trim(),
                avatar_url: avatarUrl || undefined,
            });

            if (error) {
                console.error('Profile update error:', error);
                alert('Failed to update profile. Please try again.');
                return;
            }

            // Sync the updated name to user_roles table so it reflects everywhere
            if (user?.id) {
                try {
                    const syncRes = await fetch(`${SERVER_URL}/api/profile/sync-name`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: user.id, name: name.trim() }),
                    });
                    if (!syncRes.ok) {
                        const syncErr = await syncRes.json().catch(() => ({}));
                        console.warn('[profile] name sync failed:', syncErr);
                    }
                } catch (syncErr) {
                    console.warn('[profile] name sync to user_roles failed (non-critical):', syncErr);
                }
            }

            // Refresh auth user so header avatar/name update without full reload
            await refreshUser();
            onClose();
        } catch (err) {
            console.error('Profile update error:', err);
            alert('Failed to update profile. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const currentAvatarUrl = previewUrl || avatarUrl || user?.profile?.avatar_url;
    const displayName = user?.profile?.name || user?.email?.split('@')[0] || 'User';
    const initials = displayName
        .split(' ')
        .map((w: string) => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();

    return ReactDOM.createPortal(
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 999999,
                background: 'rgba(0,0,0,0.8)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 20,
                animation: 'fadeIn 0.2s ease',
                overflowY: 'auto',
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <style>{`@keyframes fadeIn{from{opacity:0}to{opacity:1}}`}</style>

            <div style={{
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
            }}>
                <style>{`@keyframes scaleIn{from{opacity:0;transform:scale(0.95)}to{opacity:1;transform:scale(1)}}`}</style>

                {/* Header */}
                <div style={{
                    padding: '24px 24px 20px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}>
                    <h2 style={{
                        margin: 0,
                        fontSize: 20,
                        fontWeight: 700,
                        color: 'var(--text, #e8e8f0)',
                    }}>
                        Edit Profile
                    </h2>
                </div>

                {/* Body */}
                <div style={{ padding: 24 }}>
                    {/* Avatar Section */}
                    <div style={{ textAlign: 'center', marginBottom: 24 }}>
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                            {currentAvatarUrl ? (
                                <img
                                    src={currentAvatarUrl}
                                    alt="Profile"
                                    style={{
                                        width: 100,
                                        height: 100,
                                        borderRadius: '50%',
                                        objectFit: 'cover',
                                        border: '3px solid rgba(99,102,241,0.5)',
                                    }}
                                />
                            ) : (
                                <div style={{
                                    width: 100,
                                    height: 100,
                                    borderRadius: '50%',
                                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#fff',
                                    fontWeight: 700,
                                    fontSize: 32,
                                    border: '3px solid rgba(99,102,241,0.5)',
                                }}>
                                    {initials}
                                </div>
                            )}
                        </div>

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange}
                            style={{ display: 'none' }}
                        />

                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            style={{
                                marginTop: 16,
                                padding: '8px 16px',
                                border: '1px solid rgba(99,102,241,0.5)',
                                borderRadius: 10,
                                background: 'transparent',
                                color: '#6366f1',
                                fontSize: 13,
                                fontWeight: 600,
                                cursor: uploading ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s',
                            }}
                            onMouseEnter={e => {
                                if (!uploading) {
                                    e.currentTarget.style.background = 'rgba(99,102,241,0.1)';
                                    e.currentTarget.style.borderColor = '#6366f1';
                                }
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)';
                            }}
                        >
                            {uploading ? 'Uploading...' : 'Change Photo'}
                        </button>
                        <div style={{
                            marginTop: 8,
                            fontSize: 12,
                            color: 'var(--text-muted, #7b7b99)',
                        }}>
                            Max 5MB • JPG, PNG, GIF
                        </div>
                    </div>

                    {/* Name Input */}
                    <div>
                        <label style={{
                            display: 'block',
                            marginBottom: 8,
                            fontSize: 13,
                            fontWeight: 600,
                            color: 'var(--text, #e8e8f0)',
                        }}>
                            Name
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Enter your name"
                            style={{
                                width: '100%',
                                padding: '10px 14px',
                                border: '1px solid rgba(99,102,241,0.3)',
                                borderRadius: 10,
                                background: 'rgba(0,0,0,0.2)',
                                color: 'var(--text, #e8e8f0)',
                                fontSize: 14,
                                outline: 'none',
                                transition: 'border-color 0.2s',
                            }}
                            onFocus={e => e.currentTarget.style.borderColor = '#6366f1'}
                            onBlur={e => e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)'}
                        />
                    </div>
                </div>

                {/* Footer */}
                <div style={{
                    padding: '16px 24px 24px',
                    display: 'flex',
                    gap: 12,
                    justifyContent: 'flex-end',
                }}>
                    <button
                        onClick={onClose}
                        disabled={saving}
                        style={{
                            padding: '10px 20px',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 10,
                            background: 'transparent',
                            color: 'var(--text-muted, #7b7b99)',
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: saving ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => {
                            if (!saving) {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                            }
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.background = 'transparent';
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || uploading || !name.trim()}
                        style={{
                            padding: '10px 24px',
                            border: 'none',
                            borderRadius: 10,
                            background: saving || uploading || !name.trim() 
                                ? 'rgba(99,102,241,0.3)' 
                                : '#6366f1',
                            color: '#fff',
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: saving || uploading || !name.trim() ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => {
                            if (!saving && !uploading && name.trim()) {
                                e.currentTarget.style.background = '#7c3aed';
                            }
                        }}
                        onMouseLeave={e => {
                            if (!saving && !uploading && name.trim()) {
                                e.currentTarget.style.background = '#6366f1';
                            }
                        }}
                    >
                        {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
