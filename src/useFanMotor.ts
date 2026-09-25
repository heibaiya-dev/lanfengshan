import { useEffect, useRef } from "react";

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
    reducedMotion: false,
    wasOn: false,
    schedule: null,
  });

  useEffect(() => {
    const motor = motorRef.current;
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    motor.reducedMotion = motionPreference.matches;

    function cancelFrame() {
      if (motor.frameId !== null) {
        window.cancelAnimationFrame(motor.frameId);
        motor.frameId = null;
      }
      motor.lastFrameTime = null;
    }

    function schedule() {
      if (
        motor.frameId === null &&
        !motor.reducedMotion &&
        !document.hidden &&
        (motor.targetVelocity > 0 || motor.velocity > 0)
      ) {
        motor.frameId = window.requestAnimationFrame(frame);
      }
    }

    function frame(now: number) {
      motor.frameId = null;
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
      if (event.matches) {
        cancelFrame();
        motor.velocity = 0;
        motor.coastStartVelocity = 0;
      } else {
        schedule();
      }
    }

    motor.schedule = schedule;
    document.addEventListener("visibilitychange", onVisibilityChange);
    motionPreference.addEventListener("change", onMotionPreferenceChange);

    return () => {
      cancelFrame();
      motor.schedule = null;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      motionPreference.removeEventListener("change", onMotionPreferenceChange);
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
    motor.schedule?.();
  }, [isOn, rpm]);

  return rotorRef;
}
