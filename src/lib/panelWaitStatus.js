export function panelWaitStatus(activity,now=Date.now()) {
 const elapsed=Math.max(0,Math.floor((now-activity.startedAt)/1000));
 const quiet=Math.max(0,Math.floor((now-(activity.lastTokenAt||activity.stageAt||activity.startedAt))/1000));
 const slow=quiet>=30;
 const labels={context:'Preparing knowledge and scenario context',connecting:'Sending the model request',waiting:'Waiting for model output',streaming:'Receiving the model response',format_retry:'Correcting invalid model response formatting',retry:'Retrying with a larger output allowance',saving:'Saving the contribution'};
 let detail=activity.stage==='format_retry'?'The previous response failed JSON or position validation. Retrying this SME once; no invalid turn was saved.':activity.stage==='context'?'The model request has not been sent yet.':activity.stage==='connecting'?'Waiting for the local server to open the response stream.':activity.stage==='waiting'?'The local server opened the stream; no model text has arrived yet. This does not confirm that MITRE AIP has started generating.':activity.stage==='retry'?'The server reported an output-token limit and is retrying this turn with more capacity. Earlier incomplete text is replaced.':activity.stage==='saving'?'The model response finished. Waiting for the local application to save it.':'Model text is arriving. The contribution is not saved until the response completes.';
 if(slow&&['waiting','connecting','streaming'].includes(activity.stage))detail+=' A long pause alone cannot distinguish model queueing, generation time, or an upstream connection problem. No model error has been reported.';
 return {elapsed,quiet,slow,label:labels[activity.stage]||'Working',detail};
}

export function panelErrorAdvice(error) {
 if(error.status===401||error.status===403)return 'The request was denied. Check your session and the model credentials or permissions in Settings.';
 if(error.status===429)return 'The service reported a rate or capacity limit. Wait before retrying.';
 if(error.status>=500)return 'The server or upstream provider reported a failure. Check the local connection, then retry; the response alone does not identify which service failed.';
 if(error instanceof TypeError&&/fetch|network/i.test(error.message))return 'The browser could not complete the connection. Check the local server and your network before retrying.';
 return '';
}
