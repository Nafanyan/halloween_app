const EXT = {
  image: ['jpg', 'png', 'webp', 'svg'],
  audio: ['mp3', 'ogg', 'wav', 'm4a'],
} as const;

/** Подходит ли имя загруженного файла по расширению к ожидаемому виду медиа. */
export function mediaKindOk(file: string, accept: 'image' | 'audio'): boolean {
  const ext = file.slice(file.lastIndexOf('.') + 1).toLowerCase();
  return file.includes('.') && (EXT[accept] as readonly string[]).includes(ext);
}
