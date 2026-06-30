export function shouldScrollToBottom(
  scrollHeight: number,
  scrollTop: number,
  clientHeight: number,
  threshold: number = 150
): boolean {
  if (scrollHeight <= 0 || clientHeight <= 0) {
    return true;
  }
  const remainingScroll = scrollHeight - scrollTop - clientHeight;
  return remainingScroll <= threshold;
}
