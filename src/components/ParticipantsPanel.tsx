interface Participant {
    socketId: string;
    name: string;
    role: 'teacher' | 'student';
    isMuted?: boolean;
}

interface Props {
    participants: Participant[];
    mySocketId: string;
    myRole: 'teacher' | 'student';
    spotlightId: string;
    onSpotlight: (socketId: string) => void;
    onMuteParticipant: (socketId: string, muted: boolean) => void;
}

export default function ParticipantsPanel({
    participants, mySocketId, myRole, spotlightId, onSpotlight, onMuteParticipant
}: Props) {
    return (
        <div className="participants-panel">
            <div className="pp-header">
                <span>👥 Participants</span>
                <span className="pp-count">{participants.length}</span>
            </div>
            <div className="pp-list">
                {participants.map((p) => {
                    const isMe = p.socketId === mySocketId;
                    const isSpotlit = p.socketId === spotlightId;
                    return (
                        <div
                            key={p.socketId}
                            className={`pp-row ${isSpotlit ? 'pp-row-spotlit' : ''}`}
                            onClick={() => onSpotlight(p.socketId)}
                            title="Click to spotlight"
                        >
                            <div className="pp-avatar">{p.name.charAt(0).toUpperCase()}</div>
                            <div className="pp-info">
                                <span className="pp-name">{p.name}{isMe ? ' (You)' : ''}</span>
                                <span className={`pp-role-tag role-tag-${p.role}`}>{p.role}</span>
                            </div>
                            <div className="pp-actions">
                                {p.isMuted && <span className="mute-indicator" title="Muted">🔇</span>}
                                {isSpotlit && <span className="spotlight-indicator" title="Spotlighted">✨</span>}
                                {myRole === 'teacher' && !isMe && (
                                    <button
                                        className={`pp-mute-btn ${p.isMuted ? 'pp-mute-btn-muted' : ''}`}
                                        onClick={(e) => { e.stopPropagation(); onMuteParticipant(p.socketId, !p.isMuted); }}
                                        title={p.isMuted ? 'Unmute' : 'Mute'}
                                    >
                                        {p.isMuted ? '🔊' : '🔇'}
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
