import { useState, useEffect } from 'react';

interface Props {
    currentVideoId?: string;
    currentAudioId?: string;
    onApply: (videoId: string | null, audioId: string | null) => void;
    onClose: () => void;
}

export default function DevicePicker({ currentVideoId, currentAudioId, onApply, onClose }: Props) {
    const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
    const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
    const [selectedCamera, setSelectedCamera] = useState(currentVideoId || '');
    const [selectedMic, setSelectedMic] = useState(currentAudioId || '');

    useEffect(() => {
        navigator.mediaDevices.enumerateDevices().then((devices) => {
            setCameras(devices.filter((d) => d.kind === 'videoinput'));
            setMics(devices.filter((d) => d.kind === 'audioinput'));
        });
    }, []);

    const handleApply = () => {
        onApply(selectedCamera || null, selectedMic || null);
        onClose();
    };

    return (
        <div className="device-picker-overlay" onClick={onClose}>
            <div className="device-picker-card" onClick={(e) => e.stopPropagation()}>
                <div className="dp-header">
                    <span>⚙️ Device Settings</span>
                    <button className="dp-close-btn" onClick={onClose}>✕</button>
                </div>

                <div className="dp-section">
                    <label className="dp-label">📷 Camera</label>
                    <select
                        className="dp-select"
                        value={selectedCamera}
                        onChange={(e) => setSelectedCamera(e.target.value)}
                    >
                        <option value="">Default Camera</option>
                        {cameras.map((c) => (
                            <option key={c.deviceId} value={c.deviceId}>
                                {c.label || `Camera ${cameras.indexOf(c) + 1}`}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="dp-section">
                    <label className="dp-label">🎙️ Microphone</label>
                    <select
                        className="dp-select"
                        value={selectedMic}
                        onChange={(e) => setSelectedMic(e.target.value)}
                    >
                        <option value="">Default Microphone</option>
                        {mics.map((m) => (
                            <option key={m.deviceId} value={m.deviceId}>
                                {m.label || `Microphone ${mics.indexOf(m) + 1}`}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="dp-actions">
                    <button className="btn btn-outline" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleApply}>Apply</button>
                </div>
            </div>
        </div>
    );
}
