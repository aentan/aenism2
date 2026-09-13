/**
 * Swap an embed facade for the real player on click.
 *
 * Until then the page carries no third-party requests at all — the poster is
 * self-hosted, and the iframe does not exist.
 */
const ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";

function play(button: HTMLElement): void {
  const src = button.dataset.embed;
  if (!src) return;

  const frame = document.createElement("iframe");
  frame.src = src + (src.includes("?") ? "&" : "?") + "autoplay=1";
  frame.title = button.getAttribute("aria-label")?.replace(/^Play:\s*/, "") ?? "Video";
  frame.allow = ALLOW;
  frame.allowFullscreen = true;
  frame.loading = "eager";

  button.replaceWith(frame);
  frame.focus();
}

document.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement | null)?.closest<HTMLElement>(".embed-facade");
  if (button) play(button);
});
