import test from 'node:test';
import assert from 'node:assert/strict';
import {panelWaitStatus,panelErrorAdvice} from '../src/lib/panelWaitStatus.js';
test('long wait does not invent a provider error',()=>{const s=panelWaitStatus({startedAt:1000,stageAt:2000,stage:'waiting'},33000);assert.equal(s.slow,true);assert.equal(s.elapsed,32);assert.match(s.detail,/cannot distinguish/);assert.match(s.detail,/No model error/);});
test('fresh tokens reset the inactivity warning',()=>{const s=panelWaitStatus({startedAt:1000,stageAt:2000,lastTokenAt:60000,stage:'streaming'},61000);assert.equal(s.slow,false);assert.equal(s.quiet,1);});
test('preparation and saving do not claim the model is generating',()=>{assert.match(panelWaitStatus({startedAt:1000,stage:'context'},40000).detail,/not been sent/);assert.match(panelWaitStatus({startedAt:1000,stage:'saving'},40000).detail,/response finished/);});
test('retry describes only confirmed output-limit recovery',()=>{assert.match(panelWaitStatus({startedAt:1000,stage:'retry'},5000).detail,/server reported an output-token limit/);});
test('error guidance uses reported status and leaves unknown causes unclassified',()=>{assert.match(panelErrorAdvice({status:429}),/capacity limit/);assert.match(panelErrorAdvice({status:403}),/denied/);assert.match(panelErrorAdvice({status:502}),/does not identify/);assert.equal(panelErrorAdvice(new Error('Unknown')),'');});
