import assert from 'node:assert/strict';
import test from 'node:test';
import { runtimeProvider, toDorjeTask } from '../src/services/studentLadApi.js';

test('standalone builds select the Student-LAD core by default', () => {
  assert.equal(runtimeProvider, 'student-lad');
});

test('authoritative API tasks map into the DorjeFlow view model', () => {
  const task = toDorjeTask({ id: 'task-1', title: 'Review biology rubric', category: 'academic', status: 'active', priority: 'high', progressPercent: 60, sensitive: false });
  assert.equal(task.id, 'task-1');
  assert.equal(task.status, 'planned');
  assert.equal(task.authoritative, true);
  assert.equal(task.points, 3);
});
