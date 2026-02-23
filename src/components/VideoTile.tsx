import { useEffect, useRef } from 'react';

interface Props {
    stream: MediaStream | null;
    name: string;
    isLocal?: boolean;
    muted?: boolean;
}

export default function VideoTile({ stream, name, isLocal = false, muted = false }: Props) {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    return (
        <div className={`video-tile ${isLocal ? 'video-tile-local' : ''}`}>
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted={muted || isLocal}
                className="video-element"
            />
            {!stream && (
                <div className="video-placeholder">
                    <div className="video-avatar">{name.charAt(0).toUpperCase()}</div>
                </div>
            )}
            <div className="video-label">
                <span className="video-name">{name}</span>
                {isLocal && <span className="badge-you">You</span>}
            </div>
        </div>
    );
}
