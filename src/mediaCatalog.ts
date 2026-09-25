export type FanBrand = "lanfeng" | "xuelang" | "chorus";

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
  brand: FanBrand;
};

export const BLADE_OPTIONS: BladeOption[] = [
  { id: "blade-1", label: "扇叶 1", file: "blade-1.png", note: "图片 1" },
  { id: "blade-2", label: "扇叶 2", file: "blade-2.png", note: "图片 2" },
  { id: "blade-3", label: "扇叶 3", file: "blade-3.png", note: "图片 3" },
  { id: "blade-4", label: "扇叶 4", file: "blade-4.png", note: "图片 4" },
  { id: "xuelang-1", label: "雪狼扇叶 1", file: "xuelang-blade-1.png", note: "雪狼图片 1" },
  { id: "xuelang-2", label: "雪狼扇叶 2", file: "xuelang-blade-2.png", note: "雪狼图片 2" },
];

export const AUDIO_OPTIONS: AudioOption[] = [
  { id: "running", label: "风扇运行声", file: "running.mp3", note: "2:10 · MP3", brand: "lanfeng" },
  { id: "please-stay", label: "请不要带我走", file: "please-stay.wav", note: "2:09 · WAV", brand: "lanfeng" },
  { id: "pipa", label: "琵琶曲", file: "pipa.wav", note: "0:59 · WAV", brand: "lanfeng" },
  { id: "lanfeng-xiademai", label: "岚峰 · 下等马", file: "lanfeng-xiademai.wav", note: "3:07 · WAV", brand: "lanfeng" },
  { id: "applause", label: "处刑鼓掌", file: "applause.mp3", note: "1:28 · MP3", brand: "lanfeng" },
  { id: "heat-exception", label: "热异常", file: "heat-exception.mp3", note: "4:01 · MP3", brand: "lanfeng" },
  { id: "sage", label: "我想当个圣人君子", file: "sage.mp3", note: "2:10 · MP3", brand: "lanfeng" },
  { id: "steal-takeout", label: "偷外卖的我造你们吗", file: "偷外卖的我造你们吗.mp3", note: "2:01 · MP3", brand: "lanfeng" },

  { id: "xuelang-01", label: "白鸽P 雪狼ユツ 犬ドリンク · 末路ノ", file: "xuelang-01.mp3", note: "MP3", brand: "xuelang" },
  { id: "xuelang-02", label: "雪狼ユツ · 超主人公", file: "xuelang-02.mp3", note: "MP3", brand: "xuelang" },
  { id: "xuelang-03", label: "雪狼ユツ · 赤さんは走る", file: "xuelang-03.mp3", note: "MP3", brand: "xuelang" },
  { id: "xuelang-04", label: "雪狼ユツ · 純属虚构", file: "xuelang-04.mp3", note: "MP3", brand: "xuelang" },
  { id: "xuelang-05", label: "雪狼ユツ · 黄金数", file: "xuelang-05.mp3", note: "MP3", brand: "xuelang" },
  { id: "xuelang-06", label: "雪狼ユツ · 某国のハロウィン", file: "xuelang-06.mp3", note: "MP3", brand: "xuelang" },
  { id: "xuelang-07", label: "雪狼ユツ · 三十路OLの救済", file: "xuelang-07.mp3", note: "MP3", brand: "xuelang" },
  { id: "xuelang-08", label: "雪狼ユツ · 只の人", file: "xuelang-08.mp3", note: "MP3", brand: "xuelang" },
  { id: "xuelang-09", label: "雪狼ユツ · I'm Shooting Star", file: "xuelang-09.mp3", note: "MP3", brand: "xuelang" },
  { id: "xuelang-10", label: "雪狼ユツ · くのいちサイボーグ", file: "xuelang-10.mp3", note: "MP3", brand: "xuelang" },
  { id: "xuelang-11", label: "雪狼ユツ · だ・し・て", file: "xuelang-11.mp3", note: "MP3", brand: "xuelang" },
  { id: "xuelang-12", label: "雪狼ユツ · ヒトアワ星人", file: "xuelang-12.mp3", note: "MP3", brand: "xuelang" },
  { id: "xuelang-13", label: "雪狼ユツ · ヤラララ", file: "xuelang-13.mp3", note: "MP3", brand: "xuelang" },
  { id: "xuelang-14", label: "雪狼ユツ 綿音ラシ · アクマバライ", file: "xuelang-14.mp3", note: "MP3", brand: "xuelang" },
  { id: "xuelang-15", label: "雪狼ユツ 諸行カナ · ハイヴアンドウェブ", file: "xuelang-15.mp3", note: "MP3", brand: "xuelang" },
  { id: "xuelang-16", label: "雪狼ユツ Ameηi · パラロギア", file: "xuelang-16.mp3", note: "MP3", brand: "xuelang" },
  { id: "xuelang-17", label: "TeamForNothing 雪狼ユツ · 免劳偷窃记录", file: "xuelang-17.mp3", note: "MP3", brand: "xuelang" },

  { id: "chorus-01", label: "向修女忏悔吧", file: "chorus-01.mp3", note: "3:06 · MP3", brand: "chorus" },
];

export const audioUrl = (file: string) => `/audio/${file}`;

export const audioBrandLabel: Record<FanBrand, string> = {
  lanfeng: "岚峰独占",
  xuelang: "雪狼独占",
  chorus: "合唱歌曲",
};
