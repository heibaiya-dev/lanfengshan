export type BladeOption = {
  id: string;
  label: string;
  file: string;
  note: string;
};

export type AudioOption = {
  id: string;
  label: string;
  file: string;
  note: string;
};

export const BLADE_OPTIONS: BladeOption[] = [
  { id: "goggle", label: "护目镜少年", file: "blade-1.png", note: "初始立绘" },
  { id: "hanfu", label: "长袖少年", file: "blade-2.png", note: "新立绘" },
  { id: "purple", label: "紫衣狐尾", file: "blade-3.png", note: "新立绘" },
];

export const AUDIO_OPTIONS: AudioOption[] = [
  { id: "running", label: "风扇运行声", file: "running.mp3", note: "2:10 · MP3" },
  { id: "please-stay", label: "请不要带我走", file: "please-stay.wav", note: "2:09 · WAV" },
  { id: "pipa", label: "琵琶曲", file: "pipa.wav", note: "0:59 · WAV" },
  { id: "lanfeng-xiademai", label: "岚峰 · 下等马", file: "lanfeng-xiademai.wav", note: "3:07 · WAV" },
  { id: "applause", label: "处刑鼓掌", file: "applause.mp4", note: "1:28 · MP4 音轨" },
  { id: "heat-exception", label: "热异常", file: "heat-exception.mp4", note: "4:01 · MP4 音轨" },
  { id: "sage", label: "我想当个圣人君子", file: "sage.mp4", note: "2:10 · MP4 音轨" },
];

export const audioUrl = (file: string) => `/audio/${file}`;
