import { useEffect, useRef } from "react";

const isDebugBuild = import.meta.env.VITE_DEBUG_BUILD === "1";

const ACCEL_RESPONSE_MS = 400;
const COAST_DURATION_MS = 1800;
const MAX_FRAME_MS = 50;

type MotorState = {
  angle: number;
  velocity: number;
  targetVelocity: number;
  coastStartVelocity: number;
  coastElapsedMs: number;
  lastFrameTime: number | null;
  frameId: number | null;
  frameKind: "raf" | "timeout" | null;
  reducedMotion: boolean;
  wasOn: boolean;
  schedule: (() => void) | null;
};

export function useFanMotor(isOn: boolean, rpm: number) {
  const rotorRef = useRef<HTMLDivElement>(null);
  const motorRef = useRef<MotorState>({
    angle: 0,
    velocity: 0,
    targetVelocity: 0,
    coastStartVelocity: 0,
    coastElapsedMs: 0,
    lastFrameTime: null,
    frameId: null,
    frameKind: null,
    reducedMotion: false,
    wasOn: false,
    schedule: null,
  });

  useEffect(() => {
    const motor = motorRef.current;
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    motor.reducedMotion = motionPreference.matches;
    if (isDebugBuild) {
      console.info("fan-motor:init", {
        reducedMotion: motor.reducedMotion,
        requestAnimationFrame: typeof window.requestAnimationFrame === "function",
        documentHidden: document.hidden,
        rotorMounted: rotorRef.current !== null,
      });
    }

    function cancelFrame() {
      if (motor.frameId !== null) {
        if (motor.frameKind === "raf") {
          window.cancelAnimationFrame(motor.frameId);
        } else {
          window.clearTimeout(motor.frameId);
        }
        motor.frameId = null;
        motor.frameKind = null;
      }
      motor.lastFrameTime = null;
    }

    function schedule() {
      if (
        motor.frameId === null &&
        !document.hidden &&
        (motor.targetVelocity > 0 || motor.velocity > 0)
      ) {
        if (typeof window.requestAnimationFrame === "function") {
          motor.frameKind = "raf";
          motor.frameId = window.requestAnimationFrame(frame);
        } else {
          // Keep older Android WebViews moving when RAF is unavailable.
          motor.frameKind = "timeout";
          motor.frameId = window.setTimeout(() => frame(performance.now()), 16);
        }
      }
    }

    function frame(now: number) {
      motor.frameId = null;
      motor.frameKind = null;
      const elapsedMs = motor.lastFrameTime === null
        ? 0
        : Math.min(Math.max(now - motor.lastFrameTime, 0), MAX_FRAME_MS);
      motor.lastFrameTime = now;

      const previousVelocity = motor.velocity;
      let degreesTraveled = 0;

      if (motor.targetVelocity > 0) {
        const decay = Math.exp(-elapsedMs / ACCEL_RESPONSE_MS);
        motor.velocity = motor.targetVelocity +
          (previousVelocity - motor.targetVelocity) * decay;
        degreesTraveled = motor.targetVelocity * elapsedMs / 1000 +
          (previousVelocity - motor.targetVelocity) *
            (ACCEL_RESPONSE_MS / 1000) * (1 - decay);
      } else if (motor.velocity > 0) {
        motor.coastElapsedMs = Math.min(
          motor.coastElapsedMs + elapsedMs,
          COAST_DURATION_MS,
        );
        motor.velocity = motor.coastStartVelocity *
          (1 - motor.coastElapsedMs / COAST_DURATION_MS);
        degreesTraveled = (previousVelocity + motor.velocity) / 2 *
          (elapsedMs / 1000);
      }

      motor.angle = (motor.angle + degreesTraveled) % 360;
      if (rotorRef.current) {
        rotorRef.current.style.transform = `rotate(${motor.angle}deg)`;
      }
      schedule();
    }

    function onVisibilityChange() {
      if (document.hidden) cancelFrame();
      else schedule();
    }

    function onMotionPreferenceChange(event: MediaQueryListEvent) {
      motor.reducedMotion = event.matches;
      // Reduced-motion affects decorative motion such as head oscillation. The
      // rotor is the primary fan state and must continue to show its speed.
      schedule();
    }

    motor.schedule = schedule;
    document.addEventListener("visibilitychange", onVisibilityChange);
    // Older Android WebViews expose the legacy MediaQueryList listener API.
    // Keep the fallback so reduced-motion handling does not fail during mount.
    if (typeof motionPreference.addEventListener === "function") {
      motionPreference.addEventListener("change", onMotionPreferenceChange);
    } else {
      motionPreference.addListener(onMotionPreferenceChange);
    }

    return () => {
      cancelFrame();
      motor.schedule = null;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (typeof motionPreference.removeEventListener === "function") {
        motionPreference.removeEventListener("change", onMotionPreferenceChange);
      } else {
        motionPreference.removeListener(onMotionPreferenceChange);
      }
    };
  }, []);

  useEffect(() => {
    const motor = motorRef.current;
    motor.targetVelocity = isOn ? Math.max(0, rpm) * 6 : 0;

    if (isOn) {
      motor.coastElapsedMs = 0;
    } else if (motor.wasOn) {
      motor.coastStartVelocity = motor.velocity;
      motor.coastElapsedMs = 0;
    }

    motor.wasOn = isOn;
    if (isDebugBuild) {
      console.info("fan-motor:state", {
        isOn,
        rpm,
        targetVelocity: motor.targetVelocity,
        documentHidden: document.hidden,
      });
    }
    motor.schedule?.();
  }, [isOn, rpm]);

  return rotorRef;
}
