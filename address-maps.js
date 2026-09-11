(() => {
  function mapsUrl(address) {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address);
  }

  function decorateCustomerProfile() {
    const page = document.getElementById('customerProfile');
    if (!page || !page.classList.contains('active')) return;
    const labels = [...page.querySelectorAll('.profile-list strong')];
    const label = labels.find(el => el.textContent.trim() === 'Address');
    const value = label?.nextElementSibling;
    if (!value || value.dataset.mapsLinked === '1') return;
    const address = value.textContent.trim();
    if (!address || address === '—') return;
    value.dataset.mapsLinked = '1';
    const link = document.createElement('a');
    link.href = mapsUrl(address);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = address;
    link.title = 'Open address in Google Maps';
    link.style.color = '#0d47a1';
    link.style.fontWeight = '700';
    link.style.textDecoration = 'underline';
    value.replaceChildren(link);
  }

  const observer = new MutationObserver(() => decorateCustomerProfile());
  observer.observe(document.body, { childList: true, subtree: true });
  decorateCustomerProfile();
})();
