(() => {
  const WHITELIST = new Set([
    'shedtoshelf@gmail.com',
    'david.parrish@libertyenergy.com'
  ]);
  let selectedMode='owner';

  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

  function ensureStyles(){
    if(document.getElementById('loginSeparationStyles')) return;
    const style=document.createElement('style');
    style.id='loginSeparationStyles';
    style.textContent=`
      .login-choice{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0 16px}
      .login-choice button{border:1px solid #cbd5e1;background:#fff;color:#172033;border-radius:10px;padding:12px 10px;font-weight:700;cursor:pointer}
      .login-choice button.active{background:#0d47a1;color:#fff;border-color:#0d47a1}
      .login-mode-note{font-size:13px;color:#667085;margin:-5px 0 12px;line-height:1.4}
      @media(max-width:420px){.login-choice{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function setMode(mode){
    selectedMode=mode==='team'?'team':'owner';
    document.querySelectorAll('.login-choice button').forEach(b=>b.classList.toggle('active',b.dataset.loginMode===selectedMode));
    const title=document.getElementById('authTitle');
    const note=document.getElementById('loginModeNote');
    const submit=document.getElementById('authSubmit');
    if(typeof signup!=='undefined' && signup) return;
    if(selectedMode==='team'){
      if(title) title.textContent='Team member sign in';
      if(note) note.textContent='Use the email and password for your HVACFlow team account. Your access is tied to the company that invited you.';
      if(submit) submit.textContent='Sign In as Team Member';
    }else{
      if(title) title.textContent='Business owner / admin sign in';
      if(note) note.textContent='Use this option for the company owner or an administrator who manages the HVACFlow account.';
      if(submit) submit.textContent='Sign In';
    }
  }

  function ensureChoice(){
    ensureStyles();
    const normal=document.getElementById('authNormal');
    const title=document.getElementById('authTitle');
    if(!normal||!title||document.getElementById('loginChoice')) return;
    const wrap=document.createElement('div');
    wrap.id='loginChoice';
    wrap.className='login-choice';
    wrap.innerHTML=`<button type="button" data-login-mode="owner">Business Owner / Admin</button><button type="button" data-login-mode="team">Team Member</button>`;
    title.insertAdjacentElement('afterend',wrap);
    const note=document.createElement('div');
    note.id='loginModeNote';
    note.className='login-mode-note';
    wrap.insertAdjacentElement('afterend',note);
    wrap.querySelectorAll('button').forEach(b=>b.onclick=()=>setMode(b.dataset.loginMode));
    setMode('owner');
  }

  async function validateTeamMode(session){
    const email=String(session?.user?.email||'').trim().toLowerCase();
    if(WHITELIST.has(email)) return {ok:true,whitelisted:true};
    if(selectedMode!=='team') return {ok:true};
    const {data,error}=await sb.rpc('hvacflow_team_summary');
    if(error) return {ok:false,message:'This login is not connected to an HVACFlow team yet. Ask the account owner for a team invitation.'};
    const row=Array.isArray(data)?data[0]:data;
    if(!row?.member_role) return {ok:false,message:'This login is not connected to an HVACFlow team yet. Ask the account owner for a team invitation.'};
    return {ok:true,role:row.member_role};
  }

  function showLoginError(text){
    const auth=document.getElementById('auth'),app=document.getElementById('app');
    if(app)app.classList.add('hidden');if(auth)auth.classList.remove('hidden');
    const msg=document.getElementById('authMsg');
    if(msg)msg.innerHTML=`<div class="msg err">${esc(text)}</div>`;
  }

  // Validate team-member access before the dashboard is shown. Whitelisted test
  // accounts continue through without this gate.
  if(typeof setSession==='function'){
    const originalSetSession=setSession;
    window.setSession=async function(session){
      if(!session) return originalSetSession(session);
      const check=await validateTeamMode(session);
      if(!check.ok){showLoginError(check.message);return;}
      return originalSetSession(session);
    };
    try{setSession=window.setSession}catch(_e){}
  }

  const toggle=document.getElementById('authToggle');
  if(toggle){
    toggle.addEventListener('click',()=>setTimeout(()=>{
      const choice=document.getElementById('loginChoice');
      const note=document.getElementById('loginModeNote');
      const isSignup=typeof signup!=='undefined'&&signup;
      choice?.classList.toggle('hidden',isSignup);
      note?.classList.toggle('hidden',isSignup);
      if(!isSignup)setMode(selectedMode);
    },0));
  }

  // Supabase can finish consuming a recovery URL before the main auth listener
  // receives PASSWORD_RECOVERY. Detect the recovery marker in the URL as a
  // fallback so password-reset links always open the new-password panel.
  function recoveryLinkPresent(){
    const hashParams=new URLSearchParams(location.hash.replace(/^#/,''));
    const queryParams=new URLSearchParams(location.search);
    return hashParams.get('type')==='recovery' || queryParams.get('type')==='recovery';
  }

  if(recoveryLinkPresent() && typeof showRecovery==='function'){
    showRecovery();
  }

  if(typeof sb!=='undefined' && sb?.auth?.onAuthStateChange){
    sb.auth.onAuthStateChange((event)=>{
      if(event==='PASSWORD_RECOVERY' && typeof showRecovery==='function') showRecovery();
    });
  }

  ensureChoice();
})();
