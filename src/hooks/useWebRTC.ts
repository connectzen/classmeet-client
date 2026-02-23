import { useEffect, useRef, useState, useCallback } from 'react';

const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
];

interface UseWebRTCOptions {
    localStream: MediaStream | null;
    onSendSignal: (to: string, signal: unknown) => void;
}

export function useWebRTC({ localStream, onSendSignal }: UseWebRTCOptions) {
    // Map socketId -> RTCPeerConnection
    const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
    // Map socketId -> MediaStream
    const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

    // Always-current refs so callbacks are stable and never stale
    const localStreamRef = useRef<MediaStream | null>(localStream);
    const onSendSignalRef = useRef(onSendSignal);
    localStreamRef.current = localStream;
    onSendSignalRef.current = onSendSignal;

    const removePeer = useCallback((remoteSocketId: string) => {
        const peer = peersRef.current.get(remoteSocketId);
        peer?.close();
        peersRef.current.delete(remoteSocketId);
        setRemoteStreams((prev) => {
            const next = new Map(prev);
            next.delete(remoteSocketId);
            return next;
        });
    }, []);

    // Stable: reads localStreamRef/onSendSignalRef at call-time, never goes stale
    const createPeer = useCallback((remoteSocketId: string, initiator: boolean): RTCPeerConnection => {
        const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });

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

        // Remote stream
        peer.ontrack = (event) => {
            const [remoteStream] = event.streams;
            setRemoteStreams((prev) => new Map(prev).set(remoteSocketId, remoteStream));
        };

        peer.onconnectionstatechange = () => {
            if (peer.connectionState === 'failed' || peer.connectionState === 'closed') {
                removePeer(remoteSocketId);
            }
        };

        peersRef.current.set(remoteSocketId, peer);

        // Only the initiator ever sends offers (including renegotiation offers).
        // onnegotiationneeded fires after addTrack — now AND whenever new tracks
        // are added later (e.g. when localStream arrives after peer creation).
        if (initiator) {
            peer.onnegotiationneeded = async () => {
                try {
                    // If already negotiating, bail — browser will fire again when stable
                    if (peer.signalingState !== 'stable') return;
                    const offer = await peer.createOffer();
                    // Double-check state after the async gap
                    if (peer.signalingState !== 'stable') return;
                    await peer.setLocalDescription(offer);
                    onSendSignalRef.current(remoteSocketId, { type: 'offer', sdp: offer });
                } catch (e) {
                    console.error('[WebRTC] negotiation error', e);
                }
            };
        }

        return peer;
    }, [removePeer]); // stable — reads latest values via refs

    const handleSignal = useCallback(async ({ from, signal }: { from: string; signal: any }) => {
        let peer = peersRef.current.get(from);

        if (signal.type === 'offer') {
            if (!peer) peer = createPeer(from, false);
            await peer.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            onSendSignalRef.current(from, { type: 'answer', sdp: answer });
        } else if (signal.type === 'answer') {
            await peer?.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        } else if (signal.type === 'ice-candidate') {
            try {
                await peer?.addIceCandidate(new RTCIceCandidate(signal.candidate));
            } catch (_) { }
        }
    }, [createPeer]);

    const initiatePeerConnections = useCallback((existingParticipants: { socketId: string }[]) => {
        existingParticipants.forEach(({ socketId: remoteId }) => {
            if (!peersRef.current.has(remoteId)) {
                createPeer(remoteId, true); // we initiate
            }
        });
    }, [createPeer]);

    const addNewPeer = useCallback((remoteSocketId: string) => {
        if (!peersRef.current.has(remoteSocketId)) {
            createPeer(remoteSocketId, false); // they will initiate
        }
    }, [createPeer]);

    // Update tracks on ALL existing peers whenever localStream changes
    // (covers the case where the stream arrives after peers were already created)
    useEffect(() => {
        if (!localStream) return;
        peersRef.current.forEach((peer) => {
            const senders = peer.getSenders();
            localStream.getTracks().forEach((track) => {
                const sender = senders.find((s) => s.track?.kind === track.kind);
                if (sender) sender.replaceTrack(track);
                else peer.addTrack(track, localStream);
            });
        });
    }, [localStream]);

    // Cleanup
    useEffect(() => {
        return () => {
            peersRef.current.forEach((peer) => peer.close());
            peersRef.current.clear();
        };
    }, []);

    return { remoteStreams, handleSignal, initiatePeerConnections, addNewPeer, removePeer };
}
