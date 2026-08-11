// Pure unit tests for src/voice/spokenListFormatting.js -- no browser, no
// microphone, no build step needed. This is the deterministic formatting
// logic behind JSA Tasks/Hazards/Controls list-aware speech (mission:
// "one spoken item = one JSA PDF cell"). Run standalone:
//   node tools/testing/verify-jsa-speech-list-parsing.mjs

import { normalizeSpokenList, appendSpokenListItems } from '../../src/voice/spokenListFormatting.js';

let failures = 0;
function check(cond, label) {
  if (cond) console.log(`  [PASS] ${label}`);
  else { console.log(`  [FAIL] ${label}`); failures++; }
}
function checkArraysEqual(actual, expected, label) {
  const ok = Array.isArray(actual) && actual.length === expected.length && actual.every((v, i) => v === expected[i]);
  check(ok, `${label} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
}

console.log('=== normalizeSpokenList ===');

checkArraysEqual(
  normalizeSpokenList('Spread lime. Move lime. Mix lime.'),
  ['Spread lime', 'Move lime', 'Mix lime'],
  'Periods split into separate items, trailing period leaves no blank row',
);

checkArraysEqual(
  normalizeSpokenList('Spread lime; move lime; mix lime'),
  ['Spread lime', 'move lime', 'mix lime'],
  'Semicolons split into separate items',
);

checkArraysEqual(
  normalizeSpokenList('Inspect equipment, including tires, lights, and mirrors.'),
  ['Inspect equipment, including tires, lights, and mirrors'],
  'Commas never split -- one item, commas preserved',
);

checkArraysEqual(
  normalizeSpokenList('Use a spotter and maintain radio communication.'),
  ['Use a spotter and maintain radio communication'],
  '"and" never splits -- one item',
);

checkArraysEqual(
  normalizeSpokenList('Spread lime next task move lime next task mix lime'),
  ['Spread lime', 'move lime', 'mix lime'],
  'Explicit "next task" phrases split into separate items and are removed from the text',
);

checkArraysEqual(
  normalizeSpokenList('Equipment traffic next hazard dust exposure next hazard uneven ground'),
  ['Equipment traffic', 'dust exposure', 'uneven ground'],
  '"next hazard" works the same as "next task"/"next item"',
);

checkArraysEqual(
  normalizeSpokenList('Maintain safe distance next control use spotter when backing'),
  ['Maintain safe distance', 'use spotter when backing'],
  '"next control" works the same way',
);

checkArraysEqual(
  normalizeSpokenList('Spread lime next item move lime'),
  ['Spread lime', 'move lime'],
  'Generic "next item" also works',
);

checkArraysEqual(
  normalizeSpokenList('Spread lime..   . Move lime.'),
  ['Spread lime', 'Move lime'],
  'Repeated punctuation / accidental blank sentences produce no empty rows',
);

checkArraysEqual(normalizeSpokenList(''), [], 'Empty transcript produces no items');
checkArraysEqual(normalizeSpokenList('   '), [], 'Whitespace-only transcript produces no items');
checkArraysEqual(normalizeSpokenList('Spread lime'), ['Spread lime'], 'A single item with no terminator still comes through');

console.log('\n=== appendSpokenListItems ===');

check(
  appendSpokenListItems('', ['Spread lime', 'Move lime', 'Mix lime']) === 'Spread lime\nMove lime\nMix lime',
  'Empty field: items joined with newlines, verbatim',
);

check(
  appendSpokenListItems('Spread lime\nMove lime', ['Mix lime', 'Clean spreader']) === 'Spread lime\nMove lime\nMix lime\nClean spreader',
  'Non-empty field: new items appended as additional lines, existing lines untouched',
);

check(
  appendSpokenListItems('Existing note', []) === 'Existing note',
  'No items (e.g. transcript normalized to nothing): base is returned unchanged',
);

check(
  appendSpokenListItems('Existing note\n', ['Next line']) === 'Existing note\nNext line',
  'Trailing whitespace/newline on the base is not doubled',
);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
if (failures > 0) process.exit(1);
