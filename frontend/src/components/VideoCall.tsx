import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Monitor,
  Camera, Users,
} from "lucide-react";
import { useChatStore } from "@/stores/chatStore";
import { useTranslation } from "@/i18n/context";
import { chatAPI } from "@/lib/api";
import { cn } from "@/lib/utils";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];

interface Props {
  onClose: () => void;
}

interface PeerInfo {
  username: string;
  stream: MediaStream | null;
  hasVideo: boolean;
}

export function VideoCall({ onClose }: Props) {
  const { t } = useTranslation();
  const { activeCall, incomingCall, setIncomingCall, setActiveCall, userProfiles } = useChatStore();

  const [state, setState] = useState<"ringing" | "calling" | "connected" | "ended">(
    incomingCall ? "ringing" : "calling",
  );
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [hasCamera, setHasCamera] = useState(false);
  const [mobileFacingMode, setMobileFacingMode] = useState<"user" | "environment">("user");

  // Group call state
  const [callRoomId, setCallRoomId] = useState<string>(activeCall?.roomId ?? "");
  const [remotePeers, setRemotePeers] = useState<PeerInfo[]>([]);

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const callIdRef = useRef<string>(incomingCall?.callId ?? "");
  const startTimeRef = useRef<number>(0);
  const acceptedRef = useRef(false);

  const peerName =
    activeCall?.peer ?? incomingCall?.from ?? "";
  const peerDisplayName =
    userProfiles[peerName]?.display_name || peerName;
  const isMobile =
    typeof window !== "undefined" && window.innerWidth < 768;

  // Ringtone
  const ringtoneRef = useRef<{ osc: OscillatorNode | null; ctx: AudioContext | null; interval: ReturnType<typeof setInterval> | null }>({
    osc: null, ctx: null, interval: null,
  });

  const startRingtone = useCallback(() => {
    try {
      const ctx = new AudioContext();
      ringtoneRef.current.ctx = ctx;
      const play = () => {
        if (!ringtoneRef.current.ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
      };
      play();
      ringtoneRef.current.interval = setInterval(() => { play(); }, 1500);
    } catch { /* audio not available */ }
  }, []);

  const stopRingtone = useCallback(() => {
    if (ringtoneRef.current.interval) {
      clearInterval(ringtoneRef.current.interval);
      ringtoneRef.current.interval = null;
    }
    if (ringtoneRef.current.ctx) {
      ringtoneRef.current.ctx.close().catch(() => {});
      ringtoneRef.current.ctx = null;
    }
  }, []);

  // Timer
  useEffect(() => {
    if (state !== "connected") return;
    startTimeRef.current = Date.now();
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [state]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  // Create a single PC (for 1:1 calls)
  const createPeer = useCallback(() => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerRef.current = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        const candidate = JSON.stringify(e.candidate);
        if (callRoomId) {
          chatAPI.sendCallIceCandidate(callIdRef.current, candidate, callRoomId, peerName);
        } else {
          chatAPI.sendCallIceCandidate(callIdRef.current, candidate);
        }
      }
    };

    pc.ontrack = (e) => {
      setRemotePeers((prev) =>
        prev.map((p) =>
          p.username === peerName ? { ...p, stream: e.streams[0] || null, hasVideo: true } : p,
        ),
      );
      if (remoteVideoRef.current && e.streams[0]) {
        remoteVideoRef.current.srcObject = e.streams[0];
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        // In group call, just remove this peer; in 1:1, end the call
        if (callRoomId) {
          removePeer(peerName);
        } else {
          setState("ended");
        }
      }
    };

    return pc;
  }, [callRoomId, peerName]);

  // Create a PC for a specific peer in a group call
  const createPeerForUser = useCallback((username: string) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        const candidate = JSON.stringify(e.candidate);
        chatAPI.sendCallIceCandidate(callIdRef.current, candidate, callRoomId, username);
      }
    };

    pc.ontrack = (e) => {
      if (e.streams[0]) {
        remoteStreamsRef.current.set(username, e.streams[0]);
        setRemotePeers((prev) => {
          const existing = prev.find((p) => p.username === username);
          if (existing) {
            return prev.map((p) =>
              p.username === username ? { ...p, stream: e.streams[0], hasVideo: true } : p,
            );
          }
          return [...prev, { username, stream: e.streams[0], hasVideo: true }];
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        removePeer(username);
      }
    };

    peersRef.current.set(username, pc);
    return pc;
  }, [callRoomId]);

  // Remove a peer (close PC, remove stream)
  const removePeer = useCallback((username: string) => {
    const pc = peersRef.current.get(username);
    if (pc) {
      pc.close();
      peersRef.current.delete(username);
    }
    remoteStreamsRef.current.delete(username);
    setRemotePeers((prev) => prev.filter((p) => p.username !== username));
  }, []);

  // Set up local stream
  const setupLocalStream = useCallback(async (videoEnabled: boolean) => {
    try {
      const constraints: MediaStreamConstraints = {
        audio: true,
        video: videoEnabled
          ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: mobileFacingMode }
          : false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      setHasCamera(videoEnabled && stream.getVideoTracks().length > 0);
      return stream;
    } catch {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        setHasCamera(false);
        return stream;
      } catch {
        return null;
      }
    }
  }, [mobileFacingMode]);

  // Toggle screen share
  const toggleScreenShare = useCallback(async () => {
    if (screenSharing) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } },
          audio: true,
        });
        // Replace in all PCs
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          for (const pc of peersRef.current.values()) {
            const sender = pc.getSenders().find((s) => s.track?.kind === "video");
            if (sender) sender.replaceTrack(videoTrack).catch(() => {});
          }
          if (peerRef.current) {
            const sender = peerRef.current.getSenders().find((s) => s.track?.kind === "video");
            if (sender) sender.replaceTrack(videoTrack).catch(() => {});
          }
        }
        localStreamRef.current?.getTracks().forEach((t) => t.stop());
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      } catch { /* ignore */ }
      setScreenSharing(false);
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const videoTrack = screenStream.getVideoTracks()[0];
        if (videoTrack) {
          for (const pc of peersRef.current.values()) {
            const sender = pc.getSenders().find((s) => s.track?.kind === "video");
            if (sender) sender.replaceTrack(videoTrack).catch(() => {});
          }
          if (peerRef.current) {
            const sender = peerRef.current.getSenders().find((s) => s.track?.kind === "video");
            if (sender) sender.replaceTrack(videoTrack).catch(() => {});
          }
        }
        videoTrack.onended = () => setScreenSharing(false);
        setScreenSharing(true);
      } catch { /* user cancelled */ }
    }
  }, [screenSharing]);

  // Toggle mute
  const toggleMic = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = micMuted;
        setMicMuted(!micMuted);
      }
    }
  }, [micMuted]);

  // Toggle camera
  const toggleCamera = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = cameraOff;
        setCameraOff(!cameraOff);
      }
    }
  }, [cameraOff]);

  // Switch camera (mobile)
  const switchCamera = useCallback(() => {
    setMobileFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  }, []);

  // Re-setup facingMode on mobile
  useEffect(() => {
    if (!localStreamRef.current) return;
    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (!videoTrack) return;
    videoTrack.stop();
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: mobileFacingMode, width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    }).then((stream) => {
      const newVideoTrack = stream.getVideoTracks()[0];
      localStreamRef.current?.removeTrack(videoTrack);
      if (newVideoTrack && localStreamRef.current) {
        localStreamRef.current.addTrack(newVideoTrack);
        for (const pc of peersRef.current.values()) {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          if (sender) sender.replaceTrack(newVideoTrack).catch(() => {});
        }
        if (peerRef.current) {
          const sender = peerRef.current.getSenders().find((s) => s.track?.kind === "video");
          if (sender) sender.replaceTrack(newVideoTrack).catch(() => {});
        }
      }
    }).catch(() => {});
  }, [mobileFacingMode]);

  // ─── 1:1 Call: Initiate ───
  const initiateCall = useCallback(async () => {
    const stream = await setupLocalStream(activeCall?.callType === "video");
    if (!stream) { setState("ended"); return; }

    const pc = createPeer();
    stream.getTracks().forEach((track) => { pc.addTrack(track, stream); });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const callId = crypto.randomUUID();
    callIdRef.current = callId;
    setActiveCall({ ...activeCall!, callId });

    chatAPI.sendCallStart(activeCall!.peer, activeCall!.callType, JSON.stringify(offer));
    setState("calling");
  }, [activeCall, createPeer, setActiveCall, setupLocalStream]);

  // ─── 1:1 Call: Accept ───
  const acceptCall = useCallback(async () => {
    if (!incomingCall) return;
    stopRingtone();

    const stream = await setupLocalStream(incomingCall.callType === "video");
    if (!stream) return;

    const pc = createPeer();
    stream.getTracks().forEach((track) => { pc.addTrack(track, stream); });

    callIdRef.current = incomingCall.callId;

    const offer = JSON.parse(incomingCall.sdp);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    chatAPI.sendCallAccept(incomingCall.callId, JSON.stringify(answer));
    setState("connected");
    acceptedRef.current = true;

    setRemotePeers([{ username: incomingCall.from, stream: null, hasVideo: false }]);

    setActiveCall({
      callId: incomingCall.callId,
      peer: incomingCall.from,
      callType: incomingCall.callType as "video" | "voice",
      startTime: Date.now(),
    });
    setIncomingCall(null);
  }, [incomingCall, createPeer, setActiveCall, setIncomingCall, setupLocalStream, stopRingtone]);

  // ─── Group Call: Start room creation ───
  const startGroupCall = useCallback(async () => {
    if (!activeCall?.isGroupCall || !activeCall?.participants) return;

    const stream = await setupLocalStream(activeCall.callType === "video");
    if (!stream) { setState("ended"); return; }

    chatAPI.sendCallRoomCreate(activeCall.participants!, activeCall.callType);
  }, [activeCall, setupLocalStream]);

  // ─── Group Call: Join room ───
  const joinGroupCall = useCallback(async () => {
    if (!(incomingCall as unknown as Record<string, unknown>)["room_id"]) return;
    stopRingtone();

    const stream = await setupLocalStream(
      ((incomingCall as unknown as Record<string, unknown>)["call_type"] as string) === "video",
    );
    if (!stream) return;

    const roomId = (incomingCall as unknown as Record<string, unknown>)["room_id"] as string;
    setCallRoomId(roomId);
    callIdRef.current = roomId;

    chatAPI.sendCallRoomJoin(roomId);

    setState("connected");
    acceptedRef.current = true;

    setActiveCall({
      callId: roomId,
      peer: (incomingCall as unknown as Record<string, unknown>)["from"] as string || "",
      callType: ((incomingCall as unknown as Record<string, unknown>)["call_type"] as "video" | "voice") || "voice",
      startTime: Date.now(),
      isGroupCall: true,
      roomId,
    });
    setIncomingCall(null);
  }, [incomingCall, setActiveCall, setIncomingCall, setupLocalStream, stopRingtone]);

  // ─── Group Call: Create offer to a peer ───
  const createOfferToPeer = useCallback(async (username: string) => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const pc = createPeerForUser(username);
    stream.getTracks().forEach((track) => { pc.addTrack(track, stream); });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    chatAPI.sendCallStart(username, activeCall?.callType || "video", JSON.stringify(offer), callRoomId);
  }, [activeCall, callRoomId, createPeerForUser]);

  // ─── Group Call: Auto-answer incoming room call ───
  const handleRoomIncomingCall = useCallback(async (msg: Record<string, unknown>) => {
    const from = msg.from as string;
    const sdp = msg.sdp as string;
    const callId = msg.call_id as string;
    if (!from || !sdp) return;

    const stream = localStreamRef.current;
    if (!stream) return;

    // Check if we already have a PC for this user
    if (peersRef.current.has(from)) return;

    const pc = createPeerForUser(from);
    stream.getTracks().forEach((track) => { pc.addTrack(track, stream); });

    const offer = JSON.parse(sdp);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    chatAPI.sendCallAccept(callId, JSON.stringify(answer), callRoomId);
  }, [callRoomId, createPeerForUser]);

  // ─── Reject ───
  const rejectCall = useCallback(() => {
    stopRingtone();
    if (incomingCall) {
      chatAPI.sendCallReject(incomingCall.callId);
    }
    setIncomingCall(null);
    onClose();
  }, [incomingCall, setIncomingCall, onClose, stopRingtone]);

  // ─── End Call ───
  const endCall = useCallback(() => {
    // Close all group call PCs
    for (const [, pc] of peersRef.current.entries()) {
      chatAPI.sendCallEnd(callIdRef.current, callRoomId);
      pc.close();
    }
    peersRef.current.clear();
    remoteStreamsRef.current.clear();

    // Close 1:1 PC
    if (peerRef.current) {
      if (callIdRef.current) chatAPI.sendCallEnd(callIdRef.current);
      peerRef.current.close();
    }

    // Leave room
    if (callRoomId) {
      chatAPI.sendCallRoomLeave(callRoomId);
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
    }

    stopRingtone();
    setActiveCall(null);
    setIncomingCall(null);
    if (state !== "ended") setState("ended");
    setTimeout(() => onClose(), 1500);
  }, [onClose, setActiveCall, setIncomingCall, stopRingtone, state, callRoomId]);

  // ─── WebSocket event listeners ───
  useEffect(() => {
    const unsubs: (() => void)[] = [];

    // 1:1 call_accepted
    unsubs.push(
      chatAPI.on("call_accepted", (msg) => {
        const m = msg as unknown as { call_id: string; sdp: string; room_id?: string };
        if (m.room_id && m.room_id === callRoomId) {
          // Group call: auto-handle
          const answer = JSON.parse(m.sdp);
          const from = (msg as unknown as { from: string }).from;
          const pc = peersRef.current.get(from);
          if (pc && pc.signalingState !== "stable") {
            pc.setRemoteDescription(new RTCSessionDescription(answer)).catch(() => {});
          }
          return;
        }
        if (m.call_id !== callIdRef.current) return;
        stopRingtone();
        const answer = JSON.parse(m.sdp);
        peerRef.current?.setRemoteDescription(new RTCSessionDescription(answer)).catch(() => {});
        setState("connected");
      }),
    );

    // call_rejected
    unsubs.push(
      chatAPI.on("call_rejected", () => {
        stopRingtone();
        setState("ended");
        setTimeout(() => onClose(), 1500);
      }),
    );

    // call_ended
    unsubs.push(
      chatAPI.on("call_ended", (msg) => {
        const m = msg as unknown as { call_id: string; room_id?: string; from?: string };
        if (m.room_id && m.room_id === callRoomId && m.from) {
          // Group call: just remove that peer
          removePeer(m.from);
          return;
        }
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((t) => t.stop());
        }
        if (peerRef.current) peerRef.current.close();
        setState("ended");
        setTimeout(() => onClose(), 1500);
      }),
    );

    // ICE candidate
    unsubs.push(
      chatAPI.on("call_ice_candidate", (msg) => {
        const m = msg as unknown as { call_id: string; candidate: string; room_id?: string; from?: string };
        if (m.room_id && m.room_id === callRoomId && m.from) {
          const pc = peersRef.current.get(m.from);
          if (pc) {
            try {
              const candidate = JSON.parse(m.candidate);
              pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
            } catch { /* ignore */ }
          }
          return;
        }
        if (m.call_id !== callIdRef.current) return;
        try {
          const candidate = JSON.parse(m.candidate);
          peerRef.current?.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
        } catch { /* ignore */ }
      }),
    );

    // ─── Group call room events ───

    // call_room_created (creator receives room ID)
    unsubs.push(
      chatAPI.on("call_room_created", (msg) => {
        const m = msg as unknown as {
          room_id: string;
          call_participants: string[];
          call_type: string;
        };
        if (!m.room_id) return;
        setCallRoomId(m.room_id);
        callIdRef.current = m.room_id;
        setState("connected");
        acceptedRef.current = true;

        setActiveCall({
          callId: m.room_id,
          peer: "",
          callType: (m.call_type as "video" | "voice") || "video",
          startTime: Date.now(),
          isGroupCall: true,
          roomId: m.room_id,
          participants: m.call_participants,
        });

        // Create PCs for each participant (excluding self)
        const self = useChatStore.getState().username;
        for (const participant of m.call_participants) {
          if (participant === self) continue;
          setRemotePeers((prev) => [
            ...prev,
            { username: participant, stream: null, hasVideo: false },
          ]);
        }
        // Initiate calls to each participant after a short delay
        setTimeout(() => {
          for (const participant of m.call_participants) {
            if (participant === self) continue;
            createOfferToPeer(participant);
          }
        }, 500);
      }),
    );

    // call_room_invite (received by invitees)
    unsubs.push(
      chatAPI.on("call_room_invite", (msg) => {
        const m = msg as unknown as {
          room_id: string;
          from: string;
          call_type: string;
          call_participants: string[];
        };
        if (!m.room_id) return;
        const state = useChatStore.getState();
        if (state.activeCall || state.incomingCall) {
          return; // busy
        }
        setIncomingCall({
          callId: m.room_id,
          from: m.from,
          callType: (m.call_type as "video" | "voice") || "voice",
          sdp: "",
          ...({ room_id: m.room_id } as unknown as Record<string, unknown>),
        } as unknown as typeof incomingCall);
        setState("ringing");
        startRingtone();
        import("@/lib/sound").then((snd) => snd.playMentionSound());
      }),
    );

    // call_room_joined (joiner receives existing participants)
    unsubs.push(
      chatAPI.on("call_room_joined", (msg) => {
        const m = msg as unknown as {
          room_id: string;
          call_participants: string[];
          username: string;
        };
        if (!m.room_id || m.room_id !== callRoomId) return;
        // Add all existing participants to remote peers
        for (const participant of m.call_participants) {
          if (participant === useChatStore.getState().username) continue;
          setRemotePeers((prev) => {
            if (prev.find((p) => p.username === participant)) return prev;
            return [...prev, { username: participant, stream: null, hasVideo: false }];
          });
        }
        // Initiate calls to each participant
        setTimeout(() => {
          for (const participant of m.call_participants) {
            if (participant === useChatStore.getState().username) continue;
            createOfferToPeer(participant);
          }
        }, 300);
      }),
    );

    // call_room_participant_joined (new participant joins)
    unsubs.push(
      chatAPI.on("call_room_participant_joined", (msg) => {
        const m = msg as unknown as {
          room_id: string;
          username: string;
          call_participants: string[];
        };
        if (!m.room_id || m.room_id !== callRoomId) return;
        const newUser = m.username;
        if (newUser === useChatStore.getState().username) return;
        setRemotePeers((prev) => {
          if (prev.find((p) => p.username === newUser)) return prev;
          return [...prev, { username: newUser, stream: null, hasVideo: false }];
        });
        // Create PC for the new peer
        setTimeout(() => {
          createOfferToPeer(newUser);
        }, 300);
      }),
    );

    // call_room_participant_left
    unsubs.push(
      chatAPI.on("call_room_participant_left", (msg) => {
        const m = msg as unknown as {
          room_id: string;
          username: string;
        };
        if (!m.room_id || m.room_id !== callRoomId) return;
        removePeer(m.username);
      }),
    );

    // Handle incoming 1:1 call (with room_id for group) within room context
    unsubs.push(
      chatAPI.on("call_incoming", (msg) => {
        const m = msg as unknown as {
          call_id: string;
          from: string;
          call_type: string;
          sdp: string;
          room_id?: string;
        };
        if (m.room_id && m.room_id === callRoomId && callRoomId) {
          // Group call incoming — auto accept WebRTC
          handleRoomIncomingCall(m as unknown as Record<string, unknown>);
          return;
        }
        // Standard 1:1 incoming is handled by useWebSocket hook
      }),
    );

    return () => unsubs.forEach((u) => u());
  }, [onClose, stopRingtone, callRoomId, createOfferToPeer, handleRoomIncomingCall, removePeer, setIncomingCall, setActiveCall, startRingtone]);

  // ─── Mount: Determine action ───
  useEffect(() => {
    if (incomingCall) {
      // Check if it's a group call invite
      if ((incomingCall as unknown as Record<string, unknown>)["room_id"]) {
        setState("ringing");
        startRingtone();
        return;
      }
      setState("ringing");
      startRingtone();
      return;
    }
    if (activeCall && !acceptedRef.current) {
      if (activeCall.isGroupCall && activeCall.participants) {
        startGroupCall();
      } else {
        initiateCall();
      }
    }
    return () => {
      stopRingtone();
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRingtone();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      peerRef.current?.close();
      for (const pc of peersRef.current.values()) {
        pc.close();
      }
      peersRef.current.clear();
    };
  }, [stopRingtone]);

  // ─── Grid layout ───
  const gridClass = useMemo(() => {
    const count = remotePeers.length;
    if (count <= 1) return "grid-cols-1";
    if (count === 2) return "grid-cols-2";
    if (count <= 4) return "grid-cols-2";
    return "grid-cols-3";
  }, [remotePeers.length]);

  const peerCount = remotePeers.length;

  // ─── Render: Ended state ───
  if (state === "ended") {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 animate-fade-in">
        <div className="text-center text-white">
          <PhoneOff className="h-16 w-16 mx-auto mb-4 text-red-500" />
          <h2 className="text-xl font-semibold">{t("call.callEnded")}</h2>
          <p className="text-sm text-white/60 mt-1">{formatTime(elapsed)}</p>
        </div>
      </div>
    );
  }

  // ─── Render: Connected (group call or 1:1) ───
  if (state === "connected") {
    const isGrp = !!callRoomId || !!activeCall?.isGroupCall;

    return (
      <div className="fixed inset-0 z-[100] flex flex-col bg-gray-950">
        {/* Remote videos grid */}
        <div className={cn("absolute inset-0 grid gap-1 p-1", gridClass)}>
          {isGrp && remotePeers.length > 0 ? (
            remotePeers.map((peer) => (
              <RemoteVideoTile
                key={peer.username}
                peer={peer}
                userProfiles={userProfiles}
              />
            ))
          ) : (
            <div className="relative w-full h-full">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="h-full w-full object-cover"
              />
            </div>
          )}
          {isGrp && remotePeers.length === 0 && (
            <div className="flex items-center justify-center col-span-full">
              <div className="text-center text-white/60">
                <Users className="h-12 w-12 mx-auto mb-2 opacity-40" />
                <p className="text-sm">{t("call.joiningRoom")}</p>
              </div>
            </div>
          )}
        </div>

        {/* Local video PiP */}
        <LocalVideoPiP
          stream={localStreamRef.current}
          hasCamera={hasCamera}
          micMuted={micMuted}
          cameraOff={cameraOff}
        />

        {/* Timer + participant count */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
          <span className="text-white text-sm font-mono bg-black/50 px-3 py-1 rounded-full">
            {formatTime(elapsed, t)}
          </span>
          {isGrp && peerCount > 0 && (
            <span className="text-white/80 text-xs bg-black/50 px-2 py-1 rounded-full flex items-center gap-1">
              <Users className="h-3 w-3" />
              {peerCount + 1} {t("call.participants")}
            </span>
          )}
        </div>

        {/* Control bar */}
        <div className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-center gap-3 pb-safe pb-6 pt-4 px-4 bg-gradient-to-t from-black/80 to-transparent">
          <ControlButton
            onClick={toggleMic}
            active={!micMuted}
            activeColor="bg-white/20 hover:bg-white/30"
            inactiveColor="bg-red-500 hover:bg-red-400"
            icon={micMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            label={micMuted ? t("call.unmuteMic") : t("call.muteMic")}
          />
          <ControlButton
            onClick={toggleCamera}
            active={!cameraOff}
            activeColor="bg-white/20 hover:bg-white/30"
            inactiveColor="bg-red-500 hover:bg-red-400"
            icon={cameraOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
            label={cameraOff ? t("call.unmuteCamera") : t("call.muteCamera")}
          />
          <ControlButton
            onClick={toggleScreenShare}
            active={!screenSharing}
            activeColor="bg-white/20 hover:bg-white/30"
            inactiveColor="bg-blue-500 hover:bg-blue-400"
            icon={<Monitor className="h-5 w-5" />}
            label={t("call.screenShare")}
          />
          {isMobile && (
            <ControlButton
              onClick={switchCamera}
              active={true}
              activeColor="bg-white/20 hover:bg-white/30"
              inactiveColor="bg-white/20"
              icon={<Camera className="h-5 w-5" />}
              label={t("call.switchCamera")}
            />
          )}
          <button
            onClick={endCall}
            className="flex flex-col items-center gap-1"
            aria-label={t("call.endCall")}
          >
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-500 hover:bg-red-400 transition-colors">
              <PhoneOff className="h-6 w-6 text-white" />
            </div>
            <span className="text-[10px] text-white/60">{t("call.endCall")}</span>
          </button>
        </div>
      </div>
    );
  }

  // ─── Render: Ringing / Calling / Waiting ───
  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-gray-950">
      <div className="absolute inset-0">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="h-full w-full object-cover opacity-0"
        />
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/70">
        <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center mb-4">
          <Phone className={cn(
            "h-10 w-10",
            state === "ringing" ? "text-green-400 animate-pulse" : "text-white/60",
          )} />
        </div>
        <h2 className="text-xl font-semibold text-white mb-1">
          {activeCall?.isGroupCall
            ? (activeCall.groupName || t("call.groupCall"))
            : peerDisplayName}
        </h2>
        <p className="text-sm text-white/60">
          {state === "ringing"
            ? (activeCall?.isGroupCall
              ? `${peerDisplayName} ${t("call.incomingCall", { name: "" })}`
              : t("call.incomingCall", { name: peerDisplayName }))
            : t("call.calling", { name: peerDisplayName })}
        </p>
        <div className="flex gap-6 mt-8">
          {state === "ringing" && (
            <button
              onClick={activeCall?.isGroupCall ? joinGroupCall : acceptCall}
              className="flex items-center justify-center w-16 h-16 rounded-full bg-green-500 hover:bg-green-400 transition-colors"
              aria-label={t("call.acceptCall")}
            >
              <Phone className="h-7 w-7 text-white" />
            </button>
          )}
          <button
            onClick={state === "ringing" ? rejectCall : endCall}
            className="flex items-center justify-center w-16 h-16 rounded-full bg-red-500 hover:bg-red-400 transition-colors"
            aria-label={t("call.rejectCall")}
          >
            <PhoneOff className="h-7 w-7 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───

function ControlButton({
  onClick, active, activeColor, inactiveColor, icon, label,
}: {
  onClick: () => void;
  active: boolean;
  activeColor: string;
  inactiveColor: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1" aria-label={label}>
      <div className={cn(
        "flex items-center justify-center w-12 h-12 rounded-full transition-colors text-white",
        active ? activeColor : inactiveColor,
      )}>
        {icon}
      </div>
      <span className="text-[10px] text-white/60">{label}</span>
    </button>
  );
}

function RemoteVideoTile({
  peer,
  userProfiles,
}: {
  peer: PeerInfo;
  userProfiles: Record<string, { display_name?: string }>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && peer.stream) {
      videoRef.current.srcObject = peer.stream;
    }
  }, [peer.stream]);

  const displayName = userProfiles[peer.username]?.display_name || peer.username;

  return (
    <div className="relative w-full h-full min-h-0 rounded-lg overflow-hidden bg-gray-800">
      {peer.stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="h-full w-full flex items-center justify-center">
          <div className="text-center text-white/40">
            <VideoOff className="h-8 w-8 mx-auto mb-1" />
            <span className="text-xs">{displayName}</span>
          </div>
        </div>
      )}
      {/* Name label */}
      <div className="absolute bottom-2 left-2">
        <span className="text-xs text-white bg-black/50 px-2 py-0.5 rounded-full">
          {displayName}
        </span>
      </div>
    </div>
  );
}

