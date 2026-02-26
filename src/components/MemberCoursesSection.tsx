import { useState, useEffect, useCallback } from 'react';

const SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

interface Course { id: string; title: string; created_at?: string; }

export default function MemberCoursesSection({ userId }: { userId: string }) {
    const [courses, setCourses] = useState<Course[]>([]);
    const [loading, setLoading] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [creating, setCreating] = useState(false);
    const [showForm, setShowForm] = useState(false);

    const fetchCourses = useCallback(async () => {
        setLoading(true);
        try {
            const r = await fetch(`${SERVER}/api/courses?createdBy=${userId}`);
            if (r.ok) setCourses(await r.json());
        } catch { /* ignore */ }
        setLoading(false);
    }, [userId]);

    useEffect(() => { fetchCourses(); }, [fetchCourses]);

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        if (!newTitle.trim() || creating) return;
        setCreating(true);
        try {
            const r = await fetch(`${SERVER}/api/courses`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: newTitle.trim(), createdBy: userId }),
            });
            if (r.ok) { setNewTitle(''); setShowForm(false); fetchCourses(); }
        } finally {
            setCreating(false);
        }
    }

    return (
        <div style={{ marginTop: 20, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Courses</h3>
                <button
                    type="button"
                    onClick={() => setShowForm(!showForm)}
                    style={{
                        padding: '6px 14px',
                        borderRadius: 8,
                        border: '1px solid var(--primary, #6366f1)',
                        background: 'transparent',
                        color: 'var(--primary, #6366f1)',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                    }}
                >
                    {showForm ? 'Cancel' : '+ New Course'}
                </button>
            </div>
            {showForm && (
                <form onSubmit={handleCreate} style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                        type="text"
                        value={newTitle}
                        onChange={e => setNewTitle(e.target.value)}
                        placeholder="Course title"
                        style={{
                            flex: 1,
                            padding: '8px 12px',
                            borderRadius: 8,
                            border: '1px solid rgba(255,255,255,0.12)',
                            background: 'rgba(255,255,255,0.05)',
                            color: 'var(--text)',
                            fontSize: 14,
                        }}
                    />
                    <button type="submit" disabled={creating || !newTitle.trim()} style={{
                        padding: '8px 16px', borderRadius: 8, border: 'none',
                        background: 'var(--primary, #6366f1)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: creating ? 'not-allowed' : 'pointer',
                    }}>
                        {creating ? 'Creating…' : 'Create'}
                    </button>
                </form>
            )}
            {loading ? <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading courses…</p> : courses.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No courses yet. Create one to add quizzes.</p>
            ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {courses.map(c => (
                        <li key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 14 }}>
                            {c.title}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
