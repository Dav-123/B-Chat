import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  mediaDevices,
  MediaStream,
  RTCConfiguration,
  RTCOfferOptions,
  RTCIceCandidateType,
} from 'react-native-webrtc';
import { Call, CallStatus, Message } from '@/types';
import { EncryptionService } from './EncryptionService';

// ─── ICE configuration ────────────────────────────────────────────────────────

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type CallEventType = 'incoming' | 'accepted' | 'rejected' | 'ended' | 'remoteStream' | 'error';

export interface CallEvent {
  type: CallEventType;
  call?: Call;
  stream?: MediaStream;
  error?: string;
}

type CallEventCallback = (event: CallEvent) => void;

interface ActiveSession {
  call: Call;
  pc: RTCPeerConnection;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isCameraOff: boolean;
}

// Outbound signal envelope — sent via mesh signalling channel
interface SignalEnvelope {
  kind: 'call_signal';
  type: 'offer' | 'answer' | 'ice' | 'reject' | 'end';
  callId: string;
  callType?: 'voice' | 'video';
  callerId?: string;
  sdp?: RTCSessionDescriptionInit;
  ice?: RTCIceCandidateInit;
}

// ─── CallService ──────────────────────────────────────────────────────────────

export class CallService {
  private sessions = new Map<string, ActiveSession>();
  private listeners: CallEventCallback[] = [];

  // ── Event bus ─────────────────────────────────────────────────────────────

  on(callback: CallEventCallback): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  private emit(event: CallEvent): void {
    // Emit asynchronously to avoid blocking the caller
    setTimeout(() => this.listeners.forEach((l) => l(event)), 0);
  }

  // ── Initiate call ─────────────────────────────────────────────────────────

  async initiateCall(
    callerId: string,
    receiverId: string,
    type: 'voice' | 'video',
    targetDeviceId: string,
    sendSignal: (targetDeviceId: string, signal: SignalEnvelope) => Promise<void>
  ): Promise<Call> {
    const callId = await EncryptionService.generateSecureId();
    const call: Call = {
      id: callId,
      type,
      callerId,
      receiverId,
      status: 'ringing',
      startedAt: Date.now(),
      meshRoute: [targetDeviceId],
    };

    const localStream = await this.acquireLocalStream(type === 'video');
    const pc = this.createPeerConnection(callId);

    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

    pc.onicecandidate = async ({ candidate }) => {
      if (!candidate) return;
      await sendSignal(targetDeviceId, {
        kind: 'call_signal',
        type: 'ice',
        callId,
        ice: candidate.toJSON(),
      }).catch((e) => console.warn('[Call] ICE send failed:', e));
    };

    pc.ontrack = ({ streams }) => {
      const session = this.sessions.get(callId);
      if (session && streams[0]) {
        session.remoteStream = streams[0];
        this.sessions.set(callId, session);
        this.emit({ type: 'remoteStream', call, stream: streams[0] });
      }
    };

    const offerOptions: RTCOfferOptions = {
      offerToReceiveAudio: true,
      offerToReceiveVideo: type === 'video',
    };
    const offer = await pc.createOffer(offerOptions);
    await pc.setLocalDescription(offer);

    this.sessions.set(callId, {
      call, pc, localStream, remoteStream: null,
      isMuted: false, isCameraOff: false,
    });

    await sendSignal(targetDeviceId, {
      kind: 'call_signal',
      type: 'offer',
      callId,
      callType: type,
      callerId,
      sdp: { type: offer.type, sdp: offer.sdp ?? '' },
    });

    return call;
  }

  // ── Accept incoming call ───────────────────────────────────────────────────

  async acceptCall(
    callId: string,
    targetDeviceId: string,
    sendSignal: (targetDeviceId: string, signal: SignalEnvelope) => Promise<void>
  ): Promise<MediaStream | null> {
    const session = this.sessions.get(callId);
    if (!session) { console.warn('[Call] acceptCall — session not found:', callId); return null; }

    const localStream = await this.acquireLocalStream(session.call.type === 'video');
    localStream.getTracks().forEach((track) => session.pc.addTrack(track, localStream));
    session.localStream = localStream;

    const answer = await session.pc.createAnswer();
    await session.pc.setLocalDescription(answer);
    this.sessions.set(callId, { ...session, call: { ...session.call, status: 'accepted' } });

    await sendSignal(targetDeviceId, {
      kind: 'call_signal',
      type: 'answer',
      callId,
      sdp: { type: answer.type, sdp: answer.sdp ?? '' },
    });

    this.emit({ type: 'accepted', call: session.call });
    return localStream;
  }

  // ── Reject call ───────────────────────────────────────────────────────────

  async rejectCall(
    callId: string,
    targetDeviceId: string,
    sendSignal: (targetDeviceId: string, signal: SignalEnvelope) => Promise<void>
  ): Promise<void> {
    await sendSignal(targetDeviceId, { kind: 'call_signal', type: 'reject', callId });
    this.cleanupSession(callId);
    this.emit({ type: 'rejected' });
  }

  // ── End call ──────────────────────────────────────────────────────────────

  async endCall(
    callId: string,
    targetDeviceId: string,
    sendSignal: (targetDeviceId: string, signal: SignalEnvelope) => Promise<void>
  ): Promise<void> {
    await sendSignal(targetDeviceId, { kind: 'call_signal', type: 'end', callId })
      .catch(() => {});
    this.cleanupSession(callId);
    this.emit({ type: 'ended' });
  }

