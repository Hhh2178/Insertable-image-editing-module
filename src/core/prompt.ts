const ZH_MARKED_PREFIX = '提供的图片上有用户标记，用于指出需要修改的范围或内容。请根据用户要求完成修改，标记只用于定位，最终图片中不要保留这些标记。';
const ZH_SUFFIX = '保持原图其他区域的细节不变，保持原图的色彩不变';
const EN_MARKED_PREFIX = 'The provided image contains user markings to identify the area or content to change. Follow the user’s request, use the marks only as location guidance, and do not include the marks in the final image.';
const EN_SUFFIX = 'Keep all other details and colors of the original image unchanged.';
const AUTO_MARKED_PREFIX = "The provided image contains user markings to identify the area or content to change. Follow the language of the user's instructions, use the marks only as location guidance, and do not include the marks in the final image.";

export type PromptLanguage = 'zh' | 'en' | 'auto';

export function buildImageEditPrompt(options: { instruction: string; marked: boolean; language?: PromptLanguage }): string {
  const language = options.language ?? 'zh';
  const promptParts: string[] = [];
  if (options.marked) {
    promptParts.push(language === 'zh' ? ZH_MARKED_PREFIX : language === 'auto' ? AUTO_MARKED_PREFIX : EN_MARKED_PREFIX);
  }
  // Keep the user's exact input, including intentional leading/trailing whitespace.
  promptParts.push(options.instruction);
  promptParts.push(language === 'zh' ? ZH_SUFFIX : EN_SUFFIX);
  return promptParts.join('\n\n');
}
