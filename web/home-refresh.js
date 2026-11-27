// Refresh data without remounting an unchanged home or its activity chart.
export function createHomeRefresh({load,apply,view}){
 let pending=null;
 return ()=>{
  const token=view();if(token===null)return Promise.resolve();
  if(pending?.token===token)return pending.job;
  const job=Promise.resolve().then(load).then(data=>{if(view()===token)return apply(data);});
  const request={token,job};pending=request;
  job.finally(()=>{if(pending===request)pending=null;}).catch(()=>{});
  return job;
 };
}
