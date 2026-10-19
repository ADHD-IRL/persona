export const stageDescriptions = {
 preparing:['Preparing the debate','Loading the saved context and checking reusable work.'],
 round1:['Round 1 · independent assessments','Each SME examines the scenario from its assigned perspective.'],
 round2:['Round 2 · challenge and rebuttal','SMEs respond to other assessments, challenge assumptions, and revise their positions.'],
 synthesis:['Synthesizing this debate','Combining the responses, disagreements, and compound threat paths.'],
 comparison:['Comparing options','Evaluating the options against your acceptance criteria.'],
 decision_brief:['Writing the decision brief','Distilling the important findings, uncertainties, and practical next steps.'],
 verification:['Checking finding evidence','Assessing support, contradictions and missing evidence. These checks use source passages and remain subject to analyst review.'],
 saving_findings:['Saving findings and evidence','Adding proposed findings to the review queue and saving the final results.'],
 complete:['Analysis complete','The decision brief, supporting debate, and next actions are ready.'],
};
export function analysisProgress(job) {
 const options=job.activity?.options||[];
 const plannedOptions=job.snapshot.mode==='compare'?job.snapshot.options.length:1;
 const plannedAgents=job.snapshot.agents?.length||0;
 const responses=options.reduce((sum,o)=>sum+o.agents.reduce((n,a)=>n+Number(a.round1_done)+Number(a.round2_done),0),0);
 const syntheses=options.filter(o=>o.synthesis_done).length;
 const compare=job.snapshot.mode==='compare';
 const briefDone=!!job.checkpoints?.reviewBrief||!!job.result;
 const comparisonDone=compare&&(briefDone||['decision_brief','saving_findings','verification','complete'].includes(job.progress?.stage));
 const total=plannedOptions*(plannedAgents*2+1)+(compare?1:0)+2;
 const completed=responses+syntheses+Number(comparisonDone)+Number(briefDone)+Number(job.status==='complete');
 const percent=job.status==='complete'?100:Math.min(99,Math.floor(completed/Math.max(total,1)*100));
 const stage=job.progress?.stage||'preparing';
 let [title,description]=stageDescriptions[stage]||stageDescriptions.preparing;
 if(job.status==='queued'){title='Queued · waiting for the analysis worker';description='The local server runs one analysis at a time. Saved responses will be retained when work starts or resumes.';}
 if(job.status==='failed'){title='Analysis needs attention';description='Work stopped. Read the error below; Resume saved inputs continues from saved responses.';}
 if(job.status==='cancelled'){title='Analysis stopped';description='Saved responses remain available to read. Resume continues the unfinished work.';}
 if(job.status==='complete')[title,description]=stageDescriptions.complete;
 if(job.cancel_requested&&['queued','running'].includes(job.status)){title='Stopping the analysis';description='Waiting for the worker to stop. Responses already saved remain available.';}
 return {options,responses,responseTotal:plannedOptions*plannedAgents*2,syntheses,total,completed:job.status==='complete'?total:Math.min(total,completed),percent,title,description,stage};
}
export function elapsedLabel(milliseconds) {
 const seconds=Math.max(0,Math.floor(milliseconds/1000));
 if(seconds<60)return seconds+'s';
 const minutes=Math.floor(seconds/60);return minutes<60?minutes+'m '+seconds%60+'s':Math.floor(minutes/60)+'h '+minutes%60+'m';
}
