import { useEffect, useRef } from "react";
import type { FanBrand } from "./mediaCatalog";

type PowerTrackName = "start" | "stop";
type TrackSet = {
  start: HTMLAudioElement[];
  stop: HTMLAudioElement[];
  running: HTMLAudioElement;
};
type AudioSession = {
  brand: FanBrand;
  runningUrl: string;
  tracks: TrackSet;
};

export type FanAudioControls = {
  playPowerOn: () => void;
  playPowerOff: () => void;
};

const POWER_TRACK_URLS = {
  lanfeng: { start: "/audio/start.mp3", stop: "/audio/stop.mp3" },
  xuelang: { start: "/audio/xuelang-start.mp3", stop: "/audio/xuelang-stop.mp3" },
};

function createTrack(url: string, volume: number, loop = false) {
  const track = new Audio(url);
  track.preload = "auto";
  track.volume = volume;
  track.loop = loop;
  return track;
}

function createTracks(runningUrl: string, brand: FanBrand): TrackSet {
  const brands = brand === "chorus" ? ["lanfeng", "xuelang"] as const : [brand];
  const volume = 0.65 / Math.sqrt(brands.length);
  return {
    start: brands.map((name) => createTrack(POWER_TRACK_URLS[name].start, volume)),
    stop: brands.map((name) => createTrack(POWER_TRACK_URLS[name].stop, volume)),
    running: createTrack(runningUrl, 0.36, true),
  };
}

function safelyPlay(track: HTMLAudioElement) {
  try {
    const playPromise = track.play();
    if (playPromise) void playPromise.catch(() => undefined);
  } catch {
    // Older WebViews can reject playback synchronously before media is ready.
  }
}

function resetTrack(track: HTMLAudioElement) {
  track.pause();
  track.currentTime = 0;
}

function allTracks(tracks: TrackSet) {
  return [...tracks.start, ...tracks.stop, tracks.running];
}

function releaseTracks(tracks: TrackSet) {
  allTracks(tracks).forEach((track) => {
    track.muted = true;
    track.pause();
    track.removeAttribute("src");
    track.load();
  });
}

export function useFanAudio(
  isOn: boolean,
  muted: boolean,
  runningUrl: string,
  brand: FanBrand = "lanfeng",
): FanAudioControls {
  const sessionRef = useRef<AudioSession | null>(null);
  const settingsRef = useRef({ isOn, muted, runningUrl, brand });
  settingsRef.current = { isOn, muted, runningUrl, brand };

  function tracks() {
    const settings = settingsRef.current;
    let session = sessionRef.current;
    if (session && session.brand !== settings.brand) {
      releaseTracks(session.tracks);
      session = null;
    }
    if (!session) {
      session = {
        brand: settings.brand,
        runningUrl: settings.runningUrl,
        tracks: createTracks(settings.runningUrl, settings.brand),
      };
      sessionRef.current = session;
    } else if (session.runningUrl !== settings.runningUrl) {
      resetTrack(session.tracks.running);
      session.tracks.running.src = settings.runningUrl;
      session.tracks.running.load();
      session.runningUrl = settings.runningUrl;
    }
    return session.tracks;
  }

  function stopRunning() {
    const running = sessionRef.current?.tracks.running;
    if (running) resetTrack(running);
  }

  function pauseAll() {
    const audio = sessionRef.current?.tracks;
    if (!audio) return;
    [...audio.start, ...audio.stop].forEach(resetTrack);
    audio.running.pause();
  }

  function startRunning() {
    const settings = settingsRef.current;
    if (settings.muted || !settings.isOn || document.hidden) return;
    const running = tracks().running;
    if (running.paused) safelyPlay(running);
  }

  function playOneShot(name: PowerTrackName) {
    if (settingsRef.current.muted || document.hidden) return;
    const audio = tracks();
    // Stop the preceding power sound when the switch is pressed again quickly.
    [...audio.start, ...audio.stop].forEach(resetTrack);
    audio[name].forEach(safelyPlay);
  }

  function playPowerOn() {
    settingsRef.current.isOn = true;
    playOneShot("start");
    startRunning();
  }

  function playPowerOff() {
    settingsRef.current.isOn = false;
    stopRunning();
    playOneShot("stop");
  }

  useEffect(() => {
    const session = sessionRef.current;
    if (session && session.brand !== brand) {
      releaseTracks(session.tracks);
      sessionRef.current = null;
    }
    if (muted || document.hidden) pauseAll();
    if (isOn) startRunning();
    else stopRunning();
    // Power sounds are played only by the switch handler, never twice by effects.
  }, [isOn, muted, runningUrl, brand]);

  useEffect(() => {
    function handleVisibility() {
      if (document.hidden) pauseAll();
      else startRunning();
    }

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", pauseAll);
    window.addEventListener("pageshow", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", pauseAll);
      window.removeEventListener("pageshow", handleVisibility);
      if (sessionRef.current) releaseTracks(sessionRef.current.tracks);
      sessionRef.current = null;
    };
  }, []);

  return { playPowerOn, playPowerOff };
}
