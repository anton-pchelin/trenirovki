// Каждый файл приложения должен быть в списке кэша, иначе без интернета он не откроется
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

test('sw.js кэширует все скрипты и иконки', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const files = [
    ...readdirSync(new URL('../js', import.meta.url)).map(f => 'js/' + f),
    ...readdirSync(new URL('../icons', import.meta.url)).map(f => 'icons/' + f),
  ];
  for (const f of files) assert.ok(sw.includes(`'${f}'`), `нет в sw.js: ${f}`);
});
