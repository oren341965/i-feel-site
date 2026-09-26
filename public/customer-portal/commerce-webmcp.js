(() => {
  const mc = document.modelContext;
  if (!mc || typeof mc.registerTool !== 'function') return;
  const ctl = new AbortController();
  const getJson = async (url, signal) => {
    const r = await fetch(url, {credentials:'same-origin', headers:{Accept:'application/json'}, signal});
    if (r.status === 401) return {authenticated:false, loginUrl:'https://i-feel.co.il/customer-portal/index.php'};
    if (!r.ok) throw new Error('I Feel commerce request failed');
    return await r.json();
  };
  mc.registerTool({
    name:'get_ifeel_online_catalog',
    description:'Return the signed-in customer online product catalog with server-calculated ILS prices and service-agreement discount.',
    inputSchema:{type:'object',properties:{},additionalProperties:false},
    async execute(_input,{signal}){ return await getJson('/customer-portal/catalog.php',signal); },
    annotations:{readOnlyHint:true,untrustedContentHint:false}
  },{signal:ctl.signal}).catch(()=>{});
  mc.registerTool({
    name:'get_ifeel_cart',
    description:'Return the signed-in customer current shopping cart. Read-only.',
    inputSchema:{type:'object',properties:{},additionalProperties:false},
    async execute(_input,{signal}){ return await getJson('/customer-portal/cart.php',signal); },
    annotations:{readOnlyHint:true,untrustedContentHint:false}
  },{signal:ctl.signal}).catch(()=>{});
  window.addEventListener('pagehide',()=>ctl.abort(),{once:true});
})();