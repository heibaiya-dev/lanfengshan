import { useEffect, useRef } from "react";

type TrackName = "start" | "stop" | "running";

type TrackSet = Record<TrackName, HTMLAudioElement>;

export type FanAudioControls = {
  playPowerOn: () => void;
  playPowerOff: () => void;
};

const TRACK_URLS: Record<TrackName, string> = {
  start: "/audio/start.mp3",
  stop: "/audio/stop.mp3",
  running: "/audio/running.mp3",
};

function createTracks(runningUrl: string): TrackSet {
  const tracks = {} as TrackSet;
  (Object.keys(TRACK_URLS) as TrackName[]).forEach((name) => {
    const track = new Audio(name === "running" ? runningUrl : TRACK_URLS[name]);
    track.preload = "auto";
    track.volume = name === "running" ? 0.36 : 0.65;
    track.loop = name === "running";
    tracks[name] = track;
  });
  return tracks;
}

function safelyPlay(track: HTMLAudioElement) {
  const playPromise = track.play();
  if (playPromise) void playPromise.catch(() => undefined);
}

export function useFanAudio(isOn: boolean, muted: boolean, runningUrl: string): FanAudioControls {
  const tracksRef = useRef<TrackSet | null>(null);
  const isOnRef = useRef(isOn);
  const mutedRef = useRef(muted);
  const runningUrlRef = useRef(runningUrl);
  const activeAudioRef = useRef(false);
  const previousPowerRef = useRef(isOn);

  function tracks() {
    if (!tracksRef.current) tracksRef.current = createTracks(runningUrlRef.current);
    return tracksRef.current;
  }

  function stopRunning() {
    const running = tracks().running;
    running.pause();
    running.currentTime = 0;
    activeAudioRef.current = false;
  }

  function startRunning() {
    if (mutedRef.current || !isOnRef.current) return;
    const running = tracks().running;
    running.loop = true;
    if (running.paused) safelyPlay(running);
    activeAudioRef.current = true;
  }

  function playOneShot(name: "start" | "stop") {
    if (mutedRef.current) return;
    const track = tracks()[name];
    track.pause();
    track.currentTime = 0;
    safelyPlay(track);
  }

  function playPowerOn() {
    playOneShot("start");
    startRunning();
  }

  function playPowerOff() {
    playOneShot("stop");
    stopRunning();
  }

  useEffect(() => {
    isOnRef.current = isOn;
    if (isOn) startRunning();
    else stopRunning();
  }, [isOn]);

  useEffect(() => {
    mutedRef.current = muted;
    if (muted) {
      const audio = tracksRef.current;
      audio?.start.pause();
      audio?.stop.pause();
      audio?.running.pause();
      activeAudioRef.current = false;
    } else if (isOn) {
      startRunning();
    }
  }, [isOn, muted]);

  useEffect(() => {
    if (runningUrlRef.current === runningUrl) return;
    runningUrlRef.current = runningUrl;
    const running = tracksRef.current?.running;
    if (!running) return;
    running.pause();
    running.src = runningUrl;
    running.load();
    activeAudioRef.current = false;
    if (isOnRef.current && !mutedRef.current) startRunning();
  }, [runningUrl]);

  useEffect(() => {
    function handleVisibility() {
      if (document.hidden) {
        tracksRef.current?.running.pause();
        activeAudioRef.current = false;
      } else if (isOnRef.current && !mutedRef.current) {
        startRunning();
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    const powerChanged = previousPowerRef.current !== isOn;
    previousPowerRef.current = isOn;
    if (!powerChanged) return;

    // The click handler plays the one shot. This effect only keeps the loop aligned
    // for timer shutdowns and restored app state.
    if (isOn) startRunning();
    else stopRunning();
  }, [isOn]);

  useEffect(() => () => {
    const audio = tracksRef.current;
    if (!audio) return;
    Object.values(audio).forEach((track) => {
      track.pause();
      track.src = "";
    });
  }, []);

  return { playPowerOn, playPowerOff };
}
