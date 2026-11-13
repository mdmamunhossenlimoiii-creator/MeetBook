// "Does the matrix have teeth?" Each mutation re-introduces one security bug into a copy of firestore.rules.
// The matrix MUST then fail. If a mutation survives, the matrix is missing a case.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTORS, CAPS, SEED } from './scenarios.mjs';
import { buildDb, runCase, loadAst, RULES_TEXT } from './engine.mjs';

const db = buildDb(SEED);
const failures = (text) => {
  const ast = loadAst(text); let n = 0;
  for (const cap of CAPS) for (const [name, actor] of Object.entries(ACTORS)) if (runCase(cap, name, actor, db, ast).allowed !== cap.allow.includes(name)) n++;
  return n;
};

const MUTATIONS = [
  ['role-less admin doc becomes super admin again', ".get('role', 'none')", ".get('role', 'super_admin')"],
  ['unknown role counts as staff', "signedIn() && roleOf() in ['super_admin', 'admin', 'moderator']", "signedIn() && exists(/databases/$(database)/documents/admins/$(request.auth.uid))"],
  ['bot comments may skip the AI flag', "            && request.resource.data.get('ai', false) == true\n            && textOk(request.resource.data.text, 2000)", "            && textOk(request.resource.data.text, 2000)"],
  ['bot chat messages may skip the AI flag', "            && request.resource.data.get('ai', false) == true // bot content must always be flagged as AI\n            && textOk(request.resource.data.text, 4000)", "            && textOk(request.resource.data.text, 4000)"],
  ['bot consent not checked for comments', ": engagementOk(p.uid));", ": true);"],
  ['bot consent not checked for runner reactions', "&& resource.data.visibility == 'public'\n          && engagementOk(resource.data.uid)\n          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['reactions'])", "&& resource.data.visibility == 'public'\n          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['reactions'])"],
  ['admin may block other staff', "&& (isSuper() || !isStaffUid(uid))", ""],
  ['moderator may suspend staff', "isMod()\n          && !isStaffUid(uid)", "isMod()"],
  ['an admin may queue permanent deletions', "allow create: if isSuper()\n        && uid != request.auth.uid\n        && !uid.matches('bot_.*')\n        && !isStaffUid(uid)", "allow create: if isAdmin()\n        && uid != request.auth.uid\n        && !uid.matches('bot_.*')\n        && !isStaffUid(uid)"],
  ['deletion of staff may be queued', "        && !isStaffUid(uid)\n        && request.resource.data.keys().hasOnly(['status', 'requestedBy', 'name', 'createdAt'])", "        && request.resource.data.keys().hasOnly(['status', 'requestedBy', 'name', 'createdAt'])"],
  ['super admin may edit their own staff doc', "      allow create, update: if isSuper()\n        && uid != request.auth.uid", "      allow create, update: if isSuper()"],
  ['staff docs may contain any field', "        && request.resource.data.keys().hasOnly(['role', 'addedBy', 'addedAt'])\n", ""],
  ['staff may be made out of a bot or missing user', "        && !uid.matches('bot_.*')\n        && exists(/databases/$(database)/documents/users/$(uid))\n", ""],
  ['moderator can forge the role in a log', "        && request.resource.data.role == roleOf()\n", ""],
  ['logs can be back-dated', "        && request.resource.data.role == roleOf()\n        && request.resource.data.createdAt == request.time\n        && textOk(request.resource.data.action, 120)", "        && request.resource.data.role == roleOf()\n        && textOk(request.resource.data.action, 120)"],
  ['logs can be edited', "allow update, delete: if false;\n    }\n\n    // ---------- site settings", "allow update, delete: if isStaff();\n    }\n\n    // ---------- site settings"],
  ['a moderator can change global settings', "allow write: if isAdmin() && id == 'global'", "allow write: if isStaff() && id == 'global'"],
  ['settings accept any field', "request.resource.data.keys().hasOnly(['maintenance', 'maintenanceMessage', 'registrationOpen', 'botsEnabled', 'botToBotComments', 'updatedBy', 'updatedAt'])", "true"],
  ['users can verify or block themselves', "!request.resource.data.diff(resource.data).affectedKeys().hasAny(['banned', 'isBot', 'verified', 'suspendedUntil'])", "true"],
  ['a user may become a bot on creation', "&& request.resource.data.get('isBot', false) == false\n          && request.resource.data.get('verified', false) == false", "&& request.resource.data.get('verified', false) == false"],
  ['suspension is ignored', "(u.get('suspendedUntil', null) == null || u.get('suspendedUntil', null) < request.time)", "true"],
  ['blocked users can write', "u.banned != true", "true"],
  ['bot posts may contain video', "&& request.resource.data.videoUrl == ''", ""],
  ['bot-runner may read every chat', "&& chat.members.size() == 2\\n        && ((chat.members[0] in runner.get('botIds', [])\\n              && runnerMayActAs(chat.members[0]))\\n          || (chat.members[1] in runner.get('botIds', [])\\n              && runnerMayActAs(chat.members[1])));", "&& chat.members.size() == 2\\n        && true;"],
  ['comments stay possible when switched off', "return p.get('commentsDisabled', false) == false && canSeePost(p);", "return canSeePost(p);"],
  ['any reaction value is accepted', "|| request.resource.data.reactions[request.auth.uid] in ['like', 'love', 'haha', 'wow', 'sad', 'angry']", "|| true"],
  ['a report can be edited freely by staff', "hasOnly(['status', 'action', 'resolvedBy', 'resolvedAt'])\n        && request.resource.data.status in ['open', 'resolved']", "hasOnly(['status', 'action', 'resolvedBy', 'resolvedAt', 'targetUid'])\n        && request.resource.data.status in ['open', 'resolved']"],
  ['moderators can delete reports', "allow delete: if isAdmin();\n    }\n\n    // ---------- friends", "allow delete: if isStaff();\n    }\n\n    // ---------- friends"],
  ['anyone can read the activity log', "allow read: if isAdmin();\n      allow update, delete: if false;", "allow read: if signedIn();\n      allow update, delete: if false;"],
  ['inbox quota accepts non-bot targets', "allow create: if isOwner(senderUid) && notBanned()\n        && isBotUser(botId)\n        && get(/databases/$(database)/documents/users/$(botId)).data.get('active', true) == true", "allow create: if isOwner(senderUid) && notBanned()\n        && get(/databases/$(database)/documents/users/$(botId)).data.get('active', true) == true"],
  ['normal users can hide posts', "affectedKeys().hasOnly(['hidden', 'commentsDisabled']))", "affectedKeys().hasOnly(['hidden', 'commentsDisabled', 'text']))"]
];

for (const [name, from, to] of MUTATIONS) {
  test(`mutation is caught: ${name}`, () => {
    assert.equal(RULES_TEXT.split(from).length - 1, 1, `mutation pattern must occur exactly once in firestore.rules: ${from.slice(0, 60)}`);
    assert.ok(failures(RULES_TEXT.replace(from, to)) > 0, 'the matrix did not notice this security bug');
  });
}
