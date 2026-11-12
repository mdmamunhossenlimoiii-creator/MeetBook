import { loadAst, RULES_TEXT } from '../../rules-matrix/engine.mjs';
export const ast = loadAst(RULES_TEXT);
export const store = new Map();
