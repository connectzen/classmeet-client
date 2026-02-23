import VideoTile from './VideoTile';

interface RemoteParticipant {
    socketId: string;
    name: string;
    stream: MediaStream | null;
}

interface Props {
    localStream: MediaStream | null;
    localName: string;
    remoteParticipants: RemoteParticipant[];
}

export default function VideoGrid({ localStream, localName, remoteParticipants }: Props) {
    const total = 1 + remoteParticipants.length;

    const gridClass =
        total === 1 ? 'grid-1' :
            total === 2 ? 'grid-2' :
                total === 3 ? 'grid-3' :
                    total === 4 ? 'grid-4' :
                        'grid-5';

    return (
        <div className={`video-grid ${gridClass}`}>
            <VideoTile
                stream={localStream}
                name={localName}
                isLocal
                muted
            />
            {remoteParticipants.map((p) => (
                <VideoTile
                    key={p.socketId}
                    stream={p.stream}
                    name={p.name}
                />
            ))}
        </div>
    );
}
