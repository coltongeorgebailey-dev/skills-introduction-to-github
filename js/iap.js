// Handle Stripe Checkout return: ?gems=N grants N gems
export function checkStripeReturn(game, ui) {
  const params = new URLSearchParams(window.location.search);
  const gems = parseInt(params.get('gems'), 10);
  if (gems > 0) {
    game.addGems(gems);
    ui.notify(`💎 ${gems} gems added to your account!`, 4000);
    // Clean URL without reloading
    window.history.replaceState({}, '', window.location.pathname);
  }
}
