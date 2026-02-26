import { useState } from 'react';

const SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

interface Props {
    userId: string;
    variant: 'member' | 'teacher'; // member: show student + teacher links; teacher: student only
}

export default function InviteLinksSection({ userId, variant }: Props) {
    const [studentUrl, setStudentUrl] = useState<string | null>(null);
    const [teacherUrl, setTeacherUrl] = useState<string | null>(null);
    const [loadingStudent, setLoadingStudent] = useState(false);
    const [loadingTeacher, setLoadingTeacher] = useState(false);
    const [copied, setCopied] = useState<'student' | 'teacher' | null>(null);

    async function generateLink(role: 'student' | 'teacher') {
        const setLoading = role === 'student' ? setLoadingStudent : setLoadingTeacher;
        const setUrl = role === 'student' ? setStudentUrl : setTeacherUrl;
        setLoading(true);
        try {
            const r = await fetch(`${SERVER}/api/invite-links`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role, createdBy: userId }),
            });
            const data = await r.json();
            if (r.ok && data.url) setUrl(data.url);
        } finally {
            setLoading(false);
        }
    }

    function copyToClipboard(url: string, which: 'student' | 'teacher') {
        navigator.clipboard.writeText(url).then(() => {
            setCopied(which);
            setTimeout(() => setCopied(null), 2000);
        });
    }

    return (
        <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Invite links</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{
                    padding: 16,
                    background: 'rgba(255,255,255,0.04)',
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.08)',
                }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>Student invite link</div>
                    {studentUrl ? (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <input
                                readOnly
                                value={studentUrl}
                                style={{
                                    flex: 1,
                                    minWidth: 200,
                                    padding: '8px 12px',
                                    borderRadius: 8,
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    background: 'rgba(0,0,0,0.2)',
                                    color: 'var(--text)',
                                    fontSize: 13,
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => copyToClipboard(studentUrl, 'student')}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: 8,
                                    border: 'none',
                                    background: copied === 'student' ? '#22c55e' : 'var(--primary, #6366f1)',
                                    color: '#fff',
                                    fontWeight: 600,
                                    fontSize: 13,
                                    cursor: 'pointer',
                                }}
                            >
                                {copied === 'student' ? 'Copied!' : 'Copy'}
                            </button>
                            <button
                                type="button"
                                onClick={() => generateLink('student')}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: 8,
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    background: 'transparent',
                                    color: 'var(--text-muted)',
                                    fontSize: 13,
                                    cursor: 'pointer',
                                }}
                            >
                                New link
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            disabled={loadingStudent}
                            onClick={() => generateLink('student')}
                            style={{
                                padding: '10px 18px',
                                borderRadius: 10,
                                border: 'none',
                                background: 'var(--primary, #6366f1)',
                                color: '#fff',
                                fontWeight: 600,
                                fontSize: 14,
                                cursor: loadingStudent ? 'not-allowed' : 'pointer',
                            }}
                        >
                            {loadingStudent ? 'Generating…' : 'Generate student invite link'}
                        </button>
                    )}
                </div>
                {variant === 'member' && (
                    <div style={{
                        padding: 16,
                        background: 'rgba(255,255,255,0.04)',
                        borderRadius: 12,
                        border: '1px solid rgba(255,255,255,0.08)',
                    }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>Teacher invite link</div>
                        {teacherUrl ? (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                <input
                                    readOnly
                                    value={teacherUrl}
                                    style={{
                                        flex: 1,
                                        minWidth: 200,
                                        padding: '8px 12px',
                                        borderRadius: 8,
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        background: 'rgba(0,0,0,0.2)',
                                        color: 'var(--text)',
                                        fontSize: 13,
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={() => copyToClipboard(teacherUrl, 'teacher')}
                                    style={{
                                        padding: '8px 16px',
                                        borderRadius: 8,
                                        border: 'none',
                                        background: copied === 'teacher' ? '#22c55e' : 'var(--primary, #6366f1)',
                                        color: '#fff',
                                        fontWeight: 600,
                                        fontSize: 13,
                                        cursor: 'pointer',
                                    }}
                                >
                                    {copied === 'teacher' ? 'Copied!' : 'Copy'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => generateLink('teacher')}
                                    style={{
                                        padding: '8px 16px',
                                        borderRadius: 8,
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        background: 'transparent',
                                        color: 'var(--text-muted)',
                                        fontSize: 13,
                                        cursor: 'pointer',
                                    }}
                                >
                                    New link
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                disabled={loadingTeacher}
                                onClick={() => generateLink('teacher')}
                                style={{
                                    padding: '10px 18px',
                                    borderRadius: 10,
                                    border: 'none',
                                    background: 'var(--primary, #6366f1)',
                                    color: '#fff',
                                    fontWeight: 600,
                                    fontSize: 14,
                                    cursor: loadingTeacher ? 'not-allowed' : 'pointer',
                                }}
                            >
                                {loadingTeacher ? 'Generating…' : 'Generate teacher invite link'}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
