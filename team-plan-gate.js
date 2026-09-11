(() => {
  async function enforce(){
    const navButton=document.querySelector('#nav button[data-page="team"]');
    if(navButton && typeof subscriptionActive!=='undefined') navButton.classList.toggle('hidden',!subscriptionActive);
  }

  document.addEventListener('click',e=>{
    if(e.target.closest('#nav button[data-page]')) setTimeout(enforce,100);
  });

  const observer=new MutationObserver(()=>setTimeout(enforce,50));
  observer.observe(document.body,{childList:true,subtree:true});
  setTimeout(enforce,250);
  sb.auth.onAuthStateChange(()=>setTimeout(enforce,200));
})();
