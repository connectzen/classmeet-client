import { useEffect, useRef, useState, useCallback } from 'react';

const ICE_SERVERS: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
];

// Add TURN server if configured (required for symmetric NAT traversal)
const turnUrl = import.meta.env.VITE_TURN_URL;
if (turnUrl) {
    ICE_SERVERS.push({
        urls: turnUrl,
        username: import.meta.env.VITE_TURN_USERNAME || '',
        credential: import.meta.env.VITE_TURN_CREDENTIAL || '',
    });
}

interface UseWebRTCOptions {
    localStream: MediaStream | null;
    onSendSignal: (to: string, signal: unknown) => void;
}

interface PeerEntry {
    peer: RTCPeerConnection;
    polite: boolean;       // true = yields during glare; false = ignores incoming during glare
    makingOffer: boolean;  // true while onnegotiationneeded is mid-flight
}

export function useWebRTC({ localStream, onSendSignal }: UseWebRTCOptions) {
    // Map socketId -> PeerEntry (peer connection + negotiation metadata)
    const peersRef = useRef<Map<string, PeerEntry>>(new Map());
    // Map socketId -> MediaStream
    const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

    // Always-current refs so callbacks are stable and never stale
    const localStreamRef = useRef<MediaStream | null>(localStream);
    const onSendSignalRef = useRef(onSendSignal);
    localStreamRef.current = localStream;
    onSendSignalRef.current = onSendSignal;

    const removePeer = useCallback((remoteSocketId: string) => {
        const entry = peersRef.current.get(remoteSocketId);
        entry?.peer.close();
        peersRef.current.delete(remoteSocketId);
        setRemoteStreams((prev) => {
            const next = new Map(prev);
            next.delete(remoteSocketId);
            return next;
        });
    }, []);

    // Stable: reads localStreamRef/onSendSignalRef at call-time, never goes stale.
    // `polite` determines this peer's role in the Perfect Negotiation pattern:
    //   - polite (true):  yields during offer collision (rolls back own offer)
    //   - impolite (false): ignores incoming offers during collision
    const createPeer = useCallback((remoteSocketId: string, polite: boolean): PeerEntry => {
        const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        const entry: PeerEntry = { peer, polite, makingOffer: false };

        // Add local tracks using the latest stream available right now
        const stream = localStreamRef.current;
        if (stream) {
            stream.getTracks().forEach((track) => peer.addTrack(track, stream));
        }

        // ICE candidate
        peer.onicecandidate = (event) => {
            if (event.candidate) {
                onSendSignalRef.current(remoteSocketId, { type: 'ice-candidate', candidate: event.candidate });
            }
        };

        // Remote stream — handle the case where event.streams is empty (some browsers)
        peer.ontrack = (event) => {
            const remoteStream = event.streams[0];
            if (remoteStream) {
                setRemoteStreams((prev) => new Map(prev).set(remoteSocketId, remoteStream));
            } else {
                // Accumulate individual tracks into a single MediaStream for this peer
                setRemoteStreams((prev) => {
                    const existing = prev.get(remoteSocketId) || new MediaStream();
                    existing.addTrack(event.track);
                    return new Map(prev).set(remoteSocketId, existing);
                });
            }
        };

        peer.onconnectionstatechange = () => {
            if (peer.connectionState === 'failed' || peer.connectionState === 'closed') {
                removePeer(remoteSocketId);
            }
        };

        // Perfect Negotiation: ALL peers handle onnegotiationneeded.
        // The makingOffer flag + polite/impolite roles in handleSignal prevent glare loops.
        peer.onnegotiationneeded = async () => {
            try {
                entry.makingOffer = true;
                const offer = await peer.createOffer();
                await peer.setLocalDescription(offer);
                onSendSignalRef.current(remoteSocketId, { type: 'offer', sdp: peer.localDescription });
            } catch (e) {
                console.error('[WebRTC] negotiation error', e);
            } finally {
                entry.makingOffer = false;
            }
        };

        peersRef.current.set(remoteSocketId, entry);
        return entry;
    }, [removePeer]); // stable — reads latest values via refs

    // Perfect Negotiation signal handler
    const handleSignal = useCallback(async ({ from, signal }: { from: string; signal: any }) => {
        let entry = peersRef.current.get(from);

        if (signal.type === 'offer') {
            if (!entry) {
                // Peer we haven't seen yet — they initiated, so we are polite
                entry = createPeer(from, true);
            }
            const { peer, polite, makingOffer } = entry;

            // Detect collision: we're mid-offer or not yet stable
            const offerCollision = makingOffer || peer.signalingState !== 'stable';

            if (!polite && offerCollision) {
                // Impolite peer: ignore the incoming offer during collision
                return;
            }

            // Polite peer (or no collision): accept the offer.
            // setRemoteDescription implicitly rolls back any pending local offer.
            await peer.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            onSendSignalRef.current(from, { type: 'answer', sdp: peer.localDescription });

        } else if (signal.type === 'answer') {
            if (!entry) return;
            try {
                await entry.peer.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            } catch (e) {
                // Ignore stale answers from rolled-back offers
                console.warn('[WebRTC] ignoring stale answer', e);
            }

        } else if (signal.type === 'ice-candidate') {
            try {
                await entry?.peer.addIceCandidate(new RTCIceCandidate(signal.candidate));
            } catch (_) { }
        }
    }, [createPeer]);

    const initiatePeerConnections = useCallback((existingParticipants: { socketId: string }[]) => {
        existingParticipants.forEach(({ socketId: remoteId }) => {
            if (!peersRef.current.has(remoteId)) {
                createPeer(remoteId, false); // we initiate → we are impolite
            }
        });
    }, [createPeer]);

    const addNewPeer = useCallback((remoteSocketId: string) => {
        if (!peersRef.current.has(remoteSocketId)) {
            createPeer(remoteSocketId, true); // they will initiate → we are polite
        }
    }, [createPeer]);

    // Update tracks on ALL existing peers whenever localStream changes
    // (covers the case where the stream arrives after peers were already created,
    //  or when the user switches camera/mic via the device picker)
    useEffect(() => {
        if (!localStream) return;
        peersRef.current.forEach(async (entry) => {
            const { peer } = entry;
            const senders = peer.getSenders();
            for (const track of localStream.getTracks()) {
                const sender = senders.find((s) => s.track?.kind === track.kind);
                if (sender) {
                    try {
                        await sender.replaceTrack(track);
                    } catch (e) {
                        console.warn('[WebRTC] replaceTrack failed, adding track instead', e);
                        try { peer.addTrack(track, localStream); } catch { /* already added */ }
                    }
                } else {
                    peer.addTrack(track, localStream); // triggers onnegotiationneeded
                }
            }
        });
    }, [localStream]);

    // Cleanup
    useEffect(() => {
        return () => {
            peersRef.current.forEach((entry) => entry.peer.close());
            peersRef.current.clear();
        };
    }, []);

    return { remoteStreams, handleSignal, initiatePeerConnections, addNewPeer, removePeer };
}
