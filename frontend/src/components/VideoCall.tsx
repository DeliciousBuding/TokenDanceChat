import { useEffect, useRef, useState, useCallback } from "react";
import {
  Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Monitor,
  Camera,
} from "lucide-react";
import { useChatStore } from "@/stores/chatStore";
import { useTranslation } from "@/i18n/context";
import { chatAPI } from "@/lib/api";
import { cn } from "@/lib/utils";

// ICE servers -- Google STUN for now
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];

interface Props {
  onClose: () => void;
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
  const [remoteVideoOff, setRemoteVideoOff] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [hasCamera, setHasCamera] = useState(false);
  const [mobileFacingMode, setMobileFacingMode] = useState<"user" | "environment">("user");

  const peerRef = useRef<RTCPeerConnection | null>(null);
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

  // Ringtone oscillator
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
      ringtoneRef.current.interval = setInterval(() => {
        play();
      }, 1500);
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

  // Create peer connection
  const createPeer = useCallback(() => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerRef.current = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        const candidate = JSON.stringify(e.candidate);
        chatAPI.sendCallIceCandidate(callIdRef.current, candidate);
      }
    };

    pc.ontrack = (e) => {
      setRemoteVideoOff(false);
      if (remoteVideoRef.current && e.streams[0]) {
        remoteVideoRef.current.srcObject = e.streams[0];
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        setState("ended");
      }
    };

    return pc;
  }, []);

  // Set up local stream
  const setupLocalStream = useCallback(async (videoEnabled: boolean) => {
    try {
      const constraints: MediaStreamConstraints = {
        audio: true,
        video: videoEnabled
          ? {
              width: { ideal: 640 },
              height: { ideal: 480 },
              facingMode: mobileFacingMode,
            }
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
      // Video might not be available; try audio only
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        setHasCamera(false);
        return stream;
      } catch {
        // No media at all
        return null;
      }
    }
  }, [mobileFacingMode]);

  // Handle screen share
  const toggleScreenShare = useCallback(async () => {
    if (screenSharing) {
      // Stop screen share, revert to camera
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } },
          audio: true,
        });
        const sender = peerRef.current?.getSenders().find((s) => s.track?.kind === "video");
        if (sender) {
          const videoTrack = stream.getVideoTracks()[0];
          if (videoTrack) await sender.replaceTrack(videoTrack);
        }
        // Stop old local stream
        localStreamRef.current?.getTracks().forEach((t) => t.stop());
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      } catch { /* ignore */ }
      setScreenSharing(false);
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const sender = peerRef.current?.getSenders().find((s) => s.track?.kind === "video");
        if (sender) {
          const videoTrack = screenStream.getVideoTracks()[0];
          if (videoTrack) await sender.replaceTrack(videoTrack);
        }
        screenStream.getVideoTracks()[0].onended = () => setScreenSharing(false);
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

  // Re-setup when facingMode changes on mobile
  useEffect(() => {
    if (!peerRef.current || !localStreamRef.current) return;
    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (!videoTrack) return;
    // Stop old video track and get new one with new facing mode
    videoTrack.stop();
    const newMode = mobileFacingMode;
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: newMode, width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    }).then((stream) => {
      const newVideoTrack = stream.getVideoTracks()[0];
      localStreamRef.current?.removeTrack(videoTrack);
      if (newVideoTrack && localStreamRef.current) {
        localStreamRef.current.addTrack(newVideoTrack);
        const sender = peerRef.current?.getSenders().find((s) => s.track?.kind === "video");
        if (sender) sender.replaceTrack(newVideoTrack);
      }
    }).catch(() => {});
  }, [mobileFacingMode]);

  // Initiate call (caller)
  const initiateCall = useCallback(async () => {
    const stream = await setupLocalStream(activeCall?.callType === "video");
    if (!stream) {
      setState("ended");
      return;
    }

    const pc = createPeer();
    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const callId = crypto.randomUUID();
    callIdRef.current = callId;
    setActiveCall({ ...activeCall!, callId });

    chatAPI.sendCallStart(activeCall!.peer, activeCall!.callType, JSON.stringify(offer));
    setState("calling");
  }, [activeCall, createPeer, setActiveCall, setupLocalStream]);

  // Accept incoming call (callee)
  const acceptCall = useCallback(async () => {
    if (!incomingCall) return;
    stopRingtone();

    const stream = await setupLocalStream(incomingCall.callType === "video");
    if (!stream) return;

    const pc = createPeer();
    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });

    callIdRef.current = incomingCall.callId;

    // Set remote description from incoming offer
    const offer = JSON.parse(incomingCall.sdp);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    chatAPI.sendCallAccept(incomingCall.callId, JSON.stringify(answer));
    setState("connected");
    acceptedRef.current = true;

    setActiveCall({
      callId: incomingCall.callId,
      peer: incomingCall.from,
      callType: incomingCall.callType as "video" | "voice",
      startTime: Date.now(),
    });
    setIncomingCall(null);
  }, [incomingCall, createPeer, setActiveCall, setIncomingCall, setupLocalStream, stopRingtone]);

  // Reject call
  const rejectCall = useCallback(() => {
    stopRingtone();
    if (incomingCall) {
      chatAPI.sendCallReject(incomingCall.callId);
    }
    setIncomingCall(null);
    onClose();
  }, [incomingCall, setIncomingCall, onClose, stopRingtone]);

  // End call
  const endCall = useCallback(() => {
    if (callIdRef.current) {
      chatAPI.sendCallEnd(callIdRef.current);
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
    }
    if (peerRef.current) {
      peerRef.current.close();
    }
    stopRingtone();
    setActiveCall(null);
    setIncomingCall(null);
    state !== "ended" && setState("ended");
    setTimeout(() => onClose(), 1500);
  }, [onClose, setActiveCall, setIncomingCall, stopRingtone, state]);

  // WebSocket event listeners for call signaling
  useEffect(() => {
    const unsubs: (() => void)[] = [];

    unsubs.push(
      chatAPI.on("call_accepted", (msg) => {
        const m = msg as unknown as { call_id: string; sdp: string };
        if (m.call_id !== callIdRef.current) return;
        stopRingtone();
        const answer = JSON.parse(m.sdp);
        peerRef.current?.setRemoteDescription(new RTCSessionDescription(answer)).catch(() => {});
        setState("connected");
      }),
    );

    unsubs.push(
      chatAPI.on("call_rejected", () => {
        stopRingtone();
        setState("ended");
        setTimeout(() => onClose(), 1500);
      }),
    );

    unsubs.push(
      chatAPI.on("call_ended", () => {
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((t) => t.stop());
        }
        if (peerRef.current) {
          peerRef.current.close();
        }
        setState("ended");
        setTimeout(() => onClose(), 1500);
      }),
    );

    unsubs.push(
      chatAPI.on("call_ice_candidate", (msg) => {
        const m = msg as unknown as { call_id: string; candidate: string };
        if (m.call_id !== callIdRef.current) return;
        try {
          const candidate = JSON.parse(m.candidate);
          peerRef.current?.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
        } catch { /* ignore malformed candidate */ }
      }),
    );

    return () => unsubs.forEach((u) => u());
  }, [onClose, stopRingtone]);

  // Start calling if caller
  useEffect(() => {
    if (incomingCall) {
      setState("ringing");
      startRingtone();
      return;
    }
    if (activeCall && !acceptedRef.current) {
      initiateCall();
    }
    return () => {
      stopRingtone();
    };
  }, []); // intentionally [] — runs once on mount

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRingtone();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      peerRef.current?.close();
    };
  }, [stopRingtone]);

  // Render ended state briefly before closing
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

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-gray-950">
      {/* Remote video (full screen background) */}
      <div className="absolute inset-0">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="h-full w-full object-cover"
        />
        {remoteVideoOff && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80">
            <div className="text-center">
              <VideoOff className="h-16 w-16 mx-auto mb-2 text-white/40" />
              <p className="text-white/60 text-sm">{t("call.remoteVideoOff")}</p>
            </div>
          </div>
        )}
      </div>

      {/* Incoming call or calling overlay */}
      {(state === "ringing" || state === "calling") && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/70">
          <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center mb-4">
            <Phone className={cn(
              "h-10 w-10",
              state === "ringing" ? "text-green-400 animate-pulse" : "text-white/60",
            )} />
          </div>
          <h2 className="text-xl font-semibold text-white mb-1">
            {peerDisplayName}
          </h2>
          <p className="text-sm text-white/60">
            {state === "ringing"
              ? t("call.incomingCall", { name: peerDisplayName })
              : t("call.calling", { name: peerDisplayName })}
          </p>
          <div className="flex gap-6 mt-8">
            {state === "ringing" && (
              <button
                onClick={acceptCall}
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
      )}

      {/* Local video (PiP bottom-right, draggable) */}
      {state === "connected" && (
        <LocalVideoPiP
          stream={localStreamRef.current}
          hasCamera={hasCamera}
          micMuted={micMuted}
          cameraOff={cameraOff}
        />
      )}

      {/* Call timer */}
      {state === "connected" && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
          <span className="text-white text-sm font-mono bg-black/50 px-3 py-1 rounded-full">
            {formatTime(elapsed)}
          </span>
        </div>
      )}

      {/* Control bar */}
      <div className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-center gap-3 pb-safe pb-6 pt-4 px-4 bg-gradient-to-t from-black/80 to-transparent">
        {/* Mute mic */}
        <ControlButton
          onClick={toggleMic}
          active={!micMuted}
          activeColor="bg-white/20 hover:bg-white/30"
          inactiveColor="bg-red-500 hover:bg-red-400"
          icon={micMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          label={micMuted ? t("call.unmuteMic") : t("call.muteMic")}
        />

        {/* Mute camera */}
        <ControlButton
          onClick={toggleCamera}
          active={!cameraOff}
          activeColor="bg-white/20 hover:bg-white/30"
          inactiveColor="bg-red-500 hover:bg-red-400"
          icon={cameraOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
          label={cameraOff ? t("call.unmuteCamera") : t("call.muteCamera")}
        />

        {/* Screen share */}
        <ControlButton
          onClick={toggleScreenShare}
          active={!screenSharing}
          activeColor="bg-white/20 hover:bg-white/30"
          inactiveColor="bg-blue-500 hover:bg-blue-400"
          icon={<Monitor className="h-5 w-5" />}
          label={t("call.screenShare")}
        />

        {/* Switch camera (mobile only) */}
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

        {/* End call */}
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

      {/* Call timer (fallback top-right if not connected) */}
      {state === "calling" && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
          <span className="text-white text-sm font-mono bg-black/50 px-3 py-1 rounded-full animate-pulse">
            {formatTime(elapsed)}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───

function ControlButton({
  onClick,
  active,
  activeColor,
  inactiveColor,
  icon,
  label,
}: {
  onClick: () => void;
  active: boolean;
  activeColor: string;
  inactiveColor: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1"
      aria-label={label}
    >
      <div
        className={cn(
          "flex items-center justify-center w-12 h-12 rounded-full transition-colors text-white",
          active ? activeColor : inactiveColor,
        )}
      >
        {icon}
      </div>
      <span className="text-[10px] text-white/60">{label}</span>
    </button>
  );
}

function LocalVideoPiP({
  stream,
  hasCamera,
  micMuted,
  cameraOff,
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
    setPos({
      x: e.clientX - offset.current.x,
      y: e.clientY - offset.current.y,
    });
  };

  const handlePointerUp = () => {
    dragging.current = false;
  };

  return (
    <div
      ref={containerRef}
      className="absolute z-30 w-36 h-48 md:w-48 md:h-64 rounded-xl overflow-hidden border-2 border-white/20 shadow-2xl cursor-grab active:cursor-grabbing select-none"
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
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover mirror"
        />
      ) : (
        <div className="h-full w-full flex items-center justify-center bg-gray-800">
          <VideoOff className="h-8 w-8 text-white/40" />
        </div>
      )}
      {/* Status indicators */}
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