function LocalVideoPiP({
  stream, hasCamera, micMuted, cameraOff,
}: {
  stream: MediaStream | null;
  hasCamera: boolean;
  micMuted: boolean;
  cameraOff: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const handlePointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      offset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    setPos({ x: e.clientX - offset.current.x, y: e.clientY - offset.current.y });
  };

  const handlePointerUp = () => { dragging.current = false; };

  return (
    <div
      ref={containerRef}
      className={cn(
        "absolute z-30 w-36 h-48 md:w-48 md:h-64 rounded-xl overflow-hidden border-2 border-white/20 shadow-2xl cursor-grab active:cursor-grabbing select-none",
      )}
      style={{
        right: pos.x ? undefined : 16,
        bottom: pos.y ? undefined : 100,
        left: pos.x || undefined,
        top: pos.y || undefined,
        transform: pos.x || pos.y ? `translate(${pos.x}px, ${pos.y}px)` : undefined,
        touchAction: "none",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {hasCamera ? (
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover mirror" />
      ) : (
        <div className="h-full w-full flex items-center justify-center bg-gray-800">
          <VideoOff className="h-8 w-8 text-white/40" />
        </div>
      )}
      <div className="absolute bottom-1 left-1 flex gap-1">
        {micMuted && (
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-red-500">
            <MicOff className="h-3 w-3 text-white" />
          </span>
        )}
        {cameraOff && (
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-red-500">
            <VideoOff className="h-3 w-3 text-white" />
          </span>
        )}
      </div>
    </div>
  );
}