  // ── Handle incoming signal ────────────────────────────────────────────────

  async handleSignal(
    signal: SignalEnvelope,
    sendSignal: (targetDeviceId: string, s: SignalEnvelope) => Promise<void>
  ): Promise<void> {
    const { callId, type } = signal;

    switch (type) {
      case 'offer': {
        if (!signal.sdp || !signal.callerId) return;
        const call: Call = {
          id: callId,
          type: signal.callType ?? 'voice',
          callerId: signal.callerId,
          receiverId: '',
          status: 'ringing',
          meshRoute: [],
        };

        const pc = this.createPeerConnection(callId);
        pc.onicecandidate = async ({ candidate }) => {
          if (!candidate) return;
          await sendSignal(signal.callerId!, {
            kind: 'call_signal', type: 'ice', callId, ice: candidate.toJSON(),
          }).catch(() => {});
        };
        pc.ontrack = ({ streams }) => {
          const session = this.sessions.get(callId);
          if (session && streams[0]) {
            session.remoteStream = streams[0];
            this.sessions.set(callId, session);
            this.emit({ type: 'remoteStream', call, stream: streams[0] });
          }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        this.sessions.set(callId, { call, pc, localStream: null, remoteStream: null, isMuted: false, isCameraOff: false });
        this.emit({ type: 'incoming', call });
        break;
      }

      case 'answer': {
        const session = this.sessions.get(callId);
        if (!session?.call || !signal.sdp) return;
        try {
          await session.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        } catch (e) {
          console.error('[Call] setRemoteDescription (answer) failed:', e);
        }
        break;
      }

      case 'ice': {
        const session = this.sessions.get(callId);
        if (!session?.pc || !signal.ice) return;
        try {
          await session.pc.addIceCandidate(new RTCIceCandidate(signal.ice));
        } catch (e) {
          console.warn('[Call] addIceCandidate failed:', e);
        }
        break;
      }

      case 'reject':
        this.cleanupSession(callId);
        this.emit({ type: 'rejected' });
        break;

      case 'end':
        this.cleanupSession(callId);
        this.emit({ type: 'ended' });
        break;
    }
  }

  // ── Media controls ────────────────────────────────────────────────────────

  toggleMute(callId: string): boolean {
    const session = this.sessions.get(callId);
    if (!session?.localStream) return false;

    const isMuted = !session.isMuted;
    session.localStream.getAudioTracks().forEach((t) => { t.enabled = !isMuted; });
    this.sessions.set(callId, { ...session, isMuted });
    return isMuted;
  }

  toggleCamera(callId: string): void {
    const session = this.sessions.get(callId);
    if (!session?.localStream) return;

    const isCameraOff = !session.isCameraOff;
    session.localStream.getVideoTracks().forEach((t) => { t.enabled = !isCameraOff; });
    this.sessions.set(callId, { ...session, isCameraOff });
  }

  /**
   * Switch between front and back camera.
   * react-native-webrtc exposes _switchCamera on the video track in current versions.
   */
  switchCamera(callId: string): void {
    const session = this.sessions.get(callId);
    if (!session?.localStream) return;
    const videoTrack = session.localStream.getVideoTracks()[0] as any;
    if (typeof videoTrack?._switchCamera === 'function') {
      videoTrack._switchCamera();
    }
  }

  getLocalStream(callId: string): MediaStream | null {
    return this.sessions.get(callId)?.localStream ?? null;
  }

  getRemoteStream(callId: string): MediaStream | null {
    return this.sessions.get(callId)?.remoteStream ?? null;
  }

  getSession(callId: string): ActiveSession | undefined {
    return this.sessions.get(callId);
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private createPeerConnection(callId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection(ICE_CONFIG);

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      console.log(`[Call] ICE state (${callId}):`, state);
      if (state === 'failed') {
        pc.restartIce?.();
      }
      if (state === 'disconnected') {
        // Give 10 s for reconnect before tearing down
        setTimeout(() => {
          if (this.sessions.get(callId)?.pc === pc && pc.iceConnectionState === 'disconnected') {
            this.cleanupSession(callId);
            this.emit({ type: 'ended' });
          }
        }, 10_000);
      }
    };

    return pc;
  }

  private async acquireLocalStream(includeVideo: boolean): Promise<MediaStream> {
    const constraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: includeVideo
        ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { max: 30 } }
        : false,
    };
    const stream = await (mediaDevices as any).getUserMedia(constraints) as MediaStream;
    return stream;
  }

  private cleanupSession(callId: string): void {
    const session = this.sessions.get(callId);
    if (!session) return;

    try {
      session.localStream?.getTracks().forEach((t) => t.stop());
      session.remoteStream?.getTracks().forEach((t) => t.stop());
      session.pc.close();
    } catch (e) {
      console.warn('[Call] Cleanup error:', e);
    }

    this.sessions.delete(callId);
  }

  // ── Destroy all sessions ──────────────────────────────────────────────────

  destroyAll(): void {
    for (const callId of this.sessions.keys()) {
      this.cleanupSession(callId);
    }
    this.listeners = [];
  }
}

export const callService = new CallService();