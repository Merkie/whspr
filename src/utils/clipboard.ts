import clipboard from "clipboardy";

export async function copyToClipboard(text: string): Promise<void> {
  await clipboard.write(text);
}
