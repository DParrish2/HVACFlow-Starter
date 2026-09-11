(() => {
  const TEAM_PAGE='team';

  async function getPlan(){
    try{
      const {data,error}=await sb.rpc('hvacflow_team_summary');
      if(error) throw error;
      const row=Array.isArray(data)?data[0]:data;
      return String(row?.subscription_plan||'starter');
    }catch(_e){
      return null;
    }
  }

  async function enforce(){
    const navButton=document.querySelector('#nav button[data-page="team"]');
    const teamPage=document.getElementById(TEAM_PAGE);
    if(!navButton&&!teamPage) return;

    const plan=await getPlan();
    if(!plan) return;
    const allowed=plan!=='starter';

    if(navButton) navButton.classList.toggle('hidden',!allowed);

    if(!allowed && teamPage?.classList.contains('active')){
      teamPage.classList.remove('active');
      const dashboard=document.getElementById('dashboard');
      if(dashboard) dashboard.classList.add('active');
      const dashButton=document.querySelector('#nav button[data-page="dashboard"]');
      dashButton?.classList.add('active');
    }
  }

  document.addEventListener('click',e=>{
    if(e.target.closest('#nav button[data-page]')) setTimeout(enforce,100);
  });

  const observer=new MutationObserver(()=>setTimeout(enforce,50));
  observer.observe(document.body,{childList:true,subtree:true});
  setTimeout(enforce,250);
  sb.auth.onAuthStateChange(()=>setTimeout(enforce,200));
})();
