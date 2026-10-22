import test from 'node:test';
import assert from 'node:assert/strict';
import {applyDomainHierarchy,descendantDomainIds,domainPath} from '../src/lib/domainHierarchy.js';
import {domainCoverage} from '../src/lib/domainCoverage.js';
const domains=[{id:'cyber',name:'Cyber'},{id:'it',name:'Enterprise IT and Digital Services'},{id:'platform',name:'Tech Platforms'},{id:'other',name:'Other'}];
test('Cyber includes both children and preserves primary assignments and unique totals',()=>{const d=applyDomainHierarchy(domains,{parents:{it:'cyber',platform:'cyber'}});assert.deepEqual([...descendantDomainIds(d,'cyber')].sort(),['cyber','it','platform']);assert.equal(domainPath(d,'it'),'Cyber / Enterprise IT and Digital Services');const agents=[{id:'a',domain_id:'it'},{id:'b',domain_id:'other'}];const c=domainCoverage(d,agents);assert.equal(c.total,2);assert.equal(c.rows.find(d=>d.id==='cyber').count,1);assert.equal(c.rows.find(d=>d.id==='cyber').directCount,0);assert.equal(c.rows.find(d=>d.id==='it').count,1);assert.equal(c.rows.find(d=>d.id==='platform').count,0);assert.equal(agents[0].domain_id,'it');});
test('missing and cyclic hierarchy links do not hide domains or loop',()=>{assert.ok(applyDomainHierarchy(domains,{parents:{it:'cyber',cyber:'it',platform:'absent'}}).every(d=>!d.parent_domain_id));assert.ok(applyDomainHierarchy(domains,null).every(d=>!d.parent_domain_id));});
