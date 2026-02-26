import { useState } from 'react';

const SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

type RoleInterest = 'member' | 'teacher' | 'student';

const AREAS_OPTIONS = ['Math', 'Science', 'Languages', 'Arts', 'Other'];
const SITUATION_OPTIONS = ['Student', 'Teacher', 'Parent', 'Professional', 'Other'] as const;
const GOALS_OPTIONS = ['Learn new subjects', 'Teach classes', 'Coordinate with students', 'Other'] as const;

interface Props {
    userId: string;
    name: string;
    email: string;
    onComplete: (role: string) => void;
}

const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: 8,
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-muted, #7b7b99)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
};

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '11px 14px',
    borderRadius: 10,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'var(--text, #e8e8f0)',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
};

const chipStyle = (selected: boolean): React.CSSProperties => ({
    padding: '8px 14px',
    borderRadius: 10,
    border: selected ? '2px solid var(--primary, #6366f1)' : '1px solid rgba(255,255,255,0.12)',
    background: selected ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)',
    color: 'var(--text, #e8e8f0)',
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
});

export default function OnboardingForm({ userId, name, email, onComplete }: Props) {
    const [roleInterest, setRoleInterest] = useState<RoleInterest>('student');
    const [areasOfInterest, setAreasOfInterest] = useState<string[]>([]);
    const [currentSituation, setCurrentSituation] = useState<string>('');
    const [situationOther, setSituationOther] = useState('');
    const [goals, setGoals] = useState<string>('');
    const [goalsOther, setGoalsOther] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const toggleArea = (area: string) => {
        setAreasOfInterest(prev =>
            prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area]
        );
    };

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const areasStr = areasOfInterest.length ? areasOfInterest.join(', ') : '';
            const situationStr = currentSituation === 'Other' ? situationOther.trim() : currentSituation;
            const goalsStr = goals === 'Other' ? goalsOther.trim() : goals;
            const r = await fetch(`${SERVER}/api/onboarding`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    name,
                    email,
                    roleInterest,
                    areasOfInterest: areasStr || undefined,
                    currentSituation: situationStr || undefined,
                    goals: goalsStr || undefined,
                }),
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Onboarding failed');
            sessionStorage.removeItem('needsOnboarding');
            onComplete(data.role);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div style={{
            maxWidth: 520,
            margin: '0 auto',
            padding: 24,
            background: 'var(--surface-2, #18181f)',
            borderRadius: 16,
            border: '1px solid rgba(99,102,241,0.2)',
        }}>
            <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 22, color: 'var(--text, #e8e8f0)' }}>
                Welcome! Tell us a bit about yourself
            </h2>
            <p style={{ marginBottom: 24, fontSize: 14, color: 'var(--text-muted, #7b7b99)' }}>
                This helps us tailor your experience. Admin role cannot be chosen here.
            </p>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                    <label style={labelStyle}>I want to join as</label>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {(['member', 'teacher', 'student'] as const).map((r) => (
                            <button
                                key={r}
                                type="button"
                                onClick={() => setRoleInterest(r)}
                                style={{
                                    padding: '10px 18px',
                                    borderRadius: 10,
                                    border: roleInterest === r ? '2px solid var(--primary, #6366f1)' : '1px solid rgba(255,255,255,0.12)',
                                    background: roleInterest === r ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)',
                                    color: 'var(--text, #e8e8f0)',
                                    fontWeight: 600,
                                    fontSize: 14,
                                    cursor: 'pointer',
                                    textTransform: 'capitalize',
                                }}
                            >
                                {r}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <label style={labelStyle}>Areas of interest</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {AREAS_OPTIONS.map((area) => (
                            <button
                                key={area}
                                type="button"
                                onClick={() => toggleArea(area)}
                                style={chipStyle(areasOfInterest.includes(area))}
                            >
                                {area}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <label style={labelStyle}>Current situation</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {SITUATION_OPTIONS.map((s) => (
                            <button
                                key={s}
                                type="button"
                                onClick={() => setCurrentSituation(s)}
                                style={chipStyle(currentSituation === s)}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                    {currentSituation === 'Other' && (
                        <input
                            type="text"
                            value={situationOther}
                            onChange={e => setSituationOther(e.target.value)}
                            placeholder="Please specify"
                            style={{ ...inputStyle, marginTop: 8 }}
                        />
                    )}
                </div>
                <div>
                    <label style={labelStyle}>Goals / plans with the platform</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {GOALS_OPTIONS.map((g) => (
                            <button
                                key={g}
                                type="button"
                                onClick={() => setGoals(g)}
                                style={chipStyle(goals === g)}
                            >
                                {g}
                            </button>
                        ))}
                    </div>
                    {goals === 'Other' && (
                        <input
                            type="text"
                            value={goalsOther}
                            onChange={e => setGoalsOther(e.target.value)}
                            placeholder="What do you hope to achieve?"
                            style={{ ...inputStyle, marginTop: 8 }}
                        />
                    )}
                </div>
                {error && (
                    <div style={{ padding: 12, borderRadius: 8, background: 'rgba(239,68,68,0.1)', color: '#f87171', fontSize: 14 }}>
                        {error}
                    </div>
                )}
                <button
                    type="submit"
                    disabled={loading}
                    style={{
                        padding: '14px 0',
                        borderRadius: 12,
                        border: 'none',
                        background: loading ? 'rgba(99,102,241,0.5)' : 'var(--primary, #6366f1)',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: 15,
                        cursor: loading ? 'not-allowed' : 'pointer',
                    }}
                >
                    {loading ? 'Saving…' : 'Continue'}
                </button>
            </form>
        </div>
    );
}
